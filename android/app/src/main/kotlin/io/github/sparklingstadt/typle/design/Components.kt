package io.github.sparklingstadt.typle.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.TabletAndroid
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.StorageKind
import io.github.sparklingstadt.typle.support.L

// MARK: Surfaces

/** shadcn's Card: the card colour, a hairline border and the xl radius. */
@Composable
fun Modifier.card(radius: Dp = Radius.xl): Modifier {
  val shape = RoundedCornerShape(radius)
  return this.clip(shape).background(Palette.card, shape).border(1.dp, Palette.border, shape)
}

/** A bordered box without a fill, like `ring-1 ring-foreground/10`. */
@Composable
fun Modifier.outlined(radius: Dp = Radius.xl, color: Color = Palette.border): Modifier =
  this.border(1.dp, color, RoundedCornerShape(radius))

enum class Edge { TOP, BOTTOM, START, END }

/** A 1dp line along one edge, like the web's `border-b`. */
@Composable
fun Modifier.hairline(edge: Edge): Modifier {
  val color = Palette.border
  return this.drawBehind {
    val width = 1.dp.toPx()
    when (edge) {
      Edge.TOP -> drawRect(color, Offset.Zero, size.copy(height = width))
      Edge.BOTTOM -> drawRect(color, Offset(0f, size.height - width), size.copy(height = width))
      Edge.START -> drawRect(color, Offset.Zero, size.copy(width = width))
      Edge.END -> drawRect(color, Offset(size.width - width, 0f), size.copy(width = width))
    }
  }
}

/** A full-width hairline, the web's `border-t` between sections. */
@Composable
fun Hairline(modifier: Modifier = Modifier) {
  Box(modifier.fillMaxWidth().height(1.dp).background(Palette.border))
}

// MARK: Text and icons

/** Text in the app's type: the system font at the web's sizes. */
@Composable
fun T(
  text: String,
  modifier: Modifier = Modifier,
  size: TextUnit = 14.sp,
  weight: FontWeight = FontWeight.Normal,
  color: Color = LocalContentColor.current,
  maxLines: Int = Int.MAX_VALUE,
  monospacedDigits: Boolean = false,
  style: TextStyle = LocalTextStyle.current,
) {
  Text(
    text, modifier, color = color, fontSize = size, fontWeight = weight, maxLines = maxLines, overflow = TextOverflow.Ellipsis,
    style = if (monospacedDigits) style.copy(fontFeatureSettings = "tnum") else style,
  )
}

/** An icon at the web's lucide sizes, in the current content colour. */
@Composable
fun Glyph(icon: ImageVector, modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = LocalContentColor.current, label: String? = null) {
  Icon(icon, contentDescription = label, modifier = modifier.size(size), tint = tint)
}

// MARK: Buttons

enum class ButtonVariant { PRIMARY, OUTLINE, GHOST, SECONDARY, DESTRUCTIVE }
enum class ButtonSize(val height: Dp, val padding: Dp, val icon: Boolean = false) {
  SM(32.dp, 10.dp), REGULAR(36.dp, 12.dp), LG(40.dp, 16.dp), ICON(36.dp, 0.dp, true), ICON_LG(40.dp, 0.dp, true),
}

/** shadcn's Button variants and sizes. */
@Composable
fun TypleButton(
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  variant: ButtonVariant = ButtonVariant.PRIMARY,
  size: ButtonSize = ButtonSize.REGULAR,
  enabled: Boolean = true,
  label: String? = null,
  content: @Composable RowScope.() -> Unit,
) {
  val source = remember { MutableInteractionSource() }
  val pressed by source.collectIsPressedAsState()
  val shape = RoundedCornerShape(Radius.md)
  val foreground = when (variant) {
    ButtonVariant.PRIMARY -> Palette.primaryForeground
    ButtonVariant.DESTRUCTIVE -> Color.White
    else -> Palette.foreground
  }
  val background = when (variant) {
    ButtonVariant.PRIMARY -> if (pressed) Palette.primary.copy(alpha = 0.85f) else Palette.primary
    ButtonVariant.DESTRUCTIVE -> if (pressed) Palette.destructive.copy(alpha = 0.85f) else Palette.destructive
    ButtonVariant.SECONDARY -> Palette.muted
    ButtonVariant.OUTLINE -> if (pressed) Palette.accent else Palette.card
    ButtonVariant.GHOST -> if (pressed) Palette.accent else Color.Transparent
  }
  var box = modifier
    .defaultMinSize(minWidth = if (size.icon) size.height else 0.dp, minHeight = size.height)
    .clip(shape)
    .background(background, shape)
  if (variant == ButtonVariant.OUTLINE) box = box.border(1.dp, Palette.border, shape)
  box = box
    .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
    .alpha(if (enabled) 1f else 0.5f)
  if (label != null) box = box.semantics { contentDescription = label }
  Row(
    box.padding(horizontal = size.padding),
    horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    CompositionLocalProvider(
      LocalContentColor provides foreground,
      LocalTextStyle provides LocalTextStyle.current.copy(fontSize = if (size == ButtonSize.SM) 13.sp else 14.sp, fontWeight = FontWeight.Medium),
    ) { content() }
  }
}

