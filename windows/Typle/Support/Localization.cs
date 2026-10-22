using System.Globalization;
using System.Reflection;
using System.Text.Json;
using Typle.Core;

namespace Typle.Support;

/// <summary>The languages the app has text for. 一般 switches between them in place, as the web app's settings do.</summary>
public enum AppLanguage { Ja, En }

/// <summary>
/// The text of the chosen language, from Messages/&lt;tag&gt;.json (made from the Android app's messages). Screens never
/// hold literal text, as in the web app's messages.
/// </summary>
public static class Loc
{
    private static readonly Dictionary<AppLanguage, Dictionary<string, JsonElement>> Loaded = [];
    private static Dictionary<string, JsonElement> messages = [];

    public static AppLanguage Language { get; private set; } = AppLanguage.Ja;

    public static string Tag(AppLanguage language) => language == AppLanguage.Ja ? "ja" : "en";

    public static AppLanguage? FromTag(string? tag) => tag switch
    {
        "ja" => AppLanguage.Ja,
        "en" => AppLanguage.En,
        _ => null,
    };

    /// <summary>Japanese on a Japanese PC, English otherwise, until one is chosen.</summary>
    public static AppLanguage Preferred() => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ja" ? AppLanguage.Ja : AppLanguage.En;

    public static CultureInfo Culture => CultureInfo.GetCultureInfo(Language == AppLanguage.Ja ? "ja-JP" : "en-US");

    public static void Use(AppLanguage language)
    {
        if (!Loaded.TryGetValue(language, out var loaded))
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"messages.{Tag(language)}.json")
                               ?? throw new InvalidOperationException($"Missing messages for {language}");
            using var document = JsonDocument.Parse(stream);
            loaded = document.RootElement.EnumerateObject().ToDictionary(property => property.Name, property => property.Value.Clone());
            Loaded[language] = loaded;
        }
        messages = loaded;
        Language = language;
    }

    internal static JsonElement? Raw(string key) => messages.TryGetValue(key, out var value) ? value : null;

    /// <summary>
    /// The text for a key in the chosen language, with <c>{0}</c>-style arguments. A plural (<c>{ "one", "other", "arg" }</c>)
    /// is chosen by its numeric argument (1-based <c>arg</c>).
    /// </summary>
    public static string L(string key, params object[] args)
    {
        var format = key;
        if (Raw(key) is { } value)
        {
            if (value.ValueKind == JsonValueKind.String)
            {
                format = value.GetString()!;
            }
            else if (value.ValueKind == JsonValueKind.Object)
            {
                var arg = value.TryGetProperty("arg", out var position) ? position.GetInt32() : 1;
                var count = arg - 1 < args.Length ? args[arg - 1] : null;
                var one = count is int or long or double && Convert.ToDouble(count, CultureInfo.InvariantCulture) == 1;
                format = value.TryGetProperty(one ? "one" : "other", out var form) ? form.GetString()! : key;
            }
        }
        return args.Length == 0 ? format : string.Format(Culture, format, args);
    }

    /// <summary>Fills <c>{name}</c> placeholders, the form error messages share with the web app.</summary>
    public static string Fill(string text, IReadOnlyDictionary<string, string> values) =>
        values.Aggregate(text, (result, pair) => result.Replace("{" + pair.Key + "}", pair.Value));

    /// <summary>The message for an error, in the reader's language.</summary>
    public static string ErrorText(Exception error)
    {
        if (error is TypleException typle && Raw("errors." + typle.Key) is { ValueKind: JsonValueKind.String } text)
        {
            return Fill(text.GetString()!, typle.Values);
        }
        return L("errors.workspaceRequestFailed");
    }
}

public sealed record NumberWithUnit(string Value, string Unit);

/// <summary>Numbers, times, dates and devices as the web app's useFormat() writes them.</summary>
public static class Format
{
    private static string L(string key, params object[] args) => Loc.L(key, args);

