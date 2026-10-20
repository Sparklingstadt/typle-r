package io.github.sparklingstadt.typle.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material.icons.outlined.TouchApp
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.sparklingstadt.typle.Launch
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.InputComparison
import io.github.sparklingstadt.typle.core.Word
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.comparableRecords
import io.github.sparklingstadt.typle.core.compareInput
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.Kbd
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.support.L
import kotlinx.coroutines.delay

/**
 * The practice screen (src/app/(workspace)/play/page.tsx): the practice card, and beside it (below when narrow) the
 * lists and the best records.
 */
@Composable
fun PracticeView(model: PracticeModel = viewModel()) {
  val app = LocalApp.current
  var pickerOpen by remember { mutableStateOf(false) }
  var pendingSwitch by remember { mutableStateOf<String?>(null) }
  var showAll by remember { mutableStateOf(false) }
  var inputFocused by remember { mutableStateOf(false) }
  var focusedOnce by remember { mutableStateOf(false) }

  fun switchTo(id: String) {
    pendingSwitch = null
    showAll = false
    model.restart(id)
  }

  fun requestSwitch(id: String) {
    if (!model.running) switchTo(id) else if (id != model.list(app.lists)?.id) pendingSwitch = id
  }

  // Each visit starts a new run (turning the tablet is not a visit). This also drops a run from another store, whose
  // lists may be gone, since switching stores happens on 一般.
  LaunchedEffect(app.practiceVisit) {
    if (model.visit != app.practiceVisit) {
      model.visit = app.practiceVisit
      showAll = false
      model.restart()
    }
  }
  // A list another screen asked for, like /play?list=<id>.
  LaunchedEffect(app.practiceRequest) {
    val id = app.practiceRequest
    if (id == null) {
      model.focus()
      return@LaunchedEffect
    }
    app.practiceRequest = null
    if (model.running && id != model.listId) pendingSwitch = id else switchTo(id)
  }
  // Screenshots of a run in progress or finished: the debug build's `typleTyping` types as if from the keyboard.
  LaunchedEffect(Unit) {
    val text = Launch.typing ?: return@LaunchedEffect
    Launch.typing = null
    val list = model.list(app.lists) ?: return@LaunchedEffect
    delay(300)
    var typed = ""
    var i = 0
    while (i < text.length) {
      val codePoint = text.codePointAt(i)
      i += Character.charCount(codePoint)
      typed += String(Character.toChars(codePoint))
      val index = model.session.index
      model.enter(typed, list, app.chosenPracticeDevice, app)
      // A finished word clears the field, so the next characters start a new input.
      if (model.session.index != index || model.finished) typed = ""
      delay(60)
    }
  }

  BoxWithConstraints(Modifier.fillMaxSize().background(Palette.page)) {
    val wide = maxWidth >= 900.dp
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
      Box(
        Modifier.align(Alignment.CenterHorizontally).widthIn(max = 1280.dp).fillMaxWidth()
          .padding(horizontal = if (wide) 48.dp else 20.dp, vertical = 32.dp),
      ) {
        val list = model.list(app.lists)
        if (list == null || list.words.isEmpty()) {
          Column(Modifier.fillMaxWidth().card().padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T(L("practice.empty"), size = 16.sp)
            TypleButton({ app.navigate(Route.CreateList) }) { ButtonText(L("nav.links.create"), Icons.Outlined.Add) }
          }
        } else {
          val card = @Composable { modifier: Modifier ->
            PracticeCard(
              list, model, modifier, showAll, { showAll = it }, inputFocused,
              showResume = focusedOnce && !inputFocused && !pickerOpen && pendingSwitch == null,
              onFocusChange = { focused ->
                inputFocused = focused
                if (focused) focusedOnce = true
              },
              onChooseList = { pickerOpen = true },
            )
          }
          if (wide) {
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
              card(Modifier.weight(1f))
              Aside(list, model, Modifier.width(320.dp), ::requestSwitch) { pickerOpen = true }
            }
          } else {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
              card(Modifier.fillMaxWidth())
              Aside(list, model, Modifier.fillMaxWidth(), ::requestSwitch) { pickerOpen = true }
            }
          }
        }
      }
    }
  }

  if (pickerOpen) {
    ListPickerDialog(app.lists, model.list(app.lists)?.id, ::requestSwitch) {
      pickerOpen = false
      if (!model.finished) model.focus()
    }
  }
  val switching = pendingSwitch
  val current = model.list(app.lists)
  if (switching != null && current != null) {
    AlertDialog(
      onDismissRequest = { pendingSwitch = null; model.focus() },
      title = { T(L("practice.switch.title"), size = 18.sp, weight = FontWeight.SemiBold) },
      text = {
        T(L("practice.switch.description", current.name, model.session.index, current.words.size,
          app.lists.firstOrNull { it.id == switching }?.name ?: ""), color = Palette.mutedForeground)
      },
      confirmButton = {
        TypleButton({ switchTo(switching) }, variant = ButtonVariant.DESTRUCTIVE) { ButtonText(L("practice.switch.confirm")) }
      },
      dismissButton = {
        TypleButton({ pendingSwitch = null; model.focus() }, variant = ButtonVariant.OUTLINE) { ButtonText(L("practice.switch.continue")) }
      },
      containerColor = Palette.card,
      shape = RoundedCornerShape(Radius.xl),
    )
  }
}

