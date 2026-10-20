package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestCreateDevice(t *testing.T) {
	w := two()
	device, err := CreateDevice(w, DeviceInput{Name: text("  会社  "), Layout: text(" US ")}, "new")
	if err != nil {
		t.Fatal(err)
	}
	if device != &w.Devices[1] || *device != (Device{ID: "new", Name: "会社", Layout: "US"}) {
		t.Fatalf("devices = %+v", w.Devices)
	}
	// The layout may be left out.
	if device, err := CreateDevice(w, DeviceInput{Name: text("ノート")}, "n2"); err != nil || device.Layout != "" {
		t.Fatalf("device = %+v, %v", device, err)
	}
}

func TestCreateDeviceErrors(t *testing.T) {
	cases := []struct {
		name  string
		input DeviceInput
		key   string
	}{
		{"no name", DeviceInput{}, "deviceNameRequired"},
		{"blank name", DeviceInput{Name: text("  ")}, "deviceNameRequired"},
		{"long name", DeviceInput{Name: text(strings.Repeat("a", maxDeviceName+1))}, "deviceNameTooLong"},
		// As the app, the length is measured before the spaces around it are removed.
		{"long name with spaces", DeviceInput{Name: text(" " + strings.Repeat("a", maxDeviceName))}, "deviceNameTooLong"},
		{"long layout", DeviceInput{Name: text("a"), Layout: text(strings.Repeat("a", maxDeviceLayout+1))}, "deviceLayoutTooLong"},
		{"duplicate", DeviceInput{Name: text(" 自宅 ")}, "deviceNameDuplicate"},
		{"duplicate in another case", DeviceInput{Name: text("HOME")}, "deviceNameDuplicate"},
		{"built-in name", DeviceInput{Name: text("デフォルト")}, "deviceNameDuplicate"},
		{"built-in name in another language", DeviceInput{Name: text("default")}, "deviceNameDuplicate"},
		{"NUL in the name", DeviceInput{Name: text("a\x00")}, "invalidDevice"},
		{"NUL in the layout", DeviceInput{Name: text("a"), Layout: text("\x00")}, "invalidDevice"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := two()
			w.Devices = append(w.Devices, Device{ID: "d2", Name: "Home"})
			_, err := CreateDevice(w, c.input, "new")
			wantKey(t, err, c.key)
			if len(w.Devices) != 2 {
				t.Fatalf("devices = %+v", w.Devices)
			}
		})
	}
	// The longest allowed values pass.
	if _, err := CreateDevice(two(), DeviceInput{Name: text(strings.Repeat("a", maxDeviceName)), Layout: text(strings.Repeat("a", maxDeviceLayout))}, "new"); err != nil {
		t.Fatal(err)
	}
}

func TestCreateDeviceLimit(t *testing.T) {
	w := &Workspace{}
	for range maxDevices {
		w.Devices = append(w.Devices, Device{ID: NewID(), Name: NewID()})
	}
	_, err := CreateDevice(w, DeviceInput{Name: text("a")}, "new")
	wantKey(t, err, "deviceLimit")
}

func TestUpdateDevice(t *testing.T) {
	w := two()
	device, err := UpdateDevice(w, "d1", DeviceInput{Name: text(" 自宅2 ")})
	if err != nil || device != &w.Devices[0] || *device != (Device{ID: "d1", Name: "自宅2", Layout: "JIS"}) {
		t.Fatalf("device = %+v, %v", device, err)
	}
	if device, err := UpdateDevice(w, "d1", DeviceInput{Layout: text("")}); err != nil || *device != (Device{ID: "d1", Name: "自宅2"}) {
		t.Fatalf("device = %+v, %v", device, err)
	}
	// A device may keep its own name in another case.
	if device, err := UpdateDevice(w, "d1", DeviceInput{Name: text("自宅2")}); err != nil || device.Name != "自宅2" {
		t.Fatalf("device = %+v, %v", device, err)
	}
	// Records keep the copy they were saved with.
	if w.Lists[0].Records[0].Device != nil {
		t.Fatal("record changed")
	}
}

func TestUpdateDeviceErrors(t *testing.T) {
	w := two()
	w.Devices = append(w.Devices, Device{ID: "d2", Name: "会社"})
	for id, key := range map[string]string{"missing": "deviceNotFound", "default": "deviceNotFound"} {
		_, err := UpdateDevice(w, id, DeviceInput{Name: text("a")})
		wantKey(t, err, key)
	}
	_, err := UpdateDevice(w, "d1", DeviceInput{Name: text("会社")})
	wantKey(t, err, "deviceNameDuplicate")
	_, err = UpdateDevice(w, "d1", DeviceInput{Name: text(" ")})
	wantKey(t, err, "deviceNameRequired")
	if w.Devices[0] != (Device{ID: "d1", Name: "自宅", Layout: "JIS"}) {
		t.Fatalf("device = %+v", w.Devices[0])
	}
}

func TestDeleteDevice(t *testing.T) {
	w := two()
	id := "r2"
	w.Lists[0].Records = append(w.Lists[0].Records, Record{ID: &id, Time: 1, Date: "2026-10-10T00:00:00.000Z", Device: &Device{ID: "d1", Name: "自宅", Layout: "JIS"}})
	if err := DeleteDevice(w, "d1"); err != nil {
		t.Fatal(err)
	}
	if len(w.Devices) != 0 || w.Lists[0].Records[1].Device.Name != "自宅" {
		t.Fatalf("workspace = %+v", w)
	}
	wantKey(t, DeleteDevice(w, "d1"), "deviceNotFound")
	wantKey(t, DeleteDevice(w, "default"), "deviceNotFound")
}

// The built-in device's names are copies of format.defaultDevice in every language of the app.
func TestDefaultDeviceNamesMatchApp(t *testing.T) {
	files, err := filepath.Glob("../../../src/messages/*/format.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("files = %v, %v", files, err)
	}
	var names []string
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		var messages struct {
			DefaultDevice string `json:"defaultDevice"`
		}
		if err := json.Unmarshal(data, &messages); err != nil || messages.DefaultDevice == "" {
			t.Fatalf("%s: %v", file, err)
		}
		names = append(names, messages.DefaultDevice)
	}
	slices.Sort(names)
	want := slices.Clone(defaultDeviceNames)
	slices.Sort(want)
	if !slices.Equal(names, want) {
		t.Fatalf("defaultDeviceNames = %q, the app has %q", want, names)
	}
}
