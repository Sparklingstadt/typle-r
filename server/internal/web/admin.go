package web

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// The administrator's dashboard (/admin) has a login of its own. It goes through FFPF ID only
// (/api/auth/signin?admin=1, then /api/auth/callback/ffpf), and ends with the administrator's cookie instead of the
// session cookie, for an account that typle_admins lets in: one registered there by its email, which binds the
// account's sub at its first sign-in. Each /api/admin request checks the account against typle_admins again, so an
// administrator whose row is removed is let in no longer.
const (
	adminPage = "/admin"
	// adminRefused is where a login of an account that is not an administrator ends: the page says so.
	adminRefused = adminPage + "?error=adminForbidden"
	// adminUnavailable is where a login to the dashboard ends when typle_admins could not be asked.
	adminUnavailable = adminPage + "?error=adminUnavailable"
)

// adminCookie is SameSite=Strict: the dashboard is only reached from the app's own pages, and its cookie is never sent
// with a request another site starts.
func (s *server) adminCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name: session.AdminCookieName(s.secure()), Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: s.secure(),
	}
}

// finishAdmin ends a login to the dashboard through FFPF ID: the administrator's cookie if typle_admins lets the
// account in, and adminRefused otherwise, or adminUnavailable when the database does not answer. It never sets the
// session cookie, so a login to the dashboard does not sign in to the app.
func (s *server) finishAdmin(w http.ResponseWriter, r *http.Request, user auth.FFPFUser) {
	email := strings.ToLower(user.Email)
	allowed, err := s.isAdmin(r.Context(), email, user.Sub)
	if err != nil {
		s.report(r, err, "admin.check")
		goTo(w, adminUnavailable)
		return
	}
	if !allowed {
		goTo(w, adminRefused)
		return
	}
	value := s.config.Keys.SealAdmin(session.NewAdmin(email, user.Sub, s.now()))
	http.SetCookie(w, s.relogin(-1))
	http.SetCookie(w, s.adminCookie(value, int(session.AdminMaxAge.Seconds())))
	goTo(w, adminPage)
}

// errNoAdmins is a server set up without a database to ask about administrators.
var errNoAdmins = errors.New("no database to check the administrator against")

// isAdmin asks typle_admins, through Config.Admins or else Config.Store, whether the FFPF ID account is an
// administrator.
func (s *server) isAdmin(ctx context.Context, email, sub string) (bool, error) {
	if s.config.Admins != nil {
		return s.config.Admins.Admin(ctx, email, sub)
	}
	if s.config.Store != nil {
		return s.config.Store.Admin(ctx, email, sub)
	}
	return false, errNoAdmins
}

// signedInAdmin is the administrator's session of the request's cookie, before it is checked against typle_admins.
func (s *server) signedInAdmin(r *http.Request) (session.Admin, bool) {
	cookie, err := r.Cookie(session.AdminCookieName(s.secure()))
	if err != nil {
		return session.Admin{}, false
	}
	return s.config.Keys.OpenAdmin(cookie.Value, s.now())
}

// adminAnswer is who is signed in to the dashboard, and what it shows.
type adminAnswer struct {
	Admin    adminUser            `json:"admin"`
	Overview *store.AdminOverview `json:"overview"`
}

// adminUser is the FFPF ID account signed in to the dashboard.
type adminUser struct {
	Email string `json:"email"`
	Sub   string `json:"sub"`
}

// allowAdmin lets the administrator through: adminRequired without their cookie, and adminForbidden, with the cookie
// removed, when typle_admins no longer lets the account in. The caller answers only when it returns true.
func (s *server) allowAdmin(w http.ResponseWriter, r *http.Request) (session.Admin, bool) {
	admin, f := s.administrator(w, r)
	if f != nil {
		s.fail(w, r, f)
		return session.Admin{}, false
	}
	return admin, true
}

// administrator is allowAdmin without the answer: it only removes the cookie of an account let in no longer, and
// returns the failure.
func (s *server) administrator(w http.ResponseWriter, r *http.Request) (session.Admin, *failure) {
	admin, ok := s.signedInAdmin(r)
	if !ok {
		return session.Admin{}, refused(http.StatusUnauthorized, "adminRequired")
	}
	allowed, err := s.config.Store.Admin(r.Context(), admin.Email, admin.Sub)
	if err != nil {
		return session.Admin{}, broken(err, "admin.check", "databaseUnavailable")
	}
	if !allowed {
		http.SetCookie(w, s.adminCookie("", -1))
		return session.Admin{}, refused(http.StatusForbidden, "adminForbidden")
	}
	return admin, nil
}

