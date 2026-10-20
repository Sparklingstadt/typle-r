package workspace

import (
	"errors"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestEncodeRoundTrip(t *testing.T) {
	w, err := Decode([]byte(lists), []byte(devices))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := Encode(w.Lists)
	if err != nil {
		t.Fatal(err)
	}
	again, err := Decode(encoded, []byte(devices))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(again.Lists, w.Lists) {
		t.Fatalf("lists = %+v, want %+v", again.Lists, w.Lists)
	}
	// Fields the app no longer uses are dropped, and HTML characters are not escaped, as JSON.stringify does.
	if strings.Contains(string(encoded), "shared") || strings.HasSuffix(string(encoded), "\n") {
		t.Fatalf("encoded = %s", encoded)
	}
	escaped, err := Encode([]List{{ID: "a", Name: "<&>", Words: []Word{{Display: "a", Input: "a"}}, CreatedAt: "x"}})
	if err != nil || !strings.Contains(string(escaped), `"<&>"`) {
		t.Fatalf("encoded = %s, %v", escaped, err)
	}
}

// The app reads null in a record's optional field as invalid, so it is never written.
func TestEncodeDropsNulls(t *testing.T) {
	w, err := Decode([]byte(`[{ "id": "l1", "name": "a", "createdAt": "x", "words": [{ "display": "a", "input": "a", "annotation": "" }],
		"records": [{ "id": null, "time": 1, "date": "2026-10-10T00:00:00.000Z", "mistakes": null, "accuracy": null, "wordCount": null, "device": null }] }]`),
		[]byte(`[]`))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := Encode(w.Lists)
	if err != nil || strings.Contains(string(encoded), "null") {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
}

func TestEncodeEmptySlices(t *testing.T) {
	encoded, err := Encode([]List{{ID: "a", Name: "a", Words: []Word{{Display: "a", Input: "a"}}, CreatedAt: "x"}})
	if err != nil || !strings.Contains(string(encoded), `"records":[]`) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
	if encoded, err := Encode(nil); err != nil || string(encoded) != "[]" {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
}

func TestCheckSize(t *testing.T) {
	if err := CheckSize(0, MaxListsBytes); err != nil {
		t.Fatal(err)
	}
	var e *Error
	if err := CheckSize(0, MaxListsBytes+1); !errors.As(err, &e) || e.Key != "workspaceTooLarge" {
		t.Fatalf("err = %v", err)
	}
	// A change that makes an oversized workspace smaller is let through.
	if err := CheckSize(MaxListsBytes+10, MaxListsBytes+5); err != nil {
		t.Fatal(err)
	}
}

func TestNewID(t *testing.T) {
	pattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	first, second := NewID(), NewID()
	if !pattern.MatchString(first) || !pattern.MatchString(second) || first == second {
		t.Fatalf("ids = %q, %q", first, second)
	}
}

func TestFormatTime(t *testing.T) {
	at, _ := time.Parse(time.RFC3339, "2026-10-10T11:00:00+09:00")
	if got := FormatTime(at); got != "2026-10-10T02:00:00.000Z" {
		t.Fatalf("FormatTime = %q", got)
	}
}
