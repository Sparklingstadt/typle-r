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
}

func shareOf(share store.Share) shareJSON {
	return shareJSON{share.ID, share.PackID, share.Name, share.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z07:00")}
}

// Shared serves /api/shared from the database alone, for a backend that has no login settings to build New with: a
// link is read by anyone, signed in or not. Its answers are the same as New's.
func Shared(s Store, report func(r *http.Request, err error, operation string)) http.Handler {
	return withSecurityHeaders(http.HandlerFunc((&server{config: Config{Store: s, Report: report}}).shared))
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
	shares, err := s.config.Store.ListShares(r.Context(), user.Sub)
	if err != nil {
		s.report(r, err, "shares.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	answer := make([]shareJSON, 0, len(shares))
	for _, share := range shares {
		answer = append(answer, shareOf(share))
	}
	reply(w, http.StatusOK, map[string][]shareJSON{"shares": answer})
}

// putShare shares a pack, or copies it again into its link. It is checked as PUT /api/workspace is: the Origin of a
// cookie's request, a JSON body, then the login. The body is {"packId"} and nothing else.
func (s *server) putShare(w http.ResponseWriter, r *http.Request) {
	if !(fromApp(r) || s.sameOrigin(r)) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	packID, ok := readPackID(r)
	if !ok {
		refuse(w, http.StatusBadRequest, "invalidWorkspace")
		return
	}
	share, err := s.config.Store.PutShare(r.Context(), user.Sub, packID)
	var refused *workspace.Error
	switch {
	case errors.As(err, &refused) && refused.Key == "packNotFound":
		refuse(w, http.StatusNotFound, refused.Key)
	case errors.As(err, &refused) && refused.Key == "invalidWorkspace":
		refuse(w, http.StatusBadRequest, refused.Key)
	case err != nil:
		s.report(r, err, "shares.write")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
	default:
		reply(w, http.StatusOK, shareOf(*share))
	}
}

// deleteShare stops sharing the pack ?pack=. A request without a body has no Content-Type to check; the Origin is
// checked as for PUT. A pack that is not shared is answered the same.
func (s *server) deleteShare(w http.ResponseWriter, r *http.Request) {
	if !(fromApp(r) || s.sameOrigin(r)) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	packID := r.URL.Query().Get("pack")
	if packID == "" {
		refuse(w, http.StatusBadRequest, "invalidWorkspace")
		return
	}
	if err := s.config.Store.DeleteShare(r.Context(), user.Sub, packID); err != nil {
		s.report(r, err, "shares.write")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusNoContent)
}

// readPackID reads a body that is {"packId": "<a pack id>"}, with no other member.
func readPackID(r *http.Request) (string, bool) {
	if r.Body == nil || r.Body == http.NoBody {
		return "", false
	}
	body, err := readLimited(r.Body, maxShareBodyBytes)
	if err != nil {
		return "", false
	}
	fields, err := parseObject(body)
	if err != nil || len(fields) != 1 {
		return "", false
	}
	raw, ok := fields["packId"]
	var packID string
	// null leaves packID empty, and is refused with it.
	if !ok || json.Unmarshal(raw, &packID) != nil || packID == "" {
		return "", false
	}
	return packID, true
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
	data, err := s.config.Store.SharedPack(r.Context(), r.URL.Query().Get("id"))
	if err != nil {
		s.report(r, err, "shared.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	if data == nil {
		refuse(w, http.StatusNotFound, "sharedPackNotFound")
		return
	}
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
