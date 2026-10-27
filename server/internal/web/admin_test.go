package web

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// adminStore is a database with typle_admins: allowed answers Admin, and it remembers what it was asked.
type adminStore struct {
	fakeStore
	allowed  bool
	checkErr error
	login    string
	githubID int64
	overview *store.AdminOverview
}

func (a *adminStore) Admin(_ context.Context, login string, githubID int64) (bool, error) {
	a.login, a.githubID = login, githubID
	return a.allowed, a.checkErr
}

func (a *adminStore) Overview(context.Context) (*store.AdminOverview, error) {
	return a.overview, a.err
}

// newAdminHarness is newLoginHarness with the administrator's GitHub account and the store a.
func newAdminHarness(t *testing.T, base string, a *adminStore) *loginHarness {
	t.Helper()
	h := newLoginHarness(t, base, false)
	h.users.user = auth.User{ID: 7, Login: "SparklingStadt", Name: "Sparkling", AvatarURL: "https://avatars.test/7"}
	parsed, _ := url.Parse(base)
	h.handler = New(Config{
		Store: a, Keys: h.keys, BaseURL: parsed, OAuth: h.oauth, GitHub: h.users,
		Now:    func() time.Time { return h.now },
		Report: func(_ *http.Request, err error, operation string) { h.reports = append(h.reports, operation) },
	})
	return h
}

// adminSignin goes through /api/auth/signin?admin=1 and returns the OAuth cookie it set.
func (h *loginHarness) adminSignin(t *testing.T, query string) *http.Cookie {
	t.Helper()
	response := h.do(http.MethodGet, "/api/auth/signin?admin=1"+query)
	cookie := findCookie(response, session.OAuthCookie)
	if response.Code != http.StatusFound || cookie == nil {
		t.Fatalf("signin = %d %v", response.Code, response.Header())
	}
	return &http.Cookie{Name: cookie.Name, Value: cookie.Value}
}

func (h *loginHarness) adminCookie(login string, id int64) *http.Cookie {
	return &http.Cookie{Name: session.AdminCookieName(h.secure), Value: h.keys.SealAdmin(session.NewAdmin(login, strconv.FormatInt(id, 10), h.now))}
}

// A login to the dashboard always returns to it, whatever returnTo says, and an app's client is not taken.
func TestAdminSignin(t *testing.T) {
	h := newAdminHarness(t, testBase, &adminStore{})
	cookie := h.adminSignin(t, "&returnTo=%2Fplay&client=ipad&code_challenge=x")
	opened, ok := h.keys.OpenOAuth(cookie.Value, h.now)
	if !ok || !opened.Admin || opened.ReturnTo != "/admin" || opened.Challenge != "" {
		t.Fatalf("OAuth cookie = %+v, %v", opened, ok)
	}
	plain, _ := h.keys.OpenOAuth(h.signin(t, "/play").Value, h.now)
	if plain.Admin {
		t.Fatal("a login without admin=1 is a login to the dashboard")
	}
}

// The administrator's account gets the administrator's cookie, and no session cookie.
func TestAdminCallback(t *testing.T) {
	for _, base := range []string{testBase, "https://typle.test"} {
		h := newAdminHarness(t, base, &adminStore{})
		cookie := h.adminSignin(t, "")
		response := h.callback("state="+url.QueryEscape(h.oauth.state)+"&code=c", cookie)
		if response.Code != http.StatusFound || response.Header().Get("Location") != "/admin" {
			t.Fatalf("%s: callback = %d %v", base, response.Code, response.Header())
		}
		if findCookie(response, h.sessionCookieName()) != nil {
			t.Fatalf("%s: the dashboard's login set the session cookie", base)
		}
		admin := findCookie(response, session.AdminCookieName(h.secure))
		if admin == nil || !admin.HttpOnly || admin.SameSite != http.SameSiteStrictMode || admin.Path != "/" ||
			admin.Secure != h.secure || admin.MaxAge != int(session.AdminMaxAge.Seconds()) {
			t.Fatalf("%s: admin cookie = %+v", base, admin)
		}
		opened, ok := h.keys.OpenAdmin(admin.Value, h.now)
		if !ok || opened.Email != "SparklingStadt" || opened.Sub != "7" {
			t.Fatalf("%s: admin session = %+v, %v", base, opened, ok)
		}
	}
}

