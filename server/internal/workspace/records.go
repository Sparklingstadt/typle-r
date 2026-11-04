package workspace

import (
	"bytes"
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"time"
)

const (
	maxRecordID = 100
	// The built-in device's name in the app's base language (format.defaultDevice in src/messages/ja).
	defaultDeviceName = "デフォルト"
	// Integers stay within JavaScript's safe integers, so the app reads them back exactly.
	maxSafeInteger = 1<<53 - 1
)

// The modes a run can be saved with: RecallMode for a run practised by recalling the words, WritingMode for a Typle
// Handwriting run. A normal typing run has no mode (""), and the records of each mode are ranked apart.
const (
	RecallMode  = "recall"
	WritingMode = "writing"
)

// validMode is whether mode can be saved: a mode of the app, or "" for a normal run.
func validMode(mode string) bool { return mode == "" || mode == RecallMode || mode == WritingMode }

var recordID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// RecordInput is a practice run as a request gives it. Numbers are read as JSON numbers so that a value such as 1.5
// mistakes is refused as an invalid record rather than as invalid JSON. The device is either named by DeviceID, and
// saved as it is registered when the run is added, or given as Device, as it was when the run was practised (the
// app's practice screen keeps its name then, though it is renamed or deleted meanwhile).
type RecordInput struct {
	ID        *string  `json:"id"`
	Time      *float64 `json:"time"`
	Date      *string  `json:"date"`
	Mistakes  *float64 `json:"mistakes"`
	Accuracy  *float64 `json:"accuracy"`
	WordCount *float64 `json:"wordCount"`
	DeviceID  *string  `json:"deviceId"`
	Device    *Device  `json:"device"`
	// Mode is RecallMode, WritingMode or left out. /api/v1 does not accept it (see the api package's addRecord).
	Mode *string `json:"mode"`
	// ModeNull is set when the request has "mode": null, which is refused like any other mode that is not RecallMode or WritingMode.
	ModeNull bool `json:"-"`
}

// UnmarshalJSON reads the fields above and notes an explicit null mode, which a *string cannot tell from a left out one.
func (r *RecordInput) UnmarshalJSON(data []byte) error {
	type plain RecordInput
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode((*plain)(r)); err != nil {
		return err
	}
	var keys map[string]json.RawMessage
	if json.Unmarshal(data, &keys) == nil {
		mode, present := keys["mode"]
		r.ModeNull = present && bytes.Equal(bytes.TrimSpace(mode), []byte("null"))
	}
	return nil
}

func finite(value *float64) bool {
	return value != nil && !math.IsInf(*value, 0) && !math.IsNaN(*value)
}

// integer returns the value as an int when it is a whole number from min up to the largest safe integer.
func integer(value *float64, min int) (int, bool) {
	if !finite(value) || *value != math.Trunc(*value) || *value < float64(min) || *value > maxSafeInteger {
		return 0, false
	}
	return int(*value), true
}

// AddRecord adds a run to a list, as addRecord (src/core/records.ts) does. A run with the id of one the list already
// has is not added again: that saved record is returned with added false, so a request can be sent again safely.
func AddRecord(w *Workspace, listID string, input RecordInput, newID string) (record Record, added bool, err error) {
	at := index(w, listID)
	if at < 0 {
		return Record{}, false, missing()
	}
	list := &w.Lists[at]
	invalid := &Error{Key: "invalidRecord"}
	if !validTime(input.Time) || input.Date == nil || !validAccuracy(input.Accuracy) {
		return Record{}, false, invalid
	}
	date, ok := recordDate(*input.Date)
	if !ok {
		return Record{}, false, invalid
	}
	mistakes, ok := integer(input.Mistakes, 0)
	if !ok {
		return Record{}, false, invalid
	}
	// The mode is checked before a resend is looked up, as addRecord does in the app.
	mode, ok := recordMode(input)
	if !ok {
		return Record{}, false, invalid
	}
	wordCount := len(list.Words)
	if input.WordCount != nil {
		if wordCount, ok = integer(input.WordCount, 1); !ok {
			return Record{}, false, invalid
		}
	}
	id := newID
	if input.ID != nil {
		id = *input.ID
		if len(id) > maxRecordID || !recordID.MatchString(id) {
			return Record{}, false, invalid
		}
	}
	if saved := list.FindRecord(id); saved != nil {
		return *saved, false, nil
	}
	if len(list.Records) >= MaxRecords {
		return Record{}, false, &Error{Key: "recordLimit"}
	}
	device, err := recordDevice(w, input)
	if err != nil {
		return Record{}, false, err
	}
	accuracy := *input.Accuracy
	record = Record{ID: &id, Time: *input.Time, Date: FormatTime(date), Mistakes: &mistakes, Accuracy: &accuracy,
		WordCount: &wordCount, Device: device, Mode: mode, At: date}
	list.Records = append(list.Records, record)
	return record, true, nil
}

// recordMode is the mode of a run, "" when it is left out; false when it is null, empty or not one of the modes.
func recordMode(input RecordInput) (string, bool) {
	mode := ""
	if input.Mode != nil {
		mode = *input.Mode
	}
	if input.ModeNull || (input.Mode != nil && (mode == "" || !validMode(mode))) {
		return "", false
	}
	return mode, true
}

