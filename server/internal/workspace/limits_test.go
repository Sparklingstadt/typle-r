package workspace

import (
	"encoding/json"
	"maps"
	"os"
	"path/filepath"
	"testing"
)

// The table is shared with tests/limits.test.cjs, so a limit cannot change on one side only.
func TestLimitsMatchTheApp(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "tests", "fixtures", "limits.json"))
	if err != nil {
		t.Fatal(err)
	}
	var want map[string]int
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}
	got := map[string]int{
		"MAX_LISTS": MaxLists, "MAX_FOLLOWED_PACKS": MaxFollowedPacks, "MAX_LIST_NAME": MaxListName, "MAX_WORDS": MaxWords,
		"MAX_RECORDS": MaxRecords, "MAX_CATEGORY": MaxCategory, "MAX_TAG": MaxTag, "MAX_TAGS": MaxTags, "MAX_GROUP": MaxGroup,
		"MAX_LEVELS": MaxLevels, "MAX_SAVED_LEVELS": MaxSavedLevels, "MAX_LEVEL": MaxLevel, "MAX_INTERESTS": MaxInterests,
		"MAX_INTEREST_LENGTH": MaxInterestLength, "MAX_PACK_NAME": MaxPackName, "MAX_PACK_DESCRIPTION": MaxPackDescription,
		"MAX_DEVICES": maxDevices, "MAX_DEVICE_NAME": maxDeviceName, "MAX_DEVICE_LAYOUT": maxDeviceLayout,
		"MAX_IMPORT_BYTES": MaxImportBytes,
	}
	if !maps.Equal(got, want) {
		t.Fatalf("limits = %v, want %v", got, want)
	}
}
