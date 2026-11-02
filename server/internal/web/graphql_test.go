package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// graphqlAnswer is a GraphQL response: the data, and the errors with the REST path's key and status.
type graphqlAnswer struct {
	Data   map[string]json.RawMessage `json:"data"`
	Errors []struct {
		Message    string `json:"message"`
		Extensions struct {
			Code   string `json:"code"`
			Status int    `json:"status"`
		} `json:"extensions"`
	} `json:"errors"`
}

// graphqlTo is a POST of the query and its variables to /api/graphql through handler, from the app's own origin
// unless the test changes it.
func graphqlTo(t *testing.T, handler http.Handler, query string, variables map[string]any, change ...func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/graphql", strings.NewReader(string(body)))
	r.Header.Set("Origin", testBase)
	r.Header.Set("Content-Type", "application/json")
	for _, f := range change {
		f(r)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, r)
	return response
}

// graphql is graphqlTo signed in as owner, when it is not "".
func (h *harness) graphql(t *testing.T, owner, query string, variables map[string]any, change ...func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	if owner != "" {
		change = append([]func(*http.Request){withCookie(h.cookie(owner, false))}, change...)
	}
	return graphqlTo(t, h.handler, query, variables, change...)
}

func decodeGraphQL(t *testing.T, response *httptest.ResponseRecorder) graphqlAnswer {
	t.Helper()
	if response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	expectPrivate(t, response)
	var answer graphqlAnswer
	if err := json.Unmarshal(response.Body.Bytes(), &answer); err != nil {
		t.Fatalf("body %q: %v", response.Body, err)
	}
	return answer
}

// expectGraphQLError fails unless the response is the one error key with the REST path's status.
func expectGraphQLError(t *testing.T, response *httptest.ResponseRecorder, status int, key string) {
	t.Helper()
	answer := decodeGraphQL(t, response)
	if len(answer.Errors) != 1 || answer.Errors[0].Extensions.Code != key || answer.Errors[0].Extensions.Status != status ||
		answer.Errors[0].Message != key {
		t.Fatalf("response = %s; want %d %s", response.Body, status, key)
	}
}

const workspaceQuery = `{ workspace { lists packs devices interests revision accountId } }`

const saveMutation = `mutation($input: SaveWorkspaceInput!) { saveWorkspace(input: $input) { lists revision accountId } }`

func TestGraphQLRequestChecks(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	r := httptest.NewRequest(http.MethodGet, "/api/graphql?query={workspace{revision}}", nil)
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	expectError(t, response, http.StatusMethodNotAllowed, "methodNotAllowed")
	if response.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("Allow = %q", response.Header().Get("Allow"))
	}
	// A form can post to another site without asking first; JSON cannot.
	expectError(t, h.graphql(t, testOwner, workspaceQuery, nil, func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }),
		http.StatusForbidden, "forbiddenRequest")
	empty := httptest.NewRequest(http.MethodPost, "/api/graphql", nil)
	empty.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	h.handler.ServeHTTP(response, empty)
	expectError(t, response, http.StatusBadRequest, "emptyRequest")
	large := strings.Repeat("a", maxGraphQLBytes)
	expectError(t, h.graphql(t, testOwner, workspaceQuery, map[string]any{"padding": large}), http.StatusRequestEntityTooLarge, "workspaceTooLarge")
	// A query that is not valid is GraphQL's to refuse.
	if response := h.graphql(t, testOwner, `{ workspace { nothing } }`, nil); response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid query = %d %s", response.Code, response.Body)
	}
}

