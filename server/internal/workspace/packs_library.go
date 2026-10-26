package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"unicode/utf16"
)

// Word packs follow src/core/wordPacks.ts: every list belongs to one pack, which holds the category and tags the lists
// used to have. The rules here are the app's, so both read the same saved data into the same packs; the fixtures in
// tests/fixtures/packs are checked by both.

// The limits of a pack (MAX_PACK_NAME and MAX_PACK_DESCRIPTION in src/core/wordPacks.ts), in UTF-16 code units.
const (
	MaxPackName        = 200
	MaxPackDescription = 500
)

// Origin is set on a pack added from the official catalog.
type Origin struct {
	CatalogID string  `json:"catalogId"`
	Version   float64 `json:"version"`
}

// Pack is a word pack. Description and Category are "" and Tags nil when it has none, which is how they are stored:
// left out.
type Pack struct {
	ID          string
	Name        string
	Description string
	Category    string
	Tags        []string
	Origin      *Origin
	CreatedAt   string
	// Extra holds the stored fields Typle does not know (see extra.go).
	Extra string
}

type rawOrigin struct {
	CatalogID *string  `json:"catalogId"`
	Version   *float64 `json:"version"`
}

type rawPack struct {
	ID          *string    `json:"id"`
	Name        *string    `json:"name"`
	Description *string    `json:"description"`
	Category    *string    `json:"category"`
	Tags        []*string  `json:"tags"`
	Origin      *rawOrigin `json:"origin"`
	CreatedAt   *string    `json:"createdAt"`
	extra       string
}

func (r *rawPack) UnmarshalJSON(data []byte) (err error) {
	type plain rawPack
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "id", "name", "description", "category", "tags", "origin", "createdAt")
	}
	return err
}

// The stored shape of a pack.
type storedPack struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Category    string   `json:"category,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Origin      *Origin  `json:"origin,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	extra       string
}

func (p storedPack) MarshalJSON() ([]byte, error) {
	type plain storedPack
	known, err := marshal(plain(p))
	return withExtra(known, p.extra), err
}

// EncodePacks writes packs as the app saves them in the packs column, which its decodePacks reads back.
func EncodePacks(packs []Pack) ([]byte, error) {
	stored := make([]storedPack, 0, len(packs))
	for _, pack := range packs {
		stored = append(stored, storedPack{ID: pack.ID, Name: pack.Name, Description: pack.Description, Category: pack.Category,
			Tags: pack.Tags, Origin: pack.Origin, CreatedAt: pack.CreatedAt, extra: pack.Extra})
	}
	return marshal(stored)
}

// decodePacks follows decodePacks (src/core/wordPacks.ts).
func decodePacks(data []byte) ([]Pack, error) {
	var raw []*rawPack
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("packs are not valid: %w", err)
	}
	if raw == nil {
		return nil, errors.New("packs must be an array")
	}
	packs := make([]Pack, 0, len(raw))
	ids := map[string]bool{}
	for index, item := range raw {
		if item == nil || item.ID == nil || *item.ID == "" || ids[*item.ID] || item.Name == nil || item.CreatedAt == nil ||
			(item.Origin != nil && (item.Origin.CatalogID == nil || item.Origin.Version == nil)) {
			return nil, fmt.Errorf("pack %d is invalid", index+1)
		}
		ids[*item.ID] = true
		pack := Pack{ID: *item.ID, Name: *item.Name, CreatedAt: *item.CreatedAt, Extra: item.extra}
		if item.Description != nil {
			pack.Description = *item.Description
		}
		if item.Category != nil {
			pack.Category = *item.Category
		}
		for _, tag := range item.Tags {
			if tag == nil {
				return nil, fmt.Errorf("pack %d: tags must be strings", index+1)
			}
			pack.Tags = append(pack.Tags, *tag)
		}
		if item.Origin != nil {
			pack.Origin = &Origin{CatalogID: *item.Origin.CatalogID, Version: *item.Origin.Version}
		}
		packs = append(packs, pack)
	}
	return packs, nil
}

