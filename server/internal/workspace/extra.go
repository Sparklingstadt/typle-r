package workspace

import (
	"bytes"
	"encoding/json"
	"slices"
	"strings"
)

// Typle keeps fields of a stored list, word, record or record's device that it does not know, as the app's
// decodeLists does, so that writing here loses nothing a newer app saved. They are held as one JSON object in a
// string (with sorted keys and compact values), which keeps the types comparable.

// unknown returns the fields of the JSON object data other than known, or "" when there are none.
func unknown(data []byte, known ...string) (string, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return "", err
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		if !slices.Contains(known, key) {
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return "", nil
	}
	slices.Sort(keys)
	var b bytes.Buffer
	b.WriteByte('{')
	for i, key := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		name, err := marshal(key)
		if err != nil {
			return "", err
		}
		b.Write(name)
		b.WriteByte(':')
		if err := json.Compact(&b, fields[key]); err != nil {
			return "", err
		}
	}
	b.WriteByte('}')
	return b.String(), nil
}

// withExtra adds the unknown fields to the JSON object known.
func withExtra(known []byte, extra string) []byte {
	if extra == "" {
		return known
	}
	return append(append(bytes.TrimSuffix(known, []byte("}")), ','), strings.TrimPrefix(extra, "{")...)
}

// marshal writes JSON as JSON.stringify does: without escaping HTML characters, so that sizes match the app's.
func marshal(value any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}
