package workspace

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf16"
)

// MaxImportBytes is the largest word file read, as MAX_IMPORT_BYTES in src/core/wordFormat.ts.
const MaxImportBytes = 1 << 20

const maxImportRows = 1000

var bom = string(rune(0xfeff))

// ParseWordFile reads CSV (',') or TSV ('\t') words as parseWordFile (src/plugins/formats/delimited.ts) does: a
// header of input, display and optionally annotation and input_type (anotation is read as annotation), fields in double quotes
// that may hold the delimiter, newlines and doubled quotes, and blank lines skipped. Errors name the line they found.
func ParseWordFile(source string, delimiter rune) ([]Word, error) {
	if len(source) > MaxImportBytes {
		return nil, &Error{Key: "importTooLarge"}
	}
	type row struct {
		cells []string
		line  int
	}
	text := []rune(strings.TrimPrefix(source, bom))
	var rows []row
	var cells []string
	var value strings.Builder
	quoted, closed, line, start := false, false, 1, 1
	field := func() {
		cells = append(cells, value.String())
		value.Reset()
		closed = false
	}
	endRow := func() {
		explicit := closed
		field()
		if len(cells) > 1 || slices.ContainsFunc(cells, func(cell string) bool { return trimJS(cell) != "" }) || explicit {
			rows = append(rows, row{cells, start})
		}
		cells = nil
	}
	fail := func() error { return &Error{Key: "importQuote", Line: line} }
	for i := 0; i < len(text); i++ {
		c := text[i]
		next := rune(0)
		if i+1 < len(text) {
			next = text[i+1]
		}
		switch {
		case quoted:
			if c == '"' {
				if next == '"' {
					value.WriteRune('"')
					i++
				} else {
					quoted, closed = false, true
				}
			} else {
				value.WriteRune(c)
				if c == '\n' || (c == '\r' && next != '\n') {
					line++
				}
			}
		case c == delimiter:
			field()
		case c == '\r' || c == '\n':
			endRow()
			if c == '\r' && next == '\n' {
				i++
			}
			line++
			start = line
		case closed:
			return nil, fail()
		case c == '"':
			if value.Len() > 0 {
				return nil, fail()
			}
			quoted = true
		default:
			value.WriteRune(c)
		}
	}
	if quoted {
		return nil, fail()
	}
	endRow()
	if len(rows) == 0 {
		return nil, &Error{Key: "importHeaderRequired"}
	}
	header := make([]string, len(rows[0].cells))
	for i, cell := range rows[0].cells {
		header[i] = trimJS(cell)
		if header[i] == "anotation" {
			header[i] = "annotation"
		}
	}
	rows = rows[1:]
	if !slices.Contains(header, "input") || !slices.Contains(header, "display") {
		return nil, &Error{Key: "importHeaderRequired"}
	}
	seen := map[string]bool{}
	for _, name := range header {
		if seen[name] {
			return nil, &Error{Key: "importHeaderDuplicate"}
		}
		seen[name] = true
	}
	for _, name := range header {
		if name != "input" && name != "display" && name != "annotation" && name != "input_type" {
			return nil, &Error{Key: "importHeaderUnknown"}
		}
	}
	if len(rows) == 0 {
		return nil, &Error{Key: "importNoRows"}
	}
	if len(rows) > maxImportRows {
		return nil, &Error{Key: "importTooManyRows"}
	}
	words := make([]Word, 0, len(rows))
	for _, r := range rows {
		if len(r.cells) != len(header) {
			return nil, &Error{Key: "importColumnCount", Line: r.line}
		}
		get := func(name string) string {
			if i := slices.Index(header, name); i >= 0 {
				return r.cells[i]
			}
			return ""
		}
		word := Word{Input: get("input"), Display: get("display"), Annotation: get("annotation"), InputType: get("input_type")}
		if trimJS(word.Input) == "" || trimJS(word.Display) == "" {
			return nil, &Error{Key: "importFieldRequired", Line: r.line}
		}
		if length(word.Input) > MaxWordText || length(word.Display) > MaxWordText || length(word.Annotation) > MaxAnnotation {
			return nil, &Error{Key: "importFieldTooLong", Line: r.line}
		}
		if !validInputType(word.InputType) {
			return nil, &Error{Key: "importInputTypeInvalid", Line: r.line}
		}
		words = append(words, word)
	}
	return words, nil
}

// EncodeWordCSV writes words as encodeWordCsv does: a BOM, the header, every field quoted, CRLF after every line.
func EncodeWordCSV(words []Word) string {
	cell := func(value string) string { return `"` + strings.ReplaceAll(value, `"`, `""`) + `"` }
	var b strings.Builder
	typed := slices.ContainsFunc(words, func(word Word) bool { return word.InputType != "" })
	b.WriteString(bom + "input,display,annotation")
	if typed {
		b.WriteString(",input_type")
	}
	b.WriteString("\r\n")
	for _, word := range words {
		b.WriteString(cell(word.Input) + "," + cell(word.Display) + "," + cell(word.Annotation))
		if typed {
			b.WriteString("," + cell(word.InputType))
		}
		b.WriteString("\r\n")
	}
	return b.String()
}

var (
	unsafeFilename = regexp.MustCompile(`[<>:"/\\|?*]`)
	reservedName   = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)`)
)

const maxFilename = 80

// WordFilename names a list's file as wordFilename (src/plugins/formats/index.ts) does, so that every common OS
// accepts it: control and path characters become _, dots and spaces around it go, and it keeps 80 UTF-16 units.
func WordFilename(name, extension string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 32 || unsafeFilename.MatchString(string(r)) {
			b.WriteRune('_')
		} else {
			b.WriteRune(r)
		}
	}
	safe := strings.Trim(b.String(), ". ")
	units := utf16.Encode([]rune(safe))
	if len(units) > maxFilename {
		keep := maxFilename
		// A character of two units is not cut in half.
		if utf16.IsSurrogate(rune(units[keep-1])) && units[keep-1] < 0xdc00 {
			keep--
		}
		safe = string(utf16.Decode(units[:keep]))
	}
	safe = strings.TrimRight(safe, ". ")
	if safe == "" {
		safe = "word-list"
	}
	if reservedName.MatchString(safe) {
		safe = "_" + safe
	}
	return safe + "." + extension
}
