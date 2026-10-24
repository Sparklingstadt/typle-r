using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Typle.Core;
using Windows.System;
using static Typle.Support.Ui;

namespace Typle.Support;

/// <summary>
/// The editor's category, chosen from those in use or created, and its tags, chosen or created in the same way and shown
/// as chips (src/components/WordLists/LabelFields.tsx). Each opens a searchable list of the labels in use; typing a name
/// that is not there offers to create it, which also chooses it.
/// </summary>
public sealed class LabelFields
{
    private static Palette P => Palette.Current;

    // A comma (or 、 and ，) ends a tag, so a pasted "Go, CLI" becomes two.
    private static readonly char[] Separators = [',', '、', '，'];

    private readonly ListLabelCounts suggestions;
    private readonly Border categoryTrigger = new();
    private readonly Border tagsTrigger = new();
    private readonly Border chipsHost = new();

    public LabelFields(string? category, IReadOnlyList<string>? tags, ListLabelCounts suggestions)
    {
        Category = category ?? "";
        Tags = [.. tags ?? []];
        this.suggestions = suggestions;
        var categoryColumn = Column(8, T(Loc.L("wordLists.editor.category"), 14, FontWeights.SemiBold),
            Picker(categoryTrigger, Loc.L("wordLists.editor.category"), Loc.L("wordLists.editor.categoryPlaceholder"), WordLists.MaxCategory, CategoryOptions),
            T(Loc.L("wordLists.editor.categoryHelp"), 12, color: P.MutedForeground));
        var tagsColumn = Column(8, T(Loc.L("wordLists.editor.tags"), 14, FontWeights.SemiBold),
            Picker(tagsTrigger, Loc.L("wordLists.editor.tags"), Loc.L("wordLists.editor.tagPlaceholder"), WordLists.MaxTag, TagOptions), chipsHost,
            T(Loc.L("wordLists.editor.tagsHelp", WordLists.MaxTags), 12, color: P.MutedForeground));
        Root = Cells(16, (Star(), categoryColumn), (Star(), tagsColumn));
        foreach (var child in Root.Children) ((FrameworkElement)child).VerticalAlignment = VerticalAlignment.Top;
        Render();
    }

    public Grid Root { get; }

    public string Category { get; private set; }

    public List<string> Tags { get; private set; }

    public event Action? Changed;

    private static bool Same(string a, string b) => a.Trim().ToLowerInvariant() == b.Trim().ToLowerInvariant();

    private static bool Matches(string name, string query) => name.ToLowerInvariant().Contains(query.Trim().ToLowerInvariant());

    /// <summary>The tags with <paramref name="text"/> added: the separated parts, trimmed, unless already there, up to MaxTags.</summary>
    public static List<string> AddTags(IReadOnlyList<string> tags, string text) =>
        [.. (WordLists.NormalizeLabels(null, [.. tags, .. text.Split(Separators)]).Tags ?? []).Take(WordLists.MaxTags)];

    private void Render()
    {
        categoryTrigger.Child = Category.Trim().Length > 0
            ? T(Category, 14, maxLines: 1)
            : T(Loc.L("wordLists.editor.chooseCategory"), 14, color: P.MutedForeground, maxLines: 1);
        tagsTrigger.Child = T(Tags.Count >= WordLists.MaxTags ? Loc.L("wordLists.editor.tagsFull", WordLists.MaxTags) : Loc.L("wordLists.editor.addTag"), 14,
            color: P.MutedForeground, maxLines: 1);
        if (Tags.Count == 0)
        {
            chipsHost.Child = null;
            chipsHost.Visibility = Visibility.Collapsed;
            return;
        }
        var chips = new WrapPanel { HorizontalSpacing = 6, VerticalSpacing = 6 };
        foreach (var tag in Tags)
        {
            var remove = Button(null, () =>
            {
                Tags = Tags.Where(item => item != tag).ToList();
                Update();
            }, Variant.Ghost, ButtonSize.Icon, Icons.Close, Loc.L("wordLists.editor.removeTag", tag));
            remove.Width = remove.Height = remove.MinWidth = 24;
            remove.CornerRadius = new CornerRadius(12);
            ToolTipService.SetToolTip(remove, Loc.L("wordLists.editor.removeTag", tag));
            chips.Children.Add(new Border
            {
                Child = Row(2, T(tag, 13, maxLines: 1), remove), Height = 28, Background = Brush(P.Muted), CornerRadius = new CornerRadius(14),
                Padding = new Thickness(10, 0, 2, 0),
            });
        }
        chipsHost.Child = chips;
        chipsHost.Visibility = Visibility.Visible;
    }

    private void Update()
    {
        Render();
        Changed?.Invoke();
    }

