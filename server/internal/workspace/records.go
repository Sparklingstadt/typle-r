package workspace

import (
	"math"
	"regexp"
	"slices"
)

const (
	maxRecordID = 100
	// The built-in device's name in the app's base language (format.defaultDevice in src/messages/ja).
	defaultDeviceName = "デフォルト"
	// Integers stay within JavaScript's safe integers, so the app reads them back exactly.
	maxSafeInteger = 1<<53 - 1
)

var recordID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// RecordInput is a practice run as a request gives it. Numbers are read as JSON numbers so that a value such as 1.5
// mistakes is refused as an invalid record rather than as invalid JSON.
type RecordInput struct {
	ID        *string  `json:"id"`
	Time      *float64 `json:"time"`
	Date      *string  `json:"date"`
	Mistakes  *float64 `json:"mistakes"`
	Accuracy  *float64 `json:"accuracy"`
	WordCount *float64 `json:"wordCount"`
	DeviceID  *string  `json:"deviceId"`
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
	if !finite(input.Time) || *input.Time < 0 || input.Date == nil || !finite(input.Accuracy) || *input.Accuracy < 0 || *input.Accuracy > 100 {
		return Record{}, false, invalid
	}
	date, ok := ParseTime(*input.Date)
	// Saved in UTC, the date must stay within the years toISOString writes as four digits and Date.parse reads.
	if year := date.UTC().Year(); !ok || year < 0 || year > 9999 {
		return Record{}, false, invalid
	}
	mistakes, ok := integer(input.Mistakes, 0)
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
	if saved := slices.IndexFunc(list.Records, func(r Record) bool { return r.ID != nil && *r.ID == id }); saved >= 0 {
		return list.Records[saved], false, nil
	}
	if len(list.Records) >= MaxRecords {
		return Record{}, false, &Error{Key: "recordLimit"}
	}
	var device *Device
	if input.DeviceID != nil {
		if device, ok = findDevice(w, *input.DeviceID); !ok {
			return Record{}, false, &Error{Key: "deviceNotFound"}
		}
	}
	accuracy := *input.Accuracy
	record = Record{ID: &id, Time: *input.Time, Date: FormatTime(date), Mistakes: &mistakes, Accuracy: &accuracy,
		WordCount: &wordCount, Device: device, At: date}
	list.Records = append(list.Records, record)
	return record, true, nil
}

// findDevice returns a copy of a registered device, or of the built-in one.
func findDevice(w *Workspace, id string) (*Device, bool) {
	if id == defaultDeviceID {
		return &Device{ID: defaultDeviceID, Name: defaultDeviceName, Layout: ""}, true
	}
	for _, device := range w.Devices {
		if device.ID == id {
			return &device, true
		}
	}
	return nil, false
}
