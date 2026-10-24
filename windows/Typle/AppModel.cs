using System.Text.Json;
using Microsoft.UI.Dispatching;
using Typle.Core;
using Typle.Pages;
using Typle.Storage;
using Typle.Support;

namespace Typle;

/// <summary>The web app's pages, in the order of its sidebar.</summary>
public enum Page { Home, Practice, Records, Rankings, Lists, Words, CreateList, EditList, General, Devices }

public enum Appearance { System, Light, Dark }

public enum StorageKind
{
    /// <summary>This PC's file, the default.</summary>
    Local,

    /// <summary>The account of the web app's GitHub login, through its Go backend (<c>/api/workspace</c>).</summary>
    Account,
}

/// <summary>
/// The app's state: the workspace of the chosen store and the choices remembered on this PC. Every change raises
/// <see cref="Changed"/> on the UI thread, and the shell shows it.
/// </summary>
public sealed class AppModel
{
    /// <summary>How long a login may stay open before its callback is no longer accepted.</summary>
    private static readonly TimeSpan LoginLifetime = TimeSpan.FromMinutes(10);

    private readonly Settings settings;
    private readonly TokenVault vault;
    private readonly DispatcherQueue dispatcher;
    // Counts the login callbacks being finished, so another callback does not end the wait.
    private int finishingSignIns;

    /// <summary>
    /// A GitHub login that has been opened and not yet finished: kept on this PC, since the app may be closed while the
    /// login is shown in the browser. The verifier never leaves the app.
    /// </summary>
    private sealed record PendingLogin(string Verifier, string Url, long StartedAt);

    public AppModel(LaunchOptions launch, string? demoDirectory = null)
    {
        dispatcher = DispatcherQueue.GetForCurrentThread();
        var directory = demoDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Typle");
        settings = new Settings(directory);
        vault = new TokenVault(directory);
        ServerUrl = settings.Get("server-url") ?? Accounts.DefaultUrl;
        AccountUser = ReadAccountUser();
        LiveStatsVisible = settings.Get("live-stats-hidden") != "true";
        Language = Loc.FromTag(launch.Language) ?? Loc.FromTag(settings.Get("language")) ?? Loc.Preferred();
        Loc.Use(Language);
        Appearance = launch.Theme switch
        {
            "light" => Appearance.Light,
            "dark" => Appearance.Dark,
            _ => Enum.TryParse<Appearance>(settings.Get("theme"), out var saved) ? saved : Appearance.System,
        };
        // An account whose token is gone (Windows' data protection was reset) is signed out.
        if (AccountUser is not null && vault.Read() is null)
        {
            AccountUser = null;
            settings.Set("account", null);
        }
        var kind = Enum.TryParse<StorageKind>(settings.Get("storage"), out var storage) ? storage : StorageKind.Local;
        if (MakeStore(kind) is { } made)
        {
            Storage = kind;
            Store = made;
        }
        else
        {
            // Signed out or the token is gone: this PC's data, until signing in again.
            Store = new LocalWorkspaceStore(settings.Directory);
            settings.Set("storage", StorageKind.Local.ToString());
        }
        SelectedDeviceId = settings.Get("device:" + Store.AccountId);
        if (launch.Route == "editList")
        {
            Route = Page.EditList;
            EditingListId = "8f3cf116-1f9f-4579-a071-e600094b104d";
        }
        else if (Enum.TryParse<Page>(launch.Route, ignoreCase: true, out var route))
        {
            Route = route;
        }
        RankingsList = launch.RankingsList;
        PendingTyping = launch.Typing;
    }

    public event Action? Changed;

    public Page Route { get; private set; } = Page.Home;

    /// <summary>The list the editor shows, like /edit/&lt;id&gt;.</summary>
    public string? EditingListId { get; private set; }

    /// <summary>The list the best records page shows, like <c>/rankings?list=&lt;id&gt;</c>.</summary>
    public string? RankingsList { get; private set; }

    /// <summary>The list 単語一覧 shows, like <c>/words?list=&lt;id&gt;</c>; null is the first list.</summary>
    public string? WordsList { get; private set; }

    /// <summary>A list another screen asked the practice screen to open, like <c>/play?list=&lt;id&gt;</c>.</summary>
    public string? PracticeRequest { get; set; }

    /// <summary>Counts arrivals on the practice page; each starts a new run, as the web app's practice page does.</summary>
    public int PracticeVisit { get; private set; }

    /// <summary>The practice run, kept here so it survives the screen being built again (a new theme or language).</summary>
    public PracticeModel Practice { get; } = new();

    /// <summary>What the screenshots' sample run types into the practice field, once.</summary>
    public string? PendingTyping { get; set; }

    public StorageKind Storage { get; private set; } = StorageKind.Local;

    /// <summary>The web app the account is kept in, the production deployment unless another was signed in to.</summary>
    public string ServerUrl { get; private set; }

    /// <summary>The GitHub account signed in with, kept until signing out.</summary>
    public AccountUser? AccountUser { get; private set; }

    /// <summary>Whether a GitHub login is open in the browser or being finished; the settings screen waits while it is.</summary>
    public bool SigningIn { get; private set; }

