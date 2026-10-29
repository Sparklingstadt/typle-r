// Package web is the app's backend as one http.Handler, served by the Vercel Go function (server/vercel) beside the
// Next.js app.
package web

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/operation"
	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// Store is what the handlers need of the database.
type Store interface {
	Ping(ctx context.Context) error
	ReadRevision(ctx context.Context, owner string) (*store.Saved, error)
	WriteRevision(ctx context.Context, owner string, revision int, change store.Change) (*store.Saved, error)
	operation.Writer
	PutShare(ctx context.Context, owner, packID string) (*store.Share, error)
	DeleteShare(ctx context.Context, owner, packID string) error
	ListShares(ctx context.Context, owner string) ([]store.Share, error)
	SharedPack(ctx context.Context, id string) (json.RawMessage, error)
	Admin(ctx context.Context, email, sub string) (bool, error)
	Overview(ctx context.Context) (*store.AdminOverview, error)
	Users(ctx context.Context, page int) (*store.AdminUsers, error)
	SessionSource
}

// OAuthClient is the GitHub OAuth App the login goes through (auth.OAuth).
type OAuthClient interface {
	AuthorizeURL(state, challenge, redirectURI string) string
	Exchange(ctx context.Context, code, verifier, redirectURI string) (string, error)
}

// UserSource tells who an OAuth access token belongs to (auth.GitHub).
type UserSource interface {
	User(ctx context.Context, token string) (auth.User, error)
}

// FFPFLogin is the "Sign in with FFPF ID" client (auth.FFPF): the OpenID Connect provider of ffpf-portal.
type FFPFLogin interface {
	AuthorizeURL(state, challenge, nonce, redirectURI string) string
	Exchange(ctx context.Context, code, verifier, redirectURI, nonce string) (auth.FFPFUser, error)
}

// AdminSource tells whether an FFPF ID account is an administrator (store.Store.Admin).
type AdminSource interface {
	Admin(ctx context.Context, email, sub string) (bool, error)
}

// SessionSource keeps when each account last signed out of every device (store.Store.RevokeSessions and
// SessionsRevokedAt).
type SessionSource interface {
	RevokeSessions(ctx context.Context, owner string) error
	SessionsRevokedAt(ctx context.Context, owner string) (time.Time, error)
}

// Config holds what the handlers depend on.
type Config struct {
	Store Store
	// Keys opens the session cookie. The zero Keys refuses every cookie, so nobody is signed in.
	Keys session.Keys
	// BaseURL is where the app is served (AUTH_URL): its scheme picks the cookie's name and its origin is the only one
	// a state-changing request may come from. Without it no request is from the app's own origin.
	BaseURL *url.URL
	// Now is the clock; time.Now when nil.
	Now func() time.Time
	// OAuth and GitHub are the login: without them, or without BaseURL, signin and callback answer 503.
	OAuth  OAuthClient
	GitHub UserSource
	// FFPF is the login through FFPF ID, and the only way in to the administrator's dashboard: without it, or without
	// BaseURL, signin with provider=ffpf or admin=1 and its callback answer 503.
	FFPF FFPFLogin
	// Admins is asked, at the end of a login to the dashboard, whether the FFPF ID account is an administrator. When
	// nil, Store is asked. It lets the /api/auth part, which has no Store so that the session never waits for the
	// database (server/vercel), open the database for this one question only.
	Admins AdminSource
	// Sessions is asked whether a session has been revoked (signed out of every device), and told when one is. When
	// nil, Store is. As with Admins, it lets the /api/auth part ask without a Store: there, SessionsRevokedAt may fail
	// when the database is not open yet, and only the session's answer goes on unchecked (see session).
	Sessions SessionSource
	// LocalLogin turns on POST /api/auth/local, which signs in as a made-up local account for development. Off, the
	// path does not exist.
	LocalLogin bool
	// Report is told of a failure that is answered with a 503, with the operation that failed (such as
	// "workspace.read"), so that it can be sent to an error tracker. When nil the failure is only logged.
	Report func(r *http.Request, err error, operation string)
}

type server struct{ config Config }

// New serves the app's /api paths; any other path is a 404.
func New(c Config) http.Handler {
	s := &server{config: c}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/workspace", s.workspace)
	mux.HandleFunc("/api/workspace/records", s.records)
	mux.HandleFunc("/api/shares", s.shares)
	mux.HandleFunc("/api/shared", s.shared)
	mux.HandleFunc("/api/auth/signin", s.signin)
	mux.HandleFunc(githubCallback, s.callback(providerGitHub))
	mux.HandleFunc(ffpfCallback, s.callback(providerFFPF))
	mux.HandleFunc("/api/auth/session", s.session)
	mux.HandleFunc("/api/auth/token", s.token)
	mux.HandleFunc("/api/auth/signout", s.signout)
	mux.HandleFunc("/api/auth/local", s.localLogin)
	mux.HandleFunc("/api/auth/admin/signout", s.adminSignout)
	mux.HandleFunc("/api/admin/dashboard", s.adminDashboard)
	mux.HandleFunc("/api/admin/users", s.adminUsers)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { refuse(w, http.StatusNotFound, "notFound") })
	return withSecurityHeaders(mux)
}

// The headers next.config.mjs sends with every Next.js response. On Vercel they do not reach the Go functions, so every
// response of this handler carries them too: no other site may frame it, and responses are not sniffed into another
// type or sent with the full URL as the referrer.
var securityHeaders = [...][2]string{
	{"Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"},
	{"X-Frame-Options", "DENY"},
	{"X-Content-Type-Options", "nosniff"},
	{"Referrer-Policy", "strict-origin-when-cross-origin"},
}

// A pointer, not a HandlerFunc, so that handlers can be compared.
type secured struct{ next http.Handler }

func withSecurityHeaders(next http.Handler) http.Handler { return &secured{next} }

func (s *secured) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	header := w.Header()
	for _, pair := range securityHeaders {
		header.Set(pair[0], pair[1])
	}
	s.next.ServeHTTP(w, r)
}

// reply writes every JSON answer. Many are the account's own, and an error may depend on the cookie, so none is kept by
// a cache, a shared one least of all. X-Content-Type-Options comes with the security headers.
func reply(w http.ResponseWriter, status int, value any) {
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "private, no-store")
	header.Set("Vary", "Cookie")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// Errors are keys of the app's `errors` messages; the screen shows them in the reader's language.
func refuse(w http.ResponseWriter, status int, key string) {
	reply(w, status, map[string]string{"error": key})
}

// Unavailable answers every request with a 503 and the error key, in the same form as the handlers' own failures. The
// Vercel entry point uses it for the parts it could not set up.
func Unavailable(key string) http.Handler {
	return withSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		refuse(w, http.StatusServiceUnavailable, key)
	}))
}
