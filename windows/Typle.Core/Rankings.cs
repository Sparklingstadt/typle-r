using System.Globalization;

namespace Typle.Core;

public sealed record WordCountGroup(int? WordCount, int Count);

public sealed record ListRanking(
    WordList List,
    // The list's records on the chosen device, at any word count.
    IReadOnlyList<StoredRecord> Records,
    IReadOnlyList<StoredRecord> Ranked,
    // Records at another word count than the list has now; ranked only when asked for, or when nothing else exists.
    IReadOnlyList<StoredRecord> Others,
    IReadOnlyList<WordCountGroup> OtherCounts,
    bool Fallback,
    StoredRecord? Best,
    DateTimeOffset? LastPracticed,
    bool Improved)
{
    public string Id => List.Id;
}

public enum ListSort { Recent, Name, Count }

public sealed record RankingStats(int RecentCount, double? RecentTime, double? RecentAccuracy, IReadOnlyList<TrendPoint> Points);

// src/core/rankings.ts
public static class Rankings
{
    public const int Top = 5;

    /// <summary>A best set within this many days is marked as improved in the list.</summary>
    public const double ImprovedDays = 7;

    private const double DayMs = 24.0 * 60 * 60 * 1000;
    private const int TrendPoints = 20;
    private const int RecentRuns = 5;

    /// <summary>Uses the same comparison as ListBest, so a list's rank 1 here is the best shown on every other screen.</summary>
    public static ListRanking For(
        WordList list, string? device = null, RankOrder order = RankOrder.Accuracy, bool includeOthers = false, DateTimeOffset? now = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        var records = list.Records.Where(record => Records.MatchesDevice(record, device)).ToList();
        var others = records.Where(record => record.WordCount != list.Words.Count).ToList();
        var fallback = others.Count > 0 && others.Count == records.Count;
        var ranked = Records.Rank(includeOthers ? records : Records.Comparable(list, records), order);
        var counts = new List<WordCountGroup>();
        foreach (var record in others)
        {
            var index = counts.FindIndex(group => group.WordCount == record.WordCount);
            if (index >= 0) counts[index] = counts[index] with { Count = counts[index].Count + 1 };
            else counts.Add(new WordCountGroup(record.WordCount, 1));
        }
        var last = records.Count > 0 ? records.Max(record => Dates.TimeOf(record.Date)) : 0;
        var best = ranked.FirstOrDefault();
        var bestTime = best is null ? 0 : Dates.TimeOf(best.Date);
        return new ListRanking(
            list, records, ranked, others,
            counts.StableSorted((a, b) => (a.WordCount ?? -1) > (b.WordCount ?? -1)),
            fallback, best,
            last > 0 ? Dates.FromMillis(last) : null,
            best is not null && at.ToUnixTimeMilliseconds() - bestTime < ImprovedDays * DayMs &&
            ranked.Any(record => Dates.TimeOf(record.Date) < bestTime));
    }

    public static IReadOnlyList<ListRanking> Sort(IReadOnlyList<ListRanking> rankings, ListSort sort, CultureInfo? culture = null)
    {
        var compare = (culture ?? CultureInfo.CurrentCulture).CompareInfo;
        static bool Recent(ListRanking a, ListRanking b) =>
            (a.LastPracticed?.ToUnixTimeMilliseconds() ?? 0) > (b.LastPracticed?.ToUnixTimeMilliseconds() ?? 0);
        return rankings.StableSorted((a, b) => sort switch
        {
            ListSort.Name => compare.Compare(a.List.Name, b.List.Name) < 0,
            ListSort.Count => a.Records.Count != b.Records.Count ? a.Records.Count > b.Records.Count : Recent(a, b),
            _ => Recent(a, b),
        });
    }

    /// <summary>The figures above the table: the latest runs show where practice is now, next to the best.</summary>
    public static RankingStats Stats(IReadOnlyList<StoredRecord> ranked)
    {
        var byDate = ranked.StableSorted((a, b) => Dates.TimeOf(a.Date) < Dates.TimeOf(b.Date));
        var recent = byDate.TakeLast(RecentRuns).ToList();
        var accuracies = recent.Where(record => record.Accuracy is not null).Select(record => record.Accuracy!.Value).ToList();
        return new RankingStats(
            recent.Count,
            recent.Count == 0 ? null : recent.Sum(record => record.Time) / recent.Count,
            accuracies.Count == 0 ? null : accuracies.Sum() / accuracies.Count,
            byDate.TakeLast(TrendPoints).Select(record => new TrendPoint(record.Date, record.Time)).ToList());
    }
}
