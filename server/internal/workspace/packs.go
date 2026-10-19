package workspace

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

// Copies of src/plugins/packs, checked against the originals by TestPacksMatchApp.
//
//go:generate cp ../../../src/plugins/packs/samples.json ../../../src/plugins/packs/countries.json packs/
var (
	//go:embed packs/samples.json
	samplesJSON []byte
	//go:embed packs/countries.json
	countriesJSON []byte
)

// Initial is the workspace before anything is saved: the lists of initialLists in src/plugins/packs/index.ts and no
// registered devices.
func Initial() (*Workspace, error) {
	var samples []*rawList
	var countries *rawList
	if err := json.Unmarshal(samplesJSON, &samples); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(countriesJSON, &countries); err != nil {
		return nil, err
	}
	for index, list := range samples {
		id := fmt.Sprintf("sample-%d", index+1)
		list.ID = &id
		list.Records = []*rawRecord{}
	}
	lists, err := decodeLists(append(samples, countries))
	if err != nil {
		return nil, fmt.Errorf("initial lists: %w", err)
	}
	return &Workspace{Lists: lists, Devices: []Device{}}, nil
}
