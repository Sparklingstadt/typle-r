package workspace

import (
	"testing"
)

// The case of tests/devices.test.cjs: records count by device id, including renamed snapshots.
func TestDeviceUsage(t *testing.T) {
	record := func(date string, device *Device) Record {
		at, _ := ParseTime(date)
		return Record{Date: date, At: at, Device: device}
	}
	mac := Device{ID: "mac", Name: "Mac", Layout: "JIS"}
	renamed := Device{ID: "mac", Name: "Old name", Layout: "JIS"}
	lists := []List{
		{Records: []Record{record("2026-09-01T00:00:00.000Z", &mac), record("2026-09-20T00:00:00.000Z", &renamed), record("2026-09-25T00:00:00.000Z", nil)}},
		{Records: []Record{record("2026-09-10T00:00:00.000Z", &mac), record("2026-09-05T00:00:00.000Z", &Device{ID: "pc", Name: "PC"})}},
	}
	usage := DeviceUsage(lists)
	if got := usage["mac"]; got.PracticeCount != 3 || got.LastPracticed == nil || *got.LastPracticed != "2026-09-20T00:00:00.000Z" {
		t.Fatalf("mac = %+v", got)
	}
	if got := usage["pc"]; got.PracticeCount != 1 || *got.LastPracticed != "2026-09-05T00:00:00.000Z" {
		t.Fatalf("pc = %+v", got)
	}
	if got, ok := usage["missing"]; ok || got.PracticeCount != 0 || got.LastPracticed != nil {
		t.Fatalf("missing = %+v", got)
	}
	if len(DeviceUsage(nil)) != 0 {
		t.Fatal("usage of nothing")
	}
	// The date is answered as it is stored, and the first of two equal times wins, as in the app.
	lists = []List{{Records: []Record{record("2024/09/22 10:05", &mac), record("2024/09/22 10:05:00", &mac)}}}
	if got := DeviceUsage(lists)["mac"]; *got.LastPracticed != "2024/09/22 10:05" {
		t.Fatalf("mac = %+v", got)
	}
}
