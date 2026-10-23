using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;

namespace Typle.Core.Tests;

/// <summary>A request the fake backend received.</summary>
internal sealed record RecordedRequest(string Method, string Path, string Query, IReadOnlyDictionary<string, string> Headers, string Text)
{
    /// <summary>The first value of a header, whatever its case.</summary>
    public string? Header(string name) => Headers.TryGetValue(name.ToLowerInvariant(), out var value) ? value : null;
}

/// <summary>
/// A stand-in for the Typle backend, as the HttpClient's transport. Answers are registered per method and path and can
/// be replaced between calls; requests without one get an empty 404.
/// </summary>
internal sealed class FakeTyple : HttpMessageHandler
{
    private readonly ConcurrentDictionary<string, Func<RecordedRequest, Task<(int Status, string Body)>>> handlers = new();
    private readonly ConcurrentQueue<RecordedRequest> log = new();

    public static readonly Uri BaseUrl = new("https://typle.test/");

    /// <summary>Every request so far, oldest first.</summary>
    public IReadOnlyList<RecordedRequest> Requests => log.ToList();

    public void Handle(string method, string path, Func<RecordedRequest, Task<(int, string)>> handler) => handlers[$"{method} {path}"] = handler;

    public void Handle(string method, string path, Func<RecordedRequest, (int, string)> handler) =>
        Handle(method, path, request => Task.FromResult(handler(request)));

    public void Handle(string method, string path, int status, string body = "") => Handle(method, path, _ => (status, body));

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var headers = new Dictionary<string, string>();
        foreach (var header in request.Headers) headers[header.Key.ToLowerInvariant()] = string.Join(", ", header.Value);
        var text = "";
        if (request.Content is not null)
        {
            foreach (var header in request.Content.Headers) headers[header.Key.ToLowerInvariant()] = string.Join(", ", header.Value);
            text = await request.Content.ReadAsStringAsync(cancellationToken);
        }
        var recorded = new RecordedRequest(request.Method.Method, request.RequestUri!.AbsolutePath, request.RequestUri.Query.TrimStart('?'), headers, text);
        log.Enqueue(recorded);
        var (status, body) = handlers.TryGetValue($"{recorded.Method} {recorded.Path}", out var handler) ? await handler(recorded) : (404, "");
        var response = new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        return response;
    }
}

public class AccountWorkspaceTests
{
    private static readonly WordList List = Make.List("1", "A", [new("a", "a")]);
    private static readonly PracticeDevice Device = new("d", "Tab", "qwerty");
    private const string ListJson = """{"id":"1","name":"A","createdAt":"2026-01-01","words":[{"display":"a","input":"a","annotation":""}],"records":[]}""";

    [Fact]
    public void DecodesASavedWorkspace()
    {
        var body = $$"""{"lists":[{{ListJson}}],"devices":[{"id":"d","name":"Tab","layout":"qwerty"}],"revision":3,"accountId":"github:1","extra":1}""";
        var workspace = Accounts.DecodeWorkspace(Encoding.UTF8.GetBytes(body));
        Assert.Equal(3, workspace.Revision);
        Assert.Equal("github:1", workspace.AccountId);
        Assert.Equal([List], workspace.Document.Lists);
        Assert.Equal([Device], workspace.Document.Devices);
    }

    [Fact]
    public void ShowsTheStartingListsBeforeTheFirstSave()
    {
        var workspace = Accounts.DecodeWorkspace("""{"lists":[],"revision":0,"accountId":"github:1"}"""u8.ToArray());
        Assert.Equal(0, workspace.Revision);
        Assert.Equal(Workspace.InitialLists(), workspace.Document.Lists);
        Assert.Empty(workspace.Document.Devices);
    }

    [Fact]
    public void RejectsWhatIsNotAWorkspace()
    {
        foreach (var body in new[]
                 {
                     """{"lists":[],"revision":-1,"accountId":"github:1"}""", """{"lists":[],"revision":1,"accountId":""}""", "not json",
                     """{"revision":1,"accountId":"github:1"}""",
                 })
        {
            Assert.Equal("invalidServerData", Make.KeyOf(() => Accounts.DecodeWorkspace(Encoding.UTF8.GetBytes(body))));
        }
    }

