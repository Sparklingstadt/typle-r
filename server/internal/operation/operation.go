// Package operation is the changes made to an account's workspace one operation at a time, checked and saved the same
// way whichever handler receives them: /api/workspace's for the app's screens (server/internal/web) and /api/v1's for
// other programs (server/internal/api). The guest's workspace, kept in the browser, follows the same rules in
// src/core (see tests/fixtures/records).
package operation

import (
	"context"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// Writer changes an account's workspace and saves it, as store.Store.Modify does: in one transaction that holds the
// account's row, so an operation is never refused for a revision another save moved on.
type Writer interface {
	Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error)
}

// AddRecord adds a practice run to a list and saves it (workspace.AddRecord). A run with the id of one the list already
// has is not added again: the saved record is returned with added false, so a request can be sent again safely. It
// names no revision, so a list edited meanwhile neither refuses it nor is undone by it; the edit, which does name one,
// is then the save told to reload (409).
func AddRecord(ctx context.Context, writer Writer, owner, listID string, input workspace.RecordInput) (record workspace.Record, added bool, err error) {
	id := workspace.NewID()
	_, err = writer.Modify(ctx, owner, func(ws *workspace.Workspace) (bool, error) {
		var err error
		record, added, err = workspace.AddRecord(ws, listID, input, id)
		return added, err
	})
	if err != nil {
		return workspace.Record{}, false, err
	}
	return record, added, nil
}
