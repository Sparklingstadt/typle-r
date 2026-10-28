package workspace

import (
	"crypto/rand"
	"fmt"
	"slices"
	"time"
)

// The limits of validateLists (src/core/workspaceRequest.ts) and MAX_LISTS (src/core/listOverview.ts). Lengths are in
// UTF-16 code units, as JavaScript measures them.
const (
	MaxLists      = 150
	MaxListName   = 200
	MaxWords      = 1000
	MaxWordText   = 1000
	MaxAnnotation = 2000
	MaxRecords    = 10000
	// The limits of a list's category and tags (MAX_CATEGORY, MAX_TAG and MAX_TAGS in src/core/wordLists.ts).
	MaxCategory = 50
	MaxTag      = 50
	MaxTags     = 20
	// The limit of the group a list saved by an app that does not know packs may have (MAX_GROUP in
	// src/core/wordLists.ts): it becomes the name of a pack when the lists are read.
	MaxGroup = 200
	// The limits of a list's levels (MAX_LEVELS, MAX_SAVED_LEVELS and MAX_LEVEL in src/core/wordLists.ts). A list has one
	// level at most; an app before v0.97.0 let it have up to MaxSavedLevels, which are still read and joined into one
	// (collapseLevels).
	MaxLevels      = 1
	MaxSavedLevels = 5
	MaxLevel       = 50
	// The app saves the lists with its devices, revision and account in one request of at most 1 MiB
	// (MAX_WORKSPACE_BYTES), so the lists written here leave 128 KiB for the rest.
	MaxListsBytes = 896 << 10
)

// Error is a change the request asked for that cannot be made. Key is the error key the API answers with; Line, when
// not 0, is the line of a word file the error is on.
type Error struct {
	Key  string
	Line int
}

func (e *Error) Error() string { return e.Key }

// The stored shape of a list. Words and records always have their arrays; a record leaves out what it does not have.
// The category and tags belong to the list's pack, so Encode leaves them out (see EncodePacks); only EncodeWithLabels
// writes them, and the group.
type storedList struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	PackID    string      `json:"packId,omitempty"`
	Levels    *[]string   `json:"levels,omitempty"`
	Group     string      `json:"group,omitempty"`
	Category  string      `json:"category,omitempty"`
	Tags      []string    `json:"tags,omitempty"`
	CreatedAt string      `json:"createdAt"`
	Words     []Word      `json:"words"`
	Records   []Record    `json:"records"`
	Origin    *ListOrigin `json:"origin,omitempty"`
	extra     string
}

func (l storedList) MarshalJSON() ([]byte, error) {
	type plain storedList
	known, err := marshal(plain(l))
	return withExtra(known, l.extra), err
}

// Encode writes lists as the app saves them in the lists column, which its decodeLists reads back.
func Encode(lists []List) ([]byte, error) {
	return encodeLists(lists, false)
}

// EncodeWithLabels writes lists as an app that does not know packs saves them: each with its group, category and tags,
// which Decode moves into packs when it reads them (see DecodeLists).
func EncodeWithLabels(lists []List) ([]byte, error) {
	return encodeLists(lists, true)
}

func encodeLists(lists []List, labels bool) ([]byte, error) {
	stored := make([]storedList, 0, len(lists))
	for _, list := range lists {
		words, records := list.Words, list.Records
		if words == nil {
			words = []Word{}
		}
		if records == nil {
			records = []Record{}
		}
		item := storedList{ID: list.ID, Name: list.Name, PackID: list.PackID, CreatedAt: list.CreatedAt, Words: words, Records: records,
			Origin: list.Origin, extra: list.Extra}
		if list.Levels != nil {
			item.Levels = &list.Levels
		}
		if labels {
			item.Group, item.Category, item.Tags = list.Group, list.Category, list.Tags
		}
		stored = append(stored, item)
	}
	return marshal(stored)
}

// EncodeDevices writes the registered devices as the app saves them in the devices column.
func EncodeDevices(devices []Device) ([]byte, error) {
	if devices == nil {
		devices = []Device{}
	}
	return marshal(devices)
}

// CheckSize refuses lists that grow past MaxListsBytes. A change that leaves them no larger is let through, so an
// oversized workspace can still be made smaller.
func CheckSize(before, after int) error {
	if after > MaxListsBytes && after > before {
		return &Error{Key: "workspaceTooLarge"}
	}
	return nil
}

// CheckLimits refuses lists past the limits of validateLists (src/core/workspaceRequest.ts), which the app applies to
// every save. The group is that of lists sent by an app that does not know packs (DecodeLists). The number of lists is not checked here: it is compared with the saved ones when the change is applied.
func CheckLimits(lists []List) error {
	for _, list := range lists {
		if len(list.Words) > MaxWords || len(list.Records) > MaxRecords || length(list.Name) > MaxListName ||
			length(list.Category) > MaxCategory || len(list.Tags) > MaxTags || length(list.Group) > MaxGroup ||
			slices.ContainsFunc(list.Tags, func(tag string) bool { return length(tag) > MaxTag }) || len(list.Levels) > MaxSavedLevels ||
			slices.ContainsFunc(list.Levels, func(level string) bool { return length(level) > MaxLevel }) {
			return &Error{Key: "invalidWorkspace"}
		}
		for _, word := range list.Words {
			if length(word.Input) > MaxWordText || length(word.Display) > MaxWordText || length(word.Annotation) > MaxAnnotation || !validInputType(word.InputType) {
				return &Error{Key: "invalidWorkspace"}
			}
		}
	}
	return nil
}

// NewID returns a random UUID (version 4), as crypto.randomUUID does in the app.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// FormatTime writes a time as JavaScript's toISOString does.
func FormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}
