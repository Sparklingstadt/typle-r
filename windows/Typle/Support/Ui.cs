using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Windows.Foundation;
using Windows.UI;
using Windows.UI.Text;

namespace Typle.Support;

public enum Variant { Primary, Outline, Ghost, Secondary, Destructive }

public enum ButtonSize { Small, Regular, Large, Icon, IconLarge }

/// <summary>Segoe Fluent Icons glyphs standing in for the web app's lucide icons.</summary>
public static class Icons
{
    public const string Home = "";
    public const string Keyboard = "";
    public const string History = "";
    public const string Trophy = "";
    public const string List = "";
    public const string Add = "";
    public const string Settings = "";
    public const string Monitor = "";
    public const string Book = "";
    public const string Info = "";
    public const string OpenInNew = "";
    public const string Menu = "";
    public const string Close = "";
    public const string Sun = "";
    public const string Moon = "";
    public const string Person = "";
    public const string SignIn = "";
    public const string Warning = "";
    public const string Check = "";
    public const string CheckCircle = "";
    public const string Circle = "";
    public const string Edit = "";
    public const string Delete = "";
    public const string More = "";
    public const string Copy = "";
    public const string Export = "";
    public const string Import = "";
    public const string Restart = "";
    public const string Timer = "";
    public const string Speed = "";
    public const string Target = "";
    public const string ChevronDown = "";
    public const string ChevronUp = "";
    public const string ChevronLeft = "";
    public const string ChevronRight = "";
    public const string ArrowRight = "";
    public const string ArrowLeft = "";
    public const string ArrowUp = "";
    public const string ArrowDown = "";
    public const string Top = "";
    public const string Bottom = "";
    public const string TrendUp = "";
    public const string TrendDown = "";
    public const string Dash = "";
    public const string Cloud = "";
    public const string Laptop = "";
    public const string Search = "";
    public const string Clear = "";
    public const string Language = "";
    public const string Eye = "";
    public const string EyeOff = "";
    public const string Lock = "";
    public const string Sparkle = "";
    public const string Clock = "";
    public const string Error = "";
    public const string Sync = "";
    public const string Pointer = "";
    public const string UnfoldMore = "";
}

/// <summary>The web app's parts (shadcn's Card, Button, Badge, Input…), built as WinUI elements in the current colours.</summary>
public static class Ui
{
    public static Palette P => Palette.Current;

    public static SolidColorBrush Brush(Color color) => new(color);

    public static readonly FontFamily IconFont = new("Segoe Fluent Icons,Segoe MDL2 Assets");

    // MARK: Text and icons

    public static TextBlock T(string text, double size = 14, FontWeight? weight = null, Color? color = null, int maxLines = 0,
        bool tabular = false, TextAlignment align = TextAlignment.Left)
    {
        var block = new TextBlock
        {
            Text = text, FontSize = size, FontWeight = weight ?? FontWeights.Normal, Foreground = Brush(color ?? P.Foreground),
            TextWrapping = maxLines == 1 ? TextWrapping.NoWrap : TextWrapping.Wrap, TextTrimming = TextTrimming.CharacterEllipsis,
            TextAlignment = align, VerticalAlignment = VerticalAlignment.Center, IsTextSelectionEnabled = false,
        };
        if (maxLines > 0) block.MaxLines = maxLines;
        if (tabular) Typography.SetNumeralAlignment(block, FontNumeralAlignment.Tabular);
        return block;
    }

    public static FontIcon Icon(string glyph, double size = 16, Color? color = null) =>
        new() { Glyph = glyph, FontFamily = IconFont, FontSize = size, Foreground = Brush(color ?? P.Foreground), VerticalAlignment = VerticalAlignment.Center };

    // MARK: Layout

