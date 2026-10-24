using System.Globalization;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Typle.Core;
using Typle.Support;
using Windows.System;
using Windows.UI.Text;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// The practice screen (src/app/(workspace)/play/page.tsx): the practice card, and beside it (below when narrow) the
/// lists and the best records. The text field stays the same through the run, so the keyboard and the input method are
/// never interrupted; the parts around it are built again on each keystroke.
/// </summary>
public sealed class PracticePage : PageView
{
    private readonly PracticeModel model;
    private readonly ScrollViewer scroll;
    private readonly Grid layout = new() { ColumnSpacing = 24, RowSpacing = 24, Padding = new Thickness(40, 32, 40, 32) };
    private readonly Border cardHost = new();
    private readonly Border practiceCard;
    private readonly Border asideHost = new();
    private readonly Border headerHost = new();
    private readonly Border progressHost = new();
    private readonly Border bodyHost = new();
    private readonly StackPanel practiceBody = new();
    private readonly Grid wordArea = new() { MinHeight = 208 };
    private readonly Border wordHost = new() { Padding = new Thickness(24, 32, 24, 0) };
    private readonly Border resumeOverlay = new();
    private readonly TextBox input;
    // The field's border in every state. Its template reads the brush once, when it is first shown (unfocused), so the
    // border changes by this brush's colour rather than by giving the field new brushes.
    private readonly SolidColorBrush inputBorder = new();
    private readonly Border inputRing = new() { CornerRadius = new CornerRadius(14), Padding = new Thickness(4), MaxWidth = 456 };
    private readonly Border feedbackHost = new() { MinHeight = 20, HorizontalAlignment = HorizontalAlignment.Center };
    private readonly Border statsHost = new() { Padding = new Thickness(24, 0, 24, 20) };
    private readonly Border upcomingHost = new();
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer ticker;
    private bool showAll;
    private bool inputFocused;
    private bool focusedOnce;
    private bool suppressText;
    private bool wide = true;
    private bool dialogOpen;
    private Button? againButton;

    public PracticePage(AppModel app, Shell shell) : base(app, shell)
    {
        model = app.Practice;
        // Each visit starts a new run; a rebuilt screen (a new theme or language) keeps the run.
        if (model.Visit != app.PracticeVisit)
        {
            model.Visit = app.PracticeVisit;
            model.Restart();
        }
        input = new TextBox
        {
            Height = 56, FontSize = 24, CornerRadius = new CornerRadius(10), BorderThickness = new Thickness(2),
            IsSpellCheckEnabled = false, IsTextPredictionEnabled = false, TextAlignment = TextAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center, Text = model.Session.Input,
        };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(input, L("practice.word.placeholder"));
        input.TextChanged += (_, _) =>
        {
            if (!suppressText && !model.Composing) Enter(input.Text);
        };
        // Like compositionstart/compositionend in the web app, only committed text counts.
        input.TextCompositionStarted += (_, _) =>
        {
            model.Composing = true;
            Refresh();
        };
        input.TextCompositionEnded += (_, _) =>
        {
            model.Composing = false;
            // After the field has taken the committed text.
            Shell.Window.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () => Enter(input.Text));
        };
        input.PreviewKeyDown += (_, args) =>
        {
            if (args.Key != VirtualKey.Escape) return;
            args.Handled = true;
            Restart();
        };
        input.Paste += (_, args) => args.Handled = true;
        input.GotFocus += (_, _) =>
        {
            inputFocused = true;
            focusedOnce = true;
            Refresh();
        };
        input.LostFocus += (_, _) =>
        {
            inputFocused = false;
            Refresh();
        };
        inputRing.Child = input;
        inputRing.HorizontalAlignment = HorizontalAlignment.Stretch;

        wordArea.Children.Add(wordHost);
        wordArea.Children.Add(resumeOverlay);
        var inputRow = new StackPanel { Spacing = 10, Padding = new Thickness(24, 8, 24, 20) };
        inputRow.Children.Add(inputRing);
        inputRow.Children.Add(feedbackHost);
        practiceBody.Children.Add(wordArea);
        practiceBody.Children.Add(inputRow);
        practiceBody.Children.Add(statsHost);
        practiceBody.Children.Add(Hairline());
        practiceBody.Children.Add(upcomingHost);

