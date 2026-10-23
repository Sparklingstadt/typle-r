using System.Globalization;
using System.Text;

namespace Typle.Core.Tests;

internal static class Make
{
    public static WordList List(string id, string name, IReadOnlyList<Word> words, IReadOnlyList<StoredRecord>? records = null,
        string createdAt = "2026-01-01") =>
        new() { Id = id, Name = name, Words = words, Records = records ?? [], CreatedAt = createdAt };

    public static StoredRecord Record(double time, string date, string? id = null, double? accuracy = null, int? mistakes = null,
        PracticeDevice? device = null, int? wordCount = null) =>
        new() { Id = id, Time = time, Date = date, Accuracy = accuracy, Mistakes = mistakes, Device = device, WordCount = wordCount };

    public static string KeyOf(Action action) => Assert.Throws<TypleException>(action).Key;
}

public class TypingTests
{
    [Fact]
    public void MistakesRequireCorrectionAndFinishOnce()
    {
        Word[] words = [new("ab", "ab"), new("c", "c")];
        var s = Typing.TypeInput(new TypingSession(), words, "x", 1000);
        Assert.Equal(0, s.Index);
        Assert.Equal(1, s.Mistakes);
        s = Typing.TypeInput(s, words, "", 1100);
        s = Typing.TypeInput(s, words, "ab", 2000);
        Assert.Equal(1, s.Index);
        Assert.Equal("", s.Input);
        s = Typing.TypeInput(s, words, "c", 3000);
        Assert.Equal(new SessionResult(2, 1, 75), Typing.Result(s));
        Assert.Equal(s, Typing.TypeInput(s, words, "c", 4000));
    }

    [Fact]
    public void EmptyListsAndUnicode()
    {
        Assert.Equal(new TypingSession(), Typing.TypeInput(new TypingSession(), [], "a", 0));
        Assert.Equal(2, Typing.TypeInput(new TypingSession(), [new Word("x", "あ😀")], "あ😀", 0).Attempts);
        // Composed and decomposed forms are different characters to type, as in JavaScript.
        var decomposed = Typing.TypeInput(new TypingSession(), [new Word("\u00e9", "e\u0301")], "\u00e9", 0);
        Assert.Null(decomposed.FinishedAt);
        Assert.Equal(1, decomposed.Mistakes);
        // A surrogate pair is one character: typing a different emoji is one mistake, not two.
        Assert.Equal(1, Typing.TypeInput(new TypingSession(), [new Word("x", "😀")], "😁", 0).Mistakes);
    }

    [Fact]
    public void CompareInputMarksFromTheFirstMismatch()
    {
        const CharacterState done = CharacterState.Done, current = CharacterState.Current, error = CharacterState.Error,
            currentError = CharacterState.CurrentError, pending = CharacterState.Pending;
        Assert.Equal([current, pending, pending, pending], Typing.CompareInput("hoge", "").States);
        Assert.Equal([done, done, current, pending], Typing.CompareInput("hoge", "ho").States);
        var typo = Typing.CompareInput("hoge", "hoxe");
        Assert.Equal([done, done, error, error], typo.States);
        Assert.Equal(2, typo.ErrorIndex);
        Assert.Equal([done, error, currentError, pending], Typing.CompareInput("hoge", "hx").States);
        var extra = Typing.CompareInput("ab", "abc");
        Assert.Equal([done, done], extra.States);
        Assert.Equal(["c"], extra.Extra);
        Assert.Equal(2, extra.ErrorIndex);
        Assert.Equal([done, done], Typing.CompareInput("あ😀", "あ😀").States);
        Assert.Equal(["あ", "😀"], Typing.CompareInput("あ😀", "").Characters);
        Assert.Null(Typing.CompareInput("あ😀", "あ😀").ErrorIndex);
    }

    [Fact]
    public void TypingSpeed()
    {
        var s = new TypingSession(StartedAt: 1000, Attempts: 12, Mistakes: 2);
        Assert.Null(Typing.Speed(s with { StartedAt = null }, 5000));
        Assert.Null(Typing.Speed(s, 1500));
        Assert.Equal(300, Typing.Speed(s, 3000));
        Assert.Equal(20, Typing.Speed(s with { FinishedAt = 31000 }, 99999));
    }
}