func nameKey(name string) string { return lowerCase(trimJS(name)) }

// unique follows unique (src/core/workspaceDocument.ts): wanted, or the first variant whose lowercase is not taken.
func unique(taken map[string]bool, wanted string, variant func(count int) string) string {
	value := wanted
	for count := 2; taken[lowerCase(value)]; count++ {
		value = variant(count)
	}
	taken[lowerCase(value)] = true
	return value
}

// numbered gives the variants 名前（2）, 名前（3）… and, as fit in src/core/workspaceDocument.ts does, cuts the name so
// that the whole stays within MaxListName.
func numbered(name string) func(count int) string {
	return func(count int) string {
		suffix := fmt.Sprintf("（%d）", count)
		units := utf16.Encode([]rune(name))
		if keep := MaxListName - length(suffix); len(units) > keep {
			units = units[:max(keep, 0)]
		}
		return trimEndJS(string(utf16.Decode(units))) + suffix
	}
}

// normalizeLabels follows normalizeLabels (src/core/wordLists.ts): the category and tags trimmed, without empty ones or
// a tag repeated in another case; nil when there are no tags.
func normalizeLabels(category string, tags []string) (string, []string) {
	var kept []string
	seen := map[string]bool{}
	for _, tag := range tags {
		value := trimJS(tag)
		if value == "" || seen[lowerCase(value)] {
			continue
		}
		seen[lowerCase(value)] = true
		kept = append(kept, value)
	}
	return trimJS(category), kept
}

// labelsOf follows labelsOf (src/core/wordPacks.ts): the tags of a group may add up to more than a pack holds, so the
// first MaxTags stay.
func labelsOf(category string, tags []string) (string, []string) {
	category, kept := normalizeLabels(category, tags)
	if len(kept) > MaxTags {
		kept = kept[:MaxTags]
	}
	return category, kept
}

func withoutLabels(list List) List {
	list.Group, list.Category, list.Tags = "", "", nil
	return list
}

// earlier tells whether the date a is before b, as Date.parse(a) < Date.parse(b) does: a date that does not parse is
// never before or after another.
func earlier(a, b string) bool {
	at, okA := ParseTime(a)
	bt, okB := ParseTime(b)
	return okA && okB && at.Before(bt)
}

// normalizeLibrary follows normalizeLibrary (src/core/wordPacks.ts): lists saved before packs existed (unconverted)
// are turned into packs, and saved packs are repaired.
func normalizeLibrary(lists []List, packs []Pack, unconverted bool) ([]Pack, []List) {
	if unconverted {
		return convertLibrary(lists)
	}
	return repairLibrary(packs, lists)
}

// convertLibrary follows convertLibrary (src/core/wordPacks.ts): one pack for each group, named after it, and one for
// each list without a group, named after the list.
func convertLibrary(lists []List) ([]Pack, []List) {
	packs := []Pack{}
	packOf := map[string]int{}
	names := map[string]bool{}
	converted := make([]List, 0, len(lists))
	for _, list := range lists {
		group := trimJS(list.Group)
		key := "list:" + list.ID
		if group != "" {
			key = "group:" + group
		}
		at, found := packOf[key]
		if !found {
			members := []List{list}
			if group != "" {
				members = slices.DeleteFunc(slices.Clone(lists), func(item List) bool { return trimJS(item.Group) != group })
			}
			oldest := members[0]
			var tags []string
			for _, member := range members {
				if earlier(member.CreatedAt, oldest.CreatedAt) {
					oldest = member
				}
				tags = append(tags, member.Tags...)
			}
			wanted := group
			if wanted == "" {
				wanted = trimJS(list.Name)
			}
			category, kept := labelsOf(list.Category, tags)
			packs = append(packs, Pack{ID: "pack-" + list.ID, Name: unique(names, wanted, numbered(wanted)), Category: category, Tags: kept,
				CreatedAt: oldest.CreatedAt})
			at = len(packs) - 1
			packOf[key] = at
		}
		list = withoutLabels(list)
		list.PackID = packs[at].ID
		converted = append(converted, list)
	}
	return packs, converted
}