    [Fact]
    public void EncodesTheWholeDocumentWithItsRevision()
    {
        var workspace = new AccountWorkspace("github:1", 4, new WorkspaceDocument([List], [Device]));
        var data = Accounts.EncodeWorkspace(workspace);
        var json = JsonNode.Parse(data)!.AsObject();
        Assert.Equal(["accountId", "devices", "lists", "revision"], json.Select(pair => pair.Key).Order());
        Assert.Equal(4, (int)json["revision"]!);
        Assert.Equal("github:1", (string)json["accountId"]!);
        Assert.Equal(workspace, Accounts.DecodeWorkspace(data));
    }

    [Fact]
    public void RefusesToSendMoreThanOneMebibyte()
    {
        var words = Enumerable.Range(0, WordLists.MaxWords)
            .Select(_ => new Word(new string('d', WordLists.MaxWordField), new string('i', WordLists.MaxWordField))).ToList();
        var workspace = new AccountWorkspace("github:1", 1, new WorkspaceDocument([List with { Words = words }], []));
        Assert.Equal("workspaceTooLarge", Make.KeyOf(() => Accounts.EncodeWorkspace(workspace)));
    }

    [Fact]
    public void MapsTheBackendsErrors()
    {
        foreach (var key in new[] { "loginRequired", "loginAccountChanged" })
        {
            Assert.Equal(new TypleException("accountLoginRequired"), Accounts.Error(key, 401));
        }
        Assert.Equal(new TypleException("accountLoginFailed"), Accounts.Error("loginFailed", 401));
        Assert.Equal(new TypleException("accountUnavailable"), Accounts.Error("authUnavailable", 503));
        Assert.Equal(TypleException.With("listLimit", "max", "150"), Accounts.Error("listLimit", 400));
        foreach (var key in new[]
                 {
                     "conflict", "workspaceTooLarge", "databaseUnavailable", "invalidWorkspace", "workspaceSaveFailed", "forbiddenRequest",
                     "emptyRequest",
                 })
        {
            Assert.Equal(new TypleException(key), Accounts.Error(key, 400));
        }
        Assert.Equal(new TypleException("accountNotFound"), Accounts.Error(null, 404));
        Assert.Equal(new TypleException("workspaceRequestFailed"), Accounts.Error("x", 500));
        Assert.Equal(new TypleException("workspaceRequestFailed"), Accounts.Error(null, 500));
    }

    [Fact]
    public void AcceptsHttpsAndLocalHttpOnly()
    {
        Assert.Equal("typle-r-six.vercel.app", Accounts.Address(Accounts.DefaultUrl)?.Host);
        Assert.Equal("x.example", Accounts.Address(" https://x.example/ ")?.Host);
        foreach (var url in new[] { "http://localhost:8081", "http://mac.local:8081", "http://127.0.0.1:8081" })
        {
            Assert.NotNull(Accounts.Address(url));
        }
        foreach (var url in new[] { "http://example.com", "http://10.0.2.2:8081", "ftp://x", "typle", "" })
        {
            Assert.Null(Accounts.Address(url));
        }
    }
}

public class AccountClientTests
{
    [Fact]
    public void ChallengeFollowsRfc7636() =>
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", AccountLogin.ChallengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));

    [Fact]
    public void VerifiersAre43UrlSafeCharactersAndDiffer()
    {
        var first = AccountLogin.NewVerifier();
        var second = AccountLogin.NewVerifier();
        Assert.Matches("^[A-Za-z0-9_-]{43}$", first);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", second);
        Assert.NotEqual(first, second);
    }

    [Fact]
    public void SigninUrlNamesTheWindowsClient()
    {
        var verifier = AccountLogin.NewVerifier();
        Assert.Equal($"https://t.example/api/auth/signin?client=windows&code_challenge={AccountLogin.ChallengeOf(verifier)}",
            new AccountLogin(new Uri("https://t.example/"), verifier).SigninUrl.AbsoluteUri);
    }

    [Fact]
    public void UrlJoinsBaseAndPathWithOrWithoutATrailingSlash()
    {
        Assert.Equal("https://t.example/api/workspace", new AccountClient(new Uri("https://t.example")).Url("api/workspace").AbsoluteUri);
        Assert.Equal("https://t.example/api/workspace", new AccountClient(new Uri("https://t.example/")).Url("api/workspace").AbsoluteUri);
        Assert.Equal("https://t.example/app/api/x?a=b%20c&d=%26",
            new AccountClient(new Uri("https://t.example/app/")).Url("api/x", [new("a", "b c"), new("d", "&")]).AbsoluteUri);
    }

