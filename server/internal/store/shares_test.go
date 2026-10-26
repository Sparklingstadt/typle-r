package store

import (
	"bytes"
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// saved creates the owner's row with the initial lists and their packs, and returns the workspace as saved.
func saved(t *testing.T, s *Store, owner string) *workspace.Workspace {
	t.Helper()
	ctx := context.Background()
	if _, err := s.Modify(ctx, owner, createList("a")); err != nil {
		t.Fatal(err)
	}
	w, err := s.Read(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Packs) < 2 {
		t.Fatalf("packs = %+v", w.Packs)
	}
	return w
}

func isKey(err error, key string) bool {
	var e *workspace.Error
	return errors.As(err, &e) && e.Key == key
}

func shareCount(t *testing.T, s *Store, owner string) []string {
	t.Helper()
	shares, err := s.ListShares(context.Background(), owner)
	if err != nil {
		t.Fatal(err)
	}
	packs := []string{}
	for _, share := range shares {
		packs = append(packs, share.PackID)
	}
	return packs
}

func TestPutShare(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	pack := w.Packs[0].ID

	share, err := s.PutShare(ctx, id, pack)
	if err != nil {
		t.Fatal(err)
	}
	if share.PackID != pack || len(share.ID) != 36 || share.UpdatedAt.IsZero() {
		t.Fatalf("share = %+v", share)
	}
	want, err := workspace.EncodePackFile(w, pack)
	if err != nil {
		t.Fatal(err)
	}
	data, err := s.SharedPack(ctx, share.ID)
	if err != nil || !bytes.Equal(data, want) {
		t.Fatalf("SharedPack = %s, %v; want %s", data, err, want)
	}

	// Sharing again keeps the link and copies the pack as it is now.
	time.Sleep(10 * time.Millisecond)
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		name := "改名したパック"
		_, err := workspace.UpdatePack(w, pack, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	again, err := s.PutShare(ctx, id, pack)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != share.ID || !again.UpdatedAt.After(share.UpdatedAt) {
		t.Fatalf("again = %+v, first = %+v", again, share)
	}
	data, err = s.SharedPack(ctx, share.ID)
	if err != nil || !strings.Contains(string(data), `"name": "改名したパック"`) {
		t.Fatalf("SharedPack = %s, %v", data, err)
	}

	if _, err := s.PutShare(ctx, id, "no-such-pack"); !isKey(err, "packNotFound") {
		t.Fatalf("missing pack: %v", err)
	}
}

// An account that has saved nothing shares the initial packs it is shown, and still has saved nothing. Its first save
// without the pack deletes the link.
func TestPutShareInitialPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	initial, err := workspace.Initial()
	if err != nil {
		t.Fatal(err)
	}
	pack := initial.Packs[0].ID
	share, err := s.PutShare(ctx, id, pack)
	if err != nil {
		t.Fatal(err)
	}
	if saved, err := s.ReadRevision(ctx, id); saved != nil || err != nil {
		t.Fatalf("ReadRevision = %+v, %v; want no row", saved, err)
	}
	want, err := workspace.EncodePackFile(initial, pack)
	if err != nil {
		t.Fatal(err)
	}
	if data, err := s.SharedPack(ctx, share.ID); err != nil || !bytes.Equal(data, want) {
		t.Fatalf("SharedPack = %s, %v", data, err)
	}
	if _, err := s.PutShare(ctx, id, "no-such-pack"); !isKey(err, "packNotFound") {
		t.Fatalf("missing pack: %v", err)
	}

	packs := slices.DeleteFunc(slices.Clone(initial.Packs), func(p workspace.Pack) bool { return p.ID == pack })
	lists := slices.DeleteFunc(slices.Clone(initial.Lists), func(l workspace.List) bool { return l.PackID == pack })
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: lists, Packs: packs, HasLists: true, HasPacks: true}); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); len(got) != 0 {
		t.Fatalf("shares after the first save = %v", got)
	}
}

// Modify on an account that has saved nothing saves the initial packs first; deleting a shared one deletes its link.
func TestModifyWithoutRowDeletesShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	initial, err := workspace.Initial()
	if err != nil {
		t.Fatal(err)
	}
	first, second := initial.Packs[0].ID, initial.Packs[1].ID
	for _, pack := range []string{first, second} {
		if _, err := s.PutShare(ctx, id, pack); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeletePack(w, first) }); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); !slices.Equal(got, []string{second}) {
		t.Fatalf("shares = %v", got)
	}
}

func TestSharedPackMissing(t *testing.T) {
	connection, _ := database(t)
	s := open(t, connection, false)
	for _, id := range []string{"00000000-0000-4000-8000-000000000000", "not-a-uuid", ""} {
		if data, err := s.SharedPack(context.Background(), id); data != nil || err != nil {
			t.Errorf("SharedPack(%q) = %s, %v; want nil, nil", id, data, err)
		}
	}
}

func TestDeleteAndListShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id, other := owner(t, conn), owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	saved(t, s, other)
	first, second := w.Packs[0].ID, w.Packs[1].ID
	for _, share := range []struct{ owner, pack string }{{id, first}, {id, second}, {other, first}} {
		if _, err := s.PutShare(ctx, share.owner, share.pack); err != nil {
			t.Fatal(err)
		}
	}
	// The newest share comes first.
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{second, first}) {
		t.Fatalf("shares = %v", packs)
	}
	if err := s.DeleteShare(ctx, id, first); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteShare(ctx, id, first); err != nil {
		t.Fatalf("deleting again: %v", err)
	}
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{second}) {
		t.Fatalf("shares = %v", packs)
	}
	if packs := shareCount(t, s, other); !slices.Equal(packs, []string{first}) {
		t.Fatalf("other's shares = %v", packs)
	}
}

func TestSavesDeleteSharesOfRemovedPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	first, second, third := w.Packs[0].ID, w.Packs[1].ID, w.Packs[len(w.Packs)-1].ID
	for _, pack := range []string{first, second, third} {
		if _, err := s.PutShare(ctx, id, pack); err != nil {
			t.Fatal(err)
		}
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}

	// Lists saved without packs leave the shares alone.
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Lists: w.Lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); len(packs) != 3 {
		t.Fatalf("shares after lists = %v", packs)
	}

	// Saving packs without one deletes its share.
	without := slices.DeleteFunc(slices.Clone(w.Packs), func(p workspace.Pack) bool { return p.ID == first })
	lists := slices.DeleteFunc(slices.Clone(w.Lists), func(l workspace.List) bool { return l.PackID == first })
	if _, err := s.WriteRevision(ctx, id, current.Revision+1, Change{Lists: lists, Packs: without, HasLists: true, HasPacks: true}); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); slices.Contains(packs, first) || len(packs) != 2 {
		t.Fatalf("shares after packs = %v", packs)
	}

	// So does deleting a pack through Modify.
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeletePack(w, second) }); err != nil {
		t.Fatal(err)
	}
	if packs := shareCount(t, s, id); !slices.Equal(packs, []string{third}) {
		t.Fatalf("shares after Modify = %v", packs)
	}
}

// An account whose packs are still derived from its lists (packs NULL) saves lists only: the link of a derived pack
// whose lists are gone is deleted, though no packs are sent.
func TestWriteRevisionListsOnlyDeletesSharesOfDerivedPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	initial, err := workspace.Initial()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: initial.Lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	pack := w.Packs[0].ID
	if want := "pack-" + w.Lists[0].ID; pack != want {
		t.Fatalf("first pack = %s; want %s", pack, want)
	}
	if _, err := s.PutShare(ctx, id, pack); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	lists := slices.DeleteFunc(slices.Clone(w.Lists), func(l workspace.List) bool { return l.PackID == pack })
	if len(lists) == len(w.Lists) || len(lists) == 0 {
		t.Fatalf("lists = %d of %d", len(lists), len(w.Lists))
	}
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Lists: lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); len(got) != 0 {
		t.Fatalf("shares after lists = %v", got)
	}
}

// A save of devices alone leaves the links as they are.
func TestWriteRevisionDevicesOnlyKeepsShares(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	if _, err := s.PutShare(ctx, id, w.Packs[0].ID); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, id, current.Revision, Change{Devices: w.Devices, HasDevices: true}); err != nil {
		t.Fatal(err)
	}
	if got := shareCount(t, s, id); len(got) != 1 {
		t.Fatalf("shares after devices = %v", got)
	}
}

// ListShares and PutShare both read the name from the snapshot.
func TestListSharesNames(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	put, err := s.PutShare(ctx, id, w.Packs[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	shares, err := s.ListShares(ctx, id)
	if err != nil || len(shares) != 1 {
		t.Fatalf("ListShares = %+v, %v", shares, err)
	}
	if shares[0].Name == "" || shares[0].Name != w.Packs[0].Name || put.Name != shares[0].Name {
		t.Fatalf("names = %q (list), %q (put); want %q", shares[0].Name, put.Name, w.Packs[0].Name)
	}
}

func TestPutShareTooLarge(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	// A list whose pack file is past 1 MiB, saved as data merged from removed profiles may be.
	lists := newLists(1)
	lists[0].Words = nil
	for range workspace.MaxWords {
		lists[0].Words = append(lists[0].Words, workspace.Word{Display: strings.Repeat("あ", 400), Input: "a"})
	}
	encoded, err := workspace.Encode(lists)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists) VALUES ($1, $2)`, id, string(encoded)); err != nil {
		t.Fatal(err)
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutShare(ctx, id, w.Packs[0].ID); !isKey(err, "invalidWorkspace") {
		t.Fatalf("PutShare = %v; want invalidWorkspace", err)
	}
	if packs := shareCount(t, s, id); len(packs) != 0 {
		t.Fatalf("shares = %v", packs)
	}
}
