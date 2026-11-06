package workspace

import (
	"slices"
)

func missing() error { return &Error{Key: "listNotFound"} }

// listsIn is the lists of the pack packID, in their order; nil when it has none.
func listsIn(lists []List, packID string) []List {
	var mine []List
	for _, list := range lists {
		if list.PackID == packID {
			mine = append(mine, list)
		}
	}
	return mine
}

func index(w *Workspace, id string) int {
	return slices.IndexFunc(w.Lists, func(list List) bool { return list.ID == id })
}
