package store

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
