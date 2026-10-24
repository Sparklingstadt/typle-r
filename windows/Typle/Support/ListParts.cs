using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Typle.Core;
using static Typle.Support.Ui;

namespace Typle.Support;

/// <summary>
/// The parts that show and choose word lists on several pages: a list's category and tags
/// (src/components/WordLists/ListLabels.tsx), the category filter (src/components/Practice/CategorySelect.tsx) and the
/// summary of a list to choose.
/// </summary>
public static class ListParts
{
    private static Palette P => Palette.Current;

    public const string FolderGlyph = "";

    /// <summary>A list's category and tags after its name, such as [プログラミング] #Kotlin #JVM. Null for a list without them.</summary>
    public static WrapPanel? Labels(WordList list, double top = 2)
    {
        if (string.IsNullOrWhiteSpace(list.Category) && (list.Tags?.Count ?? 0) == 0) return null;
        var panel = new WrapPanel { HorizontalSpacing = 4, VerticalSpacing = 4, Margin = new Thickness(0, top, 0, top) };
        if (!string.IsNullOrWhiteSpace(list.Category))
        {
            var category = new Border
            {
                Child = Row(4, Icon(FolderGlyph, 10, P.Foreground), T(list.Category, 11, FontWeights.Medium, maxLines: 1)),
                Height = 20, Background = Brush(P.Muted), CornerRadius = new CornerRadius(6), Padding = new Thickness(6, 0, 6, 0),
            };
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(category, Loc.L("wordLists.labels.category") + ": " + list.Category);
            panel.Children.Add(category);
        }
        foreach (var tag in list.Tags ?? [])
        {
            var chip = new Border
            {
                Child = T("#" + tag, 11, color: P.MutedForeground, maxLines: 1), Height = 20, BorderBrush = Brush(P.Border),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Padding = new Thickness(6, 0, 6, 0),
            };
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(chip, Loc.L("wordLists.labels.tag") + ": " + tag);
            panel.Children.Add(chip);
        }
        return panel;
    }

    /// <summary>
    /// Narrows the lists to choose from down to one category: null is every list and "" those without one. Null (left
    /// out) while no list has a category.
    /// </summary>
    public static Button? CategorySelect(ListLabelCounts labels, string? value, Action<string?> onChange, double height = 36)
    {
        if (labels.Categories.Count == 0 && value is null) return null;
        string Option(string name, int count) => Loc.L("wordLists.filter.option", name, count);
        var options = new List<(string? Value, string Title)> { (null, Loc.L("wordLists.filter.allCategories")) };
        options.AddRange(labels.Categories.Select(item => ((string?)item.Name, Option(item.Name, item.Count))));
        if (value is { Length: > 0 } && labels.Categories.All(item => item.Name != value)) options.Add((value, value));
        if (labels.Uncategorized > 0) options.Add(("", Option(Loc.L("wordLists.filter.noCategory"), labels.Uncategorized)));
        var shown = options.FirstOrDefault(option => option.Value == value).Title ?? options[0].Title;
        var content = Cells(8, (Star(), T(shown, 14, maxLines: 1)), (Auto, Icon(Icons.ChevronDown, 10, P.MutedForeground)));
        var button = Clickable(content, () => { }, Loc.L("wordLists.filter.category") + " " + shown, 8, new Thickness(10, 0, 10, 0), P.Card);
        button.Height = height;
        button.BorderBrush = Brush(P.Input);
        button.BorderThickness = new Thickness(1);
        var menu = Menu(options.Select(option => (MenuFlyoutItemBase)MenuItem(option.Title, () => onChange(option.Value),
            selected: option.Value == value)).ToArray());
        menu.Placement = FlyoutPlacementMode.BottomEdgeAlignedLeft;
        button.Flyout = menu;
        return button;
    }

