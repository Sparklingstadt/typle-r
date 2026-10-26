package workspace

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// The inputs of decodeInterests in tests/interests.test.cjs, read the same way.
func TestDecodeInterests(t *testing.T) {
	many := make([]string, MaxInterests+1)
	for i := range many {
		many[i] = fmt.Sprintf("x/%d", i)
	}
	most, err := json.Marshal(many[:MaxInterests])
	if err != nil {
		t.Fatal(err)
	}
	tooMany, err := json.Marshal(many)
	if err != nil {
		t.Fatal(err)
	}
	accepted := map[string][]string{
		"":                            {},
		"null":                        {},
		"[]":                          {},
		`["language","language/zh"]`:  {"language", "language/zh"},
		`["x/unknown","programming"]`: {"x/unknown", "programming"},
		`["` + strings.Repeat("a", MaxInterestLength) + `"]`:   {strings.Repeat("a", MaxInterestLength)},
		`["` + strings.Repeat("𩸽", MaxInterestLength/2) + `"]`: {strings.Repeat("𩸽", MaxInterestLength/2)},
		string(most): many[:MaxInterests],
	}
	for data, want := range accepted {
		got, err := DecodeInterests([]byte(data))
		if err != nil || got == nil || !slices.Equal(got, want) {
			t.Errorf("DecodeInterests(%.40q) = %q, %v; want %q", data, got, err, want)
		}
	}
	for name, data := range map[string]string{
		"not a list":     `{}`,
		"a string":       `"language"`,
		"not a string":   `["a",1]`,
		"null item":      `["a",null]`,
		"too many":       string(tooMany),
		"too long":       `["` + strings.Repeat("a", MaxInterestLength+1) + `"]`,
		"too long UTF16": `["` + strings.Repeat("𩸽", MaxInterestLength/2+1) + `"]`,
		"duplicate":      `["language","language"]`,
		"empty":          `[""]`,
		"not JSON":       `[`,
	} {
		if got, err := DecodeInterests([]byte(data)); err == nil {
			t.Errorf("%s: DecodeInterests = %q; want an error", name, got)
		}
	}
}

func TestEncodeInterests(t *testing.T) {
	for _, c := range []struct {
		interests []string
		want      string
	}{
		{nil, "[]"},
		{[]string{}, "[]"},
		{[]string{"language", "language/zh", "<&>"}, `["language","language/zh","<&>"]`},
	} {
		got, err := EncodeInterests(c.interests)
		if err != nil || string(got) != c.want {
			t.Errorf("EncodeInterests(%q) = %s, %v; want %s", c.interests, got, err, c.want)
		}
	}
}