    [Fact]
    public async Task SendsBearerTokenAndJson()
    {
        var fake = new FakeTyple();
        fake.Handle("GET", "/api/workspace", 200, """{"ok":true}""");
        fake.Handle("PUT", "/api/workspace", 200, "{}");
        var client = new AccountClient(FakeTyple.BaseUrl, fake);

        Assert.Equal("""{"ok":true}""", Encoding.UTF8.GetString(await client.SendAsync("GET", "api/workspace", token: "t")));
        var get = Assert.Single(fake.Requests);
        Assert.Equal("GET", get.Method);
        Assert.Equal("Bearer t", get.Header("Authorization"));
        Assert.Equal("application/json", get.Header("Accept"));
        Assert.Null(get.Header("Content-Type"));

        await client.SendAsync("PUT", "api/workspace", "[1]"u8.ToArray(), "t");
        var put = fake.Requests[^1];
        Assert.Equal("PUT", put.Method);
        Assert.Equal("application/json", put.Header("Content-Type"));
        Assert.Equal("[1]", put.Text);
    }

    [Fact]
    public async Task SendsNoAuthorizationWithoutAToken()
    {
        var fake = new FakeTyple();
        fake.Handle("GET", "/x", 200, "{}");
        await new AccountClient(FakeTyple.BaseUrl, fake).SendAsync("GET", "x");
        Assert.Null(Assert.Single(fake.Requests).Header("Authorization"));
    }

    [Fact]
    public async Task MapsErrorAnswers()
    {
        var fake = new FakeTyple();
        var client = new AccountClient(FakeTyple.BaseUrl, fake);
        fake.Handle("GET", "/api/a", 409, """{"error":"conflict"}""");
        fake.Handle("GET", "/api/b", 404);
        fake.Handle("GET", "/api/c", 500, """{"error":"x"}""");
        fake.Handle("GET", "/api/d", 401, """{"error":"loginRequired"}""");
        fake.Handle("GET", "/api/e", 502, "<html>bad gateway</html>");
        Assert.Equal("conflict", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/a"))).Key);
        Assert.Equal("accountNotFound", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/b"))).Key);
        Assert.Equal("workspaceRequestFailed", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/c"))).Key);
        Assert.Equal("accountLoginRequired", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/d"))).Key);
        Assert.Equal("workspaceRequestFailed", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/e"))).Key);
    }

    [Fact]
    public async Task UnreachableServer()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        var client = new AccountClient(new Uri($"http://127.0.0.1:{port}/"));
        Assert.Equal("accountUnreachable", (await Assert.ThrowsAsync<TypleException>(() => client.SendAsync("GET", "api/workspace"))).Key);
    }

    [Fact]
    public async Task FinishTradesTheCode()
    {
        var fake = new FakeTyple();
        fake.Handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N","image":null}}""");
        var verifier = new string('v', 43);
        var (token, user) = await new AccountLogin(FakeTyple.BaseUrl, verifier, fake).FinishAsync("typle-r://login?code=c");
        Assert.Equal("tok", token);
        Assert.Equal(new AccountUser("github:1", "N"), user);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal($$"""{"code":"c","verifier":"{{verifier}}"}""", request.Text);
        Assert.Null(request.Header("Authorization"));
    }

    [Fact]
    public async Task FinishDecodesTheCodeFromTheQuery()
    {
        var fake = new FakeTyple();
        fake.Handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N"}}""");
        await new AccountLogin(FakeTyple.BaseUrl, "v", fake).FinishAsync("typle-r://login?x=1&code=a%2Bb%3D");
        Assert.Equal("""{"code":"a+b=","verifier":"v"}""", Assert.Single(fake.Requests).Text);
    }

    [Fact]
    public async Task FinishPassesOnTheServersRefusal()
    {
        var fake = new FakeTyple();
        fake.Handle("POST", "/api/auth/token", 401, """{"error":"loginFailed"}""");
        var error = await Assert.ThrowsAsync<TypleException>(() => new AccountLogin(FakeTyple.BaseUrl, "v", fake).FinishAsync("typle-r://login?code=c"));
        Assert.Equal("accountLoginFailed", error.Key);
    }

    [Fact]
    public async Task FinishRejectsAnAnswerWithoutAToken()
    {
        var fake = new FakeTyple();
        fake.Handle("POST", "/api/auth/token", 200, """{"user":{"id":"github:1","name":"N"}}""");
        var error = await Assert.ThrowsAsync<TypleException>(() => new AccountLogin(FakeTyple.BaseUrl, "v", fake).FinishAsync("typle-r://login?code=c"));
        Assert.Equal("invalidServerData", error.Key);
    }

    [Fact]
    public async Task FinishRefusesOtherUrls()
    {
        var fake = new FakeTyple();
        fake.Handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N"}}""");
        var login = new AccountLogin(FakeTyple.BaseUrl, "v", fake);
        foreach (var callback in new[]
                 {
                     "typle-r://login?error=loginFailed", "typle-r://login", "typle-r://login?code=", "https://x/login?code=c",
                     "typle-r://other?code=c", "not a url",
                 })
        {
            Assert.Equal("accountLoginFailed", (await Assert.ThrowsAsync<TypleException>(() => login.FinishAsync(callback))).Key);
        }
        Assert.Empty(fake.Requests);
    }
}

public class AccountSyncTests
{
    private static readonly WordList List = Make.List("l1", "List", [new("あ", "a")], createdAt: "2024-01-01T00:00:00.000Z");