    /// <summary>The words and best of a list to choose: 「90語 · ベスト 0.98 秒」.</summary>
    public static string Summary(WordList list) => Records.ListBest(list) is { } best
        ? Loc.L("practice.options.withBest", list.Words.Count, Format.Seconds(best.Time))
        : Loc.L("practice.options.noRecord", list.Words.Count);

    /// <summary>
    /// The lists both practice choosers offer: the most recently practised first, narrowed down by the category and by a
    /// search of the name, group, category and tags.
    /// </summary>
    public static IReadOnlyList<WordList> Matching(IReadOnlyList<WordList> lists, string query, string? category)
    {
        var needle = query.Trim().ToLowerInvariant();
        bool Has(string? text) => text?.ToLowerInvariant().Contains(needle) ?? false;
        return WordLists.ByRecentPractice(lists).Where(list => WordLists.MatchesFilter(list, new ListFilter(category, [])) &&
            (Has(list.Name) || Has(list.Group) || Has(list.Category) || (list.Tags ?? []).Any(Has))).ToList();
    }
}

/// <summary>
/// The lists to choose from (src/components/Practice/WordListOptions.tsx). The lists of a group (such as Linuxコマンド in
/// 基本, オプション and 応用) are one option, which opens to have its levels chosen one step after another. Each group's
/// open state and levels picked so far are kept here across refreshes; picking a list elsewhere starts its group again
/// from that list's levels.
/// </summary>
public sealed class ListOptions
{
    private static Palette P => Palette.Current;

    private sealed class GroupState(string selectedId, bool open, List<string> chosen)
    {
        public string SelectedId { get; } = selectedId;

        public bool Open { get; set; } = open;

        public List<string> Chosen { get; set; } = chosen;
    }

    private readonly Dictionary<string, GroupState> groups = [];

    /// <summary>The selected list's option, once rendered, so a scroller can keep it in view.</summary>
    public FrameworkElement? SelectedElement { get; private set; }

    /// <param name="lists">The lists to show, in the order to show them.</param>
    /// <param name="saved">Every list in its saved order, which a group's levels are offered in.</param>
    /// <param name="changed">Draws the options again after a group was opened or a level chosen.</param>
    public StackPanel Render(IReadOnlyList<WordList> lists, IReadOnlyList<WordList> saved, string? selectedId, Action<string> onSelect, Action changed)
    {
        SelectedElement = null;
        var column = Column(4);
        foreach (var entry in WordLists.GroupEntries(lists, list => list, saved))
        {
            if (entry.Group is { } group)
            {
                var members = entry.Items.OrderBy(list => IndexOf(saved, list)).ToList();
                column.Children.Add(Group(group, members, selectedId, onSelect, changed));
                continue;
            }
            var item = entry.Items[0];
            var selected = item.Id == selectedId;
            var row = Option(item.Name, item, ListParts.Summary(item), selected, null, () => onSelect(item.Id),
                Loc.L(selected ? "practice.options.selected" : "practice.options.select", item.Name));
            if (selected) SelectedElement = row;
            column.Children.Add(row);
        }
        return column;
    }

    private static int IndexOf(IReadOnlyList<WordList> saved, WordList list)
    {
        for (var i = 0; i < saved.Count; i++)
        {
            if (saved[i].Id == list.Id) return i;
        }
        return int.MaxValue;
    }

    private static Button Option(string title, WordList labelsOf, string summary, bool selected, bool? open, Action onClick, string label)
    {
        var radio = new Border
        {
            Width = 18, Height = 18, CornerRadius = new CornerRadius(9), BorderThickness = new Thickness(2),
            BorderBrush = Brush(selected ? P.Primary : P.Border), Background = Brush(selected ? P.Primary : Microsoft.UI.Colors.Transparent),
            Child = selected ? Icon(Icons.Check, 9, P.PrimaryForeground) : null, VerticalAlignment = VerticalAlignment.Center,
        };
        var text = Column(1, T(title, 14, FontWeights.Medium, maxLines: 2), ListParts.Labels(labelsOf),
            T(summary, 12, color: P.MutedForeground, maxLines: 2));
        var chevron = open is { } isOpen ? Icon(isOpen ? Icons.ChevronUp : Icons.ChevronDown, 12, P.MutedForeground) : null;
        var row = Cells(12, (Auto, radio), (Star(), text), (Auto, chevron));
        var button = Clickable(row, onClick, label, 8, new Thickness(12, 8, 12, 8), selected ? P.Muted : null);
        button.MinHeight = 56;
        return button;
    }