func TestGraphQLWorkspace(t *testing.T) {
	f := &fakeWorkspaces{saved: &store.Saved{Lists: json.RawMessage(`[` + oneList + `]`), Devices: json.RawMessage(`[]`), Revision: 7}}
	h := newHarness(t, f, testBase)
	expectGraphQLError(t, h.graphql(t, "", workspaceQuery, nil), http.StatusUnauthorized, "loginRequired")

	answer := decodeGraphQL(t, h.graphql(t, testOwner, workspaceQuery, nil))
	var got struct {
		Lists     json.RawMessage `json:"lists"`
		Packs     json.RawMessage `json:"packs"`
		Interests []string        `json:"interests"`
		Revision  int             `json:"revision"`
		AccountID string          `json:"accountId"`
	}
	if err := json.Unmarshal(answer.Data["workspace"], &got); err != nil {
		t.Fatal(err)
	}
	// The lists are answered as stored, and the interests as the app reads none.
	if string(got.Lists) != `[`+oneList+`]` || string(got.Packs) != "null" || got.Revision != 7 || got.AccountID != testOwner ||
		len(got.Interests) != len(workspace.DefaultInterests) {
		t.Fatalf("workspace = %s", answer.Data["workspace"])
	}

	// An account that has saved nothing has no lists.
	f.saved = nil
	answer = decodeGraphQL(t, h.graphql(t, testOwner, workspaceQuery, nil))
	if !strings.Contains(string(answer.Data["workspace"]), `"lists":[]`) {
		t.Fatalf("empty workspace = %s", answer.Data["workspace"])
	}

	f.err = errors.New("down")
	expectGraphQLError(t, h.graphql(t, testOwner, workspaceQuery, nil), http.StatusServiceUnavailable, "databaseUnavailable")
	if strings.Join(h.reports, ",") != "workspace.read" {
		t.Fatalf("reports = %v", h.reports)
	}
}

func TestGraphQLWorkspaceWithAppToken(t *testing.T) {
	f := &fakeWorkspaces{saved: &store.Saved{Lists: json.RawMessage(`[]`), Devices: json.RawMessage(`[]`), Revision: 1}}
	h := newHarness(t, f, testBase)
	token := h.keys.SealApp(session.New(testOwner, "", "", time.Now()))
	answer := decodeGraphQL(t, h.graphql(t, "", workspaceQuery, nil, bearer(token)))
	if !strings.Contains(string(answer.Data["workspace"]), `"accountId":"`+testOwner+`"`) {
		t.Fatalf("workspace = %s", answer.Data["workspace"])
	}
	// The token is judged alone: a refused one is not made good by a cookie.
	expectGraphQLError(t, h.graphql(t, testOwner, workspaceQuery, nil, bearer("nonsense")), http.StatusUnauthorized, "loginRequired")
	// An app has no Origin, and needs none to save.
	input := map[string]any{"accountId": testOwner, "revision": 1, "lists": json.RawMessage(`[` + oneList + `]`)}
	answer = decodeGraphQL(t, h.graphql(t, "", saveMutation, map[string]any{"input": input}, bearer(token), withOrigin("")))
	if len(answer.Errors) != 0 || f.writes != 1 {
		t.Fatalf("save = %+v (%d writes)", answer, f.writes)
	}
}

func TestGraphQLSaveWorkspace(t *testing.T) {
	f := &fakeWorkspaces{}
	h := newHarness(t, f, testBase)
	input := map[string]any{"accountId": testOwner, "revision": 3, "lists": json.RawMessage(`[` + oneList + `]`)}
	answer := decodeGraphQL(t, h.graphql(t, testOwner, saveMutation, map[string]any{"input": input}))
	var saved struct {
		Lists    []map[string]any `json:"lists"`
		Revision int              `json:"revision"`
	}
	if err := json.Unmarshal(answer.Data["saveWorkspace"], &saved); err != nil {
		t.Fatalf("answer %s: %v", answer.Data, err)
	}
	if f.revision != 3 || saved.Revision != 4 || len(saved.Lists) != 1 || saved.Lists[0]["id"] != "one" {
		t.Fatalf("saved = %+v (revision %d)", saved, f.revision)
	}
	// The parts left out stay as saved, as when PUT leaves them out.
	if !f.change.HasLists || !f.change.HasPacks || f.change.HasDevices || f.change.HasInterests {
		t.Fatalf("change = %+v", f.change)
	}
	interests := map[string]any{"accountId": testOwner, "revision": 4, "interests": []string{}}
	if answer := decodeGraphQL(t, h.graphql(t, testOwner, saveMutation, map[string]any{"input": interests})); len(answer.Errors) != 0 ||
		f.change.HasLists || !f.change.HasInterests {
		t.Fatalf("interests = %+v, change = %+v", answer, f.change)
	}
}

