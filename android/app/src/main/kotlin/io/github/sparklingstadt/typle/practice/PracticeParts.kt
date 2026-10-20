package io.github.sparklingstadt.typle.practice

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.CharacterState
import io.github.sparklingstadt.typle.core.InputComparison
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypingSession
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.bestRecords
import io.github.sparklingstadt.typle.core.defaultDevice
import io.github.sparklingstadt.typle.core.formatAccuracy
import io.github.sparklingstadt.typle.core.listBest
import io.github.sparklingstadt.typle.core.sessionResult
import io.github.sparklingstadt.typle.core.typingSpeed
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.RankBadge
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.SearchField
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.outlined
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * The characters to type, coloured by what has been typed (src/components/Practice/TargetText.tsx): green when
 * done, a caret under the next one, red from the first mistake, and grey for the rest.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TargetText(comparison: InputComparison, size: TextUnit) {
  FlowRow(
    Modifier.semantics { contentDescription = comparison.characters.joinToString("") },
    horizontalArrangement = Arrangement.Center,
  ) {
    comparison.characters.forEachIndexed { index, character -> Character(character, comparison.states[index], size) }
    for (character in comparison.extra) {
      T(character, Modifier.clip(RoundedCornerShape(3.dp)).background(Palette.destructiveSoft), size = size, weight = FontWeight.Medium,
        color = Palette.destructive, style = androidx.compose.ui.text.TextStyle(textDecoration = TextDecoration.LineThrough))
    }
  }
}

@Composable
private fun Character(text: String, state: CharacterState, size: TextUnit) {
  when (state) {
    CharacterState.DONE -> T(text, size = size, weight = FontWeight.Medium, color = Palette.success)
    CharacterState.PENDING -> T(text, size = size, weight = FontWeight.Medium, color = Palette.pending)
    CharacterState.ERROR -> T(text, Modifier.clip(RoundedCornerShape(3.dp)).background(Palette.destructiveSoft), size = size,
      weight = FontWeight.Medium, color = Palette.destructive)
    CharacterState.CURRENT, CharacterState.CURRENT_ERROR -> {
      val current = state == CharacterState.CURRENT
      // The caret's slow pulse.
      val pulse by rememberInfiniteTransition(label = "caret").animateFloat(
        1f, 0.4f, infiniteRepeatable(tween(1000), RepeatMode.Reverse), label = "caret",
      )
      Box {
        T(text, size = size, weight = FontWeight.Medium, color = if (current) Palette.foreground else Palette.pending)
        Box(Modifier.matchParentSize(), contentAlignment = Alignment.BottomCenter) {
          Box(
            Modifier.offset(y = (size.value * 0.08f).dp).fillMaxWidth().height(maxOf(3f, size.value * 0.06f).dp).alpha(pulse)
              .clip(CircleShape).background(if (current) Palette.foreground else Palette.destructive),
          )
        }
      }
    }
  }
}

/** The live elapsed time, speed, accuracy and mistakes. Only this ticks, five times a second, while a run goes on. */
@Composable
fun LiveStats(session: TypingSession) {
  val running = session.startedAt != null && session.finishedAt == null
  var now by remember { mutableDoubleStateOf(System.currentTimeMillis().toDouble()) }
  LaunchedEffect(running) {
    while (running) {
      now = System.currentTimeMillis().toDouble()
      delay(200)
    }
  }
  val elapsed = if (running) maxOf(0.0, now - (session.startedAt ?: now)) else 0.0
  val speed = if (running) typingSpeed(session, now) else null
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.xl)).background(Palette.muted.copy(alpha = 0.4f)).outlined()
      .padding(vertical = 12.dp)
      .semantics { contentDescription = L("practice.stats.label") },
  ) {
    Stat(Icons.Outlined.Timer, L("practice.stats.elapsed"), clock(elapsed))
    Stat(Icons.Outlined.Speed, L("practice.stats.speed"), speed?.toString() ?: "—", L("practice.stats.speedUnit"))
    Stat(Icons.Outlined.TrackChanges, L("practice.stats.accuracy"),
      if (session.attempts > 0) formatAccuracy(sessionResult(session).accuracy) else "—")
    Stat(Icons.Outlined.Close, L("practice.stats.mistakes"), session.mistakes.toString())
  }
}

private fun clock(milliseconds: Double): String {
  val seconds = milliseconds / 1000
  return String.format(Locale.ROOT, "%d:%04.1f", (seconds / 60).toInt(), seconds % 60)
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Stat(icon: ImageVector, term: String, value: String, unit: String? = null) {
  Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
      Glyph(icon, size = 11.dp, tint = Palette.mutedForeground)
      T(term, size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
    }
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
      T(value, size = 20.sp, weight = FontWeight.Medium, monospacedDigits = true, maxLines = 1)
      if (unit != null) T(unit, Modifier.padding(bottom = 2.dp), size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
    }
  }
}

/** The five best runs of a list (src/components/Practice/PracticeBestRecords.tsx). */
@Composable
fun BestRecords(records: List<StoredRecord>, highlightId: String?) {
  val best = bestRecords(records)
  if (best.isEmpty()) {
    T(L("practice.best.empty"), Modifier.padding(horizontal = 8.dp, vertical = 12.dp), color = Palette.mutedForeground)
    return
  }
  Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
    best.forEachIndexed { index, record ->
      val current = record.id != null && record.id == highlightId
      Row(
        Modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(Radius.md))
          .background(if (current) Palette.successSoft else Color.Transparent).padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        RankBadge(index + 1)
        T(L("practice.best.seconds", Format.seconds(record.time)), weight = FontWeight.Medium, monospacedDigits = true, maxLines = 1)
        T(record.accuracy?.let { "${Format.number(it, 2)}%" } ?: L("practice.best.noAccuracy"), monospacedDigits = true, maxLines = 1)
        T(Format.device(record.device), Modifier.weight(1f), size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
        if (current) T("NEW", size = 10.sp, weight = FontWeight.Bold, color = Palette.success)
      }
    }
  }
}