    private static PracticeDevice Device(string id) => new(id, $"Device {id}");

    private static int RevisionOf(RecordedRequest request) => (int)JsonNode.Parse(request.Text)!["revision"]!;

    /// <summary>
    /// The backend's <c>/api/auth/session</c> and <c>/api/workspace</c>: a save is taken only for the stored revision
    /// (otherwise 409), and is answered with the stored workspace.
    /// </summary>
    private sealed class Backend
    {
        private readonly object gate = new();
        public readonly FakeTyple Fake = new();
        public readonly List<string> Renewals = [];
        public int Conflicts;
        public int Revision = 3;
        public string AccountId = "github:1";
        public string Lists = TypleJson.EncodeString<IReadOnlyList<WordList>>([List]);
        public string Devices = "[]";
        public string SessionBody = """{"user":{"id":"github:1","name":"N"}}""";
        public bool AlwaysConflict;
        public TimeSpan SaveDelay = TimeSpan.Zero;

        public Backend()
        {
            Fake.Handle("GET", "/api/auth/session", _ => (200, SessionBody));
            Fake.Handle("GET", "/api/workspace", _ => (200, Answer()));
            Fake.Handle("PUT", "/api/workspace", async request =>
            {
                await Task.Delay(SaveDelay);
                var sent = JsonNode.Parse(request.Text)!.AsObject();
                lock (gate)
                {
                    if (AlwaysConflict || (int)sent["revision"]! != Revision)
                    {
                        Conflicts++;
                        return (409, """{"error":"conflict"}""");
                    }
                    Lists = sent["lists"]!.ToJsonString();
                    Devices = sent["devices"]?.ToJsonString() ?? "[]";
                    Revision += 1;
                    return (200, Answer());
                }
            });
        }

        private string Answer()
        {
            lock (gate) return $$"""{"lists":{{Lists}},"devices":{{Devices}},"revision":{{Revision}},"accountId":"{{AccountId}}"}""";
        }

        public IReadOnlyList<RecordedRequest> Puts => Fake.Requests.Where(request => request.Method == "PUT").ToList();

        public IReadOnlyList<RecordedRequest> Gets => Fake.Requests.Where(request => request.Method == "GET" && request.Path == "/api/workspace").ToList();

        /// <summary>The data is changed by someone else.</summary>
        public void ChangeElsewhere(int revision, IReadOnlyList<PracticeDevice> devices)
        {
            lock (gate)
            {
                Revision = revision;
                Devices = TypleJson.EncodeString(devices);
            }
        }

        public AccountSync Sync(string token = "old") => new(FakeTyple.BaseUrl, token, "github:1", Renewals.Add, Fake);
    }

