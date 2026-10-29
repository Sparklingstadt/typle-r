package workspace

import (
	"slices"
	"sync"
)

// Following official packs follows src/core/followedPacks.ts: a followed pack is saved as a pack of the account's, and
// every read makes it equal to its official pack again. The fixtures in tests/fixtures/follow are checked by both.

// OfficialPack is an official pack as the catalog holds it, in the saved shape: its lists have the pack's id as PackID
// and no records.
type OfficialPack struct {
	CatalogID string
	Version   int
	Pack      Pack
	Lists     []List
}

// catalog is the official packs Decode follows, read once. Nothing may change them.
var catalog = sync.OnceValues(OfficialPacks)

// followOfficial follows followOfficial (src/core/followedPacks.ts): it brings a library read from the saved data in
// line with the catalog, in two steps; applying it again changes nothing.
//  1. Copies from before v0.98.0 are removed with their lists and records: a pack with an origin that is not followed,
//     and a pack without an origin whose id is a catalog id.
//  2. Each followed pack is made equal to its official pack (removed when the catalog has none), keeping its id, name,
//     createdAt and the records of the lists it keeps. Its lists take the place of its first list.
func followOfficial(packs []Pack, lists []List, official []OfficialPack) ([]Pack, []List) {
	entries := map[string]*OfficialPack{}
	for i := range official {
		entries[official[i].CatalogID] = &official[i]
	}
	kept := make([]Pack, 0, len(packs))
	for _, pack := range packs {
		if pack.Origin != nil {
			if !pack.Origin.Followed || entries[pack.Origin.CatalogID] == nil {
				continue
			}
			from := entries[pack.Origin.CatalogID].Pack
			pack.Description, pack.Category, pack.Tags = from.Description, from.Category, slices.Clone(from.Tags)
		} else if entries[pack.ID] != nil {
			continue
		}
		kept = append(kept, pack)
	}
	byID := map[string]*Pack{}
	for i := range kept {
		byID[kept[i].ID] = &kept[i]
	}
	synced := map[string][]List{}
	for _, pack := range kept {
		if pack.Origin == nil {
			continue
		}
		var mine []List
		for _, list := range lists {
			if list.PackID == pack.ID {
				mine = append(mine, list)
			}
		}
		var items []List
		for _, item := range entries[pack.Origin.CatalogID].Lists {
			at := slices.IndexFunc(mine, func(list List) bool { return list.Origin != nil && list.Origin.ListID == item.ID })
			var list List
			if at >= 0 {
				list = mine[at]
			} else {
				// The id comes from the official list's, so that the app and Go make the same list.
				list = List{ID: pack.ID + ":" + item.ID, PackID: pack.ID, Records: []Record{}, CreatedAt: item.CreatedAt,
					Origin: &ListOrigin{ListID: item.ID}}
			}
			list.Name, list.Levels, list.Words = item.Name, nil, slices.Clone(item.Words)
			if len(item.Levels) > 0 {
				list.Levels = slices.Clone(item.Levels)
			}
			items = append(items, list)
		}
		synced[pack.ID] = items
	}
	placed := map[string]bool{}
	result := make([]List, 0, len(lists))
	for _, list := range lists {
		pack := byID[list.PackID]
		switch {
		case pack == nil:
		case pack.Origin == nil:
			result = append(result, list)
		case !placed[pack.ID]:
			placed[pack.ID] = true
			result = append(result, synced[pack.ID]...)
		}
	}
	return kept, result
}

// WithoutFollowedWords copies the lists with no words for those of a followed pack, as they are saved since v2.1.0
// (withoutFollowedWords in src/core/followedPacks.ts): the catalog has them, and Decode puts them back (followOfficial).
func WithoutFollowedWords(packs []Pack, lists []List) []List {
	followed := map[string]bool{}
	for i := range packs {
		if packs[i].followed() {
			followed[packs[i].ID] = true
		}
	}
	slim := slices.Clone(lists)
	for i := range slim {
		if followed[slim[i].PackID] && slim[i].Origin != nil {
			slim[i].Words = nil
		}
	}
	return slim
}
