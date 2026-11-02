package store

import (
	"bytes"
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// saved creates the owner's row with the lists a, b and c, each in a pack of its own, and returns the workspace as saved.
func saved(t *testing.T, s *Store, owner string) *workspace.Workspace {
	t.Helper()
	ctx := context.Background()
	for _, name := range []string{"a", "b", "c"} {
		if _, err := s.Modify(ctx, owner, createList(name)); err != nil {
			t.Fatal(err)
		}
	}
	w, err := s.Read(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Packs) < 2 {
		t.Fatalf("packs = %+v", w.Packs)
	}
	return w
}

func isKey(err error, key string) bool {
	var e *workspace.Error
	return errors.As(err, &e) && e.Key == key
}

func shareCount(t *testing.T, s *Store, owner string) []string {
	t.Helper()
	shares, err := s.ListShares(context.Background(), owner)
	if err != nil {
		t.Fatal(err)
	}
	packs := []string{}
	for _, share := range shares {
		packs = append(packs, share.PackID)
	}
	return packs
}

func TestPutShare(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	pack := w.Packs[0].ID

	share, err := s.PutShare(ctx, id, pack, nil)
	if err != nil {
		t.Fatal(err)
	}
	if share.PackID != pack || len(share.ID) != 36 || share.UpdatedAt.IsZero() {
		t.Fatalf("share = %+v", share)
	}
	want, err := workspace.EncodePackFile(w, pack)
	if err != nil {
		t.Fatal(err)
	}
	data, err := s.SharedPack(ctx, share.ID)
	if err != nil || !bytes.Equal(data, want) {
		t.Fatalf("SharedPack = %s, %v; want %s", data, err, want)
	}

	// Sharing again keeps the link and copies the pack as it is now.
	time.Sleep(10 * time.Millisecond)
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		name := "改名したパック"
		_, err := workspace.UpdatePack(w, pack, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	again, err := s.PutShare(ctx, id, pack, nil)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != share.ID || !again.UpdatedAt.After(share.UpdatedAt) {
		t.Fatalf("again = %+v, first = %+v", again, share)
	}
	data, err = s.SharedPack(ctx, share.ID)
	if err != nil || !strings.Contains(string(data), `"name": "改名したパック"`) {
		t.Fatalf("SharedPack = %s, %v", data, err)
	}

	if _, err := s.PutShare(ctx, id, "no-such-pack", nil); !isKey(err, "packNotFound") {
		t.Fatalf("missing pack: %v", err)
	}
}

// An account that has saved nothing has no packs (it starts empty since v0.98.0), so it has none to share, and sharing
// saves nothing.
func TestPutShareWithoutRow(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.PutShare(ctx, id, "no-such-pack", nil); !isKey(err, "packNotFound") {
		t.Fatalf("missing pack: %v", err)
	}
	if saved, err := s.ReadRevision(ctx, id); saved != nil || err != nil {
		t.Fatalf("ReadRevision = %+v, %v; want no row", saved, err)
	}
	if got := shareCount(t, s, id); len(got) != 0 {
		t.Fatalf("shares = %v", got)
	}
}

// Modify on an account that has saved nothing starts from the empty initial workspace; deleting a shared pack later
// deletes its link.
func TestModifyWithoutRowDeletesShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	for _, name := range []string{"a", "b"} {
		if _, err := s.Modify(ctx, id, createList(name)); err != nil {
			t.Fatal(err)
		}
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Packs) != 2 || len(w.Lists) != 2 || w.Lists[0].Name != "a" || w.Lists[1].Name != "b" {
		t.Fatalf("workspace = %+v", w)
	}
	first, second := w.Packs[0].ID, w.Packs[1].ID
	for _, pack := range []string{first, second} {
		if _, err := s.PutShare(ctx, id, pack, nil); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeletePack(w, first) }); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); !slices.Equal(got, []string{second}) {
		t.Fatalf("shares = %v", got)
	}
}

func TestSharedPackMissing(t *testing.T) {
	connection, _ := database(t)
	s := open(t, connection, false)
	for _, id := range []string{"00000000-0000-4000-8000-000000000000", "not-a-uuid", ""} {
		if data, err := s.SharedPack(context.Background(), id); data != nil || err != nil {
			t.Errorf("SharedPack(%q) = %s, %v; want nil, nil", id, data, err)
		}
	}
}

func TestDeleteAndListShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id, other := owner(t, conn), owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	// The other account has the same packs, so the same pack ids.
	if _, err := s.WriteRevision(ctx, other, 0, Change{Lists: w.Lists, Packs: w.Packs, HasLists: true, HasPacks: true}); err != nil {
		t.Fatal(err)
	}
	first, second := w.Packs[0].ID, w.Packs[1].ID
	for _, share := range []struct{ owner, pack string }{{id, first}, {id, second}, {other, first}} {
		if _, err := s.PutShare(ctx, share.owner, share.pack, nil); err != nil {
			t.Fatal(err)
		}
	}
	// The newest share comes first.
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{second, first}) {
		t.Fatalf("shares = %v", packs)
	}
	if err := s.DeleteShare(ctx, id, first); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteShare(ctx, id, first); err != nil {
		t.Fatalf("deleting again: %v", err)
	}
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{second}) {
		t.Fatalf("shares = %v", packs)
	}
	if packs := shareCount(t, s, other); !slices.Equal(packs, []string{first}) {
		t.Fatalf("other's shares = %v", packs)
	}
}

func TestSavesDeleteSharesOfRemovedPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	first, second, third := w.Packs[0].ID, w.Packs[1].ID, w.Packs[len(w.Packs)-1].ID
	for _, pack := range []string{first, second, third} {
		if _, err := s.PutShare(ctx, id, pack, nil); err != nil {
			t.Fatal(err)
		}
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}

	// Lists saved without packs leave the shares alone.
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Lists: w.Lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); len(packs) != 3 {
		t.Fatalf("shares after lists = %v", packs)
	}

	// Saving packs without one deletes its share.
	without := slices.DeleteFunc(slices.Clone(w.Packs), func(p workspace.Pack) bool { return p.ID == first })
	lists := slices.DeleteFunc(slices.Clone(w.Lists), func(l workspace.List) bool { return l.PackID == first })
	if _, err := s.WriteRevision(ctx, id, current.Revision+1, Change{Lists: lists, Packs: without, HasLists: true, HasPacks: true}); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); slices.Contains(packs, first) || len(packs) != 2 {
		t.Fatalf("shares after packs = %v", packs)
	}

	// So does deleting a pack through Modify.
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeletePack(w, second) }); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{third}) {
		t.Fatalf("shares after Modify = %v", packs)
	}
}

// An account whose packs are still derived from its lists (packs NULL) saves lists only: the link of a derived pack
// whose lists are gone is deleted, though no packs are sent.
func TestWriteRevisionListsOnlyDeletesSharesOfDerivedPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	// Lists as an app that does not know packs saves them: each becomes a pack of its own when read.
	old, err := workspace.DecodeLists([]byte(`[{"id":"a","name":"A","createdAt":"2026-10-01T00:00:00.000Z","words":[{"display":"a","input":"a","annotation":""}],"records":[]},
	  {"id":"b","name":"B","createdAt":"2026-10-01T00:00:00.000Z","words":[{"display":"b","input":"b","annotation":""}],"records":[]}]`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: old, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	pack := w.Packs[0].ID
	if want := "pack-" + w.Lists[0].ID; pack != want {
		t.Fatalf("first pack = %s; want %s", pack, want)
	}
	if _, err := s.PutShare(ctx, id, pack, nil); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	lists := slices.DeleteFunc(slices.Clone(w.Lists), func(l workspace.List) bool { return l.PackID == pack })
	if len(lists) == len(w.Lists) || len(lists) == 0 {
		t.Fatalf("lists = %d of %d", len(lists), len(w.Lists))
	}
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Lists: lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); len(got) != 0 {
		t.Fatalf("shares after lists = %v", got)
	}
}

// A save of devices alone leaves the links as they are.
func TestWriteRevisionDevicesOnlyKeepsShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	if _, err := s.PutShare(ctx, id, w.Packs[0].ID, nil); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Devices: w.Devices, HasDevices: true}); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); len(got) != 1 {
		t.Fatalf("shares after devices = %v", got)
	}
}