@Composable
private fun PracticeCard(
  list: WordList,
  model: PracticeModel,
  modifier: Modifier,
  showAll: Boolean,
  onShowAll: (Boolean) -> Unit,
  inputFocused: Boolean,
  showResume: Boolean,
  onFocusChange: (Boolean) -> Unit,
  onChooseList: () -> Unit,
) {
  val app = LocalApp.current
  Column(modifier.card()) {
    Header(list, model, onChooseList)
    Hairline()
    Progress(model, list.words.size)
    if (model.finished) {
      PracticeResultView(list, model.session, model.practiceDevice, model.record, model.saveState,
        onRestart = { model.restart() }, onRetry = { model.retrySave(app) }, onChooseList = onChooseList)
    } else {
      Practice(list, model, showAll, onShowAll, inputFocused, showResume, onFocusChange)
    }
  }
}

@Composable
private fun Header(list: WordList, model: PracticeModel, onChooseList: () -> Unit) {
  val app = LocalApp.current
  Row(
    Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 12.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Row(
      Modifier.weight(1f, fill = false).height(40.dp).clip(RoundedCornerShape(Radius.md)).clickable(role = Role.Button, onClick = onChooseList)
        .semantics { contentDescription = L("practice.header.switchList", list.name) }.padding(horizontal = 10.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Glyph(Icons.AutoMirrored.Outlined.List, size = 16.dp, tint = Palette.mutedForeground)
      T(list.name, Modifier.weight(1f, fill = false), size = 16.sp, weight = FontWeight.Bold, color = Palette.foreground, maxLines = 1)
      T(L("practice.header.wordCount", list.words.size), size = 13.sp, color = Palette.mutedForeground, maxLines = 1)
      Glyph(Icons.Outlined.UnfoldMore, size = 14.dp, tint = Palette.mutedForeground)
    }
    Spacer(Modifier.weight(0.01f))
    DeviceMenu(if (model.running) model.practiceDevice else app.chosenPracticeDevice, locked = model.running)
    TypleButton(
      {
        app.changeLiveStatsVisible(!app.liveStatsVisible)
        if (!model.finished) model.focus()
      },
      variant = ButtonVariant.GHOST, size = ButtonSize.ICON_LG,
      label = L("practice.header.liveStats") + " " + if (app.liveStatsVisible) L("common.on") else L("common.off"),
    ) { Glyph(if (app.liveStatsVisible) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff, size = 18.dp) }
    TypleButton({ model.restart() }, variant = ButtonVariant.GHOST, size = ButtonSize.LG, label = L("practice.header.restart")) {
      ButtonText(L("practice.header.restartShort"), Icons.Outlined.RestartAlt)
      Kbd("Esc")
    }
  }
}

@Composable
private fun Progress(model: PracticeModel, total: Int) {
  val done = if (model.finished) total else model.session.index
  val current = if (model.finished) total else model.session.index + 1
  Row(
    Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 16.dp)
      .semantics { contentDescription = L("practice.progress.label") + " " + L("practice.progress.value", current, total) },
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(Palette.muted)) {
      Box(Modifier.fillMaxWidth(done.toFloat() / maxOf(total, 1)).height(6.dp).clip(CircleShape).background(Palette.primary))
    }
    T(L("practice.progress.value", current, total), weight = FontWeight.Medium, monospacedDigits = true)
  }
}

