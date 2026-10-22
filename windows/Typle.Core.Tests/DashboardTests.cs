namespace Typle.Core.Tests;

// tests/dashboard.test.cjs, with the same Tokyo calendar.
public class DashboardTests
{
    private static readonly TimeZoneInfo Tokyo = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    // Sunday 2026-09-27 21:00 JST
    private static readonly DateTimeOffset Now = Dates.Parse("2026-09-27T12:00:00Z")!.Value;
    private static readonly Word[] Words = [new("a", "a"), new("b", "b")];

    private static StoredRecord Record(string date, double time = 10, int? wordCount = 2, double? accuracy = 100) =>
        Make.Record(time, date, date + time, accuracy, 0, wordCount: wordCount);

    private static WordList List(string id, IReadOnlyList<StoredRecord> records) => Make.List(id, id, Words, records, "2026-09-01");

    private static string Day(long seconds) => Dates.IsoString(DateTimeOffset.FromUnixTimeSeconds(seconds));

    [Fact]
    public void WeeksStartOnLocalMonday()
    {
        Assert.Equal("2026-09-20T15:00:00.000Z", Dates.IsoString(Dashboard.StartOfWeek(Now, Tokyo)));
        var summary = Dashboard.Summarize([List("a", [Record("2026-09-20T23:30:00Z"), Record("2026-09-20T14:30:00Z")])], Now, Tokyo);
        Assert.Equal(1, summary.WeekCount);
    }

    [Fact]
    public void SummaryComparesWithLastWeekAndCountsStreak()
    {
        var summary = Dashboard.Summarize([List("a", [
            Record("2026-09-27T01:00:00Z", 30), Record("2026-09-26T01:00:00Z", 30), Record("2026-09-25T01:00:00Z", 30),
            Record("2026-09-23T01:00:00Z", 30),
            Record("2026-09-14T01:00:00Z", 20), Record("2026-09-20T13:00:00Z", 20),
        ])], Now, Tokyo);
        Assert.Equal(4, summary.WeekCount);
        Assert.Equal(120, summary.WeekSeconds);
        Assert.Equal(1, summary.PreviousWeekCount);
        Assert.Equal(20, summary.PreviousWeekSeconds);
        Assert.Equal(3, summary.Streak);
        Assert.True(summary.PracticedToday);
    }

    [Fact]
    public void StreakContinuesFromYesterday()
    {
        var summary = Dashboard.Summarize([List("a", [Record("2026-09-26T01:00:00Z"), Record("2026-09-25T01:00:00Z")])], Now, Tokyo);
        Assert.False(summary.PracticedToday);
        Assert.Equal(2, summary.Streak);
        Assert.Equal(0, Dashboard.Summarize([List("a", [Record("2026-09-24T01:00:00Z")])], Now, Tokyo).Streak);
    }

    [Fact]
    public void AccuracyAveragesLatestTen()
    {
        var records = Enumerable.Range(0, 14).Select(i => Record(Day(1_788_998_400L + i * 86400L), 10, accuracy: i < 4 ? 80 : 90))
            .Append(Record("2026-09-26T00:00:00Z", 10, accuracy: null)).ToList();
        var accuracy = Dashboard.Summarize([List("a", records)], Now, Tokyo).Accuracy!;
        Assert.Equal(10, accuracy.RecentCount);
        Assert.Equal(90, accuracy.Recent, 9);
        Assert.Equal(80, accuracy.Change!.Previous, 9);
        Assert.Equal(4, accuracy.Change!.PreviousCount);
        Assert.Null(Dashboard.Summarize([List("a", [Record("2026-09-26T00:00:00Z", 1, accuracy: null)])], Now, Tokyo).Accuracy);
    }

    [Fact]
    public void NextListsRotate()
    {
        WordList[] lists =
        [
            List("new-1", []), List("new-2", []),
            List("stale-4", [Record("2026-09-23T01:00:00Z")]), List("stale-9", [Record("2026-09-18T01:00:00Z")]),
            List("weak", [Record("2026-09-26T01:00:00Z", 10, accuracy: 70), Record("2026-09-10T01:00:00Z", 10, accuracy: 100)]),
            List("fine", [Record("2026-09-26T01:00:00Z", 10, accuracy: 95)]),
            List("legacy", [Make.Record(5, "2026/09/26 10:05")]),
        ];
        var picked = Dashboard.NextLists(lists, Now, zone: Tokyo);
        Assert.Equal(["new-1", "stale-9", "weak"], picked.Select(item => item.List.Id));
        Assert.Equal(new NextListReason.Stale(9), picked[1].Reason);
        Assert.Equal(new NextListReason.LowAccuracy(85, 2), picked[2].Reason);
        Assert.Equal(["new-1", "stale-9", "weak", "new-2", "stale-4"], Dashboard.NextLists(lists, Now, 6, Tokyo).Select(item => item.List.Id));
        Assert.Empty(Dashboard.NextLists([List("x", [Record("2026-09-25T14:59:00Z")])], Now, zone: Tokyo));
        Assert.Equal(new NextListReason.Stale(3), Dashboard.NextLists([List("x", [Record("2026-09-24T14:59:00Z")])], Now, zone: Tokyo)[0].Reason);
    }

