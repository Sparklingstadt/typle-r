using Microsoft.UI.Xaml;
using Typle.Support;

namespace Typle.Pages;

/// <summary>
/// A page of the app. The shell makes one when the page is opened and calls <see cref="Refresh"/> whenever the app's
/// state changes; a page keeps its text fields across refreshes, so typing is never interrupted.
/// </summary>
public abstract class PageView(AppModel app, Shell shell)
{
    protected AppModel App { get; } = app;

    protected Shell Shell { get; } = shell;

    protected static Palette P => Palette.Current;

    public abstract UIElement Root { get; }

    public abstract void Refresh();

    /// <summary>Focuses what the page starts with, once it is on screen.</summary>
    public virtual void Shown()
    {
    }

    protected static string L(string key, params object[] args) => Loc.L(key, args);

    /// <summary>Runs an action of a button whose result the page shows itself; anything it does not catch is shown as text.</summary>
    protected async void Run(Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (Exception error)
        {
            Shell.ShowError(Loc.ErrorText(error));
        }
    }
}
