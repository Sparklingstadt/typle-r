package workspace

import "slices"

// NoDevice filters for records saved without a device, as NO_DEVICE in src/core/records.ts.
const NoDevice = "none"

// FeedRow is a record with its list, and whether it is the list's current best.
type FeedRow struct {
	List   *List
	Record *Record
	Best   bool
}

// Feed lists every record newest first, as recordRows and filterRows (src/core/records.ts) do: a record is Best when it
// ranks first among the records of its own mode (normal or recall) in its list, and records of the same time
// keep the order of their lists and their stored order. listID keeps one list's records and device one device's, or
// NoDevice the records without one; empty keeps all.
func Feed(lists []List, listID, device string) []FeedRow {
	rows := []FeedRow{}
	for i := range lists {
		list := &lists[i]
		if listID != "" && list.ID != listID {
			continue
		}
		best, bestRecall := ListBest(list), ListBestOf(list, RecallMode)
		for j := range list.Records {
			record := &list.Records[j]
			if device != "" && (device == NoDevice) != (record.Device == nil) {
				continue
			}
			if device != "" && device != NoDevice && record.Device.ID != device {
				continue
			}
			rows = append(rows, FeedRow{List: list, Record: record, Best: record == best || record == bestRecall})
		}
	}
	slices.SortStableFunc(rows, func(a, b FeedRow) int { return b.Record.At.Compare(a.Record.At) })
	return rows
}
