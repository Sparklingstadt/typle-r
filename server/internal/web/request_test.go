package web

import (
	"strings"
	"testing"
)

func TestUnstorable(t *testing.T) {
	for raw, want := range map[string]bool{
		`["a"]`:                         false,
		`["\u0000"]`:                    true,
		`{"a\u0000":1}`:                 true,
		`["\\u0000"]`:                   false, // a backslash and "u0000", not a NUL
		`["\\\u0000"]`:                  true,  // a backslash and a NUL
		`["\ud800"]`:                    true,
		`["\uD800x"]`:                   true,
		`["\udfff"]`:                    true, // a low surrogate alone
		`["\ud800A"]`:                   true,
		`["\ud800\ud800"]`:              true,
		`{"\udc00":1}`:                  true,
		`["𠮷"]`:                         false, // 𠮷 as a pair
		`["𠮷", "\\ud800"]`:              false,
		`["あé"]`:                        false,
		`["𠮷\ud800"]`:                   true,
		`[{"x":{"y":["ok","\ud83d"]}}]`: true,
	} {
		if got := unstorable([]byte(raw)); got != want {
			t.Errorf("unstorable(%s) = %v, want %v", raw, got, want)
		}
	}
}

// largeLists is a request's lists of about 600 KB with many escapes, none of them NUL or a surrogate.
func largeLists() []byte {
	word := `{"display":"café あ","input":"cafe","annotation":"` + strings.Repeat("x", 40) + `"}`
	words := strings.TrimSuffix(strings.Repeat(word+",", 1000), ",")
	list := `{"id":"l","name":"英単語","createdAt":"2026-09-06","words":[` + words + `],"records":[]}`
	return []byte("[" + strings.TrimSuffix(strings.Repeat(list+",", 6), ",") + "]")
}

// A body with nothing jsonb would refuse is let through by a byte search, without reading it token by token.
func TestUnstorableFastPath(t *testing.T) {
	lists := largeLists()
	if allocs := testing.AllocsPerRun(10, func() {
		if unstorable(lists) {
			t.Fatal("refused")
		}
	}); allocs != 0 {
		t.Fatalf("%v allocations for %d bytes", allocs, len(lists))
	}
}

func BenchmarkUnstorable(b *testing.B) {
	lists := largeLists()
	b.SetBytes(int64(len(lists)))
	b.ReportAllocs()
	for b.Loop() {
		unstorable(lists)
	}
}