/** The device the run is recorded with (src/components/Practice/DeviceMenu.tsx). It cannot change while a run goes on. */
@Composable
fun DeviceMenu(current: PracticeDevice?, locked: Boolean) {
  val app = LocalApp.current
  var open by remember { mutableStateOf(false) }
  val name = current?.let { Format.device(it) } ?: L("devices.none")
  Box {
    Row(
      Modifier.height(32.dp).clip(CircleShape).background(Palette.card).border(1.dp, Palette.border, CircleShape)
        .clickable(enabled = !locked, role = Role.Button) { open = true }
        .semantics { contentDescription = L("practice.device.label", name) }
        .padding(horizontal = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      val color = if (locked) Palette.mutedForeground else Palette.foreground
      Glyph(Icons.Outlined.Keyboard, size = 13.dp, tint = color)
      T(name, Modifier.widthIn(max = 220.dp), size = 13.sp, weight = FontWeight.Medium, color = color, maxLines = 1)
      Glyph(if (locked) Icons.Outlined.Lock else Icons.Outlined.ExpandMore, size = 12.dp, tint = color)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
      T(L("practice.device.heading"), Modifier.padding(horizontal = 16.dp, vertical = 8.dp), size = 12.sp, weight = FontWeight.Medium,
        color = Palette.mutedForeground)
      for (device in listOf(defaultDevice(app.defaultDeviceName)) + app.devices) {
        DeviceItem(Format.device(device), device.id == current?.id) { open = false; app.chooseDevice(device.id) }
      }
      DeviceItem(L("devices.none"), current == null) { open = false; app.chooseDevice("") }
      HorizontalDivider(color = Palette.border)
      DropdownMenuItem(
        text = { T(L("practice.device.manage")) },
        leadingIcon = { Glyph(Icons.Outlined.DesktopWindows) },
        onClick = { open = false; app.navigate(Route.Devices) },
      )
    }
  }
}

@Composable
private fun DeviceItem(title: String, selected: Boolean, onClick: () -> Unit) {
  DropdownMenuItem(
    text = { T(title, weight = if (selected) FontWeight.Medium else FontWeight.Normal, maxLines = 1) },
    leadingIcon = { Box(Modifier.size(16.dp)) { if (selected) Glyph(Icons.Outlined.Check) } },
    onClick = onClick,
  )
}

/** A list to pick, with a round check like the web's WordListOptions. */
@Composable
fun ListOptionRow(list: WordList, selected: Boolean, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.lg)).background(if (selected) Palette.muted else Color.Transparent)
      .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 12.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Glyph(if (selected) Icons.Filled.CheckCircle else Icons.Outlined.Circle, size = 20.dp,
      tint = if (selected) Palette.primary else Palette.border)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
      T(list.name, size = 15.sp, weight = FontWeight.Medium, color = Palette.foreground, maxLines = 2)
      val best = listBest(list)
      T(if (best != null) L("practice.options.withBest", list.words.size, Format.seconds(best.time)) else L("practice.options.noRecord", list.words.size),
        size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
    }
  }
}

/** Choosing a list, with a filter by name (the web's 「単語リストを選ぶ」 dialog). */
@Composable
fun ListPickerDialog(lists: List<WordList>, selectedId: String?, onSelect: (String) -> Unit, onDismiss: () -> Unit) {
  var query by remember { mutableStateOf("") }
  val needle = query.trim().lowercase()
  val filtered = lists.filter { needle.isEmpty() || it.name.lowercase().contains(needle) }
  Dialog(onDismissRequest = onDismiss) {
    Column(Modifier.widthIn(max = 448.dp).fillMaxWidth().card().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
      Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          T(L("practice.picker.title"), size = 18.sp, weight = FontWeight.SemiBold)
          T(L("practice.picker.description"), color = Palette.mutedForeground)
        }
        TypleButton(onDismiss, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("common.close")) { Glyph(Icons.Outlined.Close) }
      }
      SearchField(query, { query = it }, L("practice.picker.filter"))
      Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (list in filtered) ListOptionRow(list, list.id == selectedId) { onDismiss(); onSelect(list.id) }
        if (filtered.isEmpty()) T(L("practice.picker.noMatch"), Modifier.padding(vertical = 8.dp), color = Palette.mutedForeground)
      }
    }
  }
}

enum class ChipState { DONE, CURRENT, PENDING }

/** A word in the upcoming row or the list of all words. */
@Composable
fun WordChip(text: String, state: ChipState = ChipState.PENDING) {
  val shape = CircleShape
  var box = Modifier.height(28.dp).clip(shape)
  box = when (state) {
    ChipState.CURRENT -> box.background(Palette.primary)
    ChipState.DONE -> box.background(Palette.successSoft)
    ChipState.PENDING -> box.border(1.dp, Palette.border, shape)
  }
  val suffix = when (state) {
    ChipState.DONE -> L("practice.upcoming.done")
    ChipState.CURRENT -> L("practice.upcoming.current")
    ChipState.PENDING -> ""
  }
  Box(box.padding(horizontal = 12.dp).semantics { contentDescription = text + suffix }, contentAlignment = Alignment.Center) {
    T(text, size = 13.sp, maxLines = 1, color = when (state) {
      ChipState.CURRENT -> Palette.primaryForeground
      ChipState.DONE -> Palette.success
      ChipState.PENDING -> Palette.mutedForeground
    })
  }
}

