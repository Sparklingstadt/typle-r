using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// Each list's personal best (src/app/(workspace)/rankings/page.tsx): the lists, and for a chosen list its figures, time
/// trend and top records. Rank 1 is the best every other screen shows.
/// </summary>
public sealed class RankingsPage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly StackPanel content;
    private readonly Border headerHost = new();
    private readonly Border filtersHost = new();
    private readonly Border bodyHost = new();
    private readonly Border sortHost = new();
    // The search stays on screen while the lists below it change, so typing in it is never interrupted.
    private readonly StackPanel listsColumn = new();
    private readonly Border listsCard;
    private readonly TextBox search;
    private RankOrder order = RankOrder.Accuracy;
    private ListSort sort = ListSort.Recent;
    private string? device;
    private bool showAll;

    public RankingsPage(AppModel app, Shell shell) : base(app, shell)
    {
        (scroll, content) = PageScroll(1088);
        content.Children.Add(headerHost);
        content.Children.Add(filtersHost);
        content.Children.Add(bodyHost);
        search = Input("", L("rankings.list.search"), _ => Refresh());
        var top = Cells(12, (Star(), SearchField(search)), (Auto, sortHost));
        top.Padding = new Thickness(12);
        listsColumn.Children.Add(top);
        listsCard = Card(listsColumn);
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        headerHost.Child = PageHeader(L("rankings.title"), L("rankings.intro"), Shell.StorageBadge(App));
        var devices = Records.DeviceOptions(App.Lists.SelectMany(list => list.Records));
        string DeviceName(string value) =>
            value == Records.NoDevice ? L("format.noDeviceRecorded") : Format.Device(devices.FirstOrDefault(option => option.Value == value)?.Device);
        List<(string?, string)> deviceChoices = [(null, L("rankings.filter.allDevices")), .. devices.Select(option => ((string?)option.Value, DeviceName(option.Value)))];
        filtersHost.Child = Row(10,
            FilterMenu(L("rankings.filter.device"), deviceChoices, device, value =>
            {
                device = value;
                Refresh();
            }, device is null ? L("records.filterMenu.all") : DeviceName(device)),
            Segmented([(RankOrder.Accuracy, L("rankings.order.accuracy")), (RankOrder.Speed, L("rankings.order.speed"))], order, value =>
            {
                order = value;
                Refresh();
            }),
            Row(4, Icon(Icons.Info, 12, P.MutedForeground),
                T(L(order == RankOrder.Accuracy ? "rankings.orderNotes.accuracy" : "rankings.orderNotes.speed"), 12, color: P.MutedForeground)));
        var chosen = App.RankingsList is { } id ? App.Lists.FirstOrDefault(list => list.Id == id) : null;
        if (chosen is not null)
        {
            bodyHost.Child = Detail(Rankings.For(chosen, device, order, showAll));
            return;
        }
        if (!ReferenceEquals(bodyHost.Child, listsCard)) bodyHost.Child = Detach(listsCard);
        sortHost.Child = SortMenu();
        RenderLists();
    }

    private void RenderLists()
    {
        var needle = search.Text.Trim().ToLowerInvariant();
        var rankings = Rankings.Sort(App.Lists.Select(list => Rankings.For(list, device, order)).ToList(), sort, Loc.Culture)
            .Where(ranking => search.Text.Length == 0 || ranking.List.Name.ToLowerInvariant().Contains(needle)).ToList();
        var practised = rankings.Where(ranking => ranking.Records.Count > 0).ToList();
        var unpractised = rankings.Where(ranking => ranking.Records.Count == 0).ToList();
        var column = listsColumn;
        while (column.Children.Count > 1) column.Children.RemoveAt(1);
        column.Children.Add(Hairline());
        for (var i = 0; i < practised.Count; i++)
        {
            if (i > 0) column.Children.Add(Hairline());
            column.Children.Add(ListRow(practised[i]));
        }
        if (unpractised.Count > 0)
        {
            column.Children.Add(Hairline());
            var note = T(device is null ? L("rankings.list.noRecords", unpractised.Count) : L("rankings.list.noDeviceRecords", unpractised.Count), 12,
                color: P.MutedForeground);
            note.Margin = new Thickness(16, 14, 16, 6);
            column.Children.Add(note);
            foreach (var ranking in unpractised)
            {
                var row = Cells(6, (Star(), T(ranking.List.Name, color: P.MutedForeground, maxLines: 1)),
                    (Auto, T(L("rankings.list.words", ranking.List.Words.Count), 12, color: P.MutedForeground)),
                    (Auto, Icon(Icons.ChevronRight, 12, P.MutedForeground)));
                var button = Clickable(row, () => App.ShowRankings(ranking.List.Id), ranking.List.Name, 0, new Thickness(16, 0, 16, 0));
                button.Height = 38;
                column.Children.Add(button);
            }
            column.Children.Add(Spacer(height: 8));
        }
        if (rankings.Count == 0)
        {
            var none = T(L("rankings.list.noMatch", search.Text), color: P.MutedForeground);
            none.Margin = new Thickness(16);
            column.Children.Add(none);
        }
    }

    private Button SortMenu()
    {
        string Name(ListSort value) => L("rankings.list.sorts." + value.ToString().ToLowerInvariant());
        var button = Clickable(Row(4, T(Name(sort), 13, color: P.MutedForeground), Icon(Icons.ChevronDown, 10, P.MutedForeground)), () => { },
            Name(sort), 8, new Thickness(8, 4, 8, 4));
        button.Flyout = Menu(Enum.GetValues<ListSort>().Select(value => (MenuFlyoutItemBase)MenuItem(Name(value), () =>
        {
            sort = value;
            Refresh();
        }, selected: value == sort)).ToArray());
        return button;
    }

    private Button ListRow(ListRanking ranking)
    {
        var text = Column(3, T(ranking.List.Name, 15, FontWeights.Medium));
        if (ranking.Best is { } best)
        {
            text.Children.Add(Row(8, Icon(Icons.Trophy, 12, P.Amber), ValueWithUnit(Format.Seconds(best.Time), L("format.secondsUnit"), 13, FontWeights.SemiBold),
                T(Records.FormatAccuracy(best.Accuracy), 13, color: P.MutedForeground),
                ranking.Improved ? Row(2, Icon(Icons.TrendUp, 11, P.Success), T(L("rankings.list.improved"), 12, FontWeights.Medium, P.Success)) : null));
        }
        var meta = Column(3, T(ranking.LastPracticed is { } last ? Format.Day(last) : "", 12, color: P.MutedForeground, align: TextAlignment.Right),
            T(L("rankings.list.runs", ranking.Records.Count), 12, color: P.MutedForeground, align: TextAlignment.Right));
        var row = Cells(12, (Star(), text), (Auto, meta), (Auto, Icon(Icons.ChevronRight, 12, P.MutedForeground)));
        return Clickable(row, () => App.ShowRankings(ranking.List.Id), ranking.List.Name, 0, new Thickness(16, 12, 16, 12));
    }

    private Border Detail(ListRanking ranking)
    {
        var stats = Rankings.Stats(ranking.Ranked);
        var shown = showAll ? ranking.Ranked : ranking.Ranked.Take(Rankings.Top).ToList();
        var column = Column(24);
        var back = Clickable(Row(6, Icon(Icons.ArrowLeft, 12), T(L("rankings.detail.back"), 13, FontWeights.Medium)), () =>
        {
            showAll = false;
            App.ShowRankings(null);
        }, L("rankings.detail.back"), 8, new Thickness(4));
        back.HorizontalAlignment = HorizontalAlignment.Left;
        column.Children.Add(back);
        var meta = new[]
        {
            L("rankings.detail.words", ranking.List.Words.Count), L("rankings.detail.records", ranking.Records.Count),
            ranking.LastPracticed is { } last ? L("rankings.detail.lastPracticed", Format.Day(last)) : null,
        }.OfType<string>();
        column.Children.Add(Cells(8,
            (Star(), Column(6, T(ranking.List.Name, 22, FontWeights.Bold), T(string.Join("  ·  ", meta), 13, color: P.MutedForeground))),
            (Auto, Button(L("rankings.detail.viewRecords"), () => App.Navigate(Page.Records), Variant.Ghost, trailing: Icon(Icons.ArrowRight, 12))),
            (Auto, Button(L("rankings.detail.practice"), () => App.Practise(ranking.List.Id), icon: Icons.Keyboard))));
        if (ranking.Records.Count == 0)
        {
            column.Children.Add(Box(Column(6, T(L("rankings.detail.notPractised.title"), 16, FontWeights.SemiBold),
                T(L("rankings.detail.notPractised.description"), color: P.MutedForeground)), Palette.WithAlpha(P.Muted, 0.5), 20));
            return Card(column, 24);
        }
        var best = ranking.Best;
        var behind = stats.RecentTime is { } recentTime && best is not null ? recentTime - best.Time : (double?)null;
        column.Children.Add(Tiles(4, 12, new UIElement?[]
        {
            best is null ? null : Figure(L("rankings.detail.stats.best"), Format.Seconds(best.Time), L("format.secondsUnit"),
                L("rankings.detail.stats.bestNote", Records.FormatAccuracy(best.Accuracy), Dates.Parse(best.Date) is { } date ? Format.Day(date) : ""), true),
            Figure(L("rankings.detail.stats.recentAverage", stats.RecentCount), stats.RecentTime is { } time ? Format.Seconds(time) : "—",
                L("format.secondsUnit"),
                behind is null ? "" : behind < 0.005 ? L("rankings.detail.stats.sameAsBest") : L("rankings.detail.stats.behindBest", Format.Seconds(behind.Value))),
            Figure(L("rankings.detail.stats.accuracy"), stats.RecentAccuracy is { } accuracy ? Format.Fixed(accuracy, 1) : "—", "%",
                L("rankings.detail.stats.recent", stats.RecentCount)),
            Figure(L("rankings.detail.stats.runs"), ranking.Ranked.Count.ToString(CultureInfo.InvariantCulture), L("rankings.detail.stats.runsUnit"),
                L("rankings.detail.stats.atCount", ranking.List.Words.Count)),
        }.OfType<UIElement>().ToList()));
        var trendTitle = T(L("rankings.detail.trend.title"), 14, FontWeights.Bold);
        trendTitle.VerticalAlignment = VerticalAlignment.Bottom;
        var trendCount = T(L("rankings.detail.trend.recent", stats.Points.Count), color: P.MutedForeground);
        trendCount.VerticalAlignment = VerticalAlignment.Bottom;
        column.Children.Add(Column(10, Row(6, trendTitle, trendCount),
            Box(stats.Points.Count > 1
                ? TrendChart.Create(stats.Points, Dashboard.SpeedScale(stats.Points.Select(point => point.Value).ToList()))
                : T(L("rankings.detail.trend.needTwo"), color: P.MutedForeground), Palette.WithAlpha(P.Muted, 0.5), 14)));
        if (ranking.Fallback) column.Children.Add(T(L("rankings.fallback", ranking.List.Words.Count), 13, color: P.MutedForeground));

        var top = Column(4);
        var topTitle = T(L("rankings.detail.top.title"), 14, FontWeights.Bold);
        topTitle.VerticalAlignment = VerticalAlignment.Bottom;
        var topOrder = T(L(order == RankOrder.Accuracy ? "rankings.detail.top.accuracy" : "rankings.detail.top.speed"), color: P.MutedForeground);
        topOrder.VerticalAlignment = VerticalAlignment.Bottom;
        top.Children.Add(Cells(6, (Auto, topTitle), (Star(), topOrder),
            (Auto, T(L("rankings.detail.top.shown", shown.Count, ranking.Ranked.Count), 12, color: P.MutedForeground))));
        TextBlock Heading(string text, TextAlignment align = TextAlignment.Left) => T(text, 12, color: P.MutedForeground, maxLines: 1, align: align);
        var headings = Cells(12,
            (Px(36), Heading(L("rankings.detail.columns.rank"))),
            (Px(130), Heading(L("records.columns.duration"))),
            (Px(70), Heading(L("records.columns.accuracy"))),
            (Px(46), Heading(L("records.columns.mistakes"))),
            (Star(), Heading(L("rankings.detail.columns.device"))),
            (Px(120), Heading(L("rankings.detail.columns.date"), TextAlignment.Right)));
        headings.Padding = new Thickness(8);
        top.Children.Add(Column(0, headings, Hairline()));
        var now = DateTimeOffset.UtcNow;
        for (var i = 0; i < shown.Count; i++)
        {
            var record = shown[i];
            var recent = Dates.Parse(record.Date) is { } recordDate && (now - recordDate).TotalDays < Rankings.ImprovedDays;
            var row = Cells(12,
                (Px(36), RankBadge(i + 1)),
                (Px(130), ValueWithUnit(Format.Seconds(record.Time), L("format.secondsUnit"), 14, FontWeights.SemiBold)),
                (Px(70), T(Records.FormatAccuracy(record.Accuracy), tabular: true, maxLines: 1)),
                (Px(46), T(record.Mistakes?.ToString(CultureInfo.InvariantCulture) ?? "—", color: P.MutedForeground, maxLines: 1)),
                (Star(), T(Format.Device(record.Device), maxLines: 1)),
                (Px(120), T(Format.Date(record.Date), 13, recent ? FontWeights.Medium : FontWeights.Normal, recent ? P.Success : P.MutedForeground, 1,
                    align: TextAlignment.Right)));
            row.Height = 44;
            row.Padding = new Thickness(8, 0, 8, 0);
            row.Background = Brush(i == 0 ? Palette.WithAlpha(P.AmberSoft, 0.4) : Microsoft.UI.Colors.Transparent);
            top.Children.Add(row);
        }
        if (ranking.Ranked.Count > Rankings.Top)
        {
            var toggle = Button(showAll ? L("rankings.detail.top.showTop", Rankings.Top) : L("rankings.detail.top.showAll", ranking.Ranked.Count), () =>
            {
                showAll = !showAll;
                Refresh();
            }, Variant.Ghost, ButtonSize.Small);
            toggle.HorizontalAlignment = HorizontalAlignment.Left;
            top.Children.Add(toggle);
        }
        column.Children.Add(top);
        return Card(column, 24);
    }

    private static Border Figure(string term, string value, string unit, string note, bool highlight = false)
    {
        var heading = Row(4, highlight ? Icon(Icons.Trophy, 12, P.Amber) : null, T(term, 12, color: P.MutedForeground, maxLines: 1));
        var figure = new Border
        {
            Child = Column(4, heading, ValueWithUnit(value, unit, 24), T(note, 12, color: P.MutedForeground, maxLines: 1)),
            Background = Brush(highlight ? Palette.WithAlpha(P.AmberSoft, 0.35) : P.Card), BorderBrush = Brush(highlight ? P.AmberBorder : P.Border),
            BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(14), Padding = new Thickness(16), VerticalAlignment = VerticalAlignment.Stretch,
        };
        return figure;
    }
}
