package workspace

import (
	"slices"
)

// Editing packs follows src/core/packEditing.ts and src/core/packFile.ts. Each function checks everything before it
// changes w, so w is left as it was when it refuses. The lists it adds or changes carry their pack's category and tags,
// as Decode gives them (see viewLists), so that ApplyListChange keeps the packs as they were made.
//
// Where the app refuses with a plain error (validateLibrary's "Invalid packs", or tidyLevels), the API needs a key: a
// pack's fields past their limits are invalidPack, and a list's levels past theirs invalidList, as its other fields are,
// but for more than one level, which is tooManyLevels as in the app.

// packMissing is the app's packDeleted, under the key the API answers with.
func packMissing() error { return &Error{Key: "packNotFound"} }

// packIndex is where the pack id is in w.Packs, or -1.
func packIndex(w *Workspace, id string) int {
	return slices.IndexFunc(w.Packs, func(pack Pack) bool { return pack.ID == id })
}

// levelPath follows levelPath (src/core/packEditing.ts): the levels the practice screen picks a list of a pack by, or
// its name when it has none.
func levelPath(name string, levels []string) []string {
	if len(levels) > 0 {
		return levels
	}
	return []string{name}
}

// pathsOverlap follows pathsOverlap (src/core/packEditing.ts): two paths that are equal, or one the start of the other,
// leave one of their lists out of reach.
func pathsOverlap(a, b []string) bool {
	if len(a) > len(b) {
		a, b = b, a
	}
	return slices.Equal(a, b[:len(a)])
}

func cloneWriting(writing *Writing) *Writing {
	if writing == nil {
		return nil
	}
	return &Writing{Language: writing.Language}
}

// plainWords copies words without the fields Typle does not know, as wordsOf (src/core/packFile.ts) does.
func plainWords(words []Word) []Word {
	plain := make([]Word, 0, len(words))
	for _, word := range words {
		plain = append(plain, Word{Display: word.Display, Input: word.Input, Annotation: word.Annotation, InputType: word.InputType})
	}
	return plain
}
