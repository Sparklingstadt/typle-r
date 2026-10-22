using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// 一般 (src/app/settings/page.tsx): the display language, and on the PC where the data is kept, which the web app decides
/// by signing in. The GitHub login is the web app's own, so the account holds the same data as there.
/// </summary>
public sealed class SettingsPage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly Border headerHost = new();
    private readonly Border languageHost = new();
    private readonly Border storageHost = new();
    private readonly StackPanel storageColumn = new() { Spacing = 12 };
    private readonly Border choicesHost = new();
    private readonly StackPanel accountPanel = new() { Spacing = 12 };
    private readonly Border signedInHost = new();
    private readonly Border buttonsHost = new();
    private readonly Border messageHost = new();
    private readonly Border currentHost = new();
    private readonly TextBox serverUrl;
    private StorageKind kind;
    private StorageKind shownStorage;
    private StorageKind? cardStorage;
    private bool working;
    private (string Text, bool Failed)? message;

    public SettingsPage(AppModel app, Shell shell) : base(app, shell)
    {
        StackPanel content;
        (scroll, content) = PageScroll(832);
        kind = app.Storage;
        shownStorage = app.Storage;
        serverUrl = Input(app.ServerUrl, Accounts.DefaultUrl);
        serverUrl.InputScope = new Microsoft.UI.Xaml.Input.InputScope { Names = { new Microsoft.UI.Xaml.Input.InputScopeName(Microsoft.UI.Xaml.Input.InputScopeNameValue.Url) } };
        serverUrl.TextChanged += (_, _) => RenderButtons();
        accountPanel.Children.Add(Column(6, T(L("settings.serverURL"), 14, FontWeights.SemiBold), serverUrl));
        accountPanel.Children.Add(signedInHost);
        accountPanel.Children.Add(T(L("settings.accountHint"), 12, color: P.MutedForeground));
        storageColumn.Children.Add(choicesHost);
        storageColumn.Children.Add(accountPanel);
        storageColumn.Children.Add(buttonsHost);
        storageColumn.Children.Add(messageHost);
        storageColumn.Children.Add(currentHost);
        content.Children.Add(headerHost);
        content.Children.Add(languageHost);
        content.Children.Add(storageHost);
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        // A login finished while this screen was shown, or a sign-out, changes where the data is kept: the choice follows.
        if (App.Storage != shownStorage)
        {
            shownStorage = App.Storage;
            kind = App.Storage;
        }
        headerHost.Child = PageHeader(L("settings.title"), L("settings.description"), null);
        languageHost.Child = SettingsCard(Icons.Language, L("settings.language.heading"), L("settings.language.description"), Column(12,
            Tiles(2, 8, Enum.GetValues<AppLanguage>().Select(language => (UIElement)Choice(App.Language == language,
                L("settings.languageNames." + Loc.Tag(language)), L("settings.languages." + Loc.Tag(language)), () => App.ChangeLanguage(language))).ToList()),
            T(L("settings.language.note"), 12, color: P.MutedForeground)));
        choicesHost.Child = Tiles(2, 8, [
            Choice(kind == StorageKind.Local, L("settings.storage.local"), L("settings.storage.localDetail"), () => Choose(StorageKind.Local)),
            Choice(kind == StorageKind.Account, L("settings.storage.account"), L("settings.storage.accountDetail"), () => Choose(StorageKind.Account)),
        ]);
        accountPanel.Visibility = kind == StorageKind.Account ? Visibility.Visible : Visibility.Collapsed;
        signedInHost.Child = App.AccountUser is { } user ? Row(6, Icon(Icons.Person, 16), T(L("settings.signedIn", user.Name))) : null;
        RenderButtons();
        // A login's result is the app's, since the login may finish while this screen is closed.
        var shown = App.SignInMessage is { } signIn ? (signIn.Text, signIn.Failed) : message;
        messageHost.Child = shown is { } status ? StatusMessage(status.Text, status.Failed) : null;
        messageHost.Visibility = shown is null ? Visibility.Collapsed : Visibility.Visible;
        currentHost.Child = T(L("settings.current", App.Storage == StorageKind.Account ? L("settings.storage.account") : L("settings.storage.local")), 12,
            color: P.MutedForeground);
        if (cardStorage != App.Storage)
        {
            cardStorage = App.Storage;
            storageHost.Child = SettingsCard(App.Storage == StorageKind.Account ? Icons.Cloud : Icons.Laptop, L("settings.storage"), L("settings.storageHint"),
                Detach(storageColumn));
        }
    }

    private void Choose(StorageKind value)
    {
        kind = value;
        Refresh();
    }

    private void RenderButtons()
    {
        var busy = working || App.SigningIn;
        var signedIn = App.AccountUser;
        var buttons = new WrapPanel { HorizontalSpacing = 8, VerticalSpacing = 8 };
        if (kind == StorageKind.Local)
        {
            buttons.Children.Add(Button(L("settings.useLocal"), () => Perform(() => App.UseStorageAsync(StorageKind.Local)), size: ButtonSize.Large,
                enabled: !busy && App.Storage != StorageKind.Local));
        }
        else
        {
            buttons.Children.Add(Button(L("settings.signIn"), SignIn, size: ButtonSize.Large, enabled: !busy));
            // Signed in, but keeping the data on this PC for now.
            if (signedIn is not null && App.Storage == StorageKind.Local && Accounts.Address(serverUrl.Text)?.AbsoluteUri == App.ServerUrl)
            {
                buttons.Children.Add(Button(L("settings.useAccount"), () => Perform(() => App.UseStorageAsync(StorageKind.Account)), Variant.Outline,
                    ButtonSize.Large, enabled: !busy));
            }
        }
        if (signedIn is not null)
        {
            buttons.Children.Add(Button(L("settings.signOut"), () => Run(async () =>
            {
                message = null;
                await App.SignOutAsync();
                kind = StorageKind.Local;
                Refresh();
            }), Variant.Outline, ButtonSize.Large, enabled: !busy));
        }
        if (App.SigningIn)
        {
            buttons.Children.Add(Button(L("settings.cancelSignIn"), App.CancelSignIn, Variant.Ghost, ButtonSize.Large));
        }
        if (busy) buttons.Children.Add(new ProgressRing { IsActive = true, Width = 18, Height = 18, Margin = new Thickness(4, 11, 0, 0) });
        var column = Column(8, buttons);
        if (App.SigningIn) column.Children.Add(T(L("settings.signInWaiting"), 12, color: P.MutedForeground));
        buttonsHost.Child = column;
    }

    /// <summary>Switches where the data is kept, and says what came of it.</summary>
    private async void Perform(Func<Task> action)
    {
        working = true;
        message = null;
        App.DismissSignInMessage();
        try
        {
            await action();
            message = App.LoadError is { } error ? (error, true) : (L("settings.connected", App.Lists.Count), false);
        }
        catch (Exception error)
        {
            message = (Loc.ErrorText(error), true);
        }
        working = false;
        Refresh();
    }

    /// <summary>The login goes on in the browser; Windows hands its callback to the app, which shows the result here.</summary>
    private void SignIn()
    {
        message = null;
        App.DismissSignInMessage();
        try
        {
            var url = App.StartSignIn(serverUrl.Text);
            if (!OpenBrowser(url)) throw new TypleException("accountNoLoginApp");
        }
        catch (Exception error)
        {
            App.CancelSignIn();
            message = (Loc.ErrorText(error), true);
            Refresh();
        }
    }

    private static bool OpenBrowser(Uri url)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true });
            return true;
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return false;
        }
    }

    private static Border SettingsCard(string icon, string title, string description, UIElement body)
    {
        var tile = IconTile(icon);
        tile.VerticalAlignment = VerticalAlignment.Top;
        var column = Column(12, Column(4, T(title, 16, FontWeights.SemiBold), T(description, color: P.MutedForeground)), body);
        column.VerticalAlignment = VerticalAlignment.Top;
        return Card(Cells(16, (Auto, tile), (Star(), column)), 20);
    }

    /// <summary>A choice card like the web's language options: a check and 「使用中」 when chosen, an empty circle otherwise.</summary>
    private static Button Choice(bool selected, string title, string subtitle, Action onClick)
    {
        UIElement mark = selected
            ? Row(4, Icon(Icons.Check, 12), T(L("settings.language.current"), 12, FontWeights.Medium))
            : new Border { Width = 16, Height = 16, CornerRadius = new CornerRadius(8), BorderBrush = Brush(P.Ring), BorderThickness = new Thickness(1.5) };
        var row = Cells(8, (Star(), Column(2, T(title, 16, FontWeights.Medium), T(subtitle, 12, color: P.MutedForeground))), (Auto, mark));
        var button = Clickable(row, onClick, title, 8, new Thickness(12), selected ? P.Muted : P.Card);
        button.BorderBrush = Brush(selected ? P.Foreground : P.Border);
        button.BorderThickness = new Thickness(1);
        button.VerticalAlignment = VerticalAlignment.Stretch;
        return button;
    }
}