public class RecordsTests
{
    [Fact]
    public void RecordOrderingAndDeletion()
    {
        var legacy = Make.Record(1, "2026-01-01");
        var slow = Make.Record(5, "2026-01-02", "slow", 100);
        var fast = Make.Record(2, "2026-01-03", "fast", 100);
        StoredRecord[] records = [legacy, slow, fast];
        Assert.Equal([fast, slow, legacy], Records.Best(records));
        Assert.Equal([legacy, fast, slow], Records.Best(records, order: RankOrder.Speed));
        WordList[] lists = [Make.List("a", "A", [new("a", "a")], records), Make.List("b", "B", [new("b", "b")], [legacy])];
        Assert.Equal(fast, Records.Rows(lists)[0].Record);
        Assert.Equal([slow, fast], Records.Remove(lists, "a", legacy)[0].Records);
        Assert.Equal([legacy, slow], Records.Remove(lists, "a", fast)[0].Records);
        Assert.Equal(lists[1], Records.Remove(lists, "a", fast)[1]);
    }

    [Fact]
    public void MakeAndAddRecordOnce()
    {
        var session = new TypingSession(StartedAt: 1000, FinishedAt: 3500, Attempts: 4, Mistakes: 1);
        var record = Records.Make(session, 2, "r1", new PracticeDevice("d1", "Tab"));
        Assert.Equal(2.5, record.Time);
        Assert.Equal(75, record.Accuracy);
        Assert.Equal("1970-01-01T00:00:03.500Z", record.Date);
        var list = Make.List("l", "L", [new("a", "a")]);
        var once = Records.Add([list], "l", record);
        Assert.Equal(once, Records.Add(once, "l", record));
        Assert.Equal(new TypleException("recordListDeleted"), Assert.Throws<TypleException>(() => Records.Add([], "l", record)));
        Assert.Throws<TypleException>(() => Records.Make(new TypingSession(), 1, "x", null));
    }

    [Fact]
    public void BestComparesCurrentWordCount()
    {
        Word[] words = [new("a", "a"), new("b", "b")];
        var old = Make.Record(1, "2026-01-01T00:00:00.000Z", "old", 100, wordCount: 1);
        var now = Make.Record(9, "2026-01-02T00:00:00.000Z", "now", 90, wordCount: 2);
        var list = Make.List("l", "L", words, [old, now]);
        Assert.Equal(now, Records.ListBest(list));
        Assert.Equal([now], Records.Rows([list]).Where(row => row.Best).Select(row => row.Record));
        var ranking = Rankings.For(list);
        Assert.Equal([now], ranking.Ranked);
        Assert.Equal([old], ranking.Others);
        Assert.False(ranking.Fallback);
    }

    [Fact]
    public void TimePartsAndAccuracy()
    {
        Assert.Equal(["1", "00.00"], Records.TimeParts(59.999).Select(part => part.Value));
        Assert.Equal(["5.00"], Records.TimeParts(5).Select(part => part.Value));
        Assert.Equal(["1", "15.50"], Records.TimeParts(75.5).Select(part => part.Value));
        Assert.Equal([TimeUnit.Minutes, TimeUnit.Seconds], Records.TimeParts(75.5).Select(part => part.Unit));
        Assert.Equal("97.3%", Records.FormatAccuracy(97.25));
        Assert.Equal("100%", Records.FormatAccuracy(100));
        Assert.Equal("—", Records.FormatAccuracy(null));
    }

    [Fact]
    public void DeviceOptionsPutRecordsWithoutDeviceLast()
    {
        var device = new PracticeDevice("d", "Tab");
        StoredRecord[] records = [Make.Record(1, "2026-01-01"), Make.Record(1, "2026-01-02", device: device)];
        Assert.Equal(["d", Records.NoDevice], Records.DeviceOptions(records).Select(option => option.Value));
    }

    [Fact]
    public void RankingStatsUseTheLatestFiveRuns()
    {
        var records = Enumerable.Range(1, 7).Select(i => Make.Record(i, $"2026-01-0{i}T00:00:00.000Z", $"{i}", 90 + i)).ToList();
        records.Reverse();
        var stats = Rankings.Stats(records);
        Assert.Equal(5, stats.RecentCount);
        Assert.Equal(5, stats.RecentTime);
        Assert.Equal(95, stats.RecentAccuracy);
        Assert.Equal([1.0, 2, 3, 4, 5, 6, 7], stats.Points.Select(point => point.Value));
    }

    [Fact]
    public void GroupByDayFollowsTheLocalCalendar()
    {
        var tokyo = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");
        var list = Make.List("l", "L", [new("a", "a")],
            [Make.Record(1, "2026-01-01T14:00:00.000Z"), Make.Record(2, "2026-01-01T16:00:00.000Z"), Make.Record(3, "2026-01-02T01:00:00.000Z")]);
        var days = Records.GroupByDay(Records.Rows([list]), tokyo);
        Assert.Equal([2, 1], days.Select(day => day.Rows.Count));
        Assert.Equal(5, days[0].Seconds);
        Assert.Equal("2026-01-01T15:00:00.000Z", Dates.IsoString(days[0].Day));
    }
}