    /// <summary>What the last login came to, for the settings screen.</summary>
    public (bool Failed, string Text)? SignInMessage { get; private set; }

    public WorkspaceStore Store { get; private set; }

    public WorkspaceDocument? Document { get; private set; }

    public bool Loading { get; private set; }

    public string? LoadError { get; private set; }

    /// <summary>Whether the practice screen shows the live elapsed time, speed, accuracy and mistakes.</summary>
    public bool LiveStatsVisible { get; private set; }

    /// <summary>The stored device choice for the current store: a device id, "" for 未選択, or null before the first choice.</summary>
    public string? SelectedDeviceId { get; private set; }

    /// <summary>The display language, chosen in 一般 like the web app's.</summary>
    public AppLanguage Language { get; private set; }

    public Appearance Appearance { get; private set; }

    public IReadOnlyList<WordList> Lists => Document?.Lists ?? [];

    public IReadOnlyList<PracticeDevice> Devices => Document?.Devices ?? [];

    public string DefaultDeviceName => Loc.L("format.defaultDevice");

    /// <summary>The device this PC practises on: the built-in デフォルト until another is chosen, or none for 未選択.</summary>
    public PracticeDevice? ChosenPracticeDevice => Core.Devices.Chosen(Devices, SelectedDeviceId, DefaultDeviceName);

    private void Notify() => Changed?.Invoke();

    public void ChangeLanguage(AppLanguage language)
    {
        Language = language;
        Loc.Use(language);
        settings.Set("language", Loc.Tag(language));
        Notify();
    }

    public void ChangeAppearance(Appearance appearance)
    {
        Appearance = appearance;
        settings.Set("theme", appearance.ToString());
        Notify();
    }

    public void Navigate(Page route, string? listId = null)
    {
        if (route == Page.Practice && Route != Page.Practice) PracticeVisit++;
        Route = route;
        EditingListId = route == Page.EditList ? listId : null;
        Notify();
    }

    public void ChangeLiveStatsVisible(bool visible)
    {
        LiveStatsVisible = visible;
        settings.Set("live-stats-hidden", visible ? null : "true");
        Notify();
    }

    public void ChooseDevice(string id)
    {
        SelectedDeviceId = id;
        settings.Set("device:" + Store.AccountId, id);
        Notify();
    }

    public void Practise(string listId)
    {
        PracticeRequest = listId;
        Navigate(Page.Practice);
    }

    /// <summary>The list the records page opens filtered to, like <c>/records?list=&lt;id&gt;</c>; the page takes it once.</summary>
    public string? RecordsList { get; set; }

    public void ShowRecords(string? listId)
    {
        RecordsList = listId;
        Navigate(Page.Records);
    }

    public void ShowWords(string? listId)
    {
        WordsList = listId;
        Route = Page.Words;
        Notify();
    }

    public void ShowRankings(string? listId)
    {
        RankingsList = listId;
        Route = Page.Rankings;
        Notify();
    }

    private WorkspaceStore? MakeStore(StorageKind kind)
    {
        if (kind == StorageKind.Local) return new LocalWorkspaceStore(settings.Directory);
        var url = Accounts.Address(ServerUrl);
        var token = vault.Read();
        if (url is null || token is null || AccountUser is not { } user) return null;
        AccountWorkspaceStore? made = null;
        // A token the backend renewed replaces the old one; if it cannot be kept, the old one still works for now. A store
        // no longer in use, after a sign-out or a login to another account, keeps nothing.
        made = new AccountWorkspaceStore(url, token, user.Id, renewed => dispatcher.TryEnqueue(() =>
        {
            if (ReferenceEquals(made, Store) && Storage == StorageKind.Account) KeepToken(renewed);
        }));
        return made;
    }