func TestGraphQLSaveWorkspaceRefused(t *testing.T) {
	f := &fakeWorkspaces{}
	h := newHarness(t, f, testBase)
	save := func(input map[string]any, change ...func(*http.Request)) *httptest.ResponseRecorder {
		return h.graphql(t, testOwner, saveMutation, map[string]any{"input": input}, change...)
	}
	valid := func() map[string]any {
		return map[string]any{"accountId": testOwner, "revision": 1, "lists": json.RawMessage(`[` + oneList + `]`)}
	}
	// Another site's page may not save with the browser's cookie.
	expectGraphQLError(t, save(valid(), withOrigin("https://evil.example")), http.StatusForbidden, "forbiddenRequest")
	expectGraphQLError(t, save(valid(), withOrigin("")), http.StatusForbidden, "forbiddenRequest")
	expectGraphQLError(t, h.graphql(t, "", saveMutation, map[string]any{"input": valid()}), http.StatusUnauthorized, "loginRequired")
	other := valid()
	other["accountId"] = "github:1"
	expectGraphQLError(t, save(other), http.StatusUnauthorized, "loginAccountChanged")
	// null is not a part left out: PUT refuses it too.
	null := valid()
	null["lists"] = nil
	expectGraphQLError(t, save(null), http.StatusBadRequest, "invalidWorkspace")
	negative := valid()
	negative["revision"] = -1
	expectGraphQLError(t, save(negative), http.StatusBadRequest, "invalidWorkspace")
	broken := valid()
	broken["lists"] = json.RawMessage(`[{"id":"one"}]`)
	expectGraphQLError(t, save(broken), http.StatusBadRequest, "invalidWorkspace")
	if f.writes != 0 {
		t.Fatalf("%d refused saves reached the store", f.writes)
	}

	f.err = store.ErrConflict
	expectGraphQLError(t, save(valid()), http.StatusConflict, "conflict")
	f.err = errors.New("down")
	expectGraphQLError(t, save(valid()), http.StatusServiceUnavailable, "workspaceSaveFailed")
	if strings.Join(h.reports, ",") != "workspace.write" {
		t.Fatalf("reports = %v", h.reports)
	}
}

const addRecordMutation = `mutation($input: AddRecordInput!) { addRecord(input: $input) { added record workspace { lists revision } } }`

const deleteRecordMutation = `mutation($input: DeleteRecordInput!) { deleteRecord(input: $input) { lists revision } }`

