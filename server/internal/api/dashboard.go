package api

import (
	"net/http"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// clock is the time the dashboard is counted at; tests stop it.
var clock = time.Now

type dashboardSummary struct {
	WeekStart           string                     `json:"weekStart"`
	WeekCount           int                        `json:"weekCount"`
	PreviousWeekCount   int                        `json:"previousWeekCount"`
	WeekSeconds         float64                    `json:"weekSeconds"`
	PreviousWeekSeconds float64                    `json:"previousWeekSeconds"`
	Streak              int                        `json:"streak"`
	PracticedToday      bool                       `json:"practicedToday"`
	Accuracy            *workspace.AccuracySummary `json:"accuracy"`
}

type nextList struct {
	ListID        string           `json:"listId"`
	ListName      string           `json:"listName"`
	LastPracticed *string          `json:"lastPracticed"`
	Reason        workspace.Reason `json:"reason"`
}

type listTrend struct {
	ListID        string            `json:"listId"`
	ListName      string            `json:"listName"`
	Count         int               `json:"count"`
	LastPracticed string            `json:"lastPracticed"`
	Speed         workspace.Trend   `json:"speed"`
	Accuracy      workspace.Trend   `json:"accuracy"`
	Best          *workspace.Record `json:"best"`
}

// dashboard answers the ホーム screen: this week against last, up to three lists to practise next, and each practised
// list's trends. Days and weeks follow tz.
func dashboard(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	loc, ok := location(r.URL.Query())
	if !ok {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	now := clock().In(loc)
	s := workspace.Summarize(ws.Lists, now)
	next := []nextList{}
	for _, item := range workspace.NextLists(ws.Lists, now, 3) {
		next = append(next, nextList{ListID: item.List.ID, ListName: item.List.Name, LastPracticed: formatTime(item.LastPracticed),
			Reason: item.Reason})
	}
	trends := []listTrend{}
	for _, item := range workspace.ListTrends(ws.Lists) {
		trends = append(trends, listTrend{ListID: item.List.ID, ListName: item.List.Name, Count: item.Count,
			LastPracticed: workspace.FormatTime(item.LastPracticed), Speed: item.Speed, Accuracy: item.Accuracy, Best: item.Best})
	}
	respond(w, http.StatusOK, map[string]any{
		"summary": dashboardSummary{WeekStart: workspace.FormatTime(s.WeekStart), WeekCount: s.WeekCount, PreviousWeekCount: s.PreviousWeekCount,
			WeekSeconds: s.WeekSeconds, PreviousWeekSeconds: s.PreviousWeekSeconds, Streak: s.Streak, PracticedToday: s.PracticedToday,
			Accuracy: s.Accuracy},
		"next":   next,
		"trends": trends,
	})
}
