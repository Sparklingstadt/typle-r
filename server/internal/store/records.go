package store

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// Practice records are kept in typle_records, one row each, rather than in their lists (docs/superpowers/specs/
// 2026-10-29-record-table.md). A workspace whose records_split is false still has them in its lists, as saved before
// the table existed: the first write that saves its lists moves them. Reads put the records back in their lists, so
// everything above the store sees lists with their records, as before.

// recordRow is a record as typle_records keeps it: data is the record as its list held it, with its id, and position
// its place in the list's records.
type recordRow struct {
	listID, recordID string
	position         int
	at               time.Time
	data             []byte
}

type recordKey struct{ listID, recordID string }

// legacyID is the id given to a record saved without one, or with the id of an earlier record of its list: the same
// record gets the same id however often its list is saved or moved.
func legacyID(listID string, position int, record workspace.Record) string {
	sum := sha256.Sum256([]byte(listID + "\x00" + strconv.Itoa(position) + "\x00" + record.Date + "\x00" +
		strconv.FormatFloat(record.Time, 'g', -1, 64)))
	return "legacy-" + hex.EncodeToString(sum[:])[:20]
}

// recordRows gives every record of the lists an id that keeps it apart from the rest of its list (see legacyID), in
// place, and returns them as rows.
func recordRows(lists []workspace.List) ([]recordRow, error) {
	var rows []recordRow
	for i := range lists {
		list := &lists[i]
		seen := map[string]bool{}
		for position := range list.Records {
			record := &list.Records[position]
			if record.ID == nil || *record.ID == "" || seen[*record.ID] {
				id := legacyID(list.ID, position, *record)
				record.ID = &id
			}
			seen[*record.ID] = true
			data, err := json.Marshal(*record)
			if err != nil {
				return nil, err
			}
			rows = append(rows, recordRow{list.ID, *record.ID, position, record.At, data})
		}
	}
	return rows, nil
}

// withoutRecords copies the lists with no records, as the lists column keeps them once the records moved.
func withoutRecords(lists []workspace.List) []workspace.List {
	stripped := make([]workspace.List, len(lists))
	for i, list := range lists {
		list.Records = nil
		stripped[i] = list
	}
	return stripped
}

// storedRecords are a workspace's rows of typle_records, by list, in order.
type storedRecords map[string][]json.RawMessage

// readRecords reads the owner's rows of typle_records.
func readRecords(ctx context.Context, q querier, owner string) (storedRecords, []recordRow, error) {
	rows, err := q.Query(ctx, `SELECT list_id, record_id, position, at, data::text FROM typle_records WHERE owner_id = $1
		ORDER BY list_id, position`, owner)
	if err != nil {
		return nil, nil, err
	}
	records := storedRecords{}
	var stored []recordRow
	for rows.Next() {
		var row recordRow
		if err := rows.Scan(&row.listID, &row.recordID, &row.position, &row.at, &row.data); err != nil {
			return nil, nil, err
		}
		records[row.listID] = append(records[row.listID], row.data)
		stored = append(stored, row)
	}
	return records, stored, rows.Err()
}

// recordsColumn reads the rows of typle_records of a workspace whose records moved, as one JSON array of
// [listId, record] in order, in the same statement (and so the same snapshot) as the row; NULL when they have not.
const recordsColumn = `CASE WHEN records_split THEN (SELECT COALESCE(jsonb_agg(jsonb_build_array(r.list_id, r.data)
	ORDER BY r.list_id, r.position), '[]'::jsonb) FROM typle_records r WHERE r.owner_id = typle_workspaces.owner_id)::text END`

// decodeColumn reads recordsColumn.
func decodeColumn(column []byte) (storedRecords, error) {
	var pairs [][2]json.RawMessage
	if err := json.Unmarshal(column, &pairs); err != nil {
		return nil, err
	}
	records := storedRecords{}
	for _, pair := range pairs {
		var listID string
		if err := json.Unmarshal(pair[0], &listID); err != nil {
			return nil, err
		}
		records[listID] = append(records[listID], pair[1])
	}
	return records, nil
}