func TestGraphQLRecords(t *testing.T) {
	memory := newMemoryWorkspace(t, `[`+oneList+`]`)
	h := newHarness(t, memory, testBase)
	add := func(listID string, record json.RawMessage) *httptest.ResponseRecorder {
		input := map[string]any{"accountId": testOwner, "listId": listID, "record": record}
		return h.graphql(t, testOwner, addRecordMutation, map[string]any{"input": input})
	}
	answer := decodeGraphQL(t, add("one", json.RawMessage(aRun)))
	var added struct {
		Added     bool             `json:"added"`
		Record    workspace.Record `json:"record"`
		Workspace struct {
			Revision int `json:"revision"`
		} `json:"workspace"`
	}
	if err := json.Unmarshal(answer.Data["addRecord"], &added); err != nil {
		t.Fatalf("answer %s: %v", answer.Data, err)
	}
	if !added.Added || added.Record.Device == nil || added.Record.Device.Name != "MacBook" || added.Workspace.Revision != 2 {
		t.Fatalf("added = %s", answer.Data["addRecord"])
	}
	// Sent again, as a retry after a lost answer: the saved run, and nothing is saved.
	answer = decodeGraphQL(t, add("one", json.RawMessage(aRun)))
	if !strings.Contains(string(answer.Data["addRecord"]), `"added":false`) || memory.revision != 2 {
		t.Fatalf("again = %s", answer.Data["addRecord"])
	}
	expectGraphQLError(t, add("gone", json.RawMessage(aRun)), http.StatusNotFound, "recordListDeleted")
	expectGraphQLError(t, add("one", json.RawMessage(`{"time":1}`)), http.StatusBadRequest, "invalidRecord")
	expectGraphQLError(t, add("", json.RawMessage(aRun)), http.StatusBadRequest, "invalidRecord")

	remove := func(listID, recordID string) *httptest.ResponseRecorder {
		input := map[string]any{"accountId": testOwner, "listId": listID, "recordId": recordID}
		return h.graphql(t, testOwner, deleteRecordMutation, map[string]any{"input": input})
	}
	answer = decodeGraphQL(t, remove("one", "run-1"))
	if len(answer.Errors) != 0 || memory.revision != 3 || len(memory.w.Lists[0].Records) != 0 {
		t.Fatalf("deleted = %s", answer.Data)
	}
	// Already gone is what was asked for.
	if answer := decodeGraphQL(t, remove("one", "run-1")); len(answer.Errors) != 0 || memory.revision != 3 {
		t.Fatalf("again = %+v", answer)
	}
	expectGraphQLError(t, h.graphql(t, testOwner, deleteRecordMutation, map[string]any{"input": map[string]any{
		"accountId": "github:1", "listId": "one", "recordId": "run-1"}}), http.StatusUnauthorized, "loginAccountChanged")
}

func TestGraphQLShares(t *testing.T) {
	at := time.Date(2026, 10, 1, 2, 3, 4, 5000000, time.UTC)
	f := &fakeShares{shares: []store.Share{{ID: "s1", PackID: "p1", Name: "Go", UpdatedAt: at}}, put: &store.Share{ID: "s2", PackID: "p2", UpdatedAt: at}}
	h := newHarness(t, f, testBase)
	answer := decodeGraphQL(t, h.graphql(t, testOwner, `{ shares { id packId name updatedAt } }`, nil))
	if string(answer.Data["shares"]) != `[{"id":"s1","packId":"p1","name":"Go","updatedAt":"2026-10-01T02:03:04.005Z"}]` || f.owner != testOwner {
		t.Fatalf("shares = %s", answer.Data["shares"])
	}
	answer = decodeGraphQL(t, h.graphql(t, testOwner, `mutation { sharePack(packId: "p2") { id packId name } }`, nil))
	if string(answer.Data["sharePack"]) != `{"id":"s2","packId":"p2","name":""}` || f.packID != "p2" {
		t.Fatalf("share = %s", answer.Data["sharePack"])
	}
	expectGraphQLError(t, h.graphql(t, testOwner, `mutation { sharePack(packId: "") { id } }`, nil), http.StatusBadRequest, "invalidWorkspace")
	f.putErr = &workspace.Error{Key: "packNotFound"}
	expectGraphQLError(t, h.graphql(t, testOwner, `mutation { sharePack(packId: "p9") { id } }`, nil), http.StatusNotFound, "packNotFound")
	answer = decodeGraphQL(t, h.graphql(t, testOwner, `mutation { stopSharing(packId: "p1") }`, nil))
	if string(answer.Data["stopSharing"]) != "true" || f.packID != "p1" || f.calls[len(f.calls)-1] != "delete" {
		t.Fatalf("stop = %s %v", answer.Data, f.calls)
	}
	expectGraphQLError(t, h.graphql(t, testOwner, `mutation { stopSharing(packId: "p1") }`, nil, withOrigin("https://evil.example")),
		http.StatusForbidden, "forbiddenRequest")
	expectGraphQLError(t, h.graphql(t, "", `{ shares { id } }`, nil), http.StatusUnauthorized, "loginRequired")
}

