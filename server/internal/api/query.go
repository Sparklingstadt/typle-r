package api

import (
	"net/url"
	"strconv"
	"time"
	// Time zones are read from the binary, so tz works the same on any server.
	_ "time/tzdata"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

const (
	defaultLimit = 100
	maxLimit     = 1000
)

// location reads tz, an IANA time zone such as Asia/Tokyo, that days and weeks are counted in, as the app counts them
// in the viewer's. Without tz it is the server's.
func location(query url.Values) (*time.Location, bool) {
	if !query.Has("tz") {
		return time.Local, true
	}
	name := query.Get("tz")
	if name == "" {
		return nil, false
	}
	loc, err := time.LoadLocation(name)
	return loc, err == nil
}

// readLimit reads limit: a whole number from 1 to 1000, 100 by default.
func readLimit(query url.Values) (int, bool) {
	if !query.Has("limit") {
		return defaultLimit, true
	}
	text := query.Get("limit")
	value, err := strconv.Atoi(text)
	if !digits.MatchString(text) || err != nil || value < 1 || value > maxLimit {
		return 0, false
	}
	return value, true
}

// readSince reads since, a date in a form records are stored in. Without it there is no bound.
func readSince(query url.Values) (*time.Time, bool) {
	if !query.Has("since") {
		return nil, true
	}
	since, ok := workspace.ParseTime(query.Get("since"))
	return &since, ok
}
