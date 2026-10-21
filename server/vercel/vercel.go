// Package vercel builds the handler that the Vercel Go functions under api/ serve. It is outside server/internal
// because api/ at the repository root may not import internal packages.
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

var (
	// ready is the finished handler. Once it is set every request finds it with one atomic load, without the lock.
	ready atomic.Pointer[http.Handler]

	// mu guards the fields below. It is never held while the database is being opened (up to openTimeout): it is taken
	// only to read or write them, so a request is never queued behind someone else's connection attempt by the lock.
	mu       sync.Mutex
	flight   *attempt     // the connection attempt in progress, if any
	failedAt time.Time    // when the last attempt failed
	failure  http.Handler // and the 503 it gave
)

// attempt is one try at opening the database. The requests that come while it is in progress wait for its answer (at
// most openTimeout) rather than each trying on its own, so N requests cost one connection attempt, not N in turn.
type attempt struct {
	done    chan struct{}
	handler http.Handler
}

const openTimeout = 10 * time.Second

// retryAfter is how long a failed connection attempt is remembered: requests in that time get the 503 at once, and the
// first one after it tries again. A database that is down is thus tried about once a second, not once per request. It
// is a variable for the tests.
var retryAfter = time.Second

// now is the clock of the back-off; the tests replace it.
var now = time.Now

// open connects to the database; the tests replace it.
var open = func(ctx context.Context, connection string) (web.Store, error) {
	source, err := store.OpenApp(ctx, connection)
	if err != nil {
		return nil, err
	}
	return source, nil
}

var (
	// Without the login settings only the login is unavailable, as far as the answer tells; the rest says the database,
	// as the paths did before the login settings existed.
	settingsUnavailable = split("/api/auth/", web.Unavailable("authUnavailable"), web.Unavailable("databaseUnavailable"))
	databaseUnavailable = web.Unavailable("databaseUnavailable")
)

// split serves the paths under prefix with one handler and all others with the other.
func split(prefix string, under, other http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, prefix) {
			under.ServeHTTP(w, r)
			return
		}
		other.ServeHTTP(w, r)
	})
}

// Handler returns the app's handler, built from the environment on first use and kept for the instance's later
// requests. When it cannot be built the request gets a 503, the reason is logged, and nothing is kept, so a later request
// tries again:
//
//   - the login settings are missing or invalid (web.FromEnv): /api/auth/* says authUnavailable and every other path
//     databaseUnavailable. The database is not opened. Each request looks at the environment again, which costs nothing.
//   - there is no database URL, or the database does not open: every path says databaseUnavailable, /api/auth/* too.
//     The session path alone could be served without a database, but a function that cannot reach it is not worth
//     serving half of. A failed connection is remembered for retryAfter (see attempt).
//
// It never panics: web.Config is only built from a successful web.FromEnv, whose Keys can seal a cookie.
func Handler() http.Handler {
	if built := ready.Load(); built != nil {
		return *built
	}
	config, err := web.FromEnv(os.Getenv, false)
	if err != nil {
		log.Printf("start the backend: %v", err)
		return settingsUnavailable
	}
	// The same variables as the app (src/plugins/storage/cloud/database.ts).
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		connection = os.Getenv("POSTGRES_URL")
	}
	if connection == "" {
		log.Print("start the backend: set DATABASE_URL (or POSTGRES_URL)")
		return databaseUnavailable
	}
	return connect(config, connection)
}

// connect opens the database for the request that finds the handler not built yet, or waits for the attempt already in
// progress, or answers from the last failure while it is recent.
func connect(config web.Config, connection string) http.Handler {
	mu.Lock()
	if built := ready.Load(); built != nil {
		mu.Unlock()
		return *built
	}
	if failure != nil && now().Sub(failedAt) < retryAfter {
		recent := failure
		mu.Unlock()
		return recent
	}
	if running := flight; running != nil {
		mu.Unlock()
		<-running.done
		return running.handler
	}
	mine := &attempt{done: make(chan struct{}), handler: databaseUnavailable}
	flight = mine
	mu.Unlock()

	// Whatever happens, the waiters are released with the 503 unless there is a handler.
	defer func() {
		mu.Lock()
		flight = nil
		if built := ready.Load(); built != nil {
			failure = nil
		} else {
			failedAt, failure = now(), mine.handler
		}
		mu.Unlock()
		close(mine.done)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), openTimeout)
	defer cancel()
	source, err := open(ctx, connection)
	if err != nil {
		log.Printf("start the backend: connect to the database: %v", err)
		return mine.handler
	}
	config.Store = source
	config.Report = web.NewReporter(os.Getenv)
	built := web.New(config)
	mine.handler = built
	ready.Store(&built)
	return built
}