// repairLibrary follows repairLibrary (src/core/wordPacks.ts), which keeps the rules of ownership for data an older app
// saved: every list in one pack, no empty packs, no repeated names.
func repairLibrary(saved []Pack, lists []List) ([]Pack, []List) {
	packs := make([]Pack, 0, len(saved))
	byID := map[string]int{}
	for _, pack := range saved {
		pack.Tags = slices.Clone(pack.Tags)
		byID[pack.ID] = len(packs)
		packs = append(packs, pack)
	}
	// A list without a valid pack gets one of its own, or joins the one a former conversion made for it.
	placed := slices.Clone(lists)
	for i, list := range placed {
		if _, ok := byID[list.PackID]; ok && list.PackID != "" {
			continue
		}
		id := "pack-" + list.ID
		if _, ok := byID[id]; !ok {
			byID[id] = len(packs)
			packs = append(packs, Pack{ID: id, Name: trimJS(list.Name), CreatedAt: list.CreatedAt})
		}
		placed[i].PackID = id
	}
	// Labels an older app left on a list move to the pack only while the pack has none.
	used := map[string]bool{}
	for i, list := range placed {
		pack := &packs[byID[list.PackID]]
		if pack.Category == "" && len(pack.Tags) == 0 {
			pack.Category, pack.Tags = normalizeLabels(list.Category, list.Tags)
		}
		placed[i] = withoutLabels(list)
		used[list.PackID] = true
	}
	names := map[string]bool{}
	kept := make([]Pack, 0, len(packs))
	for _, pack := range packs {
		if used[pack.ID] {
			name := trimJS(pack.Name)
			pack.Name = unique(names, name, numbered(name))
			kept = append(kept, pack)
		}
	}
	listNames := map[string]map[string]bool{}
	for i, list := range placed {
		taken := listNames[list.PackID]
		if taken == nil {
			taken = map[string]bool{}
			listNames[list.PackID] = taken
		}
		name := trimJS(list.Name)
		placed[i].Name = unique(taken, name, numbered(name))
	}
	return kept, placed
}

// viewLists follows viewLists (src/core/wordPacks.ts): each list carries its pack's category and tags, so the code that
// reads them from lists sees what the app's screens see. A list's group is not given: Go does not show it.
func viewLists(w *Workspace) {
	byID := map[string]*Pack{}
	for i := range w.Packs {
		byID[w.Packs[i].ID] = &w.Packs[i]
	}
	for i := range w.Lists {
		if pack := byID[w.Lists[i].PackID]; pack != nil {
			w.Lists[i].Category, w.Lists[i].Tags = pack.Category, slices.Clone(pack.Tags)
		}
	}
}

