using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Typle.Core;
using Typle.Support;
using static Typle.Support.Ui;

namespace Typle.Pages;

/// <summary>
/// The practice devices (src/app/(workspace)/devices/page.tsx): the device this PC practises on, and the registered ones,
/// which can be added, changed and deleted here.
/// </summary>
public sealed class DevicesPage : PageView
{
    private readonly ScrollViewer scroll;
    private readonly StackPanel content;
    private (string Text, bool Failed)? message;

    public DevicesPage(AppModel app, Shell shell) : base(app, shell)
    {
        (scroll, content) = PageScroll(832);
        Refresh();
    }

    public override UIElement Root => scroll;

    public override void Refresh()
    {
        content.Children.Clear();
        var usage = Core.Devices.Usage(App.Lists);
        var chosen = App.ChosenPracticeDevice;
        content.Children.Add(PageHeader(L("devices.title"), L("devices.description"), Shell.StorageBadge(App)));
        if (message is { } shown) content.Children.Add(StatusMessage(shown.Text, shown.Failed));
        content.Children.Add(Current(chosen));
        var heading = Cells(10,
            (Auto, T(L("devices.listHeading"), 16, FontWeights.Bold)),
            (Auto, App.Devices.Count > 0 ? CountBadge(L("devices.count", App.Devices.Count)) : null),
            (Star(), null),
            (Auto, App.Devices.Count > 0
                ? Button(L("devices.add"), () => _ = Edit(null), size: ButtonSize.Large, icon: Icons.Add, enabled: App.Devices.Count < Core.Devices.MaxDevices)
                : null));
        heading.Margin = new Thickness(0, 8, 0, 0);
        content.Children.Add(heading);
        var list = Column(12, DeviceRow(Core.Devices.DefaultDevice(App.DefaultDeviceName), usage.GetValueOrDefault(Core.Devices.DefaultDeviceId),
            chosen?.Id == Core.Devices.DefaultDeviceId, L("devices.defaultDetail"), false));
        foreach (var device in App.Devices)
        {
            list.Children.Add(DeviceRow(device, usage.GetValueOrDefault(device.Id), chosen?.Id == device.Id, device.Layout, true));
        }
        if (App.Devices.Count == 0)
        {
            var add = Button(L("devices.add"), () => _ = Edit(null), size: ButtonSize.Large, icon: Icons.Add);
            var description = T(L("devices.empty.description"), color: P.MutedForeground, align: TextAlignment.Center);
            description.MaxWidth = 360;
            var empty = Column(12, IconTile(Icons.Monitor, 48), T(L("devices.empty.title"), 16, FontWeights.SemiBold), description, add,
                T(L("devices.empty.example"), 12, color: P.MutedForeground));
            foreach (var child in empty.Children) ((FrameworkElement)child).HorizontalAlignment = HorizontalAlignment.Center;
            var box = Dashed(empty);
            list.Children.Add(new Border { Child = box, Background = Brush(P.Card), CornerRadius = new CornerRadius(14) });
        }
        content.Children.Add(list);
    }

    private Border Current(PracticeDevice? chosen)
    {
        var name = chosen is null ? L("devices.choice.notSelected") : Format.Device(chosen);
        var change = Clickable(Row(6, T(L("devices.current.change"), 14, FontWeights.Medium), Icon(Icons.ChevronDown, 12)), () => { },
            L("devices.current.changeLabel", name), 8, new Thickness(16, 0, 16, 0), P.Card);
        change.Height = 44;
        change.BorderBrush = Brush(P.Border);
        change.BorderThickness = new Thickness(1);
        var items = new List<MenuFlyoutItemBase>();
        foreach (var device in new[] { Core.Devices.DefaultDevice(App.DefaultDeviceName) }.Concat(App.Devices))
        {
            items.Add(MenuItem(Format.Device(device), () => App.ChooseDevice(device.Id), selected: device.Id == chosen?.Id));
        }
        items.Add(MenuItem(L("devices.none"), () => App.ChooseDevice(""), selected: chosen is null));
        change.Flyout = Menu([.. items]);
        var top = Cells(16,
            (Auto, IconTile(Icons.Monitor)),
            (Star(), Column(2, T(L("devices.current.heading"), 12, color: P.MutedForeground), T(name, 16, FontWeights.SemiBold))),
            (Auto, change),
            (Auto, Button(L("devices.current.practice"), () => App.Navigate(Page.Practice), Variant.Outline, ButtonSize.Large, Icons.Keyboard)));
        var note = T(chosen is null ? L("devices.current.noteUnselected") : L("devices.current.noteSelected"), 13, color: P.MutedForeground);
        note.Margin = new Thickness(56, 0, 0, 0);
        return Card(Column(12, top, note), 20);
    }

    private Border DeviceRow(PracticeDevice device, DeviceUsage? usage, bool chosen, string detail, bool editable)
    {
        var title = Row(8, T(device.Id == Core.Devices.DefaultDeviceId ? App.DefaultDeviceName : device.Name, 16, FontWeights.SemiBold),
            chosen ? Badge(L("devices.inUse"), Icons.Check, P.SuccessSoft, P.Success, Palette.WithAlpha(P.Success, 0.3)) : null);
        var used = usage is null
            ? L("devices.neverUsed")
            : L("devices.usage", usage.Count, Dates.Parse(usage.LastUsed) is { } day ? Format.Day(day) : "");
        var row = Cells(16,
            (Auto, IconTile(Icons.Monitor)),
            (Star(), Column(3, title, detail.Length > 0 ? T(detail, color: P.MutedForeground) : null)),
            (Auto, Row(4, Icon(Icons.History, 12, P.MutedForeground), T(used, 13, color: P.MutedForeground))),
            (Auto, editable ? Button(null, () => _ = Edit(device), Variant.Ghost, ButtonSize.Icon, Icons.Edit, L("devices.editLabel", device.Name)) : null),
            (Auto, editable
                ? Button(null, () => _ = Delete(device, usage?.Count ?? 0), Variant.Ghost, ButtonSize.Icon, Icons.Delete, L("devices.deleteLabel", device.Name))
                : null));
        var choose = Clickable(row, () => App.ChooseDevice(device.Id), device.Name, 14, new Thickness(20));
        return Card(choose);
    }

