using System.Globalization;

namespace Typle.Core;

/// <summary>
/// Narrows lists down by category and tags. A null category is every list and "" the lists without one; a list must
/// have every tag in <see cref="Tags"/>. Both compare without case, as tags are kept unique without case.
/// </summary>
public sealed record ListFilter(string? Category, IReadOnlyList<string> Tags)
{
    public static readonly ListFilter None = new(null, []);

    public bool IsFiltered => Category is not null || Tags.Count > 0;

    public bool Equals(ListFilter? other) => other is not null && Category == other.Category && Tags.SequenceEqual(other.Tags);

    public override int GetHashCode() => HashCode.Combine(Category, Tags.Count);
}

/// <summary>A category or tag in use, in the spelling first seen, with how many lists have it.</summary>
public sealed record LabelCount(string Name, int Count);

public sealed record ListLabelCounts(IReadOnlyList<LabelCount> Categories, IReadOnlyList<LabelCount> Tags, int Uncategorized);

/// <summary>A list shown on its own (Group null), or the lists of one group shown as one entry.</summary>
public sealed record ListEntry<T>(string? Group, IReadOnlyList<T> Items);

/// <summary>One step of a group's level choice: the levels offered, and the one picked, if any.</summary>
public sealed record LevelStep(IReadOnlyList<string> Options, string? Chosen)
{
    public bool Equals(LevelStep? other) => other is not null && Chosen == other.Chosen && Options.SequenceEqual(other.Options);

    public override int GetHashCode() => HashCode.Combine(Chosen, Options.Count);
}

// The labels, filters, groups and levels of src/core/listOverview.ts, normalizeGroup of src/core/wordLists.ts and
// byRecentPractice of src/core/records.ts.
public static partial class WordLists
{
    private static string Key(string value) => value.Trim().ToLowerInvariant();

    public static bool MatchesFilter(WordList list, ListFilter filter)
    {
        if (filter.Category is { } category && Key(list.Category ?? "") != Key(category)) return false;
        var tags = (list.Tags ?? []).Select(Key).ToHashSet();
        return filter.Tags.All(tag => tags.Contains(Key(tag)));
    }

    /// <summary>The categories and tags in use, each once in name order, and how many lists have no category.</summary>
    public static ListLabelCounts Labels(IReadOnlyList<WordList> lists, CultureInfo? culture = null)
    {
        var compare = (culture ?? CultureInfo.CurrentCulture).CompareInfo;
        IReadOnlyList<LabelCount> Count(IEnumerable<string> values)
        {
            var found = new Dictionary<string, LabelCount>();
            var order = new List<string>();
            foreach (var value in values)
            {
                var name = value.Trim();
                if (name.Length == 0) continue;
                var key = name.ToLowerInvariant();
                if (found.TryGetValue(key, out var item)) found[key] = item with { Count = item.Count + 1 };
                else
                {
                    found[key] = new LabelCount(name, 1);
                    order.Add(key);
                }
            }
            return order.Select(key => found[key])
                .OrderBy(item => item.Name, Comparer<string>.Create((a, b) => NaturalCompare(a, b, compare))).ToList();
        }
        return new ListLabelCounts(
            Count(lists.Select(list => list.Category ?? "")),
            Count(lists.SelectMany(list => list.Tags ?? [])),
            lists.Count(list => string.IsNullOrWhiteSpace(list.Category)));
    }

