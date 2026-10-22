using System.Globalization;
using Microsoft.UI.Input;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Typle.Core;
using Typle.Support;
using Windows.Storage.Pickers;
using Windows.System;
using Windows.UI.Core;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// Creating or editing a list, as a page like /create and /edit/&lt;id&gt; (src/components/WordListEditor.tsx). An empty
/// 入力する文字 means the same as the word shown, and whitespace in words is kept, since it can be meant to be typed. The
/// fields stay the same while typing; the rows are laid out again only when they are added, moved or removed.
/// </summary>
public sealed class ListEditorPage : PageView
{
    private sealed class EditorRow
    {
        public EditorRow(Word word)
        {
            Display = Ui.Input(word.Display);
            // An input equal to the word shown is shown as empty, as the web editor does.
            Input = Ui.Input(word.Input == word.Display ? "" : word.Input);
            Annotation = Ui.Input(word.Annotation);
        }

        public TextBox Display { get; }

        public TextBox Input { get; }

        public TextBox Annotation { get; }

        public string? Error { get; set; }

        public Word Word => new(Display.Text, Input.Text, Annotation.Text);

        public bool Filled => Display.Text.Length > 0 || Input.Text.Length > 0 || Annotation.Text.Length > 0;

        public TextBox Cell(int column) => column switch
        {
            0 => Display,
            1 => Input,
            _ => Annotation,
        };
    }

    private readonly WordList? original;
    private readonly bool missing;
    private readonly ScrollViewer scroll;
    private readonly Border errorHost = new();
    private readonly TextBox name;
    private readonly TextBlock nameHelp;
    private readonly StackPanel rowsPanel = new();
    private readonly Border countHost = new();
    private readonly Border recountHost = new();
    private readonly Border footerHost = new();
    private readonly List<EditorRow> rows = [];
    private readonly string savedName;
    private readonly List<Word> savedWords;
    private bool saving;
    private bool nameInvalid;