// adminDashboard answers the dashboard's figures to the administrator.
func (s *server) adminDashboard(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	admin, ok := s.allowAdmin(w, r)
	if !ok {
		return
	}
	overview, f := s.overview(r)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, adminAnswer{Admin: adminUser{Email: admin.Email, Sub: admin.Sub}, Overview: overview})
}

// overview reads the dashboard's figures.
func (s *server) overview(r *http.Request) (*store.AdminOverview, *failure) {
	overview, err := s.config.Store.Overview(r.Context())
	if err != nil {
		return nil, broken(err, "admin.overview", "databaseUnavailable")
	}
	return overview, nil
}

// maxUsersPage keeps the OFFSET of a made-up page number from making the database walk far.
const maxUsersPage = 10000

// adminUsers answers one page of the user list (?page=, from 0) to the administrator. A page that is not a number from
// 0 to maxUsersPage is invalidPage.
func (s *server) adminUsers(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	if _, ok := s.allowAdmin(w, r); !ok {
		return
	}
	page := 0
	if value := r.URL.Query().Get("page"); value != "" {
		var err error
		if page, err = strconv.Atoi(value); err != nil {
			refuse(w, http.StatusBadRequest, "invalidPage")
			return
		}
	}
	users, f := s.usersPage(r, page)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, adminUsersAnswer{Page: page, PageSize: store.AdminUsersPage, Total: users.Total, Users: users.Users})
}

// usersPage reads one page of the user list: invalidPage when page is not from 0 to maxUsersPage.
func (s *server) usersPage(r *http.Request, page int) (*store.AdminUsers, *failure) {
	if page < 0 || page > maxUsersPage {
		return nil, refused(http.StatusBadRequest, "invalidPage")
	}
	users, err := s.config.Store.Users(r.Context(), page)
	if err != nil {
		return nil, broken(err, "admin.users", "databaseUnavailable")
	}
	return users, nil
}

// adminUsersAnswer is one page of the user list.
type adminUsersAnswer struct {
	Page     int               `json:"page"`
	PageSize int               `json:"pageSize"`
	Total    int               `json:"total"`
	Users    []store.AdminUser `json:"users"`
}

// adminSignout forgets the administrator's cookie. Like signout, it needs the app's own Origin, and it marks the browser
// the same way (reloginCookie).
func (s *server) adminSignout(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !s.sameOrigin(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	http.SetCookie(w, s.adminCookie("", -1))
	http.SetCookie(w, s.relogin(int(session.MaxAge.Seconds())))
	noContent(w)
}

// adminGallery answers the listed and hidden shares with their reports to the administrator.
func (s *server) adminGallery(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	if _, ok := s.allowAdmin(w, r); !ok {
		return
	}
	packs, f := s.adminGalleryPacks(r)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, map[string][]store.AdminGalleryPack{"packs": packs})
}

// adminGalleryPacks reads the listed or hidden shares as the dashboard lists them, never nil.
func (s *server) adminGalleryPacks(r *http.Request) ([]store.AdminGalleryPack, *failure) {
	packs, err := s.config.Store.AdminGallery(r.Context())
	if err != nil {
		return nil, broken(err, "admin.gallery", "databaseUnavailable")
	}
	if packs == nil {
		packs = []store.AdminGalleryPack{}
	}
	return packs, nil
}

func (s *server) adminHide(w http.ResponseWriter, r *http.Request)   { s.adminSetHidden(w, r, true) }
func (s *server) adminUnhide(w http.ResponseWriter, r *http.Request) { s.adminSetHidden(w, r, false) }

// adminSetHidden hides the share "id" from the gallery, or shows it again. Like adminSignout it needs the app's own
// Origin, and the body is JSON.
func (s *server) adminSetHidden(w http.ResponseWriter, r *http.Request, hidden bool) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	if _, ok := s.allowAdmin(w, r); !ok {
		return
	}
	if !s.sameOrigin(r) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	fields, ok := readStringFields(r, maxIDBodyBytes, "id")
	if !ok {
		refuse(w, http.StatusBadRequest, "invalidRequest")
		return
	}
	if f := s.setHidden(r, fields["id"], hidden); f != nil {
		s.fail(w, r, f)
		return
	}
	noContent(w)
}

// setHidden hides the share id from the gallery, or shows it again: invalidRequest without an id, and
// sharedPackNotFound when there is no such share.
func (s *server) setHidden(r *http.Request, id string, hidden bool) *failure {
	if id == "" {
		return refused(http.StatusBadRequest, "invalidRequest")
	}
	found, err := s.config.Store.SetHidden(r.Context(), id, hidden)
	if err != nil {
		return broken(err, "admin.hide", "databaseUnavailable")
	}
	if !found {
		return refused(http.StatusNotFound, "sharedPackNotFound")
	}
	return nil
}