    [Fact]
    public void TrendsUseSecondsPerWord()
    {
        var trends = Dashboard.ListTrends([
            List("older", [Record("2026-09-20T01:00:00Z")]),
            List("recent", [
                Record("2026-09-26T01:00:00Z", 8, 4, 95),
                Record("2026-09-24T01:00:00Z", 6, 2, 90),
                Make.Record(9, "2026-09-22T01:00:00Z"),
                Record("2026-09-25T01:00:00Z", 5, 2, 100),
            ]),
            List("empty", []),
        ]);
        Assert.Equal(["recent", "older"], trends.Select(trend => trend.List.Id));
        var recent = trends[0];
        Assert.Equal(4, recent.Count);
        Assert.Equal([3.0, 2.5, 2.0], recent.Speed.Points.Select(point => point.Value));
        Assert.Equal([90.0, 100, 95], recent.Accuracy.Points.Select(point => point.Value));
        Assert.Equal(new Change(2.25, 2, 3, 1), recent.Speed.Change);
        Assert.Equal(100, recent.Best.Accuracy);
        Assert.Null(trends[1].Speed.Change);
    }

    [Fact]
    public void TrendsKeepTwentyPoints()
    {
        var records = Enumerable.Range(0, 25).Select(i => Record(Day(1_788_220_800L + i * 86400L), i + 1, wordCount: 1)).ToList();
        var trend = Dashboard.ListTrends([List("a", records)])[0];
        Assert.Equal(20, trend.Speed.Points.Count);
        Assert.Equal(6, trend.Speed.Points[0].Value);
        Assert.Equal(new Change(23, 5, 18, 5), trend.Speed.Change);
    }

    [Fact]
    public void ChartScales()
    {
        Assert.Equal(new Scale(1, 2, [2, 1.5, 1], 1), Dashboard.SpeedScale([1.42, 1.92]));
        Assert.Equal(new Scale(2.5, 3.5, [3.5, 3, 2.5], 1), Dashboard.SpeedScale([2.6, 3.5]));
        Assert.Equal([0.34, 0.32, 0.3], Dashboard.SpeedScale([0.31, 0.33]).Ticks);
        Assert.Equal(2, Dashboard.SpeedScale([0.31, 0.33]).Decimals);
        Assert.Equal(0.01, Dashboard.SpeedScale([0, 0]).High);
        foreach (var values in new double[][] { [1.42, 1.92], [2.6, 3.5], [0.31, 0.33], [7, 70], [0, 0] })
        {
            var scale = Dashboard.SpeedScale(values);
            Assert.True(scale.Low <= values.Min() && scale.High >= values.Max(), string.Join(",", values));
        }
        Assert.Equal([100.0, 90, 80], Dashboard.AccuracyScale([92, 98]).Ticks);
        Assert.Equal([100.0, 75, 50], Dashboard.AccuracyScale([55, 98]).Ticks);
    }

    [Fact]
    public void DurationsAndDays()
    {
        Assert.Equal(["45"], Dashboard.DurationParts(45.4).Select(part => part.Value));
        Assert.Equal(["18", "32"], Dashboard.DurationParts(1112).Select(part => part.Value));
        Assert.Equal(["1", "2"], Dashboard.DurationParts(3725).Select(part => part.Value));
        Assert.Equal([TimeUnit.Hours, TimeUnit.Minutes], Dashboard.DurationParts(3725).Select(part => part.Unit));
        Assert.Equal(DayKind.Today, Dashboard.KindOfDay(Dates.Parse("2026-09-27T00:30:00Z")!.Value, Now, Tokyo));
        Assert.Equal(DayKind.Yesterday, Dashboard.KindOfDay(Dates.Parse("2026-09-26T14:30:00Z")!.Value, Now, Tokyo));
        Assert.Equal(DayKind.ThisYear, Dashboard.KindOfDay(Dates.Parse("2026-09-19T01:00:00Z")!.Value, Now, Tokyo));
        Assert.Equal(DayKind.OtherYear, Dashboard.KindOfDay(Dates.Parse("2025-12-31T01:00:00Z")!.Value, Now, Tokyo));
    }
}
