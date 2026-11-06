package workspace

import (
	"testing"
)

func TestCompareNames(t *testing.T) {
	if CompareNames("List 2", "List 10", true) >= 0 || CompareNames("List 10", "List 2", false) >= 0 {
		t.Fatal("numeric order")
	}
	if CompareNames("あ", "い", true) >= 0 || CompareNames("a", "B", true) >= 0 || CompareNames("x", "x", false) != 0 {
		t.Fatal("order")
	}
}
