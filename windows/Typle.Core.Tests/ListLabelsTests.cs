using System.Globalization;

namespace Typle.Core.Tests;

public class ListLabelsTests
{
    private static readonly Word[] Words = [new("a", "a")];

    private static WordList List(string id, string? category = null, string[]? tags = null, string? group = null, string[]? levels = null,
        string name = "") =>
        Make.List(id, name.Length > 0 ? name : id, Words) with { Category = category, Tags = tags, Group = group, Levels = levels };

    [Fact]
    public void FiltersByCategoryAndEveryTagWithoutCase()
    {
        var list = List("1", "Programming", ["Go", "CLI"]);
        Assert.True(WordLists.MatchesFilter(list, ListFilter.None));
        Assert.True(WordLists.MatchesFilter(list, new ListFilter(" programming", ["go"])));
        Assert.False(WordLists.MatchesFilter(list, new ListFilter("", [])));
        Assert.True(WordLists.MatchesFilter(List("2"), new ListFilter("", [])));
        Assert.False(WordLists.MatchesFilter(list, new ListFilter(null, ["go", "vim"])));
        Assert.False(ListFilter.None.IsFiltered);
        Assert.True(new ListFilter("", []).IsFiltered);
    }

    [Fact]
    public void CountsLabelsOnceInTheFirstSpellingInNameOrder()
    {
        var labels = WordLists.Labels([List("1", "b", ["Go", "x2"]), List("2", "B ", ["go", "x10"]), List("3", "a"), List("4", " ")],
            CultureInfo.InvariantCulture);
        Assert.Equal([new LabelCount("a", 1), new LabelCount("b", 2)], labels.Categories);
        Assert.Equal([new LabelCount("Go", 2), new LabelCount("x2", 1), new LabelCount("x10", 1)], labels.Tags);
        Assert.Equal(1, labels.Uncategorized);
    }

    [Fact]
    public void GroupsListsAtTheirFirstPlace()
    {
        WordList[] lists = [List("1", group: "G"), List("2"), List("3", group: "G"), List("4", group: "Solo")];
        var entries = WordLists.GroupEntries(lists, list => list);
        // A group with one list is that list on its own.
        Assert.Equal(["G", null, null], entries.Select(entry => entry.Group));
        Assert.Equal("4", entries[2].Items[0].Id);
        Assert.Equal(["1", "3"], entries[0].Items.Select(list => list.Id));
        // A search that finds one list of a group still shows it as the group.
        var found = WordLists.GroupEntries([lists[2]], list => list, lists);
        Assert.Equal("G", found[0].Group);
    }

    [Fact]
    public void OffersLevelsStepByStep()
    {
        WordList[] lists =
        [
            List("1", group: "G", levels: ["基本", "初級"]), List("2", group: "G", levels: ["基本", "中級"]),
            List("3", group: "G", levels: ["応用", "初級"]), List("4", group: "G", name: "まとめ"),
        ];
        Assert.Equal([new LevelStep(["基本", "応用", "まとめ"], null)], WordLists.LevelSteps(lists, []));
        Assert.Equal([new LevelStep(["基本", "応用", "まとめ"], "基本"), new LevelStep(["初級", "中級"], null)],
            WordLists.LevelSteps(lists, ["基本"]));
        Assert.Equal("2", WordLists.ListAtLevels(lists, ["基本", "中級"])?.Id);
        Assert.Equal("4", WordLists.ListAtLevels(lists, ["まとめ"])?.Id);
        Assert.Null(WordLists.ListAtLevels(lists, ["基本"]));
        Assert.Equal("基本・初級", WordLists.LevelName(lists[0]));
        Assert.Equal("まとめ", WordLists.LevelName(lists[3]));
    }

    [Fact]
    public void SavesTheGroupTrimmedAndSearchesIt()
    {
        var saved = WordLists.Save([], List("1", group: " G ", levels: [" 基本 ", ""]), editing: false)[0];
        Assert.Equal("G", saved.Group);
        Assert.Equal(["基本"], saved.Levels);
        Assert.Null(WordLists.Save([], List("1", group: " ", levels: ["基本"]), editing: false)[0].Levels);
        Assert.True(WordLists.MatchesQuery(saved, "g"));
    }

    [Fact]
    public void LeavesThePauseOutOfTheTime()
    {
        Word[] words = [new("ab", "ab")];
        Assert.Equal(new TypingSession(), Typing.Pause(new TypingSession(), 500));
        var s = Typing.TypeInput(new TypingSession(), words, "a", 1000);
        s = Typing.Pause(s, 2000);
        Assert.Equal(1000, Typing.Elapsed(s, 9000));
        Assert.Equal(s, Typing.Pause(s, 3000));
        // Typing resumes the clock by itself.
        s = Typing.TypeInput(s, words, "ab", 7000);
        Assert.Equal(1, Typing.Result(s).Time);
        Assert.Null(s.PausedAt);
    }

    [Fact]
    public void PutsTheMostRecentlyPractisedFirst()
    {
        WordList[] lists =
        [
            List("1"), List("2") with { Records = [Make.Record(1, "2026-01-01T00:00:00Z")] }, List("3"),
            List("4") with { Records = [Make.Record(1, "2026-02-01T00:00:00Z")] },
        ];
        Assert.Equal(["4", "2", "1", "3"], WordLists.ByRecentPractice(lists).Select(list => list.Id));
    }
}
