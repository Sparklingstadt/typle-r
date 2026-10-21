package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// maxBodyBytes is MAX_WORKSPACE_BYTES (src/core/workspaceRequest.ts).
const maxBodyBytes = 1 << 20

// maxSafeInteger is Number.MAX_SAFE_INTEGER, the largest revision the app's JavaScript could have counted to.
const maxSafeInteger = 1<<53 - 1

var (
	errTooLarge = errors.New("request body is too large")
	// errLegacy is a save from a screen of the app before profiles were removed, for a profile other than the first or
	// changing the profiles. It is answered with a conflict, so that screen reloads and shows the merged lists instead
	// of overwriting them (LegacyProfileRequest in the app).
	errLegacy  = errors.New("request for a profile that no longer exists")
	errInvalid = errors.New("request is not a valid workspace")
)

// readBody reads the body, giving up as soon as it is past maxBodyBytes rather than after reading all of it: one byte
// more than the limit is enough to know.
func readBody(body io.Reader) ([]byte, error) {
	return readLimited(body, maxBodyBytes)
}

// readLimited is readBody with another limit.
func readLimited(body io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err == nil && int64(len(data)) > limit {
		return nil, errTooLarge
	}
	return data, err
}

// parseObject reads the body as one JSON object. Its members stay unread, so that each is judged where the route
// judges it; a name is matched exactly, as in JavaScript, and the last of a repeated name wins.
func parseObject(body []byte) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, err
	}
	if fields == nil {
		return nil, errInvalid
	}
	return fields, nil
}

// accountID is the request's accountId when it is a string.
func accountID(fields map[string]json.RawMessage) (string, bool) {
	var id string
	return id, json.Unmarshal(fields["accountId"], &id) == nil
}

// decodeRequest reads a save, as validateWorkspaceRequest does: the error is errLegacy for a profile that no longer
// exists and any other error for a request to refuse (400). The limits of validateLists (workspace.CheckLimits) and the
// number of lists are not checked here: Store.WriteRevision checks them, before it touches the database, and answers
// a *workspace.Error that is refused with a 400 all the same.
func decodeRequest(body []byte) (revision int, change store.Change, err error) {
	fields, err := parseObject(body)
	if err != nil {
		return 0, store.Change{}, err
	}
	return decodeFields(fields)
}

// The revision is judged before the legacy profile, and that before the lists, as in validateWorkspaceRequest.
func decodeFields(fields map[string]json.RawMessage) (revision int, change store.Change, err error) {
	revision, ok := safeInteger(fields["revision"])
	if !ok {
		return 0, store.Change{}, errInvalid
	}
	if raw, ok := fields["profileId"]; ok {
		var id string
		if json.Unmarshal(raw, &id) != nil || id != "default" {
			return 0, store.Change{}, errLegacy
		}
	}
	if _, ok := fields["profiles"]; ok {
		return 0, store.Change{}, errLegacy
	}
	lists, hasLists := fields["lists"]
	devices, hasDevices := fields["devices"]
	if !hasLists && !hasDevices {
		return revision, store.Change{}, nil
	}
	// null is not a left-out part: the app refuses it. A part that is left out is read as empty, so that only the
	// other one is checked.
	for _, raw := range []*json.RawMessage{&lists, &devices} {
		if bytes.Equal(*raw, []byte("null")) {
			return 0, store.Change{}, errInvalid
		}
	}
	if unstorable(lists) || unstorable(devices) {
		return 0, store.Change{}, errInvalid
	}
	if !hasLists {
		lists = json.RawMessage("[]")
	}
	if !hasDevices {
		devices = json.RawMessage("[]")
	}
	// The limits of the lists and the number of them are checked by the store, before it touches the database.
	decoded, err := workspace.Decode(lists, devices)
	if err != nil {
		return 0, store.Change{}, err
	}
	return revision, store.Change{Lists: decoded.Lists, Devices: decoded.Devices, HasLists: hasLists, HasDevices: hasDevices}, nil
}

// unstorable reports whether a string or object key anywhere in the JSON value raw holds what PostgreSQL's jsonb cannot
// store, so that the save would fail in the database instead of being refused: U+0000, or a UTF-16 surrogate escape
// that is not part of a pair (Go's decoder reads that as U+FFFD, but a field Typle does not know is saved as written).
// Both can only be written as \u escapes in valid JSON. Most bodies have neither, which a byte search finds without
// reading them; otherwise the strings are read escape by escape, so an escaped backslash (\\u0000) is not taken for
// one. A value that is not valid JSON is left to Decode to refuse.
func unstorable(raw json.RawMessage) bool {
	if !escapeCandidate(raw) {
		return false
	}
	inString := false
	for i := 0; i < len(raw); i++ {
		switch c := raw[i]; {
		case !inString:
			inString = c == '"'
		case c == '"':
			inString = false
		case c == '\\':
			if i+1 < len(raw) && raw[i+1] != 'u' {
				i++
				continue
			}
			unit, ok := escapedUnit(raw, i)
			if !ok {
				return false
			}
			i += 5
			switch {
			case unit == 0 || utf16.IsSurrogate(rune(unit)) && unit >= 0xdc00:
				return true
			case utf16.IsSurrogate(rune(unit)):
				low, ok := escapedUnit(raw, i+1)
				if !ok || low < 0xdc00 || low > 0xdfff {
					return true
				}
				i += 6
			}
		}
	}
	return false
}

// escapeCandidate reports whether raw has an escape that may be U+0000 or a surrogate: \u0000 or \uD800 to \uDFFF.
func escapeCandidate(raw []byte) bool {
	for rest := raw; ; {
		at := bytes.Index(rest, []byte(`\u`))
		if at < 0 || at+6 > len(rest) {
			return false
		}
		if hex := rest[at+2 : at+6]; string(hex) == "0000" || (hex[0]|0x20 == 'd' && strings.IndexByte("89abcdefABCDEF", hex[1]) >= 0) {
			return true
		}
		rest = rest[at+2:]
	}
}

// escapedUnit reads the \uXXXX escape at raw[at] as a UTF-16 code unit.
func escapedUnit(raw []byte, at int) (uint16, bool) {
	if at+6 > len(raw) || raw[at] != '\\' || raw[at+1] != 'u' {
		return 0, false
	}
	unit, err := strconv.ParseUint(string(raw[at+2:at+6]), 16, 16)
	return uint16(unit), err == nil
}

// safeInteger reads a JSON number that Number.isSafeInteger accepts and is not below 0, which is what a revision is.
// It is read as the double JavaScript would make of it, so 1.0 and 1e2 are integers and 1e400 is none.
func safeInteger(raw json.RawMessage) (int, bool) {
	if len(raw) == 0 || (raw[0] != '-' && (raw[0] < '0' || raw[0] > '9')) {
		return 0, false
	}
	number, err := strconv.ParseFloat(string(raw), 64)
	if err != nil || number != math.Trunc(number) || number < 0 || number > maxSafeInteger {
		return 0, false
	}
	return int(number), true
}
