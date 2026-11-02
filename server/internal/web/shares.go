package web

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// A pack is shared by link: /api/shares is the owner's (list, share or copy again, stop sharing) and /api/shared is
// for anyone with the link (the pack as a file, without the owner). The page that shows a link builds its URL from the
// site's origin and the id, so no answer carries one.

// maxShareBodyBytes is the most a PUT /api/shares body needs: a pack id, and room to spare.
const maxShareBodyBytes = 4 << 10

// shareJSON is one link as /api/shares answers it. updatedAt is written as JavaScript's toISOString writes it.
type shareJSON struct {
	ID        string `json:"id"`
	PackID    string `json:"packId"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
	Listed    bool   `json:"listed"`
	Hidden    bool   `json:"hidden"`
}

func shareOf(share store.Share) shareJSON {
	return shareJSON{share.ID, share.PackID, share.Name, share.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z07:00"), share.Listed, share.Hidden}
}

// Public serves /api/shared and the gallery's reads (/api/gallery, /api/gallery/categories) from the database alone, for
// a backend that has no login settings to build New with: they are read by anyone, signed in or not. Their answers are
// the same as New's. POST /api/gallery/added checks the Origin against the app's address, so it is New's alone.
func Public(s Store, report func(r *http.Request, err error, operation string)) http.Handler {
	srv := &server{config: Config{Store: s, Report: report}}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/shared", srv.shared)
	mux.HandleFunc("/api/gallery", srv.gallery)
	mux.HandleFunc("/api/gallery/categories", srv.galleryCategories)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { refuse(w, http.StatusNotFound, "notFound") })
	return withSecurityHeaders(mux)
}

// HEAD is served as GET; net/http leaves the body out.
func (s *server) shares(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead, http.MethodPut, http.MethodDelete) {
		return
	}
	switch r.Method {
	case http.MethodPut:
		s.putShare(w, r)
	case http.MethodDelete:
		s.deleteShare(w, r)
	default:
		s.listShares(w, r)
	}
}

func (s *server) listShares(w http.ResponseWriter, r *http.Request) {
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	shares, f := s.accountShares(r, user.Sub)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	answer := make([]shareJSON, 0, len(shares))
	for _, share := range shares {
		answer = append(answer, shareOf(share))
	}
	reply(w, http.StatusOK, map[string][]shareJSON{"shares": answer})
}

// accountShares reads the owner's shared packs.
func (s *server) accountShares(r *http.Request, owner string) ([]store.Share, *failure) {
	shares, err := s.config.Store.ListShares(r.Context(), owner)
	if err != nil {
		return nil, broken(err, "shares.read", "databaseUnavailable")
	}
	return shares, nil
}

// putShare shares a pack, or copies it again into its link. It is checked as PUT /api/workspace is: the Origin of a
// cookie's request, a JSON body, then the login. The body is {"packId"} with, optionally, "listed" (a boolean).
func (s *server) putShare(w http.ResponseWriter, r *http.Request) {
	if !s.fromAppOrOrigin(r) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	packID, listed, ok := readShareBody(r)
	if !ok {
		refuse(w, http.StatusBadRequest, "invalidWorkspace")
		return
	}
	share, f := s.sharePack(r, user.Sub, packID, listed)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, shareOf(*share))
}

// sharePack shares the owner's pack packID, or copies it again into its link. listed lists it in the gallery or takes
// it out; nil leaves the listing as it is.
func (s *server) sharePack(r *http.Request, owner, packID string, listed *bool) (*store.Share, *failure) {
	if packID == "" {
		return nil, refused(http.StatusBadRequest, "invalidWorkspace")
	}
	share, err := s.config.Store.PutShare(r.Context(), owner, packID, listed)
	var refusal *workspace.Error
	switch {
	case errors.As(err, &refusal) && refusal.Key == "packNotFound":
		return nil, refused(http.StatusNotFound, refusal.Key)
	case errors.As(err, &refusal) && refusal.Key == "invalidWorkspace":
		return nil, refused(http.StatusBadRequest, refusal.Key)
	case errors.As(err, &refusal) && refusal.Key == "sharedPackHidden":
		return nil, refused(http.StatusConflict, refusal.Key)
	case err != nil:
		return nil, broken(err, "shares.write", "workspaceSaveFailed")
	}
	return share, nil
}

// deleteShare stops sharing the pack ?pack=. A request without a body has no Content-Type to check; the Origin is
// checked as for PUT. A pack that is not shared is answered the same.
func (s *server) deleteShare(w http.ResponseWriter, r *http.Request) {
	if !s.fromAppOrOrigin(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if f := s.stopSharing(r, user.Sub, r.URL.Query().Get("pack")); f != nil {
		s.fail(w, r, f)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusNoContent)
}

// stopSharing stops sharing the owner's pack packID; a pack that is not shared is answered the same.
func (s *server) stopSharing(r *http.Request, owner, packID string) *failure {
	if packID == "" {
		return refused(http.StatusBadRequest, "invalidWorkspace")
	}
	if err := s.config.Store.DeleteShare(r.Context(), owner, packID); err != nil {
		return broken(err, "shares.write", "workspaceSaveFailed")
	}
	return nil
}

// readShareBody reads a body that is {"packId": "<a pack id>"} with, optionally, "listed": true or false, and no other
// member. Without "listed" it is nil: the listing in the gallery is left as it is. "listed": null is refused.
func readShareBody(r *http.Request) (packID string, listed *bool, ok bool) {
	if r.Body == nil || r.Body == http.NoBody {
		return "", nil, false
	}
	body, err := readLimited(r.Body, maxShareBodyBytes)
	if err != nil {
		return "", nil, false
	}
	fields, err := parseObject(body)
	if err != nil {
		return "", nil, false
	}
	for name := range fields {
		if name != "packId" && name != "listed" {
			return "", nil, false
		}
	}
	raw, ok := fields["packId"]
	// null leaves packID empty, and is refused with it.
	if !ok || json.Unmarshal(raw, &packID) != nil || packID == "" {
		return "", nil, false
	}
	if raw, present := fields["listed"]; present {
		var value bool
		// null would unmarshal into value without an error, so it is refused by its text.
		if string(raw) == "null" || json.Unmarshal(raw, &value) != nil {
			return "", nil, false
		}
		listed = &value
	}
	return packID, listed, true
}

// shared answers the pack a link shares, as the file it was copied into: anyone with the link may read it, so it is
// the same for every reader and needs no cookie, but it is not kept, so that a link that is stopped is gone at once.
// HEAD is served as GET; net/http leaves the body out.
func (s *server) shared(w http.ResponseWriter, r *http.Request) {
	// A shared pack is for people with the link, not for search engines; every answer says so, errors included.
	w.Header().Set("X-Robots-Tag", "noindex")
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	data, f := s.sharedFile(r, r.URL.Query().Get("id"))
	if f == nil && data == nil {
		f = refused(http.StatusNotFound, "sharedPackNotFound")
	}
	if f != nil {
		s.fail(w, r, f)
		return
	}
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// sharedFile reads the file of the pack the link id shares, or nil when there is no such link.
func (s *server) sharedFile(r *http.Request, id string) (json.RawMessage, *failure) {
	data, err := s.config.Store.SharedPack(r.Context(), id)
	if err != nil {
		return nil, broken(err, "shared.read", "databaseUnavailable")
	}
	return data, nil
}
