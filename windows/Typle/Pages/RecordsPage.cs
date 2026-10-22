using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>Every record, newest first and grouped by day, filtered by list and device (src/app/(workspace)/records/page.tsx).</summary>
public sealed class RecordsPage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly StackPanel content;
    private string? listFilter;
    private string? deviceFilter;
    private (string Text, bool Failed)? message;

    public RecordsPage(AppModel app, Shell shell) : base(app, shell)
    {
        (scroll, content) = PageScroll();
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        content.Children.Clear();
        var all = Records.Rows(App.Lists);
        var rows = Records.Filter(all, listFilter, deviceFilter);
        var options = Records.DeviceOptions(all.Where(row => listFilter is null || row.List.Id == listFilter).Select(row => row.Record));
        string DeviceName(string value) =>
            value == Records.NoDevice ? L("format.noDeviceRecorded") : Format.Device(options.FirstOrDefault(option => option.Value == value)?.Device);

        content.Children.Add(PageHeader(L("records.title"), L("records.intro"), Shell.StorageBadge(App)));
        if (message is { } shown) content.Children.Add(StatusMessage(shown.Text, shown.Failed));
        if (all.Count == 0)
        {
            content.Children.Add(Empty(L("records.empty.title"), L("records.empty.description")));
            return;
        }
        List<(string?, string)> listOptions =
        [
            (null, L("records.filter.allLists")),
            .. App.Lists.Where(list => list.Records.Count > 0).Select(list => ((string?)list.Id, L("records.filterMenu.option", list.Name, list.Records.Count))),
        ];
        List<(string?, string)> deviceChoices =
        [
            (null, L("records.filter.allDevices")),
            .. options.Select(option => ((string?)option.Value, L("records.filterMenu.option", DeviceName(option.Value), option.Count))),
        ];
        var filters = Row(8,
            FilterMenu(L("records.filter.list"), listOptions, listFilter, value =>
            {
                listFilter = value;
                Refresh();
            }, listFilter is null ? L("records.filterMenu.all") : App.Lists.FirstOrDefault(list => list.Id == listFilter)?.Name),
            FilterMenu(L("records.filter.device"), deviceChoices, deviceFilter, value =>
            {
                deviceFilter = value;
                Refresh();
            }, deviceFilter is null ? L("records.filterMenu.all") : DeviceName(deviceFilter)),
            listFilter is not null || deviceFilter is not null
                ? Button(L("records.filter.clear"), () =>
                {
                    listFilter = null;
                    deviceFilter = null;
                    Refresh();
                }, Variant.Ghost)
                : null);
        content.Children.Add(Cells(8, (Star(), filters),
            (Auto, T(rows.Count == all.Count ? L("records.filter.count", all.Count) : L("records.filter.filteredCount", rows.Count, all.Count),
                color: P.MutedForeground, maxLines: 1))));
        if (rows.Count == 0)
        {
            content.Children.Add(Empty(L("records.filteredEmpty.title"), L("records.filteredEmpty.description")));
            return;
        }
        var days = Column(12, Columns());
        foreach (var group in Records.GroupByDay(rows))
        {
            var heading = Cells(8, (Star(), T(DayHeading(group.Day), 14, FontWeights.Bold)),
                (Auto, T(L("records.day.summary", group.Rows.Count, Format.Total(group.Seconds)), 12, color: P.MutedForeground)));
            heading.Margin = new Thickness(4, 8, 4, 0);
            var list = Column(0);
            for (var i = 0; i < group.Rows.Count; i++)
            {
                if (i > 0) list.Children.Add(Hairline());
                list.Children.Add(RecordRow(group.Rows[i]));
            }
            days.Children.Add(Column(10, heading, Card(list)));
        }
        content.Children.Add(days);
        content.Children.Add(T(L("records.note"), 12, color: P.MutedForeground));
    }

    /// <summary>「今日・10月20日（火）」 for today and yesterday, the date alone for other days.</summary>
    private static string DayHeading(DateTimeOffset day) => Dashboard.KindOfDay(day) switch
    {
        DayKind.Today or DayKind.Yesterday => L("records.day.heading", Format.Day(day), Format.DateWithWeekday(day)),
        _ => Format.DateWithWeekday(day),
    };

    private static Grid Columns()
    {
        TextBlock End(string text) => T(text, 12, color: P.MutedForeground, maxLines: 1, align: TextAlignment.Right);
        var row = Cells(16,
            (Px(52), T(L("records.columns.time"), 12, color: P.MutedForeground, maxLines: 1)),
            (Star(), T(L("records.columns.listDevice"), 12, color: P.MutedForeground, maxLines: 1)),
            (Px(90), End(L("records.columns.duration"))),
            (Px(70), End(L("records.columns.accuracy"))),
            (Px(84), End(L("records.columns.perWord"))),
            (Px(44), End(L("records.columns.mistakes"))),
            (Px(36), null));
        row.Padding = new Thickness(20, 0, 20, 0);
        return row;
    }

    private Grid Empty(string title, string description)
    {
        var practise = Button(L("records.empty.practice"), () => App.Navigate(Page.Practice), icon: Icons.Keyboard);
        var column = Column(12, IconTile(Icons.History), T(title, 16, FontWeights.SemiBold, align: TextAlignment.Center),
            T(description, color: P.MutedForeground, align: TextAlignment.Center), practise);
        foreach (var child in column.Children) ((FrameworkElement)child).HorizontalAlignment = HorizontalAlignment.Center;
        return Dashed(column);
    }

    /// <summary>One record as a row of the table (src/components/Records/RecordRow.tsx).</summary>
    private Grid RecordRow(RecordRow row)
    {
        var record = row.Record;
        var name = T(row.List.Name, 16, maxLines: 1);
        var title = Row(8, name, row.Best ? Badge(L("records.row.best"), Icons.Trophy, P.AmberSoft, P.Amber) : null);
        var detail = string.Join(L("wordLists.row.separator"),
            new[] { record.WordCount is { } count ? L("records.row.words", count) : null, Format.Device(record.Device) }.OfType<string>());
        var duration = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        foreach (var part in Format.DurationParts(record.Time))
        {
            var number = T(part.Value, 15, FontWeights.Bold, tabular: true, maxLines: 1);
            number.VerticalAlignment = VerticalAlignment.Bottom;
            var unit = T(part.Unit, 11, color: P.MutedForeground, maxLines: 1);
            unit.VerticalAlignment = VerticalAlignment.Bottom;
            unit.Margin = new Thickness(1, 0, 1, 2);
            duration.Children.Add(number);
            duration.Children.Add(unit);
        }
        var accuracy = record.Accuracy;
        UIElement perWord = Records.SecondsPerWord(record) is { } seconds
            ? ValueWithUnit(Format.Seconds(seconds), L("records.row.perWordUnit"), 14, FontWeights.Normal)
            : T("—", align: TextAlignment.Right);
        ((FrameworkElement)perWord).HorizontalAlignment = HorizontalAlignment.Right;
        var delete = Button(null, () => _ = Delete(row), Variant.Ghost, ButtonSize.Icon, Icons.Delete,
            L("records.row.deleteLabel", row.List.Name, Format.Date(record.Date)));
        var grid = Cells(16,
            (Px(52), T(Format.Time(record.Date), color: P.MutedForeground, tabular: true, maxLines: 1)),
            (Star(), Column(2, title, T(detail, 13, color: P.MutedForeground, maxLines: 1))),
            (Px(90), duration),
            (Px(70), T(accuracy is { } value ? Format.Number(value) + "%" : "—", color: accuracy < Dashboard.LowAccuracy ? P.Destructive : P.Foreground,
                tabular: true, align: TextAlignment.Right, maxLines: 1)),
            (Px(84), perWord),
            (Px(44), T(record.Mistakes?.ToString(CultureInfo.InvariantCulture) ?? "—", tabular: true, align: TextAlignment.Right, maxLines: 1)),
            (Px(36), delete));
        grid.MinHeight = 68;
        grid.Padding = new Thickness(20, 0, 20, 0);
        return grid;
    }

    private async Task Delete(RecordRow row)
    {
        var confirmed = await Confirm(Shell.XamlRoot, L("records.delete.title"),
            L("records.delete.description", row.List.Name) + "\n" + Format.Date(row.Record.Date) + " · " + Format.Duration(row.Record.Time),
            L("common.delete.confirm"));
        if (!confirmed) return;
        try
        {
            await App.DeleteRecordAsync(row.Record, row.List.Id);
            message = (L("records.delete.done", row.List.Name, Format.Date(row.Record.Date)), false);
        }
        catch (Exception error)
        {
            message = (Loc.ErrorText(error), true);
        }
        Refresh();
    }
}