    public ListEditorPage(AppModel app, Shell shell, string? listId) : base(app, shell)
    {
        original = listId is null ? null : app.Lists.FirstOrDefault(list => list.Id == listId);
        missing = listId is not null && original is null;
        StackPanel content;
        (scroll, content) = PageScroll();
        name = Ui.Input(original?.Name ?? "", height: 44);
        nameHelp = T(L("wordLists.editor.nameHelp"), 12, color: P.MutedForeground);
        if (missing)
        {
            content.Children.Add(Card(T(L("wordLists.page.notFound")), 24));
            savedName = "";
            savedWords = [];
            return;
        }
        foreach (var word in original?.Words ?? [new Word("", "")]) rows.Add(MakeRow(word));
        savedName = name.Text;
        savedWords = Words();
        name.TextChanged += (_, _) => UpdateFooter();
        name.PreviewKeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Enter || CtrlDown()) return;
            args.Handled = true;
            if (rows.Count > 0) Focus(rows[0], 0);
        };

        var back = Clickable(Row(6, Icon(Icons.ChevronLeft, 12, P.MutedForeground), T(L("wordLists.editor.back"), color: P.MutedForeground)),
            () => _ = Leave(), L("wordLists.editor.back"), 8, new Thickness(4));
        back.HorizontalAlignment = HorizontalAlignment.Left;
        content.Children.Add(back);
        content.Children.Add(PageHeader(original is null ? L("wordLists.page.createTitle") : L("wordLists.page.editTitle"), Description(original),
            Shell.StorageBadge(App)));
        content.Children.Add(errorHost);

        // The name.
        content.Children.Add(Card(Column(8, Row(4, T(L("wordLists.editor.name"), 14, FontWeights.SemiBold), T("*", 14, FontWeights.SemiBold, P.Destructive)),
            name, nameHelp), 24));

        // The words.
        var import = Button(L("wordLists.import.open"), () => _ = Import(), Variant.Outline, ButtonSize.Small, Icons.Import);
        var wordsHeader = Cells(10, (Auto, T(L("wordLists.editor.words"), 16, FontWeights.Bold)), (Auto, countHost), (Star(), null), (Auto, import));
        wordsHeader.Padding = new Thickness(24, 16, 24, 16);
        TextBlock Heading(string text, bool strong = false) => T(text, 12, FontWeights.Medium, strong ? P.Foreground : P.MutedForeground, 1);
        var columns = Cells(12,
            (Px(60), Heading("#")),
            (Star(), Row(0, Heading(L("wordLists.editor.display")), T("*", 12, color: P.Destructive))),
            (Star(), Row(4, Heading(L("wordLists.editor.input"), true), Heading(L("wordLists.editor.inputHint")))),
            (Star(), Heading(L("wordLists.editor.annotationOptional"))),
            (Px(84), null));
        var columnsBar = new Border
        {
            Child = columns, Height = 34, Background = Brush(Palette.WithAlpha(P.Muted, 0.5)), BorderBrush = Brush(P.Border),
            BorderThickness = new Thickness(0, 1, 0, 1), Padding = new Thickness(24, 0, 24, 0),
        };
        var addRow = Clickable(Row(6, Icon(Icons.Add, 14, P.MutedForeground), T(L("wordLists.editor.addWord"), color: P.MutedForeground)),
            AddRow, L("wordLists.editor.addWord"), 10);
        addRow.HorizontalContentAlignment = HorizontalAlignment.Center;
        var addBox = Dashed(addRow, 0, 10);
        addBox.Height = 44;
        var shortcuts = Row(8, Kbd("Enter"), T(L("wordLists.editor.shortcutNext"), 12, color: P.MutedForeground), T("・", 12, color: P.MutedForeground),
            Kbd("Ctrl+Enter"), T(L("wordLists.editor.shortcutSave"), 12, color: P.MutedForeground), T("・", 12, color: P.MutedForeground),
            Kbd("Alt+↑↓"), T(L("wordLists.editor.shortcutMove"), 12, color: P.MutedForeground));
        var below = Column(12, addBox, shortcuts);
        below.Padding = new Thickness(24, 16, 24, 16);
        content.Children.Add(Card(Column(0, wordsHeader, columnsBar, rowsPanel, Hairline(), below)));
        content.Children.Add(recountHost);
        content.Children.Add(footerHost);

        // Ctrl+Enter saves, as on the web.
        scroll.PreviewKeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Enter || !CtrlDown()) return;
            args.Handled = true;
            if (!saving) _ = Save();
        };
        LayoutRows();
        UpdateFooter();
    }

    public override UIElement Root => scroll;

    public override void Shown()
    {
        if (original is null && !missing) name.Focus(FocusState.Programmatic);
    }

    // The editor keeps its own copy until it is saved; changes elsewhere do not reach the fields.
    public override void Refresh()
    {
    }

    private static bool CtrlDown() =>
        InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control).HasFlag(CoreVirtualKeyStates.Down);

    private static bool AltDown() =>
        InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Menu).HasFlag(CoreVirtualKeyStates.Down);

    private List<Word> Words() => rows.Select(row => row.Word).ToList();

    private bool Changed => savedName != name.Text || !savedWords.SequenceEqual(Words());

    private static string Description(WordList? original)
    {
        if (original is null) return L("wordLists.editor.description");
        var last = WordLists.Overviews([original])[0].LastPracticed;
        var practice = original.Records.Count == 0
            ? L("wordLists.row.notPracticed")
            : L("wordLists.row.practiced", original.Records.Count,
                Format.Day(last is { } millis ? DateTimeOffset.FromUnixTimeMilliseconds((long)millis) : DateTimeOffset.UtcNow));
        return L("wordLists.page.editDescription", original.Words.Count, practice);
    }

    // MARK: Rows

    private EditorRow MakeRow(Word word)
    {
        var row = new EditorRow(word);
        row.Display.PlaceholderText = L("wordLists.editor.displayPlaceholder");
        row.Annotation.PlaceholderText = L("wordLists.editor.annotationPlaceholder");
        row.Input.PlaceholderText = word.Display;
        row.Display.TextChanged += (_, _) =>
        {
            // An empty 入力する文字 types the word shown.
            row.Input.PlaceholderText = row.Display.Text;
            UpdateFooter();
        };
        row.Input.TextChanged += (_, _) => UpdateFooter();
        row.Annotation.TextChanged += (_, _) => UpdateFooter();
        for (var column = 0; column < 3; column++)
        {
            var cell = row.Cell(column);
            var index = column;
            // Before the field moves its caret with the arrow keys.
            cell.PreviewKeyDown += (_, args) => CellKey(row, index, args);
        }
        return row;
    }

    private void CellKey(EditorRow row, int column, KeyRoutedEventArgs args)
    {
        if (args.Key == VirtualKey.Enter && !CtrlDown())
        {
            args.Handled = true;
            Next(row, column);
        }
        else if (args.Key is VirtualKey.Up or VirtualKey.Down && AltDown())
        {
            // Alt+↑↓ moves the word, in place of dragging it.
            args.Handled = true;
            var from = rows.IndexOf(row);
            Move(from, from + (args.Key == VirtualKey.Up ? -1 : 1));
            Focus(row, column);
        }
    }

    /// <summary>Enter moves to the next field, then the next row, and adds a row after the last.</summary>
    private void Next(EditorRow row, int column)
    {
        if (column < 2)
        {
            Focus(row, column + 1);
            return;
        }
        var index = rows.IndexOf(row);
        if (index + 1 < rows.Count) Focus(rows[index + 1], 0);
        else if (rows.Count < WordLists.MaxWords) AddRow();
    }

    private void Focus(EditorRow row, int column) =>
        Shell.Window.DispatcherQueue.TryEnqueue(() => row.Cell(column).Focus(FocusState.Keyboard));

    private void AddRow()
    {
        if (rows.Count >= WordLists.MaxWords) return;
        var row = MakeRow(new Word("", ""));
        rows.Add(row);
        LayoutRows();
        UpdateFooter();
        Focus(row, 0);
    }

    private void Move(int from, int to)
    {
        if (from < 0 || from >= rows.Count || to < 0 || to >= rows.Count || from == to) return;
        var row = rows[from];
        rows.RemoveAt(from);
        rows.Insert(to, row);
        LayoutRows();
        UpdateFooter();
    }

    private void Remove(int index)
    {
        if (index < 0 || index >= rows.Count) return;
        rows.RemoveAt(index);
        if (rows.Count == 0) rows.Add(MakeRow(new Word("", "")));
        LayoutRows();
        UpdateFooter();
    }

    private void LayoutRows()
    {
        rowsPanel.Children.Clear();
        countHost.Child = CountBadge($"{rows.Count} / {Format.Number(WordLists.MaxWords, 0)}");
        for (var index = 0; index < rows.Count; index++)
        {
            if (index > 0) rowsPanel.Children.Add(Hairline());
            rowsPanel.Children.Add(RowView(rows[index], index));
        }
    }

    private StackPanel RowView(EditorRow row, int index)
    {
        var number = index + 1;
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(row.Display, L("wordLists.editor.displayLabel", number));
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(row.Input, L("wordLists.editor.inputLabel", number));
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(row.Annotation, L("wordLists.editor.annotationLabel", number));
        StyleInput(row.Display, row.Error is not null && Text.IsBlankText(row.Display.Text));
        StyleInput(row.Input, row.Error is not null && row.Input.Text.Length > 0);
        var count = rows.Count;
        var more = Button(null, () => { }, Variant.Ghost, ButtonSize.Icon, Icons.More, L("wordLists.editor.wordActions", number));
        more.Flyout = Menu(
            MenuItem(L("wordLists.editor.moveUp"), () => Move(index, index - 1), Icons.ArrowUp, index > 0),
            MenuItem(L("wordLists.editor.moveDown"), () => Move(index, index + 1), Icons.ArrowDown, index < count - 1),
            MenuItem(L("wordLists.editor.moveFirst"), () => Move(index, 0), Icons.Top, index > 0),
            MenuItem(L("wordLists.editor.moveLast"), () => Move(index, count - 1), Icons.Bottom, index < count - 1),
            new MenuFlyoutSeparator(),
            MenuItem(L("wordLists.editor.deleteWord"), () => Remove(index), Icons.Delete, destructive: true));
        var delete = Button(null, () => Remove(index), Variant.Ghost, ButtonSize.Icon, Icons.Delete, L("wordLists.editor.deleteWordN", number),
            enabled: !(count == 1 && !row.Filled));
        var cells = Cells(12,
            (Px(60), T(number.ToString(CultureInfo.InvariantCulture), color: P.MutedForeground, tabular: true)),
            (Star(), Detach(row.Display)),
            (Star(), Detach(row.Input)),
            (Star(), Detach(row.Annotation)),
            (Auto, more),
            (Auto, delete));
        var view = Column(6, cells);
        if (row.Error is { } error)
        {
            var text = T(error, 12, color: P.Destructive);
            text.Margin = new Thickness(72, 0, 0, 0);
            view.Children.Add(text);
        }
        view.Padding = new Thickness(24, 8, 24, 8);
        return view;
    }

    private void UpdateFooter()
    {
        if (missing) return;
        var changed = Changed;
        var filled = rows.Count(row => row.Filled);
        var cancel = Button(L("common.form.cancel"), () => _ = Leave(), Variant.Ghost, ButtonSize.Large);
        var save = Button(L("wordLists.editor.save"), () => _ = Save(), size: ButtonSize.Large, enabled: !saving,
            trailing: T("Ctrl+Enter", 11, color: Palette.WithAlpha(P.PrimaryForeground, 0.6)));
        var footer = Card(Cells(12,
            (Auto, T(changed ? L("wordLists.editor.unsaved") : L("wordLists.editor.noChanges"), color: changed ? P.Foreground : P.MutedForeground)),
            (Auto, T(L("wordLists.editor.wordTotal", filled), color: P.MutedForeground)),
            (Star(), null),
            (Auto, cancel),
            (Auto, save)));
        footer.Padding = new Thickness(20, 14, 20, 14);
        footerHost.Child = footer;
        var words = rows.Count;
        recountHost.Child = original is not null && original.Records.Count > 0 && original.Words.Count != words && WordLists.CurrentRecordCount(original) > 0
            ? Box(T(L("wordLists.editor.recount", original.Words.Count, words, WordLists.CurrentRecordCount(original)), 13, color: P.Amber), P.AmberSoft, 14)
            : null;
        recountHost.Visibility = recountHost.Child is null ? Visibility.Collapsed : Visibility.Visible;
    }

    private void ShowError(string? message)
    {
        errorHost.Child = message is null
            ? null
            : Box(Row(6, Icon(Icons.Warning, 16, P.Destructive), T(message, color: P.Destructive)), Palette.WithAlpha(P.Destructive, 0.05), 14);
        errorHost.Visibility = message is null ? Visibility.Collapsed : Visibility.Visible;
    }

    // MARK: Leaving and saving

    private async Task Leave()
    {
        if (Changed && !await Confirm(Shell.XamlRoot, L("wordLists.editor.discardTitle"), L("wordLists.editor.discardDescription"),
                L("wordLists.editor.discard"), L("wordLists.editor.keepEditing")))
        {
            return;
        }
        App.Navigate(Page.Lists);
    }

    private async Task Save()
    {
        ShowError(null);
        // Empty rows at the end are ignored; a row with only a note or input must have its word filled in.
        var kept = rows.ToList();
        while (kept.Count > 0 && !kept[^1].Filled) kept.RemoveAt(kept.Count - 1);
        var errors = 0;
        foreach (var row in rows)
        {
            row.Error = !kept.Contains(row) ? null
                : Text.IsBlankText(row.Display.Text) ? L("wordLists.editor.displayRequired")
                : row.Input.Text.Length > 0 && Text.IsBlankText(row.Input.Text) ? L("wordLists.editor.inputBlank")
                : null;
            if (row.Error is not null) errors++;
        }
        nameInvalid = Text.IsBlankText(name.Text);
        StyleInput(name, nameInvalid);
        nameHelp.Text = nameInvalid ? Loc.ErrorText(new TypleException("listNameRequired")) : L("wordLists.editor.nameHelp");
        nameHelp.Foreground = Brush(nameInvalid ? P.Destructive : P.MutedForeground);
        LayoutRows();
        if (errors > 0 || nameInvalid)
        {
            ShowError(L("wordLists.editor.errorCount", errors + (nameInvalid ? 1 : 0)));
            return;
        }
        var list = new WordList
        {
            Id = original?.Id ?? Ids.Random(), Name = name.Text,
            Words = kept.Select(row => new Word(row.Display.Text, row.Input.Text.Length == 0 ? row.Display.Text : row.Input.Text, row.Annotation.Text)).ToList(),
            Records = original?.Records ?? [], CreatedAt = original?.CreatedAt ?? Dates.IsoString(DateTimeOffset.UtcNow),
        };
        saving = true;
        UpdateFooter();
        try
        {
            await App.SaveListAsync(list, original is not null);
            App.Navigate(Page.Lists);
        }
        catch (Exception error)
        {
            ShowError(Loc.ErrorText(error));
        }
        saving = false;
        UpdateFooter();
    }

    // MARK: Import

    /// <summary>Reads a CSV or TSV file; with words already entered, asks whether to replace them or add to them.</summary>
    private async Task Import()
    {
        ShowError(null);
        var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add(".csv");
        picker.FileTypeFilter.Add(".tsv");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(Shell.Window));
        IReadOnlyList<Word> read;
        string fileName;
        try
        {
            var file = await picker.PickSingleFileAsync();
            if (file is null) return;
            fileName = file.Name;
            var format = WordFiles.FormatOf(fileName) ?? throw new TypleException("importFileType");
            // Reads one byte past the limit, so a larger file is refused without reading all of it.
            var data = await Task.Run(() =>
            {
                using var stream = File.OpenRead(file.Path);
                var buffer = new byte[WordFiles.MaxImportBytes + 1];
                var total = 0;
                int count;
                while (total < buffer.Length && (count = stream.Read(buffer, total, buffer.Length - total)) > 0) total += count;
                return buffer[..total];
            });
            read = WordFiles.ParseData(data, format);
        }
        catch (Exception error) when (error is TypleException)
        {
            ShowError(Loc.ErrorText(error));
            return;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            ShowError(Loc.ErrorText(new TypleException("localReadFailed")));
            return;
        }
        if (Text.IsBlankText(name.Text)) name.Text = Path.GetFileNameWithoutExtension(fileName);
        var filled = rows.Count(row => row.Filled);
        if (filled == 0)
        {
            Add(read, replacing: true);
            return;
        }
        var dialog = Dialog(Shell.XamlRoot, L("wordLists.import.existing"), T(L("wordLists.import.appendHint", filled, read.Count), color: P.MutedForeground));
        dialog.PrimaryButtonText = L("wordLists.import.add", read.Count);
        dialog.SecondaryButtonText = L("wordLists.import.replaceWith", read.Count);
        dialog.CloseButtonText = L("common.form.cancel");
        dialog.SecondaryButtonStyle = ButtonStyle(P.Destructive, Microsoft.UI.Colors.White);
        dialog.DefaultButton = ContentDialogButton.Primary;
        switch (await dialog.ShowAsync())
        {
            case ContentDialogResult.Primary:
                Add(read, replacing: false);
                break;
            case ContentDialogResult.Secondary:
                Add(read, replacing: true);
                break;
        }
    }

    private void Add(IReadOnlyList<Word> imports, bool replacing)
    {
        List<EditorRow> kept = replacing ? [] : rows.Where(row => row.Filled).ToList();
        if (kept.Count + imports.Count > WordLists.MaxWords)
        {
            ShowError(Loc.ErrorText(new TypleException("importTooManyRows")));
            return;
        }
        rows.Clear();
        rows.AddRange(kept);
        rows.AddRange(imports.Select(MakeRow));
        LayoutRows();
        UpdateFooter();
    }
}

internal static class Text
{
    /// <summary>Whether a field is empty after JavaScript's <c>trim</c>.</summary>
    public static bool IsBlankText(string text) => text.Trim().Length == 0;
}
