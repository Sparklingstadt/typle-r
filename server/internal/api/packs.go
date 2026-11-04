package api

import (
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// packSummary is a word pack with what the app's list of packs shows of it, as packOverviews (src/core/packEditing.ts).
type packSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Description, Category and Origin are null and Tags empty when the pack has none.
	Description        *string           `json:"description"`
	Category           *string           `json:"category"`
	Tags               []string          `json:"tags"`
	Origin             *workspace.Origin `json:"origin"`
	CreatedAt          string            `json:"createdAt"`
	ListCount          int               `json:"listCount"`
	WordCount          int               `json:"wordCount"`
	PracticeCount      int               `json:"practiceCount"`
	PracticedListCount int               `json:"practicedListCount"`
	LastPracticed      *string           `json:"lastPracticed"`
}

type packDetail struct {
	packSummary
	Lists []listSummary `json:"lists"`
}

// packLists returns the lists of the pack in saved order.
func packLists(ws *workspace.Workspace, packID string) []*workspace.List {
	var lists []*workspace.List
	for i := range ws.Lists {
		if ws.Lists[i].PackID == packID {
			lists = append(lists, &ws.Lists[i])
		}
	}
	return lists
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func packSummaryOf(ws *workspace.Workspace, pack *workspace.Pack) packSummary {
	tags := pack.Tags
	if tags == nil {
		tags = []string{}
	}
	summary := packSummary{ID: pack.ID, Name: pack.Name, Description: optional(pack.Description), Category: optional(pack.Category),
		Tags: tags, Origin: pack.Origin, CreatedAt: pack.CreatedAt}
	var last *time.Time
	for _, list := range packLists(ws, pack.ID) {
		overview := workspace.Overviews([]workspace.List{*list})[0]
		summary.ListCount++
		summary.WordCount += len(list.Words)
		summary.PracticeCount += overview.PracticeCount
		if overview.PracticeCount > 0 {
			summary.PracticedListCount++
		}
		if overview.LastPracticed != nil && (last == nil || overview.LastPracticed.After(*last)) {
			last = overview.LastPracticed
		}
	}
	if last != nil {
		formatted := workspace.FormatTime(*last)
		summary.LastPracticed = &formatted
	}
	return summary
}

func packDetailOf(ws *workspace.Workspace, pack *workspace.Pack) packDetail {
	lists := []listSummary{}
	for _, list := range packLists(ws, pack.ID) {
		lists = append(lists, summary(list))
	}
	return packDetail{packSummary: packSummaryOf(ws, pack), Lists: lists}
}

// matchesPack follows matchesPackQuery (src/core/packEditing.ts) and matchesFilter: q finds the pack by its name, or by
// the name, category, tags or words of a list inside; category ("" for none) and every tag narrow by the pack's labels.
func matchesPack(ws *workspace.Workspace, pack *workspace.Pack, query string, category *string, tags []string) bool {
	if !workspace.MatchesFilter(&workspace.List{Category: pack.Category, Tags: pack.Tags}, category, tags) {
		return false
	}
	if workspace.MatchesQuery(&workspace.List{Name: pack.Name}, query) {
		return true
	}
	return slices.ContainsFunc(packLists(ws, pack.ID), func(list *workspace.List) bool { return workspace.MatchesQuery(list, query) })
}

// packs answers the packs in their saved order, keeping those that match the q, category and tag queries.
func packs(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	query := r.URL.Query()
	var category *string
	if query.Has("category") {
		value := query.Get("category")
		category = &value
	}
	packs := make([]packSummary, 0, len(ws.Packs))
	for i := range ws.Packs {
		if matchesPack(ws, &ws.Packs[i], query.Get("q"), category, query["tag"]) {
			packs = append(packs, packSummaryOf(ws, &ws.Packs[i]))
		}
	}
	respond(w, http.StatusOK, map[string]any{"packs": packs})
}

func pack(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	pack := ws.FindPack(r.PathValue("packId"))
	if pack == nil {
		failure(w, http.StatusNotFound, "packNotFound")
		return
	}
	respond(w, http.StatusOK, map[string]any{"pack": packDetailOf(ws, pack)})
}

// exportPack answers a pack as the file the app's 書き出し saves, named by the pack as words.csv is by its list.
func exportPack(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	file, err := workspace.EncodePackFile(ws, r.PathValue("packId"))
	if err != nil {
		var refused *workspace.Error
		if errors.As(err, &refused) {
			failure(w, http.StatusNotFound, refused.Key)
		} else {
			failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
		}
		return
	}
	filename := workspace.WordFilename(ws.FindPack(r.PathValue("packId")).Name, "typle-pack.json")
	download(w, "application/json; charset=utf-8", filename, file)
}

// modifyPack is modify for a change that makes or edits one pack, which it answers with in its saved shape.
func (s *server) modifyPack(w http.ResponseWriter, r *http.Request, owner string, status int,
	change func(*workspace.Workspace) (*workspace.Pack, error)) {
	var id string
	saved := s.save(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		pack, err := change(ws)
		if err != nil {
			return false, err
		}
		id = pack.ID
		return true, nil
	})
	if saved == nil {
		return
	}
	respond(w, status, map[string]any{"pack": packDetailOf(saved, saved.FindPack(id))})
}