public class DatesTests
{
    [Fact]
    public void StoredForms()
    {
        Assert.Equal(1_791_597_600L, Dates.Parse("2026-10-10T02:00:00.000Z")?.ToUnixTimeSeconds());
        Assert.Equal(1_791_597_600L, Dates.Parse("2026-10-10T11:00:00+09:00")?.ToUnixTimeSeconds());
        Assert.Equal(1_791_590_400L, Dates.Parse("2026-10-10")?.ToUnixTimeSeconds());
        Assert.NotNull(Dates.Parse("2024/09/22 10:05"));
        Assert.NotNull(Dates.Parse("2026-09-26T03:01:23.866446Z"));
        Assert.Null(Dates.Parse("abc"));
        Assert.Null(Dates.Parse("2026-02-30"));
        Assert.Equal("2026-10-10T02:00:00.000Z", Dates.IsoString(DateTimeOffset.FromUnixTimeSeconds(1_791_597_600)));
    }

    [Fact]
    public void LocalFormsFollowTheZone()
    {
        var tokyo = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");
        Assert.Equal("2024-09-22T01:05:00.000Z", Dates.IsoString(Dates.Parse("2024/09/22 10:05", tokyo)!.Value));
        Assert.Equal("2024-09-21T15:00:00.000Z", Dates.IsoString(Dates.Parse("2024/9/22", tokyo)!.Value));
        Assert.Equal("2026-10-10T02:00:00.123Z", Dates.IsoString(Dates.Parse("2026-10-10T11:00:00.123", tokyo)!.Value));
    }

    [Fact]
    public void DaysInAZoneWithSummerTime()
    {
        var berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        // 2026-03-29 has 23 hours in Berlin; the day after starts at 22:00 UTC.
        var day = Dates.Parse("2026-03-29T12:00:00Z")!.Value;
        Assert.Equal("2026-03-28T23:00:00.000Z", Dates.IsoString(Dates.StartOfDay(day, berlin)));
        Assert.Equal("2026-03-29T22:00:00.000Z", Dates.IsoString(Dates.PlusDays(Dates.StartOfDay(day, berlin), 1, berlin)));
        Assert.Equal(1, Dates.DaysBetween(Dates.Parse("2026-03-28T22:30:00Z")!.Value, day, berlin));
    }
}

public class DevicesTests
{
    [Fact]
    public void DeviceProblems()
    {
        PracticeDevice[] devices = [new("a", "HHKB")];
        Assert.Equal("deviceNameRequired", Devices.Problem(devices, new PracticeDevice("b", " "), false)?.Error.Key);
        Assert.Equal(TypleException.With("deviceNameDuplicate", "name", "HHKB"),
            Devices.Problem(devices, new PracticeDevice("b", "hhkb"), false)?.Error);
        Assert.Equal(DeviceField.Name, Devices.Problem(devices, new PracticeDevice("b", "デフォルト"), false, "デフォルト")?.Field);
        Assert.Equal("deviceDeleted", Devices.Problem(devices, new PracticeDevice("z", "X"), true)?.Error.Key);
        Assert.Equal(new PracticeDevice("b", "Tab", "JIS"), Devices.Save(devices, new PracticeDevice("b", " Tab ", " JIS "), false)[^1]);
        Assert.Null(Devices.Chosen(devices, "", "D"));
        Assert.Equal(Devices.DefaultDeviceId, Devices.Chosen(devices, null, "D")?.Id);
        Assert.Equal(Devices.DefaultDeviceId, Devices.Chosen(devices, "gone", "D")?.Id);
        Assert.Equal("HHKB", Devices.Chosen(devices, "a", "D")?.Name);
    }

    [Fact]
    public void UsageFollowsTheDeviceIdAndNewestDate()
    {
        var device = new PracticeDevice("d", "Tab");
        var lists = new[]
        {
            Make.List("l", "L", [new("a", "a")],
            [
                Make.Record(1, "2026-01-02T00:00:00.000Z", device: device),
                Make.Record(1, "2026-01-03T00:00:00.000Z", device: device with { Name = "Renamed" }),
                Make.Record(1, "2026-01-01T00:00:00.000Z", device: device),
            ]),
        };
        var usage = Devices.Usage(lists);
        Assert.Single(usage);
        Assert.Equal(new DeviceUsage(3, "2026-01-03T00:00:00.000Z"), usage["d"]);
    }
}