    /// <summary>The unit's name after a number: 「秒」 / 「s」.</summary>
    private static string Unit(Core.TimeUnit unit) => unit switch
    {
        Core.TimeUnit.Hours => L("format.hoursUnit"),
        Core.TimeUnit.Minutes => L("format.minutesUnit"),
        _ => L("format.secondsUnit"),
    };

    /// <summary>Number and unit pairs joined as text, with the space English puts between them.</summary>
    private static string Joined(IEnumerable<NumberWithUnit> parts) =>
        string.Join(L("format.timeSeparator"), parts.Select(part => part.Value + L("format.unitSpace") + part.Unit));

    /// <summary>A record's time: 「1.08秒」「1分15.50秒」.</summary>
    public static string Duration(double seconds) => Joined(DurationParts(seconds));

    /// <summary>A record's time as number and unit pairs, for a large number with a small unit.</summary>
    public static IReadOnlyList<NumberWithUnit> DurationParts(double seconds) =>
        Records.TimeParts(seconds).Select(part => new NumberWithUnit(part.Value, Unit(part.Unit))).ToList();

    /// <summary>A total practice time in whole units: 「18分32秒」.</summary>
    public static IReadOnlyList<NumberWithUnit> TotalParts(double seconds) =>
        Dashboard.DurationParts(seconds).Select(part => new NumberWithUnit(part.Value, Unit(part.Unit))).ToList();

    public static string Total(double seconds) => Joined(TotalParts(seconds));

    public static string Seconds(double value) => value.ToString("F2", CultureInfo.InvariantCulture);

    public static string Fixed(double value, int digits) => value.ToString("F" + digits, CultureInfo.InvariantCulture);

    private static DateTime Local(DateTimeOffset instant) => TimeZoneInfo.ConvertTime(instant, TimeZoneInfo.Local).DateTime;

    private static string Pattern(DateTimeOffset instant, string ja, string en) =>
        Local(instant).ToString(Loc.Language == AppLanguage.Ja ? ja : en, Loc.Culture);

    public static string MonthDay(DateTimeOffset instant) => Pattern(instant, "M月d日", "MMM d");

    /// <summary>「今日」「昨日」「10月18日」, with the year only for another year, like the web app's useFormat().day.</summary>
    public static string Day(DateTimeOffset instant, DateTimeOffset? now = null) => Dashboard.KindOfDay(instant, now) switch
    {
        DayKind.Today => L("format.today"),
        DayKind.Yesterday => L("format.yesterday"),
        DayKind.ThisYear => MonthDay(instant),
        _ => Pattern(instant, "yyyy年M月d日", "MMM d, yyyy"),
    };

    /// <summary>「10月20日（火）」.</summary>
    public static string DateWithWeekday(DateTimeOffset instant) => L("format.dateWithWeekday", MonthDay(instant), Pattern(instant, "ddd", "ddd"));

    public static string Date(string value) => Dates.Parse(value) is { } instant ? Day(instant) + " " + Time(value) : value;

    public static string Time(string value) => Dates.Parse(value) is { } instant ? Local(instant).ToString("HH:mm", CultureInfo.InvariantCulture) : value;

    /// <summary>「4/12」 under a chart.</summary>
    public static string ShortDate(string? value) =>
        value is not null && Dates.Parse(value) is { } instant ? Local(instant).ToString("M/d", CultureInfo.InvariantCulture) : "";

    public static string Device(PracticeDevice? device)
    {
        if (device is null) return L("format.noDevice");
        var name = device.Id == Devices.DefaultDeviceId ? L("format.defaultDevice") : device.Name;
        return device.Layout.Length == 0 ? name : L("format.deviceWithLayout", name, device.Layout);
    }

    public static string Number(double value, int digits = 1) =>
        value.ToString("#,0." + new string('#', digits), Loc.Culture);

    public static string Accuracy(double? value) => Records.FormatAccuracy(value);
}