@Composable
private fun Practice(
  list: WordList,
  model: PracticeModel,
  showAll: Boolean,
  onShowAll: (Boolean) -> Unit,
  inputFocused: Boolean,
  showResume: Boolean,
  onFocusChange: (Boolean) -> Unit,
) {
  val app = LocalApp.current
  val words = list.words
  val session = model.session
  val word = words[minOf(session.index, words.size - 1)]
  val comparison = compareInput(word.input, session.input)
  Box(Modifier.fillMaxWidth()) {
    Column(
      Modifier.fillMaxWidth().defaultMinSize(minHeight = 208.dp).padding(start = 24.dp, end = 24.dp, top = 32.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
    ) {
      if (word.annotation.isNotEmpty()) T(word.annotation, size = 16.sp, style = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center))
      if (word.display == word.input) {
        TargetText(comparison, wordSize(word.display))
      } else {
        T(word.display, size = wordSize(word.display), weight = FontWeight.Medium, style = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          Box(Modifier.height(22.dp).border(1.dp, Palette.border, CircleShape).padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
            T(L("practice.word.typeThis"), size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
          }
          TargetText(comparison, 30.sp)
        }
      }
    }
    if (showResume) {
      Box(
        Modifier.matchParentSize().background(Palette.card.copy(alpha = 0.85f)).clickable(role = Role.Button) { model.focus() },
        contentAlignment = Alignment.Center,
      ) {
        Row(
          Modifier.height(40.dp).background(Palette.primary, CircleShape).padding(horizontal = 16.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Glyph(Icons.Outlined.TouchApp, size = 16.dp, tint = Palette.primaryForeground)
          T(L("practice.word.resume"), weight = FontWeight.Medium, color = Palette.primaryForeground)
        }
      }
    }
  }
  Column(
    Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 20.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    val invalid = comparison.errorIndex != null
    val ring = when {
      invalid -> Palette.destructive.copy(alpha = 0.2f)
      inputFocused -> Palette.ring.copy(alpha = 0.35f)
      else -> androidx.compose.ui.graphics.Color.Transparent
    }
    Box(Modifier.widthIn(max = 448.dp).fillMaxWidth().border(4.dp, ring, RoundedCornerShape(Radius.lg + 4.dp)).padding(4.dp)) {
      PracticeTextField(
        text = session.input,
        placeholder = L("practice.word.placeholder"),
        focusRequest = model.focusRequest,
        textColor = Palette.foreground,
        hintColor = Palette.mutedForeground,
        onCommit = { value -> model.list(app.lists)?.let { model.enter(value, it, app.chosenPracticeDevice, app) } },
        onComposingChange = { model.composing = it },
        onFocusChange = onFocusChange,
        onEscape = { model.restart() },
        modifier = Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(Radius.lg)).background(Palette.card)
          .border(2.dp, if (invalid) Palette.destructive else if (inputFocused) Palette.primary else Palette.input, RoundedCornerShape(Radius.lg)),
      )
    }
    Feedback(comparison, model.composing)
  }
  if (app.liveStatsVisible) {
    Box(Modifier.padding(start = 24.dp, end = 24.dp, bottom = 20.dp)) { LiveStats(session) }
  }
  Hairline()
  Upcoming(words, session.index, showAll) {
    onShowAll(!showAll)
    model.focus()
  }
}

@Composable
private fun Feedback(comparison: InputComparison, composing: Boolean) {
  Box(Modifier.defaultMinSize(minHeight = 20.dp), contentAlignment = Alignment.Center) {
    val errorIndex = comparison.errorIndex
    when {
      errorIndex != null -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Glyph(Icons.Outlined.ErrorOutline, size = 14.dp, tint = Palette.destructive)
        T(L("practice.feedback.mismatch", errorIndex + 1), size = 13.sp, weight = FontWeight.Medium, color = Palette.destructive)
      }
      composing -> T(L("practice.feedback.composing"), size = 12.sp, color = Palette.mutedForeground)
      else -> Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
          Kbd("Backspace")
          T(L("practice.feedback.backspace"), size = 12.sp, color = Palette.mutedForeground)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
          Kbd("Esc")
          T(L("practice.feedback.restart"), size = 12.sp, color = Palette.mutedForeground)
        }
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Upcoming(words: List<Word>, index: Int, showAll: Boolean, onToggle: () -> Unit) {
  val next = words.drop(index + 1).take(3)
  val remaining = words.size - index - 1 - next.size
  Column(
    Modifier.fillMaxWidth().defaultMinSize(minHeight = 56.dp).padding(start = 24.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
      T(L("practice.upcoming.next"), size = 12.sp, color = Palette.mutedForeground)
      for (word in next) WordChip(word.display)
      if (next.isEmpty()) T(L("practice.upcoming.last"), size = 12.sp, color = Palette.mutedForeground)
      if (remaining > 0) T(L("practice.upcoming.more", remaining), size = 12.sp, color = Palette.pending)
      Spacer(Modifier.weight(1f))
      TypleButton(onToggle, variant = ButtonVariant.GHOST, size = ButtonSize.LG) {
        ButtonText(L("practice.upcoming.showAll"))
        Glyph(if (showAll) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, size = 14.dp)
      }
    }
    if (showAll) {
      Column(Modifier.fillMaxWidth().heightIn(max = 176.dp).verticalScroll(rememberScrollState())) {
        Hairline()
        FlowRow(
          Modifier.padding(vertical = 10.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          words.forEachIndexed { offset, word ->
            WordChip(word.display, if (offset < index) ChipState.DONE else if (offset == index) ChipState.CURRENT else ChipState.PENDING)
          }
        }
      }
    }
  }
}

/** Shorter text gets the large size; anything over 24 characters gets a paragraph size. */
private fun wordSize(text: String): TextUnit {
  val length = text.codePointCount(0, text.length)
  return if (length > 24) 26.sp else if (length > 10) 44.sp else 64.sp
}

@Composable
private fun Aside(list: WordList, model: PracticeModel, modifier: Modifier, onSwitch: (String) -> Unit, onAllLists: () -> Unit) {
  val app = LocalApp.current
  Column(modifier, verticalArrangement = Arrangement.spacedBy(24.dp)) {
    Column(Modifier.fillMaxWidth().card().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Row(Modifier.padding(start = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        T(L("practice.aside.lists"), Modifier.weight(1f), size = 15.sp, weight = FontWeight.Bold)
        TypleButton({ app.navigate(Route.CreateList) }, variant = ButtonVariant.GHOST, size = ButtonSize.LG) {
          ButtonText(L("practice.aside.create"), Icons.Outlined.Add)
        }
      }
      for (item in app.lists.take(8)) ListOptionRow(item, item.id == list.id) { onSwitch(item.id) }
      if (app.lists.size > 8) {
        TypleButton(onAllLists, variant = ButtonVariant.GHOST) { ButtonText(L("practice.aside.allLists")) }
      }
    }
    Column(Modifier.fillMaxWidth().card().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        T(L("practice.aside.best"), size = 15.sp, weight = FontWeight.Bold)
        T(list.name, size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
      }
      val candidates = comparableRecords(list)
      T(if (candidates.size < list.records.size) L("practice.aside.bestOrderAtCount", list.words.size) else L("practice.aside.bestOrder"),
        size = 12.sp, color = Palette.mutedForeground)
      BestRecords(candidates, if (model.saveState == SaveState.SAVED) model.record?.id else null)
      TypleButton({ app.showRankings(list.id) }, variant = ButtonVariant.GHOST, size = ButtonSize.SM) {
        ButtonText(L("practice.aside.allBest"))
        Glyph(Icons.AutoMirrored.Outlined.ArrowForward, size = 12.dp)
      }
    }
  }
}
