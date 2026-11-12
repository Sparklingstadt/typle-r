// Package workspace reads a Typle workspace: the lists, word packs and devices of an account, as the app saves them in
// the typle_workspaces table. The checks follow decodeLists (src/core/wordLists.ts), decodePacks
// (src/core/wordPacks.ts) and decodeDevices (src/core/devices.ts), so data the app would read is read here and data it
// would refuse is refused. The one difference is that null in an optional field reads as the field left out.
package workspace

import (
	"bytes"
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
	// A missing type is a legacy/plain word. Keep it missing when writing old data.
	InputType string `json:"input_type,omitempty"`
	// Extra holds the stored fields Typle does not know (see extra.go).
	Extra string `json:"-"`
}

// WritingLanguages are the languages a list can be practised in by handwriting (WRITING_LANGUAGES in
// src/core/wordLists.ts).
var WritingLanguages = []string{"en", "ja", "zh-Hans", "zh-Hant", "ko", "fr", "de", "es", "ru", "cs"}

// Writing is the mark of a list that can be practised by handwriting (Typle Writing). Only the language is kept.
type Writing struct {
	Language string `json:"language"`
}

func validWritingLanguage(language string) bool { return slices.Contains(WritingLanguages, language) }

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
	// Mode is RecallMode or WritingMode for a run practised that way; "" for a normal run, which has no mode key.
	Mode string `json:"mode,omitempty"`
	// Missed is the words that went wrong in the run; none in runs saved before v2.42.0.
	Missed []MissedWord `json:"missed,omitempty"`
	// At is Date as a time, for ordering and filtering.
	At    time.Time `json:"-"`
	Extra string    `json:"-"`
}

type List struct {
	ID   string
	Name string
	// Levels pick the list within its pack on the practice screen (nil when it has none; an empty array as stored stays
	// empty). See levelPath.
	Levels []string
	// Writing is set when the list can be practised by handwriting; nil otherwise.
	Writing *Writing
	// PackID is the word pack the list belongs to. Every list Decode returns has one.
	PackID string
	// Group is the group of a list saved before packs existed, which Decode makes a pack of. Encode never writes it; only
	// EncodeWithLabels does, for lists sent by an app that does not know packs.
	Group string
	// Category and Tags are those of the list's pack, as the app's viewLists shows them: "" and nil when it has none.
	// They are not stored with the list; ApplyListChange puts a change to them back into the pack.
	Category  string
	Tags      []string
	Words     []Word
	Records   []Record
	CreatedAt string
	// Origin is set on the lists of a followed official pack: the official list it is kept equal to (see followOfficial).
	Origin *ListOrigin
	Extra  string
}

// ListOrigin is the origin of a list of a followed pack. Extra holds the fields of it Typle does not know.
type ListOrigin struct {
	ListID string `json:"listId"`
	Extra  string `json:"-"`
}

type Workspace struct {
	Lists   []List
	Packs   []Pack
	Devices []Device
}

// Find returns the list with this id, or nil.
func (w *Workspace) Find(id string) *List {
	if at := index(w, id); at >= 0 {
		return &w.Lists[at]
	}
	return nil
}

// FindPack returns the pack with this id, or nil.
func (w *Workspace) FindPack(id string) *Pack {
	if at := packIndex(w, id); at >= 0 {
		return &w.Packs[at]
	}
	return nil
}

// The stored shapes, with pointers where the app requires a field to be present.
type rawWord struct {
	Display    *string `json:"display"`
	Input      *string `json:"input"`
	Annotation *string `json:"annotation"`
	InputType  string  `json:"input_type"`
	extra      string
}

type rawRecord struct {
	ID        *string         `json:"id"`
	Time      *float64        `json:"time"`
	Date      *string         `json:"date"`
	Mistakes  *int            `json:"mistakes"`
	Accuracy  *float64        `json:"accuracy"`
	WordCount *int            `json:"wordCount"`
	Device    *Device         `json:"device"`
	Mode      json.RawMessage `json:"mode"`
	Missed    json.RawMessage `json:"missed"`
	extra     string
}

// shared and shareId, which meant link sharing, are dropped. Other fields Typle does not know are kept.
type rawList struct {
	ID       *string   `json:"id"`
	Name     *string   `json:"name"`
	Category *string   `json:"category"`
	Tags     []*string `json:"tags"`
	Group    *string   `json:"group"`
	PackID   *string   `json:"packId"`
	Levels   []*string `json:"levels"`
	// Writing is read by writingOf, which refuses any shape but {"language": <listed>}; null reads as left out.
	Writing   json.RawMessage `json:"writing"`
	CreatedAt *string         `json:"createdAt"`
	Words     []*rawWord      `json:"words"`
	Records   []*rawRecord    `json:"records"`
	// Origin is read by originOf, which drops an origin of another shape.
	Origin json.RawMessage `json:"origin"`
	extra  string
}

