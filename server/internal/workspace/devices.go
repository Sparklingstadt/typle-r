package workspace

import (
	"slices"
)

func deviceMissing() error { return &Error{Key: "deviceNotFound"} }

func deviceIndex(w *Workspace, id string) int {
	return slices.IndexFunc(w.Devices, func(device Device) bool { return device.ID == id })
}
