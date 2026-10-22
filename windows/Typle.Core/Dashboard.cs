using System.Globalization;

namespace Typle.Core;

public sealed record Change(double Recent, int RecentCount, double Previous, int PreviousCount);

public sealed record AccuracySummary(double Recent, int RecentCount, Change? Change);

public sealed record DashboardSummary(
    DateTimeOffset WeekStart,
    int WeekCount,
    int PreviousWeekCount,
    double WeekSeconds,
    double PreviousWeekSeconds,
    int Streak,
    bool PracticedToday,
    AccuracySummary? Accuracy);

public abstract record NextListReason
{
    public sealed record New : NextListReason;

    public sealed record Stale(int Days) : NextListReason;

    public sealed record LowAccuracy(double Accuracy, int Count) : NextListReason;
}

public sealed record NextList(WordList List, DateTimeOffset? LastPracticed, NextListReason Reason)
{
    public string Id => List.Id;
}

public sealed record TrendPoint(string Date, double Value);

public sealed record Trend(IReadOnlyList<TrendPoint> Points, Change? Change);

public sealed record ListTrend(WordList List, int Count, DateTimeOffset LastPracticed, Trend Speed, Trend Accuracy, StoredRecord Best)
{
    public string Id => List.Id;
}

public sealed record Scale(double Low, double High, IReadOnlyList<double> Ticks, int Decimals)
{
    public bool Equals(Scale? other) =>
        other is not null && Low == other.Low && High == other.High && Decimals == other.Decimals && Ticks.SequenceEqual(other.Ticks);

    public override int GetHashCode() => HashCode.Combine(Low, High, Decimals);
}

public enum DayKind { Today, Yesterday, ThisYear, OtherYear }

// src/core/dashboard.ts. Records store UTC timestamps; every day and week boundary here follows the viewer's local time
// zone, which tests pin by passing their own.
public static class Dashboard
{
    public const int StaleDays = 3;
    public const double LowAccuracy = 90;
    private const int TrendPoints = 20;

    public static DateTimeOffset StartOfWeek(DateTimeOffset instant, TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        var day = Dates.LocalDate(instant, zone);
        var monday = day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
        return Dates.StartOfDay(monday, zone);
    }

    private static List<StoredRecord> NewestFirst(IEnumerable<StoredRecord> records) =>
        records.StableSorted((a, b) => Dates.TimeOf(a.Date) > Dates.TimeOf(b.Date));

    private static double Average(IEnumerable<double> values)
    {
        var list = values.ToList();
        return list.Sum() / list.Count;
    }

    private static Change? MakeChange(IReadOnlyList<double> newest, int recentCount, int previousCount)
    {
        if (recentCount <= 0 || previousCount <= 0) return null;
        return new Change(
            Average(newest.Take(recentCount)), recentCount, Average(newest.Skip(recentCount).Take(previousCount)), previousCount);
    }

    public static DashboardSummary Summarize(IReadOnlyList<WordList> lists, DateTimeOffset? now = null, TimeZoneInfo? zone = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        zone ??= TimeZoneInfo.Local;
        var records = lists.SelectMany(list => list.Records).ToList();
        var weekStart = StartOfWeek(at, zone);
        List<StoredRecord> Between(DateTimeOffset from, DateTimeOffset to) => records.Where(record =>
            Dates.TimeOf(record.Date) >= from.ToUnixTimeMilliseconds() && Dates.TimeOf(record.Date) <= to.ToUnixTimeMilliseconds()).ToList();
        var week = Between(weekStart, Dates.PlusDays(weekStart, 7, zone).AddMilliseconds(-1));
        // Compare against the same point of last week so Monday is not measured against a whole week.
        var previousWeek = Between(Dates.PlusDays(weekStart, -7, zone), Dates.PlusDays(at, -7, zone));
        var days = records.Select(record => Dates.StartOfDay(Dates.FromMillis(Dates.TimeOf(record.Date)), zone)).ToHashSet();
        var today = Dates.StartOfDay(at, zone);
        var practicedToday = days.Contains(today);
        var streak = 0;
        var day = practicedToday ? today : Dates.PlusDays(today, -1, zone);
        while (days.Contains(day))
        {
            streak++;
            day = Dates.PlusDays(day, -1, zone);
        }
        var newest = NewestFirst(records).Where(record => record.Accuracy is not null).Select(record => record.Accuracy!.Value).ToList();
        var recentCount = Math.Min(10, newest.Count);
        return new DashboardSummary(
            weekStart, week.Count, previousWeek.Count, week.Sum(record => record.Time), previousWeek.Sum(record => record.Time),
            streak, practicedToday,
            recentCount > 0
                ? new AccuracySummary(Average(newest.Take(recentCount)), recentCount,
                    MakeChange(newest, recentCount, Math.Min(10, newest.Count - recentCount)))
                : null);
    }