// Decode reads a saved row: its lists, devices and packs columns. packs is nil (NULL) for lists saved before packs
// existed, which are turned into packs as the app's normalizeLibrary does; saved packs are repaired as it does. The
// library then follows the official catalog (followOfficial), as the app makes it do whenever it reads saved data.
func Decode(lists, devices, packs []byte) (*Workspace, error) {
	official, err := catalog()
	if err != nil {
		return nil, err
	}
	return decode(lists, devices, packs, official)
}

// decode is Decode following the official packs given.
func decode(lists, devices, packs []byte, official []OfficialPack) (*Workspace, error) {
	w, err := normalized(lists, devices, packs)
	if err != nil {
		return nil, err
	}
	w.Packs, w.Lists = followOfficial(w.Packs, w.Lists, official)
	viewLists(w)
	return w, nil
}

// normalized reads a saved row as the app's normalizeLibrary does, before it follows the catalog. Its lists do not carry
// their packs' labels yet (see viewLists).
func normalized(lists, devices, packs []byte) (*Workspace, error) {
	decoded, err := DecodeLists(lists)
	if err != nil {
		return nil, err
	}
	var rawDevices []json.RawMessage
	if err := json.Unmarshal(devices, &rawDevices); err != nil {
		return nil, fmt.Errorf("devices are not valid: %w", err)
	}
	registered, err := decodeDevices(rawDevices)
	if err != nil {
		return nil, err
	}
	var saved []Pack
	if packs != nil {
		if saved, err = decodePacks(packs); err != nil {
			return nil, err
		}
	}
	// Data without packs is no longer converted by the lists' groups (data from before v1.0.0 is deleted, see
	// db/migrations/0032_drop_legacy): a list without a pack is given one of its own, as any is.
	w := &Workspace{Devices: registered}
	w.Packs, w.Lists = repairLibrary(saved, decoded)
	return w, nil
}

// DecodeLists reads lists as they were saved, with the checks Decode makes of them, but without their packs: each keeps
// its packId, and any group, category and tags, as they are.
func DecodeLists(data []byte) ([]List, error) {
	var raw []*rawList
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("lists are not valid: %w", err)
	}
	if raw == nil {
		return nil, errors.New("lists must be an array")
	}
	return decodeLists(raw)
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
	// A list of a followed pack (with an origin) is saved without its words, which followOfficial takes from the catalog.
	if len(raw.Words) == 0 && raw.Origin == nil {
		return List{}, errors.New("words are empty")
	}
	words, err := decodeWords(raw.Words)
	if err != nil {
		return List{}, err
	}
	// The category and tags are optional; decodeLists checks only that they are a string and strings.
	category := ""
	if raw.Category != nil {
		category = *raw.Category
	}
	tags, ok := decodeStrings(raw.Tags)
	if !ok {
		return List{}, errors.New("tags must be strings")
	}
	// No tags are nil, as before; levels sent empty stay an empty list, as they are kept as they are.
	if len(tags) == 0 {
		tags = nil
	}
	levels, ok := decodeStrings(raw.Levels)
	if !ok {
		return List{}, errors.New("levels must be strings")
	}
	writing, err := writingOf(raw.Writing)
	if err != nil {
		return List{}, err
	}
	records, err := decodeRecords(raw.Records)
	if err != nil {
		return List{}, err
	}
	var group, packID string
	if raw.Group != nil {
		group = *raw.Group
	}
	if raw.PackID != nil {
		packID = *raw.PackID
	}
	origin, err := originOf(raw.Origin)
	if err != nil {
		return List{}, err
	}
	return List{ID: *raw.ID, Name: *raw.Name, Levels: levels, Writing: writing, PackID: packID, Group: group, Category: category, Tags: tags, Words: words, Records: records,
		CreatedAt: *raw.CreatedAt, Origin: origin, Extra: raw.extra}, nil
}

// decodeWords reads a list's words: each has the text to show, to type and an annotation, and shows and types some.
func decodeWords(raw []*rawWord) ([]Word, error) {
	words := make([]Word, 0, len(raw))
	for index, word := range raw {
		if word == nil || word.Display == nil || word.Input == nil || word.Annotation == nil {
			return nil, fmt.Errorf("word %d: display, input and annotation are required", index+1)
		}
		if trimJS(*word.Display) == "" || trimJS(*word.Input) == "" {
			return nil, fmt.Errorf("word %d: display and input must not be empty", index+1)
		}
		words = append(words, Word{Display: *word.Display, Input: *word.Input, Annotation: *word.Annotation, InputType: word.InputType, Extra: word.extra})
	}
	return words, nil
}

// decodeStrings reads an optional array of strings: nil when it is left out, false when an item is not a string.
func decodeStrings(raw []*string) ([]string, bool) {
	if raw == nil {
		return nil, true
	}
	values := make([]string, 0, len(raw))
	for _, value := range raw {
		if value == nil {
			return nil, false
		}
		values = append(values, *value)
	}
	return values, true
}

