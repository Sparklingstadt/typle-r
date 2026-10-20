package workspace

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// lowerCase lowercases as JavaScript's toLowerCase does, which the app uses to compare list names. It differs from
// strings.ToLower in two ways: İ becomes i and a combining dot above, and Σ at the end of a word becomes ς
// (Final_Sigma in Unicode's SpecialCasing.txt).
func lowerCase(value string) string {
	var b strings.Builder
	for i, r := range value {
		switch {
		case r == 'İ':
			b.WriteString("i̇")
		case r == 'Σ' && casedBefore(value[:i]) && !casedAfter(value[i+utf8.RuneLen(r):]):
			b.WriteRune('ς')
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// casedBefore tells whether the last character of s that is not case-ignorable is cased.
func casedBefore(s string) bool {
	for s != "" {
		r, size := utf8.DecodeLastRuneInString(s)
		if !caseIgnorable(r) {
			return cased(r)
		}
		s = s[:len(s)-size]
	}
	return false
}

// casedAfter tells whether the first character of s that is not case-ignorable is cased.
func casedAfter(s string) bool {
	for _, r := range s {
		if !caseIgnorable(r) {
			return cased(r)
		}
	}
	return false
}

// Cased and Case_Ignorable as Unicode defines them (DerivedCoreProperties.txt).
func cased(r rune) bool {
	return unicode.In(r, unicode.Lu, unicode.Ll, unicode.Lt, unicode.Other_Lowercase, unicode.Other_Uppercase)
}

func caseIgnorable(r rune) bool {
	switch r {
	// Word_Break MidLetter, MidNumLet and Single_Quote (WordBreakProperty.txt).
	case ':', '·', '·', '՟', '״', '‧', '︓', '﹕', '：',
		'.', '‘', '’', '․', '﹒', '＇', '．',
		'\'':
		return true
	}
	return unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk)
}

// trimJS removes what JavaScript's trim removes: White_Space and U+FEFF, but not U+0085, which strings.TrimSpace
// removes. The app trims names, words and imported cells with it.
func trimJS(value string) string {
	return strings.TrimFunc(value, func(r rune) bool { return r == 0xfeff || (unicode.IsSpace(r) && r != 0x85) })
}
