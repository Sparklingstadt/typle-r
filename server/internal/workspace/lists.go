package workspace

import (
	"slices"
	"strings"
	"time"
)

// ListInput is a list as a request gives it. A field left out (nil) is not changed; an empty words array is given and
// refused.
type ListInput struct {
	Name  *string `json:"name"`
	Words []Word  `json:"words"`
}

func missing() error { return &Error{Key: "listNotFound"} }

func index(w *Workspace, id string) int {
	return slices.IndexFunc(w.Lists, func(list List) bool { return list.ID == id })
}

// checkName follows validateList and saveList (src/core/wordLists.ts): a name, not used by another list in any case.
// It returns the name to save, without the spaces around it.
func checkName(w *Workspace, name *string, self string) (string, error) {
	if name == nil || strings.TrimSpace(*name) == "" {
		return "", &Error{Key: "listNameRequired"}
	}
	trimmed := strings.TrimSpace(*name)
	folded := lowerCase(trimmed)
	for _, other := range w.Lists {
		if other.ID != self && lowerCase(strings.TrimSpace(other.Name)) == folded {
			return "", &Error{Key: "listNameDuplicate"}
		}
	}
	if length(trimmed) > MaxListName || strings.ContainsRune(trimmed, 0) {
		return "", &Error{Key: "invalidList"}
	}
	return trimmed, nil
}

// checkWords follows validateList and the limits of validateLists. Spaces in words are kept: they can be part of
// what is typed. U+0000, which Postgres cannot store in jsonb, is refused with the limits.
func checkWords(words []Word) error {
	if len(words) == 0 {
		return &Error{Key: "wordsRequired"}
	}
	for _, word := range words {
		if strings.TrimSpace(word.Display) == "" || strings.TrimSpace(word.Input) == "" {
			return &Error{Key: "wordFieldsRequired"}
		}
	}
	if len(words) > MaxWords {
		return &Error{Key: "invalidList"}
	}
	for _, word := range words {
		if length(word.Display) > MaxWordText || length(word.Input) > MaxWordText || length(word.Annotation) > MaxAnnotation ||
			strings.ContainsRune(word.Display+word.Input+word.Annotation, 0) {
			return &Error{Key: "invalidList"}
		}
	}
	return nil
}

// CreateList adds a list with no records after the others.
func CreateList(w *Workspace, input ListInput, id string, now time.Time) (*List, error) {
	if len(w.Lists) >= MaxLists {
		return nil, &Error{Key: "listLimit"}
	}
	name, err := checkName(w, input.Name, "")
	if err != nil {
		return nil, err
	}
	if err := checkWords(input.Words); err != nil {
		return nil, err
	}
	w.Lists = append(w.Lists, List{ID: id, Name: name, Words: input.Words, Records: []Record{}, CreatedAt: FormatTime(now)})
	return &w.Lists[len(w.Lists)-1], nil
}

// UpdateList renames a list or replaces its words. Its records, creation time and place stay.
func UpdateList(w *Workspace, id string, input ListInput) (*List, error) {
	at := index(w, id)
	if at < 0 {
		return nil, missing()
	}
	list := &w.Lists[at]
	name := list.Name
	if input.Name != nil {
		checked, err := checkName(w, input.Name, id)
		if err != nil {
			return nil, err
		}
		name = checked
	}
	if input.Words != nil {
		if err := checkWords(input.Words); err != nil {
			return nil, err
		}
		list.Words = input.Words
	}
	list.Name = name
	return list, nil
}

// DeleteList removes a list with its records.
func DeleteList(w *Workspace, id string) error {
	at := index(w, id)
	if at < 0 {
		return missing()
	}
	w.Lists = slices.Delete(w.Lists, at, at+1)
	return nil
}
