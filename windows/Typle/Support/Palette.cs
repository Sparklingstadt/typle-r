using Windows.UI;

namespace Typle.Support;

/// <summary>The web app's design tokens (src/app/globals.css, shadcn's neutral theme), in light and dark.</summary>
public sealed record Palette(
    bool Dark,
    // The top bar and the sidebar.
    Color Background,
    // Behind the cards of a page.
    Color Page,
    Color Card,
    Color Foreground,
    Color Primary,
    Color PrimaryForeground,
    Color Muted,
    Color MutedForeground,
    Color Accent,
    Color Border,
    Color Input,
    Color Ring,
    Color Destructive,
    Color DestructiveSoft,
    // Tailwind's green-700 / green-400, for good news.
    Color Success,
    Color SuccessSoft,
    // Tailwind's amber-100 / amber-950 behind a best record, with amber-800 / amber-300 text.
    Color AmberSoft,
    Color Amber,
    Color AmberBorder,
    Color Trend,
    Color Pending)
{
    private static Color Rgb(uint hex, double alpha = 1) =>
        Color.FromArgb((byte)Math.Round(alpha * 255), (byte)(hex >> 16), (byte)((hex >> 8) & 0xFF), (byte)(hex & 0xFF));

    public static readonly Palette Light = new(
        false,
        Background: Rgb(0xFFFFFF), Page: Rgb(0xFAFAFA), Card: Rgb(0xFFFFFF), Foreground: Rgb(0x0A0A0A),
        Primary: Rgb(0x171717), PrimaryForeground: Rgb(0xFAFAFA), Muted: Rgb(0xF5F5F5), MutedForeground: Rgb(0x737373),
        Accent: Rgb(0xF5F5F5), Border: Rgb(0xE5E5E5), Input: Rgb(0xE5E5E5), Ring: Rgb(0xA1A1A1),
        Destructive: Rgb(0xE7000B), DestructiveSoft: Rgb(0xFEE2E2), Success: Rgb(0x008236), SuccessSoft: Rgb(0xDCFCE7),
        AmberSoft: Rgb(0xFEF3C6), Amber: Rgb(0x973C00), AmberBorder: Rgb(0xFEE685), Trend: Rgb(0x2A78D6), Pending: Rgb(0xA1A1A1));

    public static readonly Palette DarkColors = new(
        true,
        Background: Rgb(0x0A0A0A), Page: Rgb(0x1A1A1A), Card: Rgb(0x171717), Foreground: Rgb(0xFAFAFA),
        Primary: Rgb(0xE5E5E5), PrimaryForeground: Rgb(0x171717), Muted: Rgb(0x262626), MutedForeground: Rgb(0xA1A1A1),
        Accent: Rgb(0x262626), Border: Rgb(0xFFFFFF, 0.1), Input: Rgb(0xFFFFFF, 0.15), Ring: Rgb(0x737373),
        Destructive: Rgb(0xFF6467), DestructiveSoft: Rgb(0x460809), Success: Rgb(0x05DF72), SuccessSoft: Rgb(0x032E15),
        AmberSoft: Rgb(0x461901), Amber: Rgb(0xFFD230), AmberBorder: Rgb(0x7B3306), Trend: Rgb(0x3987E5), Pending: Rgb(0x737373));

    /// <summary>The colours of the shown theme; the shell sets them before it builds the screens.</summary>
    public static Palette Current { get; set; } = Light;

    public static Color WithAlpha(Color color, double alpha) => Color.FromArgb((byte)Math.Round(color.A * alpha), color.R, color.G, color.B);
}
