package store

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// The gallery is the shares the owners list (listed_at) and the operator has not hidden (hidden_at). Reading it needs
// no account; it shows the snapshot of the pack and never the owner.

// GalleryPageSize is the number of packs a page of the gallery has.
const GalleryPageSize = 20

// MaxGalleryQuery is the longest search text (in runes) the callers accept.
const MaxGalleryQuery = 200

// GallerySort is the order of the gallery.
type GallerySort string

const (
	// GalleryNew puts the most recently listed first.
	GalleryNew GallerySort = "new"
	// GalleryPopular puts the most often added first.
	GalleryPopular GallerySort = "popular"
)

// GalleryQuery is a search of the gallery, already validated by the caller. Text is matched anywhere in the name, the
// description and the tags, ignoring case; Category must be the whole category; Page starts from 1.
type GalleryQuery struct {
	Text, Category string
	Sort           GallerySort
	Page           int
}

// GalleryPack is a listed pack as the gallery shows it. ID is the link's id.
type GalleryPack struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Category    string    `json:"category,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	Lists       int       `json:"lists"`
	Words       int       `json:"words"`
	Added       int       `json:"added"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// GalleryPage is one page of the gallery; More is whether a next page has packs.
type GalleryPage struct {
	Packs []GalleryPack
	More  bool
}

// GalleryCategory is a category of the listed packs and how many of them have it.
type GalleryCategory struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// likeEscaper escapes the characters LIKE treats as wildcards, for ESCAPE '\'.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// Gallery reads one page of the listed packs.
func (s *Store) Gallery(ctx context.Context, q GalleryQuery) (*GalleryPage, error) {
	order := "listed_at DESC, id"
	if q.Sort == GalleryPopular {
		order = "add_count DESC, listed_at DESC, id"
	}
	page := max(q.Page, 1)
	rows, err := s.pool.Query(ctx, `SELECT id::text, COALESCE(data #>> '{pack,name}', ''),
			COALESCE(data #>> '{pack,description}', ''), COALESCE(data #>> '{pack,category}', ''),
			(data #> '{pack,tags}')::text, COALESCE(jsonb_array_length(data -> 'lists'), 0),
			COALESCE((SELECT sum(jsonb_array_length(l -> 'words')) FROM jsonb_array_elements(data -> 'lists') AS l), 0),
			add_count, updated_at
		FROM typle_shared_packs
		WHERE listed_at IS NOT NULL AND hidden_at IS NULL
			AND ($2 = '' OR data #>> '{pack,category}' = $2)
			AND ($1 = '' OR data #>> '{pack,name}' ILIKE '%' || $1 || '%' ESCAPE '\'
				OR data #>> '{pack,description}' ILIKE '%' || $1 || '%' ESCAPE '\'
				OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data #> '{pack,tags}', '[]'::jsonb)) AS t
					WHERE t ILIKE '%' || $1 || '%' ESCAPE '\'))
		ORDER BY `+order+` LIMIT $3 OFFSET $4`,
		likeEscaper.Replace(q.Text), q.Category, GalleryPageSize+1, (page-1)*GalleryPageSize)
	if err != nil {
		return nil, err
	}
	packs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (GalleryPack, error) {
		var pack GalleryPack
		var tags *string
		if err := row.Scan(&pack.ID, &pack.Name, &pack.Description, &pack.Category, &tags, &pack.Lists, &pack.Words,
			&pack.Added, &pack.UpdatedAt); err != nil {
			return pack, err
		}
		if tags != nil {
			if err := json.Unmarshal([]byte(*tags), &pack.Tags); err != nil {
				return pack, err
			}
			if len(pack.Tags) == 0 {
				pack.Tags = nil
			}
		}
		return pack, nil
	})
	if err != nil {
		return nil, err
	}
	more := len(packs) > GalleryPageSize
	if more {
		packs = packs[:GalleryPageSize]
	}
	return &GalleryPage{Packs: append([]GalleryPack{}, packs...), More: more}, nil
}

