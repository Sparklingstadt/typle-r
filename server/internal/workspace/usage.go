package workspace

// Usage is how often a device was practised on: the number of records and the date of the newest, as stored.
type Usage struct {
	PracticeCount int     `json:"practiceCount"`
	LastPracticed *string `json:"lastPracticed"`
}

// DeviceUsage counts every list's records by the id of the device they were saved with, as deviceUsage
// (src/core/devices.ts) does, so a renamed or deleted device keeps its count. Records without a device are not counted.
func DeviceUsage(lists []List) map[string]Usage {
	usage := map[string]Usage{}
	newest := map[string]Record{}
	for _, list := range lists {
		for _, record := range list.Records {
			if record.Device == nil {
				continue
			}
			id := record.Device.ID
			current, seen := usage[id]
			if !seen || record.At.After(newest[id].At) {
				date := record.Date
				current.LastPracticed = &date
				newest[id] = record
			}
			current.PracticeCount++
			usage[id] = current
		}
	}
	return usage
}
