package web

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// fakeGallery stands in for the gallery of the database.
type fakeGallery struct {
	fakeStore
	page       *store.GalleryPage
	categories []store.GalleryCategory
	query      store.GalleryQuery
	added      []string
	reported   [][2]string
	found      bool
	// hits counts CountGalleryHit calls by "action/client"; counted lists the actions; hitErr makes counting fail.
	hits    map[string]int
	counted []string
	hitErr  error
}

// CountGalleryHit counts like the database does, in a window that ends at the next minute.
func (f *fakeGallery) CountGalleryHit(_ context.Context, action string, client []byte) (int, time.Time, error) {
	if f.hitErr != nil {
		return 0, time.Time{}, f.hitErr
	}
	if f.hits == nil {
		f.hits = map[string]int{}
	}
	f.counted = append(f.counted, action)
	f.hits[action+"/"+string(client)]++
	return f.hits[action+"/"+string(client)], time.Now().Truncate(time.Minute).Add(time.Minute), nil
}

func (f *fakeGallery) Gallery(_ context.Context, q store.GalleryQuery) (*store.GalleryPage, error) {
	f.query = q
	if f.err != nil {
		return nil, f.err
	}
	if f.page == nil {
		return &store.GalleryPage{}, nil
	}
	return f.page, nil
}

func (f *fakeGallery) GalleryCategories(context.Context) ([]store.GalleryCategory, error) {
	return f.categories, f.err
}

func (f *fakeGallery) CountAdded(_ context.Context, id string) error {
	f.added = append(f.added, id)
	return f.err
}

func (f *fakeGallery) Report(_ context.Context, id, reason string) (bool, error) {
	f.reported = append(f.reported, [2]string{id, reason})
	return f.found, f.err
}

func expectGalleryHeaders(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	header := response.Header()
	if header.Get("X-Robots-Tag") != "noindex" || header.Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", header)
	}
	checkSecurityHeaders(t, "gallery", header)
}

func TestGalleryQuery(t *testing.T) {
	fake := &fakeGallery{}
	for name, handler := range map[string]http.Handler{"New": newHarness(t, fake, testBase).handler, "Public": Public(fake, nil)} {
		response := getShared(t, handler, http.MethodGet, "/api/gallery?q=%20abc%20&category=%E8%AA%9E%E5%AD%A6&sort=popular&page=2")
		if response.Code != http.StatusOK {
			t.Fatalf("%s: response = %d %s", name, response.Code, response.Body)
		}
		if want := (store.GalleryQuery{Text: "abc", Category: "語学", Sort: store.GalleryPopular, Page: 2}); fake.query != want {
			t.Fatalf("%s: query = %+v; want %+v", name, fake.query, want)
		}
		getShared(t, handler, http.MethodGet, "/api/gallery")
		if want := (store.GalleryQuery{Sort: store.GalleryNew, Page: 1}); fake.query != want {
			t.Fatalf("%s: default query = %+v; want %+v", name, fake.query, want)
		}
		getShared(t, handler, http.MethodGet, "/api/gallery?q="+strings.Repeat("%E3%81%82", 201))
		if fake.query.Text != strings.Repeat("あ", store.MaxGalleryQuery) {
			t.Fatalf("%s: text has %d runes", name, len([]rune(fake.query.Text)))
		}
	}
}