    [Fact]
    public async Task LoadChecksTheSessionAndRenewsTheToken()
    {
        var backend = new Backend { SessionBody = """{"user":{"id":"github:1","name":"N","image":null},"token":"new"}""" };
        var sync = backend.Sync();
        var document = await sync.LoadAsync();
        Assert.Equal(["new"], backend.Renewals);
        Assert.Equal([List], document.Lists);
        Assert.Equal("Bearer old", backend.Fake.Requests.First(request => request.Path == "/api/auth/session").Header("Authorization"));
        Assert.Equal("Bearer new", Assert.Single(backend.Gets).Header("Authorization"));
        // Later saves use the renewed token too.
        await sync.ChangeAsync(document => document);
        Assert.Equal("Bearer new", Assert.Single(backend.Puts).Header("Authorization"));
    }

    [Fact]
    public async Task LoadWithoutARenewedTokenKeepsTheToken()
    {
        var backend = new Backend();
        await backend.Sync().LoadAsync();
        Assert.Empty(backend.Renewals);
        Assert.Equal("Bearer old", Assert.Single(backend.Gets).Header("Authorization"));
    }

    [Fact]
    public async Task LoadRefusesAnotherAccount()
    {
        foreach (var backend in new[]
                 {
                     new Backend { SessionBody = """{"user":{"id":"github:2","name":"N"}}""" }, new Backend { SessionBody = """{"user":null}""" },
                     new Backend { AccountId = "github:2" },
                 })
        {
            Assert.Equal("accountLoginRequired", (await Assert.ThrowsAsync<TypleException>(() => backend.Sync().LoadAsync())).Key);
        }
    }

    [Fact]
    public async Task LoadFailsOnAnUnreadableSession()
    {
        var backend = new Backend { SessionBody = "[]" };
        Assert.Equal("invalidServerData", (await Assert.ThrowsAsync<TypleException>(() => backend.Sync().LoadAsync())).Key);
    }

    [Fact]
    public async Task ChangeSavesTheWholeDocumentForItsRevision()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        var saved = await sync.ChangeAsync(document => document with { Devices = [Device("d1")] });
        var put = Assert.Single(backend.Puts);
        var body = JsonNode.Parse(put.Text)!;
        Assert.Equal(3, (int)body["revision"]!);
        Assert.Equal("github:1", (string)body["accountId"]!);
        Assert.Single(body["lists"]!.AsArray());
        Assert.Equal("Bearer old", put.Header("Authorization"));
        Assert.Equal(new WorkspaceDocument([List], [Device("d1")]), saved);
    }