        var cardColumn = new StackPanel();
        cardColumn.Children.Add(headerHost);
        cardColumn.Children.Add(Hairline());
        cardColumn.Children.Add(progressHost);
        cardColumn.Children.Add(bodyHost);
        practiceCard = Card(cardColumn);
        cardHost.Child = practiceCard;

        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = Star() });
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(320) });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.Children.Add(cardHost);
        layout.Children.Add(asideHost);
        layout.SizeChanged += (_, args) =>
        {
            var isWide = args.NewSize.Width >= 900;
            if (isWide == wide) return;
            wide = isWide;
            Arrange();
        };
        Arrange();
        scroll = new ScrollViewer { Content = layout, Background = Brush(P.Page), HorizontalScrollMode = ScrollMode.Disabled };
        Ui.Center(scroll, layout, 1280);
        // Any key while the field is not focused brings the focus back, as on the web.
        scroll.KeyDown += (_, args) =>
        {
            if (model.Finished || dialogOpen || inputFocused) return;
            if (args.Key is VirtualKey.Tab or VirtualKey.Enter or VirtualKey.Space) return;
            FocusInput();
        };

        ticker = Shell.Window.DispatcherQueue.CreateTimer();
        ticker.Interval = TimeSpan.FromMilliseconds(200);
        ticker.Tick += (_, _) => RenderStats();
        scroll.Unloaded += (_, _) => ticker.Stop();

        TakeRequest();
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Shown()
    {
        if (!model.Finished) FocusInput();
        if (App.PendingTyping is { } text)
        {
            App.PendingTyping = null;
            _ = TypeSample(text);
        }
    }

    private void Arrange()
    {
        Microsoft.UI.Xaml.Controls.Grid.SetColumn(asideHost, wide ? 1 : 0);
        Microsoft.UI.Xaml.Controls.Grid.SetRow(asideHost, wide ? 0 : 1);
        Microsoft.UI.Xaml.Controls.Grid.SetColumnSpan(cardHost, wide ? 1 : 2);
        Microsoft.UI.Xaml.Controls.Grid.SetColumnSpan(asideHost, wide ? 1 : 2);
        layout.ColumnDefinitions[1].Width = wide ? new GridLength(320) : new GridLength(0);
        asideHost.VerticalAlignment = VerticalAlignment.Top;
        cardHost.VerticalAlignment = VerticalAlignment.Top;
    }

    private void FocusInput() =>
        Shell.Window.DispatcherQueue.TryEnqueue(() =>
        {
            if (input.XamlRoot is not null) input.Focus(FocusState.Programmatic);
        });

    /// <summary>A list another screen asked for, like /play?list=&lt;id&gt;.</summary>
    private void TakeRequest()
    {
        if (App.PracticeRequest is not { } id) return;
        App.PracticeRequest = null;
        if (model.Running && id != model.ListId) _ = AskToSwitch(id);
        else SwitchTo(id);
    }

    private void SwitchTo(string id)
    {
        showAll = false;
        model.Restart(id);
        SyncInput();
        Refresh();
        FocusInput();
    }

    private void RequestSwitch(string id)
    {
        if (!model.Running) SwitchTo(id);
        else if (id != model.List(App.Lists)?.Id) _ = AskToSwitch(id);
    }

    /// <summary>A run in progress is lost by switching lists, so it is asked first.</summary>
    private async Task AskToSwitch(string id)
    {
        if (model.List(App.Lists) is not { } current || XamlRoot() is not { } root) return;
        dialogOpen = true;
        var confirmed = await Confirm(root, L("practice.switch.title"),
            L("practice.switch.description", current.Name, model.Session.Index, current.Words.Count,
                App.Lists.FirstOrDefault(list => list.Id == id)?.Name ?? ""),
            L("practice.switch.confirm"), L("practice.switch.continue"));
        dialogOpen = false;
        if (confirmed) SwitchTo(id);
        else FocusInput();
    }

    private XamlRoot? XamlRoot() => scroll.XamlRoot;

    private void Restart()
    {
        showAll = false;
        model.Restart();
        SyncInput();
        Refresh();
        FocusInput();
    }

    /// <summary>Puts the run's input in the field: a finished word clears it.</summary>
    private void SyncInput()
    {
        if (input.Text == model.Session.Input) return;
        suppressText = true;
        input.Text = model.Session.Input;
        input.SelectionStart = input.Text.Length;
        suppressText = false;
    }

    private void Enter(string text)
    {
        if (model.List(App.Lists) is not { } list || list.Words.Count == 0 || model.Finished) return;
        if (text == model.Session.Input) return;
        var record = model.Enter(text, list, App.ChosenPracticeDevice);
        SyncInput();
        if (record is not null) _ = model.SaveAsync(App, Refresh);
        Refresh();
        if (model.Finished) Shell.Window.DispatcherQueue.TryEnqueue(() => againButton?.Focus(FocusState.Programmatic));
    }

    /// <summary>Screenshots of a run in progress or finished: <c>--typing</c> types as if from the keyboard.</summary>
    private async Task TypeSample(string text)
    {
        await Task.Delay(300);
        var typed = "";
        foreach (var rune in text.EnumerateRunes())
        {
            typed += rune.ToString();
            var index = model.Session.Index;
            input.Text = typed;
            // A finished word clears the field, so the next characters start a new input.
            if (model.Session.Index != index || model.Finished) typed = "";
            await Task.Delay(60);
        }
    }

    public override void Refresh()
    {
        TakeRequest();
        var list = model.List(App.Lists);
        if (list is null || list.Words.Count == 0)
        {
            var create = Button(L("nav.links.create"), () => App.Navigate(Page.CreateList), icon: Icons.Add);
            create.HorizontalAlignment = HorizontalAlignment.Left;
            cardHost.Child = Card(Column(12, T(L("practice.empty"), 16), create), 32);
            asideHost.Child = null;
            ticker.Stop();
            return;
        }
        if (!ReferenceEquals(cardHost.Child, practiceCard)) cardHost.Child = Detach(practiceCard);
        headerHost.Child = Header(list);
        progressHost.Child = Progress(list.Words.Count);
        if (model.Finished)
        {
            bodyHost.Child = Result(list);
            ticker.Stop();
        }
        else
        {
            if (!ReferenceEquals(bodyHost.Child, practiceBody)) bodyHost.Child = Detach(practiceBody);
            RenderPractice(list);
        }
        asideHost.Child = Aside(list);
    }

    // MARK: Header

    private Grid Header(WordList list)
    {
        var name = T(list.Name, 16, FontWeights.Bold, maxLines: 1);
        var switcher = Clickable(Row(8, Icon(Icons.List, 16, P.MutedForeground), name,
                T(L("practice.header.wordCount", list.Words.Count), 13, color: P.MutedForeground, maxLines: 1),
                Icon(Icons.UnfoldMore, 12, P.MutedForeground)),
            () => _ = ChooseList(), L("practice.header.switchList", list.Name), 8, new Thickness(10, 0, 10, 0));
        switcher.Height = 40;
        switcher.HorizontalAlignment = HorizontalAlignment.Left;
        var liveStats = Button(null, () =>
            {
                App.ChangeLiveStatsVisible(!App.LiveStatsVisible);
                FocusInput();
            }, Variant.Ghost, ButtonSize.IconLarge, App.LiveStatsVisible ? Icons.Eye : Icons.EyeOff,
            L("practice.header.liveStats") + " " + (App.LiveStatsVisible ? L("common.on") : L("common.off")));
        var restart = Button(L("practice.header.restartShort"), Restart, Variant.Ghost, ButtonSize.Large, Icons.Restart,
            L("practice.header.restart"), trailing: Kbd("Esc"));
        var header = Cells(8,
            (Star(), switcher),
            (Auto, DeviceMenu(model.Running ? model.PracticeDevice : App.ChosenPracticeDevice, model.Running)),
            (Auto, liveStats),
            (Auto, restart));
        header.Height = 64;
        header.Padding = new Thickness(12, 0, 12, 0);
        return header;
    }

    /// <summary>The device the run is recorded with (src/components/Practice/DeviceMenu.tsx). It cannot change while a run goes on.</summary>
    private Button DeviceMenu(PracticeDevice? current, bool locked)
    {
        var name = current is null ? L("devices.none") : Format.Device(current);
        var color = locked ? P.MutedForeground : P.Foreground;
        var title = T(name, 13, FontWeights.Medium, color, 1);
        title.MaxWidth = 220;
        var button = Clickable(Row(6, Icon(Icons.Keyboard, 13, color), title, Icon(locked ? Icons.Lock : Icons.ChevronDown, 10, color)),
            () => { }, L("practice.device.label", name), 16, new Thickness(12, 0, 12, 0), P.Card);
        button.Height = 32;
        button.BorderBrush = Brush(P.Border);
        button.BorderThickness = new Thickness(1);
        button.IsEnabled = !locked;
        var items = new List<MenuFlyoutItemBase>
        {
            new MenuFlyoutItem { Text = L("practice.device.heading"), IsEnabled = false },
        };
        foreach (var device in new[] { Core.Devices.DefaultDevice(App.DefaultDeviceName) }.Concat(App.Devices))
        {
            items.Add(MenuItem(Format.Device(device), () => App.ChooseDevice(device.Id), selected: device.Id == current?.Id));
        }
        items.Add(MenuItem(L("devices.none"), () => App.ChooseDevice(""), selected: current is null));
        items.Add(new MenuFlyoutSeparator());
        items.Add(MenuItem(L("practice.device.manage"), () => App.Navigate(Page.Devices), Icons.Monitor));
        var menu = Menu([.. items]);
        menu.Closed += (_, _) => FocusInput();
        button.Flyout = menu;
        return button;
    }

    private Grid Progress(int total)
    {
        var done = model.Finished ? total : model.Session.Index;
        var current = model.Finished ? total : model.Session.Index + 1;
        var track = new Grid { Height = 6, CornerRadius = new CornerRadius(3), Background = Brush(P.Muted) };
        track.ColumnDefinitions.Add(new ColumnDefinition { Width = Star(done) });
        track.ColumnDefinitions.Add(new ColumnDefinition { Width = Star(Math.Max(total - done, 0)) });
        track.Children.Add(new Border { CornerRadius = new CornerRadius(3), Background = Brush(P.Primary) });
        var value = L("practice.progress.value", current, total);
        var row = Cells(12, (Star(), track), (Auto, T(value, 14, FontWeights.Medium, tabular: true, maxLines: 1)));
        row.Padding = new Thickness(24, 16, 24, 0);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(row, L("practice.progress.label") + " " + value);
        return row;
    }

    // MARK: Practice

    private void RenderPractice(WordList list)
    {
        var words = list.Words;
        var session = model.Session;
        var word = words[Math.Min(session.Index, words.Count - 1)];
        var comparison = Typing.CompareInput(word.Input, session.Input);

        var area = new StackPanel { Spacing = 14, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        if (word.Annotation.Length > 0) area.Children.Add(T(word.Annotation, 16, align: TextAlignment.Center));
        if (word.Display == word.Input)
        {
            area.Children.Add(TargetText(comparison, WordSize(word.Display)));
        }
        else
        {
            area.Children.Add(T(word.Display, WordSize(word.Display), FontWeights.Medium, align: TextAlignment.Center));
            var label = new Border
            {
                Child = T(L("practice.word.typeThis"), 12, color: P.MutedForeground, maxLines: 1), Height = 22, BorderBrush = Brush(P.Border),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(11), Padding = new Thickness(8, 0, 8, 0),
            };
            var target = Row(10, label, TargetText(comparison, 30));
            target.HorizontalAlignment = HorizontalAlignment.Center;
            area.Children.Add(target);
        }
        wordHost.Child = area;

        // 「クリックまたは任意のキーで再開」 when the field has lost the focus.
        var showResume = focusedOnce && !inputFocused && !dialogOpen;
        resumeOverlay.Child = null;
        resumeOverlay.Background = null;
        if (showResume)
        {
            var pill = new Border
            {
                Child = Row(6, Icon(Icons.Pointer, 16, P.PrimaryForeground), T(L("practice.word.resume"), 14, FontWeights.Medium, P.PrimaryForeground)),
                Height = 40, CornerRadius = new CornerRadius(20), Background = Brush(P.Primary), Padding = new Thickness(16, 0, 16, 0),
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            };
            var overlay = Clickable(pill, FocusInput, L("practice.word.resume"), 0, null, Palette.WithAlpha(P.Card, 0.85));
            overlay.VerticalAlignment = VerticalAlignment.Stretch;
            overlay.HorizontalContentAlignment = HorizontalAlignment.Center;
            overlay.VerticalContentAlignment = VerticalAlignment.Center;
            resumeOverlay.Child = overlay;
        }

        var invalid = comparison.ErrorIndex is not null;
        inputRing.BorderThickness = new Thickness(0);
        inputRing.Background = Brush(invalid ? Palette.WithAlpha(P.Destructive, 0.2) : inputFocused ? Palette.WithAlpha(P.Ring, 0.35) : Microsoft.UI.Colors.Transparent);
        inputBorder.Color = invalid ? P.Destructive : inputFocused ? P.Primary : P.Input;
        input.BorderBrush = inputBorder;
        input.Background = Brush(P.Card);
        input.Foreground = Brush(P.Foreground);
        input.PlaceholderText = L("practice.word.placeholder");
        foreach (var key in new[] { "TextControlBorderBrush", "TextControlBorderBrushPointerOver", "TextControlBorderBrushFocused" })
        {
            input.Resources[key] = inputBorder;
        }
        foreach (var key in new[] { "TextControlBackground", "TextControlBackgroundPointerOver", "TextControlBackgroundFocused" })
        {
            input.Resources[key] = Brush(P.Card);
        }
        input.Resources["TextControlForeground"] = Brush(P.Foreground);
        input.Resources["TextControlForegroundFocused"] = Brush(P.Foreground);
        input.Resources["TextControlBorderThemeThicknessFocused"] = new Thickness(2);

        feedbackHost.Child = Feedback(comparison);
        RenderStats();
        if (App.LiveStatsVisible && model.Running) ticker.Start();
        else ticker.Stop();
        upcomingHost.Child = Upcoming(words, session.Index);
    }

    /// <summary>
    /// The characters to type, coloured by what has been typed (src/components/Practice/TargetText.tsx): green when done,
    /// underlined for the next one, red from the first mistake, and grey for the rest.
    /// </summary>
    private static TextBlock TargetText(InputComparison comparison, double size)
    {
        var block = new TextBlock
        {
            FontSize = size, FontWeight = FontWeights.Medium, TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        for (var i = 0; i < comparison.Characters.Count; i++)
        {
            var run = new Run { Text = comparison.Characters[i] };
            switch (comparison.States[i])
            {
                case CharacterState.Done:
                    run.Foreground = Brush(P.Success);
                    break;
                case CharacterState.Error:
                    run.Foreground = Brush(P.Destructive);
                    break;
                case CharacterState.Current:
                    run.Foreground = Brush(P.Foreground);
                    run.TextDecorations = TextDecorations.Underline;
                    break;
                case CharacterState.CurrentError:
                    run.Foreground = Brush(P.Destructive);
                    run.TextDecorations = TextDecorations.Underline;
                    break;
                default:
                    run.Foreground = Brush(P.Pending);
                    break;
            }
            block.Inlines.Add(run);
        }
        foreach (var extra in comparison.Extra)
        {
            block.Inlines.Add(new Run { Text = extra, Foreground = Brush(P.Destructive), TextDecorations = TextDecorations.Strikethrough });
        }
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(block, string.Concat(comparison.Characters));
        return block;
    }

    /// <summary>Shorter text gets the large size; anything over 24 characters gets a paragraph size.</summary>
    private static double WordSize(string text)
    {
        var length = text.EnumerateRunes().Count();
        return length > 24 ? 26 : length > 10 ? 44 : 64;
    }

    private UIElement Feedback(InputComparison comparison)
    {
        if (comparison.ErrorIndex is { } errorIndex)
        {
            return Row(6, Icon(Icons.Error, 14, P.Destructive), T(L("practice.feedback.mismatch", errorIndex + 1), 13, FontWeights.Medium, P.Destructive));
        }
        if (model.Composing) return T(L("practice.feedback.composing"), 12, color: P.MutedForeground);
        return Row(16,
            Row(6, Kbd("Backspace"), T(L("practice.feedback.backspace"), 12, color: P.MutedForeground)),
            Row(6, Kbd("Esc"), T(L("practice.feedback.restart"), 12, color: P.MutedForeground)));
    }

    /// <summary>The live elapsed time, speed, accuracy and mistakes. Only this ticks, five times a second, while a run goes on.</summary>
    private void RenderStats()
    {
        if (!App.LiveStatsVisible || model.Finished)
        {
            statsHost.Visibility = Visibility.Collapsed;
            return;
        }
        statsHost.Visibility = Visibility.Visible;
        var session = model.Session;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var running = model.Running;
        var elapsed = running ? Math.Max(0, now - (session.StartedAt ?? now)) : 0;
        var speed = running ? Typing.Speed(session, now) : null;
        var seconds = elapsed / 1000;
        var clock = $"{(int)(seconds / 60)}:{(seconds % 60).ToString("00.0", CultureInfo.InvariantCulture)}";
        var grid = Tiles(4, 0, [
            Stat(Icons.Timer, L("practice.stats.elapsed"), clock),
            Stat(Icons.Speed, L("practice.stats.speed"), speed?.ToString(CultureInfo.InvariantCulture) ?? "—", L("practice.stats.speedUnit")),
            Stat(Icons.Target, L("practice.stats.accuracy"), session.Attempts > 0 ? Records.FormatAccuracy(Typing.Result(session).Accuracy) : "—"),
            Stat(Icons.Close, L("practice.stats.mistakes"), session.Mistakes.ToString(CultureInfo.InvariantCulture)),
        ]);
        var box = Outlined(grid, 12);
        box.Background = Brush(Palette.WithAlpha(P.Muted, 0.4));
        box.Padding = new Thickness(0, 12, 0, 12);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(box, L("practice.stats.label"));
        statsHost.Child = box;
    }

    private static StackPanel Stat(string icon, string term, string value, string? unit = null)
    {
        var heading = Row(4, Icon(icon, 11, P.MutedForeground), T(term, 12, color: P.MutedForeground, maxLines: 1));
        heading.HorizontalAlignment = HorizontalAlignment.Center;
        var number = ValueWithUnit(value, unit ?? "", 20);
        number.HorizontalAlignment = HorizontalAlignment.Center;
        return Column(2, heading, number);
    }

    private UIElement Upcoming(IReadOnlyList<Word> words, int index)
    {
        var next = words.Skip(index + 1).Take(3).ToList();
        var remaining = words.Count - index - 1 - next.Count;
        var chips = Row(8, T(L("practice.upcoming.next"), 12, color: P.MutedForeground));
        foreach (var word in next) chips.Children.Add(WordChip(word.Display, ChipState.Pending));
        if (next.Count == 0) chips.Children.Add(T(L("practice.upcoming.last"), 12, color: P.MutedForeground));
        if (remaining > 0) chips.Children.Add(T(L("practice.upcoming.more", remaining), 12, color: P.Pending));
        var toggle = Button(L("practice.upcoming.showAll"), () =>
        {
            showAll = !showAll;
            Refresh();
            FocusInput();
        }, Variant.Ghost, ButtonSize.Large, trailing: Icon(showAll ? Icons.ChevronUp : Icons.ChevronDown, 12));
        var column = Column(10, Cells(8, (Star(), chips), (Auto, toggle)));
        column.Padding = new Thickness(24, 10, 12, 10);
        if (showAll)
        {
            var wrap = new WrapPanel { HorizontalSpacing = 6, VerticalSpacing = 6, Margin = new Thickness(0, 10, 0, 10) };
            for (var i = 0; i < words.Count; i++)
            {
                wrap.Children.Add(WordChip(words[i].Display, i < index ? ChipState.Done : i == index ? ChipState.Current : ChipState.Pending));
            }
            column.Children.Add(new ScrollViewer { Content = Column(0, Hairline(), wrap), MaxHeight = 176, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        }
        return column;
    }

    private enum ChipState { Done, Current, Pending }

    /// <summary>A word in the upcoming row or the list of all words.</summary>
    private static Border WordChip(string text, ChipState state)
    {
        var suffix = state switch
        {
            ChipState.Done => L("practice.upcoming.done"),
            ChipState.Current => L("practice.upcoming.current"),
            _ => "",
        };
        var chip = new Border
        {
            Child = T(text, 13, color: state switch
            {
                ChipState.Current => P.PrimaryForeground,
                ChipState.Done => P.Success,
                _ => P.MutedForeground,
            }, maxLines: 1),
            Height = 28, CornerRadius = new CornerRadius(14), Padding = new Thickness(12, 0, 12, 0),
            Background = Brush(state switch
            {
                ChipState.Current => P.Primary,
                ChipState.Done => P.SuccessSoft,
                _ => Microsoft.UI.Colors.Transparent,
            }),
            BorderBrush = Brush(state == ChipState.Pending ? P.Border : Microsoft.UI.Colors.Transparent), BorderThickness = new Thickness(1),
        };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(chip, text + suffix);
        return chip;
    }

    // MARK: Lists and best records

    private StackPanel Aside(WordList list)
    {
        var listsColumn = Column(4, Cells(8,
            (Star(), T(L("practice.aside.lists"), 15, FontWeights.Bold)),
            (Auto, Button(L("practice.aside.create"), () => App.Navigate(Page.CreateList), Variant.Ghost, ButtonSize.Large, Icons.Add))));
        ((FrameworkElement)listsColumn.Children[0]).Margin = new Thickness(8, 0, 0, 0);
        foreach (var item in App.Lists.Take(8)) listsColumn.Children.Add(ListOptionRow(item, item.Id == list.Id, () => RequestSwitch(item.Id)));
        if (App.Lists.Count > 8)
        {
            listsColumn.Children.Add(Button(L("practice.aside.allLists"), () => _ = ChooseList(), Variant.Ghost));
        }

        var candidates = Records.Comparable(list);
        var title = T(L("practice.aside.best"), 15, FontWeights.Bold);
        title.VerticalAlignment = VerticalAlignment.Bottom;
        var listName = T(list.Name, 12, color: P.MutedForeground, maxLines: 1);
        listName.VerticalAlignment = VerticalAlignment.Bottom;
        var allBest = Button(L("practice.aside.allBest"), () => App.ShowRankings(list.Id), Variant.Ghost, ButtonSize.Small,
            trailing: Icon(Icons.ArrowRight, 12));
        allBest.HorizontalAlignment = HorizontalAlignment.Left;
        var best = Column(8,
            Row(8, title, listName),
            T(candidates.Count < list.Records.Count ? L("practice.aside.bestOrderAtCount", list.Words.Count) : L("practice.aside.bestOrder"), 12,
                color: P.MutedForeground),
            BestRecords(candidates, model.SaveState == SaveState.Saved ? model.Record?.Id : null),
            allBest);
        return Column(24, Card(listsColumn, 12), Card(best, 16));
    }

    /// <summary>The five best runs of a list (src/components/Practice/PracticeBestRecords.tsx).</summary>
    private static UIElement BestRecords(IReadOnlyList<StoredRecord> records, string? highlightId)
    {
        var best = Records.Best(records);
        if (best.Count == 0)
        {
            var empty = T(L("practice.best.empty"), color: P.MutedForeground);
            empty.Margin = new Thickness(8, 12, 8, 12);
            return empty;
        }
        var column = Column(2);
        for (var i = 0; i < best.Count; i++)
        {
            var record = best[i];
            var current = record.Id is not null && record.Id == highlightId;
            var row = Cells(10,
                (Auto, RankBadge(i + 1)),
                (Auto, T(L("practice.best.seconds", Format.Seconds(record.Time)), 14, FontWeights.Medium, tabular: true, maxLines: 1)),
                (Auto, T(record.Accuracy is { } accuracy ? Format.Number(accuracy, 2) + "%" : L("practice.best.noAccuracy"), tabular: true, maxLines: 1)),
                (Star(), T(Format.Device(record.Device), 12, color: P.MutedForeground, maxLines: 1)),
                (Auto, current ? T("NEW", 10, FontWeights.Bold, P.Success) : null));
            column.Children.Add(new Border
            {
                Child = row, Height = 36, CornerRadius = new CornerRadius(8), Padding = new Thickness(8, 0, 8, 0),
                Background = Brush(current ? P.SuccessSoft : Microsoft.UI.Colors.Transparent),
            });
        }
        return column;
    }

    /// <summary>A list to pick, with a round check like the web's WordListOptions.</summary>
    private static Button ListOptionRow(WordList list, bool selected, Action onClick)
    {
        var best = Records.ListBest(list);
        var text = Column(1, T(list.Name, 15, FontWeights.Medium, maxLines: 2),
            T(best is not null ? L("practice.options.withBest", list.Words.Count, Format.Seconds(best.Time)) : L("practice.options.noRecord", list.Words.Count),
                12, color: P.MutedForeground, maxLines: 1));
        var row = Cells(12, (Auto, Icon(selected ? Icons.CheckCircle : Icons.Circle, 20, selected ? P.Primary : P.Border)), (Star(), text));
        return Clickable(row, onClick, list.Name, 10, new Thickness(12, 10, 12, 10), selected ? P.Muted : null);
    }

    /// <summary>Choosing a list, with a filter by name (the web's 「単語リストを選ぶ」 dialog).</summary>
    private async Task ChooseList()
    {
        if (XamlRoot() is not { } root) return;
        var options = Column(2);
        var filter = Input("", L("practice.picker.filter"));
        ContentDialog? dialog = null;
        // Switching may ask about the run in progress, in a dialog of its own once this one has closed.
        string? picked = null;
        void Fill()
        {
            options.Children.Clear();
            var needle = filter.Text.Trim().ToLowerInvariant();
            var current = model.List(App.Lists)?.Id;
            var filtered = App.Lists.Where(list => needle.Length == 0 || list.Name.ToLowerInvariant().Contains(needle)).ToList();
            foreach (var list in filtered)
            {
                options.Children.Add(ListOptionRow(list, list.Id == current, () =>
                {
                    picked = list.Id;
                    dialog?.Hide();
                }));
            }
            if (filtered.Count == 0) options.Children.Add(T(L("practice.picker.noMatch"), color: P.MutedForeground));
        }
        filter.TextChanged += (_, _) => Fill();
        Fill();
        var body = Column(16, T(L("practice.picker.description"), color: P.MutedForeground), SearchField(filter),
            new ScrollViewer { Content = options, MaxHeight = 420, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        body.Width = 420;
        dialog = Dialog(root, L("practice.picker.title"), body);
        dialog.CloseButtonText = L("common.close");
        dialogOpen = true;
        Refresh();
        await dialog.ShowAsync();
        dialogOpen = false;
        if (picked is not null)
        {
            RequestSwitch(picked);
            return;
        }
        Refresh();
        if (!model.Finished) FocusInput();
    }

    // MARK: Result

    private abstract record Comparison
    {
        public sealed record FirstAtCount : Comparison;

        public sealed record FirstForList : Comparison;

        public sealed record Best(double Difference) : Comparison;

        public sealed record Behind(StoredRecord Previous) : Comparison;
    }

    /// <summary>
    /// The result of a finished run (src/components/Practice/PracticeResult.tsx). Ranks use the same order as the best
    /// records, so only rank 1 is shown as an improvement, and only runs at this word count are compared.
    /// </summary>
    private StackPanel Result(WordList list)
    {
        var session = model.Session;
        var record = model.Record;
        var result = Typing.Result(session);
        var wordCount = list.Words.Count;
        var ranked = Records.Rank(list.Records.Where(item => item.WordCount == wordCount).ToList());
        var rank = record is not null && model.SaveState == SaveState.Saved ? ranked.ToList().FindIndex(item => item.Id == record.Id) + 1 : 0;
        var previous = ranked.FirstOrDefault(item => item.Id != record?.Id);
        Comparison comparison = previous is null
            ? list.Records.Any(item => item.Id != record?.Id) ? new Comparison.FirstAtCount() : new Comparison.FirstForList()
            : rank == 1 && record is not null ? new Comparison.Best(record.Time - previous.Time) : new Comparison.Behind(previous);
        var isBest = comparison is Comparison.Best;
        var faster = comparison is Comparison.Best { Difference: < 0 };

        var title = Row(12, T(L("practice.result.title"), 26, FontWeights.Bold),
            isBest ? Badge(L("practice.result.newBest"), Icons.Trophy, P.AmberSoft, P.Amber, height: 28) : null);
        var tiles = Tiles(4, 12, [
            Tile(L("practice.result.time"), Format.Seconds(result.Time), L("practice.result.seconds"), Note(comparison, list), isBest,
                faster ? Icons.TrendDown : null),
            Tile(L("practice.result.accuracy"), Format.Number(result.Accuracy, 2), "%", L("practice.result.mistakes", result.Mistakes)),
            Tile(L("practice.result.speed"), Typing.Speed(session, 0)?.ToString(CultureInfo.InvariantCulture) ?? "—", L("practice.result.speedUnit"),
                L("practice.result.correct", session.Attempts - session.Mistakes)),
            Tile(L("practice.result.words"), wordCount.ToString(CultureInfo.InvariantCulture), L("practice.result.wordUnit"),
                Format.Device(model.PracticeDevice), icon: Icons.Keyboard),
        ]);
        UIElement status = model.SaveState switch
        {
            SaveState.Failed => new Border
            {
                Child = Column(10, Status(Icons.Error, L("practice.result.saveFailed"), P.Destructive),
                    Button(L("practice.result.retry"), () => _ = model.SaveAsync(App, Refresh), Variant.Outline)),
                Background = Brush(Palette.WithAlpha(P.Destructive, 0.05)), BorderBrush = Brush(Palette.WithAlpha(P.Destructive, 0.4)),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Padding = new Thickness(14),
            },
            SaveState.Saved => Status(Icons.CheckCircle, L("practice.result.saved", rank), P.Success),
            _ => Status(Icons.Sync, L("practice.result.saving"), P.MutedForeground),
        };
        var enter = new Border
        {
            Child = T("Enter", 11, FontWeights.Medium, P.PrimaryForeground), BorderBrush = Brush(Palette.WithAlpha(P.PrimaryForeground, 0.4)),
            BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 1, 5, 1),
        };
        // Enter starts again, as on the web: the button has the focus.
        againButton = Button(L("practice.result.again"), Restart, size: ButtonSize.Large, icon: Icons.Restart, trailing: enter);
        var buttons = Row(8, againButton,
            Button(L("practice.result.chooseList"), () => _ = ChooseList(), Variant.Outline, ButtonSize.Large),
            Button(L("practice.result.viewRecords"), () => App.Navigate(Page.Records), Variant.Ghost, ButtonSize.Large,
                trailing: Icon(Icons.ArrowRight, 14)));
        var column = Column(20, title, tiles, status, buttons);
        column.Padding = new Thickness(24, 28, 24, 24);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(column, L("practice.result.completed", list.Name));
        return column;
    }

    private static StackPanel Status(string icon, string text, Windows.UI.Color color) => Row(6, Icon(icon, 16, color), T(text, color: color));

    private static string Note(Comparison comparison, WordList list) => comparison switch
    {
        Comparison.Behind behind => behind.Previous.Accuracy is { } accuracy
            ? L("practice.result.behind", Format.Seconds(behind.Previous.Time), Format.Number(accuracy, 2))
            : L("practice.result.behindNoAccuracy", Format.Seconds(behind.Previous.Time)),
        Comparison.Best best => best.Difference < 0
            ? L("practice.result.faster", Format.Seconds(-best.Difference))
            : L("practice.result.bestByAccuracy"),
        Comparison.FirstAtCount => L("practice.result.firstAtCount", list.Words.Count),
        _ => L("practice.result.firstForList"),
    };

    private static Border Tile(string term, string value, string unit, string note, bool good = false, string? icon = null)
    {
        var color = good ? P.Success : P.MutedForeground;
        var noteText = T(note, 12, good ? FontWeights.Medium : FontWeights.Normal, color);
        var noteRow = icon is null ? (UIElement)noteText : Row(4, Icon(icon, 12, color), noteText);
        var tile = Outlined(Column(2, T(term, 12, color: P.MutedForeground), ValueWithUnit(value, unit, 28), noteRow));
        tile.Padding = new Thickness(16, 14, 16, 14);
        tile.VerticalAlignment = VerticalAlignment.Stretch;
        return tile;
    }
}
