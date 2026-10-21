package web

import (
	"log"
	"net/http"
	"time"

	"github.com/getsentry/sentry-go"
)

// flushTimeout is how long a report may take to leave before the function goes on (and may be frozen by the platform).
const flushTimeout = 2 * time.Second

// NewReporter returns the Config.Report that sends failures to Sentry: the DSN is SENTRY_DSN, or else
// NEXT_PUBLIC_SENTRY_DSN, and the environment SENTRY_ENVIRONMENT, or else VERCEL_ENV (as src/sentry.server.config.ts).
// Without a DSN, or with one the SDK refuses, the failure is only logged.
//
// The request is not attached: its query holds the OAuth code and state, and its cookies the session and the OAuth
// state. Sentry gets the method and path, and the operation as a tag. A client of its own is used rather than the
// SDK's global one, so nothing else in the process can add request data to the report.
func NewReporter(getenv func(string) string) func(*http.Request, error, string) {
	dsn := getenv("SENTRY_DSN")
	if dsn == "" {
		dsn = getenv("NEXT_PUBLIC_SENTRY_DSN")
	}
	if dsn == "" {
		return logOnly
	}
	environment := getenv("SENTRY_ENVIRONMENT")
	if environment == "" {
		environment = getenv("VERCEL_ENV")
	}
	client, err := sentry.NewClient(sentry.ClientOptions{Dsn: dsn, Environment: environment})
	if err != nil {
		log.Printf("sentry is not used: %v", err)
		return logOnly
	}
	return newReporter(client)
}

func logOnly(r *http.Request, err error, operation string) {
	log.Printf("%s %s: %s: %v", r.Method, r.URL.Path, operation, err)
}

func newReporter(client *sentry.Client) func(*http.Request, error, string) {
	return func(r *http.Request, err error, operation string) {
		logOnly(r, err, operation)
		// A hub of its own for each report, so that its tag and request are not seen by another.
		hub := sentry.NewHub(client, sentry.NewScope())
		hub.WithScope(func(scope *sentry.Scope) {
			scope.SetTag("operation", operation)
			request := &sentry.Request{Method: r.Method, URL: r.URL.Path}
			scope.AddEventProcessor(func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
				event.Request = request
				return event
			})
			hub.CaptureException(err)
		})
		hub.Flush(flushTimeout)
	}
}
