using System.Globalization;

namespace Typle.Core;

public enum RankOrder
{
    /// <summary>The higher accuracy wins and time breaks ties (records without accuracy come last).</summary>
    Accuracy,

    /// <summary>The reverse.</summary>
    Speed,
}

public sealed record RecordRow(
    WordList List,
    StoredRecord Record,
    int Index,
    string Id,
    // Whether this record currently ranks first in its list.
    bool Best);

public sealed record DeviceOption(string Value, PracticeDevice? Device, int Count);

public sealed record RecordDay(DateTimeOffset Day, IReadOnlyList<RecordRow> Rows, double Seconds);

public enum TimeUnit { Hours, Minutes, Seconds }

public sealed record TimePart(string Value, TimeUnit Unit);

// src/core/records.ts
public static class Records
{
    /// <summary>The filter value for records without a device.</summary>
    public const string NoDevice = "none";

    public static StoredRecord Make(TypingSession session, int wordCount, string id, PracticeDevice? device)
    {
        if (session.FinishedAt is not { } finishedAt || session.StartedAt is null) throw new TypleException("practiceIncomplete");
        var result = Typing.Result(session);
        return new StoredRecord
        {
            Id = id, Time = result.Time, Date = Dates.IsoString(Dates.FromMillis(finishedAt)), Mistakes = result.Mistakes,
            Accuracy = result.Accuracy, Device = device, WordCount = wordCount,
        };
    }

    /// <summary>Adds a record once: sending the same record id again leaves the list as it is.</summary>
    public static IReadOnlyList<WordList> Add(IReadOnlyList<WordList> lists, string listId, StoredRecord record)
    {
        if (lists.All(list => list.Id != listId)) throw new TypleException("recordListDeleted");
        return lists.Select(list =>
            list.Id != listId || list.Records.Any(item => item.Id is not null && item.Id == record.Id)
                ? list
                : list with { Records = [.. list.Records, record] }).ToList();
    }

    public static IReadOnlyList<StoredRecord> Rank(IReadOnlyList<StoredRecord> records, RankOrder order = RankOrder.Accuracy) =>
        RankIndices(records, order).Select(index => records[index]).ToList();

    internal static List<int> RankIndices(IReadOnlyList<StoredRecord> records, RankOrder order = RankOrder.Accuracy) =>
        Enumerable.Range(0, records.Count).StableSorted((a, b) =>
        {
            var x = records[a];
            var y = records[b];
            var accuracyX = x.Accuracy ?? -1;
            var accuracyY = y.Accuracy ?? -1;
            return order == RankOrder.Accuracy
                ? accuracyX != accuracyY ? accuracyX > accuracyY : x.Time < y.Time
                : x.Time != y.Time ? x.Time < y.Time : accuracyX > accuracyY;
        });

    public static IReadOnlyList<StoredRecord> Best(IReadOnlyList<StoredRecord> records, int limit = 5, RankOrder order = RankOrder.Accuracy) =>
        Rank(records, order).Take(limit).ToList();

    /// <summary>
    /// Editing a list changes the task, so only runs at its current word count are compared. Records without a word
    /// count predate that field and cannot be matched. With no matching run, every record is compared instead.
    /// </summary>
    public static IReadOnlyList<StoredRecord> Comparable(WordList list, IReadOnlyList<StoredRecord>? records = null)
    {
        records ??= list.Records;
        var same = records.Where(record => record.WordCount == list.Words.Count).ToList();
        return same.Count > 0 ? same : records;
    }

    /// <summary>The record every screen shows as a list's best.</summary>
    public static StoredRecord? ListBest(WordList list) => Best(Comparable(list), limit: 1).FirstOrDefault();

    /// <summary>The position of the list's best in its records.</summary>
    internal static int? ListBestIndex(WordList list)
    {
        var same = Enumerable.Range(0, list.Records.Count).Where(i => list.Records[i].WordCount == list.Words.Count).ToList();
        var candidates = same.Count > 0 ? same : Enumerable.Range(0, list.Records.Count).ToList();
        var ranked = RankIndices(candidates.Select(i => list.Records[i]).ToList());
        return ranked.Count > 0 ? candidates[ranked[0]] : null;
    }