public class WordListsTests
{
    private static readonly Word[] Words = [new("a", "a")];

    [Fact]
    public void ValidationAndSave()
    {
        var list = Make.List("1", " A ", Words);
        var saved = WordLists.Save([], list, false);
        Assert.Equal("A", saved[0].Name);
        Assert.Equal(new TypleException("listNameDuplicate"),
            Assert.Throws<TypleException>(() => WordLists.Save(saved, Make.List("2", "a", Words), false)));
        Assert.Throws<TypleException>(() => WordLists.Save(saved, Make.List("2", "B", []), false));
        Assert.Throws<TypleException>(() => WordLists.Save(saved, Make.List("2", "B", [new(" ", "x")]), false));
        Assert.Equal(new TypleException("listDeleted"), Assert.Throws<TypleException>(() => WordLists.Save([], list, true)));
        // Editing keeps the saved records.
        WordList[] withRecord = [saved[0] with { Records = [Make.Record(1, "2026-01-01")] }];
        Assert.Single(WordLists.Save(withRecord, saved[0] with { Name = "C" }, true)[0].Records);
    }

    [Fact]
    public void CopyNames()
    {
        WordList[] lists = [Make.List("1", "A", Words), Make.List("2", "A（コピー）", Words)];
        var result = WordLists.Duplicate(lists, "1", "3", n => n == 1 ? "（コピー）" : $"（コピー{n}）");
        Assert.Equal("A（コピー2）", result.Copy.Name);
        Assert.Equal(3, result.Lists.Count);
        Assert.Empty(result.Copy.Records);
    }

    [Fact]
    public void OverviewsSortAndSearch()
    {
        WordList[] lists =
        [
            Make.List("1", "List 10", Words, [Make.Record(1, "2026-01-05T00:00:00.000Z")]),
            Make.List("2", "List 9", [.. Words, new("日本", "nihon")], createdAt: "2026-01-02"),
        ];
        var items = WordLists.Overviews(lists);
        Assert.Equal(["2", "1"], WordLists.Sort(items, ListOrder.Added).Select(item => item.Id));
        Assert.Equal(["2", "1"], WordLists.Sort(items, ListOrder.Name, CultureInfo.GetCultureInfo("en")).Select(item => item.Id));
        Assert.Equal(["1", "2"], WordLists.Sort(items, ListOrder.Practiced).Select(item => item.Id));
        Assert.Equal(["2", "1"], WordLists.Sort(items, ListOrder.Words).Select(item => item.Id));
        Assert.Equal(["2"], lists.Where(list => WordLists.MatchesQuery(list, " NIHON ")).Select(list => list.Id));
    }
}

public class WordFilesTests
{
    [Fact]
    public void CsvFeatures()
    {
        Assert.Equal([new Word("日本,Japan", "Japan", "one\r\ntwo \"quoted\"")],
            WordFiles.Parse("﻿display,input,annotation\r\n\"日本,Japan\",Japan,\"one\r\ntwo \"\"quoted\"\"\"\r\n", WordFileFormat.Csv));
        Assert.Equal([new Word("日本", "Japan")], WordFiles.Parse("input\tdisplay\n\nJapan\t日本\n", WordFileFormat.Tsv));
        Assert.Equal("a\tb", WordFiles.Parse("input\tdisplay\tannotation\nJapan\t日本\t\"a\tb\"", WordFileFormat.Tsv)[0].Annotation);
    }

    [Fact]
    public void InvalidFilesFail()
    {
        foreach (var text in new[]
                 {
                     "display\nx", "input,display,input\na,b,c", "input,display,other\na,b,c", "input,display", "input,display\na,",
                     "input,display\na,b,c", "input,display\n\"a,b", "input,display\n\"a\"x,b", "input,display\na\"x,b",
                 })
        {
            Assert.Throws<TypleException>(() => WordFiles.Parse(text, WordFileFormat.Csv));
        }
        Assert.Equal(TypleException.With("importFieldRequired", "line", "3"),
            Assert.Throws<TypleException>(() => WordFiles.Parse("input,display\nok,yes\nno,", WordFileFormat.Csv)));
        Assert.Equal("importTooManyRows",
            Make.KeyOf(() => WordFiles.Parse("input,display\n" + string.Concat(Enumerable.Repeat("a,b\n", 1001)), WordFileFormat.Csv)));
        Assert.Equal("importTooLarge", Make.KeyOf(() => WordFiles.Parse(new string('a', 1024 * 1024 + 1), WordFileFormat.Csv)));
        Assert.Equal("importFileEncoding", Make.KeyOf(() => WordFiles.ParseData([0xff, 0xfe, 0x41], WordFileFormat.Csv)));
    }

