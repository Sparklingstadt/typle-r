using System.Globalization;

namespace Typle.Core;

/// <summary>The GitHub account the app signed in with, as <c>/api/auth/token</c> and <c>/api/auth/session</c> name it.</summary>
public sealed record AccountUser(string Id, string Name);

/// <summary>The document, and the revision a save must name so that it does not overwrite a change made elsewhere since.</summary>
public sealed record AccountWorkspace(string AccountId, int Revision, WorkspaceDocument Document);

// The account's workspace as `/api/workspace` answers and saves it (src/plugins/storage/cloud/client.ts). Mirrors
// android/core/…/AccountWorkspace.kt.
public static class Accounts
{
    /// <summary>Where the app talks to by default: the web app's deployment.</summary>
    public const string DefaultUrl = "https://typle-r-six.vercel.app";

    private sealed record Body
    {
        public required IReadOnlyList<WordList> Lists { get; init; }

        public IReadOnlyList<PracticeDevice>? Devices { get; init; }

        public required int Revision { get; init; }

        public required string AccountId { get; init; }
    }

    /// <summary>
    /// Reads an answer of <c>/api/workspace</c>. An account that has saved nothing (revision 0) shows the starting lists,
    /// as in the web app, and the first save keeps them.
    /// </summary>
    public static AccountWorkspace DecodeWorkspace(byte[] data)
    {
        var body = TypleJson.Decode<Body>(data, "invalidServerData");
        if (body.Revision < 0 || body.AccountId.Length == 0) throw new TypleException("invalidServerData");
        WordLists.ValidateAll(body.Lists);
        var lists = body.Revision == 0 ? Workspace.InitialLists() : body.Lists;
        return new AccountWorkspace(body.AccountId, body.Revision, new WorkspaceDocument(lists, Devices.Decode(body.Devices ?? [])));
    }

    /// <summary>The body of a save (<c>PUT /api/workspace</c>): the whole document, for the revision it was changed from.</summary>
    public static byte[] EncodeWorkspace(AccountWorkspace workspace)
    {
        WordLists.ValidateAll(workspace.Document.Lists);
        Devices.Decode(workspace.Document.Devices);
        var data = TypleJson.Encode(new Body
        {
            Lists = workspace.Document.Lists, Devices = workspace.Document.Devices, Revision = workspace.Revision,
            AccountId = workspace.AccountId,
        });
        // The server reads at most 1 MiB.
        if (data.Length > Workspace.MaxBytes) throw new TypleException("workspaceTooLarge");
        return data;
    }

    /// <summary>The backend's error keys, as messages of the app (the same as the iPad and Android apps').</summary>
    public static TypleException Error(string? key, int status) => key switch
    {
        "loginRequired" or "loginAccountChanged" => new TypleException("accountLoginRequired"),
        "loginFailed" => new TypleException("accountLoginFailed"),
        "authUnavailable" => new TypleException("accountUnavailable"),
        "listLimit" => TypleException.With("listLimit", "max", WordLists.MaxLists.ToString(CultureInfo.InvariantCulture)),
        "conflict" or "workspaceTooLarge" or "databaseUnavailable" or "invalidWorkspace" or "workspaceSaveFailed" or
            "forbiddenRequest" or "emptyRequest" => new TypleException(key),
        _ => new TypleException(status == 404 ? "accountNotFound" : "workspaceRequestFailed"),
    };

    /// <summary>
    /// An HTTPS address, since the token must not travel in plain text. Plain HTTP is allowed for this PC itself and
    /// local network names only, as when the backend runs on a computer next to it.
    /// </summary>
    public static Uri? Address(string text)
    {
        if (!Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri) || uri.Host.Length == 0) return null;
        if (uri.Scheme == Uri.UriSchemeHttps) return uri;
        if (uri.Scheme == Uri.UriSchemeHttp && (uri.Host is "localhost" or "127.0.0.1" || uri.Host.EndsWith(".local", StringComparison.Ordinal)))
        {
            return uri;
        }
        return null;
    }
}
