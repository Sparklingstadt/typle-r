// Package graph is the GraphQL schema of the app's backend (schema.graphqls) and the code gqlgen generates from it. The
// resolvers are in package web, beside the REST handlers whose checks they share.
package graph

//go:generate go tool gqlgen generate --config gqlgen.yml

import (
	"encoding/json"
	"fmt"
	"io"
)

// JSON is a JSON value kept as its text, so that what Typle does not know of a workspace is answered as stored.
type JSON json.RawMessage

// MarshalGQL writes the value as it is; an empty one is null.
func (j JSON) MarshalGQL(w io.Writer) {
	if len(j) == 0 {
		_, _ = io.WriteString(w, "null")
		return
	}
	_, _ = w.Write(j)
}

// UnmarshalGQL takes the value as gqlgen decoded it from the request (numbers as json.Number, so they keep their text)
// and writes it back as JSON. null is kept as null, so that a part sent as null can be told from one left out.
func (j *JSON) UnmarshalGQL(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("not a JSON value: %w", err)
	}
	*j = data
	return nil
}
