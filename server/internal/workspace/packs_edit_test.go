package workspace

import (
	"testing"
)

// The cases follow tests/packFile.test.cjs and tests/packEditing.test.cjs.

const packStamp = "2026-10-01T00:00:00.000Z"

func listIDs(w *Workspace) []string {
	ids := make([]string, 0, len(w.Lists))
	for _, list := range w.Lists {
		ids = append(ids, list.ID)
	}
	return ids
}

func packIDs(w *Workspace) []string {
	ids := make([]string, 0, len(w.Packs))
	for _, pack := range w.Packs {
		ids = append(ids, pack.ID)
	}
	return ids
}

func TestOfficialPacksHaveOrigin(t *testing.T) {
	official, err := OfficialPacks()
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range official {
		if pack := entry.Pack; pack.Origin == nil || pack.Origin.CatalogID != pack.ID || pack.Origin.Version != 1 || pack.Origin.Followed {
			t.Fatalf("pack %s: origin = %+v", pack.ID, pack.Origin)
		}
	}
}

func TestDecodePackFileDropsAByteOrderMark(t *testing.T) {
	text := packFileText(`[{"name":"L","words":[{"display":"a","input":"a","annotation":""}]}]`, `{"name":"P"}`)
	if file, err := DecodePackFile([]byte("\uFEFF" + text)); err != nil || file.Pack.Name != "P" {
		t.Fatalf("file = %+v, %v", file, err)
	}
	_, err := DecodePackFile([]byte("\uFEFF\uFEFF" + text))
	wantKey(t, err, "packFileUnreadable")
}
