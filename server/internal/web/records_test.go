package web

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// memoryWorkspace is a database of one account's workspace, changed with Modify as store.Store does.
type memoryWorkspace struct {
	fakeStore
	w        *workspace.Workspace
	revision int
	modifies int
}

func newMemoryWorkspace(t *testing.T, lists string) *memoryWorkspace {
	t.Helper()
	w, err := workspace.Decode([]byte(lists), []byte(`[{"id":"mac","name":"MacBook","layout":"JIS"}]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	return &memoryWorkspace{w: w, revision: 1}
}

func (m *memoryWorkspace) Modify(_ context.Context, _ string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) {
	m.modifies++
	if m.err != nil {
		return nil, m.err
	}
	changed, err := change(m.w)
	if err != nil {
		return nil, err
	}
	if changed {
		m.revision++
	}
	return m.w, nil
}

func (m *memoryWorkspace) ReadRevision(context.Context, string) (*store.Saved, error) {
	lists, err := workspace.Encode(m.w.Lists)
	if err != nil {
		return nil, err
	}
	packs, err := workspace.EncodePacks(m.w.Packs)
	if err != nil {
		return nil, err
	}
	devices, err := workspace.EncodeDevices(m.w.Devices)
	if err != nil {
		return nil, err
	}
	return &store.Saved{Lists: lists, Packs: packs, Devices: devices, Revision: m.revision}, nil
}

// postRecord is a signed-in POST /api/workspace/records from the app's own origin unless the test changes it.
func (h *harness) postRecord(owner, body string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/workspace/records", strings.NewReader(body))
	r.Header.Set("Origin", testBase)
	r.Header.Set("Content-Type", "application/json")
	if owner != "" {
		r.AddCookie(h.cookie(owner, false))
	}
	for _, f := range change {
		f(r)
	}
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	return response
}

const aRun = `{"id":"run-1","time":2.5,"date":"2026-10-02T10:00:00.000Z","mistakes":1,"accuracy":95.5,"wordCount":1,"deviceId":"mac"}`

func recordBody(owner, listID, record string) string {
	return payload(owner, `"listId":"`+listID+`","record":`+record)
}

// savedRecords are the records of the list in an answer that has the workspace.
func savedRecords(t *testing.T, response *httptest.ResponseRecorder, listID string) []workspace.Record {
	t.Helper()
	var lists []workspace.List
	if err := json.Unmarshal(decodeBody(t, response)["lists"], &lists); err != nil {
		t.Fatal(err)
	}
	for _, list := range lists {
		if list.ID == listID {
			return list.Records
		}
	}
	t.Fatalf("no list %s in %s", listID, response.Body)
	return nil
}

func TestAddRecord(t *testing.T) {
	memory := newMemoryWorkspace(t, `[`+oneList+`]`)
	h := newHarness(t, memory, testBase)
	added := h.postRecord(testOwner, recordBody(testOwner, "one", aRun))
	if added.Code != http.StatusCreated {
		t.Fatalf("response = %d %s", added.Code, added.Body)
	}
	expectPrivate(t, added)
	fields := decodeBody(t, added)
	if string(fields["revision"]) != "2" || string(fields["accountId"]) != `"`+testOwner+`"` {
		t.Fatalf("answer = %s", added.Body)
	}
	var record workspace.Record
	if err := json.Unmarshal(fields["record"], &record); err != nil || record.Device == nil || record.Device.Name != "MacBook" {
		t.Fatalf("record = %s, %v", fields["record"], err)
	}
	if records := savedRecords(t, added, "one"); len(records) != 1 || *records[0].ID != "run-1" {
		t.Fatalf("records = %+v", records)
	}
	// Sent again, as a retry after a lost answer: answered with the saved run, and nothing is saved.
	again := h.postRecord(testOwner, recordBody(testOwner, "one", strings.Replace(aRun, `"time":2.5`, `"time":9`, 1)))
	if again.Code != http.StatusOK || string(decodeBody(t, again)["revision"]) != "2" {
		t.Fatalf("again = %d %s", again.Code, again.Body)
	}
	if records := savedRecords(t, again, "one"); len(records) != 1 || records[0].Time != 2.5 {
		t.Fatalf("records = %+v", records)
	}
}

func TestAddRecordRefused(t *testing.T) {
	memory := newMemoryWorkspace(t, `[`+oneList+`]`)
	h := newHarness(t, memory, testBase)
	cases := []struct {
		name, body string
		status     int
		key        string
	}{
		{"other account", recordBody("github:1", "one", aRun), http.StatusUnauthorized, "loginAccountChanged"},
		{"no list", recordBody(testOwner, "gone", aRun), http.StatusNotFound, "recordListDeleted"},
		{"no device", recordBody(testOwner, "one", strings.Replace(aRun, `"mac"`, `"gone"`, 1)), http.StatusBadRequest, "deviceNotFound"},
		{"bad accuracy", recordBody(testOwner, "one", strings.Replace(aRun, `95.5`, `101`, 1)), http.StatusBadRequest, "invalidRecord"},
		{"no id", recordBody(testOwner, "one", strings.Replace(aRun, `"id":"run-1",`, ``, 1)), http.StatusBadRequest, "invalidRecord"},
		{"unknown field", recordBody(testOwner, "one", strings.Replace(aRun, `{`, `{"keys":[1],`, 1)), http.StatusBadRequest, "invalidRecord"},
		{"extra field", payload(testOwner, `"listId":"one","record":`+aRun+`,"revision":1`), http.StatusBadRequest, "invalidRecord"},
		{"no list id", payload(testOwner, `"record":`+aRun), http.StatusBadRequest, "invalidRecord"},
		{"not an object", `[]`, http.StatusBadRequest, "invalidRecord"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			expectError(t, h.postRecord(testOwner, c.body), c.status, c.key)
		})
	}
	if memory.revision != 1 || len(memory.w.Lists[0].Records) != 0 {
		t.Fatalf("saved revision %d, records %+v", memory.revision, memory.w.Lists[0].Records)
	}
	t.Run("signed out", func(t *testing.T) {
		expectError(t, h.postRecord("", recordBody(testOwner, "one", aRun)), http.StatusUnauthorized, "loginRequired")
	})
	t.Run("other origin", func(t *testing.T) {
		expectError(t, h.postRecord(testOwner, recordBody(testOwner, "one", aRun), func(r *http.Request) {
			r.Header.Set("Origin", "https://evil.example")
		}), http.StatusForbidden, "forbiddenRequest")
	})
	t.Run("GET", func(t *testing.T) {
		response := h.postRecord(testOwner, "", func(r *http.Request) { r.Method = http.MethodGet })
		expectError(t, response, http.StatusMethodNotAllowed, "methodNotAllowed")
	})
	t.Run("database down", func(t *testing.T) {
		memory.err = errors.New("down")
		defer func() { memory.err = nil }()
		expectError(t, h.postRecord(testOwner, recordBody(testOwner, "one", aRun)), http.StatusServiceUnavailable, "workspaceSaveFailed")
		if len(h.reports) == 0 || h.reports[len(h.reports)-1] != "record.add" {
			t.Fatalf("reports = %v", h.reports)
		}
	})
}

// A run is saved however the lists were changed meanwhile, and a list edit made against the revision from before the
// run is told to reload (409) instead of saving the lists without it.
func TestAddRecordWithEditsDatabase(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	created := h.put(owner, payload(owner, `"revision":0,"lists":[`+oneList+`],"devices":[{"id":"mac","name":"MacBook","layout":"JIS"}]`))
	if created.Code != http.StatusOK {
		t.Fatalf("created = %d %s", created.Code, created.Body)
	}
	// Another screen renames the list after the practice started from revision 1.
	renamed := h.put(owner, payload(owner, `"revision":1,"lists":[`+strings.Replace(oneList, `"One"`, `"Renamed"`, 1)+`]`))
	if renamed.Code != http.StatusOK {
		t.Fatalf("renamed = %d %s", renamed.Code, renamed.Body)
	}
	added := h.postRecord(owner, recordBody(owner, "one", aRun))
	if added.Code != http.StatusCreated || string(decodeBody(t, added)["revision"]) != "3" {
		t.Fatalf("added = %d %s", added.Code, added.Body)
	}
	again := h.postRecord(owner, recordBody(owner, "one", aRun))
	if again.Code != http.StatusOK || len(savedRecords(t, again, "one")) != 1 {
		t.Fatalf("again = %d %s", again.Code, again.Body)
	}
	// The screen that renamed it still holds revision 2: its next edit would drop the run, so it must reload.
	expectError(t, h.put(owner, payload(owner, `"revision":2,"lists":[`+oneList+`]`)), http.StatusConflict, "conflict")
	read := h.get(owner)
	records := savedRecords(t, read, "one")
	var lists []struct{ Name string }
	_ = json.Unmarshal(decodeBody(t, read)["lists"], &lists)
	if len(records) != 1 || records[0].Device == nil || len(lists) != 1 || lists[0].Name != "Renamed" {
		t.Fatalf("read = %s", read.Body)
	}
}

func deleteBody(owner, listID, recordID string) string {
	return payload(owner, `"listId":"`+listID+`","recordId":"`+recordID+`"`)
}

func (h *harness) deleteRecord(owner, body string) *httptest.ResponseRecorder {
	return h.postRecord(owner, body, func(r *http.Request) { r.Method = http.MethodDelete })
}

func TestDeleteRecord(t *testing.T) {
	memory := newMemoryWorkspace(t, `[`+oneList+`]`)
	h := newHarness(t, memory, testBase)
	if added := h.postRecord(testOwner, recordBody(testOwner, "one", aRun)); added.Code != http.StatusCreated {
		t.Fatalf("added = %d %s", added.Code, added.Body)
	}
	deleted := h.deleteRecord(testOwner, deleteBody(testOwner, "one", "run-1"))
	if deleted.Code != http.StatusOK || string(decodeBody(t, deleted)["revision"]) != "3" || len(savedRecords(t, deleted, "one")) != 0 {
		t.Fatalf("deleted = %d %s", deleted.Code, deleted.Body)
	}
	expectPrivate(t, deleted)
	// Sent again, or for a list that is gone: answered the same, and nothing is saved.
	for _, body := range []string{deleteBody(testOwner, "one", "run-1"), deleteBody(testOwner, "gone", "run-1")} {
		again := h.deleteRecord(testOwner, body)
		if again.Code != http.StatusOK || string(decodeBody(t, again)["revision"]) != "3" {
			t.Fatalf("again = %d %s", again.Code, again.Body)
		}
	}
	for name, c := range map[string]struct {
		body   string
		status int
		key    string
	}{
		"other account": {deleteBody("github:1", "one", "run-1"), http.StatusUnauthorized, "loginAccountChanged"},
		"no record id":  {payload(testOwner, `"listId":"one"`), http.StatusBadRequest, "invalidRecord"},
		"empty id":      {deleteBody(testOwner, "one", ""), http.StatusBadRequest, "invalidRecord"},
		"extra field":   {payload(testOwner, `"listId":"one","recordId":"run-1","revision":3`), http.StatusBadRequest, "invalidRecord"},
	} {
		t.Run(name, func(t *testing.T) { expectError(t, h.deleteRecord(testOwner, c.body), c.status, c.key) })
	}
}

// A record is deleted without a revision, so the lists changed meanwhile stay, and an edit made before the delete is
// told to reload rather than bring the record back.
func TestDeleteRecordWithEditsDatabase(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	created := h.put(owner, payload(owner, `"revision":0,"lists":[`+oneList+`],"devices":[{"id":"mac","name":"MacBook","layout":"JIS"}]`))
	if created.Code != http.StatusOK {
		t.Fatalf("created = %d %s", created.Code, created.Body)
	}
	added := h.postRecord(owner, recordBody(owner, "one", aRun))
	if added.Code != http.StatusCreated {
		t.Fatalf("added = %d %s", added.Code, added.Body)
	}
	// Another screen renames the list, with its record, at the revision the record was saved in.
	lists := strings.Replace(string(decodeBody(t, added)["lists"]), `"One"`, `"Renamed"`, 1)
	renamed := h.put(owner, payload(owner, `"revision":2,"lists":`+lists))
	if renamed.Code != http.StatusOK || len(savedRecords(t, renamed, "one")) != 1 {
		t.Fatalf("renamed = %d %s", renamed.Code, renamed.Body)
	}
	deleted := h.deleteRecord(owner, deleteBody(owner, "one", "run-1"))
	if deleted.Code != http.StatusOK || len(savedRecords(t, deleted, "one")) != 0 {
		t.Fatalf("deleted = %d %s", deleted.Code, deleted.Body)
	}
	var names []struct{ Name string }
	_ = json.Unmarshal(decodeBody(t, deleted)["lists"], &names)
	if len(names) != 1 || names[0].Name != "Renamed" {
		t.Fatalf("lists = %s", deleted.Body)
	}
	// The renaming screen still holds revision 3, with the record: its next save would bring it back, so it must reload.
	expectError(t, h.put(owner, payload(owner, `"revision":3,"lists":`+lists)), http.StatusConflict, "conflict")
}