    /// <summary>Removes a record by id, or by date and time for records from before ids.</summary>
    public static IReadOnlyList<WordList> Remove(IReadOnlyList<WordList> lists, string listId, StoredRecord record) =>
        lists.Select(list => list.Id != listId
            ? list
            : list with
            {
                Records = list.Records.Where(item =>
                    !(record.Id is not null ? item.Id == record.Id : item.Date == record.Date && item.Time == record.Time)).ToList(),
            }).ToList();

    /// <summary>Every record with its list, newest first.</summary>
    public static IReadOnlyList<RecordRow> Rows(IReadOnlyList<WordList> lists) =>
        lists.SelectMany(list =>
        {
            var best = ListBestIndex(list);
            return list.Records.Select((record, index) =>
                new RecordRow(list, record, index, $"{list.Id}-{record.Id ?? $"{index}-{record.Date}"}", index == best));
        }).StableSorted((a, b) => Dates.TimeOf(a.Record.Date) > Dates.TimeOf(b.Record.Date));

    public static bool MatchesDevice(StoredRecord record, string? device) => device switch
    {
        null => true,
        NoDevice => record.Device is null,
        _ => record.Device?.Id == device,
    };

    public static IReadOnlyList<RecordRow> Filter(IReadOnlyList<RecordRow> rows, string? list, string? device) =>
        rows.Where(row => (list is null || row.List.Id == list) && MatchesDevice(row.Record, device)).ToList();

    /// <summary>
    /// Devices come from the records themselves, so deleted or renamed devices can still be picked (by id, with the
    /// newest name). Records without a device are grouped last.
    /// </summary>
    public static IReadOnlyList<DeviceOption> DeviceOptions(IEnumerable<StoredRecord> records)
    {
        var options = new List<DeviceOption>();
        foreach (var record in records.StableSorted((a, b) => Dates.TimeOf(a.Date) > Dates.TimeOf(b.Date)))
        {
            var value = record.Device?.Id ?? NoDevice;
            var index = options.FindIndex(option => option.Value == value);
            if (index >= 0) options[index] = options[index] with { Count = options[index].Count + 1 };
            else options.Add(new DeviceOption(value, record.Device, 1));
        }
        return options.StableSorted((a, b) =>
        {
            var noneA = a.Value == NoDevice;
            var noneB = b.Value == NoDevice;
            return noneA != noneB ? noneB : a.Count > b.Count;
        });
    }

    /// <summary>Days follow the viewer's local calendar.</summary>
    public static IReadOnlyList<RecordDay> GroupByDay(IReadOnlyList<RecordRow> rows, TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        var groups = new List<RecordDay>();
        foreach (var row in rows)
        {
            var day = Dates.StartOfDay(Dates.Parse(row.Record.Date) ?? DateTimeOffset.UnixEpoch, zone);
            if (groups.Count > 0 && groups[^1].Day == day)
            {
                var last = groups[^1];
                groups[^1] = last with { Rows = [.. last.Rows, row], Seconds = last.Seconds + row.Record.Time };
            }
            else
            {
                groups.Add(new RecordDay(day, [row], row.Record.Time));
            }
        }
        return groups;
    }

    /// <summary>
    /// Seconds keep two decimals so close runs stay distinguishable; a minute or more is split into minutes and
    /// seconds.
    /// </summary>
    public static IReadOnlyList<TimePart> TimeParts(double seconds)
    {
        // Round first so 59.999 becomes 1 min 00.00 s rather than 60.00 s.
        var hundredths = (int)Text.JsRound(seconds * 100);
        if (hundredths < 6000) return [new TimePart((hundredths / 100.0).ToString("F2", CultureInfo.InvariantCulture), TimeUnit.Seconds)];
        return
        [
            new TimePart((hundredths / 6000).ToString(CultureInfo.InvariantCulture), TimeUnit.Minutes),
            new TimePart((hundredths % 6000 / 100.0).ToString("00.00", CultureInfo.InvariantCulture), TimeUnit.Seconds),
        ];
    }

    public static double? SecondsPerWord(StoredRecord record) =>
        record.WordCount is { } wordCount && wordCount > 0 ? record.Time / wordCount : null;

    public static string FormatAccuracy(double? accuracy)
    {
        if (accuracy is not { } value) return "—";
        var rounded = Text.JsRound(value * 10) / 10;
        return rounded == Math.Floor(rounded)
            ? $"{((long)rounded).ToString(CultureInfo.InvariantCulture)}%"
            : $"{rounded.ToString(CultureInfo.InvariantCulture)}%";
    }
}
