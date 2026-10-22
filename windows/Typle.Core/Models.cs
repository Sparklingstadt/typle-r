using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Typle.Core;

/// <summary>
/// An error that names a message under <c>errors</c> instead of carrying text, so the app shows it in the reader's
/// language (as AppError does in src/core/appError.ts). <see cref="Values"/> fill <c>{name}</c> placeholders in the
/// message.
/// </summary>
public sealed class TypleException : Exception
{
    public TypleException(string key, IReadOnlyDictionary<string, string>? values = null) : base(key)
    {
        Key = key;
        Values = values ?? new Dictionary<string, string>();
    }

    public string Key { get; }

    public IReadOnlyDictionary<string, string> Values { get; }

    public override bool Equals(object? obj) =>
        obj is TypleException other && other.Key == Key && other.Values.Count == Values.Count &&
        Values.All(pair => other.Values.TryGetValue(pair.Key, out var value) && value == pair.Value);

    public override int GetHashCode() => Key.GetHashCode();

    /// <summary>An error with one placeholder, such as <c>listLimit</c> with its <c>max</c>.</summary>
    public static TypleException With(string key, string name, string value) =>
        new(key, new Dictionary<string, string> { [name] = value });
}

public sealed record Word(string Display, string Input, string Annotation = "");

public sealed record PracticeDevice(string Id, string Name, string Layout = "");

/// <summary>A practice record as stored. Records from older versions may lack every field but Time and Date.</summary>
public sealed record StoredRecord
{
    public string? Id { get; init; }

    public required double Time { get; init; }

    public required string Date { get; init; }

    public int? Mistakes { get; init; }

    public double? Accuracy { get; init; }

    public PracticeDevice? Device { get; init; }

    public int? WordCount { get; init; }
}

public sealed record WordList
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required IReadOnlyList<Word> Words { get; init; }

    public IReadOnlyList<StoredRecord> Records { get; init; } = [];

    public required string CreatedAt { get; init; }

    // Lists compare by their words and records, as Kotlin's data classes and Swift's structs do.
    public bool Equals(WordList? other) =>
        other is not null && Id == other.Id && Name == other.Name && CreatedAt == other.CreatedAt &&
        Words.SequenceEqual(other.Words) && Records.SequenceEqual(other.Records);

    public override int GetHashCode() => HashCode.Combine(Id, Name, Words.Count, Records.Count);
}

public sealed record WorkspaceDocument(IReadOnlyList<WordList> Lists, IReadOnlyList<PracticeDevice> Devices)
{
    public bool Equals(WorkspaceDocument? other) =>
        other is not null && Lists.SequenceEqual(other.Lists) && Devices.SequenceEqual(other.Devices);

    public override int GetHashCode() => HashCode.Combine(Lists.Count, Devices.Count);
}

public static class TypleJson
{
    /// <summary>
    /// The JSON form Typle stores and sends: unknown fields are skipped, absent optional fields stay absent, and a
    /// missing or null required field fails the read.
    /// </summary>
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
        // Text stays as it is, as the web app writes it.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static T Decode<T>(byte[] data, string error)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(data, Options) ?? throw new TypleException(error);
        }
        catch (JsonException)
        {
            throw new TypleException(error);
        }
        catch (NotSupportedException)
        {
            throw new TypleException(error);
        }
    }

    public static byte[] Encode<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value, Options);

    public static string EncodeString<T>(T value) => JsonSerializer.Serialize(value, Options);
}

public static class Ids
{
    /// <summary>A new random id in the form of <c>crypto.randomUUID</c>, as the web app gives records and lists.</summary>
    public static string Random() => Guid.NewGuid().ToString();
}

internal static class Text
{
    /// <summary>JavaScript's <c>Array.from</c>, which splits a string into code points (a lone surrogate stays one).</summary>
    public static List<int> CodePoints(string text)
    {
        var points = new List<int>(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                points.Add(char.ConvertToUtf32(text[i], text[i + 1]));
                i++;
            }
            else
            {
                points.Add(text[i]);
            }
        }
        return points;
    }

    public static string FromCodePoint(int codePoint) =>
        codePoint is >= 0xD800 and <= 0xDFFF ? ((char)codePoint).ToString() : char.ConvertFromUtf32(codePoint);

    public static string FromCodePoints(IEnumerable<int> codePoints)
    {
        var builder = new StringBuilder();
        foreach (var point in codePoints) builder.Append(FromCodePoint(point));
        return builder.ToString();
    }

    public static int CodePointCount(string text) => CodePoints(text).Count;

    /// <summary>Whether a string is empty after JavaScript's <c>trim</c>.</summary>
    public static bool IsBlank(string text) => text.Trim().Length == 0;

    /// <summary>JavaScript's <c>Math.round</c>, which rounds halves up.</summary>
    public static double JsRound(double value) => Math.Floor(value + 0.5);

    /// <summary>Array.prototype.sort with a "less than" test; LINQ's OrderBy is stable, as JavaScript's sort is.</summary>
    public static List<T> StableSorted<T>(this IEnumerable<T> items, Func<T, T, bool> less) =>
        items.OrderBy(item => item, Comparer<T>.Create((a, b) => less(a, b) ? -1 : less(b, a) ? 1 : 0)).ToList();
}