    /// <summary>
    /// Puts the lists of a group together at the place of the first of them, keeping the order of <paramref name="items"/>
    /// otherwise. A group that has one list in <paramref name="all"/> (every list, when the items are those a search
    /// found) is shown as that list.
    /// </summary>
    public static IReadOnlyList<ListEntry<T>> GroupEntries<T>(IReadOnlyList<T> items, Func<T, WordList> listOf, IEnumerable<WordList>? all = null)
    {
        var sizes = new Dictionary<string, int>();
        foreach (var list in all ?? items.Select(listOf))
        {
            if (list.Group?.Trim() is { Length: > 0 } group) sizes[group] = sizes.GetValueOrDefault(group) + 1;
        }
        var groups = new Dictionary<string, List<T>>();
        foreach (var item in items)
        {
            if (listOf(item).Group?.Trim() is not { Length: > 0 } group) continue;
            if (!groups.TryGetValue(group, out var members)) groups[group] = members = [];
            members.Add(item);
        }
        var entries = new List<ListEntry<T>>();
        foreach (var item in items)
        {
            var group = listOf(item).Group?.Trim();
            if (string.IsNullOrEmpty(group) || sizes.GetValueOrDefault(group) < 2) entries.Add(new ListEntry<T>(null, [item]));
            else if (EqualityComparer<T>.Default.Equals(groups[group][0], item)) entries.Add(new ListEntry<T>(group, groups[group]));
        }
        return entries;
    }

    /// <summary>A list's name in its group: its levels, such as 基本・初級, or its name when it has none.</summary>
    public static string LevelName(WordList list, string separator = "・") =>
        list.Levels is { Count: > 0 } levels ? string.Join(separator, levels) : list.Name;

    private static IReadOnlyList<string> LevelsOf(WordList list) => list.Levels is { Count: > 0 } levels ? levels : [list.Name];

    /// <summary>
    /// The choices of each step of a group, in the order of its lists: step n offers the nth levels of the lists that
    /// match the levels chosen before it. A list without levels is its own choice in the first step.
    /// </summary>
    public static IReadOnlyList<LevelStep> LevelSteps(IReadOnlyList<WordList> lists, IReadOnlyList<string> chosen)
    {
        var steps = new List<LevelStep>();
        for (var step = 0; ; step++)
        {
            var options = lists.Select(LevelsOf)
                .Where(levels => levels.Count > step && chosen.Take(step).Select((level, n) => levels[n] == level).All(same => same))
                .Select(levels => levels[step]).Distinct().ToList();
            if (options.Count == 0) return steps;
            var pick = step < chosen.Count && options.Contains(chosen[step]) ? chosen[step] : null;
            steps.Add(new LevelStep(options, pick));
            if (pick is null) return steps;
        }
    }

    /// <summary>The list of a group whose levels are exactly <paramref name="chosen"/>, if there is one.</summary>
    public static WordList? ListAtLevels(IReadOnlyList<WordList> lists, IReadOnlyList<string> chosen) =>
        lists.FirstOrDefault(list => LevelsOf(list).SequenceEqual(chosen));

    /// <summary>The first words of a list and how many more there are; the screen joins them in the reader's language.</summary>
    public static (IReadOnlyList<string> Words, int More) WordPreview(WordList list, int limit = 6) =>
        (list.Words.Take(limit).Select(word => word.Display.Trim()).ToList(), Math.Max(0, list.Words.Count - limit));

    /// <summary>normalizeGroup: the group trimmed with its non-empty levels, or neither when the group is empty.</summary>
    public static (string? Group, IReadOnlyList<string>? Levels) NormalizeGroup(string? group, IReadOnlyList<string>? levels)
    {
        var name = (group ?? "").Trim();
        if (name.Length == 0) return (null, null);
        var kept = (levels ?? []).Select(level => level.Trim()).Where(level => level.Length > 0).ToList();
        return (name, kept.Count == 0 ? null : kept);
    }

    /// <summary>The most recently practised lists first; lists never practised keep their order after them.</summary>
    public static IReadOnlyList<WordList> ByRecentPractice(IReadOnlyList<WordList> lists)
    {
        static double Last(WordList list) => list.Records.Select(record => Dates.Parse(record.Date))
            .Where(date => date is not null).Select(date => (double)date!.Value.ToUnixTimeMilliseconds())
            .DefaultIfEmpty(double.NegativeInfinity).Max();
        return lists.Select((list, index) => (List: list, Index: index, Last: Last(list)))
            .OrderByDescending(item => item.Last).ThenBy(item => item.Index).Select(item => item.List).ToList();
    }
}
