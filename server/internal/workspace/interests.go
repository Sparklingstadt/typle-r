package workspace

import (
	"encoding/json"
	"errors"
)

// The limits of a user's interests (MAX_INTERESTS and MAX_INTEREST_LENGTH in src/core/interests.ts). Lengths are in
// UTF-16 code units, as JavaScript measures them.
const (
	MaxInterests      = 50
	MaxInterestLength = 50
)

// DecodeInterests reads saved or sent interests as decodeInterests (src/core/interests.ts) does: nothing or null is
// none, and anything but a list of at most MaxInterests distinct, non-empty strings of at most MaxInterestLength is
// refused. The ids are not checked against the options: an id this backend does not know is kept as it is.
func DecodeInterests(data []byte) ([]string, error) {
	var raw []*string
	if len(data) > 0 {
		if err := json.Unmarshal(data, &raw); err != nil {
			return nil, errInvalidInterests
		}
	}
	interests := make([]string, 0, len(raw))
	for _, id := range raw {
		if id == nil {
			return nil, errInvalidInterests
		}
		interests = append(interests, *id)
	}
	if err := CheckInterests(interests); err != nil {
		return nil, err
	}
	return interests, nil
}

var errInvalidInterests = errors.New("interests are invalid")

// CheckInterests refuses interests DecodeInterests would refuse: more than MaxInterests, or one that is empty, longer
// than MaxInterestLength or repeated.
func CheckInterests(interests []string) error {
	if len(interests) > MaxInterests {
		return errInvalidInterests
	}
	seen := make(map[string]bool, len(interests))
	for _, id := range interests {
		if id == "" || length(id) > MaxInterestLength || seen[id] {
			return errInvalidInterests
		}
		seen[id] = true
	}
	return nil
}

// EncodeInterests writes interests as they are saved: none is [].
func EncodeInterests(interests []string) ([]byte, error) {
	if interests == nil {
		interests = []string{}
	}
	return marshal(interests)
}
