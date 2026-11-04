package workspace

import (
	"embed"
	"encoding/json"
	"fmt"
)

// Copies of src/plugins/packs, made by scripts/generate-packs.cjs (npm run packs:generate) and checked against the
// originals by TestPacksMatchApp.
//
//go:generate node ../../../scripts/generate-packs.cjs
var (
	//go:embed packs/samples.json
	samplesJSON []byte
	//go:embed packs/countries.json
	countriesJSON []byte
	//go:embed packs/commands/*.json
	commandFiles embed.FS
)

// Initial is the workspace before anything is saved: no packs, lists or registered devices, as initialLibrary in
// src/plugins/packs/index.ts is since v0.98.0. Official packs are followed from the catalog (see OfficialPacks).
func Initial() (*Workspace, error) {
	return &Workspace{Packs: []Pack{}, Lists: []List{}, Devices: []Device{}}, nil
}

// OfficialPacks follows officialPacks (src/plugins/packs/catalog.ts): the packs of officialLibrary
// (src/plugins/packs/index.ts), made of the lists of initialLists as lists saved before packs existed are, each with
// its lists in the saved shape. Each pack's catalog id is its own id, at version 1. Every call reads them anew, so the
// caller may change what it gets.
func OfficialPacks() ([]OfficialPack, error) {
	var samples []*rawList
	var countries []*rawList
	if err := json.Unmarshal(samplesJSON, &samples); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(countriesJSON, &countries); err != nil {
		return nil, err
	}
	commands, err := commandLists()
	if err != nil {
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

// commandLists reads the official lists of packs/commands, one file each, in the order of its manifest.
func commandLists() ([]*rawList, error) {
	manifest, err := commandFiles.ReadFile("packs/commands/manifest.json")
	if err != nil {
		return nil, err
	}
	var names []string
	if err := json.Unmarshal(manifest, &names); err != nil {
		return nil, err
	}
	var commands []*rawList
	for _, name := range names {
		data, err := commandFiles.ReadFile("packs/commands/" + name)
		if err != nil {
			return nil, err
		}
		var list rawList
		if err := json.Unmarshal(data, &list); err != nil {
			return nil, fmt.Errorf("official list %s: %w", name, err)
		}
		commands = append(commands, &list)
	}
	return commands, nil
}
