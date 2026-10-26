// Package vercel builds the handler that the Vercel Go functions under api/ serve, and that server/cmd/typle-web serves
// locally. It is outside server/internal because api/ at the repository root may not import internal packages.
package vercel

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/web"
)

// Backend is the app's handler, built lazily from the environment, in parts that need different settings:
//
//   - /api/auth/*: needs the login settings only (web.FromEnv). Its handlers do not use the database, so the session
//     keeps being answered, and a signed-in user stays signed in, while the database is down.
//   - /api/health: needs the database only, so that it tells the database's state whatever the login settings are.
//   - /api/shared: needs the database only too: a shared pack is read by anyone with the link, signed in or not.
//   - everything else (/api/workspace, /api/shares): needs the login settings to read the session cookie, and the database.
//
// Each part is built on first use and then found with one atomic load, without the lock.
type Backend struct {
	local bool

	// login, health, public and ready are the finished handlers of the parts.
	login, health, public, ready atomic.Pointer[http.Handler]
	// settings is the web.Config that web.FromEnv built, kept so that it is read (and its warnings logged) once.
	settings atomic.Pointer[web.Config]
	// source is the database, once it is open.
	source atomic.Pointer[web.Store]

	// mu guards the fields below. It is never held while the database is being opened (up to openTimeout): it is taken
	// only to read or write them, so a request is never queued behind someone else's connection attempt by the lock.
	mu       sync.Mutex
	flight   *attempt  // the connection attempt in progress, if any
	failedAt time.Time // when the last attempt failed, or the zero time
	closer   closer    // the database, once it is open

	// open connects to the database, and retryAfter and now are the clock of the back-off; the tests replace them.
	open       func(ctx context.Context, connection string) (web.Store, error)
	retryAfter time.Duration
	now        func() time.Time
}

// closer is what the database (store.Store) offers to release its connections.
type closer interface{ Close() }

// attempt is one try at opening the database. The requests that come while it is in progress wait for its answer (at
// most openTimeout) rather than each trying on its own, so N requests cost one connection attempt, not N in turn.
type attempt struct {
	done   chan struct{}
	source web.Store // nil when it failed
}

const openTimeout = 10 * time.Second

// New returns a Backend. local is for the typle-web command: only then may the local login (POST /api/auth/local) be
// turned on (see web.FromEnv).
//
// A failed connection is remembered for a second: requests in that time get the 503 at once, and the first one after it
// tries again. A database that is down is thus tried about once a second, not once per request.
func New(local bool) *Backend {
	return &Backend{local: local, retryAfter: time.Second, now: time.Now, open: func(ctx context.Context, connection string) (web.Store, error) {
		source, err := store.OpenApp(ctx, connection)
		if err != nil {
			return nil, err
		}
		return source, nil
	}}
}

var (
	authUnavailable     = web.Unavailable("authUnavailable")
	databaseUnavailable = web.Unavailable("databaseUnavailable")

	shared = New(false)
)

// Handler returns the handler of the Vercel functions: the Backend of this process.
func Handler() http.Handler { return shared }

// ServeHTTP serves /api/auth/* from the login part, /api/health and /api/shared from the database part and any other
// path from both.
func (b *Backend) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/api/auth/"):
		b.authHandler().ServeHTTP(w, r)
	case r.URL.Path == "/api/health":
		b.healthHandler().ServeHTTP(w, r)
	case r.URL.Path == "/api/shared":
		b.sharedHandler().ServeHTTP(w, r)
	default:
		b.databaseHandler().ServeHTTP(w, r)
	}
}

// Check reports whether the login settings are usable (web.FromEnv), without opening the database.
func (b *Backend) Check() error {
	_, err := b.config()
	return err
}

// Ready tries to open the database if that has not been done, and reports whether it is open. A failure is logged.
func (b *Backend) Ready() bool {
	return b.database() != nil
}

// Close closes the database, if it was opened.
func (b *Backend) Close() {
	b.mu.Lock()
	open := b.closer
	b.mu.Unlock()
	if open != nil {
		open.Close()
	}
}

