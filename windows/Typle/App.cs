using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.XamlTypeInfo;
using Microsoft.Windows.AppLifecycle;
using Typle.Core;
using Windows.Graphics;

namespace Typle;

/// <summary>
/// The application. Typle has no XAML files: the WinUI controls' styles come from XamlControlsResources, and their XAML
/// types from WinUI's own metadata provider, which the XAML compiler would otherwise connect.
/// </summary>
public sealed class App : Application, IXamlMetadataProvider
{
    private readonly XamlControlsXamlMetaDataProvider provider = new();
    private readonly LaunchOptions launch;
    private Window? window;

    public App(LaunchOptions launch)
    {
        this.launch = launch;
        UnhandledException += (_, args) =>
        {
            // An error the screens did not expect is written down and the app keeps going, rather than losing a practice run
            // or an unsaved list.
            Log(args.Exception);
            args.Handled = true;
        };
    }

    public IXamlType GetXamlType(Type type) => provider.GetXamlType(type);

    public IXamlType GetXamlType(string fullName) => provider.GetXamlType(fullName);

    public XmlnsDefinition[] GetXmlnsDefinitions() => provider.GetXmlnsDefinitions();

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        Resources.MergedDictionaries.Add(new XamlControlsResources());
        var app = new AppModel(launch, launch.Demo ? Demo.Prepare() : null);
        window = new Window { Title = "Typle" };
        var shell = new Shell(app, window);
        window.Content = shell.Root;
        var scale = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window)) / 96.0;
        window.AppWindow.Resize(new SizeInt32((int)(1280 * scale), (int)(820 * scale)));
        var icon = Path.Combine(AppContext.BaseDirectory, "Assets", "Typle.ico");
        if (File.Exists(icon)) window.AppWindow.SetIcon(icon);
        window.Activate();
        _ = app.ReloadAsync();
        if (launch.Demo) return;

        RegisterLoginProtocol();
        // A login's callback that started the app (it was closed while the login was shown), or that reached it later.
        if (Program.LaunchUri() is { } launchUri && IsLogin(launchUri)) _ = app.FinishSignInAsync(launchUri.AbsoluteUri);
        Program.Activated += uri => window.DispatcherQueue.TryEnqueue(() =>
        {
            window.Activate();
            if (uri is not null && IsLogin(uri)) _ = app.FinishSignInAsync(uri.AbsoluteUri);
        });
    }

    private static bool IsLogin(Uri uri) => uri.Scheme == AccountLogin.CallbackScheme && uri.Host == "login";

    /// <summary>
    /// Lets the browser open <c>typle-r://login?…</c> with this Typle.exe, for this Windows user, as the iPad and Android apps
    /// receive the same address. It is registered on every start, so a moved app keeps working.
    /// </summary>
    private static void RegisterLoginProtocol()
    {
        try
        {
            ActivationRegistrationManager.RegisterForProtocolActivation(AccountLogin.CallbackScheme,
                Path.Combine(AppContext.BaseDirectory, "Assets", "Typle.ico"), "Typle", Environment.ProcessPath ?? "");
        }
        catch (Exception error) when (error is COMException or ArgumentException or UnauthorizedAccessException)
        {
            Log(error);
        }
    }

    internal static void Log(Exception error)
    {
        try
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Typle");
            Directory.CreateDirectory(directory);
            File.AppendAllText(Path.Combine(directory, "error.log"), $"{DateTimeOffset.Now:O} {error}\n");
        }
        catch (IOException)
        {
        }
    }

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);
}