/** A button's icon and title with the web's 6px gap. */
@Composable
fun ButtonText(text: String, icon: ImageVector? = null) {
  if (icon != null) Glyph(icon, size = 16.dp)
  Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

// MARK: Small parts

/** A keyboard key, like the web's <Kbd>. */
@Composable
fun Kbd(text: String) {
  Box(
    Modifier.defaultMinSize(minHeight = 20.dp).clip(RoundedCornerShape(4.dp)).background(Palette.muted).outlined(4.dp)
      .padding(horizontal = 5.dp),
    contentAlignment = Alignment.Center,
  ) { T(text, size = 11.sp, weight = FontWeight.Medium, color = Palette.mutedForeground) }
}

/** A rounded-full chip with a hairline border: the storage badges and filters. */
@Composable
fun Pill(modifier: Modifier = Modifier, height: Dp = 28.dp, fill: Color = Palette.card, content: @Composable RowScope.() -> Unit) {
  Row(
    modifier.height(height).clip(CircleShape).background(fill).border(1.dp, Palette.border, CircleShape).padding(horizontal = 10.dp),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    CompositionLocalProvider(LocalTextStyle provides LocalTextStyle.current.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium)) { content() }
  }
}

/** shadcn's secondary Badge, such as the 3 / 100 next to a heading. */
@Composable
fun CountBadge(text: String) {
  Box(Modifier.height(22.dp).clip(CircleShape).background(Palette.muted).padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
    T(text, size = 12.sp, weight = FontWeight.Medium, monospacedDigits = true)
  }
}

/** Where the data is saved, as in the top bar and beside page headings (StorageBadge, PageStorageBadge). */
@Composable
fun StorageBadge() {
  val app = LocalApp.current
  val api = app.storage == StorageKind.API
  Pill {
    Glyph(if (api) Icons.Outlined.Cloud else Icons.Outlined.TabletAndroid, size = 12.dp, tint = Palette.mutedForeground)
    T(if (api) L("storage.account") else L("storage.local"), size = 12.sp, weight = FontWeight.Medium,
      color = Palette.foreground.copy(alpha = 0.7f), maxLines = 1)
  }
}

/** A page's heading and description, with the storage badge on the right like the web pages. */
@Composable
fun PageHeader(title: String, description: String? = null, trailing: @Composable () -> Unit = { StorageBadge() }) {
  Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      T(title, size = 26.sp, weight = FontWeight.Bold, color = Palette.foreground)
      if (description != null) T(description, size = 14.sp, color = Palette.mutedForeground)
    }
    trailing()
  }
}

