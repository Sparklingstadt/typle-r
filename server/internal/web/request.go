package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strconv"
	"strings"

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
	data, err := io.ReadAll(io.LimitReader(body, maxBodyBytes+1))
	if err == nil && len(data) > maxBodyBytes {
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
	if hasNUL(lists) || hasNUL(devices) {
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

// hasNUL reports whether a string or object key anywhere in the JSON value raw holds U+0000, which PostgreSQL's jsonb
// cannot store: the save would fail in the database instead of being refused. The value is read token by token, so an
// escaped backslash (\\u0000) is not taken for a NUL. A value that is not valid JSON is left to Decode to refuse.
func hasNUL(raw json.RawMessage) bool {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	for {
		token, err := decoder.Token()
		if err != nil {
			return false
		}
		if text, ok := token.(string); ok && strings.ContainsRune(text, 0) {
			return true
		}
	}
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