    private void Show(string text, bool failed)
    {
        message = (text, failed);
        Refresh();
    }

    private async Task Delete(PracticeDevice device, int count)
    {
        var confirmed = await Confirm(Shell.XamlRoot, L("devices.deleteTitle", device.Name),
            L("devices.deleteRemoval", device.Name) + (count > 0 ? L("devices.deleteRecords", count) : L("devices.deleteNoRecords")),
            L("common.delete.confirm"));
        if (!confirmed) return;
        try
        {
            await App.DeleteDeviceAsync(device.Id);
            Show(L("devices.deleted", device.Name), false);
        }
        catch (Exception error)
        {
            Show(Loc.ErrorText(error), true);
        }
    }

    /// <summary>Adding or editing a device (the web app's device dialog). The dialog stays open until it is saved or cancelled.</summary>
    private async Task Edit(PracticeDevice? device)
    {
        var name = Input(device?.Name ?? "", L("devices.dialog.namePlaceholder"));
        var layout = Input(device?.Layout ?? "", L("devices.dialog.layoutPlaceholder"));
        var nameHelp = T(L("devices.dialog.nameHelp"), 12, color: P.MutedForeground);
        var layoutHelp = T(L("devices.dialog.layoutHelp"), 12, color: P.MutedForeground);
        var use = new ToggleSwitch { IsOn = true, OnContent = "", OffContent = "" };
        var formError = T("", 13, color: P.Destructive);
        formError.Visibility = Visibility.Collapsed;
        static StackPanel Field(string label, bool optional, TextBox box, TextBlock help) =>
            Column(6, Row(2, T(label, 14, FontWeights.SemiBold), optional ? T(L("devices.dialog.optional"), color: P.MutedForeground) : null), box, help);
        var body = Column(20,
            T(device is null ? L("devices.dialog.addDescription") : L("devices.dialog.editDescription"), color: P.MutedForeground),
            Field(L("devices.dialog.name"), false, name, nameHelp),
            Field(L("devices.dialog.layout"), true, layout, layoutHelp),
            device is null
                ? Cells(12, (Star(), Column(2, T(L("devices.dialog.use"), 14, FontWeights.Medium), T(L("devices.dialog.useHelp"), 12, color: P.MutedForeground))),
                    (Auto, use))
                : null,
            formError);
        body.Width = 432;
        var dialog = Dialog(Shell.XamlRoot, device is null ? L("devices.dialog.addTitle") : L("devices.dialog.editTitle"), body);
        dialog.PrimaryButtonText = device is null ? L("common.form.add") : L("common.form.save");
        dialog.CloseButtonText = L("common.form.cancel");
        dialog.DefaultButton = ContentDialogButton.Primary;
        dialog.PrimaryButtonStyle = ButtonStyle(P.Primary, P.PrimaryForeground);
        string? saved = null;
        dialog.PrimaryButtonClick += async (_, args) =>
        {
            var deferral = args.GetDeferral();
            try
            {
                var edited = new PracticeDevice(device?.Id ?? Ids.Random(), name.Text, layout.Text);
                var problem = Core.Devices.Problem(App.Devices, edited, device is not null, App.DefaultDeviceName);
                nameHelp.Text = problem?.Field == DeviceField.Name ? Loc.ErrorText(problem.Error) : L("devices.dialog.nameHelp");
                nameHelp.Foreground = Brush(problem?.Field == DeviceField.Name ? P.Destructive : P.MutedForeground);
                layoutHelp.Text = problem?.Field == DeviceField.Layout ? Loc.ErrorText(problem.Error) : L("devices.dialog.layoutHelp");
                layoutHelp.Foreground = Brush(problem?.Field == DeviceField.Layout ? P.Destructive : P.MutedForeground);
                StyleInput(name, problem?.Field == DeviceField.Name);
                StyleInput(layout, problem?.Field == DeviceField.Layout);
                var formProblem = problem?.Field == DeviceField.Form ? Loc.ErrorText(problem.Error) : null;
                formError.Text = formProblem ?? "";
                formError.Visibility = formProblem is null ? Visibility.Collapsed : Visibility.Visible;
                if (problem is not null)
                {
                    args.Cancel = true;
                    return;
                }
                try
                {
                    await App.SaveDeviceAsync(edited, device is not null);
                    var trimmed = edited.Name.Trim();
                    if (device is null && use.IsOn && App.Devices.FirstOrDefault(item => item.Name == trimmed) is { } added) App.ChooseDevice(added.Id);
                    saved = trimmed;
                }
                catch (Exception error)
                {
                    formError.Text = Loc.ErrorText(error);
                    formError.Visibility = Visibility.Visible;
                    args.Cancel = true;
                }
            }
            finally
            {
                deferral.Complete();
            }
        };
        await dialog.ShowAsync();
        if (saved is not null) Show(device is null ? L("devices.added", saved) : L("devices.saved", saved), false);
    }
}