// config is the web.Config of the login settings, without Store and Report. It is built once, from a successful
// web.FromEnv, so the Keys can seal a cookie and nothing panics. A failure is logged and nothing is kept, so a later
// request looks at the environment again, which costs nothing.
func (b *Backend) config() (web.Config, error) {
	if built := b.settings.Load(); built != nil {
		return *built, nil
	}
	config, err := web.FromEnv(os.Getenv, b.local)
	if err != nil {
		log.Printf("start the backend: %v", err)
		return web.Config{}, err
	}
	config.Report = web.NewReporter(os.Getenv)
	b.settings.CompareAndSwap(nil, &config)
	return *b.settings.Load(), nil
}

// authHandler serves /api/auth/*. It is built from the login settings alone: no Store, because the auth handlers do not
// use it, and the database is never opened for them. When the settings are missing or invalid it says authUnavailable.
func (b *Backend) authHandler() http.Handler {
	if built := b.login.Load(); built != nil {
		return *built
	}
	config, err := b.config()
	if err != nil {
		return authUnavailable
	}
	handler := web.New(config)
	b.login.CompareAndSwap(nil, &handler)
	return *b.login.Load()
}

// healthHandler serves /api/health from the database alone: without the login settings it still says whether the
// database answers. While the database does not open it says databaseUnavailable.
func (b *Backend) healthHandler() http.Handler {
	if built := b.health.Load(); built != nil {
		return *built
	}
	source := b.database()
	if source == nil {
		return databaseUnavailable
	}
	handler := web.Health(source)
	b.health.CompareAndSwap(nil, &handler)
	return *b.health.Load()
}

// sharedHandler serves /api/shared from the database alone, as healthHandler serves /api/health. A failure is reported
// to the error tracker when SENTRY_DSN is set, which needs no login settings either.
func (b *Backend) sharedHandler() http.Handler {
	if built := b.public.Load(); built != nil {
		return *built
	}
	source := b.database()
	if source == nil {
		return databaseUnavailable
	}
	handler := web.Shared(source, web.NewReporter(os.Getenv))
	b.public.CompareAndSwap(nil, &handler)
	return *b.public.Load()
}

// databaseHandler serves /api/workspace, /api/shares and any other path outside /api/auth/, /api/health and
// /api/shared. When it cannot be built
// the request gets a 503, the reason is logged, and nothing is kept, so a later request tries again:
//
//   - the login settings are missing or invalid: authUnavailable. The database is not opened.
//   - there is no database URL, or the database does not open: databaseUnavailable.
func (b *Backend) databaseHandler() http.Handler {
	if built := b.ready.Load(); built != nil {
		return *built
	}
	config, err := b.config()
	if err != nil {
		return authUnavailable
	}
	source := b.database()
	if source == nil {
		return databaseUnavailable
	}
	config.Store = source
	handler := web.New(config)
	b.ready.CompareAndSwap(nil, &handler)
	return *b.ready.Load()
}

// database opens the database for the request that finds it not open yet, or waits for the attempt already in
// progress, or gives up at once while the last failure is recent (retryAfter). It is nil while the database is not
// open; the reason is logged.
func (b *Backend) database() web.Store {
	if open := b.source.Load(); open != nil {
		return *open
	}
	// The same variables as typle-api.
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		connection = os.Getenv("POSTGRES_URL")
	}
	if connection == "" {
		log.Print("start the backend: set DATABASE_URL (or POSTGRES_URL)")
		return nil
	}

	b.mu.Lock()
	if open := b.source.Load(); open != nil {
		b.mu.Unlock()
		return *open
	}
	if !b.failedAt.IsZero() && b.now().Sub(b.failedAt) < b.retryAfter {
		b.mu.Unlock()
		return nil
	}
	if running := b.flight; running != nil {
		b.mu.Unlock()
		<-running.done
		return running.source
	}
	mine := &attempt{done: make(chan struct{})}
	b.flight = mine
	b.mu.Unlock()

	// Whatever happens, the waiters are released, with nil unless the database opened.
	defer func() {
		b.mu.Lock()
		b.flight = nil
		if mine.source != nil {
			b.failedAt = time.Time{}
		} else {
			b.failedAt = b.now()
		}
		b.mu.Unlock()
		close(mine.done)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), openTimeout)
	defer cancel()
	source, err := b.open(ctx, connection)
	if err != nil {
		log.Printf("start the backend: connect to the database: %v", err)
		return nil
	}
	if open, ok := source.(closer); ok {
		b.mu.Lock()
		b.closer = open
		b.mu.Unlock()
	}
	mine.source = source
	b.source.Store(&source)
	return source
}
