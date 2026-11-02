package web

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// The gallery is the shares their owners list and the operator has not hidden. Anyone may read it, signed in or not,
// and an answer never names the owner. Like /api/shared it is not for search engines, and nothing keeps it.

// maxGalleryPage keeps the OFFSET of a made-up page number from making the database walk far, as maxUsersPage does.
const maxGalleryPage = 10000

// galleryPackJSON is one listed pack as /api/gallery answers it. description, category and tags are left out when the
// pack has none. updatedAt is written as shareJSON writes it.
type galleryPackJSON struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Category    string   `json:"category,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Lists       int      `json:"lists"`
	Words       int      `json:"words"`
	Added       int      `json:"added"`
	UpdatedAt   string   `json:"updatedAt"`
}

type galleryAnswer struct {
	Packs []galleryPackJSON `json:"packs"`
	More  bool              `json:"more"`
}

// noStore makes the answer carry Cache-Control: no-store, over the private, no-store that reply writes.
type noStore struct{ http.ResponseWriter }

func (w noStore) WriteHeader(status int) {
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}

// galleryHeaders marks every answer of the gallery, errors and 405s included, as not for search engines or caches.
func galleryHeaders(w http.ResponseWriter) http.ResponseWriter {
	w.Header().Set("X-Robots-Tag", "noindex")
	return noStore{w}
}

// galleryQuery reads ?q=&category=&sort=&page=. q is trimmed and cut to store.MaxGalleryQuery runes; sort is "new" (the
// default) or "popular"; page is a number from 1 to maxGalleryPage (the default is 1).
func galleryQuery(r *http.Request) (store.GalleryQuery, bool) {
	values := r.URL.Query()
	q := store.GalleryQuery{Text: strings.TrimSpace(values.Get("q")), Category: values.Get("category"), Sort: store.GalleryNew, Page: 1}
	if runes := []rune(q.Text); len(runes) > store.MaxGalleryQuery {
		q.Text = string(runes[:store.MaxGalleryQuery])
	}
	switch sort := store.GallerySort(values.Get("sort")); sort {
	case "":
	case store.GalleryNew, store.GalleryPopular:
		q.Sort = sort
	default:
		return q, false
	}
	if value := values.Get("page"); value != "" {
		page, err := strconv.Atoi(value)
		if err != nil || page < 1 || page > maxGalleryPage {
			return q, false
		}
		q.Page = page
	}
	return q, true
}

// gallery answers one page of the listed packs. HEAD is served as GET; net/http leaves the body out.
func (s *server) gallery(w http.ResponseWriter, r *http.Request) {
	w = galleryHeaders(w)
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	query, ok := galleryQuery(r)
	if !ok {
		refuse(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	page, err := s.config.Store.Gallery(r.Context(), query)
	if err != nil {
		s.report(r, err, "gallery.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	answer := galleryAnswer{Packs: make([]galleryPackJSON, 0, len(page.Packs)), More: page.More}
	for _, pack := range page.Packs {
		answer.Packs = append(answer.Packs, galleryPackJSON{
			ID: pack.ID, Name: pack.Name, Description: pack.Description, Category: pack.Category, Tags: pack.Tags,
			Lists: pack.Lists, Words: pack.Words, Added: pack.Added,
			UpdatedAt: pack.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		})
	}
	reply(w, http.StatusOK, answer)
}

// galleryCategories answers the categories of the listed packs, the most packs first.
func (s *server) galleryCategories(w http.ResponseWriter, r *http.Request) {
	w = galleryHeaders(w)
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	categories, err := s.config.Store.GalleryCategories(r.Context())
	if err != nil {
		s.report(r, err, "gallery.categories")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	if categories == nil {
		categories = []store.GalleryCategory{}
	}
	reply(w, http.StatusOK, map[string][]store.GalleryCategory{"categories": categories})
}

// galleryAdded counts one more "added to my packs" for the pack ?id=. Its Origin is checked as DELETE /api/shares's is.
// A pack that is not in the gallery is answered the same 204, so that the answer does not tell which shares are listed.
func (s *server) galleryAdded(w http.ResponseWriter, r *http.Request) {
	w = galleryHeaders(w)
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !(fromApp(r) || s.sameOrigin(r)) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	if err := s.config.Store.CountAdded(r.Context(), r.URL.Query().Get("id")); err != nil {
		s.report(r, err, "gallery.added")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
