using System.Reflection;
using System.Text.Json;

namespace Typle.Core;

/// <summary>The local workspace file, in the shape of the web app's browser storage (<c>typle-r:guest-workspace:v1</c>).</summary>
public sealed record WorkspaceFile
{
    public int Version { get; init; } = 1;

    public required string AccountId { get; init; }

    public required int Revision { get; init; }

    public required IReadOnlyList<WordList> Lists { get; init; }

    public required IReadOnlyList<PracticeDevice> Devices { get; init; }

    public static WorkspaceFile Of(string accountId, int revision, WorkspaceDocument document) =>
        new() { AccountId = accountId, Revision = revision, Lists = document.Lists, Devices = document.Devices };

    public WorkspaceDocument Document => new(Lists, Devices);
}

public static class Workspace
{
    /// <summary>A saved workspace may hold up to 1 MiB of lists, like an account.</summary>
    public const int MaxBytes = 1024 * 1024;

    // The lists an account starts with (src/plugins/packs), bundled from the web app's own files. They are shown until
    // the first save, which keeps them as the account's own lists.
    private sealed record PackList
    {
        public string? Id { get; init; }

        public required string Name { get; init; }

        public required IReadOnlyList<Word> Words { get; init; }

        public IReadOnlyList<StoredRecord>? Records { get; init; }

        public required string CreatedAt { get; init; }
    }

    private static byte[] Pack(string name)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)
                           ?? throw new InvalidOperationException($"Missing bundled pack {name}");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }

    public static IReadOnlyList<WordList> InitialLists()
    {
        var samples = JsonSerializer.Deserialize<List<PackList>>(Pack("samples.json"), TypleJson.Options)!;
        var countries = JsonSerializer.Deserialize<PackList>(Pack("countries.json"), TypleJson.Options)!;
        return
        [
            .. samples.Select((list, index) => new WordList
            {
                Id = $"sample-{index + 1}", Name = list.Name, Words = list.Words, CreatedAt = list.CreatedAt,
            }),
            new WordList
            {
                Id = countries.Id ?? "countries", Name = countries.Name, Words = countries.Words, Records = countries.Records ?? [],
                CreatedAt = countries.CreatedAt,
            },
        ];
    }

    public static WorkspaceFile DecodeFile(byte[] data, string accountId)
    {
        var file = TypleJson.Decode<WorkspaceFile>(data, "savedDataUnreadable");
        if (file.Version != 1 || file.AccountId != accountId || file.Revision < 0) throw new TypleException("savedDataUnreadable");
        WordLists.ValidateAll(file.Lists);
        return file with { Devices = Devices.Decode(file.Devices) };
    }

    public static byte[] EncodeFile(WorkspaceFile file)
    {
        WordLists.ValidateAll(file.Lists);
        Devices.Decode(file.Devices);
        if (TypleJson.Encode(file.Lists).Length > MaxBytes) throw new TypleException("guestQuotaExceeded");
        return TypleJson.Encode(file);
    }
}
