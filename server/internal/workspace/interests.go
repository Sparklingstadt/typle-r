package workspace

import (
	"encoding/json"
	"errors"
	"slices"
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
	invalid := errors.New("interests are invalid")
	var raw []*string
	if len(data) > 0 {
		if err := json.Unmarshal(data, &raw); err != nil {
			return nil, invalid
		}
	}
	if len(raw) > MaxInterests {
		return nil, invalid
	}
	interests := make([]string, 0, len(raw))
	for _, id := range raw {
		if id == nil || *id == "" || length(*id) > MaxInterestLength || slices.Contains(interests, *id) {
			return nil, invalid
		}
		interests = append(interests, *id)
	}
	return interests, nil
}

// EncodeInterests writes interests as they are saved: none is [].
func EncodeInterests(interests []string) ([]byte, error) {
	if interests == nil {
		interests = []string{}
	}
	return marshal(interests)
}