// ApplyListChange follows applyListChange (src/core/wordPacks.ts): it puts a change made to the lists of previous (the
// workspace as Decode read it) back into the packs. The lists then carry their packs' labels again.
//
// The packs are those of w, which the functions of packs_edit.go change themselves (keeping the lists' labels those of
// their packs); the list functions leave them as previous had them, as applyListChange takes them.
func (w *Workspace) ApplyListChange(previous *Workspace) {
	before := map[string]List{}
	for _, list := range previous.Lists {
		before[list.ID] = list
	}
	names := map[string]string{}
	for _, pack := range previous.Packs {
		names[pack.ID] = pack.Name
	}
	packs := make([]Pack, 0, len(w.Packs))
	for _, pack := range w.Packs {
		var mine, only []List
		for _, list := range w.Lists {
			if list.PackID == pack.ID {
				mine = append(mine, list)
			}
		}
		for _, list := range previous.Lists {
			if list.PackID == pack.ID {
				only = append(only, list)
			}
		}
		next := pack
		next.Tags = slices.Clone(pack.Tags)
		// 1. The first list whose labels differ from the pack's gives the pack its new labels.
		wasCategory, wasTags := labelsOf(pack.Category, pack.Tags)
		for _, list := range mine {
			category, tags := labelsOf(list.Category, list.Tags)
			if category != wasCategory || !slices.Equal(tags, wasTags) {
				next.Category, next.Tags = category, tags
				break
			}
		}
		// 2. A pack of one list follows that list's rename, unless the change renamed the pack itself.
		if name, found := names[pack.ID]; found && name == pack.Name && len(only) == 1 && len(mine) == 1 && mine[0].ID == only[0].ID &&
			nameKey(pack.Name) == nameKey(before[mine[0].ID].Name) {
			next.Name = mine[0].Name
		}
		packs = append(packs, next)
	}
	// 3. Labels of lists in an existing pack were settled in 1, so they are dropped; only a list without a pack keeps
	// them for repair to move.
	known := map[string]bool{}
	for _, pack := range packs {
		known[pack.ID] = true
	}
	lists := make([]List, 0, len(w.Lists))
	for _, list := range w.Lists {
		if list.PackID != "" && known[list.PackID] {
			list = withoutLabels(list)
		}
		lists = append(lists, list)
	}
	w.Packs, w.Lists = repairLibrary(packs, lists)
	viewLists(w)
}

// CheckPacks follows validateLibrary (src/core/wordPacks.ts): it refuses packs and lists that are not in the saved
// shape, with invalidWorkspace.
func CheckPacks(packs []Pack, lists []List) error {
	invalid := &Error{Key: "invalidWorkspace"}
	ids := map[string]bool{}
	names := map[string]bool{}
	for _, pack := range packs {
		name := nameKey(pack.Name)
		if pack.ID == "" || ids[pack.ID] || name == "" || length(pack.Name) > MaxPackName || names[name] ||
			length(pack.Description) > MaxPackDescription || length(pack.Category) > MaxCategory || len(pack.Tags) > MaxTags ||
			slices.ContainsFunc(pack.Tags, func(tag string) bool { return length(tag) > MaxTag }) {
			return invalid
		}
		ids[pack.ID] = true
		names[name] = true
	}
	listNames := map[string]map[string]bool{}
	for _, list := range lists {
		taken := listNames[list.PackID]
		if taken == nil {
			taken = map[string]bool{}
			listNames[list.PackID] = taken
		}
		name := nameKey(list.Name)
		if list.PackID == "" || !ids[list.PackID] || taken[name] || list.Group != "" || list.Category != "" || list.Tags != nil {
			return invalid
		}
		taken[name] = true
	}
	if len(ids) != len(listNames) {
		return invalid
	}
	return nil
}

// CheckLibrary follows validateLibrary (src/core/wordPacks.ts) for a save that sends lists and packs. It reads them as
// they were sent, before Decode repairs them: a list may not have a group, category or tags at all, not even "" or [],
// and a pack's description, category, tags and origin may be left out but not null, as decodePacks requires. Anything
// refused is invalidWorkspace.
func CheckLibrary(lists, packs []byte) error {
	invalid := &Error{Key: "invalidWorkspace"}
	decoded, err := DecodeLists(lists)
	if err != nil || has(lists, func(key string, _ json.RawMessage) bool { return key == "group" || key == "category" || key == "tags" }) ||
		has(packs, func(key string, value json.RawMessage) bool {
			return (key == "description" || key == "category" || key == "tags" || key == "origin") && string(value) == "null"
		}) {
		return invalid
	}
	saved, err := decodePacks(packs)
	if err != nil {
		return invalid
	}
	return CheckPacks(saved, decoded)
}

// has reports whether an object of the JSON array data has a member that found accepts. data that is not an array of
// objects has none; reading it is left to the decoders.
func has(data []byte, found func(key string, value json.RawMessage) bool) bool {
	var items []map[string]json.RawMessage
	if json.Unmarshal(data, &items) != nil {
		return false
	}
	for _, item := range items {
		for key, value := range item {
			if found(key, value) {
				return true
			}
		}
	}
	return false
}
