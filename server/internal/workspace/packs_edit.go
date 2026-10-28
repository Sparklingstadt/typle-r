package workspace

import (
	"errors"
	"slices"
	"strings"
	"time"
)

// Editing packs follows src/core/packEditing.ts and src/core/packFile.ts. Each function checks everything before it
// changes w, so w is left as it was when it refuses. The lists it adds or changes carry their pack's category and tags,
// as Decode gives them (see viewLists), so that ApplyListChange keeps the packs as they were made.
//
// Where the app refuses with a plain error (validateLibrary's "Invalid packs", or tidyLevels), the API needs a key: a
// pack's fields past their limits are invalidPack, and a list's levels past theirs invalidList, as its other fields are,
// but for more than one level, which is tooManyLevels as in the app.

// PackListInput is a list of a pack as a request gives it.
type PackListInput struct {
	Name   *string   `json:"name"`
	Levels *[]string `json:"levels"`
	Words  []Word    `json:"words"`
}

// PackInput is a pack as a request gives it. CreatePack takes the fields and Lists; UpdatePack takes the fields and
// ListOrder, and leaves a field that is left out (nil) as it is. An empty category or tags array removes them.
type PackInput struct {
	Name        *string         `json:"name"`
	Description *string         `json:"description"`
	Category    *string         `json:"category"`
	Tags        *[]string       `json:"tags"`
	ListOrder   *[]string       `json:"listOrder"`
	Lists       []PackListInput `json:"lists"`
}

// packMissing is the app's packDeleted, under the key the API answers with.
func packMissing() error { return &Error{Key: "packNotFound"} }

func invalidPack() error { return &Error{Key: "invalidPack"} }

// refuseFollowed follows refuseFollowed (src/core/packEditing.ts): a followed official pack is the catalog's to change,
// so edits to it, or to a list in it, are refused. It can still be deleted (unfollowed) or copied, and its lists' records
// added, changed and deleted.
func refuseFollowed(w *Workspace, packIDs ...string) error {
	for _, id := range packIDs {
		if pack := findPack(w, id); pack != nil && pack.followed() {
			return &Error{Key: "packFollowed"}
		}
	}
	return nil
}

func findPack(w *Workspace, id string) *Pack {
	for i := range w.Packs {
		if w.Packs[i].ID == id {
			return &w.Packs[i]
		}
	}
	return nil
}

// tidyLevels follows tidyLevels (src/core/packEditing.ts): the levels as trimLevels keeps them, one at most
// (tooManyLevels).
func tidyLevels(levels []string) ([]string, error) {
	if len(slices.DeleteFunc(slices.Clone(levels), func(level string) bool { return trimJS(level) == "" })) > MaxLevels {
		return nil, &Error{Key: "tooManyLevels"}
	}
	return trimLevels(levels)
}

