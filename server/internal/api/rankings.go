package api

import (
	"net/http"
	"net/url"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// rankingOptions reads device, order (accuracy or speed), mode (typing or writing) and includeOthers (true or false),
// as the ベスト記録 screen's.
func rankingOptions(query url.Values) (device, order, mode string, includeOthers, ok bool) {
	order, mode = "accuracy", "typing"
	if query.Has("order") {
		order = query.Get("order")
	}
	if query.Has("mode") {
		mode = query.Get("mode")
	}
	switch query.Get("includeOthers") {
	case "", "false":
	case "true":
		includeOthers = true
	default:
		return "", "", "", false, false
	}
	return query.Get("device"), order, mode, includeOthers, (order == "accuracy" || order == "speed") && (mode == "typing" || mode == "writing")
}

func formatTime(at *time.Time) *string {
	if at == nil {
		return nil
	}
	formatted := workspace.FormatTime(*at)
	return &formatted
}

type rankingSummary struct {
	ListID        string            `json:"listId"`
	ListName      string            `json:"listName"`
	WordCount     int               `json:"wordCount"`
	RecordCount   int               `json:"recordCount"`
	Best          *workspace.Record `json:"best"`
	LastPracticed *string           `json:"lastPracticed"`
	Improved      bool              `json:"improved"`
}

// rankings answers every list's best on the chosen device, ordered by sort (recent, name or count).
func rankings(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	query := r.URL.Query()
	device, order, mode, _, ok := rankingOptions(query)
	sort := "recent"
	if query.Has("sort") {
		sort = query.Get("sort")
	}
	all := make([]workspace.Ranking, 0, len(ws.Lists))
	for i := range ws.Lists {
		all = append(all, workspace.ListRanking(&ws.Lists[i], device, order, mode, false, time.Now()))
	}
	sorted, okSort := workspace.SortRankings(all, sort)
	if !ok || !okSort {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	out := make([]rankingSummary, 0, len(sorted))
	for _, ranking := range sorted {
		out = append(out, rankingSummary{ListID: ranking.List.ID, ListName: ranking.List.Name, WordCount: len(ranking.List.Words),
			RecordCount: len(ranking.Records), Best: ranking.Best, LastPracticed: formatTime(ranking.LastPracticed), Improved: ranking.Improved})
	}
	respond(w, http.StatusOK, map[string]any{"rankings": out})
}

// ranking answers one list's ranking in full: every ranked record, the other word counts and the figures above it.
func ranking(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	device, order, mode, includeOthers, ok := rankingOptions(r.URL.Query())
	if !ok {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	ranking := workspace.ListRanking(list, device, order, mode, includeOthers, time.Now())
	respond(w, http.StatusOK, map[string]any{"ranking": map[string]any{
		"listId": list.ID, "listName": list.Name, "wordCount": len(list.Words), "ranked": ranking.Ranked, "best": ranking.Best,
		"fallback": ranking.Fallback, "otherCounts": ranking.OtherCounts, "lastPracticed": formatTime(ranking.LastPracticed),
		"improved": ranking.Improved, "stats": workspace.Stats(ranking.Ranked),
	}})
}
