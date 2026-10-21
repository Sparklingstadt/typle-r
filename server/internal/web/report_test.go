package web

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

// recorder is a Sentry transport that keeps what would be sent.
type recorder struct {
	mu       sync.Mutex
	events   []*sentry.Event
	flushes  []time.Duration
	complete bool
}

func (r *recorder) Configure(sentry.ClientOptions) {}
func (r *recorder) SendEvent(event *sentry.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
}
func (r *recorder) Flush(timeout time.Duration) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.flushes = append(r.flushes, timeout)
	return true
}
func (r *recorder) FlushWithContext(ctx context.Context) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	deadline, ok := ctx.Deadline()
	if ok {
		r.flushes = append(r.flushes, time.Until(deadline).Round(time.Second))
	} else {
		r.flushes = append(r.flushes, 0)
	}
	return true
}
func (r *recorder) Close() {}

func testReporter(t *testing.T) (func(*http.Request, error, string), *recorder) {
	t.Helper()
	transport := &recorder{}
	client, err := sentry.NewClient(sentry.ClientOptions{Dsn: "https://key@o0.ingest.sentry.io/1", Transport: transport, Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	return newReporter(client), transport
}

// The callback's query holds the OAuth code and state, and the cookies hold the session and the OAuth state: none of
// the request except its method and path may reach Sentry.
func TestReporterSendsNoRequestData(t *testing.T) {
	report, transport := testReporter(t)
	request := httptest.NewRequest(http.MethodGet, "/api/auth/callback/github?code=SECRETCODE&state=SECRETSTATE", nil)
	request.AddCookie(&http.Cookie{Name: "typle-oauth", Value: "SECRETOAUTHCOOKIE"})
	request.AddCookie(&http.Cookie{Name: "typle-session", Value: "SECRETSESSIONCOOKIE"})
	request.Header.Set("Authorization", "Bearer SECRETBEARER")
	request.Header.Set("X-Custom", "SECRETHEADER")
	request.Header.Set("Referer", "https://typle.example/?code=SECRETREFERER")
	request.RemoteAddr = "203.0.113.9:1234"

	report(request, errors.New("GitHub refused the code"), "auth.callback")

	if len(transport.events) != 1 {
		t.Fatalf("%d events sent", len(transport.events))
	}
	event := transport.events[0]
	data, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"SECRETCODE", "SECRETSTATE", "SECRETOAUTHCOOKIE", "SECRETSESSIONCOOKIE", "SECRETBEARER", "SECRETHEADER", "SECRETREFERER", "203.0.113.9", "code=", "cookie", "Cookie"} {
		if strings.Contains(string(data), secret) {
			t.Errorf("the event holds %q: %s", secret, data)
		}
	}
	if event.Request == nil || event.Request.Method != http.MethodGet || event.Request.URL != "/api/auth/callback/github" ||
		event.Request.QueryString != "" || event.Request.Cookies != "" || len(event.Request.Headers) != 0 || event.Request.Data != "" {
		t.Errorf("request = %+v", event.Request)
	}
	if event.Tags["operation"] != "auth.callback" {
		t.Errorf("tags = %v", event.Tags)
	}
	if event.Environment != "test" {
		t.Errorf("environment = %q", event.Environment)
	}
	if len(event.Exception) == 0 || event.Exception[0].Value != "GitHub refused the code" {
		t.Errorf("exception = %+v", event.Exception)
	}
	if len(transport.flushes) != 1 || transport.flushes[0] != 2*time.Second {
		t.Errorf("flushes = %v, want one of 2s", transport.flushes)
	}
}

// Each report has its own scope: a tag or request of one does not leak into the next.
func TestReporterReportsAreIndependent(t *testing.T) {
	report, transport := testReporter(t)
	report(httptest.NewRequest(http.MethodGet, "/api/workspace", nil), errors.New("one"), "workspace.read")
	report(httptest.NewRequest(http.MethodPut, "/api/workspace", nil), errors.New("two"), "workspace.write")
	if len(transport.events) != 2 {
		t.Fatalf("%d events", len(transport.events))
	}
	if transport.events[0].Tags["operation"] != "workspace.read" || transport.events[1].Tags["operation"] != "workspace.write" ||
		transport.events[1].Request.Method != http.MethodPut {
		t.Errorf("events = %+v / %+v", transport.events[0], transport.events[1])
	}
}

func TestNewReporterWithoutDSNOnlyLogs(t *testing.T) {
	report := NewReporter(env(nil))
	report(httptest.NewRequest(http.MethodGet, "/api/workspace?x=1", nil), errors.New("down"), "workspace.read")
	// An unusable DSN does not stop the backend either.
	report = NewReporter(env(map[string]string{"SENTRY_DSN": "not a dsn"}))
	report(httptest.NewRequest(http.MethodGet, "/api/workspace", nil), errors.New("down"), "workspace.read")
}