// withRecords puts the stored records back in the lists that hold them. A list may still hold records of its own: an
// app from before the table can have saved them while a deployment switched over. They come first, as they were saved
// before the list's next write moves them, and a record of the same id is the table's. Rows of a list that is no longer
// saved are left out; the next write deletes them.
func withRecords(lists []byte, records storedRecords) ([]byte, error) {
	var objects []map[string]json.RawMessage
	if err := json.Unmarshal(lists, &objects); err != nil {
		return nil, fmt.Errorf("lists are not valid: %w", err)
	}
	for _, object := range objects {
		var id string
		_ = json.Unmarshal(object["id"], &id)
		moved := records[id]
		if len(moved) == 0 {
			continue
		}
		var own []json.RawMessage
		if raw, ok := object["records"]; ok && !bytes.Equal(raw, []byte("null")) {
			if err := json.Unmarshal(raw, &own); err != nil {
				return nil, fmt.Errorf("records of list %s are not valid: %w", id, err)
			}
		}
		ids := map[string]bool{}
		for _, record := range moved {
			ids[recordID(record)] = true
		}
		all := make([]json.RawMessage, 0, len(own)+len(moved))
		for _, record := range own {
			if id := recordID(record); id == "" || !ids[id] {
				all = append(all, record)
			}
		}
		encoded, err := json.Marshal(append(all, moved...))
		if err != nil {
			return nil, err
		}
		object["records"] = encoded
	}
	return json.Marshal(objects)
}

func recordID(record json.RawMessage) string {
	var fields struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(record, &fields)
	return fields.ID
}