// decodeRecords reads a list's records, naming the one that cannot be read.
func decodeRecords(raw []*rawRecord) ([]Record, error) {
	records := make([]Record, 0, len(raw))
	for index, item := range raw {
		record, err := decodeRecord(item)
		if err != nil {
			return nil, fmt.Errorf("record %d: %w", index+1, err)
		}
		records = append(records, record)
	}
	return records, nil
}

// writingOf follows isWritingMark (src/core/wordLists.ts): the mark is an object whose only field is a listed language.
// Anything else makes the list unreadable, as a malformed list field does; null reads as left out.
func writingOf(raw json.RawMessage) (*Writing, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var fields map[string]json.RawMessage
	var language string
	if json.Unmarshal(raw, &fields) != nil || len(fields) != 1 || json.Unmarshal(fields["language"], &language) != nil ||
		!validWritingLanguage(language) {
		return nil, errors.New("writing must be an object with a supported language only")
	}
	return &Writing{Language: language}, nil
}

// originOf follows decodeLists (src/core/wordLists.ts): a list's origin is kept when it is an object with a string
// listId, with the other fields it has; any other origin is dropped.
func originOf(raw json.RawMessage) (*ListOrigin, error) {
	var fields map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &fields) != nil {
		return nil, nil
	}
	var id string
	if json.Unmarshal(fields["listId"], &id) != nil || string(fields["listId"]) == "null" {
		return nil, nil
	}
	extra, err := unknown(raw, "listId")
	if err != nil {
		return nil, err
	}
	return &ListOrigin{ListID: id, Extra: extra}, nil
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
	mode := ""
	if raw.Mode != nil {
		// An explicit null is refused as the app does: the value is "recall" or "writing", or the key is absent.
		var value string
		if json.Unmarshal(raw.Mode, &value) != nil || value == "" || !validMode(value) || string(bytes.TrimSpace(raw.Mode)) == "null" {
			return Record{}, errors.New(`mode must be "recall" or "writing" when present`)
		}
		mode = value
	}
	missed, ok := decodeMissed(raw.Missed)
	if !ok {
		return Record{}, errors.New("missed must be up to 20 words, each with a count of 1 or more")
	}
	return Record{ID: raw.ID, Time: *raw.Time, Date: *raw.Date, Mistakes: raw.Mistakes, Accuracy: raw.Accuracy,
		WordCount: raw.WordCount, Device: raw.Device, Mode: mode, Missed: missed, At: at, Extra: raw.extra}, nil
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
		if r.InputType, err = wordInputType(data); err == nil {
			r.extra, err = unknown(data, "display", "input", "annotation", "input_type")
		}
	}
	return err
}

// The JSON field is optional, but a supplied value must be one of the three exact strings.
// In particular, null and an empty string do not mean the same thing as a missing field.
func readInputType(raw json.RawMessage) (string, error) {
	if len(raw) == 0 {
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || value == "" || !validInputType(value) {
		return "", errors.New("input_type must be command, code or word")
	}
	return value, nil
}

func wordInputType(data []byte) (string, error) {
	var fields struct {
		InputType json.RawMessage `json:"input_type"`
	}
	if err := json.Unmarshal(data, &fields); err != nil {
		return "", err
	}
	return readInputType(fields.InputType)
}

func validInputType(value string) bool {
	return value == "" || value == "command" || value == "code" || value == "word"
}

// Word is also read directly by list/pack mutation requests, outside rawList decoding.
func (w *Word) UnmarshalJSON(data []byte) (err error) {
	type plain Word
	if err = json.Unmarshal(data, (*plain)(w)); err == nil {
		w.InputType, err = wordInputType(data)
	}
	return err
}

func (r *rawRecord) UnmarshalJSON(data []byte) (err error) {
	type plain rawRecord
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "id", "time", "date", "mistakes", "accuracy", "wordCount", "device", "mode", "missed")
	}
	return err
}

func (r *rawList) UnmarshalJSON(data []byte) (err error) {
	type plain rawList
	if err = json.Unmarshal(data, (*plain)(r)); err == nil {
		r.extra, err = unknown(data, "id", "name", "category", "tags", "group", "packId", "levels", "writing", "createdAt", "words", "records",
			"origin", "shared", "shareId")
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

// Words, records, list origins and devices are written with their unknown fields, both to the database and in the
// API's answers.

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

func (o ListOrigin) MarshalJSON() ([]byte, error) {
	type plain ListOrigin
	known, err := marshal(plain(o))
	return withExtra(known, o.Extra), err
}

func (d Device) MarshalJSON() ([]byte, error) {
	type plain Device
	known, err := marshal(plain(d))
	return withExtra(known, d.Extra), err
}