    private AccountUser? ReadAccountUser()
    {
        if (settings.Get("account") is not { } text) return null;
        try
        {
            return JsonSerializer.Deserialize<AccountUser>(text, TypleJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Keeps the token in Windows' data protection; false when this PC cannot.</summary>
    private bool KeepToken(string token)
    {
        try
        {
            vault.Write(token);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public async Task ReloadAsync()
    {
        Loading = true;
        LoadError = null;
        Notify();
        var current = Store;
        try
        {
            var loaded = await current.LoadAsync();
            // A store switched while this one was loading has its own load.
            if (!ReferenceEquals(current, Store)) return;
            Document = loaded;
        }
        catch (Exception error)
        {
            if (!ReferenceEquals(current, Store)) return;
            Document = null;
            LoadError = Loc.ErrorText(error);
        }
        Loading = false;
        Notify();
    }

    /// <summary>
    /// Starts a GitHub login through the web app at <paramref name="serverUrl"/> and returns where it begins, for the
    /// browser to show. The login ends at <c>typle-r://login?code=…</c>, which Windows hands to this app (Program).
    /// </summary>
    public Uri StartSignIn(string serverUrl)
    {
        var url = Accounts.Address(serverUrl) ?? throw new TypleException("accountInvalidURL");
        var login = new AccountLogin(url);
        var pending = new PendingLogin(login.Verifier, url.AbsoluteUri, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        settings.Set("login", JsonSerializer.Serialize(pending, TypleJson.Options));
        SignInMessage = null;
        SigningIn = true;
        Notify();
        return login.SigninUrl;
    }

    /// <summary>
    /// Trades the address the login ended at for the app's token, keeps the account and switches to it. What came of it
    /// is left in <see cref="SignInMessage"/>. A login is finished once: its record is removed first.
    /// </summary>
    public async Task FinishSignInAsync(string callback)
    {
        finishingSignIns++;
        SigningIn = true;
        SignInMessage = null;
        var saved = settings.Get("login");
        settings.Set("login", null);
        // The record of the app's own login, when this is it coming back in time.
        var pending = DecodePendingLogin(saved);
        if (pending is not null &&
            DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(pending.StartedAt) is var age &&
            (age < TimeSpan.Zero || age > LoginLifetime))
        {
            pending = null;
        }
        var url = pending is null ? null : Accounts.Address(pending.Url);
        // The result is shown in 一般. Any other typle-r://login leaves the page as it is, so a practice run or an unsaved
        // list is not lost to it.
        if (url is not null) Navigate(Page.General);
        try
        {
            if (pending is null || url is null) throw new TypleException("accountLoginFailed");
            var (token, user) = await new AccountLogin(url, pending.Verifier).FinishAsync(callback);
            if (!KeepToken(token)) throw new TypleException("accountSaveFailed");
            settings.Set("account", JsonSerializer.Serialize(user, TypleJson.Options));
            settings.Set("server-url", url.AbsoluteUri);
            settings.Set("storage", StorageKind.Account.ToString());
            AccountUser = user;
            ServerUrl = url.AbsoluteUri;
            await UseStorageAsync(StorageKind.Account);
            SignInMessage = LoadError is { } error ? (true, error) : (false, Loc.L("settings.connected", Lists.Count));
        }
        catch (Exception error)
        {
            SignInMessage = (true, Loc.ErrorText(error));
        }
        finally
        {
            finishingSignIns--;
            if (finishingSignIns == 0) SigningIn = false;
            Notify();
        }
    }

    private static PendingLogin? DecodePendingLogin(string? text)
    {
        if (text is null) return null;
        try
        {
            return JsonSerializer.Deserialize<PendingLogin>(text, TypleJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Stops waiting for the login, as when the browser was closed. The record stays, so a callback that still comes is
    /// finished.
    /// </summary>
    public void CancelSignIn()
    {
        if (finishingSignIns == 0) SigningIn = false;
        Notify();
    }

    public void DismissSignInMessage()
    {
        SignInMessage = null;
        Notify();
    }

    /// <summary>Switches where the workspace is kept. The two are separate and nothing is copied between them.</summary>
    public async Task UseStorageAsync(StorageKind kind)
    {
        var next = MakeStore(kind) ?? throw new TypleException("accountLoginRequired");
        Storage = kind;
        settings.Set("storage", kind.ToString());
        Store = next;
        Document = null;
        SelectedDeviceId = settings.Get("device:" + next.AccountId);
        await ReloadAsync();
    }

    /// <summary>
    /// Forgets the token and the account and goes back to this PC's data. The token is a signed value the backend keeps
    /// no record of, as the web app's cookie is, so there is nothing to revoke.
    /// </summary>
    public async Task SignOutAsync()
    {
        vault.Write(null);
        settings.Set("account", null);
        AccountUser = null;
        SignInMessage = null;
        await UseStorageAsync(StorageKind.Local);
    }

    // Changes. Each throws the reason it failed, for the screen to show; the shown data stays as it was.

    private async Task Apply(Func<WorkspaceStore, Task<WorkspaceDocument>> change)
    {
        var current = Store;
        var next = await change(current);
        if (!ReferenceEquals(current, Store)) return;
        Document = next;
        Notify();
    }

    public Task SaveListAsync(WordList list, bool editing) => Apply(store => store.SaveListAsync(list, editing));

    public async Task<WordList> DuplicateListAsync(string id)
    {
        var current = Store;
        var (next, copy) = await current.DuplicateListAsync(id,
            n => n == 1 ? Loc.L("lists.copySuffix") : Loc.L("lists.copySuffixNumbered", n));
        if (ReferenceEquals(current, Store))
        {
            Document = next;
            Notify();
        }
        return copy;
    }

    public Task DeleteListAsync(string id) => Apply(store => store.DeleteListAsync(id));

    public Task AddRecordAsync(StoredRecord record, string listId) => Apply(store => store.AddRecordAsync(record, listId));

    public Task DeleteRecordAsync(StoredRecord record, string listId) => Apply(store => store.DeleteRecordAsync(record, listId));

    public Task SaveDeviceAsync(PracticeDevice device, bool editing)
    {
        var name = DefaultDeviceName;
        return Apply(store => store.SaveDeviceAsync(device, editing, name));
    }

    public Task DeleteDeviceAsync(string id) => Apply(store => store.DeleteDeviceAsync(id));
}