/** A text field with shadcn's Input look. */
@Composable
fun InputBox(
  value: String,
  onValueChange: (String) -> Unit,
  modifier: Modifier = Modifier,
  placeholder: String = "",
  invalid: Boolean = false,
  height: Dp = 40.dp,
  singleLine: Boolean = true,
  leading: (@Composable () -> Unit)? = null,
  trailing: (@Composable () -> Unit)? = null,
  imeAction: ImeAction = ImeAction.Default,
  onImeAction: (() -> Unit)? = null,
  keyboardType: KeyboardType = KeyboardType.Text,
  password: Boolean = false,
) {
  val shape = RoundedCornerShape(Radius.md)
  BasicTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = modifier,
    singleLine = singleLine,
    visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
    textStyle = TextStyle(fontSize = 14.sp, color = Palette.foreground),
    cursorBrush = SolidColor(Palette.foreground),
    keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = keyboardType, imeAction = imeAction),
    keyboardActions = KeyboardActions(onAny = { onImeAction?.invoke() ?: defaultKeyboardAction(imeAction) }),
    decorationBox = { field ->
      Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = height).clip(shape).background(Palette.card)
          .border(1.dp, if (invalid) Palette.destructive else Palette.input, shape).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        leading?.invoke()
        Box(Modifier.weight(1f).padding(vertical = 8.dp)) {
          if (value.isEmpty()) T(placeholder, size = 14.sp, color = Palette.mutedForeground, maxLines = 1)
          field()
        }
        trailing?.invoke()
      }
    },
  )
}

/** A search box with a magnifier, like the web's list and ranking searches. */
@Composable
fun SearchField(text: String, onTextChange: (String) -> Unit, prompt: String, modifier: Modifier = Modifier) {
  InputBox(
    text, onTextChange, modifier, placeholder = prompt,
    leading = { Glyph(Icons.Outlined.Search, size = 16.dp, tint = Palette.mutedForeground) },
    trailing = if (text.isEmpty()) null else {
      {
        Box(Modifier.clickable(role = Role.Button) { onTextChange("") }.semantics { contentDescription = L("common.clearSearch") }) {
          Glyph(Icons.Outlined.Cancel, size = 16.dp, tint = Palette.mutedForeground)
        }
      }
    },
  )
}

/** A rounded-full filter button showing its name and value, like 「リスト すべて ⌄」. */
@Composable
fun FilterLabel(name: String, value: String, modifier: Modifier = Modifier) {
  Row(
    modifier.height(36.dp).clip(CircleShape).background(Palette.card).border(1.dp, Palette.border, CircleShape).padding(horizontal = 14.dp),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    T(name, size = 14.sp, color = Palette.mutedForeground, maxLines = 1)
    T(value, size = 14.sp, weight = FontWeight.Medium, color = Palette.foreground, maxLines = 1)
    Glyph(Icons.Outlined.ExpandMore, size = 14.dp, tint = Palette.mutedForeground)
  }
}

/** The web's FilterMenu: a FilterLabel that opens a menu of choices. */
@Composable
fun <V> FilterMenu(
  name: String,
  options: List<Pair<V, String>>,
  selection: V,
  onSelect: (V) -> Unit,
  modifier: Modifier = Modifier,
  value: String? = null,
) {
  var open by remember { mutableStateOf(false) }
  Box(modifier) {
    FilterLabel(name, value ?: options.firstOrNull { it.first == selection }?.second ?: "", Modifier.clickable(role = Role.Button) { open = true })
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
      for ((value, title) in options) {
        DropdownMenuItem(
          text = { T(title, weight = if (value == selection) FontWeight.Medium else FontWeight.Normal) },
          onClick = { open = false; onSelect(value) },
        )
      }
    }
  }
}

/** Two or more choices on a muted track, the selected one raised (the web's ToggleGroup). */
@Composable
fun <V> SegmentedPills(options: List<Pair<V, String>>, selection: V, onSelect: (V) -> Unit) {
  Row(
    Modifier.clip(CircleShape).background(Palette.muted).border(1.dp, Palette.border, CircleShape).padding(3.dp),
    horizontalArrangement = Arrangement.spacedBy(2.dp),
  ) {
    for ((value, title) in options) {
      val selected = value == selection
      var item = Modifier.height(30.dp)
      if (selected) item = item.shadow(1.dp, CircleShape).background(Palette.card, CircleShape)
      Box(
        item.clip(CircleShape).clickable(role = Role.Tab) { onSelect(value) }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
      ) {
        T(title, size = 13.sp, weight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
          color = if (selected) Palette.foreground else Palette.mutedForeground, maxLines = 1)
      }
    }
  }
}

