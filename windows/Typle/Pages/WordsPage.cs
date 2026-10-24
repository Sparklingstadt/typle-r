using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// 単語一覧 (src/app/(workspace)/words/page.tsx): the lists on the left, and the chosen list's words in a table of the
/// number and the text to type with its note under it. Narrower, the lists are chosen in a dialog so the words come first.
/// </summary>
public sealed class WordsPage : PageView
{
    private static readonly FontFamily Mono = new("Cascadia Mono,Consolas");

    private readonly ScrollViewer scroll;
    private readonly Grid layout = new() { ColumnSpacing = 24 };
    private readonly Border noticeHost = new();
    private readonly Border asideHost = new() { VerticalAlignment = VerticalAlignment.Top };
    private readonly Border mainHost = new() { VerticalAlignment = VerticalAlignment.Top };
    private readonly TextBox filter;
    private readonly Border categoryHost = new() { Margin = new Thickness(4, 0, 4, 4) };
    private readonly ScrollViewer optionsScroll = new() { MaxHeight = 576, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    private readonly ListOptions options = new();
    private readonly Border listsCard;
    // One category for both list choosers, as on the practice screen.
    private string? category;
    private bool wide = true;
    private string? scrolledTo;

    public WordsPage(AppModel app, Shell shell) : base(app, shell)
    {
        StackPanel content;
        (scroll, content) = PageScroll(1088);
        content.Children.Add(PageHeader(L("wordLists.words.title"), L("wordLists.words.description"), Shell.StorageBadge(App)));
        content.Children.Add(noticeHost);
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(320) });
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = Star() });
        Microsoft.UI.Xaml.Controls.Grid.SetColumn(mainHost, 1);
        layout.Children.Add(asideHost);
        layout.Children.Add(mainHost);
        layout.SizeChanged += (_, args) =>
        {
            var isWide = args.NewSize.Width >= 800;
            if (isWide == wide) return;
            wide = isWide;
            Refresh();
        };
        content.Children.Add(layout);

        filter = Input("", L("wordLists.words.filter"), height: 36);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(filter, L("wordLists.words.filter"));
        filter.TextChanged += (_, _) => RenderOptions();
        var search = SearchField(filter);
        search.Margin = new Thickness(4);
        var heading = T(L("wordLists.words.lists"), 15, FontWeights.Bold);
        heading.Margin = new Thickness(8, 4, 0, 0);
        listsCard = Card(Column(4, heading, search, categoryHost, optionsScroll), 12);
        Refresh();
    }

    public override UIElement Root => scroll;

    /// <summary>The list asked for, or the first; an unknown list is said and the first shown.</summary>
    private WordList? Current() => App.Lists.FirstOrDefault(list => list.Id == App.WordsList) ?? App.Lists.FirstOrDefault();

    public override void Refresh()
    {
        var list = Current();
        noticeHost.Child = App.WordsList is not null && App.Lists.All(item => item.Id != App.WordsList)
            ? Box(Row(8, Icon(Icons.Info, 16, P.MutedForeground), T(L("wordLists.page.notFound"))), P.Muted, 14)
            : null;
        noticeHost.Visibility = noticeHost.Child is null ? Visibility.Collapsed : Visibility.Visible;
        if (list is null)
        {
            layout.Visibility = Visibility.Collapsed;
            var create = Button(L("nav.links.create"), () => App.Navigate(Page.CreateList), icon: Icons.Add);
            create.HorizontalAlignment = HorizontalAlignment.Center;
            var empty = Column(12, T(L("wordLists.empty.title"), 16, FontWeights.Bold, align: TextAlignment.Center),
                T(L("wordLists.empty.description"), color: P.MutedForeground, align: TextAlignment.Center), create);
            noticeHost.Child = Dashed(empty);
            noticeHost.Visibility = Visibility.Visible;
            return;
        }
        layout.Visibility = Visibility.Visible;
        layout.ColumnDefinitions[0].Width = wide ? new GridLength(320) : new GridLength(0);
        layout.ColumnSpacing = wide ? 24 : 0;
        asideHost.Child = wide ? Detach(listsCard) : null;
        asideHost.Visibility = wide ? Visibility.Visible : Visibility.Collapsed;
        RenderOptions();
        mainHost.Child = Main(list);
    }

    private void Choose(string id)
    {
        filter.Text = "";
        App.ShowWords(id);
    }

    /// <summary>The lists on the left: the most recently practised first, narrowed down by the search and the category.</summary>
    private void RenderOptions()
    {
        if (Current() is not { } list) return;
        categoryHost.Child = ListParts.CategorySelect(WordLists.Labels(App.Lists), category, value =>
        {
            category = value;
            RenderOptions();
        });
        categoryHost.Visibility = categoryHost.Child is null ? Visibility.Collapsed : Visibility.Visible;
        var matching = ListParts.Matching(App.Lists, filter.Text, category);
        if (matching.Count == 0)
        {
            var empty = T(L("wordLists.words.noMatch"), color: P.MutedForeground);
            empty.Margin = new Thickness(8);
            optionsScroll.Content = empty;
            return;
        }
        optionsScroll.Content = options.Render(matching, App.Lists, list.Id, Choose, RenderOptions);
        if (scrolledTo == list.Id) return;
        scrolledTo = list.Id;
        // Keeps the chosen list in view inside the lists' scroller, without scrolling the page.
        Shell.Window.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () =>
        {
            if (options.SelectedElement is not { } chosen || optionsScroll.Content is not UIElement panel || chosen.XamlRoot is null) return;
            optionsScroll.UpdateLayout();
            var top = chosen.TransformToVisual(panel).TransformPoint(default).Y;
            if (top < optionsScroll.VerticalOffset || top + chosen.ActualHeight > optionsScroll.VerticalOffset + optionsScroll.ViewportHeight)
            {
                optionsScroll.ChangeView(null, Math.Max(0, top - 8), null, true);
            }
        });
    }

    private Border Main(WordList list)
    {
        var summary = list.Group is { } group
            ? L("wordLists.words.groupSummary", group, WordLists.LevelName(list), list.Words.Count)
            : L("wordLists.words.wordCount", list.Words.Count);
        var title = Column(4, T(list.Name, 18, FontWeights.Bold), ListParts.Labels(list, 0), T(summary, color: P.MutedForeground));
        var practice = Button(L("wordLists.words.practice"), () => App.Practise(list.Id), size: ButtonSize.Large, icon: Icons.Keyboard,
            label: L("wordLists.words.practiceList", list.Name));
        var edit = Button(L("wordLists.words.edit"), () => App.Navigate(Page.EditList, list.Id), Variant.Outline, ButtonSize.Large, Icons.Edit,
            L("wordLists.words.editList", list.Name));
        var switcher = wide
            ? null
            : Button(L("wordLists.words.switch"), () => _ = ChooseList(), Variant.Outline, ButtonSize.Large, Icons.UnfoldMore,
                L("wordLists.words.switchList", list.Name));
        var header = Cells(16, (Star(), title), (Auto, Row(8, switcher, practice, edit)));
        header.Padding = new Thickness(24, 16, 24, 16);
        ((FrameworkElement)header.Children[^1]).VerticalAlignment = VerticalAlignment.Top;
        return Card(Column(0, header, Hairline(), Table(list)));
    }

    /// <summary>
    /// Two columns: the number, and the text to type with its note under it. Long words, such as an SQL statement, wrap
    /// inside their cell.
    /// </summary>
    private static StackPanel Table(WordList list)
    {
        var heading = Cells(16,
            (Px(40), T("#", 12, FontWeights.Medium, P.MutedForeground, align: TextAlignment.Right)),
            (Star(), T(L("wordLists.editor.input"), 12, FontWeights.Medium, P.MutedForeground)));
        var headingBar = new Border
        {
            Child = heading, Height = 40, Background = Brush(Palette.WithAlpha(P.Muted, 0.5)), Padding = new Thickness(24, 0, 24, 0),
            BorderBrush = Brush(P.Border), BorderThickness = new Thickness(0, 0, 0, 1),
        };
        var rows = Column(0, headingBar);
        for (var i = 0; i < list.Words.Count; i++)
        {
            var word = list.Words[i];
            var input = new TextBlock
            {
                Text = word.Input, FontFamily = Mono, FontSize = 14, FontWeight = FontWeights.Medium, Foreground = Brush(P.Foreground),
                TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true,
            };
            var text = Column(4, input, word.Annotation.Length == 0 ? null : T(word.Annotation, 13, color: P.MutedForeground));
            var number = T((i + 1).ToString(System.Globalization.CultureInfo.InvariantCulture), 14, color: P.MutedForeground, tabular: true,
                align: TextAlignment.Right);
            number.VerticalAlignment = VerticalAlignment.Top;
            var row = Cells(16, (Px(40), number), (Star(), text));
            ((FrameworkElement)row.Children[1]).VerticalAlignment = VerticalAlignment.Top;
            rows.Children.Add(new Border
            {
                Child = row, Padding = new Thickness(24, 10, 24, 10), BorderBrush = Brush(P.Border),
                BorderThickness = new Thickness(0, 0, 0, i == list.Words.Count - 1 ? 0 : 1),
            });
        }
        return rows;
    }

    /// <summary>Choosing a list when the lists are not beside the words.</summary>
    private async Task ChooseList()
    {
        if (scroll.XamlRoot is not { } root) return;
        var box = new Border();
        var categoryBox = new Border();
        var choices = new ListOptions();
        var search = Input("", L("wordLists.words.filter"));
        ContentDialog? dialog = null;
        void Fill()
        {
            categoryBox.Child = ListParts.CategorySelect(WordLists.Labels(App.Lists), category, value =>
            {
                category = value;
                Fill();
            }, 40);
            var matching = ListParts.Matching(App.Lists, search.Text, category);
            box.Child = matching.Count == 0
                ? T(L("wordLists.words.noMatch"), color: P.MutedForeground)
                : choices.Render(matching, App.Lists, Current()?.Id, id =>
                {
                    dialog?.Hide();
                    Choose(id);
                }, Fill);
        }
        search.TextChanged += (_, _) => Fill();
        Fill();
        var body = Column(12, T(L("wordLists.words.pickerDescription"), color: P.MutedForeground), SearchField(search), categoryBox,
            new ScrollViewer { Content = box, MaxHeight = 420, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        body.Width = 420;
        dialog = Dialog(root, L("wordLists.words.pickerTitle"), body);
        dialog.CloseButtonText = L("common.close");
        await dialog.ShowAsync();
    }
}
