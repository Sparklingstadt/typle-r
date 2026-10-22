using System.Globalization;
using System.Text.RegularExpressions;

namespace Typle.Core;

// The forms Typle stores (see server/internal/workspace/time.go): toISOString for its own records, and the slash form
// of the sample lists and lists from before ISO dates. Like Date.parse, a date without a time is UTC, and a time without
// a zone is local. Instants are DateTimeOffsets in UTC; days and weeks follow a TimeZoneInfo, the PC's by default.
public static partial class Dates
{
    [GeneratedRegex(@"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}(?::\d{2})?)?$")]
    private static partial Regex IsoDateTime();

    [GeneratedRegex(@"^(\d{4})-(\d{2})-(\d{2})$")]
    private static partial Regex IsoDate();

    [GeneratedRegex(@"^(\d{4})/(\d{1,2})/(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$")]
    private static partial Regex SlashDate();

    /// <summary>Reads a stored date, or null when Typle would reject it. Local times follow <paramref name="zone"/>.</summary>
    public static DateTimeOffset? Parse(string value, TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        var iso = IsoDateTime().Match(value);
        if (iso.Success)
        {
            var local = LocalDateTime(iso, 1, 2, 3, 4, 5, 6, 7);
            if (local is null) return null;
            var offsetText = iso.Groups[8].Value;
            if (offsetText.Length == 0) return Resolve(local.Value, zone);
            if (offsetText == "Z") return new DateTimeOffset(local.Value, TimeSpan.Zero);
            var sign = offsetText[0] == '-' ? -1 : 1;
            var parts = offsetText[1..].Split(':').Select(int.Parse).ToArray();
            if (parts[0] > 18 || parts[1] > 59 || (parts.Length > 2 && parts[2] > 59)) return null;
            var offset = new TimeSpan(parts[0], parts[1], parts.Length > 2 ? parts[2] : 0) * sign;
            // DateTimeOffset takes whole minutes only; an offset with seconds is applied by hand.
            var utc = DateTime.SpecifyKind(local.Value - offset, DateTimeKind.Utc);
            return new DateTimeOffset(utc);
        }
        var date = IsoDate().Match(value);
        if (date.Success)
        {
            var day = LocalDateTime(date, 1, 2, 3);
            return day is null ? null : new DateTimeOffset(day.Value, TimeSpan.Zero);
        }
        var slash = SlashDate().Match(value);
        if (slash.Success)
        {
            // A time needs its minutes; seconds are optional, as in "2024/09/22 10:05".
            var local = LocalDateTime(slash, 1, 2, 3, 4, 5, 6);
            return local is null ? null : Resolve(local.Value, zone);
        }
        return null;
    }

    private static DateTime? LocalDateTime(Match match, params int[] groups)
    {
        int Part(int index, int fallback) =>
            index < groups.Length && match.Groups[groups[index]].Success
                ? int.Parse(match.Groups[groups[index]].Value, CultureInfo.InvariantCulture)
                : fallback;
        var year = Part(0, 1970);
        var month = Part(1, 1);
        var day = Part(2, 1);
        var hour = Part(3, 0);
        var minute = Part(4, 0);
        var second = Part(5, 0);
        if (month is < 1 or > 12 || day < 1 || day > DateTime.DaysInMonth(year, month) || hour > 23 || minute > 59 ||
            second > 59) return null;
        var ticks = 0L;
        if (groups.Length > 6 && match.Groups[groups[6]].Success)
        {
            ticks = long.Parse(match.Groups[groups[6]].Value.PadRight(9, '0'), CultureInfo.InvariantCulture) / 100;
        }
        return new DateTime(year, month, day, hour, minute, second, DateTimeKind.Unspecified).AddTicks(ticks);
    }

    /// <summary>
    /// The instant of a local date and time, as java.time resolves it: in a gap the time moves forward by the gap, and
    /// in an overlap the earlier offset wins.
    /// </summary>
    public static DateTimeOffset Resolve(DateTime local, TimeZoneInfo zone)
    {
        local = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        TimeSpan offset;
        if (zone.IsAmbiguousTime(local)) offset = zone.GetAmbiguousTimeOffsets(local).Max();
        else if (zone.IsInvalidTime(local)) offset = zone.GetUtcOffset(local.AddDays(-1));
        else offset = zone.GetUtcOffset(local);
        return new DateTimeOffset(DateTime.SpecifyKind(local - offset, DateTimeKind.Utc));
    }

    /// <summary><c>Date.prototype.toISOString</c>: UTC with milliseconds, such as <c>2026-10-10T02:00:00.000Z</c>.</summary>
    public static string IsoString(DateTimeOffset instant) =>
        instant.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>Milliseconds since 1970 for a stored date, or 0 when unreadable (records are validated when read).</summary>
    internal static double TimeOf(string value) => Parse(value) is { } instant ? instant.ToUnixTimeMilliseconds() : 0;

    internal static DateTimeOffset FromMillis(double millis) => DateTimeOffset.FromUnixTimeMilliseconds((long)millis);

    /// <summary>The calendar day an instant falls on in <paramref name="zone"/>.</summary>
    public static DateOnly LocalDate(DateTimeOffset instant, TimeZoneInfo? zone = null) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, zone ?? TimeZoneInfo.Local).DateTime);

    internal static DateTimeOffset StartOfDay(DateOnly day, TimeZoneInfo zone) => Resolve(day.ToDateTime(TimeOnly.MinValue), zone);

    internal static DateTimeOffset StartOfDay(DateTimeOffset instant, TimeZoneInfo zone) => StartOfDay(LocalDate(instant, zone), zone);

    /// <summary>The same local time <paramref name="days"/> later, as <c>ZonedDateTime.plusDays</c>.</summary>
    public static DateTimeOffset PlusDays(DateTimeOffset instant, int days, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTime(instant, zone);
        var moved = local.DateTime.AddDays(days);
        // An overlap keeps the offset the time had, when it is still valid.
        if (zone.IsAmbiguousTime(moved) && zone.GetAmbiguousTimeOffsets(moved).Contains(local.Offset))
        {
            return new DateTimeOffset(DateTime.SpecifyKind(moved - local.Offset, DateTimeKind.Utc));
        }
        return Resolve(moved, zone);
    }

    internal static int DaysBetween(DateTimeOffset from, DateTimeOffset to, TimeZoneInfo zone) =>
        LocalDate(to, zone).DayNumber - LocalDate(from, zone).DayNumber;
}
