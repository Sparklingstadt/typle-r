package vercel

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/web"
)

// reset forgets the built handler and the failure back-off, so that each test builds its own from its environment, and
// puts the package's settings back when the test is done.
func reset(t *testing.T) {
	t.Helper()
	forget := func() {
		mu.Lock()
		defer mu.Unlock()
		ready.Store(nil)
		failedAt, failure = time.Time{}, nil
	}
	forget()
	opener, wait := open, retryAfter
	t.Cleanup(func() {
		open, retryAfter = opener, wait
		forget()
	})
}

// fakeStore is a database that answers.
type fakeStore struct{}

func (fakeStore) Ping(context.Context) error { return nil }
func (fakeStore) ReadRevision(context.Context, string) (*store.Saved, error) {
	return nil, errors.New("not used")
}
func (fakeStore) WriteRevision(context.Context, string, int, store.Change) (*store.Saved, error) {
	return nil, errors.New("not used")
}

func settings(t *testing.T) {
	t.Helper()
	t.Setenv("AUTH_SECRET", "secret")
	t.Setenv("AUTH_URL", "https://typle.example")
	t.Setenv("AUTH_GITHUB_ID", "id")
	t.Setenv("AUTH_GITHUB_SECRET", "client-secret")
	t.Setenv("DATABASE_URL", "postgresql://typle@db.invalid/typle")
	t.Setenv("POSTGRES_URL", "")
	t.Setenv("SENTRY_DSN", "")
	t.Setenv("NEXT_PUBLIC_SENTRY_DSN", "")
}

func get(path string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
	return response
}

func serve(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	return get("/api/health")
}

func expect(t *testing.T, response *httptest.ResponseRecorder, status int, body string) {
	t.Helper()
	if response.Code != status || strings.TrimSpace(response.Body.String()) != body {
		t.Fatalf("response = %d %s, want %d %s", response.Code, response.Body, status, body)
	}
}

