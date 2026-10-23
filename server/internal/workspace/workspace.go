// Package workspace reads a Typle workspace: the lists and devices of an account, as the app saves them in the
// typle_workspaces table. The checks follow decodeLists (src/core/wordLists.ts) and decodeDevices
// (src/core/devices.ts), so data the app would read is read here and data it would refuse is refused. The one
// difference is that null in an optional field reads as the field left out.
package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"
	"unicode/utf16"
)

const (
	maxDevices      = 100
	maxDeviceID     = 100
	maxDeviceName   = 100
	maxDeviceLayout = 200
	DefaultDeviceID = "default"
)

type Word struct {
	Display    string `json:"display"`
	Input      string `json:"input"`
	Annotation string `json:"annotation"`
	// Extra holds the stored fields Typle does not know (see extra.go).
	Extra string `json:"-"`
}

type Device struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Layout string `json:"layout"`
	// Extra holds the stored fields Typle does not know, of a device copied into a record.
	Extra string `json:"-"`
}

// Record is a practice run as it is stored. Records saved by older versions may have no id, mistakes, accuracy,
// wordCount or device.
type Record struct {
	ID        *string  `json:"id,omitempty"`
	Time      float64  `json:"time"`
	Date      string   `json:"date"`
	Mistakes  *int     `json:"mistakes,omitempty"`
	Accuracy  *float64 `json:"accuracy,omitempty"`
	WordCount *int     `json:"wordCount,omitempty"`
	Device    *Device  `json:"device,omitempty"`
	// At is Date as a time, for ordering and filtering.
	At    time.Time `json:"-"`
	Extra string    `json:"-"`
}

type List struct {
	ID   string
	Name string
	// Category and Tags are "" and nil when the list has none, which is how they are stored: left out.
	Category  string
	Tags      []string
	Words     []Word
	Records   []Record
	CreatedAt string
	Extra     string
}

type Workspace struct {
	Lists   []List
	Devices []Device
}

// Find returns the list with this id, or nil.
func (w *Workspace) Find(id string) *List {
	for i := range w.Lists {
		if w.Lists[i].ID == id {
			return &w.Lists[i]
		}
	}
	return nil
}

// The stored shapes, with pointers where the app requires a field to be present.
type rawWord struct {
	Display    *string `json:"display"`
	Input      *string `json:"input"`
	Annotation *string `json:"annotation"`
	extra      string
}

type rawRecord struct {
	ID        *string  `json:"id"`
	Time      *float64 `json:"time"`
	Date      *string  `json:"date"`
	Mistakes  *int     `json:"mistakes"`
	Accuracy  *float64 `json:"accuracy"`
	WordCount *int     `json:"wordCount"`
	Device    *Device  `json:"device"`
	extra     string
}

// shared and shareId, which meant link sharing, are dropped. Other fields Typle does not know are kept.
type rawList struct {
	ID        *string      `json:"id"`
	Name      *string      `json:"name"`
	Category  *string      `json:"category"`
	Tags      []*string    `json:"tags"`
	CreatedAt *string      `json:"createdAt"`
	Words     []*rawWord   `json:"words"`
	Records   []*rawRecord `json:"records"`
	extra     string
}

// Decode reads a saved row: its lists and devices columns.
func Decode(lists, devices []byte) (*Workspace, error) {
	var rawLists []*rawList
	if err := json.Unmarshal(lists, &rawLists); err != nil {
		return nil, fmt.Errorf("lists are not valid: %w", err)
	}
	if rawLists == nil {
		return nil, errors.New("lists must be an array")
	}
	var rawDevices []json.RawMessage
	if err := json.Unmarshal(devices, &rawDevices); err != nil {
		return nil, fmt.Errorf("devices are not valid: %w", err)
	}
	decoded, err := decodeLists(rawLists)
	if err != nil {
		return nil, err
	}
	registered, err := decodeDevices(rawDevices)
	if err != nil {
		return nil, err
	}
	return &Workspace{Lists: decoded, Devices: registered}, nil
}

func decodeLists(raw []*rawList) ([]List, error) {
	lists := make([]List, 0, len(raw))
	ids := map[string]bool{}
	for index, item := range raw {
		list, err := decodeList(item)
		if err != nil {
			return nil, fmt.Errorf("list %d: %w", index+1, err)
		}
		if ids[list.ID] {
			return nil, fmt.Errorf("list %d: id %q is used twice", index+1, list.ID)
		}
		ids[list.ID] = true
		lists = append(lists, list)
	}
	return lists, nil
}