    /// <summary>A trigger like the web's combobox, opening a search and the options <paramref name="fill"/> puts in it.</summary>
    private static Button Picker(Border trigger, string label, string placeholder, int maxLength, Action<string, StackPanel, Flyout> fill)
    {
        var content = Cells(8, (Star(), trigger), (Auto, Icon(Icons.UnfoldMore, 12, P.MutedForeground)));
        var button = Clickable(content, () => { }, label, 8, new Thickness(12, 0, 12, 0), P.Card);
        button.Height = 44;
        button.BorderBrush = Brush(P.Input);
        button.BorderThickness = new Thickness(1);
        var search = Input("", placeholder);
        search.MaxLength = maxLength;
        var options = Column(2);
        var panel = Column(8, search, new ScrollViewer { Content = options, MaxHeight = 280, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        panel.Padding = new Thickness(4);
        var flyout = new Flyout { Content = panel, Placement = FlyoutPlacementMode.BottomEdgeAlignedLeft };
        flyout.FlyoutPresenterStyle = new Style(typeof(FlyoutPresenter));
        flyout.FlyoutPresenterStyle.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(4)));
        flyout.FlyoutPresenterStyle.Setters.Add(new Setter(Control.BackgroundProperty, Brush(P.Card)));
        flyout.FlyoutPresenterStyle.Setters.Add(new Setter(Control.CornerRadiusProperty, new CornerRadius(10)));
        search.TextChanged += (_, _) => fill(search.Text, options, flyout);
        flyout.Opening += (_, _) =>
        {
            panel.Width = Math.Max(256, button.ActualWidth - 16);
            search.Text = "";
            fill("", options, flyout);
        };
        flyout.Opened += (_, _) => search.Focus(FocusState.Programmatic);
        // Enter takes the first option, such as the label to create.
        search.KeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Enter) return;
            args.Handled = true;
            if (options.Children.OfType<Button>().FirstOrDefault(option => option.IsEnabled) is { } first)
            {
                var peer = new Microsoft.UI.Xaml.Automation.Peers.ButtonAutomationPeer(first);
                (peer.GetPattern(Microsoft.UI.Xaml.Automation.Peers.PatternInterface.Invoke) as Microsoft.UI.Xaml.Automation.Provider.IInvokeProvider)?.Invoke();
            }
        };
        button.Flyout = flyout;
        return button;
    }

    private static Button Option(string text, bool chosen, Action onClick, string? glyph = null, bool enabled = true)
    {
        var mark = glyph is not null ? Icon(glyph, 14, P.MutedForeground) : chosen ? Icon(Icons.Check, 14, P.Foreground) : (UIElement)Spacer(14);
        var option = Clickable(Cells(8, (Px(16), mark), (Star(), T(text, 14, maxLines: 1))), onClick, text, 6, new Thickness(8, 7, 8, 7));
        option.IsEnabled = enabled;
        return option;
    }

    private void CategoryOptions(string query, StackPanel options, Flyout flyout)
    {
        options.Children.Clear();
        void Choose(string value)
        {
            Category = value;
            flyout.Hide();
            Update();
        }
        foreach (var item in suggestions.Categories.Where(item => Matches(item.Name, query)))
        {
            var chosen = Same(item.Name, Category);
            options.Children.Add(Option(item.Name, chosen, () => Choose(chosen ? "" : item.Name)));
        }
        var create = query.Trim().Length > 0 && suggestions.Categories.All(item => !Same(item.Name, query)) ? query.Trim() : "";
        if (create.Length > 0) options.Children.Insert(0, Option(Loc.L("wordLists.editor.create", create), false, () => Choose(create), Icons.Add));
        if (Category.Trim().Length > 0) options.Children.Add(Option(Loc.L("wordLists.editor.clearCategory"), false, () => Choose(""), Icons.Close));
        if (options.Children.Count == 0) options.Children.Add(Empty());
    }

    private void TagOptions(string query, StackPanel options, Flyout flyout)
    {
        options.Children.Clear();
        var full = Tags.Count >= WordLists.MaxTags;
        // Tags already on the list stay in the picker with a check, so choosing one again takes it off.
        var names = Tags.Where(tag => suggestions.Tags.All(item => !Same(item.Name, tag))).Concat(suggestions.Tags.Select(item => item.Name))
            .Where(name => Matches(name, query)).ToList();
        var parts = query.Split(Separators).Select(part => part.Trim())
            .Where(part => part.Length > 0 && !Tags.Concat(suggestions.Tags.Select(item => item.Name)).Any(name => Same(name, part))).ToList();
        if (parts.Count > 0 && !full)
        {
            options.Children.Add(Option(Loc.L("wordLists.editor.create", string.Join(", ", parts)), false, () =>
            {
                Tags = AddTags(Tags, query);
                Update();
                flyout.Hide();
            }, Icons.Add));
        }
        foreach (var name in names)
        {
            var chosen = Tags.Any(tag => Same(tag, name));
            options.Children.Add(Option(name, chosen, () =>
            {
                Tags = chosen ? Tags.Where(tag => !Same(tag, name)).ToList() : AddTags(Tags, name);
                Update();
                TagOptions(query, options, flyout);
            }, enabled: chosen || !full));
        }
        if (options.Children.Count == 0) options.Children.Add(Empty());
    }

    private static TextBlock Empty()
    {
        var text = T(Loc.L("wordLists.editor.noLabels"), 13, color: P.MutedForeground);
        text.Margin = new Thickness(8, 12, 8, 12);
        return text;
    }
}
