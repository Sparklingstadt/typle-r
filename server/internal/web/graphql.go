package web

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/web/graph"
)

// POST /api/graphql serves the schema of server/internal/web/graph. Each field goes through what its REST path goes
// through (the login, the Origin of a change, the checks of the body and the store), and is refused with the same error
// key: a GraphQL error whose extensions are { code: <key>, status: <the REST path's status> }, so that the app tells
// errors apart as it does by status. A failure of the server (a 503) is reported as the REST path reports it.
//
// The request itself is checked as a change through REST is: a POST of JSON (a form cannot send that type to another
// site without asking first), within the size of a save. A mutation also needs the app's own Origin, or an app's token.
// Errors of the request are answered as REST answers them ({ "error": <key> }), as nothing has been run yet.

// maxGraphQLBytes is a save's limit (maxBodyBytes) with room for the query and the other members.
const maxGraphQLBytes = maxBodyBytes + 64<<10

// maxComplexity keeps a query from asking for the same lists many times over: each field counts 1.
const maxComplexity = 200

// call is the request a resolver answers, and where it may remove a cookie.
type call struct {
	w http.ResponseWriter
	r *http.Request
}

type callKey struct{}

func callOf(ctx context.Context) call { return ctx.Value(callKey{}).(call) }

// newGraphQL builds the GraphQL handler of s.
func (s *server) newGraphQL() http.Handler {
	h := handler.New(graph.NewExecutableSchema(graph.Config{Resolvers: &resolver{s}}))
	h.AddTransport(transport.POST{})
	h.SetQueryCache(lru.New[*ast.QueryDocument](100))
	h.Use(extension.Introspection{})
	h.Use(extension.FixedComplexityLimit(maxComplexity))
	return h
}

