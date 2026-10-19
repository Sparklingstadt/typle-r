package workspace

import "time"

// The app checks dates with JavaScript's Date.parse. These are the forms Typle stores: toISOString for its own
// records, and the slash form of the sample lists and lists from before ISO dates.
var (
	zonedLayouts = []string{time.RFC3339Nano, "2006-01-02T15:04Z07:00"}
	// Date.parse reads an ISO date without a time as UTC.
	utcLayouts = []string{"2006-01-02"}
	// ...and a date with a time but no zone, or any slash form, as local time.
	localLayouts = []string{
		"2006-01-02T15:04:05.999999999", "2006-01-02T15:04",
		"2006/1/2 15:04:05", "2006/1/2 15:04", "2006/1/2",
	}
)

// ParseTime reads a stored date. Local times use the server's time zone (set TZ to match the browser's).
func ParseTime(value string) (time.Time, bool) {
	for _, layout := range zonedLayouts {
		if at, err := time.Parse(layout, value); err == nil {
			return at, true
		}
	}
	for _, layout := range utcLayouts {
		if at, err := time.ParseInLocation(layout, value, time.UTC); err == nil {
			return at, true
		}
	}
	for _, layout := range localLayouts {
		if at, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return at, true
		}
	}
	return time.Time{}, false
}