func TestGraphQLSharedPack(t *testing.T) {
	f := &fakeShares{shared: json.RawMessage(`{"format":"typle-pack","pack":{"name":"Go"},"extra":[1,2.50]}`)}
	h := newHarness(t, f, testBase)
	// Anyone with the link may read it, signed in or not, and it is answered as stored.
	answer := decodeGraphQL(t, h.graphql(t, "", `query($id: String!) { sharedPack(id: $id) }`, map[string]any{"id": "s1"}))
	if string(answer.Data["sharedPack"]) != string(f.shared) || f.sharedID != "s1" {
		t.Fatalf("shared = %s", answer.Data["sharedPack"])
	}
	f.shared = nil
	if answer := decodeGraphQL(t, h.graphql(t, "", `{ sharedPack(id: "gone") }`, nil)); string(answer.Data["sharedPack"]) != "null" || len(answer.Errors) != 0 {
		t.Fatalf("gone = %+v", answer)
	}
	f.err = errors.New("down")
	expectGraphQLError(t, h.graphql(t, "", `{ sharedPack(id: "s1") }`, nil), http.StatusServiceUnavailable, "databaseUnavailable")
}

func TestGraphQLAdmin(t *testing.T) {
	u := &usersStore{adminStore: adminStore{allowed: true, overview: &store.AdminOverview{Workspaces: 3,
		RecentShares: []store.AdminShare{}, Admins: []store.AdminAccount{}}}, page: -1, users: &store.AdminUsers{Total: 51,
		Users: []store.AdminUser{{OwnerID: "github:42", Lists: 3, UpdatedAt: time.Unix(1700000000, 0).UTC()}}}}
	lh := newLoginHarness(t, testBase, false)
	h := newHarness(t, u, testBase)
	h.keys = lh.keys
	h.handler = New(Config{Store: u, Keys: lh.keys, BaseURL: testBaseURL(t), Now: func() time.Time { return lh.now },
		Report: func(_ *http.Request, _ error, operation string) { h.reports = append(h.reports, operation) }})
	admin := withCookie(lh.adminCookie("admin@example.com", "cadmin"))

	answer := decodeGraphQL(t, h.graphql(t, "", `{ adminDashboard { admin { email sub } overview { workspaces recentShares { id } } } }`, nil, admin))
	if string(answer.Data["adminDashboard"]) != `{"admin":{"email":"admin@example.com","sub":"cadmin"},"overview":{"workspaces":3,"recentShares":[]}}` {
		t.Fatalf("dashboard = %s", answer.Data["adminDashboard"])
	}
	answer = decodeGraphQL(t, h.graphql(t, "", `{ adminUsers(page: 1) { page pageSize total users { ownerId lists updatedAt } } }`, nil, admin))
	if string(answer.Data["adminUsers"]) != `{"page":1,"pageSize":50,"total":51,"users":[{"ownerId":"github:42","lists":3,"updatedAt":"2023-11-14T22:13:20Z"}]}` || u.page != 1 {
		t.Fatalf("users = %s", answer.Data["adminUsers"])
	}
	if decodeGraphQL(t, h.graphql(t, "", `{ adminUsers { page } }`, nil, admin)); u.page != 0 {
		t.Fatalf("no page asked for page %d", u.page)
	}
	for _, page := range []string{"-1", "10001"} {
		u.page = -1
		expectGraphQLError(t, h.graphql(t, "", `{ adminUsers(page: `+page+`) { page } }`, nil, admin), http.StatusBadRequest, "invalidPage")
		if u.page != -1 {
			t.Fatalf("page %s reached the database", page)
		}
	}
	expectGraphQLError(t, h.graphql(t, "", `{ adminDashboard { admin { email } } }`, nil), http.StatusUnauthorized, "adminRequired")
	// A signed-in user of the app is no administrator.
	expectGraphQLError(t, h.graphql(t, testOwner, `{ adminUsers { page } }`, nil), http.StatusUnauthorized, "adminRequired")
	u.allowed = false
	response := h.graphql(t, "", `{ adminDashboard { admin { email } } }`, nil, admin)
	expectGraphQLError(t, response, http.StatusForbidden, "adminForbidden")
	if c := findCookie(response, session.AdminCookieName(false)); c == nil || c.MaxAge >= 0 {
		t.Fatalf("the administrator's cookie was not removed: %v", response.Result().Cookies())
	}
}

