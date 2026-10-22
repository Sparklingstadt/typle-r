using System.Globalization;
using System.Numerics;
using System.Text.RegularExpressions;

namespace Typle.Core;

public sealed record ListOverview(
    WordList List,
    // Position in the saved order, which is the order the lists were added in.
    int Position,
    int PracticeCount,
    // Milliseconds since 1970.
    double? LastPracticed)
{
    public string Id => List.Id;
}

public enum ListOrder { Added, Practiced, Name, Words }

public sealed record DuplicateResult(IReadOnlyList<WordList> Lists, WordList Copy);

// src/core/wordLists.ts, src/core/listOverview.ts and the limits of src/core/workspaceRequest.ts
public static partial class WordLists
{
    public const int MaxLists = 100;
    public const int MaxListName = 200;
    public const int MaxWords = 1000;
    public const int MaxWordField = 1000;
    public const int MaxAnnotation = 2000;
    public const int MaxRecords = 10000;

    public static void Validate(WordList list, IReadOnlyList<WordList>? others = null)
    {
        var name = list.Name.Trim();
        if (name.Length == 0) throw new TypleException("listNameRequired");
        if ((others ?? []).Any(other => other.Name.Trim().ToLowerInvariant() == name.ToLowerInvariant()))
        {
            throw new TypleException("listNameDuplicate");
        }
        if (list.Words.Count == 0) throw new TypleException("wordsRequired");
        if (list.Words.Any(word => Text.IsBlank(word.Display) || Text.IsBlank(word.Input))) throw new TypleException("wordFieldsRequired");
    }

    /// <summary>The checks decodeLists makes on saved lists, plus the size limits of a save.</summary>
    public static void ValidateAll(IReadOnlyList<WordList> lists)
    {
        var ids = new HashSet<string>();
        foreach (var list in lists)
        {
            var corrupted = list.Id.Length == 0 || ids.Contains(list.Id) || list.Records.Any(record =>
                !double.IsFinite(record.Time) || record.Time < 0 || Dates.Parse(record.Date) is null ||
                (record.Device is { } device && !Devices.IsDevice(device)) ||
                (record.Accuracy is { } accuracy && (!double.IsFinite(accuracy) || accuracy < 0 || accuracy > 100)) ||
                record.Mistakes is < 0 || record.WordCount is < 1);
            if (corrupted) throw new TypleException("savedDataCorrupted");
            Validate(list);
            ids.Add(list.Id);
        }
        if (lists.Any(list =>
                list.Words.Count > MaxWords || list.Records.Count > MaxRecords || list.Name.Length > MaxListName ||
                list.Words.Any(word => word.Input.Length > MaxWordField || word.Display.Length > MaxWordField ||
                                       word.Annotation.Length > MaxAnnotation)))
        {
            throw new TypleException("invalidWorkspace");
        }
    }

    /// <summary>
    /// Saves a new or edited list. Whitespace can be meaningful in typing strings and annotations, so only the name is
    /// trimmed. The editor's copy of a list knows nothing of its records, so those stay as saved.
    /// </summary>
    public static IReadOnlyList<WordList> Save(IReadOnlyList<WordList> lists, WordList list, bool editing)
    {
        if (editing && lists.All(item => item.Id != list.Id)) throw new TypleException("listDeleted");
        Validate(list, lists.Where(item => item.Id != list.Id).ToList());
        var normalized = list with { Name = list.Name.Trim() };
        if (lists.Any(item => item.Id == list.Id))
        {
            return lists.Select(item => item.Id != list.Id ? item : normalized with { Records = item.Records }).ToList();
        }
        if (lists.Count >= MaxLists) throw TypleException.With("listLimit", "max", MaxLists.ToString(CultureInfo.InvariantCulture));
        return [.. lists, normalized];
    }

    public static IReadOnlyList<ListOverview> Overviews(IReadOnlyList<WordList> lists) =>
        lists.Select((list, position) =>
        {
            var dates = list.Records.Select(record => Dates.Parse(record.Date)).Where(date => date is not null)
                .Select(date => (double)date!.Value.ToUnixTimeMilliseconds()).ToList();
            return new ListOverview(list, position, list.Records.Count, dates.Count > 0 ? dates.Max() : null);
        }).ToList();