// trimLevels follows trimLevels (src/core/packEditing.ts): the levels trimmed, without empty ones, and nil when none is
// left. More than MaxSavedLevels or one longer than MaxLevel is invalidList, as is U+0000.
func trimLevels(levels []string) ([]string, error) {
	var kept []string
	for _, level := range levels {
		if level = trimJS(level); level != "" {
			kept = append(kept, level)
		}
	}
	if len(kept) > MaxSavedLevels ||
		slices.ContainsFunc(kept, func(level string) bool { return length(level) > MaxLevel || strings.ContainsRune(level, 0) }) {
		return nil, &Error{Key: "invalidList"}
	}
	return kept, nil
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

// checkReach refuses with levelsConflict a list (named name, with levels) of the pack packID whose path overlaps that
// of another list of the pack than self.
func checkReach(w *Workspace, packID, self, name string, levels []string) error {
	path := levelPath(name, levels)
	for _, other := range w.Lists {
		if other.ID != self && other.PackID == packID && pathsOverlap(levelPath(other.Name, other.Levels), path) {
			return &Error{Key: "levelsConflict"}
		}
	}
	return nil
}

// checkPackName follows packFields (src/core/packEditing.ts): a name, not used by another pack than self in any case.
func checkPackName(w *Workspace, name *string, self string) (string, error) {
	if name == nil || trimJS(*name) == "" {
		return "", &Error{Key: "packNameRequired"}
	}
	trimmed := trimJS(*name)
	for _, other := range w.Packs {
		if other.ID != self && nameKey(other.Name) == nameKey(trimmed) {
			return "", &Error{Key: "packNameDuplicate"}
		}
	}
	return trimmed, nil
}

// checkPack refuses a pack past the limits validateLibrary (src/core/wordPacks.ts) keeps, or with U+0000, which
// Postgres cannot store in jsonb.
func checkPack(pack Pack) error {
	if length(pack.Name) > MaxPackName || length(pack.Description) > MaxPackDescription || length(pack.Category) > MaxCategory ||
		len(pack.Tags) > MaxTags || slices.ContainsFunc(pack.Tags, func(tag string) bool { return length(tag) > MaxTag }) ||
		strings.ContainsRune(pack.Name+pack.Description+pack.Category+strings.Join(pack.Tags, ""), 0) {
		return invalidPack()
	}
	return nil
}

// newLists checks the lists of a new pack packID as createPack does, each against those before it, and returns them as
// they are saved: names trimmed, levels tidied, words as given but without fields Typle does not know, no records, and
// created now. With separate (a file, as addPackFile reads it), several levels of a list are joined into one and
// levels that overlap are told apart (separateLevels) instead of refused.
func newLists(packID string, inputs []PackListInput, ids []string, now time.Time, separate bool) ([]List, error) {
	if len(ids) != len(inputs) {
		return nil, errors.New("one list id is needed for each list")
	}
	scratch := &Workspace{}
	for n, input := range inputs {
		name, err := checkName(scratch, input.Name, "", packID)
		if err != nil {
			return nil, err
		}
		if err := checkWords(input.Words); err != nil {
			return nil, err
		}
		var levels []string
		if input.Levels != nil {
			tidy := tidyLevels
			if separate {
				tidy = trimLevels
			}
			if levels, err = tidy(*input.Levels); err != nil {
				return nil, err
			}
		}
		if !separate {
			if err := checkReach(scratch, packID, "", name, levels); err != nil {
				return nil, err
			}
		}
		scratch.Lists = append(scratch.Lists, List{ID: ids[n], Name: name, Levels: levels, PackID: packID, Words: plainWords(input.Words),
			Records: []Record{}, CreatedAt: FormatTime(now)})
	}
	if separate {
		return separateLevels(scratch.Lists), nil
	}
	return scratch.Lists, nil
}

// plainWords copies words without the fields Typle does not know, as wordsOf (src/core/packFile.ts) does.
func plainWords(words []Word) []Word {
	plain := make([]Word, 0, len(words))
	for _, word := range words {
		plain = append(plain, Word{Display: word.Display, Input: word.Input, Annotation: word.Annotation, InputType: word.InputType})
	}
	return plain
}

// addPack puts pack at the end of the packs and its lists after every other list, which then show its labels.
func addPack(w *Workspace, pack Pack, lists []List) *Pack {
	w.Packs = append(w.Packs, pack)
	w.Lists = append(w.Lists, lists...)
	viewLists(w)
	return &w.Packs[len(w.Packs)-1]
}

func checkRoom(w *Workspace, count int) error {
	if len(w.Lists)+count > MaxLists {
		return &Error{Key: "listLimit"}
	}
	return nil
}

// CreatePack follows createPack (src/core/packEditing.ts) for a pack of one or more lists: the pack goes after the
// others, and its lists after every list.
func CreatePack(w *Workspace, input PackInput, packID string, listIDs []string, now time.Time) (*Pack, error) {
	name, err := checkPackName(w, input.Name, "")
	if err != nil {
		return nil, err
	}
	if len(input.Lists) == 0 || input.ListOrder != nil {
		return nil, invalidPack()
	}
	if err := checkRoom(w, len(input.Lists)); err != nil {
		return nil, err
	}
	lists, err := newLists(packID, input.Lists, listIDs, now, false)
	if err != nil {
		return nil, err
	}
	pack := Pack{ID: packID, Name: name, CreatedAt: FormatTime(now)}
	if input.Description != nil {
		pack.Description = trimJS(*input.Description)
	}
	var category string
	var tags []string
	if input.Category != nil {
		category = *input.Category
	}
	if input.Tags != nil {
		tags = *input.Tags
	}
	pack.Category, pack.Tags = normalizeLabels(category, tags)
	if err := checkPack(pack); err != nil {
		return nil, err
	}
	return addPack(w, pack, lists), nil
}

// UpdatePack follows updatePack and reorderPackLists (src/core/packEditing.ts). ListOrder is the pack's lists in their
// new order; it may be stale, so ids the pack does not hold are dropped and its lists not given keep their saved order
// after the given ones. The pack's lists keep the places in the lists they had.
func UpdatePack(w *Workspace, id string, input PackInput) (*Pack, error) {
	at := slices.IndexFunc(w.Packs, func(pack Pack) bool { return pack.ID == id })
	if at < 0 {
		return nil, packMissing()
	}
	if err := refuseFollowed(w, id); err != nil {
		return nil, err
	}
	pack := w.Packs[at]
	if input.Lists != nil {
		return nil, invalidPack()
	}
	if input.Name != nil {
		name, err := checkPackName(w, input.Name, id)
		if err != nil {
			return nil, err
		}
		pack.Name = name
	}
	if input.Description != nil {
		pack.Description = trimJS(*input.Description)
	}
	category, tags := pack.Category, pack.Tags
	if input.Category != nil {
		category = *input.Category
	}
	if input.Tags != nil {
		tags = *input.Tags
	}
	pack.Category, pack.Tags = normalizeLabels(category, tags)
	if err := checkPack(pack); err != nil {
		return nil, err
	}
	w.Packs[at] = pack
	if input.ListOrder != nil {
		reorder(w, id, *input.ListOrder)
	}
	viewLists(w)
	return &w.Packs[at], nil
}

func reorder(w *Workspace, packID string, ids []string) {
	byID := map[string]List{}
	var mine []string
	for _, list := range w.Lists {
		if list.PackID == packID {
			byID[list.ID] = list
			mine = append(mine, list.ID)
		}
	}
	var order []string
	for _, id := range ids {
		if _, ok := byID[id]; ok && !slices.Contains(order, id) {
			order = append(order, id)
		}
	}
	for _, id := range mine {
		if !slices.Contains(order, id) {
			order = append(order, id)
		}
	}
	next := 0
	for i, list := range w.Lists {
		if list.PackID == packID {
			w.Lists[i] = byID[order[next]]
			next++
		}
	}
}

// DeletePack removes a pack with its lists and their records.
func DeletePack(w *Workspace, id string) error {
	if findPack(w, id) == nil {
		return packMissing()
	}
	w.Packs = slices.DeleteFunc(w.Packs, func(pack Pack) bool { return pack.ID == id })
	w.Lists = slices.DeleteFunc(w.Lists, func(list List) bool { return list.PackID == id })
	return nil
}

// CopyPack follows copyPack (src/core/packFile.ts): a copy of the pack right after it, with its description, labels and
// lists (their names, levels and words), but no records, origins (of the pack or its lists) or fields Typle does not
// know, so a copy of a followed pack is the account's own. Its lists come after every other list. Without a name, the
// copy is named as copyName names a copied list: （コピー）, then （コピー2）… among the packs. A name given is checked
// as CreatePack checks one.
func CopyPack(w *Workspace, sourceID string, name *string, packID string, listIDs []string, now time.Time) (*Pack, error) {
	at := slices.IndexFunc(w.Packs, func(pack Pack) bool { return pack.ID == sourceID })
	if at < 0 {
		return nil, packMissing()
	}
	source := w.Packs[at]
	var mine []List
	for _, list := range w.Lists {
		if list.PackID == sourceID {
			mine = append(mine, list)
		}
	}
	if len(listIDs) != len(mine) {
		return nil, errors.New("one list id is needed for each list")
	}
	if err := checkRoom(w, len(mine)); err != nil {
		return nil, err
	}
	pack := Pack{ID: packID, Description: source.Description, Category: source.Category, Tags: slices.Clone(source.Tags),
		CreatedAt: FormatTime(now)}
	if len(pack.Tags) == 0 {
		pack.Tags = nil
	}
	if name == nil {
		names := make([]string, 0, len(w.Packs))
		for _, other := range w.Packs {
			names = append(names, other.Name)
		}
		pack.Name = copyNameAmong(names, source.Name)
	} else {
		checked, err := checkPackName(w, name, "")
		if err != nil {
			return nil, err
		}
		pack.Name = checked
		if err := checkPack(pack); err != nil {
			return nil, err
		}
	}
	created := FormatTime(now)
	lists := make([]List, 0, len(mine))
	for n, list := range mine {
		copied := List{ID: listIDs[n], Name: list.Name, PackID: packID, Words: plainWords(list.Words), Records: []Record{}, CreatedAt: created}
		if len(list.Levels) > 0 {
			copied.Levels = slices.Clone(list.Levels)
		}
		lists = append(lists, copied)
	}
	w.Packs = slices.Insert(w.Packs, at+1, pack)
	w.Lists = append(w.Lists, lists...)
	viewLists(w)
	return &w.Packs[at+1], nil
}
