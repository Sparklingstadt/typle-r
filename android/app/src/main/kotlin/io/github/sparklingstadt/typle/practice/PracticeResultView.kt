package io.github.sparklingstadt.typle.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypingSession
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.rankRecords
import io.github.sparklingstadt.typle.core.sessionResult
import io.github.sparklingstadt.typle.core.typingSpeed
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.ValueWithUnit
import io.github.sparklingstadt.typle.design.outlined
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L

private sealed interface Comparison {
  data object FirstAtCount : Comparison
  data object FirstForList : Comparison
  data class Best(val difference: Double) : Comparison
  data class Behind(val previous: StoredRecord) : Comparison
}

/**
 * The result of a finished run (src/components/Practice/PracticeResult.tsx). Ranks use the same order as the best
 * records, so only rank 1 is shown as an improvement, and only runs at this word count are compared.
 */
@Composable
fun PracticeResultView(
  list: WordList,
  session: TypingSession,
  device: PracticeDevice?,
  record: StoredRecord?,
  saveState: SaveState,
  onRestart: () -> Unit,
  onRetry: () -> Unit,
  onChooseList: () -> Unit,
) {
  val app = LocalApp.current
  val result = sessionResult(session)
  val wordCount = list.words.size
  val ranked = rankRecords(list.records.filter { it.wordCount == wordCount })
  val rank = if (record != null && saveState == SaveState.SAVED) ranked.indexOfFirst { it.id == record.id } + 1 else 0
  val previous = ranked.firstOrNull { it.id != record?.id }
  val comparison = when {
    previous == null -> if (list.records.any { it.id != record?.id }) Comparison.FirstAtCount else Comparison.FirstForList
    rank == 1 && record != null -> Comparison.Best(record.time - previous.time)
    else -> Comparison.Behind(previous)
  }
  val isBest = comparison is Comparison.Best
  val faster = comparison is Comparison.Best && comparison.difference < 0
  // Enter on a hardware keyboard starts again, as on the web.
  val focus = remember { FocusRequester() }
  LaunchedEffect(Unit) { focus.requestFocus() }
  Column(
    Modifier.fillMaxWidth().focusRequester(focus).focusable()
      .onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyUp && (event.key == Key.Enter || event.key == Key.NumPadEnter)) { onRestart(); true } else false
      }
      .semantics { contentDescription = L("practice.result.completed", list.name) }
      .padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 24.dp),
    verticalArrangement = Arrangement.spacedBy(20.dp),
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
      T(L("practice.result.title"), size = 26.sp, weight = FontWeight.Bold)
      if (isBest) {
        Row(
          Modifier.height(28.dp).background(Palette.amberSoft, CircleShape).padding(horizontal = 10.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Glyph(Icons.Outlined.EmojiEvents, size = 14.dp, tint = Palette.amber)
          T(L("practice.result.newBest"), size = 13.sp, weight = FontWeight.Bold, color = Palette.amber)
        }
      }
    }
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Tile(L("practice.result.time"), Format.seconds(result.time), L("practice.result.seconds"), note(comparison, list), isBest,
        if (faster) Icons.AutoMirrored.Outlined.TrendingDown else null)
      Tile(L("practice.result.accuracy"), Format.number(result.accuracy, 2), "%", L("practice.result.mistakes", result.mistakes))
      Tile(L("practice.result.speed"), typingSpeed(session, 0.0)?.toString() ?: "—", L("practice.result.speedUnit"),
        L("practice.result.correct", session.attempts - session.mistakes))
      Tile(L("practice.result.words"), "$wordCount", L("practice.result.wordUnit"), Format.device(device), icon = Icons.Outlined.Keyboard)
    }
    when (saveState) {
      SaveState.FAILED -> Column(
        Modifier.fillMaxWidth().background(Palette.destructive.copy(alpha = 0.05f), RoundedCornerShape(Radius.lg))
          .border(1.dp, Palette.destructive.copy(alpha = 0.4f), RoundedCornerShape(Radius.lg)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Status(Icons.Outlined.ErrorOutline, L("practice.result.saveFailed"), Palette.destructive)
        TypleButton(onRetry, variant = ButtonVariant.OUTLINE) { ButtonText(L("practice.result.retry")) }
      }
      SaveState.SAVING, SaveState.IDLE -> Status(Icons.Outlined.Sync, L("practice.result.saving"), Palette.mutedForeground)
      SaveState.SAVED -> Status(Icons.Outlined.CheckCircle, L("practice.result.saved", rank), Palette.success)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      TypleButton(onRestart, size = ButtonSize.LG) {
        ButtonText(L("practice.result.again"), Icons.Outlined.RestartAlt)
        T("Enter", Modifier.border(1.dp, Palette.primaryForeground.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 2.dp),
          size = 11.sp, weight = FontWeight.Medium)
      }
      TypleButton(onChooseList, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) { ButtonText(L("practice.result.chooseList")) }
      TypleButton({ app.navigate(Route.Records) }, variant = ButtonVariant.GHOST, size = ButtonSize.LG) {
        ButtonText(L("practice.result.viewRecords"))
        Glyph(Icons.AutoMirrored.Outlined.ArrowForward, size = 14.dp)
      }
    }
  }
}

@Composable
private fun Status(icon: ImageVector, text: String, color: androidx.compose.ui.graphics.Color) {
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    Glyph(icon, size = 16.dp, tint = color)
    T(text, color = color)
  }
}

private fun note(comparison: Comparison, list: WordList): String = when (comparison) {
  is Comparison.Behind -> {
    val time = Format.seconds(comparison.previous.time)
    comparison.previous.accuracy?.let { L("practice.result.behind", time, Format.number(it, 2)) } ?: L("practice.result.behindNoAccuracy", time)
  }
  is Comparison.Best ->
    if (comparison.difference < 0) L("practice.result.faster", Format.seconds(-comparison.difference)) else L("practice.result.bestByAccuracy")
  Comparison.FirstAtCount -> L("practice.result.firstAtCount", list.words.size)
  Comparison.FirstForList -> L("practice.result.firstForList")
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Tile(
  term: String,
  value: String,
  unit: String,
  note: String,
  good: Boolean = false,
  icon: ImageVector? = null,
) {
  Column(
    Modifier.weight(1f).fillMaxHeight().outlined().padding(horizontal = 16.dp, vertical = 14.dp),
    verticalArrangement = Arrangement.spacedBy(2.dp),
  ) {
    T(term, size = 12.sp, color = Palette.mutedForeground)
    ValueWithUnit(value, unit, 28.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      val color = if (good) Palette.success else Palette.mutedForeground
      if (icon != null) Glyph(icon, Modifier.padding(top = 2.dp), size = 12.dp, tint = color)
      T(note, size = 12.sp, weight = if (good) FontWeight.Medium else FontWeight.Normal, color = color)
    }
  }
}