    /// <summary>Newest first for Added. Lists without a record come after the practised ones for Practiced.</summary>
    public static IReadOnlyList<ListOverview> Sort(IReadOnlyList<ListOverview> items, ListOrder order, CultureInfo? culture = null)
    {
        var compare = (culture ?? CultureInfo.CurrentCulture).CompareInfo;
        return items.OrderBy(item => item, Comparer<ListOverview>.Create((a, b) => order switch
        {
            ListOrder.Name => NaturalCompare(a.List.Name, b.List.Name, compare) is var result && result != 0
                ? result
                : b.Position.CompareTo(a.Position),
            ListOrder.Words => a.List.Words.Count != b.List.Words.Count
                ? b.List.Words.Count.CompareTo(a.List.Words.Count)
                : b.Position.CompareTo(a.Position),
            ListOrder.Practiced => (a.LastPracticed ?? double.NegativeInfinity) != (b.LastPracticed ?? double.NegativeInfinity)
                ? (b.LastPracticed ?? double.NegativeInfinity).CompareTo(a.LastPracticed ?? double.NegativeInfinity)
                : b.Position.CompareTo(a.Position),
            _ => b.Position.CompareTo(a.Position),
        })).ToList();
    }

    [GeneratedRegex("[0-9]+|[^0-9]+")]
    private static partial Regex DigitRun();

    /// <summary>Compares names as Swift's <c>.numeric</c> option does, so "List 9" comes before "List 10".</summary>
    private static int NaturalCompare(string a, string b, CompareInfo compare)
    {
        var x = DigitRun().Matches(a).Select(match => match.Value).ToList();
        var y = DigitRun().Matches(b).Select(match => match.Value).ToList();
        for (var i = 0; i < Math.Min(x.Count, y.Count); i++)
        {
            var result = char.IsAsciiDigit(x[i][0]) && char.IsAsciiDigit(y[i][0])
                ? BigInteger.Parse(x[i], CultureInfo.InvariantCulture).CompareTo(BigInteger.Parse(y[i], CultureInfo.InvariantCulture))
                : compare.Compare(x[i], y[i]);
            if (result != 0) return result;
        }
        return x.Count.CompareTo(y.Count);
    }

    /// <summary>Matches the list name and the words, so a list can be found by one of its words.</summary>
    public static bool MatchesQuery(WordList list, string query)
    {
        var needle = query.Trim().ToLowerInvariant();
        if (needle.Length == 0) return true;
        return list.Name.ToLowerInvariant().Contains(needle) || list.Words.Any(word =>
            word.Display.ToLowerInvariant().Contains(needle) || word.Input.ToLowerInvariant().Contains(needle));
    }

    /// <summary>The records a list's best is taken from: runs at its current word count.</summary>
    public static int CurrentRecordCount(WordList list) => list.Records.Count(record => record.WordCount == list.Words.Count);

    /// <summary><paramref name="suffix"/>(n) is the localized mark for the nth copy, such as （コピー） and （コピー2）.</summary>
    public static string CopyName(IReadOnlyList<WordList> lists, string name, Func<int, string> suffix)
    {
        var taken = lists.Select(list => list.Name.Trim().ToLowerInvariant()).ToHashSet();
        for (var n = 1; ; n++)
        {
            var mark = suffix(n);
            var trimmed = name.Trim();
            var length = Math.Min(trimmed.Length, Math.Max(0, MaxListName - mark.Length));
            var stem = trimmed[..length];
            // Do not split a surrogate pair at the cut.
            if (stem.Length > 0 && char.IsHighSurrogate(stem[^1])) stem = stem[..^1];
            var candidate = stem + mark;
            if (!taken.Contains(candidate.ToLowerInvariant())) return candidate;
        }
    }

    /// <summary>A copy keeps the words but starts without records, so its best is its own.</summary>
    public static DuplicateResult Duplicate(
        IReadOnlyList<WordList> lists, string id, string copyId, Func<int, string> suffix, DateTimeOffset? now = null)
    {
        var source = lists.FirstOrDefault(list => list.Id == id) ?? throw new TypleException("listDeleted");
        if (lists.Count >= MaxLists) throw TypleException.With("listLimit", "max", MaxLists.ToString(CultureInfo.InvariantCulture));
        var copy = new WordList
        {
            Id = copyId, Name = CopyName(lists, source.Name, suffix), Words = source.Words,
            CreatedAt = Dates.IsoString(now ?? DateTimeOffset.UtcNow),
        };
        return new DuplicateResult([.. lists, copy], copy);
    }
}
