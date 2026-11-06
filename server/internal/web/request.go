package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// maxBodyBytes is MAX_WORKSPACE_BYTES (src/core/workspaceRequest.ts).
const maxBodyBytes = 1 << 20

// maxSafeInteger is Number.MAX_SAFE_INTEGER, the largest revision the app's JavaScript could have counted to.
const maxSafeInteger = 1<<53 - 1

var (
	errTooLarge = errors.New("request body is too large")
	errInvalid  = errors.New("request is not a valid workspace")
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

// saveRequest checks a request that saves, to /api/workspace or its records: the Origin of a cookie's request, a JSON
// body, then the login. It reads the body as a JSON object, answering one that is not with invalid; the object's
// account is the handler's to check. A body that cannot be read is reported as reported. Otherwise it answers the
// request.
func (s *server) saveRequest(w http.ResponseWriter, r *http.Request, reported, invalid string) (session.Session, map[string]json.RawMessage, bool) {
	if !s.fromAppOrOrigin(r) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return session.Session{}, nil, false
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return session.Session{}, nil, false
	}
	if r.Body == nil || r.Body == http.NoBody {
		refuse(w, http.StatusBadRequest, "emptyRequest")
		return session.Session{}, nil, false
	}
	body, err := readBody(r.Body)
	if errors.Is(err, errTooLarge) {
		refuse(w, http.StatusRequestEntityTooLarge, "workspaceTooLarge")
		return session.Session{}, nil, false
	}
	if err != nil {
		s.report(r, err, reported)
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return session.Session{}, nil, false
	}
	fields, err := parseObject(body)
	if err != nil {
		refuse(w, http.StatusBadRequest, invalid)
		return session.Session{}, nil, false
	}
	return user, fields, true
}

// The revision is judged before the lists, as in validateWorkspaceRequest. Saves of apps from before packs (lists
// alone, with their labels) or with profiles (profileId, profiles) are no longer taken: they are invalid.
func decodeFields(fields map[string]json.RawMessage) (revision int, change store.Change, err error) {
	revision, ok := safeInteger(fields["revision"])
	if !ok {
		return 0, store.Change{}, errInvalid
	}
	_, hasProfile := fields["profileId"]
	_, hasProfiles := fields["profiles"]
	lists, hasLists := fields["lists"]
	packs, hasPacks := fields["packs"]
	devices, hasDevices := fields["devices"]
	// Packs are saved only with their lists; lists sent without them are each put in a pack of their own.
	if hasProfile || hasProfiles || (hasPacks && !hasLists) {
		return 0, store.Change{}, errInvalid
	}
	// Interests may be all a save sets. They are judged after the other parts, as in validateWorkspaceRequest, so that
	// lists whose levels overlap are told so first.
	sentInterests, hasInterests := fields["interests"]
	interests, interestsErr := decodeInterests(sentInterests, hasInterests)
	if !hasLists && !hasDevices {
		if interestsErr != nil {
			return 0, store.Change{}, interestsErr
		}
		return revision, store.Change{Interests: interests, HasInterests: hasInterests}, nil
	}
	decoded, err := decodeParts(lists, packs, devices, hasLists, hasPacks, hasDevices)
	if err != nil {
		return 0, store.Change{}, err
	}
	if interestsErr != nil {
		return 0, store.Change{}, interestsErr
	}
	// The lists are stored as Decode repaired them, with the packs it made for lists sent without them.
	return revision, store.Change{Lists: decoded.Lists, Packs: decoded.Packs, Devices: decoded.Devices, Interests: interests,
		HasLists: hasLists, HasPacks: hasLists, HasDevices: hasDevices, HasInterests: hasInterests}, nil
}

// decodeParts checks the lists, packs and devices of a save as validateWorkspaceRequest does, and reads them with
// Decode. A part left out (has… false) is read as empty, so that only the others are checked.
func decodeParts(lists, packs, devices json.RawMessage, hasLists, hasPacks, hasDevices bool) (*workspace.Workspace, error) {
	// null is not a left-out part: the app refuses it. A part that is left out is read as empty, so that only the
	// other one is checked.
	for _, raw := range []*json.RawMessage{&lists, &packs, &devices} {
		if bytes.Equal(*raw, []byte("null")) {
			return nil, errInvalid
		}
	}
	if unstorable(lists) || unstorable(packs) || unstorable(devices) {
		return nil, errInvalid
	}
	// Lists sent with packs are checked with them as they were sent, before Decode repairs them.
	if hasPacks {
		if err := workspace.CheckLibrary(lists, packs); err != nil {
			return nil, err
		}
	} else {
		packs = json.RawMessage("[]")
	}
	if !hasLists {
		lists = json.RawMessage("[]")
	} else if sent, err := workspace.DecodeLists(lists); err != nil || workspace.CheckLimits(sent) != nil {
		// The limits of the lists as sent, such as their levels before Decode joins them.
		return nil, errInvalid
	}
	if !hasDevices {
		devices = json.RawMessage("[]")
	}
	// The limits of the lists and the number of them are checked by the store, before it touches the database.
	return workspace.Decode(lists, devices, packs)
}

// decodeInterests reads the interests of a save as decodeInterests (src/core/interests.ts) does: null is none. Left out
// (sent false), they are nil and stay as saved.
func decodeInterests(raw json.RawMessage, sent bool) ([]string, error) {
	if !sent {
		return nil, nil
	}
	if unstorable(raw) {
		return nil, errInvalid
	}
	return workspace.DecodeInterests(raw)
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

// fromAppOrOrigin reports whether a request may change the account's data: the Origin keeps other sites from changing it
// with the browser's cookie. An app's (iPad, Mac, Android or Windows) token is not sent by a browser on its own, so its
// requests, which have no Origin, need none.
func (s *server) fromAppOrOrigin(r *http.Request) bool {
	return fromApp(r) || s.sameOrigin(r)
}

// sameOrigin reports whether the request comes from the app's own pages: its Origin is that of BaseURL, written as a
// browser writes it (lower case, without the default port). State-changing requests must pass this.
func (s *server) sameOrigin(r *http.Request) bool {
	base := s.config.BaseURL
	if base == nil || base.Host == "" {
		return false
	}
	scheme, host := strings.ToLower(base.Scheme), strings.ToLower(base.Hostname())
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port := base.Port(); port != "" && !(scheme == "http" && port == "80") && !(scheme == "https" && port == "443") {
		host += ":" + port
	}
	origin := r.Header.Get("Origin")
	return origin != "" && origin == scheme+"://"+host
}

// jsonContent reports whether the request's body is declared as JSON. A form cannot send that type to another site
// without asking first (CORS), so with the Origin it keeps other sites' pages out.
//
// The media type is compared as written, so Application/JSON is refused (TestPutForbidden, "other case"),
// though media types are case-insensitive. This is on purpose: the app always sends application/json, and the check
// is kept as it was decided. Accepting other cases would not weaken the CORS check, as no case of application/json is a type a form may send without asking.
func jsonContent(r *http.Request) bool {
	return strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]) == "application/json"
}
