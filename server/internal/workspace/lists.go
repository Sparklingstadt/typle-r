package workspace

import (
	"slices"
	"strings"
	"time"
)

// ListInput is a list as a request gives it. A field left out (nil) is not changed; an empty words array is given and
// refused. An empty category or tags array removes them, as an empty levels array removes the levels. PackID puts a new
// list in that pack, or moves a list there; a new list without one starts a pack of its own.
type ListInput struct {
	Name     *string   `json:"name"`
	PackID   *string   `json:"packId"`
	Category *string   `json:"category"`
	Tags     *[]string `json:"tags"`
	Levels   *[]string `json:"levels"`
	Words    []Word    `json:"words"`
}

func missing() error { return &Error{Key: "listNotFound"} }

func index(w *Workspace, id string) int {
	return slices.IndexFunc(w.Lists, func(list List) bool { return list.ID == id })
}

// checkName follows validateList and saveList (src/core/wordLists.ts): a name, not used by another list in any case.
// Names only have to differ within the pack packID; with no pack ("", a list not in one yet) they differ from every
// list's. It returns the name to save, without the spaces around it.
func checkName(w *Workspace, name *string, self, packID string) (string, error) {
	if name == nil || trimJS(*name) == "" {
		return "", &Error{Key: "listNameRequired"}
	}
	trimmed := trimJS(*name)
	folded := lowerCase(trimmed)
	for _, other := range w.Lists {
		if other.ID != self && (packID == "" || other.PackID == packID) && lowerCase(trimJS(other.Name)) == folded {
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
		if trimJS(word.Display) == "" || trimJS(word.Input) == "" {
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

// checkLabels follows normalizeLabels (src/core/wordLists.ts): the category and tags trimmed, without empty tags or a
// tag repeated in another case, within MaxCategory, MaxTag and MaxTags.
func checkLabels(category string, tags []string) (string, []string, error) {
	category = trimJS(category)
	var kept []string
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = trimJS(tag)
		if tag == "" || seen[lowerCase(tag)] {
			continue
		}
		seen[lowerCase(tag)] = true
		kept = append(kept, tag)
	}
	if length(category) > MaxCategory || len(kept) > MaxTags || strings.ContainsRune(category, 0) ||
		slices.ContainsFunc(kept, func(tag string) bool { return length(tag) > MaxTag || strings.ContainsRune(tag, 0) }) {
		return "", nil, &Error{Key: "invalidList"}
	}
	return category, kept, nil
}

// CreateList adds a list with no records after the others. With a PackID it joins that pack, whose labels it shows,
// so it may not be given a category or tags; without one it starts a pack of its own, which ApplyListChange makes.
func CreateList(w *Workspace, input ListInput, id string, now time.Time) (*List, error) {
	var pack *Pack
	if input.PackID != nil {
		if input.Category != nil || input.Tags != nil {
			return nil, &Error{Key: "invalidList"}
		}
		if pack = findPack(w, *input.PackID); pack == nil {
			return nil, packMissing()
		}
		if err := refuseFollowed(w, pack.ID); err != nil {
			return nil, err
		}
	}
	if len(w.Lists) >= MaxLists {
		return nil, &Error{Key: "listLimit"}
	}
	packID := ""
	if pack != nil {
		packID = pack.ID
	}
	name, err := checkName(w, input.Name, "", packID)
	if err != nil {
		return nil, err
	}
	if err := checkWords(input.Words); err != nil {
		return nil, err
	}
	var category string
	var tags []string
	if pack != nil {
		category, tags = pack.Category, slices.Clone(pack.Tags)
	} else {
		if input.Category != nil {
			category = *input.Category
		}
		if input.Tags != nil {
			tags = *input.Tags
		}
		if category, tags, err = checkLabels(category, tags); err != nil {
			return nil, err
		}
	}
	var levels []string
	if input.Levels != nil {
		if levels, err = tidyLevels(*input.Levels); err != nil {
			return nil, err
		}
	}
	if pack != nil {
		if err := checkReach(w, pack.ID, "", name, levels); err != nil {
			return nil, err
		}
	}
	w.Lists = append(w.Lists, List{ID: id, Name: name, Levels: levels, PackID: packID, Category: category, Tags: tags, Words: input.Words,
		Records: []Record{}, CreatedAt: FormatTime(now)})
	return &w.Lists[len(w.Lists)-1], nil
}

// UpdateList renames a list, changes its levels, its category or tags (those of its pack), or its words, or moves it to
// the pack PackID, as saveListInPack (src/core/packEditing.ts) does. Its records and creation time stay, and its place
// while it stays in its pack; a list that moves goes right after the last list of the pack it joins, and shows that
// pack's labels. A pack it leaves empty is removed.
func UpdateList(w *Workspace, id string, input ListInput) (*List, error) {
	at := index(w, id)
	if at < 0 {
		return nil, missing()
	}
	list := w.Lists[at]
	target := list.PackID
	var pack *Pack
	if input.PackID != nil {
		if pack = findPack(w, *input.PackID); pack == nil {
			return nil, packMissing()
		}
		target = pack.ID
	}
	// Neither the pack the list is in nor, when it is moved, the pack it joins may be followed.
	if err := refuseFollowed(w, list.PackID); err != nil {
		return nil, err
	}
	if err := refuseFollowed(w, target); err != nil {
		return nil, err
	}
	moving := target != list.PackID
	name := list.Name
	if input.Name != nil || moving {
		given := input.Name
		if given == nil {
			given = &list.Name
		}
		checked, err := checkName(w, given, id, target)
		if err != nil {
			return nil, err
		}
		name = checked
	}
	if input.Name != nil && !moving && followsRename(w, list) {
		// ApplyListChange renames a pack of one list after it, so the new name may not be another pack's either: repair
		// would otherwise rename that pack. The list's name is what the request asked for, so it is the one refused.
		for _, other := range w.Packs {
			if other.ID != list.PackID && nameKey(other.Name) == nameKey(name) {
				return nil, &Error{Key: "listNameDuplicate"}
			}
		}
	}
	category, tags := list.Category, list.Tags
	if moving {
		category, tags = pack.Category, slices.Clone(pack.Tags)
	}
	if input.Category != nil {
		category = *input.Category
	}
	if input.Tags != nil {
		tags = *input.Tags
	}
	category, tags, err := checkLabels(category, tags)
	if err != nil {
		return nil, err
	}
	if input.Words != nil {
		if err := checkWords(input.Words); err != nil {
			return nil, err
		}
		list.Words = input.Words
	}
	levels := list.Levels
	if input.Levels != nil {
		if levels, err = tidyLevels(*input.Levels); err != nil {
			return nil, err
		}
	}
	// Only a new name, new levels or a move can leave a list of the pack out of reach.
	if target != "" && (input.Name != nil || input.Levels != nil || moving) {
		if err := checkReach(w, target, id, name, levels); err != nil {
			return nil, err
		}
	}
	source := list.PackID
	list.Name, list.Levels, list.PackID, list.Category, list.Tags = name, levels, target, category, tags
	if !moving {
		w.Lists[at] = list
		return &w.Lists[at], nil
	}
	others := slices.Delete(slices.Clone(w.Lists), at, at+1)
	end := -1
	for i, other := range others {
		if other.PackID == target {
			end = i
		}
	}
	w.Lists = slices.Insert(others, end+1, list)
	if !slices.ContainsFunc(w.Lists, func(other List) bool { return other.PackID == source }) {
		w.Packs = slices.DeleteFunc(w.Packs, func(other Pack) bool { return other.ID == source })
	}
	return &w.Lists[end+1], nil
}

// followsRename tells whether ApplyListChange makes the pack of list follow a rename of it: the list is alone in its
// pack, which has its name.
func followsRename(w *Workspace, list List) bool {
	pack := findPack(w, list.PackID)
	if pack == nil || nameKey(pack.Name) != nameKey(list.Name) {
		return false
	}
	return !slices.ContainsFunc(w.Lists, func(other List) bool { return other.PackID == list.PackID && other.ID != list.ID })
}

// DeleteList removes a list with its records. A list of a followed pack goes only with its pack (DeletePack).
func DeleteList(w *Workspace, id string) error {
	at := index(w, id)
	if at < 0 {
		return missing()
	}
	if err := refuseFollowed(w, w.Lists[at].PackID); err != nil {
		return err
	}
	w.Lists = slices.Delete(w.Lists, at, at+1)
	return nil
}