// newIDs makes count new list ids.
func newIDs(count int) []string {
	ids := make([]string, count)
	for i := range ids {
		ids[i] = workspace.NewID()
	}
	return ids
}

// The bodies of POST and PATCH /api/v1/packs/{p}: a new pack has its lists, and a change may reorder them.
type (
	createPackBody struct {
		Name        *string                   `json:"name"`
		Description *string                   `json:"description"`
		Category    *string                   `json:"category"`
		Tags        *[]string                 `json:"tags"`
		Lists       []workspace.PackListInput `json:"lists"`
	}
	updatePackBody struct {
		Name        *string   `json:"name"`
		Description *string   `json:"description"`
		Category    *string   `json:"category"`
		Tags        *[]string `json:"tags"`
		ListOrder   *[]string `json:"listOrder"`
	}
)

func (s *server) createPack(w http.ResponseWriter, r *http.Request, owner string) {
	body, ok := decode[createPackBody](w, r)
	if !ok {
		return
	}
	input := workspace.PackInput{Name: body.Name, Description: body.Description, Category: body.Category, Tags: body.Tags, Lists: body.Lists}
	id, listIDs, now := workspace.NewID(), newIDs(len(body.Lists)), time.Now()
	s.modifyPack(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.Pack, error) {
		return workspace.CreatePack(ws, input, id, listIDs, now)
	})
}

func (s *server) updatePack(w http.ResponseWriter, r *http.Request, owner string) {
	body, ok := decode[updatePackBody](w, r)
	if !ok {
		return
	}
	if *body == (updatePackBody{}) {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	input := workspace.PackInput{Name: body.Name, Description: body.Description, Category: body.Category, Tags: body.Tags, ListOrder: body.ListOrder}
	s.modifyPack(w, r, owner, http.StatusOK, func(ws *workspace.Workspace) (*workspace.Pack, error) {
		return workspace.UpdatePack(ws, r.PathValue("packId"), input)
	})
}

func (s *server) deletePack(w http.ResponseWriter, r *http.Request, owner string) {
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		return true, workspace.DeletePack(ws, r.PathValue("packId"))
	}) {
		return
	}
	noContent(w)
}

// copyPack takes an optional body, as copyList does: none copies with the generated name, { "name" } names the copy.
func (s *server) copyPack(w http.ResponseWriter, r *http.Request, owner string) {
	var name *string
	if r.ContentLength != 0 {
		input, ok := decode[struct {
			Name *string `json:"name"`
		}](w, r)
		if !ok {
			return
		}
		name = input.Name
	}
	id, now := workspace.NewID(), time.Now()
	s.modifyPack(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.Pack, error) {
		// The ids are made here, where the source's lists are counted.
		return workspace.CopyPack(ws, r.PathValue("packId"), name, id, newIDs(len(packLists(ws, r.PathValue("packId")))), now)
	})
}

// importPack adds the pack of a pack file sent as the body, as the app's ファイルから追加 does.
func (s *server) importPack(w http.ResponseWriter, r *http.Request, owner string) {
	if !jsonContent(r) {
		failure(w, http.StatusUnsupportedMediaType, "unsupportedContentType")
		return
	}
	data, ok := readImport(w, r)
	if !ok {
		return
	}
	file, err := workspace.DecodePackFile(data)
	if err != nil {
		refused := &workspace.Error{Key: "packFileUnreadable"}
		errors.As(err, &refused)
		refuse(w, r, refused)
		return
	}
	id, listIDs, now := workspace.NewID(), newIDs(len(file.Lists)), time.Now()
	s.modifyPack(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.Pack, error) {
		return workspace.ImportPack(ws, file, id, listIDs, now)
	})
}
