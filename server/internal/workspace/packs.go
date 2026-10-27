package workspace

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

// Copies of src/plugins/packs, checked against the originals by TestPacksMatchApp.
//
//go:generate cp ../../../src/plugins/packs/samples.json ../../../src/plugins/packs/countries.json ../../../src/plugins/packs/commands.json packs/
var (
	//go:embed packs/samples.json
	samplesJSON []byte
	//go:embed packs/countries.json
	countriesJSON []byte
	//go:embed packs/commands.json
	commandsJSON []byte
)

// Initial is the workspace before anything is saved, as initialLibrary in src/plugins/packs/index.ts (since v0.100.0):
// every official pack, followed, in the catalog's order, and no registered devices. A pack's id is made from its catalog
// id and each list's from the pack's and the official list's, so the app and Go start every account with the same
// library; tests/fixtures/initial-library.json is checked by both.
func Initial() (*Workspace, error) {
	official, err := OfficialPacks()
	if err != nil {
		return nil, err
	}
	packs := make([]Pack, 0, len(official))
	var lists []List
	for _, entry := range official {
		pack := entry.Pack
		pack.ID = "followed-" + entry.CatalogID
		pack.Origin = &Origin{CatalogID: entry.CatalogID, Version: float64(entry.Version), Followed: true}
		packs = append(packs, pack)
		// followOfficial gives each list its name, levels and words, as a read of the saved workspace does.
		for _, list := range entry.Lists {
			lists = append(lists, List{ID: pack.ID + ":" + list.ID, PackID: pack.ID, Records: []Record{}, CreatedAt: list.CreatedAt,
				Origin: &ListOrigin{ListID: list.ID}})
		}
	}
	packs, lists = followOfficial(packs, lists, official)
	// Read back as a saved workspace is, so that it is the same as the workspace its first save writes.
	encoded, err := Encode(lists)
	if err != nil {
		return nil, err
	}
	encodedPacks, err := EncodePacks(packs)
	if err != nil {
		return nil, err
	}
	return Decode(encoded, []byte("[]"), encodedPacks)
}

// OfficialPacks follows officialPacks (src/plugins/packs/catalog.ts): the packs of officialLibrary
// (src/plugins/packs/index.ts), made of the lists of initialLists as lists saved before packs existed are, each with
// its lists in the saved shape. Each pack's catalog id is its own id, at version 1. Every call reads them anew, so the
// caller may change what it gets.
func OfficialPacks() ([]OfficialPack, error) {
	var samples []*rawList
	var countries []*rawList
	var commands []*rawList
	if err := json.Unmarshal(samplesJSON, &samples); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(countriesJSON, &countries); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(commandsJSON, &commands); err != nil {
		return nil, err
	}
	for index, list := range samples {
		id := fmt.Sprintf("sample-%d", index+1)
		list.ID = &id
		list.Records = []*rawRecord{}
	}
	lists, err := decodeLists(append(append(samples, countries...), commands...))
	if err != nil {
		return nil, fmt.Errorf("official lists: %w", err)
	}
	packs, converted := convertLibrary(lists)
	official := make([]OfficialPack, 0, len(packs))
	for _, pack := range packs {
		pack.Origin = &Origin{CatalogID: pack.ID, Version: 1}
		var mine []List
		for _, list := range converted {
			if list.PackID == pack.ID {
				mine = append(mine, list)
			}
		}
		official = append(official, OfficialPack{CatalogID: pack.ID, Version: 1, Pack: pack, Lists: mine})
	}
	return official, nil
}
