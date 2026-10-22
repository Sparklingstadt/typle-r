using System.Diagnostics;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Pages;
using Typle.Support;
using Windows.UI.ViewManagement;
using static Typle.Support.Ui;

namespace Typle;

/// <summary>
/// The web app's layout (src/app/layout.tsx): a 56px top bar, and below it the sidebar beside the page when the window
/// is wide, or a sidebar opened from the menu button when it is narrower. It shows the app's state and builds everything
/// again when the theme or the language changes.
/// </summary>
public sealed class Shell
{
    private const double WideWidth = 1100;
    private readonly AppModel app;
    private readonly Window window;
    private readonly UISettings system = new();
    private readonly Grid topBarHost = new();
    private readonly Border navHost = new();
    private readonly Border pageHost = new();
    private readonly SplitView split;
    private PageView? page;
    private string? pageKey;
    private bool wide = true;
    private bool? builtDark;
    private AppLanguage? builtLanguage;
    private string? error;

    public Shell(AppModel app, Window window)
    {
        this.app = app;
        this.window = window;
        split = new SplitView
        {
            OpenPaneLength = 240, CompactPaneLength = 0, Pane = navHost, Content = pageHost, IsPaneOpen = true,
            DisplayMode = SplitViewDisplayMode.Inline,
        };
        Root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(56) });
        Root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        Microsoft.UI.Xaml.Controls.Grid.SetRow(split, 1);
        Root.Children.Add(topBarHost);
        Root.Children.Add(split);
        Root.SizeChanged += (_, args) =>
        {
            var isWide = args.NewSize.Width >= WideWidth;
            if (isWide == wide) return;
            wide = isWide;
            split.DisplayMode = wide ? SplitViewDisplayMode.Inline : SplitViewDisplayMode.Overlay;
            split.IsPaneOpen = wide;
            Update();
        };
        // The system's light or dark mode, followed while the theme is システム.
        system.ColorValuesChanged += (_, _) => window.DispatcherQueue.TryEnqueue(Update);
        app.Changed += Update;
        Update();
    }

    public Grid Root { get; } = new();

    public XamlRoot XamlRoot => Root.XamlRoot;

    public Window Window => window;

    private bool SystemDark => system.GetColorValue(UIColorType.Background).R < 128;

    private bool Dark => app.Appearance switch
    {
        Appearance.Dark => true,
        Appearance.Light => false,
        _ => SystemDark,
    };

    /// <summary>Shows an error of an action on top of the page, until the next page.</summary>
    public void ShowError(string text)
    {
        error = text;
        Update();
    }

    /// <summary>Opens a page of the web app or GitHub in the browser.</summary>
    public static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
        }
    }

    private void Update()
    {
        var dark = Dark;
        var rebuild = dark != builtDark || app.Language != builtLanguage;
        if (rebuild)
        {
            builtDark = dark;
            builtLanguage = app.Language;
            Palette.Current = dark ? Palette.DarkColors : Palette.Light;
            Root.RequestedTheme = dark ? ElementTheme.Dark : ElementTheme.Light;
            Root.Background = Brush(P.Background);
            split.PaneBackground = Brush(P.Background);
            pageKey = null;
        }
        topBarHost.Children.Clear();
        topBarHost.Children.Add(TopBar());
        navHost.Child = NavPane();
        ShowPage();
    }

    // MARK: Pages

    private string KeyOf() => app.Route switch
    {
        // Settings stay reachable when the data cannot be read, to switch where it is kept.
        Page.General => "general",
        _ when app.Document is null => app.LoadError is null ? "loading" : "error",
        Page.EditList => "editList:" + app.EditingListId,
        var route => route.ToString(),
    };

    private void ShowPage()
    {
        var key = KeyOf();
        if (key == pageKey && page is not null)
        {
            page.Refresh();
        }
        else
        {
            if (pageKey is not null && key != pageKey) error = null;
            pageKey = key;
            page = key switch
            {
                "general" => new SettingsPage(app, this),
                "loading" or "error" => new StatusPage(app, this),
                _ => app.Route switch
                {
                    Page.Practice => new PracticePage(app, this),
                    Page.Records => new RecordsPage(app, this),
                    Page.Rankings => new RankingsPage(app, this),
                    Page.Lists => new ListsPage(app, this),
                    Page.CreateList => new ListEditorPage(app, this, null),
                    Page.EditList => new ListEditorPage(app, this, app.EditingListId),
                    Page.Devices => new DevicesPage(app, this),
                    _ => new HomePage(app, this),
                },
            };
            var view = page;
            if (view.Root is FrameworkElement element) element.Loaded += (_, _) => view.Shown();
        }
        var root = (FrameworkElement)page.Root;
        if (error is null)
        {
            // The page stays where it is, so its text fields keep the focus.
            if (!ReferenceEquals(pageHost.Child, root)) pageHost.Child = Detach(root);
            return;
        }
        // An error of an action, above the page.
        var grid = new Grid();
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        var message = Cells(8, (Star(), T(error, color: P.Destructive)), (Auto, Button(null, () =>
        {
            error = null;
            Update();
        }, Variant.Ghost, ButtonSize.Icon, Icons.Close, L("common.close"))));
        var banner = new Border { Child = message, Background = Brush(P.DestructiveSoft), Padding = new Thickness(16, 8, 8, 8) };
        var body = Detach(root);
        Microsoft.UI.Xaml.Controls.Grid.SetRow(body, 1);
        grid.Children.Add(banner);
        grid.Children.Add(body);
        pageHost.Child = grid;
    }

    private static string L(string key, params object[] args) => Loc.L(key, args);

    // MARK: Top bar

    /// <summary>
    /// The top bar (src/components/Navbar): the menu button when narrow, the brand, and on the right where data is saved,
    /// the light and dark switch and the account.
    /// </summary>
    private Border TopBar()
    {
        var dark = Dark;
        var themeButton = Button(null, () => app.ChangeAppearance(dark ? Appearance.Light : Appearance.Dark), Variant.Ghost, ButtonSize.IconLarge,
            dark ? Icons.Moon : Icons.Sun, L("nav.theme.label") + " " + L(dark ? "nav.theme.toLight" : "nav.theme.toDark"));
        var bar = Cells(4,
            (Auto, wide ? null : Button(null, () => split.IsPaneOpen = !split.IsPaneOpen, Variant.Ghost, ButtonSize.IconLarge, Icons.Menu,
                L("nav.openMenu"))),
            (Auto, Brand()),
            (Star(), null),
            (Auto, StorageBadge(app)),
            (Auto, themeButton),
            (Auto, AccountButton()));
        return new Border
        {
            Child = bar, Background = Brush(P.Background), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(12, 0, 12, 0),
        };
    }

    /// <summary>The black keyboard tile and 「Typle」 (src/components/Navbar/Brand.tsx).</summary>
    private Button Brand()
    {
        var tile = new Border
        {
            Width = 28, Height = 28, CornerRadius = new CornerRadius(7), Background = Brush(P.Primary),
            Child = Icon(Icons.Keyboard, 16, P.PrimaryForeground),
        };
        var brand = Clickable(Row(10, tile, T("Typle", 18, FontWeights.Bold, maxLines: 1)), () => app.Navigate(Page.Home), L("nav.links.home"), 8,
            new Thickness(4, 0, 8, 0));
        brand.Height = 40;
        brand.HorizontalAlignment = HorizontalAlignment.Left;
        return brand;
    }

    /// <summary>Where the data is saved, as in the top bar and beside page headings (StorageBadge, PageStorageBadge).</summary>
    public static Border StorageBadge(AppModel app)
    {
        var account = app.Storage == StorageKind.Account;
        return Pill(Row(6, Icon(account ? Icons.Cloud : Icons.Laptop, 12, P.MutedForeground),
            T(L(account ? "storage.account" : "storage.local"), 12, FontWeights.Medium, Palette.WithAlpha(P.Foreground, 0.7), 1)));
    }

    /// <summary>The web app's GitHub login button. On the PC the GitHub login is in 一般, where the account is chosen.</summary>
    private UIElement AccountButton()
    {
        if (app.Storage == StorageKind.Account)
        {
            var avatar = new Border
            {
                Width = 32, Height = 32, CornerRadius = new CornerRadius(16), Background = Brush(P.Muted),
                Child = Icon(Icons.Person, 16, P.MutedForeground),
            };
            var button = Clickable(avatar, () => app.Navigate(Page.General), L("account.connected"), 16);
            button.Margin = new Thickness(4, 0, 4, 0);
            button.Width = 32;
            return button;
        }
        return Button(L("account.connect"), () => app.Navigate(Page.General), Variant.Outline, ButtonSize.Large, Icons.SignIn);
    }

    // MARK: Sidebar

    private sealed record NavItem(string Title, string Icon, Page? Route = null, string? Url = null);

    /// <summary>The sidebar's contents (src/components/Sidebar/NavList.tsx).</summary>
    private Border NavPane()
    {
        (string? Label, NavItem[] Items)[] groups =
        [
            (null, [new(L("nav.links.home"), Icons.Home, Page.Home)]),
            (L("nav.groups.practice"), [
                new(L("nav.links.play"), Icons.Keyboard, Page.Practice),
                new(L("nav.links.records"), Icons.History, Page.Records),
                new(L("nav.links.rankings"), Icons.Trophy, Page.Rankings),
            ]),
            (L("nav.groups.wordLists"), [
                new(L("nav.links.edit"), Icons.List, Page.Lists),
                new(L("nav.links.create"), Icons.Add, Page.CreateList),
            ]),
            (L("nav.groups.settings"), [
                new(L("nav.links.general"), Icons.Settings, Page.General),
                new(L("nav.links.devices"), Icons.Monitor, Page.Devices),
            ]),
        ];
        NavItem[] help =
        [
            new(L("nav.links.guide"), Icons.Book, Url: "https://typle-r-six.vercel.app/guide"),
            new(L("nav.links.about"), Icons.Info, Url: "https://typle-r-six.vercel.app/about"),
            new("GitHub", Icons.OpenInNew, Url: "https://github.com/Sparklingstadt/typle-r"),
        ];
        var main = Column(0);
        foreach (var (label, items) in groups)
        {
            if (label is not null) main.Children.Add(GroupLabel(label));
            var list = Column(2);
            foreach (var item in items) list.Children.Add(NavRow(item));
            main.Children.Add(list);
        }
        var bottom = Column(0, Hairline(), GroupLabel(L("nav.help")));
        var helpList = Column(2);
        foreach (var item in help) helpList.Children.Add(NavRow(item));
        bottom.Children.Add(helpList);
        var grid = new Grid { RowSpacing = 24 };
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var scroll = new ScrollViewer { Content = main, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Microsoft.UI.Xaml.Controls.Grid.SetRow(bottom, 1);
        grid.Children.Add(scroll);
        grid.Children.Add(bottom);
        return new Border
        {
            Child = grid, Background = Brush(P.Background), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(0, 0, 1, 0),
            Padding = new Thickness(12),
        };
    }

    private static TextBlock GroupLabel(string text)
    {
        var label = T(text, 12, FontWeights.Medium, P.MutedForeground);
        label.Margin = new Thickness(12, 16, 12, 4);
        return label;
    }

    private Button NavRow(NavItem item)
    {
        var navigationItem = app.Route == Page.EditList ? Page.Lists : app.Route;
        var current = item.Route is { } route && route == navigationItem;
        var bar = new Border
        {
            Width = 3, Height = 20, CornerRadius = new CornerRadius(2), Background = Brush(current ? P.Primary : Microsoft.UI.Colors.Transparent),
            HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center,
        };
        var label = Row(12, Icon(item.Icon, 16, current ? P.Foreground : P.MutedForeground),
            T(item.Title, 14, current ? FontWeights.Medium : FontWeights.Normal, current ? P.Foreground : Palette.WithAlpha(P.Foreground, 0.8), 1));
        label.Margin = new Thickness(12, 0, 12, 0);
        var content = new Grid();
        content.Children.Add(label);
        content.Children.Add(bar);
        var button = Clickable(content, () =>
        {
            if (item.Route is { } page) app.Navigate(page);
            else if (item.Url is { } url) OpenUrl(url);
            if (!wide) split.IsPaneOpen = false;
        }, item.Title, 8, null, current ? P.Accent : null);
        button.Height = 40;
        return button;
    }
}

/// <summary>While the data is read, or when it cannot be: the reason and a way to try again or switch where it is kept.</summary>
public sealed class StatusPage : PageView
{
    private readonly Border root = new();

    public StatusPage(AppModel app, Shell shell) : base(app, shell) => Refresh();

    public override UIElement Root => root;

    public override void Refresh()
    {
        root.Background = Brush(P.Page);
        if (App.LoadError is { } loadError)
        {
            var (scroll, content) = PageScroll();
            var buttons = Row(8,
                Button(L("common.retry"), () => Run(App.ReloadAsync)),
                Button(L("nav.links.general"), () => App.Navigate(Page.General), Variant.Outline));
            content.Children.Add(Card(Column(12,
                Row(8, Icon(Icons.Warning, 18, P.Destructive), T(L("errors.loadFailed"), 17, FontWeights.SemiBold, P.Destructive)),
                T(loadError), buttons), 24));
            root.Child = scroll;
            return;
        }
        var loading = Column(12, new ProgressRing { IsActive = true, Width = 28, Height = 28 }, T(L("common.loading"), color: P.MutedForeground));
        loading.HorizontalAlignment = HorizontalAlignment.Center;
        loading.VerticalAlignment = VerticalAlignment.Center;
        root.Child = loading;
    }
}
