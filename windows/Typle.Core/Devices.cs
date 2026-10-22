namespace Typle.Core;

public enum DeviceField { Name, Layout, Form }

public sealed record DeviceProblem(DeviceField Field, TypleException Error);

public sealed record DeviceUsage(int Count, string LastUsed);

// src/core/devices.ts
public static class Devices
{
    public const int MaxDevices = 100;
    public const int MaxDeviceName = 100;
    public const int MaxDeviceLayout = 200;

    /// <summary>
    /// Every account has the built-in デフォルト device, which is practised on until another is chosen. It is not
    /// stored with the registered devices, and its name is shown in the reader's language by this id.
    /// </summary>
    public const string DefaultDeviceId = "default";

    public static bool IsDevice(PracticeDevice device) =>
        device.Id.Length > 0 && device.Id.Length <= 100 && !Text.IsBlank(device.Name) &&
        device.Name.Length <= MaxDeviceName && device.Layout.Length <= MaxDeviceLayout;

    public static IReadOnlyList<PracticeDevice> Decode(IReadOnlyList<PracticeDevice> devices)
    {
        if (devices.Count > MaxDevices || !devices.All(IsDevice) || devices.Any(device => device.Id == DefaultDeviceId) ||
            devices.Select(device => device.Id).Distinct().Count() != devices.Count)
        {
            throw new TypleException("deviceDataInvalid");
        }
        return devices.Select(device => new PracticeDevice(device.Id, device.Name.Trim(), device.Layout.Trim())).ToList();
    }

    public static PracticeDevice DefaultDevice(string name) => new(DefaultDeviceId, name, "");

    /// <summary>
    /// The device a stored choice names: none for 未選択 (""), and the built-in device when nothing was chosen yet
    /// (null) or the chosen device has since been deleted.
    /// </summary>
    public static PracticeDevice? Chosen(IReadOnlyList<PracticeDevice> devices, string? id, string defaultName)
    {
        if (id == "") return null;
        return devices.FirstOrDefault(device => device.Id == id) ?? DefaultDevice(defaultName);
    }

    /// <summary>Whether records on this device id still have a device to practise on, rather than a deleted one.</summary>
    public static bool Exists(IReadOnlyList<PracticeDevice> devices, string id) =>
        id == DefaultDeviceId || devices.Any(device => device.Id == id);

    /// <summary>
    /// Explains why a device cannot be saved, in terms of the field to fix. <paramref name="defaultName"/> is the
    /// built-in device's name in the reader's language, which a registered device may not reuse.
    /// </summary>
    public static DeviceProblem? Problem(IReadOnlyList<PracticeDevice> devices, PracticeDevice device, bool editing, string defaultName = "")
    {
        var name = device.Name.Trim();
        if (name.Length == 0) return new DeviceProblem(DeviceField.Name, new TypleException("deviceNameRequired"));
        if (device.Name.Length > MaxDeviceName)
        {
            return new DeviceProblem(DeviceField.Name, TypleException.With("deviceNameTooLong", "max", MaxDeviceName.ToString()));
        }
        if (device.Layout.Length > MaxDeviceLayout)
        {
            return new DeviceProblem(DeviceField.Layout, TypleException.With("deviceLayoutTooLong", "max", MaxDeviceLayout.ToString()));
        }
        if (editing && devices.All(item => item.Id != device.Id))
        {
            return new DeviceProblem(DeviceField.Form, new TypleException("deviceDeleted"));
        }
        var duplicate = devices.FirstOrDefault(item => item.Id != device.Id && item.Name.ToLowerInvariant() == name.ToLowerInvariant());
        if (duplicate is not null)
        {
            return new DeviceProblem(DeviceField.Name, TypleException.With("deviceNameDuplicate", "name", duplicate.Name));
        }
        if (defaultName.Length > 0 && name.ToLowerInvariant() == defaultName.ToLowerInvariant())
        {
            return new DeviceProblem(DeviceField.Name, TypleException.With("deviceNameDuplicate", "name", defaultName));
        }
        if (!editing && devices.Count >= MaxDevices)
        {
            return new DeviceProblem(DeviceField.Form, TypleException.With("deviceLimit", "max", MaxDevices.ToString()));
        }
        return null;
    }

    public static IReadOnlyList<PracticeDevice> Save(IReadOnlyList<PracticeDevice> devices, PracticeDevice device, bool editing, string defaultName = "")
    {
        if (Problem(devices, device, editing, defaultName) is { } problem) throw problem.Error;
        var normalized = Decode([device])[0];
        return Decode(editing ? devices.Select(item => item.Id == device.Id ? normalized : item).ToList() : [.. devices, normalized]);
    }

    /// <summary>Records keep a snapshot of the device, so its id still links them after the device is renamed.</summary>
    public static IReadOnlyDictionary<string, DeviceUsage> Usage(IReadOnlyList<WordList> lists)
    {
        var usage = new Dictionary<string, DeviceUsage>();
        foreach (var record in lists.SelectMany(list => list.Records))
        {
            if (record.Device is not { } device) continue;
            usage[device.Id] = usage.TryGetValue(device.Id, out var current)
                ? new DeviceUsage(current.Count + 1, Dates.TimeOf(record.Date) > Dates.TimeOf(current.LastUsed) ? record.Date : current.LastUsed)
                : new DeviceUsage(1, record.Date);
        }
        return usage;
    }
}
