namespace Typle.Core;

/// <summary>
/// Loads and saves the account's workspace, the same data the web app shows after a GitHub login. Every change is a
/// save of the whole document for the revision it was made from; when the data was changed elsewhere since (409
/// conflict), the latest is read and the change made again on it. Calls run one at a time, so the app's own changes
/// never conflict with each other. Mirrors android/core/…/AccountSync.kt.
/// </summary>
public sealed class AccountSync
{
    /// <summary>How many times a change is saved in all when others change the data meanwhile.</summary>
    public const int Attempts = 3;

    private readonly AccountClient client;
    private readonly Action<string> renewed;
    private readonly SemaphoreSlim gate = new(1, 1);
    private string token;
    private AccountWorkspace? saved;

    /// <param name="renewed">Keeps a token the backend renewed.</param>
    public AccountSync(Uri baseUrl, string token, string accountId, Action<string> renewed, HttpMessageHandler? handler = null)
    {
        client = new AccountClient(baseUrl, handler);
        this.token = token;
        AccountId = accountId;
        this.renewed = renewed;
    }

    public string AccountId { get; }

    private sealed record SessionAnswer(AccountUser? User = null, string? Token = null);

    /// <summary>Checks the session and reads the workspace; every change after it is made on what this returns.</summary>
    public async Task<WorkspaceDocument> LoadAsync()
    {
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            // The session renews a token that has grown old, so a user who practises keeps signed in.
            var answer = TypleJson.Decode<SessionAnswer>(
                await client.SendAsync("GET", "api/auth/session", token: token).ConfigureAwait(false), "invalidServerData");
            if (answer.User?.Id != AccountId) throw new TypleException("accountLoginRequired");
            if (answer.Token is { } renewedToken)
            {
                token = renewedToken;
                renewed(renewedToken);
            }
            var loaded = await ReadAsync().ConfigureAwait(false);
            saved = loaded;
            return loaded.Document;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<AccountWorkspace> ReadAsync()
    {
        var loaded = Accounts.DecodeWorkspace(await client.SendAsync("GET", "api/workspace", token: token).ConfigureAwait(false));
        if (loaded.AccountId != AccountId) throw new TypleException("accountLoginRequired");
        return loaded;
    }

    /// <summary>
    /// Saves what <paramref name="transform"/> makes of the document and returns the document the backend kept. After a
    /// conflict the latest data is read and the transform runs again on it, <see cref="Attempts"/> times in all.
    /// </summary>
    public async Task<WorkspaceDocument> ChangeAsync(Func<WorkspaceDocument, WorkspaceDocument> transform)
    {
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            var current = saved ?? throw new TypleException("loadFailed");
            for (var attempt = 1; ; attempt++)
            {
                var next = current with { Document = transform(current.Document) };
                try
                {
                    var written = Accounts.DecodeWorkspace(
                        await client.SendAsync("PUT", "api/workspace", Accounts.EncodeWorkspace(next), token).ConfigureAwait(false));
                    // The newer revision is kept.
                    var kept = saved is { } previous && previous.Revision >= written.Revision ? previous : written;
                    saved = kept;
                    return kept.Document;
                }
                catch (TypleException error) when (error.Key == "conflict" && attempt < Attempts)
                {
                    current = await ReadAsync().ConfigureAwait(false);
                    saved = current;
                }
            }
        }
        finally
        {
            gate.Release();
        }
    }
}
