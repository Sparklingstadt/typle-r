package workspace

import (
	"bytes"
	"encoding/json"
	"strings"
)

// A pack as a file (<pack name>.typle-pack.json) follows src/core/packFile.ts, and is written byte for byte as the app
// writes it: tests/fixtures/pack-file holds the cases both check, and its README the rules.

const packFileFormat = "typle-pack"

// PackFile is a pack in the shape of a file, with no records, ids, dates or origin. The fields are in the order the
// file has them; empty optional fields are left out.
type PackFile struct {
	Format  string         `json:"format"`
	Version int            `json:"version"`
	Pack    PackFileInfo   `json:"pack"`
	Lists   []PackFileList `json:"lists"`
}

type PackFileInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Category    string   `json:"category,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// PackFileList is a list of a pack file. Its words have no fields Typle does not know.
type PackFileList struct {
	Name    string   `json:"name"`
	Levels  []string `json:"levels,omitempty"`
	Writing *Writing `json:"writing,omitempty"`
	Words   []Word   `json:"words"`
}

// EncodePackFile follows encodePackFile (src/core/packFile.ts): the pack packID of w and its lists in saved order, as
// JSON.stringify(file, null, 2) and a newline write them.
func EncodePackFile(w *Workspace, packID string) ([]byte, error) {
	pack := w.FindPack(packID)
	if pack == nil {
		return nil, packMissing()
	}
	file := PackFile{Format: packFileFormat, Version: 1, Lists: []PackFileList{},
		Pack: PackFileInfo{Name: pack.Name, Description: pack.Description, Category: pack.Category, Tags: pack.Tags}}
	for _, list := range w.Lists {
		if list.PackID == packID {
			file.Lists = append(file.Lists, PackFileList{Name: list.Name, Levels: list.Levels, Writing: cloneWriting(list.Writing), Words: plainWords(list.Words)})
		}
	}
	return file.Encode()
}

// Encode writes the file as EncodePackFile does. A file read back with DecodePackFile is written again byte for byte,
// whatever the spacing and order of keys it was read from.
func (file *PackFile) Encode() ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(file); err != nil {
		return nil, err
	}
	return separatorsAsJavaScript(buffer.Bytes()), nil
}

// separatorsAsJavaScript writes U+2028 and U+2029 as themselves, as JSON.stringify does, where encoding/json always
// escapes them. A backslash escaped before "u2028" is left as it is.
func separatorsAsJavaScript(encoded []byte) []byte {
	if !bytes.Contains(encoded, []byte(`\u202`)) {
		return encoded
	}
	out := make([]byte, 0, len(encoded))
	for i := 0; i < len(encoded); i++ {
		if encoded[i] != '\\' || i+1 == len(encoded) {
			out = append(out, encoded[i])
			continue
		}
		switch rest := encoded[i+1:]; {
		case bytes.HasPrefix(rest, []byte("u2028")):
			out = append(out, " "...)
			i += 5
		case bytes.HasPrefix(rest, []byte("u2029")):
			out = append(out, " "...)
			i += 5
		default:
			out = append(out, encoded[i], encoded[i+1])
			i++
		}
	}
	return out
}

// first is the first byte of a JSON value other than white space, or 0 for none (a field left out).
func first(raw json.RawMessage) byte {
	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) == 0 {
		return 0
	}
	return trimmed[0]
}

func readObject(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	var fields map[string]json.RawMessage
	return fields, first(raw) == '{' && json.Unmarshal(raw, &fields) == nil
}

func readArray(raw json.RawMessage) ([]json.RawMessage, bool) {
	var items []json.RawMessage
	return items, first(raw) == '[' && json.Unmarshal(raw, &items) == nil
}

func readString(raw json.RawMessage) (string, bool) {
	var value string
	return value, first(raw) == '"' && json.Unmarshal(raw, &value) == nil
}

func readStrings(raw json.RawMessage) ([]string, bool) {
	items, ok := readArray(raw)
	values := make([]string, 0, len(items))
	for _, item := range items {
		value, isString := readString(item)
		if !isString {
			return nil, false
		}
		values = append(values, value)
	}
	return values, ok
}

// absent tells whether an optional field is left out or null, which decodePackFile reads the same.
func absent(raw json.RawMessage) bool {
	return first(raw) == 0 || strings.TrimSpace(string(raw)) == "null"
}

// DecodePackFile follows decodePackFile (src/core/packFile.ts): only the shape is checked, and anything else is
// packFileUnreadable. Fields Typle does not know are dropped; an optional field that is null is read as left out. A
// file without lists is unreadable, as no pack can be empty. One byte order mark at the start is dropped.
func DecodePackFile(data []byte) (*PackFile, error) {
	unreadable := &Error{Key: "packFileUnreadable"}
	// The app reads the file with Blob.text(), which drops a byte order mark at the start.
	top, ok := readObject(bytes.TrimPrefix(data, []byte("\uFEFF")))
	if !ok {
		return nil, unreadable
	}
	format, isString := readString(top["format"])
	var version float64
	isVersion := strings.ContainsRune("-0123456789", rune(first(top["version"]))) && json.Unmarshal(top["version"], &version) == nil
	info, isPack := readObject(top["pack"])
	items, isLists := readArray(top["lists"])
	if !isString || format != packFileFormat || !isVersion || version != 1 || !isPack || !isLists || len(items) == 0 {
		return nil, unreadable
	}
	file := &PackFile{Format: packFileFormat, Version: 1, Lists: make([]PackFileList, 0, len(items))}
	if file.Pack.Name, ok = readString(info["name"]); !ok {
		return nil, unreadable
	}
	for key, value := range map[string]*string{"description": &file.Pack.Description, "category": &file.Pack.Category} {
		if !absent(info[key]) {
			if *value, ok = readString(info[key]); !ok {
				return nil, unreadable
			}
		}
	}
	if !absent(info["tags"]) {
		if file.Pack.Tags, ok = readStrings(info["tags"]); !ok {
			return nil, unreadable
		}
	}
	for _, item := range items {
		list, ok := readPackFileList(item)
		if !ok {
			return nil, unreadable
		}
		file.Lists = append(file.Lists, list)
	}
	return file, nil
}

// readPackFileList reads a list of a pack file as DecodePackFile does: false when its shape is not that of one.
func readPackFileList(item json.RawMessage) (PackFileList, bool) {
	fields, ok := readObject(item)
	if !ok {
		return PackFileList{}, false
	}
	var list PackFileList
	var isName bool
	list.Name, isName = readString(fields["name"])
	words, isWords := readArray(fields["words"])
	if !isName || !isWords {
		return PackFileList{}, false
	}
	if !absent(fields["levels"]) {
		if list.Levels, ok = readStrings(fields["levels"]); !ok {
			return PackFileList{}, false
		}
	}
	if !absent(fields["writing"]) {
		var err error
		if list.Writing, err = writingOf(fields["writing"]); err != nil {
			return PackFileList{}, false
		}
	}
	list.Words = make([]Word, 0, len(words))
	for _, raw := range words {
		word, ok := readObject(raw)
		display, isDisplay := readString(word["display"])
		input, isInput := readString(word["input"])
		annotation, isAnnotation := readString(word["annotation"])
		inputType, typeErr := readInputType(word["input_type"])
		if !ok || !isDisplay || !isInput || !isAnnotation || typeErr != nil {
			return PackFileList{}, false
		}
		list.Words = append(list.Words, Word{Display: display, Input: input, Annotation: annotation, InputType: inputType})
	}
	return list, true
}