    /// <summary>
    /// Lists to practise next: unused ones, ones not practised for days, and ones with low recent accuracy, taken in
    /// turn.
    /// </summary>
    public static IReadOnlyList<NextList> NextLists(
        IReadOnlyList<WordList> lists, DateTimeOffset? now = null, int limit = 3, TimeZoneInfo? zone = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        zone ??= TimeZoneInfo.Local;
        var unused = new List<NextList>();
        var stale = new List<NextList>();
        var weak = new List<NextList>();
        foreach (var list in lists)
        {
            var records = NewestFirst(list.Records);
            if (records.Count == 0)
            {
                unused.Add(new NextList(list, null, new NextListReason.New()));
                continue;
            }
            var lastPracticed = Dates.FromMillis(Dates.TimeOf(records[0].Date));
            var days = Dates.DaysBetween(lastPracticed, at, zone);
            if (days >= StaleDays)
            {
                stale.Add(new NextList(list, lastPracticed, new NextListReason.Stale(days)));
                continue;
            }
            var recent = records.Where(record => record.Accuracy is not null).Select(record => record.Accuracy!.Value).Take(5).ToList();
            if (recent.Count > 0 && Average(recent) < LowAccuracy)
            {
                weak.Add(new NextList(list, lastPracticed, new NextListReason.LowAccuracy(Average(recent), recent.Count)));
            }
        }
        stale = stale.StableSorted((a, b) => ((NextListReason.Stale)a.Reason).Days > ((NextListReason.Stale)b.Reason).Days);
        weak = weak.StableSorted((a, b) =>
            ((NextListReason.LowAccuracy)a.Reason).Accuracy < ((NextListReason.LowAccuracy)b.Reason).Accuracy);
        // Take from each reason in turn so a pile of unused lists never hides neglected or weak ones.
        List<List<NextList>> groups = [unused, stale, weak];
        var picked = new List<NextList>();
        for (var index = 0; picked.Count < limit && groups.Any(group => index < group.Count); index++)
        {
            foreach (var group in groups)
            {
                if (index < group.Count && picked.Count < limit) picked.Add(group[index]);
            }
        }
        return picked;
    }

    private static Trend MakeTrend(IReadOnlyList<TrendPoint> points)
    {
        var newest = points.Select(point => point.Value).Reverse().ToList();
        var recentCount = Math.Min(5, (newest.Count + 1) / 2);
        return new Trend(points.TakeLast(TrendPoints).ToList(), MakeChange(newest, recentCount, Math.Min(5, newest.Count - recentCount)));
    }

    public static IReadOnlyList<ListTrend> ListTrends(IReadOnlyList<WordList> lists) =>
        lists.Where(list => list.Records.Count > 0).Select(list =>
        {
            var records = NewestFirst(list.Records);
            records.Reverse();
            return new ListTrend(
                list, records.Count, Dates.FromMillis(Dates.TimeOf(records[^1].Date)),
                // Seconds per word stays comparable after words are added to or removed from a list.
                MakeTrend(records.Where(record => record.WordCount is not null)
                    .Select(record => new TrendPoint(record.Date, record.Time / record.WordCount!.Value)).ToList()),
                MakeTrend(records.Where(record => record.Accuracy is not null)
                    .Select(record => new TrendPoint(record.Date, record.Accuracy!.Value)).ToList()),
                Records.ListBest(list)!);
        }).StableSorted((a, b) => a.LastPracticed > b.LastPracticed);

    private static double Tidy(double value) => Text.JsRound(value * 1e6) / 1e6;

    private static double NiceStep(double value)
    {
        var power = Math.Pow(10, Math.Floor(Math.Log10(value)));
        var fraction = value / power;
        return Tidy((fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power);
    }

    private static int DecimalsOf(double step)
    {
        var text = ((decimal)step).ToString(CultureInfo.InvariantCulture);
        var point = text.IndexOf('.');
        return point < 0 ? 0 : text.TrimEnd('0').Length - point - 1;
    }

    public static Scale SpeedScale(IReadOnlyList<double> values)
    {
        var low0 = values.Count > 0 ? values.Min() : 0;
        var high = values.Count > 0 ? values.Max() : 0;
        var step = NiceStep(Math.Max(Math.Max(high - low0, high * 0.1), 0.01) / 2);
        var low = Tidy(Math.Floor(low0 / step) * step);
        while (Tidy(low + step * 2) < high)
        {
            step = NiceStep(step * 1.001);
            low = Tidy(Math.Floor(low0 / step) * step);
        }
        return new Scale(low, Tidy(low + step * 2), [Tidy(low + step * 2), Tidy(low + step), low], DecimalsOf(step));
    }

    public static Scale AccuracyScale(IReadOnlyList<double> values)
    {
        var low = Math.Max(0, Math.Min(80, Math.Floor((values.Count > 0 ? values.Min() : 0) / 10) * 10));
        return new Scale(low, 100, [100, (low + 100) / 2, low], 0);
    }

    /// <summary>A total practice time in whole units, such as 18 minutes 32 seconds.</summary>
    public static IReadOnlyList<TimePart> DurationParts(double seconds)
    {
        var total = (int)Text.JsRound(seconds);
        string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
        if (total < 60) return [new TimePart(Number(total), TimeUnit.Seconds)];
        if (total < 3600) return [new TimePart(Number(total / 60), TimeUnit.Minutes), new TimePart(Number(total % 60), TimeUnit.Seconds)];
        return [new TimePart(Number(total / 3600), TimeUnit.Hours), new TimePart(Number(total % 3600 / 60), TimeUnit.Minutes)];
    }

    /// <summary>
    /// How a day reads next to today: today and yesterday by name, other days by date, with the year only when it
    /// differs.
    /// </summary>
    public static DayKind KindOfDay(DateTimeOffset instant, DateTimeOffset? now = null, TimeZoneInfo? zone = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        zone ??= TimeZoneInfo.Local;
        var days = Dates.DaysBetween(instant, at, zone);
        if (days == 0) return DayKind.Today;
        if (days == 1) return DayKind.Yesterday;
        return Dates.LocalDate(instant, zone).Year == Dates.LocalDate(at, zone).Year ? DayKind.ThisYear : DayKind.OtherYear;
    }
}
