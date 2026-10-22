using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Windows.ApplicationModel.Activation;

namespace Typle;

/// <summary>
/// The entry point. Typle keeps one window: a second start, such as the browser opening <c>typle-r://login?…</c> at the
/// end of a GitHub login, hands its activation to the running app and ends.
/// </summary>
public static class Program
{
    private const string InstanceKey = "typle-main";

    /// <summary>
    /// Another start handed to the running app, on any thread: with the <c>typle-r://</c> address it was opened with, or
    /// null when Typle was just started again.
    /// </summary>
    public static event Action<Uri?>? Activated;

    [STAThread]
    private static int Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        var launch = LaunchOptions.Parse(args);
        // The screenshots' sample runs are separate from the app in use: they neither take nor give activations.
        if (!launch.Demo && RedirectedToRunningApp()) return 0;
        Application.Start(_ =>
        {
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            new App(launch);
        });
        return 0;
    }

    /// <summary>The <c>typle-r://</c> address this start was opened with, if any.</summary>
    public static Uri? LaunchUri()
    {
        try
        {
            var args = AppInstance.GetCurrent().GetActivatedEventArgs();
            return args.Kind == ExtendedActivationKind.Protocol && args.Data is IProtocolActivatedEventArgs protocol ? protocol.Uri : null;
        }
        catch (COMException)
        {
            return null;
        }
    }

    private static bool RedirectedToRunningApp()
    {
        var main = AppInstance.FindOrRegisterForKey(InstanceKey);
        if (main.IsCurrent)
        {
            main.Activated += (_, args) =>
                Activated?.Invoke(args.Kind == ExtendedActivationKind.Protocol && args.Data is IProtocolActivatedEventArgs protocol
                    ? protocol.Uri
                    : null);
            return false;
        }
        Redirect(AppInstance.GetCurrent().GetActivatedEventArgs(), main);
        return true;
    }

    // Waits for the redirection while COM keeps working on this STA thread, as Microsoft's single-instance sample does.
    private static void Redirect(AppActivationArguments args, AppInstance main)
    {
        var done = CreateEvent(IntPtr.Zero, true, false, null);
        Task.Run(() =>
        {
            try
            {
                main.RedirectActivationToAsync(args).AsTask().Wait();
            }
            finally
            {
                SetEvent(done);
            }
        });
        _ = CoWaitForMultipleObjects(0, 0xFFFFFFFF, 1, [done], out _);
        CloseHandle(done);
        try
        {
            // This start was in front; the running window comes in front in its place.
            SetForegroundWindow(Process.GetProcessById((int)main.ProcessId).MainWindowHandle);
        }
        catch (ArgumentException)
        {
        }
    }

    [DllImport("kernel32.dll", EntryPoint = "CreateEventW", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateEvent(IntPtr attributes, bool manualReset, bool initialState, string? name);

    [DllImport("kernel32.dll")]
    private static extern bool SetEvent(IntPtr handle);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("ole32.dll")]
    private static extern uint CoWaitForMultipleObjects(uint flags, uint timeout, uint count, IntPtr[] handles, out uint index);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);
}

/// <summary>
/// What a start asks for before the first screen. <c>--demo</c> starts on sample data in a folder of its own, for the
/// screenshots of windows/ci/screenshots.ps1; the rest choose what it shows.
/// </summary>
public sealed record LaunchOptions(
    bool Demo = false,
    string? Route = null,
    string? Language = null,
    string? Theme = null,
    string? Typing = null,
    string? RankingsList = null)
{
    public static LaunchOptions Parse(IReadOnlyList<string> args)
    {
        var options = new LaunchOptions();
        for (var i = 0; i < args.Count; i++)
        {
            string? Next() => i + 1 < args.Count ? args[++i] : null;
            options = args[i] switch
            {
                "--demo" => options with { Demo = true },
                "--route" => options with { Route = Next() },
                "--language" => options with { Language = Next() },
                "--theme" => options with { Theme = Next() },
                "--typing" => options with { Typing = Next() },
                "--rankings-list" => options with { RankingsList = Next() },
                _ => options,
            };
        }
        return options;
    }
}
