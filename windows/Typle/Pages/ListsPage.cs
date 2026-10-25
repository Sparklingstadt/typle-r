using System.Text;
using System.Text.RegularExpressions;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using Windows.Storage.Pickers;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>The word lists page (src/app/(workspace)/edit/page.tsx): search, sort, practise, edit, copy, export and delete.</summary>
public sealed partial class ListsPage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly Border headerHost = new();
    private readonly Border messageHost = new();
    private readonly Border managerHost = new();
    private readonly Border orderHost = new();
    private readonly Border countHost = new();
    private readonly Border bodyHost = new();
    private readonly Border filterHost = new();
    private readonly Border clearSearchHost = new() { HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 0, 6, 0) };
    private readonly TextBox search;
    private ListOrder order = ListOrder.Added;
    private ListFilter filter = ListFilter.None;
    // The groups opened, which stay open while the page refreshes.
    private readonly HashSet<string> openGroups = [];
    private (string Text, bool Failed)? message;

    public ListsPage(AppModel app, Shell shell) : base(app, shell)
    {
        StackPanel content;
        (scroll, content) = PageScroll();
        search = Input("", L("wordLists.manager.search"), _ => Refresh());
        search.Padding = new Thickness(34, 8, 36, 8);
        var searchField = SearchField(search);
        searchField.Children.Add(clearSearchHost);
        searchField.Width = 360;
        var tools = Cells(8, (Auto, searchField), (Auto, filterHost), (Auto, orderHost), (Star(), null), (Auto, countHost));
        content.Children.Add(headerHost);
        content.Children.Add(messageHost);
        content.Children.Add(Column(16, managerHost, tools, bodyHost, T(L("wordLists.manager.csvNote"), 12, color: P.MutedForeground)));
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        headerHost.Child = PageHeader(L("wordLists.page.title"), L("wordLists.page.description"), Shell.StorageBadge(App));
        messageHost.Child = message is { } shown ? StatusMessage(shown.Text, shown.Failed) : null;
        messageHost.Visibility = message is null ? Visibility.Collapsed : Visibility.Visible;
        managerHost.Child = Cells(10,
            (Auto, T(L("wordLists.manager.heading"), 16, FontWeights.Bold)),
            (Auto, CountBadge($"{App.Lists.Count} / {WordLists.MaxLists}")),
            (Star(), null),
            (Auto, Button(L("wordLists.manager.create"), () => App.Navigate(Page.CreateList), size: ButtonSize.Large, icon: Icons.Add,
                enabled: App.Lists.Count < WordLists.MaxLists)));
        orderHost.Child = FilterMenu(L("wordLists.order.label"),
            Enum.GetValues<ListOrder>().Select(value => (value, L("wordLists.order." + value.ToString().ToLowerInvariant()))).ToList(), order, value =>
            {
                order = value;
                Refresh();
            });
        var labels = WordLists.Labels(App.Lists, Loc.Culture);
        filterHost.Child = Row(8, CategoryMenu(labels), TagsMenu(labels),
            filter.IsFiltered ? Button(L("wordLists.filter.clear"), () => ChangeFilter(ListFilter.None), Variant.Ghost, ButtonSize.Large) : null);
        clearSearchHost.Child = search.Text.Length == 0
            ? null
            : Button(null, () => search.Text = "", Variant.Ghost, ButtonSize.Icon, Icons.Close, L("common.clearSearch"));
        if (clearSearchHost.Child is Button clear)
        {
            clear.Width = 28;
            clear.Height = 28;
            clear.MinWidth = 28;
        }
        var all = WordLists.Overviews(App.Lists);
        var query = search.Text;
        var narrowed = query.Trim().Length > 0 || filter.IsFiltered;
        var items = WordLists.Sort(all.Where(item => WordLists.MatchesQuery(item.List, query) && WordLists.MatchesFilter(item.List, filter)).ToList(),
            order, Loc.Culture);
        countHost.Child = T(!narrowed ? L("wordLists.manager.count", all.Count) : L("wordLists.manager.countFiltered", items.Count, all.Count),
            color: P.MutedForeground, maxLines: 1);
        if (items.Count == 0)
        {
            var empty = Column(12, IconTile(Icons.List),
                T(App.Lists.Count == 0 ? L("wordLists.empty.title") : query.Trim().Length > 0 ? L("wordLists.manager.noMatch", query.Trim()) : L("wordLists.filter.noMatch"),
                    16, FontWeights.SemiBold, align: TextAlignment.Center),
                App.Lists.Count == 0 ? T(L("wordLists.empty.description"), color: P.MutedForeground, align: TextAlignment.Center) : null,
                App.Lists.Count == 0 ? null : Button(L(filter.IsFiltered ? "wordLists.filter.clearAll" : "common.clearSearch"), () =>
                {
                    filter = ListFilter.None;
                    search.Text = "";
                    Refresh();
                }, Variant.Outline));
            foreach (var child in empty.Children) ((FrameworkElement)child).HorizontalAlignment = HorizontalAlignment.Center;
            bodyHost.Child = Dashed(empty);
            return;
        }
        var rows = Column(0);
        foreach (var entry in WordLists.GroupEntries(items, item => item.List, App.Lists))
        {
            if (rows.Children.Count > 0) rows.Children.Add(Hairline());
            if (entry.Group is not { } group)
            {
                rows.Children.Add(ListRow(entry.Items[0]));
                continue;
            }
            // A search or filter shows the matching lists of every group. Inside a group the lists keep their saved order,
            // which goes from the first level to the last.
            var open = narrowed || openGroups.Contains(group);
            var members = entry.Items.OrderBy(item => item.Position).ToList();
            rows.Children.Add(GroupRow(group, members, open));
            if (!open) continue;
            var inner = Column(0);
            foreach (var member in members)
            {
                if (inner.Children.Count > 0) inner.Children.Add(Hairline());
                inner.Children.Add(ListRow(member));
            }
            rows.Children.Add(new Border
            {
                Child = inner, Margin = new Thickness(24, 0, 0, 0), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(1, 1, 0, 0),
            });
        }
        bodyHost.Child = Card(rows);
    }

    private void ChangeFilter(ListFilter value)
    {
        filter = value;
        Refresh();
    }

    /// <summary>The category menu of the web's LabelFilter: every category, one category, or the lists without one.</summary>
    private Button? CategoryMenu(ListLabelCounts labels)
    {
        if (labels.Categories.Count == 0 && filter.Category is null) return null;
        var text = filter.Category is null ? L("wordLists.filter.allCategories") : filter.Category.Length == 0 ? L("wordLists.filter.noCategory") : filter.Category;
        var menu = Menu(
            [
                MenuItem(L("wordLists.filter.allCategories"), () => ChangeFilter(filter with { Category = null }), selected: filter.Category is null),
                .. labels.Categories.Select(item => (MenuFlyoutItemBase)MenuItem(L("wordLists.filter.option", item.Name, item.Count),
                    () => ChangeFilter(filter with { Category = item.Name }),
                    selected: filter.Category is { Length: > 0 } chosen && chosen.Trim().ToLowerInvariant() == item.Name.ToLowerInvariant())),
                labels.Uncategorized > 0
                    ? MenuItem(L("wordLists.filter.option", L("wordLists.filter.noCategory"), labels.Uncategorized),
                        () => ChangeFilter(filter with { Category = "" }), selected: filter.Category == "")
                    : null,
            ]);
        return LabelMenuButton(ListParts.FolderGlyph, text, L("wordLists.filter.categoryCurrent", text), filter.Category is not null, menu);
    }

    /// <summary>The tags menu: a list must have every tag chosen. A chosen tag stays in the menu, so it can be unchecked.</summary>
    private Button? TagsMenu(ListLabelCounts labels)
    {
        static string Key(string value) => value.Trim().ToLowerInvariant();
        var tags = labels.Tags.Concat(filter.Tags.Where(tag => labels.Tags.All(item => Key(item.Name) != Key(tag))).Select(tag => new LabelCount(tag, 0))).ToList();
        if (tags.Count == 0) return null;
        var separator = L("wordLists.filter.separator");
        var text = filter.Tags.Count == 0 ? L("wordLists.filter.allTags") : string.Join(separator, filter.Tags);
        var menu = new MenuFlyout { Placement = Microsoft.UI.Xaml.Controls.Primitives.FlyoutPlacementMode.BottomEdgeAlignedLeft };
        menu.Items.Add(new MenuFlyoutItem { Text = L("wordLists.filter.tagsHint"), IsEnabled = false });
        foreach (var tag in tags)
        {
            var chosen = filter.Tags.Any(value => Key(value) == Key(tag.Name));
            var item = new ToggleMenuFlyoutItem { Text = L("wordLists.filter.option", tag.Name, tag.Count), IsChecked = chosen };
            item.Click += (_, _) => ChangeFilter(filter with
            {
                Tags = chosen ? filter.Tags.Where(value => Key(value) != Key(tag.Name)).ToList() : [.. filter.Tags, tag.Name],
            });
            menu.Items.Add(item);
        }
        if (filter.Tags.Count > 0)
        {
            menu.Items.Add(new MenuFlyoutSeparator());
            menu.Items.Add(MenuItem(L("wordLists.filter.clearTags"), () => ChangeFilter(filter with { Tags = [] })));
        }
        var tagGlyph = "";
        return LabelMenuButton(tagGlyph, text, filter.Tags.Count == 0 ? text : L("wordLists.filter.tagsCurrent", text), filter.Tags.Count > 0, menu);
    }

    private static Button LabelMenuButton(string glyph, string text, string label, bool active, MenuFlyout menu)
    {
        var content = Row(6, Icon(glyph, 14, P.MutedForeground), T(text, 14, maxLines: 1), Icon(Icons.ChevronDown, 10, P.MutedForeground));
        var button = Clickable(content, () => { }, label, 8, new Thickness(12, 0, 12, 0), P.Card);
        button.Height = 40;
        button.MaxWidth = 240;
        button.HorizontalAlignment = HorizontalAlignment.Left;
        button.BorderBrush = Brush(active ? Palette.WithAlpha(P.Primary, 0.6) : P.Border);
        button.BorderThickness = new Thickness(1);
        button.Flyout = menu;
        return button;
    }

    private string Practised(int count, double? last) => last is { } millis
        ? L("wordLists.row.practiced", count, Format.Day(DateTimeOffset.FromUnixTimeMilliseconds((long)millis)))
        : L("wordLists.row.notPracticed");

    private static StackPanel Stats(string words, string practised) => Column(3, T(words, 13, FontWeights.Medium),
        Row(4, Icon(Icons.History, 11, P.MutedForeground), T(practised, 12, color: P.MutedForeground, maxLines: 1)));

    /// <summary>
    /// The lists of a group as one row (src/components/WordLists/GroupRow.tsx), which opens to show each of them. 練習
    /// opens the list of the group practised last, or its first.
    /// </summary>
    private Grid GroupRow(string group, IReadOnlyList<ListOverview> items, bool open)
    {
        var latest = items.Where(item => item.LastPracticed is not null).OrderByDescending(item => item.LastPracticed).FirstOrDefault();
        var words = items.Sum(item => item.List.Words.Count);
        var name = Clickable(Row(6, Icon(open ? Icons.ChevronDown : Icons.ChevronRight, 12, P.MutedForeground), T(group, 16, FontWeights.Medium, maxLines: 2)),
            () =>
            {
                if (!openGroups.Remove(group)) openGroups.Add(group);
                Refresh();
            }, group, 6, new Thickness(4));
        name.HorizontalAlignment = HorizontalAlignment.Left;
        var summary = Column(3, Row(8, name, ListParts.Labels(items[0].List, 0)),
            T(L("wordLists.group.levels", items.Count), color: P.MutedForeground, maxLines: 1));
        var practice = Button(L("wordLists.group.practice"), () => App.Practise((latest ?? items[0]).List.Id), Variant.Ghost, ButtonSize.Large,
            Icons.Keyboard, L("wordLists.group.practiceGroup", group));
        var row = Cells(16,
            (Star(), summary),
            (Px(180), Stats(L("wordLists.group.wordCount", words), Practised(items.Sum(item => item.PracticeCount), latest?.LastPracticed))),
            (Auto, practice));
        row.Padding = new Thickness(16, 14, 16, 14);
        return row;
    }

    private Grid ListRow(ListOverview item)
    {
        var list = item.List;
        var (words, more) = WordLists.WordPreview(list);
        var preview = string.Join(L("wordLists.row.separator"), words);
        var summary = Column(3, Row(8, T(list.Name, 16, FontWeights.Medium, maxLines: 2), ListParts.Labels(list, 0)),
            T(more > 0 ? L("wordLists.row.more", preview, more) : preview, color: P.MutedForeground, maxLines: 1));
        summary.Margin = new Thickness(4);
        var menu = Menu(
            item.PracticeCount > 0 ? MenuItem(L("wordLists.row.rankings"), () => App.ShowRankings(list.Id), Icons.Trophy) : null,
            item.PracticeCount > 0
                ? MenuItem(L("wordLists.row.records") + "（" + L("wordLists.row.recordCount", item.PracticeCount) + "）", () => App.ShowRecords(list.Id), Icons.History)
                : null,
            item.PracticeCount > 0 ? new MenuFlyoutSeparator() : null,
            MenuItem(L("wordLists.row.export"), () => _ = Export(list), Icons.Export),
            MenuItem(L("wordLists.row.copy"), () => _ = Duplicate(list), Icons.Copy, App.Lists.Count < WordLists.MaxLists),
            new MenuFlyoutSeparator(),
            MenuItem(L("wordLists.row.delete"), () => _ = Delete(list), Icons.Delete, destructive: true));
        var moreButton = Button(null, () => { }, Variant.Ghost, ButtonSize.Icon, Icons.More, L("wordLists.row.moreFor", list.Name));
        moreButton.Flyout = menu;
        var row = Cells(16,
            (Star(), summary),
            (Px(180), Stats(L("wordLists.row.wordCount", list.Words.Count), Practised(item.PracticeCount, item.LastPracticed))),
            (Auto, Button(L("wordLists.row.practice"), () => App.Practise(list.Id), Variant.Ghost, ButtonSize.Large, Icons.Keyboard,
                L("wordLists.row.practiceList", list.Name))),
            (Auto, Row(4, Button(L("wordLists.row.edit"), () => App.Navigate(Page.EditList, list.Id), Variant.Outline, ButtonSize.Large, Icons.Edit,
                L("wordLists.row.editList", list.Name)), moreButton)));
        row.Padding = new Thickness(16, 14, 16, 14);
        return row;
    }

    private void Show(string text, bool failed)
    {
        message = (text, failed);
        Refresh();
    }

    private async Task Duplicate(WordList list)
    {
        try
        {
            var copy = await App.DuplicateListAsync(list.Id);
            Show(L("wordLists.page.created", copy.Name), false);
        }
        catch (Exception error)
        {
            Show(Loc.ErrorText(error), true);
        }
    }

    private async Task Delete(WordList list)
    {
        var confirmed = await Confirm(Shell.XamlRoot, L("wordLists.delete.title", list.Name),
            list.Records.Count == 0 ? L("wordLists.delete.listOnly") : L("wordLists.delete.withRecords"), L("common.delete.confirm"));
        if (!confirmed) return;
        try
        {
            await App.DeleteListAsync(list.Id);
            Show(L("wordLists.page.deleted", list.Name), false);
        }
        catch (Exception error)
        {
            Show(Loc.ErrorText(error), true);
        }
    }

    [GeneratedRegex("[/\\\\?%*|\"<>:\\p{Cc}]")]
    private static partial Regex UnsafeFileName();

    /// <summary>A list's words as a CSV file, saved where the user chooses (src/components/WordListExport.tsx).</summary>
    private async Task Export(WordList list)
    {
        var name = UnsafeFileName().Replace(list.Name, "_").Trim();
        var picker = new FileSavePicker { SuggestedFileName = name.Length == 0 ? "words" : name, SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeChoices.Add("CSV", [".csv"]);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(Shell.Window));
        try
        {
            var file = await picker.PickSaveFileAsync();
            if (file is null) return;
            await File.WriteAllTextAsync(file.Path, WordFiles.EncodeCsv(list.Words), new UTF8Encoding(false));
            Show(L("wordLists.export.done", file.Name), false);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            Show(Loc.ErrorText(new TypleException("localWriteFailed")), true);
        }
    }
}