func testBaseURL(t *testing.T) *url.URL {
	t.Helper()
	parsed, err := url.Parse(testBase)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func TestGraphQLSharePackListed(t *testing.T) {
	f := &fakeShares{put: &store.Share{ID: "s1", PackID: "p1", Listed: true, UpdatedAt: time.Unix(0, 0)}}
	h := newHarness(t, f, testBase)
	share := `mutation($listed: Boolean) { sharePack(packId: "p1", listed: $listed) { listed hidden } }`
	for _, listed := range []bool{true, false} {
		answer := decodeGraphQL(t, h.graphql(t, testOwner, share, map[string]any{"listed": listed}))
		if string(answer.Data["sharePack"]) != `{"listed":true,"hidden":false}` || f.listed == nil || *f.listed != listed {
			t.Fatalf("listed %v = %s, store got %v", listed, answer.Data["sharePack"], f.listed)
		}
	}
	// Left out or null, the listing stays as it is.
	for _, variables := range []map[string]any{nil, {"listed": nil}} {
		if decodeGraphQL(t, h.graphql(t, testOwner, share, variables)); f.listed != nil {
			t.Fatalf("%v sent listed %v", variables, *f.listed)
		}
	}
	f.putErr = &workspace.Error{Key: "sharedPackHidden"}
	expectGraphQLError(t, h.graphql(t, testOwner, share, nil), http.StatusConflict, "sharedPackHidden")
}

const gallerySearch = `query($q: String!, $category: String!, $sort: GallerySort!, $page: Int!) {
  gallery(q: $q, category: $category, sort: $sort, page: $page) { more packs { id name description category tags lists words added updatedAt } }
}`

func TestGraphQLGallery(t *testing.T) {
	at := time.Date(2026, 11, 1, 2, 3, 4, 0, time.UTC)
	fake := &fakeGallery{page: &store.GalleryPage{More: true, Packs: []store.GalleryPack{
		{ID: aSharedID, Name: "Go", Description: "basics", Category: "Code", Tags: []string{"go"}, Lists: 2, Words: 30, Added: 4, UpdatedAt: at},
		{ID: "other", Name: "Bare", Lists: 1, Words: 3, UpdatedAt: at},
	}}, categories: []store.GalleryCategory{{Name: "Code", Count: 2}}}
	h := newHarness(t, fake, testBase)
	search := map[string]any{"q": "  go  ", "category": "Code", "sort": "POPULAR", "page": 2}
	// Anyone may read the gallery, signed in or not.
	answer := decodeGraphQL(t, h.graphql(t, "", gallerySearch, search))
	want := `{"more":true,"packs":[{"id":"` + aSharedID + `","name":"Go","description":"basics","category":"Code","tags":["go"],` +
		`"lists":2,"words":30,"added":4,"updatedAt":"2026-11-01T02:03:04Z"},` +
		`{"id":"other","name":"Bare","description":null,"category":null,"tags":[],"lists":1,"words":3,"added":0,"updatedAt":"2026-11-01T02:03:04Z"}]}`
	if string(answer.Data["gallery"]) != want {
		t.Fatalf("gallery = %s", answer.Data["gallery"])
	}
	if fake.query != (store.GalleryQuery{Text: "go", Category: "Code", Sort: store.GalleryPopular, Page: 2}) {
		t.Fatalf("query = %+v", fake.query)
	}
	if decodeGraphQL(t, h.graphql(t, "", `{ gallery { more } }`, nil)); fake.query != (store.GalleryQuery{Sort: store.GalleryNew, Page: 1}) {
		t.Fatalf("defaults = %+v", fake.query)
	}
	for _, page := range []int{0, maxGalleryPage + 1} {
		search["page"] = page
		expectGraphQLError(t, h.graphql(t, "", gallerySearch, search), http.StatusBadRequest, "invalidQuery")
	}
	search["page"], search["q"] = 1, "a\x00b"
	expectGraphQLError(t, h.graphql(t, "", gallerySearch, search), http.StatusBadRequest, "invalidQuery")

	answer = decodeGraphQL(t, h.graphql(t, "", `{ galleryCategories { name count } }`, nil))
	if string(answer.Data["galleryCategories"]) != `[{"name":"Code","count":2}]` {
		t.Fatalf("categories = %s", answer.Data["galleryCategories"])
	}
	fake.categories = nil
	if answer := decodeGraphQL(t, h.graphql(t, "", `{ galleryCategories { name } }`, nil)); string(answer.Data["galleryCategories"]) != `[]` {
		t.Fatalf("no categories = %s", answer.Data["galleryCategories"])
	}
	fake.err = errors.New("down")
	expectGraphQLError(t, h.graphql(t, "", `{ gallery { more } }`, nil), http.StatusServiceUnavailable, "databaseUnavailable")
}

func TestGraphQLGalleryWrites(t *testing.T) {
	fake := &fakeGallery{found: true}
	h := newHarness(t, fake, testBase)
	added := `mutation($id: String!) { countAdded(id: $id) }`
	report := `mutation($id: String!, $reason: String!) { reportPack(id: $id, reason: $reason) }`
	// No login is needed, only the app's own Origin.
	if answer := decodeGraphQL(t, h.graphql(t, "", added, map[string]any{"id": aSharedID})); string(answer.Data["countAdded"]) != "true" ||
		len(fake.added) != 1 || fake.added[0] != aSharedID {
		t.Fatalf("added = %+v %v", answer, fake.added)
	}
	if answer := decodeGraphQL(t, h.graphql(t, "", report, map[string]any{"id": aSharedID, "reason": "spam"})); string(answer.Data["reportPack"]) != "true" ||
		len(fake.reported) != 1 || fake.reported[0] != [2]string{aSharedID, "spam"} {
		t.Fatalf("report = %+v %v", answer, fake.reported)
	}
	expectGraphQLError(t, h.graphql(t, "", added, map[string]any{"id": aSharedID}, withOrigin("https://evil.example")), http.StatusForbidden, "forbiddenRequest")
	expectGraphQLError(t, h.graphql(t, "", report, map[string]any{"id": aSharedID, "reason": "spam"}, withOrigin("")), http.StatusForbidden, "forbiddenRequest")
	for _, variables := range []map[string]any{{"id": aSharedID, "reason": "boring"}, {"id": "", "reason": "spam"}} {
		expectGraphQLError(t, h.graphql(t, "", report, variables), http.StatusBadRequest, "invalidReport")
	}
	if len(fake.added) != 1 || len(fake.reported) != 1 {
		t.Fatalf("refused writes reached the database: %v %v", fake.added, fake.reported)
	}
	fake.found = false
	expectGraphQLError(t, h.graphql(t, "", report, map[string]any{"id": "gone", "reason": "spam"}), http.StatusNotFound, "notInGallery")

	// The limits are those of REST, counted per client, and say when to come back.
	fake.found = true
	for range reportsPerMinute - 2 {
		decodeGraphQL(t, h.graphql(t, "", report, map[string]any{"id": aSharedID, "reason": "spam"}))
	}
	response := h.graphql(t, "", report, map[string]any{"id": aSharedID, "reason": "spam"})
	expectGraphQLError(t, response, http.StatusTooManyRequests, "tooManyRequests")
	if seconds, err := strconv.Atoi(response.Header().Get("Retry-After")); err != nil || seconds < 1 || seconds > 60 {
		t.Fatalf("Retry-After = %q", response.Header().Get("Retry-After"))
	}
	fake.hitErr = errors.New("down")
	expectGraphQLError(t, h.graphql(t, "", added, map[string]any{"id": aSharedID}), http.StatusServiceUnavailable, "databaseUnavailable")
}

func TestGraphQLAdminGallery(t *testing.T) {
	listed := time.Unix(1700000000, 0).UTC()
	m := &moderationStore{adminStore: adminStore{allowed: true}, found: true, packs: []store.AdminGalleryPack{
		{ID: aSharedID, Name: "N", Added: 2, ListedAt: &listed, Reports: 3, Reasons: map[string]int{"spam": 3}}}}
	lh := newModerationHarness(t, m)
	h := &harness{handler: lh.handler, keys: lh.keys}
	admin := withCookie(lh.adminCookie("admin@example.com", "cadmin"))
	list := `{ adminGallery { id name category added listedAt hiddenAt reports reasons } }`

	answer := decodeGraphQL(t, h.graphql(t, "", list, nil, admin))
	want := `[{"id":"` + aSharedID + `","name":"N","category":null,"added":2,"listedAt":"2023-11-14T22:13:20Z","hiddenAt":null,"reports":3,"reasons":{"spam":3}}]`
	if string(answer.Data["adminGallery"]) != want {
		t.Fatalf("gallery = %s", answer.Data["adminGallery"])
	}
	m.packs = nil
	if answer := decodeGraphQL(t, h.graphql(t, "", list, nil, admin)); string(answer.Data["adminGallery"]) != `[]` {
		t.Fatalf("empty = %s", answer.Data["adminGallery"])
	}

	hide := `mutation($id: String!, $hidden: Boolean!) { setPackHidden(id: $id, hidden: $hidden) }`
	for _, hidden := range []bool{true, false} {
		m.hidden, m.set = nil, nil
		answer := decodeGraphQL(t, h.graphql(t, "", hide, map[string]any{"id": aSharedID, "hidden": hidden}, admin))
		if string(answer.Data["setPackHidden"]) != "true" || len(m.hidden) != 1 || m.hidden[0] != aSharedID || m.set[0] != hidden {
			t.Fatalf("hidden %v = %+v %v %v", hidden, answer, m.hidden, m.set)
		}
	}
	m.hidden = nil
	expectGraphQLError(t, h.graphql(t, "", hide, map[string]any{"id": aSharedID, "hidden": true}), http.StatusUnauthorized, "adminRequired")
	expectGraphQLError(t, h.graphql(t, "", hide, map[string]any{"id": aSharedID, "hidden": true}, admin, withOrigin("https://evil.example")),
		http.StatusForbidden, "forbiddenRequest")
	// The administrator has no app token: a request without the Origin is refused even with an Authorization header.
	expectGraphQLError(t, h.graphql(t, "", hide, map[string]any{"id": aSharedID, "hidden": true}, admin, withOrigin(""), bearer("x")),
		http.StatusForbidden, "forbiddenRequest")
	expectGraphQLError(t, h.graphql(t, "", hide, map[string]any{"id": "", "hidden": true}, admin), http.StatusBadRequest, "invalidRequest")
	if len(m.hidden) != 0 {
		t.Fatalf("refused requests reached the database: %v", m.hidden)
	}
	m.found = false
	expectGraphQLError(t, h.graphql(t, "", hide, map[string]any{"id": aSharedID, "hidden": true}, admin), http.StatusNotFound, "sharedPackNotFound")
	m.allowed = false
	expectGraphQLError(t, h.graphql(t, "", list, nil, admin), http.StatusForbidden, "adminForbidden")
}
