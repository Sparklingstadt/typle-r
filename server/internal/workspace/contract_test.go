package workspace

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// This is also consumed by the web, Android core and Kotlin backend: change one fixture, run all implementations.
func TestSharedWorkspaceContract(t *testing.T) {
	data, err := os.ReadFile("../../../tests/contracts/workspace.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Version int
		Limits  map[string]int
		Saved   struct{ Lists, Devices json.RawMessage }
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	limits := map[string]int{"lists": MaxLists, "category": MaxCategory, "tag": MaxTag, "tags": MaxTags}
	if fixture.Version != 1 || !reflect.DeepEqual(fixture.Limits, limits) {
		t.Fatalf("contract limits: %v; Go: %v", fixture.Limits, limits)
	}
	w, err := Decode(fixture.Saved.Lists, fixture.Saved.Devices)
	if err != nil {
		t.Fatal(err)
	}
	if err := CheckLimits(w.Lists); err != nil {
		t.Fatal(err)
	}
	for _, part := range []struct {
		original json.RawMessage
		encode   func() ([]byte, error)
	}{
		{fixture.Saved.Lists, func() ([]byte, error) { return Encode(w.Lists) }},
		{fixture.Saved.Devices, func() ([]byte, error) { return EncodeDevices(w.Devices) }},
	} {
		written, err := part.encode()
		if err != nil {
			t.Fatal(err)
		}
		var before, after any
		if err := json.Unmarshal(part.original, &before); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(written, &after); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("shared fields lost: %s", written)
		}
	}
}
