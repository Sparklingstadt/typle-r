package workspace

import (
	"slices"
	"strings"
)

// The built-in device's name in each language of the app (format.defaultDevice in src/messages). The app refuses a
// registered device named like it in the reader's language; with no reader's language here, every one is refused.
var defaultDeviceNames = []string{"デフォルト", "Default", "默认", "預設", "По умолчанию", "Par défaut"}

// DeviceInput is a device as a request gives it. A field left out (nil) is not changed.
type DeviceInput struct {
	Name   *string `json:"name"`
	Layout *string `json:"layout"`
}

func deviceMissing() error { return &Error{Key: "deviceNotFound"} }

func deviceIndex(w *Workspace, id string) int {
	return slices.IndexFunc(w.Devices, func(device Device) bool { return device.ID == id })
}

// checkDevice follows deviceProblem (src/core/devices.ts) and returns the device to save, without the spaces around
// its name and layout. Lengths are measured before those spaces are removed, as the app does.
func checkDevice(w *Workspace, device Device) (Device, error) {
	name := strings.TrimSpace(device.Name)
	switch {
	case name == "":
		return Device{}, &Error{Key: "deviceNameRequired"}
	case length(device.Name) > maxDeviceName:
		return Device{}, &Error{Key: "deviceNameTooLong"}
	case length(device.Layout) > maxDeviceLayout:
		return Device{}, &Error{Key: "deviceLayoutTooLong"}
	case strings.ContainsRune(device.Name+device.Layout, 0):
		// Postgres cannot store U+0000 in jsonb.
		return Device{}, &Error{Key: "invalidDevice"}
	}
	folded := lowerCase(name)
	for _, other := range w.Devices {
		if other.ID != device.ID && lowerCase(other.Name) == folded {
			return Device{}, &Error{Key: "deviceNameDuplicate"}
		}
	}
	for _, builtIn := range defaultDeviceNames {
		if lowerCase(builtIn) == folded {
			return Device{}, &Error{Key: "deviceNameDuplicate"}
		}
	}
	return Device{ID: device.ID, Name: name, Layout: strings.TrimSpace(device.Layout)}, nil
}

// CreateDevice registers a device after the others.
func CreateDevice(w *Workspace, input DeviceInput, id string) (*Device, error) {
	device := Device{ID: id}
	if input.Name != nil {
		device.Name = *input.Name
	}
	if input.Layout != nil {
		device.Layout = *input.Layout
	}
	checked, err := checkDevice(w, device)
	if err != nil {
		return nil, err
	}
	if len(w.Devices) >= maxDevices {
		return nil, &Error{Key: "deviceLimit"}
	}
	w.Devices = append(w.Devices, checked)
	return &w.Devices[len(w.Devices)-1], nil
}

// UpdateDevice renames a device or changes its layout. Records keep the copy of the device they were saved with. The
// built-in device is not registered, so it cannot be changed.
func UpdateDevice(w *Workspace, id string, input DeviceInput) (*Device, error) {
	at := deviceIndex(w, id)
	if at < 0 {
		return nil, deviceMissing()
	}
	device := w.Devices[at]
	if input.Name != nil {
		device.Name = *input.Name
	}
	if input.Layout != nil {
		device.Layout = *input.Layout
	}
	checked, err := checkDevice(w, device)
	if err != nil {
		return nil, err
	}
	w.Devices[at] = checked
	return &w.Devices[at], nil
}

// DeleteDevice removes a registered device. Its records keep their copy of it.
func DeleteDevice(w *Workspace, id string) error {
	at := deviceIndex(w, id)
	if at < 0 {
		return deviceMissing()
	}
	w.Devices = slices.Delete(w.Devices, at, at+1)
	return nil
}