// Without the login settings the auth paths say authUnavailable and the others databaseUnavailable, nothing panics
// (a zero web.Config would panic on the first session), and nothing of that failure is kept: once the settings are
// there, the next request is served.
func TestHandlerWithoutSecret(t *testing.T) {
	reset(t)
	settings(t)
	var opened atomic.Int32
	open = func(context.Context, string) (web.Store, error) { opened.Add(1); return fakeStore{}, nil }
	t.Setenv("AUTH_SECRET", "")

	expect(t, get("/api/auth/session"), http.StatusServiceUnavailable, `{"error":"authUnavailable"}`)
	expect(t, get("/api/auth/callback/github?code=x&state=y"), http.StatusServiceUnavailable, `{"error":"authUnavailable"}`)
	expect(t, get("/api/workspace"), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
	expect(t, get("/api/health"), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
	if opened.Load() != 0 {
		t.Fatal("the database was opened without the login settings")
	}

	t.Setenv("AUTH_SECRET", "secret")
	expect(t, get("/api/auth/session"), http.StatusOK, `{"user":null}`)
	expect(t, get("/api/health"), http.StatusOK, `{"status":"ok"}`)
}

func TestHandlerInvalidAuthURL(t *testing.T) {
	reset(t)
	settings(t)
	open = func(context.Context, string) (web.Store, error) { return fakeStore{}, nil }
	t.Setenv("AUTH_URL", "ftp://x")
	expect(t, get("/api/auth/session"), http.StatusServiceUnavailable, `{"error":"authUnavailable"}`)
}

// When the database does not open, every path says databaseUnavailable, the auth ones too: even the session needs no
// database, but a function that cannot reach it is not worth serving half of.
func TestHandlerDatabaseDown(t *testing.T) {
	reset(t)
	settings(t)
	retryAfter = 0
	open = func(context.Context, string) (web.Store, error) { return nil, errors.New("connection refused") }
	for _, path := range []string{"/api/health", "/api/workspace", "/api/auth/session"} {
		expect(t, get(path), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
	}
	open = func(context.Context, string) (web.Store, error) { return fakeStore{}, nil }
	expect(t, get("/api/auth/session"), http.StatusOK, `{"user":null}`)
}

func TestHandlerWithoutDatabaseURL(t *testing.T) {
	reset(t)
	settings(t)
	t.Setenv("DATABASE_URL", "")
	open = func(context.Context, string) (web.Store, error) { return fakeStore{}, nil }
	expect(t, get("/api/health"), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
	t.Setenv("POSTGRES_URL", "postgresql://typle@db.invalid/typle")
	expect(t, get("/api/health"), http.StatusOK, `{"status":"ok"}`)
}

// Many requests that arrive while the database is down share one connection attempt instead of queueing behind one
// each, and nobody holds the lock while it is made.
func TestHandlerConcurrentWhileDown(t *testing.T) {
	reset(t)
	settings(t)
	var attempts atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	open = func(context.Context, string) (web.Store, error) {
		if attempts.Add(1) == 1 {
			close(started)
		}
		<-release
		return nil, errors.New("connection refused")
	}

	const callers = 8
	var wg sync.WaitGroup
	codes := make(chan int, callers)
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- get("/api/workspace").Code
		}()
	}
	<-started
	// While the connection is being made the lock is free, so that a request that does not need it is not held up.
	if !mu.TryLock() {
		t.Fatal("the lock is held while the database is being opened")
	}
	mu.Unlock()
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != http.StatusServiceUnavailable {
			t.Errorf("status = %d", code)
		}
	}
	if attempts.Load() != 1 {
		t.Fatalf("%d connection attempts for %d concurrent requests", attempts.Load(), callers)
	}
}

// A failed attempt is not repeated by every request that follows it: for retryAfter they get the 503 at once, and then
// the next one tries again.
func TestHandlerBackOff(t *testing.T) {
	reset(t)
	settings(t)
	retryAfter = 100 * time.Millisecond
	var attempts atomic.Int32
	open = func(context.Context, string) (web.Store, error) {
		attempts.Add(1)
		return nil, errors.New("connection refused")
	}
	for i := 0; i < 5; i++ {
		expect(t, get("/api/health"), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
	}
	if attempts.Load() != 1 {
		t.Fatalf("%d attempts within the back-off", attempts.Load())
	}
	time.Sleep(150 * time.Millisecond)
	get("/api/health")
	if attempts.Load() != 2 {
		t.Fatalf("%d attempts after the back-off", attempts.Load())
	}
	// The back-off does not hide a recovered database for longer than it lasts.
	open = func(context.Context, string) (web.Store, error) { return fakeStore{}, nil }
	time.Sleep(150 * time.Millisecond)
	expect(t, get("/api/health"), http.StatusOK, `{"status":"ok"}`)
}

// Once built, the handler is kept and found without the lock or another connection.
func TestHandlerBuiltIsKept(t *testing.T) {
	reset(t)
	settings(t)
	var attempts atomic.Int32
	open = func(context.Context, string) (web.Store, error) { attempts.Add(1); return fakeStore{}, nil }
	expect(t, serve(t), http.StatusOK, `{"status":"ok"}`)
	first := Handler()

	mu.Lock()
	defer mu.Unlock()
	done := make(chan http.Handler)
	go func() { done <- Handler() }()
	select {
	case again := <-done:
		if again != first {
			t.Fatal("the handler was built again")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Handler waits for the lock once the handler is built")
	}
	if attempts.Load() != 1 {
		t.Fatalf("%d connections", attempts.Load())
	}
}

// With a real database: the default opener connects, and POSTGRES_URL is used when DATABASE_URL is not set.
func TestHandlerRealDatabase(t *testing.T) {
	connection := os.Getenv("TYPLE_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TYPLE_TEST_DATABASE_URL to a migrated test database")
	}
	reset(t)
	settings(t)
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_URL", connection)
	expect(t, serve(t), http.StatusOK, `{"status":"ok"}`)
	expect(t, get("/api/auth/session"), http.StatusOK, `{"user":null}`)
}

func TestHandlerUnreachableDatabase(t *testing.T) {
	reset(t)
	settings(t)
	t.Setenv("DATABASE_URL", "postgresql://typle@127.0.0.1:1/typle?connect_timeout=1")
	expect(t, serve(t), http.StatusServiceUnavailable, `{"error":"databaseUnavailable"}`)
}
