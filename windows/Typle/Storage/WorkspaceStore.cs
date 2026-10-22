using Typle.Core;

namespace Typle.Storage;

/// <summary>
/// Where a workspace is kept: on this PC, or in the account of the web app's GitHub login (<c>/api/workspace</c>). Each
/// store keeps the document it last read or wrote, and applies every change to that, so changes made while another is
/// in flight are not lost.
/// </summary>
public abstract class WorkspaceStore
{
    /// <summary>Names the data the stored device choice belongs to, like <c>typle-r:device:&lt;accountId&gt;</c> in the web app.</summary>
    public abstract string AccountId { get; }

    public abstract Task<WorkspaceDocument> LoadAsync();

    /// <summary>Saves what <paramref name="transform"/> makes of the kept document, and returns the document kept.</summary>
    protected abstract Task<WorkspaceDocument> ChangeAsync(Func<WorkspaceDocument, WorkspaceDocument> transform);

    public Task<WorkspaceDocument> SaveListAsync(WordList list, bool editing) =>
        ChangeAsync(document => document with { Lists = WordLists.Save(document.Lists, list, editing) });

    public async Task<(WorkspaceDocument Document, WordList Copy)> DuplicateListAsync(string id, Func<int, string> suffix)
    {
        // The same id on every attempt, so the copy returned is the one that was saved.
        var copyId = Ids.Random();
        WordList? copy = null;
        var document = await ChangeAsync(document =>
        {
            var result = WordLists.Duplicate(document.Lists, id, copyId, suffix);
            copy = result.Copy;
            return document with { Lists = result.Lists };
        });
        return (document, copy!);
    }

    public Task<WorkspaceDocument> DeleteListAsync(string id) =>
        ChangeAsync(document => document with { Lists = document.Lists.Where(list => list.Id != id).ToList() });

    public Task<WorkspaceDocument> AddRecordAsync(StoredRecord record, string listId) =>
        ChangeAsync(document => document with { Lists = Records.Add(document.Lists, listId, record) });

    public Task<WorkspaceDocument> DeleteRecordAsync(StoredRecord record, string listId) =>
        ChangeAsync(document => document with { Lists = Records.Remove(document.Lists, listId, record) });

    public Task<WorkspaceDocument> SaveDeviceAsync(PracticeDevice device, bool editing, string defaultName) =>
        ChangeAsync(document => document with { Devices = Devices.Save(document.Devices, device, editing, defaultName) });

    public Task<WorkspaceDocument> DeleteDeviceAsync(string id) =>
        ChangeAsync(document => document with { Devices = document.Devices.Where(device => device.Id != id).ToList() });
}

/// <summary>
/// The workspace in the app's folder, in the shape of the web app's browser storage. A file that cannot be read is left
/// untouched: every change fails until it is moved away or fixed.
/// </summary>
public sealed class LocalWorkspaceStore(string directory, string accountId = "windows:local") : WorkspaceStore
{
    private readonly string path = Path.Combine(directory, "workspace.json");
    private readonly SemaphoreSlim gate = new(1, 1);
    private WorkspaceFile? current;

    public override string AccountId => accountId;

    public override async Task<WorkspaceDocument> LoadAsync()
    {
        await gate.WaitAsync();
        try
        {
            current = null;
            current = await Task.Run(() =>
            {
                // The starting lists are shown until the first save, which keeps them.
                if (!File.Exists(path)) return WorkspaceFile.Of(accountId, 0, new WorkspaceDocument(Workspace.InitialLists(), []));
                try
                {
                    return Workspace.DecodeFile(File.ReadAllBytes(path), accountId);
                }
                catch (Exception error) when (error is TypleException or IOException or UnauthorizedAccessException)
                {
                    throw new TypleException("localReadFailed");
                }
            });
            return current.Document;
        }
        finally
        {
            gate.Release();
        }
    }

    protected override async Task<WorkspaceDocument> ChangeAsync(Func<WorkspaceDocument, WorkspaceDocument> transform)
    {
        await gate.WaitAsync();
        try
        {
            var before = current ?? throw new TypleException("localReadFailed");
            var next = WorkspaceFile.Of(accountId, before.Revision + 1, transform(before.Document));
            var data = Workspace.EncodeFile(next);
            await Task.Run(() =>
            {
                try
                {
                    Directory.CreateDirectory(directory);
                    // Written beside the file and moved over it, so a failed write leaves the saved data as it was.
                    var temporary = path + ".tmp";
                    File.WriteAllBytes(temporary, data);
                    File.Move(temporary, path, overwrite: true);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                {
                    throw new TypleException("localWriteFailed");
                }
            });
            current = next;
            return next.Document;
        }
        finally
        {
            gate.Release();
        }
    }
}

/// <summary>
/// The signed-in account's workspace through the web app's <c>/api/workspace</c>, the same data the web app shows after
/// a GitHub login. Every change is a save of the whole document for the revision it was made from; after a conflict
/// <see cref="AccountSync"/> reads the latest and makes the change again on it.
/// </summary>
public sealed class AccountWorkspaceStore(Uri baseUrl, string token, string accountId, Action<string> renewed) : WorkspaceStore
{
    private readonly AccountSync sync = new(baseUrl, token, accountId, renewed);

    public override string AccountId => accountId;

    public override Task<WorkspaceDocument> LoadAsync() => sync.LoadAsync();

    protected override Task<WorkspaceDocument> ChangeAsync(Func<WorkspaceDocument, WorkspaceDocument> transform) => sync.ChangeAsync(transform);
}