// syncRecords makes the owner's rows of typle_records the rows given. With the rows as they were read (before), only
// the rows that changed are written and only those no longer there are deleted. Without (nil), every row given is
// written and every other row of the owner deleted, and a row the same as the saved one is left as it is. Either way the
// number of rows is then checked against the rows given, so that records are never lost or doubled unnoticed: the
// transaction, and the save with it, fails instead.
func syncRecords(ctx context.Context, tx pgx.Tx, owner string, before map[recordKey]recordRow, rows []recordRow) error {
	after := make(map[recordKey]bool, len(rows))
	var write []recordRow
	for _, row := range rows {
		key := recordKey{row.listID, row.recordID}
		after[key] = true
		if saved, ok := before[key]; before == nil || !ok || saved.position != row.position || !bytes.Equal(saved.data, row.data) {
			write = append(write, row)
		}
	}
	if err := deleteGone(ctx, tx, owner, before, after, rows); err != nil {
		return err
	}
	if err := writeRows(ctx, tx, owner, write); err != nil {
		return err
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM typle_records WHERE owner_id = $1`, owner).Scan(&count); err != nil {
		return err
	}
	if count != len(rows) {
		return fmt.Errorf("records of %s: %d rows saved for %d records", owner, count, len(rows))
	}
	return nil
}

// deleteGone deletes the owner's rows that are not among rows: of those read (before, with after the keys of rows), or
// without before every other row of the owner.
func deleteGone(ctx context.Context, tx pgx.Tx, owner string, before map[recordKey]recordRow, after map[recordKey]bool, rows []recordRow) error {
	if before == nil {
		lists, ids := keyColumns(rows)
		_, err := tx.Exec(ctx, `DELETE FROM typle_records r WHERE r.owner_id = $1 AND NOT EXISTS (SELECT 1 FROM
			unnest($2::text[], $3::text[]) AS k(list_id, record_id) WHERE k.list_id = r.list_id AND k.record_id = r.record_id)`,
			owner, lists, ids)
		return err
	}
	var gone []recordRow
	for key, row := range before {
		if !after[key] {
			gone = append(gone, row)
		}
	}
	if len(gone) == 0 {
		return nil
	}
	lists, ids := keyColumns(gone)
	_, err := tx.Exec(ctx, `DELETE FROM typle_records r USING unnest($2::text[], $3::text[]) AS k(list_id, record_id)
		WHERE r.owner_id = $1 AND r.list_id = k.list_id AND r.record_id = k.record_id`, owner, lists, ids)
	return err
}

// writeRows inserts the rows, or updates the saved row of the same record when it differs.
func writeRows(ctx context.Context, tx pgx.Tx, owner string, write []recordRow) error {
	if len(write) == 0 {
		return nil
	}
	lists, ids := keyColumns(write)
	positions, ats, data := make([]int32, len(write)), make([]time.Time, len(write)), make([]string, len(write))
	for i, row := range write {
		positions[i], ats[i], data[i] = int32(row.position), row.at, string(row.data)
	}
	_, err := tx.Exec(ctx, `INSERT INTO typle_records (owner_id, list_id, record_id, position, at, data)
		SELECT $1, k.list_id, k.record_id, k.position, k.at, k.data
		FROM unnest($2::text[], $3::text[], $4::int[], $5::timestamptz[], $6::jsonb[]) AS k(list_id, record_id, position, at, data)
		ON CONFLICT (owner_id, list_id, record_id) DO UPDATE SET position = EXCLUDED.position, at = EXCLUDED.at, data = EXCLUDED.data
		WHERE (typle_records.position, typle_records.at, typle_records.data) IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.at, EXCLUDED.data)`,
		owner, lists, ids, positions, ats, data)
	return err
}

func keyColumns(rows []recordRow) (lists, ids []string) {
	lists, ids = make([]string, len(rows)), make([]string, len(rows))
	for i, row := range rows {
		lists[i], ids[i] = row.listID, row.recordID
	}
	return lists, ids
}

// beforeRows are the rows read (readRecords) as recordRows writes them, to tell which a change left as they were. A row
// is decoded and encoded again, so that it compares with the record Go encodes rather than with the database's text.
func beforeRows(stored []recordRow) (map[recordKey]recordRow, error) {
	before := make(map[recordKey]recordRow, len(stored))
	for _, row := range stored {
		record, err := workspace.DecodeRecord(row.data)
		if err != nil {
			return nil, fmt.Errorf("record %s of list %s: %w", row.recordID, row.listID, err)
		}
		if row.data, err = json.Marshal(record); err != nil {
			return nil, err
		}
		before[recordKey{row.listID, row.recordID}] = row
	}
	return before, nil
}

// Records returns a page of one list's records, newest first (and in their saved order on the same date), read from
// typle_records alone: those after since, at most limit. ok is false when the table cannot answer for the list by
// itself: the workspace's records have not moved, the list is not saved as the workspace shows it (it follows an
// official pack, which the catalog may change), or it still holds records of its own. The caller then reads the whole
// workspace instead.
func (s *Store) Records(ctx context.Context, owner, listID string, since *time.Time, limit int) (records []workspace.Record, ok bool, err error) {
	rows, err := s.pool.Query(ctx, `WITH w AS (SELECT records_split AND jsonb_path_exists(lists,
			'$[*] ? (@.id == $id && !exists(@.origin) && @.records.size() == 0)', jsonb_build_object('id', $2::text)) AS ok
			FROM typle_workspaces WHERE owner_id = $1)
		SELECT w.ok, r.data::text FROM w LEFT JOIN LATERAL (SELECT data FROM typle_records WHERE owner_id = $1 AND list_id = $2
			AND ($3::timestamptz IS NULL OR at > $3) ORDER BY at DESC, position LIMIT $4) r ON w.ok`, owner, listID, since, limit)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records = []workspace.Record{}
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&ok, &data); err != nil {
			return nil, false, err
		}
		if data == nil {
			continue
		}
		record, err := workspace.DecodeRecord(data)
		if err != nil {
			return nil, false, fmt.Errorf("record of list %s of %s: %w", listID, owner, err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	return records, true, nil
}

// forgetRecords deletes the owner's rows of typle_records when its workspace row is created. Rows can only be left from
// a workspace row deleted without them (as the tests do), and must not show in lists of the same ids.
func forgetRecords(ctx context.Context, tx pgx.Tx, owner string) error {
	_, err := tx.Exec(ctx, `DELETE FROM typle_records WHERE owner_id = $1`, owner)
	return err
}

// querier is a pool or a transaction.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}
