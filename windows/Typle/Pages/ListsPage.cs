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
    private readonly TextBox search;
    private ListOrder order = ListOrder.Added;
    private (string Text, bool Failed)? message;

    public ListsPage(AppModel app, Shell shell) : base(app, shell)
    {
        StackPanel content;
        (scroll, content) = PageScroll();
        search = Input("", L("wordLists.manager.search"), _ => Refresh());
        var searchField = SearchField(search);
        searchField.MaxWidth = 384;
        searchField.HorizontalAlignment = HorizontalAlignment.Left;
        var tools = Cells(8, (Star(), searchField), (Auto, orderHost), (Auto, countHost));
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
        var all = WordLists.Overviews(App.Lists);
        var query = search.Text;
        var items = WordLists.Sort(all.Where(item => WordLists.MatchesQuery(item.List, query)).ToList(), order, Loc.Culture);
        countHost.Child = T(query.Length == 0 ? L("wordLists.manager.count", all.Count) : L("wordLists.manager.countFiltered", items.Count, all.Count),
            color: P.MutedForeground, maxLines: 1);
        if (items.Count == 0)
        {
            var empty = Column(12, IconTile(Icons.List),
                T(query.Length == 0 ? L("wordLists.empty.title") : L("wordLists.manager.noMatch", query), 16, FontWeights.SemiBold,
                    align: TextAlignment.Center),
                query.Length == 0 ? T(L("wordLists.empty.description"), color: P.MutedForeground, align: TextAlignment.Center) : null);
            foreach (var child in empty.Children) ((FrameworkElement)child).HorizontalAlignment = HorizontalAlignment.Center;
            bodyHost.Child = Dashed(empty);
            return;
        }
        var rows = Column(0);
        for (var i = 0; i < items.Count; i++)
        {
            if (i > 0) rows.Children.Add(Hairline());
            rows.Children.Add(ListRow(items[i]));
        }
        bodyHost.Child = Card(rows);
    }

    private Grid ListRow(ListOverview item)
    {
        var list = item.List;
        var preview = string.Join(L("wordLists.row.separator"), list.Words.Take(6).Select(word => word.Display.Trim()));
        var rest = Math.Max(0, list.Words.Count - 6);
        var summary = Clickable(Column(3, T(list.Name, 16, FontWeights.Medium, maxLines: 2),
                T(rest > 0 ? L("wordLists.row.more", preview, rest) : preview, color: P.MutedForeground, maxLines: 1)),
            () => App.Navigate(Page.EditList, list.Id), L("wordLists.row.editList", list.Name), 8, new Thickness(4));
        var practised = item.LastPracticed is { } last
            ? L("wordLists.row.practiced", item.PracticeCount, Format.Day(DateTimeOffset.FromUnixTimeMilliseconds((long)last)))
            : L("wordLists.row.notPracticed");
        var stats = Column(3, T(L("wordLists.row.wordCount", list.Words.Count), 14, FontWeights.Medium),
            Row(4, Icon(Icons.History, 11, P.MutedForeground), T(practised, 12, color: P.MutedForeground, maxLines: 1)));
        var more = Button(null, () => { }, Variant.Ghost, ButtonSize.Icon, Icons.More, L("wordLists.row.moreFor", list.Name));
        more.Flyout = Menu(
            MenuItem(L("wordLists.row.practiceThis"), () => App.Practise(list.Id), Icons.Keyboard),
            MenuItem(L("wordLists.row.rankings"), () => App.ShowRankings(list.Id), Icons.Trophy),
            MenuItem(L("wordLists.row.records"), () => App.Navigate(Page.Records), Icons.History),
            new MenuFlyoutSeparator(),
            MenuItem(L("wordLists.row.export"), () => _ = Export(list), Icons.Export),
            MenuItem(L("wordLists.row.copy"), () => _ = Duplicate(list), Icons.Copy, App.Lists.Count < WordLists.MaxLists),
            new MenuFlyoutSeparator(),
            MenuItem(L("wordLists.row.delete"), () => _ = Delete(list), Icons.Delete, destructive: true));
        var row = Cells(16,
            (Star(), summary),
            (Px(180), stats),
            (Auto, Button(null, () => App.Practise(list.Id), Variant.Ghost, ButtonSize.Icon, Icons.Keyboard, L("wordLists.row.practiceList", list.Name))),
            (Auto, Button(L("wordLists.row.edit"), () => App.Navigate(Page.EditList, list.Id), Variant.Outline, ButtonSize.Large, Icons.Edit,
                L("wordLists.row.editList", list.Name))),
            (Auto, more));
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
