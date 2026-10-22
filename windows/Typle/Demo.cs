using Typle.Core;

namespace Typle;

/// <summary>
/// Sample data for screenshots (windows/ci/screenshots.ps1): <c>--demo</c> starts with the starting lists, a device and
/// two weeks of records in a folder of its own, so CI can show every page with content without touching real data.
/// The same records as the iPad and Android apps' sample data.
/// </summary>
public static class Demo
{
    public static string Prepare()
    {
        var directory = Path.Combine(Path.GetTempPath(), "typle-demo");
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        Directory.CreateDirectory(directory);
        File.WriteAllBytes(Path.Combine(directory, "workspace.json"), Workspace.EncodeFile(WorkspaceFile.Of("windows:local", 1, Document())));
        return directory;
    }

    private static WorkspaceDocument Document()
    {
        var zone = TimeZoneInfo.Local;
        var today = Dates.LocalDate(DateTimeOffset.UtcNow, zone);
        string Date(int daysAgo, int hour) => Dates.IsoString(Dates.Resolve(today.AddDays(-daysAgo).ToDateTime(new TimeOnly(hour, 0)), zone));
        var lists = Workspace.InitialLists().ToList();
        var device = new PracticeDevice("demo-pc", "ThinkPad＋HHKB", "US");
        (int Days, int Hour, double Time, int Mistakes, double Accuracy)[] runs =
            [(9, 20, 2.41, 2, 83.33), (6, 21, 1.92, 1, 90.91), (3, 19, 1.35, 0, 100), (1, 22, 1.08, 1, 90.91), (0, 9, 0.98, 0, 100)];
        var first = lists[0];
        lists[0] = first with
        {
            Records =
            [
                .. first.Records,
                .. runs.Select((run, index) => new StoredRecord
                {
                    Id = $"demo-{index}", Time = run.Time, Date = Date(run.Days, run.Hour), Mistakes = run.Mistakes, Accuracy = run.Accuracy,
                    Device = index % 2 == 0 ? device : new PracticeDevice(Devices.DefaultDeviceId, "デフォルト"), WordCount = first.Words.Count,
                }),
            ],
        };
        if (lists.Count > 2)
        {
            var countries = lists[2];
            lists[2] = countries with
            {
                Records =
                [
                    .. countries.Records,
                    new StoredRecord
                    {
                        Id = "demo-countries", Time = 212.4, Date = Date(5, 20), Mistakes = 14, Accuracy = 88.2, Device = device,
                        WordCount = countries.Words.Count,
                    },
                ],
            };
        }
        return new WorkspaceDocument(lists, [device]);
    }
}