func decodeList(raw *rawList) (List, error) {
	if raw == nil || raw.ID == nil || *raw.ID == "" || raw.Name == nil || raw.CreatedAt == nil || raw.Words == nil || raw.Records == nil {
		return List{}, errors.New("id, name, createdAt, words and records are required")
	}
	// validateList: a name, at least one word, and no word without text to show or type.
	if trimJS(*raw.Name) == "" {
		return List{}, errors.New("name is empty")
	}
	if len(raw.Words) == 0 {
		return List{}, errors.New("words are empty")
	}
	words := make([]Word, 0, len(raw.Words))
	for index, word := range raw.Words {
		if word == nil || word.Display == nil || word.Input == nil || word.Annotation == nil {
			return List{}, fmt.Errorf("word %d: display, input and annotation are required", index+1)
		}
		if trimJS(*word.Display) == "" || trimJS(*word.Input) == "" {
			return List{}, fmt.Errorf("word %d: display and input must not be empty", index+1)
		}
		words = append(words, Word{Display: *word.Display, Input: *word.Input, Annotation: *word.Annotation, Extra: word.extra})
	}
	// The category and tags are optional; decodeLists checks only that they are a string and strings.
	category := ""
	if raw.Category != nil {
		category = *raw.Category
	}
	var tags []string
	for _, tag := range raw.Tags {
		if tag == nil {
			return List{}, errors.New("tags must be strings")
		}
		tags = append(tags, *tag)
	}
	records := make([]Record, 0, len(raw.Records))
	for index, item := range raw.Records {
		record, err := decodeRecord(item)
		if err != nil {
			return List{}, fmt.Errorf("record %d: %w", index+1, err)
		}
		records = append(records, record)
	}
	return List{ID: *raw.ID, Name: *raw.Name, Category: category, Tags: tags, Words: words, Records: records, CreatedAt: *raw.CreatedAt,
		Extra: raw.extra}, nil
}

func decodeRecord(raw *rawRecord) (Record, error) {
	if raw == nil || raw.Time == nil || *raw.Time < 0 || raw.Date == nil {
		return Record{}, errors.New("time must be a number of 0 or more and date is required")
	}
	at, ok := ParseTime(*raw.Date)
	if !ok {
		return Record{}, fmt.Errorf("date %q is not a supported date", *raw.Date)
	}
	if raw.Accuracy != nil && (*raw.Accuracy < 0 || *raw.Accuracy > 100) {
		return Record{}, errors.New("accuracy must be between 0 and 100")
	}
	if raw.Mistakes != nil && *raw.Mistakes < 0 {
		return Record{}, errors.New("mistakes must be 0 or more")
	}
	if raw.WordCount != nil && *raw.WordCount < 1 {
		return Record{}, errors.New("wordCount must be 1 or more")
	}
	if raw.Device != nil && !isDevice(*raw.Device) {
		return Record{}, errors.New("device is invalid")
	}
	return Record{ID: raw.ID, Time: *raw.Time, Date: *raw.Date, Mistakes: raw.Mistakes, Accuracy: raw.Accuracy,
		WordCount: raw.WordCount, Device: raw.Device, At: at, Extra: raw.extra}, nil
}

// JavaScript measures string length in UTF-16 code units.
func length(value string) int {
	return len(utf16.Encode([]rune(value)))
}

func isDevice(device Device) bool {
	return device.ID != "" && length(device.ID) <= maxDeviceID &&
		trimJS(device.Name) != "" && length(device.Name) <= maxDeviceName &&
		length(device.Layout) <= maxDeviceLayout
}

func decodeDevices(raw []json.RawMessage) ([]Device, error) {
	invalid := errors.New("devices are invalid")
	if len(raw) > maxDevices {
		return nil, invalid
	}
	devices := make([]Device, 0, len(raw))
	for _, item := range raw {
		var fields struct {
			ID     *string `json:"id"`
			Name   *string `json:"name"`
			Layout *string `json:"layout"`
		}
		if err := json.Unmarshal(item, &fields); err != nil || fields.ID == nil || fields.Name == nil || fields.Layout == nil {
			return nil, invalid
		}
		device := Device{ID: *fields.ID, Name: *fields.Name, Layout: *fields.Layout}
		// The built-in device is never stored with the registered ones.
		if !isDevice(device) || device.ID == DefaultDeviceID ||
			slices.ContainsFunc(devices, func(other Device) bool { return other.ID == device.ID }) {
			return nil, invalid
		}
		devices = append(devices, Device{ID: device.ID, Name: trimJS(device.Name), Layout: trimJS(device.Layout)})
	}
	return devices, nil
}

// Each stored shape keeps the fields it does not know.

func (r *rawWord) UnmarshalJSON(data []byte) (err error) {
	type plain rawWord
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "display", "input", "annotation")
	}
	return err
}

func (r *rawRecord) UnmarshalJSON(data []byte) (err error) {
	type plain rawRecord
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "id", "time", "date", "mistakes", "accuracy", "wordCount", "device")
	}
	return err
}

func (r *rawList) UnmarshalJSON(data []byte) (err error) {
	type plain rawList
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "id", "name", "category", "tags", "createdAt", "words", "records", "shared", "shareId")
	}
	return err
}

func (d *Device) UnmarshalJSON(data []byte) (err error) {
	type plain Device
	if err = json.Unmarshal(data, (*plain)(d)); err == nil {
		d.Extra, err = unknown(data, "id", "name", "layout")
	}
	return err
}

// Words, records and devices are written with their unknown fields, both to the database and in the API's answers.

func (w Word) MarshalJSON() ([]byte, error) {
	type plain Word
	known, err := marshal(plain(w))
	return withExtra(known, w.Extra), err
}

func (r Record) MarshalJSON() ([]byte, error) {
	type plain Record
	known, err := marshal(plain(r))
	return withExtra(known, r.Extra), err
}

func (d Device) MarshalJSON() ([]byte, error) {
	type plain Device
	known, err := marshal(plain(d))
	return withExtra(known, d.Extra), err
}