/** A round icon tile, like the monitor and language icons on the devices and settings cards. */
@Composable
fun IconTile(icon: ImageVector, size: Dp = 40.dp) {
  Box(Modifier.size(size).clip(RoundedCornerShape(Radius.lg)).background(Palette.muted), contentAlignment = Alignment.Center) {
    Glyph(icon, size = size * 0.45f, tint = Palette.foreground.copy(alpha = 0.8f))
  }
}

/** The yellow rank circle of a best record. */
@Composable
fun RankBadge(rank: Int) {
  Box(Modifier.size(22.dp).clip(CircleShape).background(if (rank == 1) Palette.amberSoft else Palette.muted), contentAlignment = Alignment.Center) {
    T("$rank", size = 12.sp, weight = FontWeight.Bold, color = if (rank == 1) Palette.amber else Palette.mutedForeground, monospacedDigits = true)
  }
}

/** A number with its unit in a smaller, muted size: 「1.08 秒」. */
@Composable
fun ValueWithUnit(value: String, unit: String, size: TextUnit = 28.sp, weight: FontWeight = FontWeight.Medium) {
  Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
    T(value, size = size, weight = weight, color = Palette.foreground, monospacedDigits = true, maxLines = 1)
    if (unit.isNotEmpty()) {
      T(unit, Modifier.padding(bottom = (size.value * 0.12f).dp), size = maxOf(12f, size.value * 0.5f).sp, color = Palette.mutedForeground, maxLines = 1)
    }
  }
}

/** The page's content column: centred with the web's max width and padding. */
@Composable
fun PageScroll(maxWidth: Dp = 960.dp, content: @Composable ColumnScope.() -> Unit) {
  Column(Modifier.fillMaxSize().background(Palette.page).verticalScroll(rememberScrollState())) {
    Column(
      Modifier.align(Alignment.CenterHorizontally).widthIn(max = maxWidth).fillMaxWidth()
        .padding(start = 32.dp, end = 32.dp, top = 32.dp, bottom = 48.dp),
      verticalArrangement = Arrangement.spacedBy(24.dp),
    ) { content() }
  }
}

/** Space that takes what is left in a row or column. */
@Composable
fun RowScope.Fill() = Spacer(Modifier.weight(1f))

@Composable
fun ColumnScope.Fill() = Spacer(Modifier.weight(1f))

@Composable
fun Gap(width: Dp) = Spacer(Modifier.width(width))

/** A dashed rounded outline, like the web's `border-dashed` empty states and add buttons. */
fun Modifier.dashed(color: Color, radius: Dp): Modifier = this.drawBehind {
  val stroke = 1.dp.toPx()
  drawRoundRect(
    color = color,
    topLeft = Offset(stroke / 2, stroke / 2),
    size = size.copy(width = size.width - stroke, height = size.height - stroke),
    cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius.toPx()),
    style = androidx.compose.ui.graphics.drawscope.Stroke(
      width = stroke,
      pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())),
    ),
  )
}

/** A yes-or-no question in the card style, like the web's AlertDialog. */
@Composable
fun ConfirmDialog(
  title: String,
  message: String,
  confirm: String,
  onConfirm: () -> Unit,
  onDismiss: () -> Unit,
  destructive: Boolean = true,
  dismiss: String = L("common.form.cancel"),
) {
  androidx.compose.material3.AlertDialog(
    onDismissRequest = onDismiss,
    title = { T(title, size = 18.sp, weight = FontWeight.SemiBold) },
    text = { T(message, color = Palette.mutedForeground) },
    confirmButton = {
      TypleButton({ onDismiss(); onConfirm() }, variant = if (destructive) ButtonVariant.DESTRUCTIVE else ButtonVariant.PRIMARY) { ButtonText(confirm) }
    },
    dismissButton = { TypleButton(onDismiss, variant = ButtonVariant.OUTLINE) { ButtonText(dismiss) } },
    containerColor = Palette.card,
    shape = RoundedCornerShape(Radius.xl),
  )
}

/** A success or failure line under a page heading. */
@Composable
fun StatusMessage(text: String, failed: Boolean) {
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    val color = if (failed) Palette.destructive else Palette.success
    Glyph(if (failed) androidx.compose.material.icons.Icons.Outlined.WarningAmber else androidx.compose.material.icons.Icons.Outlined.CheckCircle,
      size = 16.dp, tint = color)
    T(text, color = color)
  }
}