func TestGalleryInvalid(t *testing.T) {
	fake := &fakeGallery{}
	h := newHarness(t, fake, testBase)
	for _, query := range []string{"sort=old", "page=0", "page=abc", "page=10001", "page=-1", "q=%FF", "q=a%00b", "category=%C3", "category=a%00b"} {
		fake.query = store.GalleryQuery{Text: "untouched"}
		response := getShared(t, h.handler, http.MethodGet, "/api/gallery?"+query)
		if response.Code != http.StatusBadRequest || strings.TrimSpace(response.Body.String()) != `{"error":"invalidQuery"}` {
			t.Fatalf("%s: response = %d %s", query, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
		if fake.query.Text != "untouched" {
			t.Fatalf("%s: the store was called with %+v", query, fake.query)
		}
	}
	if page := getShared(t, h.handler, http.MethodGet, "/api/gallery?page=10000"); page.Code != http.StatusOK {
		t.Fatalf("page 10000 = %d", page.Code)
	}
}

func TestGalleryAnswer(t *testing.T) {
	updated := time.Date(2026, 11, 2, 9, 30, 15, 123_000_000, time.FixedZone("JST", 9*3600))
	fake := &fakeGallery{page: &store.GalleryPage{More: true, Packs: []store.GalleryPack{
		{ID: "a", Name: "Full", Description: "d", Category: "c", Tags: []string{"x", "y"}, Lists: 2, Words: 30, Added: 4, UpdatedAt: updated},
		{ID: "b", Name: "Bare", UpdatedAt: updated},
	}}}
	h := newHarness(t, fake, testBase)
	response := getShared(t, h.handler, http.MethodGet, "/api/gallery")
	want := `{"packs":[{"id":"a","name":"Full","description":"d","category":"c","tags":["x","y"],"lists":2,"words":30,"added":4,"updatedAt":"2026-11-02T00:30:15.123Z"},` +
		`{"id":"b","name":"Bare","lists":0,"words":0,"added":0,"updatedAt":"2026-11-02T00:30:15.123Z"}],"more":true}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
		t.Fatalf("response = %d %s; want %s", response.Code, response.Body, want)
	}
	if response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("headers = %v", response.Header())
	}
	expectGalleryHeaders(t, response)

	fake.page = nil
	empty := getShared(t, h.handler, http.MethodGet, "/api/gallery")
	if strings.TrimSpace(empty.Body.String()) != `{"packs":[],"more":false}` {
		t.Fatalf("empty = %s", empty.Body)
	}
	expectGalleryHeaders(t, empty)
}

func TestGalleryDown(t *testing.T) {
	fake := &fakeGallery{fakeStore: fakeStore{err: errors.New("down")}}
	h := newHarness(t, fake, testBase)
	for _, target := range []string{"/api/gallery", "/api/gallery/categories"} {
		response := getShared(t, h.handler, http.MethodGet, target)
		if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
			t.Fatalf("%s: response = %d %s", target, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
	}
	post := h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "")
	if post.Code != http.StatusServiceUnavailable {
		t.Fatalf("added = %d %s", post.Code, post.Body)
	}
	expectGalleryHeaders(t, post)
	if len(h.reports) != 3 || h.reports[0] != "gallery.read" || h.reports[1] != "gallery.categories" || h.reports[2] != "gallery.added" {
		t.Fatalf("reports = %v", h.reports)
	}
}

func TestGalleryCategories(t *testing.T) {
	fake := &fakeGallery{}
	for name, handler := range map[string]http.Handler{"New": newHarness(t, fake, testBase).handler, "Public": Public(fake, nil)} {
		response := getShared(t, handler, http.MethodGet, "/api/gallery/categories")
		if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != `{"categories":[]}` {
			t.Fatalf("%s: response = %d %s", name, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
	}
	fake.categories = []store.GalleryCategory{{Name: "語学", Count: 3}, {Name: "IT", Count: 1}}
	response := getShared(t, newHarness(t, fake, testBase).handler, http.MethodGet, "/api/gallery/categories")
	if strings.TrimSpace(response.Body.String()) != `{"categories":[{"name":"語学","count":3},{"name":"IT","count":1}]}` {
		t.Fatalf("body = %s", response.Body)
	}
}

func TestGalleryAdded(t *testing.T) {
	fake := &fakeGallery{}
	h := newHarness(t, fake, testBase)
	response := h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "")
	if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	expectGalleryHeaders(t, response)
	if len(fake.added) != 1 || fake.added[0] != aSharedID {
		t.Fatalf("added = %v", fake.added)
	}

	other := h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "", func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") })
	if other.Code != http.StatusForbidden || strings.TrimSpace(other.Body.String()) != `{"error":"forbiddenRequest"}` {
		t.Fatalf("other origin = %d %s", other.Code, other.Body)
	}
	expectGalleryHeaders(t, other)
	none := h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "", func(r *http.Request) { r.Header.Del("Origin") })
	if none.Code != http.StatusForbidden {
		t.Fatalf("no origin = %d", none.Code)
	}
	app := h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "", func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer x")
	})
	if app.Code != http.StatusNoContent {
		t.Fatalf("app = %d", app.Code)
	}
	if len(fake.added) != 2 {
		t.Fatalf("added = %v", fake.added)
	}

	get := h.shareRequest(http.MethodGet, "/api/gallery/added?id="+aSharedID, "", "")
	if get.Code != http.StatusMethodNotAllowed || get.Header().Get("Allow") != "POST" {
		t.Fatalf("GET = %d %v", get.Code, get.Header())
	}
	expectGalleryHeaders(t, get)
	if len(fake.added) != 2 {
		t.Fatalf("added = %v", fake.added)
	}
}

func TestGalleryMethod(t *testing.T) {
	h := newHarness(t, &fakeGallery{}, testBase)
	for _, target := range []string{"/api/gallery", "/api/gallery/categories"} {
		for name, handler := range map[string]http.Handler{"New": h.handler, "Public": Public(&fakeGallery{}, nil)} {
			response := getShared(t, handler, http.MethodPost, target)
			if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD" {
				t.Fatalf("%s %s: response = %d %v", name, target, response.Code, response.Header())
			}
			expectGalleryHeaders(t, response)
		}
	}
}

func TestGalleryReport(t *testing.T) {
	fake := &fakeGallery{found: true}
	h := newHarness(t, fake, testBase)
	post := func(body string, change ...func(*http.Request)) *httptest.ResponseRecorder {
		return h.shareRequest(http.MethodPost, "/api/gallery/reports", body, "", change...)
	}
	good := `{"id":"` + aSharedID + `","reason":"spam"}`
	response := post(good)
	if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	expectGalleryHeaders(t, response)
	if len(fake.reported) != 1 || fake.reported[0] != [2]string{aSharedID, "spam"} {
		t.Fatalf("reported = %v", fake.reported)
	}

	for name, body := range map[string]string{
		"bad reason": `{"id":"` + aSharedID + `","reason":"bad"}`, "no reason": `{"id":"` + aSharedID + `"}`,
		"no id": `{"reason":"spam"}`, "empty id": `{"id":"","reason":"spam"}`, "null reason": `{"id":"` + aSharedID + `","reason":null}`,
		"extra member": `{"id":"` + aSharedID + `","reason":"spam","x":1}`, "not an object": `[]`, "not json": `x`,
		"number id": `{"id":1,"reason":"spam"}`,
	} {
		response := post(body)
		if response.Code != http.StatusBadRequest || strings.TrimSpace(response.Body.String()) != `{"error":"invalidReport"}` {
			t.Fatalf("%s = %d %s", name, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
	}
	if empty := h.shareRequest(http.MethodPost, "/api/gallery/reports", "", ""); empty.Code != http.StatusForbidden {
		t.Fatalf("no body, no content type = %d", empty.Code)
	}
	if len(fake.reported) != 1 {
		t.Fatalf("reported = %v", fake.reported)
	}

	for name, change := range map[string]func(*http.Request){
		"other origin": withOrigin("https://evil.example"),
		"no origin":    func(r *http.Request) { r.Header.Del("Origin") },
		"text/plain":   func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") },
	} {
		response := post(good, change)
		if response.Code != http.StatusForbidden || strings.TrimSpace(response.Body.String()) != `{"error":"forbiddenRequest"}` {
			t.Fatalf("%s = %d %s", name, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
	}
	app := post(good, func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer x")
	})
	if app.Code != http.StatusNoContent {
		t.Fatalf("app = %d", app.Code)
	}
	if len(fake.reported) != 2 {
		t.Fatalf("reported = %v", fake.reported)
	}

	fake.found = false
	missing := post(good)
	if missing.Code != http.StatusNotFound || strings.TrimSpace(missing.Body.String()) != `{"error":"notInGallery"}` {
		t.Fatalf("not listed = %d %s", missing.Code, missing.Body)
	}
	expectGalleryHeaders(t, missing)

	fake.err = errors.New("down")
	down := post(good)
	if down.Code != http.StatusServiceUnavailable || strings.TrimSpace(down.Body.String()) != `{"error":"databaseUnavailable"}` {
		t.Fatalf("down = %d %s", down.Code, down.Body)
	}
	expectGalleryHeaders(t, down)

	get := h.shareRequest(http.MethodGet, "/api/gallery/reports", "", "")
	if get.Code != http.StatusMethodNotAllowed || get.Header().Get("Allow") != "POST" {
		t.Fatalf("GET = %d %v", get.Code, get.Header())
	}
	expectGalleryHeaders(t, get)
}

func tooMany(t *testing.T, name string, response *httptest.ResponseRecorder) {
	t.Helper()
	if response.Code != http.StatusTooManyRequests || strings.TrimSpace(response.Body.String()) != `{"error":"tooManyRequests"}` {
		t.Fatalf("%s = %d %s", name, response.Code, response.Body)
	}
	seconds, err := strconv.Atoi(response.Header().Get("Retry-After"))
	if err != nil || seconds < 1 || seconds > 60 {
		t.Fatalf("%s: Retry-After = %q", name, response.Header().Get("Retry-After"))
	}
	expectGalleryHeaders(t, response)
}

func TestGalleryReportLimit(t *testing.T) {
	fake := &fakeGallery{found: true}
	h := newHarness(t, fake, testBase)
	good := `{"id":"` + aSharedID + `","reason":"spam"}`
	post := func(body string, change ...func(*http.Request)) *httptest.ResponseRecorder {
		return h.shareRequest(http.MethodPost, "/api/gallery/reports", body, "", change...)
	}
	// Requests that are refused before counting do not use the allowance.
	for i := 0; i < 20; i++ {
		post(`{"id":"` + aSharedID + `","reason":"bad"}`)
		post(good, withOrigin("https://evil.example"))
		h.shareRequest(http.MethodGet, "/api/gallery/reports", "", "")
	}
	if len(fake.counted) != 0 {
		t.Fatalf("refused requests were counted: %v", fake.counted)
	}
	for i := 1; i <= 10; i++ {
		if response := post(good); response.Code != http.StatusNoContent {
			t.Fatalf("report %d = %d %s", i, response.Code, response.Body)
		}
	}
	if len(fake.reported) != 10 {
		t.Fatalf("reported = %d", len(fake.reported))
	}
	tooMany(t, "11th report", post(good))
	if len(fake.reported) != 10 {
		t.Fatalf("the limited report was written: %d", len(fake.reported))
	}
	// A request from the app is limited by its IP, like the others.
	tooMany(t, "app report", post(good, func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer x")
	}))
	// Another IP has its own allowance (here Vercel's forwarding is ignored, so the address is the RemoteAddr).
	if response := post(good, func(r *http.Request) { r.RemoteAddr = "192.0.2.77:1234" }); response.Code != http.StatusNoContent {
		t.Fatalf("another client = %d %s", response.Code, response.Body)
	}
	for _, action := range fake.counted {
		if action != "reports" {
			t.Fatalf("counted action %q", action)
		}
	}
}

func TestGalleryAddedLimit(t *testing.T) {
	fake := &fakeGallery{}
	h := newHarness(t, fake, testBase)
	post := func(change ...func(*http.Request)) *httptest.ResponseRecorder {
		return h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", "", change...)
	}
	for i := 0; i < 20; i++ {
		post(withOrigin("https://evil.example"))
	}
	if len(fake.counted) != 0 {
		t.Fatalf("refused requests were counted: %v", fake.counted)
	}
	for i := 1; i <= 60; i++ {
		if response := post(); response.Code != http.StatusNoContent {
			t.Fatalf("added %d = %d %s", i, response.Code, response.Body)
		}
	}
	tooMany(t, "61st added", post())
	if len(fake.added) != 60 {
		t.Fatalf("added = %d; the limited one was counted", len(fake.added))
	}
	if fake.counted[0] != "added" {
		t.Fatalf("counted action %q", fake.counted[0])
	}
	// The two endpoints have their own allowances.
	reports := &fakeGallery{found: true, hits: fake.hits}
	if response := newHarness(t, reports, testBase).shareRequest(http.MethodPost, "/api/gallery/reports", `{"id":"`+aSharedID+`","reason":"spam"}`, ""); response.Code != http.StatusNoContent {
		t.Fatalf("report after added = %d", response.Code)
	}
}

func TestGalleryLimitDown(t *testing.T) {
	fake := &fakeGallery{found: true, hitErr: errors.New("down")}
	h := newHarness(t, fake, testBase)
	for name, response := range map[string]*httptest.ResponseRecorder{
		"added":  h.shareRequest(http.MethodPost, "/api/gallery/added?id="+aSharedID, "", ""),
		"report": h.shareRequest(http.MethodPost, "/api/gallery/reports", `{"id":"`+aSharedID+`","reason":"spam"}`, ""),
	} {
		if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
			t.Fatalf("%s = %d %s", name, response.Code, response.Body)
		}
		expectGalleryHeaders(t, response)
	}
	if len(fake.added) != 0 || len(fake.reported) != 0 {
		t.Fatalf("written without counting: %v %v", fake.added, fake.reported)
	}
	if len(h.reports) != 2 || h.reports[0] != "gallery.limit" || h.reports[1] != "gallery.limit" {
		t.Fatalf("reports = %v", h.reports)
	}
}