    public static StackPanel Row(double spacing, params UIElement?[] children)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = spacing };
        foreach (var child in children)
        {
            if (child is null) continue;
            if (child is FrameworkElement element && element.ReadLocalValue(FrameworkElement.VerticalAlignmentProperty) == DependencyProperty.UnsetValue)
            {
                element.VerticalAlignment = VerticalAlignment.Center;
            }
            panel.Children.Add(child);
        }
        return panel;
    }

    public static StackPanel Column(double spacing, params UIElement?[] children)
    {
        var panel = new StackPanel { Spacing = spacing };
        foreach (var child in children)
        {
            if (child is not null) panel.Children.Add(child);
        }
        return panel;
    }

    /// <summary>
    /// A row of cells whose widths are given as GridLengths: <c>Auto</c>, a fixed width, or <c>Star</c> to take what is
    /// left. Cells are vertically centred.
    /// </summary>
    public static Grid Cells(double spacing, params (GridLength Width, UIElement? Child)[] cells)
    {
        var grid = new Grid { ColumnSpacing = spacing };
        for (var i = 0; i < cells.Length; i++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = cells[i].Width });
            if (cells[i].Child is not { } child) continue;
            if (child is FrameworkElement element && element.ReadLocalValue(FrameworkElement.VerticalAlignmentProperty) == DependencyProperty.UnsetValue)
            {
                element.VerticalAlignment = VerticalAlignment.Center;
            }
            Microsoft.UI.Xaml.Controls.Grid.SetColumn((FrameworkElement)child, i);
            grid.Children.Add(child);
        }
        return grid;
    }

    public static GridLength Auto => GridLength.Auto;

    public static GridLength Star(double weight = 1) => new(weight, GridUnitType.Star);

    public static GridLength Px(double width) => new(width);

    public static UIElement Spacer(double width = 0, double height = 0) => new Border { Width = width, Height = height };

    /// <summary>Equal columns, filled row by row, like the web's two-column grids.</summary>
    public static Grid Tiles(int columns, double spacing, IReadOnlyList<UIElement> items)
    {
        var grid = new Grid { ColumnSpacing = spacing, RowSpacing = spacing };
        for (var i = 0; i < columns; i++) grid.ColumnDefinitions.Add(new ColumnDefinition { Width = Star() });
        for (var i = 0; i < items.Count; i++)
        {
            if (i % columns == 0) grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            Microsoft.UI.Xaml.Controls.Grid.SetRow((FrameworkElement)items[i], i / columns);
            Microsoft.UI.Xaml.Controls.Grid.SetColumn((FrameworkElement)items[i], i % columns);
            grid.Children.Add(items[i]);
        }
        return grid;
    }

    /// <summary>Takes an element out of its old place, so a kept control (a text field) can be shown in a rebuilt screen.</summary>
    public static T Detach<T>(T element) where T : FrameworkElement
    {
        switch (element.Parent)
        {
            case Panel panel:
                panel.Children.Remove(element);
                break;
            case Border border:
                border.Child = null;
                break;
            case ContentControl content:
                content.Content = null;
                break;
        }
        return element;
    }

    // MARK: Surfaces

    /// <summary>shadcn's Card: the card colour, a hairline border and the xl radius.</summary>
    public static Border Card(UIElement? child, double padding = 0, double radius = 14) => new()
    {
        Child = child, Background = Brush(P.Card), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(radius), Padding = new Thickness(padding),
    };

    /// <summary>A bordered box without a fill, like <c>ring-1 ring-foreground/10</c>.</summary>
    public static Border Outlined(UIElement? child, double padding = 0, double radius = 14) => new()
    {
        Child = child, BorderBrush = Brush(P.Border), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(radius),
        Padding = new Thickness(padding),
    };

    /// <summary>A filled rounded box.</summary>
    public static Border Box(UIElement? child, Color fill, double padding = 0, double radius = 10) => new()
    {
        Child = child, Background = Brush(fill), CornerRadius = new CornerRadius(radius), Padding = new Thickness(padding),
    };

    /// <summary>A full-width hairline, the web's <c>border-t</c> between sections.</summary>
    public static Border Hairline() => new() { Height = 1, Background = Brush(P.Border), HorizontalAlignment = HorizontalAlignment.Stretch };

    /// <summary>A dashed rounded outline, like the web's <c>border-dashed</c> empty states and add buttons.</summary>
    public static Grid Dashed(UIElement child, double padding = 40, double radius = 14)
    {
        var grid = new Grid();
        grid.Children.Add(new Rectangle
        {
            Stroke = Brush(P.Border), StrokeThickness = 1, StrokeDashArray = [4, 3], RadiusX = radius, RadiusY = radius,
        });
        grid.Children.Add(new Border { Child = child, Padding = new Thickness(padding) });
        return grid;
    }

    // MARK: Buttons

    /// <summary>shadcn's Button variants and sizes, as a WinUI Button with the same colours when idle, hovered and pressed.</summary>
    public static Button Button(string? text, Action onClick, Variant variant = Variant.Primary, ButtonSize size = ButtonSize.Regular,
        string? icon = null, string? label = null, bool enabled = true, UIElement? trailing = null)
    {
        var foreground = variant switch
        {
            Variant.Primary => P.PrimaryForeground,
            Variant.Destructive => Colors.White,
            _ => P.Foreground,
        };
        var background = variant switch
        {
            Variant.Primary => P.Primary,
            Variant.Destructive => P.Destructive,
            Variant.Secondary => P.Muted,
            Variant.Outline => P.Card,
            _ => Colors.Transparent,
        };
        var hover = variant switch
        {
            Variant.Primary => Palette.WithAlpha(P.Primary, 0.9),
            Variant.Destructive => Palette.WithAlpha(P.Destructive, 0.9),
            _ => P.Accent,
        };
        var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, VerticalAlignment = VerticalAlignment.Center };
        var fontSize = size == ButtonSize.Small ? 13 : 14;
        if (icon is not null) content.Children.Add(Icon(icon, 16, foreground));
        if (text is not null) content.Children.Add(T(text, fontSize, FontWeights.Medium, foreground, 1));
        if (trailing is not null) content.Children.Add(trailing);
        var (height, padding) = size switch
        {
            ButtonSize.Small => (32.0, 10.0),
            ButtonSize.Large => (40.0, 16.0),
            ButtonSize.Icon => (36.0, 0.0),
            ButtonSize.IconLarge => (40.0, 0.0),
            _ => (36.0, 12.0),
        };
        var button = new Button
        {
            Content = content, Height = height, MinWidth = size is ButtonSize.Icon or ButtonSize.IconLarge ? height : 0,
            Padding = new Thickness(padding, 0, padding, 0), CornerRadius = new CornerRadius(8), Background = Brush(background),
            Foreground = Brush(foreground), BorderBrush = Brush(variant == Variant.Outline ? P.Border : Colors.Transparent),
            BorderThickness = new Thickness(variant == Variant.Outline ? 1 : 0), IsEnabled = enabled,
            HorizontalContentAlignment = HorizontalAlignment.Center, VerticalContentAlignment = VerticalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        // The Fluent template's hover and press colours, set to the web's.
        button.Resources["ButtonBackgroundPointerOver"] = Brush(hover);
        button.Resources["ButtonBackgroundPressed"] = Brush(hover);
        button.Resources["ButtonForegroundPointerOver"] = Brush(foreground);
        button.Resources["ButtonForegroundPressed"] = Brush(foreground);
        button.Resources["ButtonBorderBrushPointerOver"] = Brush(variant == Variant.Outline ? P.Border : Colors.Transparent);
        button.Resources["ButtonBorderBrushPressed"] = Brush(variant == Variant.Outline ? P.Border : Colors.Transparent);
        button.Resources["ButtonBackgroundDisabled"] = Brush(Palette.WithAlpha(background, 0.5));
        button.Resources["ButtonForegroundDisabled"] = Brush(Palette.WithAlpha(foreground, 0.5));
        button.Resources["ButtonBorderBrushDisabled"] = Brush(variant == Variant.Outline ? P.Border : Colors.Transparent);
        if (label is not null) Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, label);
        else if (text is not null) Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, text);
        button.Click += (_, _) => onClick();
        return button;
    }

    /// <summary>A borderless area that acts as a button: a list row, a card to choose.</summary>
    public static Button Clickable(UIElement content, Action onClick, string? label = null, double radius = 8, Thickness? padding = null,
        Color? background = null)
    {
        var button = new Button
        {
            Content = content, Padding = padding ?? new Thickness(0), Background = Brush(background ?? Colors.Transparent),
            BorderThickness = new Thickness(0), CornerRadius = new CornerRadius(radius),
            HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
            VerticalContentAlignment = VerticalAlignment.Stretch,
        };
        button.Resources["ButtonBackgroundPointerOver"] = Brush(P.Accent);
        button.Resources["ButtonBackgroundPressed"] = Brush(P.Accent);
        button.Resources["ButtonForegroundPointerOver"] = Brush(P.Foreground);
        button.Resources["ButtonForegroundPressed"] = Brush(P.Foreground);
        if (label is not null) Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, label);
        button.Click += (_, _) => onClick();
        return button;
    }

    // MARK: Small parts

    /// <summary>A keyboard key, like the web's &lt;Kbd&gt;.</summary>
    public static Border Kbd(string text) => new()
    {
        Child = T(text, 11, FontWeights.Medium, P.MutedForeground, 1), Background = Brush(P.Muted), BorderBrush = Brush(P.Border),
        BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 1, 5, 1), MinHeight = 20,
        VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>A rounded-full chip with a hairline border: the storage badges and the reasons of the dashboard.</summary>
    public static Border Pill(UIElement content, double height = 28, Color? fill = null) => new()
    {
        Child = content, Height = height, Background = Brush(fill ?? P.Card), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(height / 2), Padding = new Thickness(10, 0, 10, 0), VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>shadcn's secondary Badge, such as the 3 / 100 next to a heading.</summary>
    public static Border CountBadge(string text) => new()
    {
        Child = T(text, 12, FontWeights.Medium, tabular: true, maxLines: 1), Height = 22, Background = Brush(P.Muted),
        CornerRadius = new CornerRadius(11), Padding = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>A small coloured badge with an icon: 「ベスト」「使用中」「新記録」.</summary>
    public static Border Badge(string text, string? icon, Color fill, Color color, Color? border = null, double height = 22)
    {
        var row = Row(4, icon is null ? null : Icon(icon, 11, color), T(text, 12, FontWeights.Bold, color, 1));
        return new Border
        {
            Child = row, Height = height, Background = Brush(fill), CornerRadius = new CornerRadius(height / 2), Padding = new Thickness(8, 0, 8, 0),
            BorderBrush = Brush(border ?? Colors.Transparent), BorderThickness = new Thickness(border is null ? 0 : 1),
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    /// <summary>A round icon tile, like the monitor and language icons on the devices and settings cards.</summary>
    public static Border IconTile(string glyph, double size = 40) => new()
    {
        Child = Icon(glyph, size * 0.45, Palette.WithAlpha(P.Foreground, 0.8)), Width = size, Height = size, Background = Brush(P.Muted),
        CornerRadius = new CornerRadius(10), VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>The yellow rank circle of a best record.</summary>
    public static Border RankBadge(int rank) => new()
    {
        Child = new TextBlock
        {
            Text = rank.ToString(System.Globalization.CultureInfo.InvariantCulture), FontSize = 12, FontWeight = FontWeights.Bold,
            Foreground = Brush(rank == 1 ? P.Amber : P.MutedForeground), HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        },
        Width = 22, Height = 22, CornerRadius = new CornerRadius(11), Background = Brush(rank == 1 ? P.AmberSoft : P.Muted),
        VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>A number with its unit in a smaller, muted size: 「1.08 秒」.</summary>
    public static StackPanel ValueWithUnit(string value, string unit, double size = 28, FontWeight? weight = null)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 };
        var number = T(value, size, weight ?? FontWeights.Medium, tabular: true, maxLines: 1);
        number.VerticalAlignment = VerticalAlignment.Bottom;
        row.Children.Add(number);
        if (unit.Length > 0)
        {
            var label = T(unit, Math.Max(12, size * 0.5), color: P.MutedForeground, maxLines: 1);
            label.VerticalAlignment = VerticalAlignment.Bottom;
            label.Margin = new Thickness(0, 0, 0, size * 0.12);
            row.Children.Add(label);
        }
        return row;
    }

    /// <summary>A message after an action: green when it went well, red when it failed.</summary>
    public static Border StatusMessage(string text, bool failed)
    {
        var color = failed ? P.Destructive : P.Success;
        return new Border
        {
            Child = Row(8, Icon(failed ? Icons.Warning : Icons.CheckCircle, 16, color), T(text, 14, color: color)),
            Background = Brush(Palette.WithAlpha(color, 0.06)), BorderBrush = Brush(Palette.WithAlpha(color, 0.3)),
            BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Padding = new Thickness(14, 10, 14, 10),
        };
    }

    // MARK: Pages

    /// <summary>The page's content column: centred with the web's max width and padding, in a scroller.</summary>
    public static (ScrollViewer Scroll, StackPanel Content) PageScroll(double maxWidth = 960)
    {
        var content = new StackPanel
        {
            Spacing = 24, MaxWidth = maxWidth, Padding = new Thickness(32, 32, 32, 48), HorizontalAlignment = HorizontalAlignment.Stretch,
        };
        var scroll = new ScrollViewer
        {
            Content = content, Background = Brush(P.Page), HorizontalScrollMode = ScrollMode.Disabled,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
        return (scroll, content);
    }

    /// <summary>A page's heading and description, with something (the storage badge) on the right like the web pages.</summary>
    public static Grid PageHeader(string title, string? description, UIElement? trailing)
    {
        var text = Column(6, T(title, 26, FontWeights.Bold), description is null ? null : T(description, 14, color: P.MutedForeground));
        if (trailing is FrameworkElement element) element.VerticalAlignment = VerticalAlignment.Bottom;
        return Cells(16, (Star(), text), (Auto, trailing));
    }

    // MARK: Fields

    /// <summary>A text field with shadcn's Input look.</summary>
    public static TextBox Input(string text, string placeholder = "", Action<string>? changed = null, double height = 40)
    {
        var box = new TextBox
        {
            Text = text, PlaceholderText = placeholder, MinHeight = height, FontSize = 14, CornerRadius = new CornerRadius(8),
            Background = Brush(P.Card), BorderBrush = Brush(P.Input), BorderThickness = new Thickness(1),
            Foreground = Brush(P.Foreground), VerticalContentAlignment = VerticalAlignment.Center, IsSpellCheckEnabled = false,
            IsTextPredictionEnabled = false,
        };
        StyleInput(box, invalid: false);
        if (changed is not null) box.TextChanged += (_, _) => changed(box.Text);
        return box;
    }

    /// <summary>The field's colours, in red while what it holds cannot be saved.</summary>
    public static void StyleInput(TextBox box, bool invalid)
    {
        var border = Brush(invalid ? P.Destructive : P.Input);
        box.BorderBrush = border;
        box.Resources["TextControlBorderBrush"] = border;
        box.Resources["TextControlBorderBrushPointerOver"] = Brush(invalid ? P.Destructive : P.Ring);
        box.Resources["TextControlBorderBrushFocused"] = Brush(invalid ? P.Destructive : P.Primary);
        box.Resources["TextControlBackground"] = Brush(P.Card);
        box.Resources["TextControlBackgroundPointerOver"] = Brush(P.Card);
        box.Resources["TextControlBackgroundFocused"] = Brush(P.Card);
        box.Resources["TextControlForeground"] = Brush(P.Foreground);
        box.Resources["TextControlForegroundFocused"] = Brush(P.Foreground);
        box.Resources["TextControlPlaceholderForeground"] = Brush(P.MutedForeground);
        box.Resources["TextControlPlaceholderForegroundFocused"] = Brush(P.MutedForeground);
        box.Resources["TextControlPlaceholderForegroundPointerOver"] = Brush(P.MutedForeground);
        box.Resources["TextControlBorderThemeThicknessFocused"] = new Thickness(1);
    }

    /// <summary>A search box with a magnifier, like the web's list and ranking searches. The field is kept by the caller.</summary>
    public static Grid SearchField(TextBox box)
    {
        box.Padding = new Thickness(34, 8, 8, 8);
        var icon = Icon(Icons.Search, 14, P.MutedForeground);
        icon.HorizontalAlignment = HorizontalAlignment.Left;
        icon.Margin = new Thickness(12, 0, 0, 0);
        icon.IsHitTestVisible = false;
        var grid = new Grid();
        grid.Children.Add(Detach(box));
        grid.Children.Add(icon);
        return grid;
    }

    // MARK: Menus

    /// <summary>A menu item with an icon and an optional check, in the destructive colour when it deletes.</summary>
    public static MenuFlyoutItem MenuItem(string text, Action onClick, string? icon = null, bool enabled = true, bool destructive = false,
        bool selected = false)
    {
        var color = destructive ? P.Destructive : P.Foreground;
        var item = new MenuFlyoutItem
        {
            Text = text, IsEnabled = enabled, Foreground = Brush(color), FontWeight = selected ? FontWeights.SemiBold : FontWeights.Normal,
        };
        var glyph = selected ? Icons.Check : icon;
        if (glyph is not null) item.Icon = new FontIcon { Glyph = glyph, FontFamily = IconFont, Foreground = Brush(color) };
        item.Click += (_, _) => onClick();
        return item;
    }

    public static MenuFlyout Menu(params MenuFlyoutItemBase?[] items)
    {
        var menu = new MenuFlyout { Placement = FlyoutPlacementMode.BottomEdgeAlignedLeft };
        foreach (var item in items)
        {
            if (item is not null) menu.Items.Add(item);
        }
        return menu;
    }

    /// <summary>A rounded-full filter button showing its name and value, like 「リスト すべて ⌄」, that opens its choices.</summary>
    public static Button FilterMenu<TValue>(string name, IReadOnlyList<(TValue Value, string Title)> options, TValue selection,
        Action<TValue> onSelect, string? value = null)
    {
        var shown = value ?? options.FirstOrDefault(option => EqualityComparer<TValue>.Default.Equals(option.Value, selection)).Title ?? "";
        var content = Row(6, T(name, 14, color: P.MutedForeground, maxLines: 1), T(shown, 14, FontWeights.Medium, maxLines: 1),
            Icon(Icons.ChevronDown, 10, P.MutedForeground));
        var button = Clickable(content, () => { }, $"{name} {shown}", 18, new Thickness(14, 0, 14, 0), P.Card);
        button.Height = 36;
        button.HorizontalAlignment = HorizontalAlignment.Left;
        button.BorderBrush = Brush(P.Border);
        button.BorderThickness = new Thickness(1);
        button.Flyout = Menu(options.Select(option => (MenuFlyoutItemBase)MenuItem(option.Title, () => onSelect(option.Value),
            selected: EqualityComparer<TValue>.Default.Equals(option.Value, selection))).ToArray());
        return button;
    }

    /// <summary>Two or more choices on a muted track, the selected one raised (the web's ToggleGroup).</summary>
    public static Border Segmented<TValue>(IReadOnlyList<(TValue Value, string Title)> options, TValue selection, Action<TValue> onSelect)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 };
        foreach (var (value, title) in options)
        {
            var selected = EqualityComparer<TValue>.Default.Equals(value, selection);
            var item = Clickable(T(title, 13, selected ? FontWeights.SemiBold : FontWeights.Normal, selected ? P.Foreground : P.MutedForeground, 1),
                () => onSelect(value), title, 15, new Thickness(14, 0, 14, 0), selected ? P.Card : Colors.Transparent);
            item.Height = 30;
            row.Children.Add(item);
        }
        return new Border
        {
            Child = row, Background = Brush(P.Muted), BorderBrush = Brush(P.Border), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(18), Padding = new Thickness(3), VerticalAlignment = VerticalAlignment.Center,
        };
    }

    // MARK: Dialogs

    /// <summary>Asks before something that cannot be undone. True when confirmed.</summary>
    public static async Task<bool> Confirm(XamlRoot root, string title, string message, string confirm, string? dismiss = null,
        bool destructive = true)
    {
        var dialog = Dialog(root, title, T(message, 14, color: P.MutedForeground));
        dialog.PrimaryButtonText = confirm;
        dialog.CloseButtonText = dismiss ?? Loc.L("common.form.cancel");
        dialog.DefaultButton = ContentDialogButton.Close;
        if (destructive) dialog.PrimaryButtonStyle = ButtonStyle(P.Destructive, Colors.White);
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }

    public static ContentDialog Dialog(XamlRoot root, string title, UIElement content) => new()
    {
        XamlRoot = root, Title = title, Content = content, RequestedTheme = P.Dark ? ElementTheme.Dark : ElementTheme.Light,
        Background = Brush(P.Card), Foreground = Brush(P.Foreground), CornerRadius = new CornerRadius(14),
    };

    public static Style ButtonStyle(Color background, Color foreground)
    {
        var style = new Style(typeof(Button));
        style.Setters.Add(new Setter(Control.BackgroundProperty, Brush(background)));
        style.Setters.Add(new Setter(Control.ForegroundProperty, Brush(foreground)));
        style.Setters.Add(new Setter(Control.CornerRadiusProperty, new CornerRadius(8)));
        style.Setters.Add(new Setter(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Stretch));
        return style;
    }
}

/// <summary>Lays its children out left to right and wraps them onto new lines, like CSS flex-wrap.</summary>
public sealed class WrapPanel : Panel
{
    public double HorizontalSpacing { get; set; } = 8;

    public double VerticalSpacing { get; set; } = 8;

    /// <summary>Centres each line, as the practice screen's characters are.</summary>
    public bool Centered { get; set; }

    protected override Size MeasureOverride(Size availableSize)
    {
        double x = 0, y = 0, line = 0, width = 0;
        foreach (var child in Children)
        {
            child.Measure(new Size(availableSize.Width, double.PositiveInfinity));
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > availableSize.Width)
            {
                y += line + VerticalSpacing;
                x = 0;
                line = 0;
            }
            x += size.Width + HorizontalSpacing;
            line = Math.Max(line, size.Height);
            width = Math.Max(width, x - HorizontalSpacing);
        }
        return new Size(double.IsInfinity(availableSize.Width) ? width : Math.Min(width, availableSize.Width), y + line);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var lines = new List<(List<UIElement> Items, double Width, double Height)>();
        var current = new List<UIElement>();
        double x = 0, line = 0;
        foreach (var child in Children)
        {
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > finalSize.Width)
            {
                lines.Add((current, x - HorizontalSpacing, line));
                current = [];
                x = 0;
                line = 0;
            }
            current.Add(child);
            x += size.Width + HorizontalSpacing;
            line = Math.Max(line, size.Height);
        }
        if (current.Count > 0) lines.Add((current, x - HorizontalSpacing, line));
        double y = 0;
        foreach (var (items, width, height) in lines)
        {
            var left = Centered ? Math.Max(0, (finalSize.Width - width) / 2) : 0;
            foreach (var item in items)
            {
                var size = item.DesiredSize;
                item.Arrange(new Rect(left, y + (height - size.Height) / 2, size.Width, size.Height));
                left += size.Width + HorizontalSpacing;
            }
            y += height + VerticalSpacing;
        }
        return finalSize;
    }
}
