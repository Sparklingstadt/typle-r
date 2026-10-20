package io.github.sparklingstadt.typle.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The web app's design tokens (src/app/globals.css, shadcn's neutral theme), in light and dark. */
@Immutable
data class TypleColors(
  val dark: Boolean,
  /** The top bar and the sidebar. */
  val background: Color,
  /** Behind the cards of a page. */
  val page: Color,
  val card: Color,
  val foreground: Color,
  val primary: Color,
  val primaryForeground: Color,
  val muted: Color,
  val mutedForeground: Color,
  val accent: Color,
  val border: Color,
  val input: Color,
  val ring: Color,
  val destructive: Color,
  val destructiveSoft: Color,
  /** Tailwind's green-700 / green-400, for good news. */
  val success: Color,
  val successSoft: Color,
  /** Tailwind's amber-100 / amber-950 behind a best record, with amber-800 / amber-300 text. */
  val amberSoft: Color,
  val amber: Color,
  val amberBorder: Color,
  val trend: Color,
  val pending: Color,
)

private fun rgb(hex: Long, alpha: Float = 1f) = Color(0xFF000000 or hex).copy(alpha = alpha)

val LightColors = TypleColors(
  dark = false,
  background = rgb(0xFFFFFF), page = rgb(0xFAFAFA), card = rgb(0xFFFFFF), foreground = rgb(0x0A0A0A),
  primary = rgb(0x171717), primaryForeground = rgb(0xFAFAFA), muted = rgb(0xF5F5F5), mutedForeground = rgb(0x737373),
  accent = rgb(0xF5F5F5), border = rgb(0xE5E5E5), input = rgb(0xE5E5E5), ring = rgb(0xA1A1A1),
  destructive = rgb(0xE7000B), destructiveSoft = rgb(0xFEE2E2), success = rgb(0x008236), successSoft = rgb(0xDCFCE7),
  amberSoft = rgb(0xFEF3C6), amber = rgb(0x973C00), amberBorder = rgb(0xFEE685), trend = rgb(0x2A78D6), pending = rgb(0xA1A1A1),
)

val DarkColors = TypleColors(
  dark = true,
  background = rgb(0x0A0A0A), page = rgb(0x1A1A1A), card = rgb(0x171717), foreground = rgb(0xFAFAFA),
  primary = rgb(0xE5E5E5), primaryForeground = rgb(0x171717), muted = rgb(0x262626), mutedForeground = rgb(0xA1A1A1),
  accent = rgb(0x262626), border = rgb(0xFFFFFF, 0.1f), input = rgb(0xFFFFFF, 0.15f), ring = rgb(0x737373),
  destructive = rgb(0xFF6467), destructiveSoft = rgb(0x460809), success = rgb(0x05DF72), successSoft = rgb(0x032E15),
  amberSoft = rgb(0x461901), amber = rgb(0xFFD230), amberBorder = rgb(0x7B3306), trend = rgb(0x3987E5), pending = rgb(0x737373),
)

val LocalColors = staticCompositionLocalOf { LightColors }

/** The current colours, named as in the iPad app's Palette. */
val Palette: TypleColors
  @Composable @ReadOnlyComposable get() = LocalColors.current

/** Corner radii of `--radius` (10px) and its steps. */
object Radius {
  val sm = 6.dp
  val md = 8.dp
  val lg = 10.dp
  val xl = 14.dp
}
