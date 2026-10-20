package workspace

import (
	"reflect"
	"strings"
	"testing"
)

func words(values ...[3]string) []Word {
	out := []Word{}
	for _, v := range values {
		out = append(out, Word{Input: v[0], Display: v[1], Annotation: v[2]})
	}
	return out
}

func wantImportError(t *testing.T, source string, delimiter rune, key string, line int) {
	t.Helper()
	_, err := ParseWordFile(source, delimiter)
	e, ok := err.(*Error)
	if !ok || e.Key != key || e.Line != line {
		t.Fatalf("%q: err = %#v, want %s line %d", source, err, key, line)
	}
}

// The cases of tests/importWords.test.cjs.
func TestParseCSV(t *testing.T) {
	got, err := ParseWordFile("\ufeffdisplay,input,annotation\r\n\"日本,Japan\",Japan,\"one\r\ntwo \"\"quoted\"\"\"\r\n", ',')
	if err != nil || !reflect.DeepEqual(got, words([3]string{"Japan", "日本,Japan", "one\r\ntwo \"quoted\""})) {
		t.Fatalf("got %#v, %v", got, err)
	}
}

func TestParseTSV(t *testing.T) {
	got, err := ParseWordFile("input\tdisplay\n\nJapan\t日本\n", '\t')
	if err != nil || !reflect.DeepEqual(got, words([3]string{"Japan", "日本", ""})) {
		t.Fatalf("got %#v, %v", got, err)
	}
	got, err = ParseWordFile("input\tdisplay\tannotation\nJapan\t日本\t\"a\tb\"", '\t')
	if err != nil || got[0].Annotation != "a\tb" {
		t.Fatalf("got %#v, %v", got, err)
	}
}

func TestParseErrors(t *testing.T) {
	for _, text := range []string{"display\nx", "input,display,input\na,b,c", "input,display,other\na,b,c", "input,display", "input,display\na,",
		"input,display\na,b,c", "input,display\n\"a,b", "input,display\n\"a\"x,b", "input,display\na\"x,b"} {
		if _, err := ParseWordFile(text, ','); err == nil {
			t.Errorf("%q was read", text)
		}
	}
	wantImportError(t, "display\nx", ',', "importHeaderRequired", 0)
	wantImportError(t, "input,display,input\na,b,c", ',', "importHeaderDuplicate", 0)
	wantImportError(t, "input,display,other\na,b,c", ',', "importHeaderUnknown", 0)
	wantImportError(t, "input,display", ',', "importNoRows", 0)
	wantImportError(t, "input,display\na,b,c", ',', "importColumnCount", 2)
	wantImportError(t, "input,display\n\"a,b", ',', "importQuote", 2)
	wantImportError(t, "input,display\n\"a\"x,b", ',', "importQuote", 2)
	wantImportError(t, "input,display\na\"x,b", ',', "importQuote", 2)
	wantImportError(t, "input,display\nok,yes\nno,", ',', "importFieldRequired", 3)
	wantImportError(t, "input,display\n"+strings.Repeat("a,b\n", 1001), ',', "importTooManyRows", 0)
	wantImportError(t, "input,display\n"+strings.Repeat("a", 1001)+",b", ',', "importFieldTooLong", 2)
	wantImportError(t, strings.Repeat("a", MaxImportBytes+1), ',', "importTooLarge", 0)
	wantImportError(t, "display,input,annotation,anotation\na,b,c,d", ',', "importHeaderDuplicate", 0)
	for _, row := range []string{",,", "\"\",\"\",\"\"", "  ,  ,"} {
		wantImportError(t, "display,input,annotation\na,b,\n"+row, ',', "importFieldRequired", 3)
	}
}

// A quoted field with newlines spans lines, and the rows after it keep their real line numbers.
func TestParseLineNumbersAfterQuotedNewline(t *testing.T) {
	wantImportError(t, "input,display\n\"a\n\nb\",x\nc,d,e", ',', "importColumnCount", 5)
	wantImportError(t, "input,display\n\"a\r\nb\",x\r\nc,", ',', "importFieldRequired", 4)
}

func TestParseKeepsWhitespaceAndDuplicates(t *testing.T) {
	got, err := ParseWordFile("display,input,anotation\r\n\" 字 \",\" zi \",\" a\r\nb \"\r\n字,zi,\r\n字,zi,", ',')
	want := []Word{{Display: " 字 ", Input: " zi ", Annotation: " a\r\nb "}, {Display: "字", Input: "zi"}, {Display: "字", Input: "zi"}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, %v", got, err)
	}
}

// The cases of tests/exportWords.test.cjs.
func TestEncodeCSVRoundTrip(t *testing.T) {
	original := []Word{
		{Input: " zi ", Display: " 字,日本 ", Annotation: "one\r\ntwo \"quoted\"\t"},
		{Input: "=literal", Display: "😀"},
		{Input: "=literal", Display: "😀"},
	}
	csv := EncodeWordCSV(original)
	if !strings.HasPrefix(csv, "\ufeffinput,display,annotation\r\n") || !strings.HasSuffix(csv, "\r\n") {
		t.Fatalf("csv = %q", csv)
	}
	got, err := ParseWordFile(csv, ',')
	if err != nil || !reflect.DeepEqual(got, original) {
		t.Fatalf("got %#v, %v", got, err)
	}
	if EncodeWordCSV([]Word{{Input: "a", Display: "b", Annotation: "c"}}) != "\ufeffinput,display,annotation\r\n\"a\",\"b\",\"c\"\r\n" {
		t.Fatal("cells are not all quoted")
	}
}

func TestWordFilename(t *testing.T) {
	cases := map[string]string{
		"中国語":                         "中国語.csv",
		"../a:b\\c?":                  "_a_b_c_.csv",
		"...":                         "word-list.csv",
		"CON":                         "_CON.csv",
		"com1.txt":                    "_com1.txt.csv",
		"a\tb":                        "a_b.csv",
		strings.Repeat("a", 200):      strings.Repeat("a", 80) + ".csv",
		strings.Repeat("𩸽", 50):       strings.Repeat("𩸽", 40) + ".csv",
		"x" + strings.Repeat("𩸽", 50): "x" + strings.Repeat("𩸽", 39) + ".csv",
	}
	for name, want := range cases {
		if got := WordFilename(name, "csv"); got != want {
			t.Errorf("WordFilename(%q) = %q, want %q", name, got, want)
		}
	}
}

// JavaScript's trim removes U+FEFF and keeps U+0085, unlike strings.TrimSpace. A cell of only U+FEFF is blank.
func TestParseTrimsAsJavaScript(t *testing.T) {
	wantImportError(t, "input,display\n"+bom, ',', "importNoRows", 0)
	wantImportError(t, "input,display\n"+bom+",x", ',', "importFieldRequired", 2)
	got, err := ParseWordFile("input,display\n\u0085,x", ',')
	if err != nil || got[0].Input != "\u0085" {
		t.Fatalf("got %#v, %v", got, err)
	}
}

func TestTrimJS(t *testing.T) {
	cases := map[string]string{" a ": "a", bom + "a" + bom: "a", "\u0085a\u0085": "\u0085a\u0085", "　a ": "a", "\t\v\f\r\n a": "a"}
	for input, want := range cases {
		if got := trimJS(input); got != want {
			t.Errorf("trimJS(%q) = %q, want %q", input, got, want)
		}
	}
}
