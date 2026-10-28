package workspace

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestWordInputTypesRoundTripWithoutChangingLegacyWords(t *testing.T) {
	original := []Word{
		{Display: "ls", Input: "ls", InputType: "command"},
		{Display: "SELECT 1;", Input: "SELECT 1;", InputType: "code"},
		{Display: "字", Input: "zi", InputType: "word"},
		{Display: "legacy", Input: "legacy", Extra: `{"reading":"kept"}`},
	}
	encoded, err := Encode([]List{{ID: "l", Name: "L", CreatedAt: "x", Words: original}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(encoded), `"input_type"`) != 3 {
		t.Fatalf("legacy word gained a type: %s", encoded)
	}
	decoded, err := DecodeLists(encoded)
	if err != nil || !reflect.DeepEqual(decoded[0].Words, original) {
		t.Fatalf("typed words changed: %+v, %v", decoded, err)
	}
}

func TestWordInputTypeRejectsInvalidJSONAcrossEntryPoints(t *testing.T) {
	for _, value := range []string{`null`, `""`, `"Code"`, `" command "`, `"unknown"`, `1`, `true`, `{}`, `[]`} {
		t.Run(value, func(t *testing.T) {
			word := `{"display":"x","input":"x","annotation":"","input_type":` + value + `}`
			var direct Word
			if err := json.Unmarshal([]byte(word), &direct); err == nil {
				t.Fatal("list/pack request accepted an invalid type")
			}
			stored := `[{"id":"l","name":"L","createdAt":"x","words":[` + word + `],"records":[]}]`
			if _, err := DecodeLists([]byte(stored)); err == nil {
				t.Fatal("stored/workspace word accepted an invalid type")
			}
			file := packFileText(`[{"name":"L","words":[`+word+`]}]`, `{"name":"P"}`)
			if _, err := DecodePackFile([]byte(file)); err == nil {
				t.Fatal("pack file accepted an invalid type")
			}
		})
	}
	for _, value := range []string{"", "command", "code", "word"} {
		if err := checkWords([]Word{{Display: "x", Input: "x", InputType: value}}); err != nil {
			t.Errorf("valid type %q rejected: %v", value, err)
		}
	}
	invalid := []Word{{Display: "x", Input: "x", InputType: "other"}}
	if err := checkWords(invalid); err == nil {
		t.Fatal("typed internal mutation bypassed validation")
	}
	if err := CheckLimits([]List{{Words: invalid}}); err == nil {
		t.Fatal("typed workspace bypassed validation")
	}
}

func TestWordInputTypeSurvivesPackExportImportAndCopy(t *testing.T) {
	w := editLibrary()
	w.Lists[0].Words[0].InputType = "command"
	w.Lists[2].Words[0].InputType = "code"
	encoded, err := EncodePackFile(w, "p")
	if err != nil {
		t.Fatal(err)
	}
	file, err := DecodePackFile(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if file.Lists[0].Words[0].InputType != "command" || file.Lists[1].Words[0].InputType != "code" {
		t.Fatalf("export/import dropped types: %+v", file.Lists)
	}
	if _, err := ImportPack(w, file, "import", []string{"ia", "ib"}, time.Now()); err != nil {
		t.Fatal(err)
	}
	if w.Find("ia").Words[0].InputType != "command" || w.Find("ib").Words[0].InputType != "code" {
		t.Fatal("importing pack dropped types")
	}
	if _, err := CopyPack(w, "p", nil, "copy", []string{"ca", "cb"}, time.Now()); err != nil {
		t.Fatal(err)
	}
	if w.Find("ca").Words[0].InputType != "command" || w.Find("cb").Words[0].InputType != "code" {
		t.Fatal("copying pack dropped types")
	}
}

func TestTypedWordCSVAndTSV(t *testing.T) {
	original := []Word{
		{Display: "ls", Input: "ls", InputType: "command"},
		{Display: "a\nb", Input: "a b", InputType: "code"},
		{Display: "字", Input: "zi", InputType: "word"},
		{Display: "legacy", Input: "legacy"},
	}
	csv := EncodeWordCSV(original)
	if !strings.HasPrefix(csv, bom+"input,display,annotation,input_type\r\n") {
		t.Fatalf("typed header missing: %s", csv)
	}
	actual, err := ParseWordFile(csv, ',')
	if err != nil || !reflect.DeepEqual(actual, original) {
		t.Fatalf("typed CSV roundtrip: %+v, %v", actual, err)
	}
	if strings.Contains(EncodeWordCSV(original[3:]), "input_type") {
		t.Fatal("legacy CSV gained a column")
	}
	tsv := "input\tdisplay\tinput_type\nx\tx\tcode\ny\ty\t"
	actual, err = ParseWordFile(tsv, '\t')
	if err != nil || actual[0].InputType != "code" || actual[1].InputType != "" {
		t.Fatalf("typed TSV: %+v, %v", actual, err)
	}
	for _, value := range []string{"Code", " code ", "null", "other"} {
		wantImportError(t, "input,display,input_type\nx,x,"+value, ',', "importInputTypeInvalid", 2)
	}
}
