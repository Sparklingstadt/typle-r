package workspace

import (
	"crypto/rand"
	"fmt"
	"time"
)

// The limits of validateLists (src/core/workspaceRequest.ts) and MAX_LISTS (src/core/listOverview.ts). Lengths are in
// UTF-16 code units, as JavaScript measures them.
const (
	MaxLists      = 100
	MaxListName   = 200
	MaxWords      = 1000
	MaxWordText   = 1000
	MaxAnnotation = 2000
	MaxRecords    = 10000
	// The app saves the lists with its devices, revision and account in one request of at most 1 MiB
	// (MAX_WORKSPACE_BYTES), so the lists written here leave 128 KiB for the rest.
	MaxListsBytes = 896 << 10
)

// Error is a change the request asked for that cannot be made. Key is the error key the API answers with.
type Error struct{ Key string }

func (e *Error) Error() string { return e.Key }

// The stored shape of a list. Words and records always have their arrays; a record leaves out what it does not have.
type storedList struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	CreatedAt string   `json:"createdAt"`
	Words     []Word   `json:"words"`
	Records   []Record `json:"records"`
	extra     string
}

func (l storedList) MarshalJSON() ([]byte, error) {
	type plain storedList
	known, err := marshal(plain(l))
	return withExtra(known, l.extra), err
}

// Encode writes lists as the app saves them in the lists column, which its decodeLists reads back.
func Encode(lists []List) ([]byte, error) {
	stored := make([]storedList, 0, len(lists))
	for _, list := range lists {
		words, records := list.Words, list.Records
		if words == nil {
			words = []Word{}
		}
		if records == nil {
			records = []Record{}
		}
		stored = append(stored, storedList{ID: list.ID, Name: list.Name, CreatedAt: list.CreatedAt, Words: words, Records: records,
			extra: list.Extra})
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