// recordDevice is the device a run was practised on: the one it gives, or the registered one it names by deviceId
// (deviceNotFound when there is none), but not both. nil when it names none.
func recordDevice(w *Workspace, input RecordInput) (*Device, error) {
	switch {
	case input.Device != nil && (input.DeviceID != nil || !isDevice(*input.Device)):
		return nil, &Error{Key: "invalidRecord"}
	case input.Device != nil:
		return &Device{ID: input.Device.ID, Name: input.Device.Name, Layout: input.Device.Layout}, nil
	case input.DeviceID != nil:
		device, ok := findDevice(w, *input.DeviceID)
		if !ok {
			return nil, &Error{Key: "deviceNotFound"}
		}
		return device, nil
	}
	return nil, nil
}

func validTime(value *float64) bool { return finite(value) && *value >= 0 }

func validAccuracy(value *float64) bool { return finite(value) && *value >= 0 && *value <= 100 }

// recordDate reads a record's date. Saved in UTC, it must stay within the years toISOString writes as four digits and
// Date.parse reads.
func recordDate(value string) (time.Time, bool) {
	date, ok := ParseTime(value)
	if year := date.UTC().Year(); !ok || year < 0 || year > 9999 {
		return time.Time{}, false
	}
	return date, true
}

// FindRecord returns the list's record with this id, or nil. Records saved without an id cannot be found.
func (l *List) FindRecord(id string) *Record {
	for i := range l.Records {
		if l.Records[i].ID != nil && id != "" && *l.Records[i].ID == id {
			return &l.Records[i]
		}
	}
	return nil
}

// RecordChange is a change to a saved run, as a request gives it. A field left out (nil) is not changed; a deviceId of
// "" takes the device off, as 未選択 does in the app. A record's id cannot be changed.
type RecordChange struct {
	Time      *float64 `json:"time"`
	Date      *string  `json:"date"`
	Mistakes  *float64 `json:"mistakes"`
	Accuracy  *float64 `json:"accuracy"`
	WordCount *float64 `json:"wordCount"`
	DeviceID  *string  `json:"deviceId"`
}

// UpdateRecord changes a saved run with the checks of AddRecord. Fields Typle does not know stay.
func UpdateRecord(w *Workspace, listID, recordID string, change RecordChange) (Record, error) {
	at := index(w, listID)
	if at < 0 {
		return Record{}, missing()
	}
	saved := w.Lists[at].FindRecord(recordID)
	if saved == nil {
		return Record{}, &Error{Key: "recordNotFound"}
	}
	record := *saved
	invalid := &Error{Key: "invalidRecord"}
	if change.Time != nil {
		if !validTime(change.Time) {
			return Record{}, invalid
		}
		record.Time = *change.Time
	}
	if change.Date != nil {
		date, ok := recordDate(*change.Date)
		if !ok {
			return Record{}, invalid
		}
		record.Date, record.At = FormatTime(date), date
	}
	if change.Mistakes != nil {
		mistakes, ok := integer(change.Mistakes, 0)
		if !ok {
			return Record{}, invalid
		}
		record.Mistakes = &mistakes
	}
	if change.Accuracy != nil {
		if !validAccuracy(change.Accuracy) {
			return Record{}, invalid
		}
		accuracy := *change.Accuracy
		record.Accuracy = &accuracy
	}
	if change.WordCount != nil {
		wordCount, ok := integer(change.WordCount, 1)
		if !ok {
			return Record{}, invalid
		}
		record.WordCount = &wordCount
	}
	if change.DeviceID != nil {
		device, err := changedDevice(w, *change.DeviceID)
		if err != nil {
			return Record{}, err
		}
		record.Device = device
	}
	*saved = record
	return record, nil
}

// changedDevice is the device a run is changed to: the registered one with the id, or none for "".
func changedDevice(w *Workspace, id string) (*Device, error) {
	if id == "" {
		return nil, nil
	}
	device, ok := findDevice(w, id)
	if !ok {
		return nil, &Error{Key: "deviceNotFound"}
	}
	return device, nil
}

// DeleteRecord removes a saved run, as removeRecord (src/core/records.ts) does for a record with an id.
func DeleteRecord(w *Workspace, listID, recordID string) error {
	at := index(w, listID)
	if at < 0 {
		return missing()
	}
	list := &w.Lists[at]
	i := slices.IndexFunc(list.Records, func(r Record) bool { return recordID != "" && r.ID != nil && *r.ID == recordID })
	if i < 0 {
		return &Error{Key: "recordNotFound"}
	}
	list.Records = slices.Delete(list.Records, i, i+1)
	return nil
}

// findDevice returns a copy of a registered device, or of the built-in one.
func findDevice(w *Workspace, id string) (*Device, bool) {
	if id == DefaultDeviceID {
		return &Device{ID: DefaultDeviceID, Name: defaultDeviceName, Layout: ""}, true
	}
	for _, device := range w.Devices {
		if device.ID == id {
			return &device, true
		}
	}
	return nil, false
}

// DecodeRecord reads one record as a list's records array holds it, with the checks of Decode.
func DecodeRecord(data []byte) (Record, error) {
	var raw *rawRecord
	if err := json.Unmarshal(data, &raw); err != nil {
		return Record{}, err
	}
	return decodeRecord(raw)
}