func (s *server) graphql(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	if r.Body == nil || r.Body == http.NoBody {
		refuse(w, http.StatusBadRequest, "emptyRequest")
		return
	}
	body, err := readLimited(r.Body, maxGraphQLBytes)
	if errors.Is(err, errTooLarge) {
		refuse(w, http.StatusRequestEntityTooLarge, "workspaceTooLarge")
		return
	}
	if err != nil {
		s.report(r, err, "graphql.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	// As every JSON answer: the account's own, and never kept by a cache.
	header := w.Header()
	header.Set("Cache-Control", "private, no-store")
	header.Set("Vary", "Cookie")
	r = r.WithContext(context.WithValue(r.Context(), callKey{}, call{w, r}))
	s.graphqlHandler.ServeHTTP(w, r)
}

// graphqlError is f as a GraphQL error of the field being resolved, reported if it is the server's failure.
func (s *server) graphqlError(ctx context.Context, f *failure) error {
	c := callOf(ctx)
	if f.err != nil {
		s.report(c.r, f.err, f.operation)
	}
	return &gqlerror.Error{
		Path:       graphql.GetPath(ctx),
		Message:    f.key,
		Extensions: map[string]any{"code": f.key, "status": f.status},
	}
}

type resolver struct{ s *server }

func (r *resolver) Query() graph.QueryResolver                       { return query{r.s} }
func (r *resolver) Mutation() graph.MutationResolver                 { return mutation{r.s} }
func (r *resolver) GalleryPack() graph.GalleryPackResolver           { return galleryPack{} }
func (r *resolver) AdminGalleryPack() graph.AdminGalleryPackResolver { return adminGalleryPack{} }

type query struct{ s *server }

type mutation struct{ s *server }

// workspaceOf is the saved workspace as GET /api/workspace answers it.
func workspaceOf(result *store.Saved, owner string) *graph.Workspace {
	a := answer(result, owner)
	return &graph.Workspace{Lists: graph.JSON(a.Lists), Packs: graph.JSON(a.Packs), Devices: graph.JSON(a.Devices),
		Interests: graph.JSON(a.Interests), Revision: a.Revision, AccountID: a.AccountID}
}

// graphqlOwner is the signed-in account, refused as REST refuses it (account).
func (s *server) graphqlOwner(ctx context.Context) (string, error) {
	c := callOf(ctx)
	user, f := s.account(c.w, c.r)
	if f != nil {
		return "", s.graphqlError(ctx, f)
	}
	return user.Sub, nil
}

// changer is graphqlOwner for a mutation: the request must come from the app's own Origin, or from an app.
func (s *server) changer(ctx context.Context) (string, error) {
	if err := s.fromAppOrOriginError(ctx); err != nil {
		return "", err
	}
	return s.graphqlOwner(ctx)
}

// fromAppOrOriginError refuses a mutation that does not come from the app's own Origin, or from an app.
func (s *server) fromAppOrOriginError(ctx context.Context) error {
	if !s.fromAppOrOrigin(callOf(ctx).r) {
		return s.graphqlError(ctx, refused(http.StatusForbidden, "forbiddenRequest"))
	}
	return nil
}

// adminError refuses a request of someone other than the administrator, as REST refuses it (administrator).
func (s *server) adminError(ctx context.Context) error {
	c := callOf(ctx)
	if _, f := s.administrator(c.w, c.r); f != nil {
		return s.graphqlError(ctx, f)
	}
	return nil
}

func (q query) Workspace(ctx context.Context) (*graph.Workspace, error) {
	owner, err := q.s.graphqlOwner(ctx)
	if err != nil {
		return nil, err
	}
	result, f := q.s.loadWorkspace(callOf(ctx).r, owner)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return workspaceOf(result, owner), nil
}

func (q query) Shares(ctx context.Context) ([]store.Share, error) {
	owner, err := q.s.graphqlOwner(ctx)
	if err != nil {
		return nil, err
	}
	shares, f := q.s.accountShares(callOf(ctx).r, owner)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return shares, nil
}

// SharedPack is read by anyone with the link, signed in or not.
func (q query) SharedPack(ctx context.Context, id string) (graph.JSON, error) {
	data, f := q.s.sharedFile(callOf(ctx).r, id)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return graph.JSON(data), nil
}

// Gallery is read by anyone, signed in or not.
func (q query) Gallery(ctx context.Context, text, category string, sort graph.GallerySort, page int) (*graph.GalleryPage, error) {
	order := store.GalleryNew
	if sort == graph.GallerySortPopular {
		order = store.GalleryPopular
	}
	search, ok := checkGalleryQuery(text, category, order, page)
	if !ok {
		return nil, q.s.graphqlError(ctx, refused(http.StatusBadRequest, "invalidQuery"))
	}
	result, f := q.s.galleryPage(callOf(ctx).r, search)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	packs := result.Packs
	if packs == nil {
		packs = []store.GalleryPack{}
	}
	return &graph.GalleryPage{Packs: packs, More: result.More}, nil
}

// GalleryCategories is read by anyone, signed in or not.
func (q query) GalleryCategories(ctx context.Context) ([]store.GalleryCategory, error) {
	categories, f := q.s.categories(callOf(ctx).r)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return categories, nil
}

func (q query) AdminGallery(ctx context.Context) ([]store.AdminGalleryPack, error) {
	if err := q.s.adminError(ctx); err != nil {
		return nil, err
	}
	packs, f := q.s.adminGalleryPacks(callOf(ctx).r)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return packs, nil
}

func (q query) AdminDashboard(ctx context.Context) (*graph.AdminDashboard, error) {
	c := callOf(ctx)
	admin, f := q.s.administrator(c.w, c.r)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	overview, f := q.s.overview(c.r)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return &graph.AdminDashboard{Admin: &graph.Admin{Email: admin.Email, Sub: admin.Sub}, Overview: overview}, nil
}

func (q query) AdminUsers(ctx context.Context, page int) (*graph.AdminUsers, error) {
	c := callOf(ctx)
	if _, f := q.s.administrator(c.w, c.r); f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	users, f := q.s.usersPage(c.r, page)
	if f != nil {
		return nil, q.s.graphqlError(ctx, f)
	}
	return &graph.AdminUsers{Page: page, PageSize: store.AdminUsersPage, Total: users.Total, Users: users.Users}, nil
}

// member is a value as a member of a REST body.
func member(value any) json.RawMessage {
	data, _ := json.Marshal(value)
	return data
}

// part is a part of a save as a member of a PUT body: left out when it is not set, and null when it is set to null,
// which the save refuses as PUT refuses it.
func part(fields map[string]json.RawMessage, name string, value graphql.Omittable[graph.JSON]) {
	sent, set := value.ValueOK()
	switch {
	case !set:
	case len(sent) == 0:
		fields[name] = json.RawMessage("null")
	default:
		fields[name] = json.RawMessage(sent)
	}
}

func (m mutation) SaveWorkspace(ctx context.Context, input graph.SaveWorkspaceInput) (*graph.Workspace, error) {
	owner, err := m.s.changer(ctx)
	if err != nil {
		return nil, err
	}
	fields := map[string]json.RawMessage{"accountId": member(input.AccountID), "revision": member(input.Revision)}
	part(fields, "lists", input.Lists)
	part(fields, "packs", input.Packs)
	part(fields, "devices", input.Devices)
	part(fields, "interests", input.Interests)
	result, f := m.s.saveWorkspace(callOf(ctx).r, owner, fields)
	if f != nil {
		return nil, m.s.graphqlError(ctx, f)
	}
	return workspaceOf(result, owner), nil
}

func (m mutation) AddRecord(ctx context.Context, input graph.AddRecordInput) (*graph.RecordAdded, error) {
	owner, err := m.s.changer(ctx)
	if err != nil {
		return nil, err
	}
	record := json.RawMessage(input.Record)
	if len(record) == 0 {
		record = json.RawMessage("null")
	}
	fields := map[string]json.RawMessage{"accountId": member(input.AccountID), "listId": member(input.ListID), "record": record}
	saved, added, result, f := m.s.recordAdd(callOf(ctx).r, owner, fields)
	if f != nil {
		return nil, m.s.graphqlError(ctx, f)
	}
	return &graph.RecordAdded{Workspace: workspaceOf(result, owner), Record: graph.JSON(member(saved)), Added: added}, nil
}

func (m mutation) DeleteRecord(ctx context.Context, input graph.DeleteRecordInput) (*graph.Workspace, error) {
	owner, err := m.s.changer(ctx)
	if err != nil {
		return nil, err
	}
	fields := map[string]json.RawMessage{"accountId": member(input.AccountID), "listId": member(input.ListID), "recordId": member(input.RecordID)}
	result, f := m.s.recordDelete(callOf(ctx).r, owner, fields)
	if f != nil {
		return nil, m.s.graphqlError(ctx, f)
	}
	return workspaceOf(result, owner), nil
}

func (m mutation) SharePack(ctx context.Context, packID string, listed *bool) (*store.Share, error) {
	owner, err := m.s.changer(ctx)
	if err != nil {
		return nil, err
	}
	share, f := m.s.sharePack(callOf(ctx).r, owner, packID, listed)
	if f != nil {
		return nil, m.s.graphqlError(ctx, f)
	}
	return share, nil
}

func (m mutation) StopSharing(ctx context.Context, packID string) (bool, error) {
	owner, err := m.s.changer(ctx)
	if err != nil {
		return false, err
	}
	if f := m.s.stopSharing(callOf(ctx).r, owner, packID); f != nil {
		return false, m.s.graphqlError(ctx, f)
	}
	return true, nil
}

// CountAdded needs no login, only the app's own Origin or an app, as POST /api/gallery/added.
func (m mutation) CountAdded(ctx context.Context, id string) (bool, error) {
	if err := m.s.fromAppOrOriginError(ctx); err != nil {
		return false, err
	}
	c := callOf(ctx)
	if f := m.s.countAdded(c.w, c.r, id); f != nil {
		return false, m.s.graphqlError(ctx, f)
	}
	return true, nil
}

// ReportPack needs no login, only the app's own Origin or an app, as POST /api/gallery/reports.
func (m mutation) ReportPack(ctx context.Context, id, reason string) (bool, error) {
	if err := m.s.fromAppOrOriginError(ctx); err != nil {
		return false, err
	}
	c := callOf(ctx)
	if f := m.s.reportPack(c.w, c.r, id, reason); f != nil {
		return false, m.s.graphqlError(ctx, f)
	}
	return true, nil
}

// SetPackHidden is the administrator's, from the app's own Origin only (the administrator has no app token), as POST
// /api/admin/gallery/hide checks it: the administrator first, then the Origin.
func (m mutation) SetPackHidden(ctx context.Context, id string, hidden bool) (bool, error) {
	if err := m.s.adminError(ctx); err != nil {
		return false, err
	}
	c := callOf(ctx)
	if !m.s.sameOrigin(c.r) {
		return false, m.s.graphqlError(ctx, refused(http.StatusForbidden, "forbiddenRequest"))
	}
	if f := m.s.setHidden(c.r, id, hidden); f != nil {
		return false, m.s.graphqlError(ctx, f)
	}
	return true, nil
}

// optional is "" as null.
func optional(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

type galleryPack struct{}

func (galleryPack) Description(_ context.Context, pack *store.GalleryPack) (*string, error) {
	return optional(pack.Description), nil
}

func (galleryPack) Category(_ context.Context, pack *store.GalleryPack) (*string, error) {
	return optional(pack.Category), nil
}

func (galleryPack) Tags(_ context.Context, pack *store.GalleryPack) ([]string, error) {
	if pack.Tags == nil {
		return []string{}, nil
	}
	return pack.Tags, nil
}

type adminGalleryPack struct{}

func (adminGalleryPack) Category(_ context.Context, pack *store.AdminGalleryPack) (*string, error) {
	return optional(pack.Category), nil
}

func (adminGalleryPack) Reasons(_ context.Context, pack *store.AdminGalleryPack) (graph.JSON, error) {
	reasons := pack.Reasons
	if reasons == nil {
		reasons = map[string]int{}
	}
	return graph.JSON(member(reasons)), nil
}
