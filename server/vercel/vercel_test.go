package vercel

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// reset forgets the built handler, so that each test builds its own from its environment.
func reset() {
	mu.Lock()
	defer mu.Unlock()
	handler = nil
}

func serve(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	return response
}

// Without a database the request fails, and nothing of that failure is kept: once the database is configured, the
// next request is served.
func TestHandlerWithoutDatabaseRetries(t *testing.T) {
	connection := os.Getenv("TYPLE_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TYPLE_TEST_DATABASE_URL to a migrated test database")
	}
	reset()
	t.Cleanup(reset)
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_URL", "")
	response := serve(t)
	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}

	t.Setenv("DATABASE_URL", connection)
	if response := serve(t); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	// The handler built for the first success is kept.
	first := Handler()
	if Handler() != first {
		t.Fatal("the handler was built again")
	}
}

// POSTGRES_URL is used when DATABASE_URL is not set.
func TestHandlerFallsBackToPostgresURL(t *testing.T) {
	connection := os.Getenv("TYPLE_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TYPLE_TEST_DATABASE_URL to a migrated test database")
	}
	reset()
	t.Cleanup(reset)
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_URL", connection)
	if response := serve(t); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

func TestHandlerUnreachableDatabase(t *testing.T) {
	reset()
	t.Cleanup(reset)
	t.Setenv("DATABASE_URL", "postgresql://typle@127.0.0.1:1/typle?connect_timeout=1")
	if response := serve(t); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}