// Any other GitHub account goes back to the dashboard refused, signed in to nothing.
func TestAdminCallbackRefusesOthers(t *testing.T) {
	h := newAdminHarness(t, testBase, &adminStore{allowed: true})
	h.users.user = auth.User{ID: 8, Login: "sparklingstadt-fan", Name: "sparklingstadt"}
	cookie := h.adminSignin(t, "")
	response := h.callback("state="+url.QueryEscape(h.oauth.state)+"&code=c", cookie)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/admin?error=adminForbidden" {
		t.Fatalf("callback = %d %v", response.Code, response.Header())
	}
	for _, c := range response.Result().Cookies() {
		if c.Name != session.OAuthCookie {
			t.Fatalf("cookie set: %+v", c)
		}
	}
	// A failed login returns to the dashboard too.
	cookie = h.adminSignin(t, "")
	response = h.callback("state=wrong&code=c", cookie)
	if response.Header().Get("Location") != "/admin" || findCookie(response, session.AdminCookieName(false)) != nil {
		t.Fatalf("failed callback = %d %v", response.Code, response.Header())
	}
}

func TestAdminDashboard(t *testing.T) {
	overview := &store.AdminOverview{Workspaces: 3, ActiveWeek: 2, SharedPacks: 1,
		RecentShares: []store.AdminShare{}, Admins: []store.AdminAccount{}}
	a := &adminStore{allowed: true, overview: overview}
	h := newAdminHarness(t, testBase, a)
	response := h.do(http.MethodGet, "/api/admin/dashboard", withCookie(h.adminCookie("SparklingStadt", 7)))
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("dashboard = %d %v %s", response.Code, response.Header(), response.Body)
	}
	var body struct {
		Admin    adminUser           `json:"admin"`
		Overview store.AdminOverview `json:"overview"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Admin != (adminUser{"SparklingStadt", 7}) || body.Overview.Workspaces != 3 || body.Overview.SharedPacks != 1 {
		t.Fatalf("body = %s", response.Body)
	}
	if a.login != "SparklingStadt" || a.githubID != 7 {
		t.Fatalf("checked %q %d", a.login, a.githubID)
	}
}

func TestAdminDashboardRefuses(t *testing.T) {
	a := &adminStore{allowed: true, overview: &store.AdminOverview{}}
	h := newAdminHarness(t, testBase, a)
	sessionCookie := &http.Cookie{Name: h.sessionCookieName(), Value: h.keys.Seal(session.New("github:7", "x", "", h.now))}
	expired := h.adminCookie("sparklingstadt", 7)
	expired.Value = h.keys.SealAdmin(session.NewAdmin("sparklingstadt", "7", h.now.Add(-session.AdminMaxAge)))
	for name, cookie := range map[string]*http.Cookie{
		"no cookie":      nil,
		"session cookie": sessionCookie,
		"expired":        expired,
		"another login":  h.adminCookie("octocat", 1),
		"forged":         {Name: session.AdminCookieName(false), Value: strings.Replace(h.adminCookie("x", 1).Value, ".", "x.", 1)},
	} {
		var change []func(*http.Request)
		if cookie != nil {
			change = append(change, withCookie(cookie))
		}
		expectError(t, h.do(http.MethodGet, "/api/admin/dashboard", change...), http.StatusUnauthorized, "adminRequired")
		if a.login != "" {
			t.Fatalf("%s: the database was asked", name)
		}
	}

	// An account typle_admins does not let in loses its cookie.
	a.allowed = false
	response := h.do(http.MethodGet, "/api/admin/dashboard", withCookie(h.adminCookie("sparklingstadt", 9)))
	expectError(t, response, http.StatusForbidden, "adminForbidden")
	if c := findCookie(response, session.AdminCookieName(false)); c == nil || c.MaxAge >= 0 {
		t.Fatalf("cookie = %+v", c)
	}

	a.allowed, a.checkErr = false, errors.New("down")
	expectError(t, h.do(http.MethodGet, "/api/admin/dashboard", withCookie(h.adminCookie("sparklingstadt", 7))),
		http.StatusServiceUnavailable, "databaseUnavailable")
	a.allowed, a.checkErr, a.err = true, nil, errors.New("down")
	expectError(t, h.do(http.MethodGet, "/api/admin/dashboard", withCookie(h.adminCookie("sparklingstadt", 7))),
		http.StatusServiceUnavailable, "databaseUnavailable")
	if strings.Join(h.reports, ",") != "admin.check,admin.overview" {
		t.Fatalf("reports = %v", h.reports)
	}
	expectError(t, h.do(http.MethodPost, "/api/admin/dashboard"), http.StatusMethodNotAllowed, "methodNotAllowed")
}

func TestAdminSignout(t *testing.T) {
	h := newAdminHarness(t, testBase, &adminStore{})
	expectError(t, h.do(http.MethodPost, "/api/auth/admin/signout"), http.StatusForbidden, "forbiddenRequest")
	expectError(t, h.do(http.MethodGet, "/api/auth/admin/signout"), http.StatusMethodNotAllowed, "methodNotAllowed")
	response := h.do(http.MethodPost, "/api/auth/admin/signout", withOrigin(testBase))
	c := findCookie(response, session.AdminCookieName(false))
	if response.Code != http.StatusNoContent || c == nil || c.MaxAge >= 0 || c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("signout = %d %+v", response.Code, c)
	}
}

// usersStore answers the user list and remembers the page it was asked for.
type usersStore struct {
	adminStore
	page  int
	users *store.AdminUsers
}

func (u *usersStore) Users(_ context.Context, page int) (*store.AdminUsers, error) {
	u.page = page
	return u.users, u.err
}

func TestAdminUsers(t *testing.T) {
	u := &usersStore{adminStore: adminStore{allowed: true}, page: -1, users: &store.AdminUsers{Total: 51,
		Users: []store.AdminUser{{OwnerID: "github:42", Lists: 3, Shares: 1, Revision: 2, UpdatedAt: time.Unix(1700000000, 0).UTC()}}}}
	h := newLoginHarness(t, testBase, false)
	parsed, _ := url.Parse(testBase)
	h.handler = New(Config{Store: u, Keys: h.keys, BaseURL: parsed, Now: func() time.Time { return h.now },
		Report: func(_ *http.Request, err error, operation string) { h.reports = append(h.reports, operation) }})
	admin := withCookie(h.adminCookie("sparklingstadt", 7))

	response := h.do(http.MethodGet, "/api/admin/users?page=1", admin)
	want := `{"page":1,"pageSize":50,"total":51,"users":[{"ownerId":"github:42","lists":3,"packs":0,"devices":0,"shares":1,` +
		`"revision":2,"updatedAt":"2023-11-14T22:13:20Z"}]}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want || u.page != 1 {
		t.Fatalf("users = %d %s (page %d)", response.Code, response.Body, u.page)
	}
	if h.do(http.MethodGet, "/api/admin/users", admin); u.page != 0 {
		t.Fatalf("no page asked for page %d", u.page)
	}
	for _, page := range []string{"-1", "x", "1.5", "10001"} {
		u.page = -1
		expectError(t, h.do(http.MethodGet, "/api/admin/users?page="+page, admin), http.StatusBadRequest, "invalidPage")
		if u.page != -1 {
			t.Fatalf("page %s reached the database", page)
		}
	}
	// The list is the administrator's alone.
	expectError(t, h.do(http.MethodGet, "/api/admin/users"), http.StatusUnauthorized, "adminRequired")
	u.allowed = false
	expectError(t, h.do(http.MethodGet, "/api/admin/users", admin), http.StatusForbidden, "adminForbidden")
	u.allowed, u.err = true, errors.New("down")
	expectError(t, h.do(http.MethodGet, "/api/admin/users", admin), http.StatusServiceUnavailable, "databaseUnavailable")
	if strings.Join(h.reports, ",") != "admin.users" {
		t.Fatalf("reports = %v", h.reports)
	}
}