// GalleryCategories counts the listed packs by category, the most first; categories with the same count are in the
// app's order for names. Packs without a category are not counted.
func (s *Store) GalleryCategories(ctx context.Context) ([]GalleryCategory, error) {
	rows, err := s.pool.Query(ctx, `SELECT data #>> '{pack,category}', count(*)::int FROM typle_shared_packs
		WHERE listed_at IS NOT NULL AND hidden_at IS NULL AND COALESCE(data #>> '{pack,category}', '') <> ''
		GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	categories, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (GalleryCategory, error) {
		var category GalleryCategory
		err := row.Scan(&category.Name, &category.Count)
		return category, err
	})
	if err != nil {
		return nil, err
	}
	slices.SortFunc(categories, func(a, b GalleryCategory) int {
		if a.Count != b.Count {
			return b.Count - a.Count
		}
		return workspace.CompareNames(a.Name, b.Name, false)
	})
	return categories, nil
}

// CountAdded counts one more addition of the listed pack id to someone's packs. A pack that is not listed, is hidden,
// does not exist or has an id that is not a UUID is left as it is, without an error.
func (s *Store) CountAdded(ctx context.Context, id string) error {
	if !isUUID(id) {
		return nil
	}
	_, err := s.pool.Exec(ctx, `UPDATE typle_shared_packs SET add_count = add_count + 1
		WHERE id = $1 AND listed_at IS NOT NULL AND hidden_at IS NULL`, id)
	return err
}

// ReportReasons are the reasons a gallery pack can be reported for.
var ReportReasons = []string{"inappropriate", "spam", "personalInfo", "other"}

// Report records a report of a listed, unhidden share. It returns false when there is no such share (or id is not a
// UUID); reason is checked by the caller.
func (s *Store) Report(ctx context.Context, id, reason string) (bool, error) {
	if !isUUID(id) {
		return false, nil
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO typle_gallery_reports (id, share_id, reason)
		SELECT $1, id, $3 FROM typle_shared_packs WHERE id = $2 AND listed_at IS NOT NULL AND hidden_at IS NULL`,
		workspace.NewID(), id, reason)
	// The share can be deleted between the statement's snapshot and the foreign key check; it is gone then.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// AdminGalleryPack is a listed or hidden pack as the administrator sees it, with its reports.
type AdminGalleryPack struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Category string         `json:"category,omitempty"`
	Added    int            `json:"added"`
	ListedAt *time.Time     `json:"listedAt"`
	HiddenAt *time.Time     `json:"hiddenAt"`
	Reports  int            `json:"reports"`
	Reasons  map[string]int `json:"reasons"`
}

// AdminGalleryRows is the number of packs AdminGallery returns at most.
const AdminGalleryRows = 100

// AdminGallery lists listed or hidden shares, the most reported first, then the most recent report, then listed_at
// (the newest first).
func (s *Store) AdminGallery(ctx context.Context) ([]AdminGalleryPack, error) {
	rows, err := s.pool.Query(ctx, `SELECT p.id::text, COALESCE(p.data #>> '{pack,name}', ''),
			COALESCE(p.data #>> '{pack,category}', ''), p.add_count, p.listed_at, p.hidden_at,
			COALESCE(r.reports, 0), COALESCE(r.reasons, '{}'::jsonb)::text
		FROM typle_shared_packs p
		LEFT JOIN (SELECT share_id, sum(n)::int AS reports, max(last) AS last, jsonb_object_agg(reason, n) AS reasons
			FROM (SELECT share_id, reason, count(*) AS n, max(created_at) AS last
				FROM typle_gallery_reports GROUP BY share_id, reason) AS by_reason
			GROUP BY share_id) AS r ON r.share_id = p.id
		WHERE p.listed_at IS NOT NULL OR p.hidden_at IS NOT NULL
		ORDER BY COALESCE(r.reports, 0) DESC, r.last DESC NULLS LAST, p.listed_at DESC NULLS LAST, p.id
		LIMIT $1`, AdminGalleryRows)
	if err != nil {
		return nil, err
	}
	packs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminGalleryPack, error) {
		var pack AdminGalleryPack
		var reasons string
		if err := row.Scan(&pack.ID, &pack.Name, &pack.Category, &pack.Added, &pack.ListedAt, &pack.HiddenAt,
			&pack.Reports, &reasons); err != nil {
			return pack, err
		}
		pack.Reasons = map[string]int{}
		return pack, json.Unmarshal([]byte(reasons), &pack.Reasons)
	})
	if err != nil {
		return nil, err
	}
	return append([]AdminGalleryPack{}, packs...), nil
}

// SetHidden sets or clears hidden_at, leaving listed_at as it is. Hiding a hidden share keeps its first time. It
// returns false when there is no share with the id.
func (s *Store) SetHidden(ctx context.Context, id string, hidden bool) (bool, error) {
	if !isUUID(id) {
		return false, nil
	}
	tag, err := s.pool.Exec(ctx, `UPDATE typle_shared_packs
		SET hidden_at = CASE WHEN $2::boolean THEN COALESCE(hidden_at, now()) END WHERE id = $1`, id, hidden)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
