package workspace

import (
	"errors"
	"testing"
)

func text(value string) *string { return &value }

// two lists: l1 英単語 with a record, and l2 Fruits.
func two() *Workspace {
	id := "r1"
	return &Workspace{Lists: []List{
		{ID: "l1", Name: "英単語", Words: []Word{{Display: "apple", Input: "apple", Annotation: "りんご"}},
			Records: []Record{{ID: &id, Time: 1, Date: "2026-10-10T00:00:00.000Z"}}, CreatedAt: "2026-10-01T00:00:00.000Z"},
		{ID: "l2", Name: "Fruits", Words: []Word{{Display: "pear", Input: "pear"}}, Records: []Record{}, CreatedAt: "2026-10-02T00:00:00.000Z"},
	}, Devices: []Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}}
}

func wantKey(t *testing.T, err error, key string) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Key != key {
		t.Fatalf("err = %v, want %s", err, key)
	}
}

// The expected values are what Node's toLowerCase gives.
func TestLowerCase(t *testing.T) {
	cases := map[string]string{
		"\u039f\u0394\u039f\u03a3":              "\u03bf\u03b4\u03bf\u03c2", // ΟΔΟΣ → οδος
		"\u039f\u0394\u039f\u03a3 \u0391\u03a3": "\u03bf\u03b4\u03bf\u03c2 \u03b1\u03c2",
		"\u0391\u03a3.":                         "\u03b1\u03c2.",       // . can follow a final Σ
		"\u0391\u03a3'\u0392":                   "\u03b1\u03c3'\u03b2", // ' inside a word does not end it
		"\u0391\u03a3:\u0392":                   "\u03b1\u03c3:\u03b2",
		"\u0391\u03a3\u0301":                    "\u03b1\u03c2\u0301", // a combining accent is ignored
		"\u0391\u03a31":                         "\u03b1\u03c21",      // a digit is not a letter
		"1\u03a3":                               "1\u03c3",            // nothing cased before it
		"\u03a3":                                "\u03c3",
		"A\u02bc\u00ad\u03a3":                   "a\u02bc\u00ad\u03c2", // modifier letters and soft hyphens are ignored
		"\u0130stanbul":                         "i\u0307stanbul",
		"ABC":                                   "abc",
	}
	for input, want := range cases {
		if got := lowerCase(input); got != want {
			t.Errorf("lowerCase(%q) = %q, want %q", input, got, want)
		}
	}
}