    private StackPanel Group(string group, IReadOnlyList<WordList> lists, string? selectedId, Action<string> onSelect, Action changed)
    {
        var current = lists.FirstOrDefault(list => list.Id == selectedId);
        // The group of the list being practised starts open, at its levels.
        if (!groups.TryGetValue(group, out var state) || state.SelectedId != (current?.Id ?? ""))
        {
            state = new GroupState(current?.Id ?? "", current is not null,
                current is null ? [] : current.Levels is { Count: > 0 } currentLevels ? [.. currentLevels] : [current.Name]);
            groups[group] = state;
        }
        var summary = current is not null
            ? Loc.L("practice.options.groupSelected", WordLists.LevelName(current), ListParts.Summary(current))
            : Loc.L("practice.options.groupLists", lists.Count);
        var header = Option(group, lists[0], summary, current is not null, state.Open, () =>
        {
            state.Open = !state.Open;
            changed();
        }, group);
        var column = Column(0, header);
        if (current is not null) SelectedElement = header;
        if (!state.Open) return column;

        var steps = WordLists.LevelSteps(lists, state.Chosen);
        var levels = Column(8);
        levels.Padding = new Thickness(42, 4, 12, 10);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(levels, Loc.L("practice.options.levels", group));
        for (var index = 0; index < steps.Count; index++)
        {
            var step = steps[index];
            var stepIndex = index;
            var row = new WrapPanel { HorizontalSpacing = 6, VerticalSpacing = 6 };
            foreach (var level in step.Options)
            {
                var pressed = step.Chosen == level;
                var next = state.Chosen.Take(stepIndex).Append(level).ToList();
                var list = WordLists.ListAtLevels(lists, next);
                var final = list is not null && WordLists.LevelSteps(lists, next).Count == stepIndex + 1;
                var pill = Clickable(T(level, 13, color: pressed ? P.PrimaryForeground : P.Foreground, maxLines: 1), () =>
                {
                    state.Chosen = next;
                    // A level that leaves one list to practise picks it; otherwise the next step is asked.
                    if (final) onSelect(list!.Id);
                    else changed();
                }, final ? $"{list!.Name} · {ListParts.Summary(list)}" : level, 16, new Thickness(12, 0, 12, 0), pressed ? P.Primary : P.Card);
                pill.Height = 32;
                pill.HorizontalAlignment = HorizontalAlignment.Left;
                pill.BorderBrush = Brush(pressed ? P.Primary : P.Border);
                pill.BorderThickness = new Thickness(1);
                if (pressed)
                {
                    pill.Resources["ButtonBackgroundPointerOver"] = Brush(Palette.WithAlpha(P.Primary, 0.9));
                    pill.Resources["ButtonBackgroundPressed"] = Brush(Palette.WithAlpha(P.Primary, 0.9));
                    pill.Resources["ButtonForegroundPointerOver"] = Brush(P.PrimaryForeground);
                }
                if (final) ToolTipService.SetToolTip(pill, $"{list!.Name} · {ListParts.Summary(list)}");
                row.Children.Add(pill);
            }
            levels.Children.Add(row);
        }
        if (steps.Count > 0 && steps[^1].Chosen is null) levels.Children.Add(T(Loc.L("practice.options.chooseLevel"), 12, color: P.MutedForeground));
        column.Children.Add(levels);
        return column;
    }
}
