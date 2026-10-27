package web

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// The administrator's dashboard (/admin) has a login of its own. It goes through GitHub as the app's login does
// (/api/auth/signin?admin=1, then the same callback), but ends with the administrator's cookie instead of the session
// cookie, and only for the GitHub account adminLogin. Each /api/admin request then also checks the account against
// typle_admins, which binds the account's numeric id at its first sign-in.
const (
	adminLogin = "sparklingstadt"
	adminPage  = "/admin"
	// adminRefused is where a login of another GitHub account ends: the page says it is not an administrator.
	adminRefused = adminPage + "?error=adminForbidden"
)

// isAdminLogin reports whether a GitHub login is the administrator's. GitHub logins are not case-sensitive.
func isAdminLogin(login string) bool {
	return strings.EqualFold(login, adminLogin)
}

// adminCookie is SameSite=Strict: the dashboard is only reached from the app's own pages, and its cookie is never sent
// with a request another site starts.
func (s *server) adminCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name: session.AdminCookieName(s.secure()), Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: s.secure(),
	}
}

// issueAdmin signs the administrator in to the dashboard.
//
// TODO(Task 3'): session.Admin now names an FFPF ID account (email and sub), but the dashboard's login still goes
// through GitHub and typle_admins still holds GitHub accounts. Until the login is rewritten for FFPF ID, the GitHub
// login rides in Email and the numeric GitHub id, in decimal, in Sub; githubAdmin reads them back.
func (s *server) issueAdmin(w http.ResponseWriter, login string, githubID int64) {
	value := s.config.Keys.SealAdmin(session.NewAdmin(login, strconv.FormatInt(githubID, 10), s.now()))
	http.SetCookie(w, s.adminCookie(value, int(session.AdminMaxAge.Seconds())))
}

// githubAdmin is the GitHub account that issueAdmin put in admin. TODO(Task 3'): goes with the GitHub login.
func githubAdmin(admin session.Admin) (login string, githubID int64, ok bool) {
	id, err := strconv.ParseInt(admin.Sub, 10, 64)
	return admin.Email, id, err == nil && id > 0
}

// signedInAdmin is the administrator's session of the request's cookie, before it is checked against typle_admins.
func (s *server) signedInAdmin(r *http.Request) (session.Admin, bool) {
	cookie, err := r.Cookie(session.AdminCookieName(s.secure()))
	if err != nil {
		return session.Admin{}, false
	}
	admin, ok := s.config.Keys.OpenAdmin(cookie.Value, s.now())
	login, _, isGitHub := githubAdmin(admin)
	return admin, ok && isGitHub && isAdminLogin(login)
}

// adminAnswer is who is signed in to the dashboard, and what it shows.
type adminAnswer struct {
	Admin    adminUser            `json:"admin"`
	Overview *store.AdminOverview `json:"overview"`
}

type adminUser struct {
	Login    string `json:"login"`
	GitHubID int64  `json:"githubId"`
}

// allowAdmin lets the administrator through: adminRequired without their cookie, and adminForbidden, with the cookie
// removed, when typle_admins no longer lets the account in. The caller answers only when it returns true.
func (s *server) allowAdmin(w http.ResponseWriter, r *http.Request) (session.Admin, bool) {
	admin, ok := s.signedInAdmin(r)
	if !ok {
		refuse(w, http.StatusUnauthorized, "adminRequired")
		return session.Admin{}, false
	}
	allowed, err := s.config.Store.Admin(r.Context(), admin.Email, admin.Sub)
	if err != nil {
		s.report(r, err, "admin.check")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return session.Admin{}, false
	}
	if !allowed {
		http.SetCookie(w, s.adminCookie("", -1))
		refuse(w, http.StatusForbidden, "adminForbidden")
		return session.Admin{}, false
	}
	return admin, true
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
	overview, err := s.config.Store.Overview(r.Context())
	if err != nil {
		s.report(r, err, "admin.overview")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	login, githubID, _ := githubAdmin(admin)
	reply(w, http.StatusOK, adminAnswer{Admin: adminUser{Login: login, GitHubID: githubID}, Overview: overview})
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
		if page, err = strconv.Atoi(value); err != nil || page < 0 || page > maxUsersPage {
			refuse(w, http.StatusBadRequest, "invalidPage")
			return
		}
	}
	users, err := s.config.Store.Users(r.Context(), page)
	if err != nil {
		s.report(r, err, "admin.users")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	reply(w, http.StatusOK, adminUsersAnswer{Page: page, PageSize: store.AdminUsersPage, Total: users.Total, Users: users.Users})
}

// adminUsersAnswer is one page of the user list.
type adminUsersAnswer struct {
	Page     int               `json:"page"`
	PageSize int               `json:"pageSize"`
	Total    int               `json:"total"`
	Users    []store.AdminUser `json:"users"`
}

// adminSignout forgets the administrator's cookie. Like signout, it needs the app's own Origin.
func (s *server) adminSignout(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !s.sameOrigin(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	http.SetCookie(w, s.adminCookie("", -1))
	noContent(w)
}