    [Fact]
    public async Task ChangesFollowTheRevisionOfTheLastSave()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        await sync.ChangeAsync(document => document with { Devices = [Device("d1")] });
        var saved = await sync.ChangeAsync(document => document with { Devices = [.. document.Devices, Device("d2")] });
        Assert.Equal([3, 4], backend.Puts.Select(RevisionOf));
        Assert.Equal([Device("d1"), Device("d2")], saved.Devices);
        Assert.Equal(0, backend.Conflicts);
    }

    [Fact]
    public async Task AnOlderAnswerDoesNotReplaceTheKeptWorkspace()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        // The save is answered with revision 2, older than the revision 3 that is kept.
        var older = $$"""{"lists":{{backend.Lists}},"devices":{{TypleJson.EncodeString<IReadOnlyList<PracticeDevice>>([Device("older")])}},"revision":2,"accountId":"github:1"}""";
        backend.Fake.Handle("PUT", "/api/workspace", 200, older);
        var saved = await sync.ChangeAsync(document => document with { Devices = [Device("mine")] });
        Assert.Equal(new WorkspaceDocument([List], []), saved);
        await sync.ChangeAsync(document => document);
        Assert.Equal([3, 3], backend.Puts.Select(RevisionOf));
    }

    [Fact]
    public async Task ChangeBeforeLoad()
    {
        var backend = new Backend();
        Assert.Equal("loadFailed", (await Assert.ThrowsAsync<TypleException>(() => backend.Sync().ChangeAsync(document => document))).Key);
        Assert.Empty(backend.Fake.Requests);
    }

    [Fact]
    public async Task ConflictIsRetriedOnTheLatestData()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        // Changed elsewhere since the load.
        backend.ChangeElsewhere(5, [Device("other")]);
        var seen = new List<IReadOnlyList<PracticeDevice>>();
        var saved = await sync.ChangeAsync(document =>
        {
            seen.Add(document.Devices);
            return document with { Devices = [.. document.Devices, Device("mine")] };
        });
        Assert.Equal(2, seen.Count);
        Assert.Empty(seen[0]);
        Assert.Equal([Device("other")], seen[1]);
        Assert.Equal(2, backend.Puts.Count);
        Assert.Equal(1, backend.Conflicts);
        Assert.Equal([3, 5], backend.Puts.Select(RevisionOf));
        // The conflict is read again with the workspace, not the session.
        Assert.Equal(2, backend.Gets.Count);
        Assert.Single(backend.Fake.Requests, request => request.Path == "/api/auth/session");
        Assert.Equal([Device("other"), Device("mine")], saved.Devices);
        Assert.Equal(6, backend.Revision);
    }

    [Fact]
    public async Task ThreeConflictsGiveUp()
    {
        var backend = new Backend { AlwaysConflict = true };
        var sync = backend.Sync();
        await sync.LoadAsync();
        var transforms = 0;
        var error = await Assert.ThrowsAsync<TypleException>(() => sync.ChangeAsync(document =>
        {
            transforms++;
            return document;
        }));
        Assert.Equal("conflict", error.Key);
        Assert.Equal(3, AccountSync.Attempts);
        Assert.Equal(3, backend.Puts.Count);
        Assert.Equal(3, transforms);
        // Read again between the saves only: the load and two re-reads.
        Assert.Equal(3, backend.Gets.Count);
    }

    [Fact]
    public async Task FirstSaveKeepsTheStartingLists()
    {
        var backend = new Backend { Revision = 0, Lists = "[]" };
        var sync = backend.Sync();
        var loaded = await sync.LoadAsync();
        Assert.Equal(Workspace.InitialLists(), loaded.Lists);
        await sync.ChangeAsync(document => document);
        var body = JsonNode.Parse(Assert.Single(backend.Puts).Text)!;
        Assert.Equal(0, (int)body["revision"]!);
        Assert.Equal(Workspace.InitialLists(),
            TypleJson.Decode<List<WordList>>(Encoding.UTF8.GetBytes(body["lists"]!.ToJsonString()), "invalidServerData"));
    }

    [Fact]
    public async Task AnErrorOfTheTransformIsThrownWithoutSaving()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        var error = await Assert.ThrowsAsync<TypleException>(() => sync.ChangeAsync(_ => throw new TypleException("nope")));
        Assert.Equal("nope", error.Key);
        Assert.Empty(backend.Puts);
        // And the lock is released.
        await sync.ChangeAsync(document => document);
        Assert.Single(backend.Puts);
    }

    [Fact]
    public async Task OtherErrorsOfTheBackendAreTheAppsMessages()
    {
        var backend = new Backend();
        var sync = backend.Sync();
        await sync.LoadAsync();
        backend.Fake.Handle("PUT", "/api/workspace", 400, """{"error":"invalidWorkspace"}""");
        Assert.Equal("invalidWorkspace", (await Assert.ThrowsAsync<TypleException>(() => sync.ChangeAsync(document => document))).Key);
        Assert.Single(backend.Puts);
    }

    [Fact]
    public async Task ConcurrentChangesDoNotConflictWithEachOther()
    {
        var backend = new Backend { SaveDelay = TimeSpan.FromMilliseconds(100) };
        var sync = backend.Sync();
        await sync.LoadAsync();
        var active = 0;
        var overlapped = 0;
        Task<WorkspaceDocument> Run(string id) => Task.Run(() => sync.ChangeAsync(document =>
        {
            if (Interlocked.Increment(ref active) > 1) Interlocked.Increment(ref overlapped);
            Thread.Sleep(20);
            Interlocked.Decrement(ref active);
            return document with { Devices = [.. document.Devices, Device(id)] };
        }));
        await Task.WhenAll(Run("a"), Run("b"));
        Assert.Equal(0, overlapped);
        Assert.Equal(0, backend.Conflicts);
        Assert.Equal(2, backend.Puts.Count);
        Assert.Equal(["a", "b"], JsonNode.Parse(backend.Devices)!.AsArray().Select(device => (string)device!["id"]!).Order());
        Assert.Equal(5, backend.Revision);
    }
}
