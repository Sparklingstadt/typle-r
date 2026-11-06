package workspace

import (
	"reflect"
	"strings"
	"testing"
)

func TestWordInputTypesRoundTripWithoutChangingLegacyWords(t *testing.T) {
	original := []Word{
		{Display: "ls", Input: "ls", InputType: "command"},
		{Display: "SELECT 1;", Input: "SELECT 1;", InputType: "code"},
		{Display: "字", Input: "zi", InputType: "word"},
		{Display: "legacy", Input: "legacy", Extra: `{"reading":"kept"}`},
	}
	encoded, err := Encode([]List{{ID: "l", Name: "L", CreatedAt: "x", Words: original}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(encoded), `"input_type"`) != 3 {
		t.Fatalf("legacy word gained a type: %s", encoded)
	}
	decoded, err := DecodeLists(encoded)
	if err != nil || !reflect.DeepEqual(decoded[0].Words, original) {
		t.Fatalf("typed words changed: %+v, %v", decoded, err)
	}
}