    [Fact]
    public void CsvRoundTripKeepsWhitespace()
    {
        Word[] words = [new(" 字 ", " zi ", " a\r\nb \"q\""), new("字", "zi")];
        Assert.Equal(words, WordFiles.Parse(WordFiles.EncodeCsv(words), WordFileFormat.Csv));
        Assert.Equal(WordFileFormat.Tsv, WordFiles.FormatOf("Words.TSV"));
        Assert.Null(WordFiles.FormatOf("words.txt"));
        Assert.Equal(words, WordFiles.ParseData(Encoding.UTF8.GetBytes(WordFiles.EncodeCsv(words)), WordFileFormat.Csv));
    }
}

public class WorkspaceTests
{
    private static readonly Word[] Words = [new("a", "a")];

    [Fact]
    public void WorkspaceFileRoundTrip()
    {
        var list = Make.List("1", "A", Words, [Make.Record(1.5, "2026-01-01T00:00:00.000Z", "r", 100, 0, wordCount: 1)]);
        var file = WorkspaceFile.Of("windows:local", 3, new WorkspaceDocument([list], [new PracticeDevice("d", " Tab ")]));
        var decoded = Workspace.DecodeFile(Workspace.EncodeFile(file), "windows:local");
        Assert.Equal([list], decoded.Lists);
        Assert.Equal([new PracticeDevice("d", "Tab")], decoded.Devices);
        Assert.Throws<TypleException>(() => Workspace.DecodeFile(Workspace.EncodeFile(file), "other"));
        Assert.Throws<TypleException>(() => Workspace.DecodeFile("{}"u8.ToArray(), "windows:local"));
        // Fields from link sharing are dropped, and unknown record fields do not fail the read.
        const string web = """{"version":1,"accountId":"windows:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","shared":true,"shareId":"s","words":[{"display":"a","input":"a","annotation":""}],"records":[{"time":5,"date":"2024/09/22 10:05"}]}]}""";
        Assert.Equal(5, Workspace.DecodeFile(Encoding.UTF8.GetBytes(web), "windows:local").Lists[0].Records[0].Time);
    }

    [Fact]
    public void UnreadableFileIsAnError()
    {
        Assert.Equal("savedDataUnreadable", Make.KeyOf(() => Workspace.DecodeFile("""{"version":2}"""u8.ToArray(), "windows:local")));
        Assert.Equal("savedDataUnreadable", Make.KeyOf(() => Workspace.DecodeFile("not json"u8.ToArray(), "windows:local")));
        // A word without its input, or with a null one, is not a word.
        const string missing = """{"accountId":"windows:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","words":[{"display":"a"}]}]}""";
        Assert.Equal("savedDataUnreadable", Make.KeyOf(() => Workspace.DecodeFile(Encoding.UTF8.GetBytes(missing), "windows:local")));
        const string nulled = """{"accountId":"windows:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","words":[{"display":"a","input":null}]}]}""";
        Assert.Equal("savedDataUnreadable", Make.KeyOf(() => Workspace.DecodeFile(Encoding.UTF8.GetBytes(nulled), "windows:local")));
    }

    [Fact]
    public void WritesTheWebShape()
    {
        var file = WorkspaceFile.Of("windows:local", 0,
            new WorkspaceDocument([Make.List("1", "A", Words, [Make.Record(1, "2026-01-01")])], []));
        var text = Encoding.UTF8.GetString(Workspace.EncodeFile(file));
        // The annotation is written even when empty, and absent record fields stay absent rather than null.
        Assert.Contains("\"annotation\":\"\"", text);
        Assert.DoesNotContain("null", text);
        Assert.StartsWith("{\"version\":1,", text);
        Assert.Contains("\"name\":\"A\"", text);
    }

    [Fact]
    public void InitialListsMatchThePacks()
    {
        var lists = Workspace.InitialLists();
        Assert.Equal(["sample-1", "sample-2"], lists.Select(list => list.Id).Take(2));
        Assert.Equal(193, lists[2].Words.Count);
        Assert.Equal(["linux-commands-basic", "postgresql-syntax"], new[] { lists[3], lists[^1] }.Select(list => list.Id));
        WordLists.ValidateAll(lists);
    }
}