// ListShares and PutShare both read the name from the snapshot.
func TestListSharesNames(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	put, err := s.PutShare(ctx, id, w.Packs[0].ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	shares, err := s.ListShares(ctx, id)
	if err != nil || len(shares) != 1 {
		t.Fatalf("ListShares = %+v, %v", shares, err)
	}
	if shares[0].Name == "" || shares[0].Name != w.Packs[0].Name || put.Name != shares[0].Name {
		t.Fatalf("names = %q (list), %q (put); want %q", shares[0].Name, put.Name, w.Packs[0].Name)
	}
}

func TestPutShareTooLarge(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	// A list whose pack file is past 1 MiB, saved as data merged from removed profiles may be.
	lists := newLists(1)
	lists[0].Words = nil
	for range workspace.MaxWords {
		lists[0].Words = append(lists[0].Words, workspace.Word{Display: strings.Repeat("あ", 400), Input: "a"})
	}
	encoded, err := workspace.Encode(lists)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists) VALUES ($1, $2)`, id, string(encoded)); err != nil {
		t.Fatal(err)
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutShare(ctx, id, w.Packs[0].ID, nil); !isKey(err, "invalidWorkspace") {
		t.Fatalf("PutShare = %v; want invalidWorkspace", err)
	}
	if packs := shareCount(t, s, id); len(packs) != 0 {
		t.Fatalf("shares = %v", packs)
	}
}

func listedAt(t *testing.T, conn *pgx.Conn, id string) *time.Time {
	t.Helper()
	var at *time.Time
	if err := conn.QueryRow(context.Background(), `SELECT listed_at FROM typle_shared_packs WHERE id = $1`, id).Scan(&at); err != nil {
		t.Fatal(err)
	}
	return at
}

func listedOf(t *testing.T, s *Store, owner string) Share {
	t.Helper()
	shares, err := s.ListShares(context.Background(), owner)
	if err != nil || len(shares) != 1 {
		t.Fatalf("ListShares = %+v, %v", shares, err)
	}
	return shares[0]
}

func TestPutShareListing(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	pack := w.Packs[0].ID
	yes, no := true, false

	share, err := s.PutShare(ctx, id, pack, nil)
	if err != nil || share.Listed || share.Hidden || listedAt(t, conn, share.ID) != nil {
		t.Fatalf("nil: %+v, %v", share, err)
	}
	share, err = s.PutShare(ctx, id, pack, &yes)
	if err != nil || !share.Listed {
		t.Fatalf("true: %+v, %v", share, err)
	}
	first := listedAt(t, conn, share.ID)
	if first == nil || !listedOf(t, s, id).Listed {
		t.Fatalf("listed_at = %v", first)
	}
	time.Sleep(10 * time.Millisecond)
	if share, err = s.PutShare(ctx, id, pack, &yes); err != nil || !share.Listed {
		t.Fatalf("true again: %+v, %v", share, err)
	}
	if again := listedAt(t, conn, share.ID); again == nil || !again.Equal(*first) {
		t.Fatalf("listed_at = %v; want %v", again, first)
	}
	share, err = s.PutShare(ctx, id, pack, &no)
	if err != nil || share.Listed || listedAt(t, conn, share.ID) != nil || listedOf(t, s, id).Listed {
		t.Fatalf("false: %+v, %v", share, err)
	}

	// A first share can list at once.
	other := w.Packs[1].ID
	if share, err = s.PutShare(ctx, id, other, &yes); err != nil || !share.Listed {
		t.Fatalf("new listed: %+v, %v", share, err)
	}
}

func TestPutShareKeepsListing(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	pack := saved(t, s, id).Packs[0].ID
	yes := true

	share, err := s.PutShare(ctx, id, pack, &yes)
	if err != nil {
		t.Fatal(err)
	}
	first := listedAt(t, conn, share.ID)
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		name := "改名"
		_, err := workspace.UpdatePack(w, pack, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	share, err = s.PutShare(ctx, id, pack, nil)
	if err != nil || !share.Listed || share.Name != "改名" {
		t.Fatalf("share = %+v, %v", share, err)
	}
	if at := listedAt(t, conn, share.ID); at == nil || !at.Equal(*first) {
		t.Fatalf("listed_at = %v; want %v", at, first)
	}
}

func TestPutShareHidden(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	pack := saved(t, s, id).Packs[0].ID
	yes, no := true, false

	share, err := s.PutShare(ctx, id, pack, &yes)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `UPDATE typle_shared_packs SET hidden_at = now() WHERE id = $1`, share.ID); err != nil {
		t.Fatal(err)
	}
	var updated time.Time
	if err := conn.QueryRow(ctx, `SELECT updated_at FROM typle_shared_packs WHERE id = $1`, share.ID).Scan(&updated); err != nil {
		t.Fatal(err)
	}
	first := listedAt(t, conn, share.ID)

	name := "改名"
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.UpdatePack(w, pack, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	for _, listed := range []*bool{&yes, &no} {
		if _, err := s.PutShare(ctx, id, pack, listed); !isKey(err, "sharedPackHidden") {
			t.Fatalf("PutShare(%v) = %v; want sharedPackHidden", *listed, err)
		}
	}
	var after time.Time
	if err := conn.QueryRow(ctx, `SELECT updated_at FROM typle_shared_packs WHERE id = $1`, share.ID).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if !after.Equal(updated) {
		t.Fatalf("updated_at changed: %v -> %v", updated, after)
	}
	if at := listedAt(t, conn, share.ID); at == nil || !at.Equal(*first) {
		t.Fatalf("listed_at = %v; want %v", at, first)
	}

	again, err := s.PutShare(ctx, id, pack, nil)
	if err != nil || again.ID != share.ID || !again.Hidden || again.Name != name {
		t.Fatalf("nil: %+v, %v", again, err)
	}
	if got := listedOf(t, s, id); !got.Hidden || !got.Listed {
		t.Fatalf("ListShares = %+v", got)
	}
}

func TestSharedPackHidden(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	share, err := s.PutShare(ctx, id, saved(t, s, id).Packs[0].ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if data, err := s.SharedPack(ctx, share.ID); err != nil || data == nil {
		t.Fatalf("before: %s, %v", data, err)
	}
	if _, err := conn.Exec(ctx, `UPDATE typle_shared_packs SET hidden_at = now() WHERE id = $1`, share.ID); err != nil {
		t.Fatal(err)
	}
	if data, err := s.SharedPack(ctx, share.ID); data != nil || err != nil {
		t.Fatalf("hidden: %s, %v; want nil, nil", data, err)
	}
}
