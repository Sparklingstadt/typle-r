package api

import (
	"encoding/json"
	"slices"
)

// withFields writes value's JSON object (such as a record in its stored shape) with more fields after its own, in the
// order of their names.
func withFields(value any, fields map[string]any) (json.RawMessage, error) {
	object, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	slices.Sort(names)
	out := object[:len(object)-1]
	for _, name := range names {
		key, _ := json.Marshal(name)
		field, err := json.Marshal(fields[name])
		if err != nil {
			return nil, err
		}
		out = append(append(append(append(out, ','), key...), ':'), field...)
	}
	return append(out, '}'), nil
}
