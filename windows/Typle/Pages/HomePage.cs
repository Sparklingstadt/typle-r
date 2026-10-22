using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// The home dashboard (src/components/Dashboard/Dashboard.tsx): this week's summary, lists to practise next and each
/// list's trend. With no records yet it shows how to start instead.
/// </summary>
public sealed class HomePage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly StackPanel content;

    public HomePage(AppModel app, Shell shell) : base(app, shell)
    {
        (scroll, content) = PageScroll(1180);
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        content.Children.Clear();
        var now = DateTimeOffset.UtcNow;
        var inner = Column(44);
        if (App.Lists.Any(list => list.Records.Count > 0)) Dashboard(inner, now);
        else Welcome(inner);
        var card = Card(inner);
        card.Padding = new Thickness(48, 44, 48, 48);
        content.Children.Add(card);
    }

    private void Welcome(StackPanel inner) =>
        inner.Children.Add(Column(16, T(L("home.welcomeTitle"), 30), T(L("home.welcomeDescription"), color: P.MutedForeground), StartButtons()));

    private StackPanel StartButtons() => Row(12,
        Button(L("dashboard.practice"), () => App.Navigate(Page.Practice), size: ButtonSize.Large, icon: Icons.Keyboard),
        Button(L("dashboard.create"), () => App.Navigate(Page.CreateList), Variant.Outline, ButtonSize.Large, Icons.Add));

    private void Dashboard(StackPanel inner, DateTimeOffset now)
    {
        var summary = Core.Dashboard.Summarize(App.Lists, now);
        inner.Children.Add(Column(16,
            Column(8, T(L("dashboard.title"), 30),
                T(App.Storage == StorageKind.Account ? L("dashboard.sourceAccount") : L("dashboard.sourceLocal"), color: P.MutedForeground)),
            StartButtons()));

        var weekEnd = Dates.PlusDays(summary.WeekStart, 6, TimeZoneInfo.Local);
        var accuracy = summary.Accuracy;
        inner.Children.Add(Section(L("dashboard.week.title"),
            L("dashboard.week.description", Format.DateWithWeekday(summary.WeekStart), Format.DateWithWeekday(weekEnd)),
            Tiles(2, 16, [
                Stat(L("dashboard.week.count"), [new(summary.WeekCount.ToString(CultureInfo.InvariantCulture), L("dashboard.week.countUnit"))],
                    WeekDelta(summary.WeekCount, summary.PreviousWeekCount, n => L("dashboard.week.times", n))),
                Stat(L("dashboard.week.streak"), [new(summary.Streak.ToString(CultureInfo.InvariantCulture), L("dashboard.week.streakUnit"))],
                    summary.PracticedToday
                        ? new Delta(Icons.Check, true, L("dashboard.week.practisedToday"))
                        : new Delta(Icons.Keyboard, false, L("dashboard.week.streakNext", summary.Streak + 1))),
                Stat(L("dashboard.week.accuracy", accuracy?.RecentCount ?? 10),
                    accuracy is not null ? [new(Format.Fixed(accuracy.Recent, 1), "%")] : [new("—", "")],
                    accuracy?.Change is { } change
                        ? ChangeDelta(change, false, PointDifference, namedRecent: false)
                        : new Delta(Icons.Dash, false, L(accuracy is null ? "dashboard.week.noAccuracy" : "dashboard.week.noComparison"))),
                Stat(L("dashboard.week.time"), Format.TotalParts(summary.WeekSeconds),
                    WeekDelta((int)Math.Round(summary.WeekSeconds), (int)Math.Round(summary.PreviousWeekSeconds), n => Format.Total(n))),
            ])));

        var items = Core.Dashboard.NextLists(App.Lists, now);
        UIElement next;
        if (items.Count == 0)
        {
            next = Outlined(T(L("dashboard.next.allPractised")), 16);
        }
        else
        {
            var rows = Column(0);
            for (var i = 0; i < items.Count; i++)
            {
                if (i > 0) rows.Children.Add(Hairline());
                rows.Children.Add(NextRow(items[i], now));
            }
            next = Outlined(rows);
        }
        inner.Children.Add(Section(L("dashboard.next.title"),
            L("dashboard.next.description", Core.Dashboard.StaleDays, (int)Core.Dashboard.LowAccuracy), next));

        inner.Children.Add(Section(L("dashboard.trends.title"), L("dashboard.trends.description"),
            Tiles(2, 16, Core.Dashboard.ListTrends(App.Lists).Select(trend => TrendCard(trend, now)).ToList())));
    }

    private static StackPanel Section(string title, string description, UIElement body) =>
        Column(16, Column(4, T(title, 20), T(description, color: P.MutedForeground)), body);

    private static Border Stat(string label, IReadOnlyList<NumberWithUnit> parts, Delta delta)
    {
        var values = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 };
        foreach (var part in parts)
        {
            var number = T(part.Value, 26, FontWeights.SemiBold, tabular: true, maxLines: 1);
            number.VerticalAlignment = VerticalAlignment.Bottom;
            var unit = T(part.Unit, color: P.MutedForeground, maxLines: 1);
            unit.VerticalAlignment = VerticalAlignment.Bottom;
            unit.Margin = new Thickness(0, 0, 4, 4);
            values.Children.Add(number);
            values.Children.Add(unit);
        }
        return Outlined(Column(8, T(label, 13, color: P.MutedForeground), values, DeltaText(delta)), 16);
    }

    private UIElement NextRow(NextList item, DateTimeOffset now)
    {
        var (icon, badge) = item.Reason switch
        {
            NextListReason.Stale stale => (Icons.Clock, L("dashboard.next.stale", stale.Days)),
            NextListReason.LowAccuracy low => (Icons.Target, L("dashboard.next.lowAccuracy", low.Count, Format.Fixed(low.Accuracy, 1))),
            _ => (Icons.Sparkle, L("dashboard.next.new")),
        };
        var last = item.LastPracticed is { } lastPracticed ? L("dashboard.next.lastPracticed", Format.Day(lastPracticed, now)) : L("dashboard.next.noRecords");
        var row = Cells(16,
            (Star(), Column(2, T(item.List.Name, 16, FontWeights.Medium), T(L("dashboard.next.words", item.List.Words.Count) + " · " + last, 13,
                color: P.MutedForeground))),
            (Auto, Pill(Row(6, Icon(icon, 11), T(badge, 12, FontWeights.Medium, maxLines: 1)), 24)),
            (Auto, Button(L("dashboard.next.practice"), () => App.Practise(item.List.Id), Variant.Outline, ButtonSize.Large)));
        row.Padding = new Thickness(20, 16, 20, 16);
        return row;
    }

    private static Delta WeekDelta(int current, int previous, Func<int, string> format)
    {
        if (current == previous) return new Delta(Icons.Dash, false, L("dashboard.week.sameAsLastWeek"));
        var more = current > previous;
        return new Delta(more ? Icons.TrendUp : Icons.TrendDown, more,
            L(more ? "dashboard.week.moreThanLastWeek" : "dashboard.week.lessThanLastWeek", format(Math.Abs(current - previous))));
    }

    public sealed record Delta(string Icon, bool Good, string Text);

    public static StackPanel DeltaText(Delta delta)
    {
        var color = delta.Good ? P.Success : P.MutedForeground;
        var icon = Icon(delta.Icon, 12, color);
        icon.VerticalAlignment = VerticalAlignment.Top;
        icon.Margin = new Thickness(0, 2, 0, 0);
        var text = T(delta.Text, 12, color: color);
        text.VerticalAlignment = VerticalAlignment.Top;
        return Row(4, icon, text);
    }

    public static string? SecondsDifference(double difference)
    {
        var value = Format.Fixed(Math.Abs(difference), 2);
        return value == "0.00" ? null : L(difference > 0 ? "dashboard.change.slower" : "dashboard.change.faster", value);
    }

    public static string? PointDifference(double difference)
    {
        var value = Format.Fixed(Math.Abs(difference), 1);
        return value == "0.0" ? null : L(difference > 0 ? "dashboard.change.pointsUp" : "dashboard.change.pointsDown", value);
    }

    /// <summary>「直近5回の平均は、その前の5回より 0.12 秒速い」, or without the recent window when the label already names it.</summary>
    public static Delta ChangeDelta(Change change, bool lowerIsBetter, Func<double, string?> describe, bool namedRecent = true)
    {
        var recent = !namedRecent ? "" : change.RecentCount == 1 ? L("dashboard.change.latest") : L("dashboard.change.recentAverage", change.RecentCount);
        var previous = change.PreviousCount == 1 ? L("dashboard.change.previousLatest") : L("dashboard.change.previousAverage", change.PreviousCount);
        var difference = change.Recent - change.Previous;
        if (describe(difference) is not { } text) return new Delta(Icons.Dash, false, Capitalized(L("dashboard.change.same", recent, previous)));
        return new Delta(difference > 0 ? Icons.TrendUp : Icons.TrendDown, difference > 0 != lowerIsBetter,
            Capitalized(L("dashboard.change.different", recent, previous, text)));
    }

    /// <summary>English sentences that start with a part left out still start with a capital.</summary>
    private static string Capitalized(string text) => text.Length == 0 ? text : char.ToUpper(text[0], CultureInfo.InvariantCulture) + text[1..];

    /// <summary>One list's speed and accuracy over its latest runs.</summary>
    private Border TrendCard(ListTrend trend, DateTimeOffset now)
    {
        var body = Column(20);
        var heading = T(trend.List.Name, 16, FontWeights.Medium);
        heading.VerticalAlignment = VerticalAlignment.Bottom;
        var summary = T(L("dashboard.trends.summary", trend.Count, Format.Day(trend.LastPracticed, now)), 13, color: P.MutedForeground, maxLines: 1);
        summary.VerticalAlignment = VerticalAlignment.Bottom;
        body.Children.Add(Cells(8, (Star(), heading), (Auto, summary)));
        if (trend.Count < 2)
        {
            body.Children.Add(T(L("dashboard.trends.needTwo"), color: P.MutedForeground));
            var practise = Button(L("dashboard.trends.practice"), () => App.Practise(trend.List.Id), Variant.Outline, icon: Icons.Keyboard);
            practise.HorizontalAlignment = HorizontalAlignment.Left;
            body.Children.Add(practise);
        }
        else
        {
            body.Children.Add(Metric(L("dashboard.trends.speed"), trend.Speed,
                trend.Speed.Points.Count > 1 ? Core.Dashboard.SpeedScale(trend.Speed.Points.Select(point => point.Value).ToList()) : null,
                value => L("dashboard.trends.seconds", Format.Fixed(value, 2)), true, SecondsDifference));
            body.Children.Add(Metric(L("dashboard.trends.accuracy"), trend.Accuracy,
                trend.Accuracy.Points.Count > 1 ? Core.Dashboard.AccuracyScale(trend.Accuracy.Points.Select(point => point.Value).ToList()) : null,
                value => Format.Fixed(value, 1) + "%", false, PointDifference));
            var best = trend.Best;
            var line = Column(0, Hairline(), T(L("dashboard.trends.best",
                best.Accuracy is { } accuracy ? Format.Number(accuracy, 2) + "%" : L("dashboard.trends.notRecorded"),
                Format.Seconds(best.Time), Format.Day(Dates.Parse(best.Date) ?? now, now)), 13, color: P.MutedForeground));
            ((FrameworkElement)line.Children[1]).Margin = new Thickness(0, 12, 0, 0);
            body.Children.Add(line);
        }
        return Outlined(body, 20);
    }

    private static StackPanel Metric(string title, Trend trend, Scale? scale, Func<double, string> format, bool lowerIsBetter,
        Func<double, string?> describe)
    {
        var heading = T(title, 13, color: P.MutedForeground);
        heading.VerticalAlignment = VerticalAlignment.Bottom;
        UIElement? latest = null;
        if (trend.Points.Count > 0)
        {
            var label = T(L("dashboard.trends.latest"), 12, color: P.MutedForeground);
            label.VerticalAlignment = VerticalAlignment.Bottom;
            label.Margin = new Thickness(0, 0, 0, 2);
            var value = T(format(trend.Points[^1].Value), 16, FontWeights.SemiBold);
            value.VerticalAlignment = VerticalAlignment.Bottom;
            latest = Row(4, label, value);
        }
        return Column(8,
            Cells(8, (Star(), heading), (Auto, latest)),
            trend.Change is { } change ? DeltaText(ChangeDelta(change, lowerIsBetter, describe)) : null,
            scale is not null ? TrendChart.Create(trend.Points, scale) : T(L("dashboard.trends.noChart"), color: P.MutedForeground));
    }
}
