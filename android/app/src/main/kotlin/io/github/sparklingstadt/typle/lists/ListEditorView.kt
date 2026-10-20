package io.github.sparklingstadt.typle.lists

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DragHandle
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.VerticalAlignBottom
import androidx.compose.material.icons.outlined.VerticalAlignTop
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.MAX_WORDS
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.Word
import io.github.sparklingstadt.typle.core.WordFileFormat
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.currentRecordCount
import io.github.sparklingstadt.typle.core.isoString
import io.github.sparklingstadt.typle.core.listOverviews
import io.github.sparklingstadt.typle.core.parseWordData
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.ConfirmDialog
import io.github.sparklingstadt.typle.design.CountBadge
import io.github.sparklingstadt.typle.design.Edge
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.InputBox
import io.github.sparklingstadt.typle.design.Kbd
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.dashed
import io.github.sparklingstadt.typle.design.hairline
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.errorText
import java.io.IOException
import java.time.Instant
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private data class EditorRow(val id: Long, val word: Word) {
  val filled: Boolean get() = word.display.isNotEmpty() || word.input.isNotEmpty() || word.annotation.isNotEmpty()
}

private var nextRowId = 0L
private fun newRow(word: Word = Word("", "")) = EditorRow(nextRowId++, word)

/** An input equal to the word shown is shown as empty, as the web editor does. */
private fun editorRow(word: Word) = newRow(Word(word.display, if (word.input == word.display) "" else word.input, word.annotation))

/**
 * Creating or editing a list, as a page like /create and /edit/<id> (src/components/WordListEditor.tsx). An empty
 * 入力する文字 means the same as the word shown, and whitespace in words is kept, since it can be meant to be typed.
 */
@Composable
fun ListEditorView(listId: String?) {
  val app = LocalApp.current
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val original = listId?.let { id -> app.lists.firstOrNull { it.id == id } }
  if (listId != null && original == null) {
    PageScroll { T(L("wordLists.page.notFound"), Modifier.fillMaxWidth().card().padding(24.dp)) }
    return
  }

  var name by remember { mutableStateOf(original?.name ?: "") }
  var rows by remember { mutableStateOf(original?.words?.map(::editorRow) ?: listOf(newRow())) }
  val saved = remember { (original?.name ?: "") to rows.map { it.word } }
  var errorMessage by remember { mutableStateOf<String?>(null) }
  var nameError by remember { mutableStateOf<String?>(null) }
  val rowErrors = remember { mutableStateMapOf<Long, String>() }
  var imported by remember { mutableStateOf<List<Word>?>(null) }
  var saving by remember { mutableStateOf(false) }
  var confirmDiscard by remember { mutableStateOf(false) }
  // The field to focus once it is on screen: a row id and its column (0 display, 1 input, 2 annotation).
  var pendingFocus by remember { mutableStateOf<Pair<Long, Int>?>(null) }
  val nameFocus = remember { FocusRequester() }
  val requesters = remember { mutableMapOf<Long, List<FocusRequester>>() }
  fun requester(id: Long, column: Int) = requesters.getOrPut(id) { List(3) { FocusRequester() } }[column]
  val words = rows.map { it.word }
  val changed = saved.first != name || saved.second != words

  LaunchedEffect(pendingFocus) {
    val (id, column) = pendingFocus ?: return@LaunchedEffect
    if (rows.any { it.id == id }) requester(id, column).requestFocus()
    pendingFocus = null
  }
  LaunchedEffect(Unit) { if (original == null) nameFocus.requestFocus() }

  fun leave() {
    if (changed) confirmDiscard = true else app.navigate(Route.Lists)
  }

  fun addRow() {
    val row = newRow()
    rows = rows + row
    pendingFocus = row.id to 0
  }

  fun next(id: Long, column: Int) {
    if (column < 2) {
      pendingFocus = id to column + 1
      return
    }
    val index = rows.indexOfFirst { it.id == id }
    if (index + 1 < rows.size) pendingFocus = rows[index + 1].id to 0 else if (rows.size < MAX_WORDS) addRow()
  }

  fun move(from: Int, to: Int) {
    if (from !in rows.indices || to !in rows.indices || from == to) return
    rows = rows.toMutableList().apply { add(to, removeAt(from)) }
  }

  fun remove(index: Int) {
    if (index !in rows.indices) return
    rows = rows.filterIndexed { i, _ -> i != index }.ifEmpty { listOf(newRow()) }
  }

  fun add(imports: List<Word>, replacing: Boolean) {
    val kept = if (replacing) emptyList() else rows.filter { it.filled }
    if (kept.size + imports.size > MAX_WORDS) {
      errorMessage = errorText(TypleException("importTooManyRows"))
      return
    }
    rows = kept + imports.map(::editorRow)
    imported = null
  }

  fun readFile(uri: Uri) {
    errorMessage = null
    try {
      val resolver = context.contentResolver
      val fileName = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      } ?: uri.lastPathSegment ?: ""
      val format = WordFileFormat.fromFileName(fileName) ?: throw TypleException("importFileType")
      // Reads one byte past the limit, so a larger file is refused without reading all of it.
      val data = resolver.openInputStream(uri)?.use { input -> input.readNBytesCompat(1024 * 1024 + 1) } ?: throw IOException()
      val read = parseWordData(data, format)
      if (name.isBlank()) name = fileName.substringBeforeLast('.')
      if (rows.any { it.filled }) imported = read else add(read, replacing = true)
    } catch (e: Exception) {
      errorMessage = errorText(e)
    }
  }

  val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) readFile(uri) }

  fun save() {
    errorMessage = null
    nameError = null
    rowErrors.clear()
    // Empty rows at the end are ignored; a row with only a note or input must have its word filled in.
    val kept = rows.dropLastWhile { !it.filled }
    for (row in kept) {
      if (row.word.display.isBlank()) rowErrors[row.id] = L("wordLists.editor.displayRequired")
      else if (row.word.input.isNotEmpty() && row.word.input.isBlank()) rowErrors[row.id] = L("wordLists.editor.inputBlank")
    }
    if (name.isBlank()) nameError = errorText(TypleException("listNameRequired"))
    if (rowErrors.isNotEmpty() || nameError != null) {
      errorMessage = L("wordLists.editor.errorCount", rowErrors.size + if (nameError == null) 0 else 1)
      return
    }
    val list = WordList(
      id = original?.id ?: randomId(), name = name,
      words = kept.map { Word(it.word.display, it.word.input.ifEmpty { it.word.display }, it.word.annotation) },
      records = original?.records ?: emptyList(), createdAt = original?.createdAt ?: isoString(Instant.now()),
    )
    saving = true
    scope.launch {
      try {
        app.saveList(list, editing = original != null)
        app.navigate(Route.Lists)
      } catch (e: Exception) {
        errorMessage = errorText(e)
      }
      saving = false
    }
  }

  BackHandler(enabled = changed) { confirmDiscard = true }

  Box(
    Modifier.onPreviewKeyEvent { event ->
      // Ctrl+Enter (or ⌘+Enter) saves, as on the web.
      if (event.type == KeyEventType.KeyDown && event.key == Key.Enter && (event.isCtrlPressed || event.isMetaPressed)) {
        if (!saving) save()
        true
      } else false
    },
  ) {
    PageScroll {
      Row(
        Modifier.clickable(role = Role.Button) { leave() },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Glyph(Icons.Outlined.ChevronLeft, size = 16.dp, tint = Palette.mutedForeground)
        T(L("wordLists.editor.back"), color = Palette.mutedForeground)
      }
      PageHeader(if (original == null) L("wordLists.page.createTitle") else L("wordLists.page.editTitle"), description(original))
      errorMessage?.let { message ->
        Row(
          Modifier.fillMaxWidth().background(Palette.destructive.copy(alpha = 0.05f), RoundedCornerShape(Radius.lg))
            .padding(14.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Glyph(Icons.Outlined.WarningAmber, tint = Palette.destructive)
          T(message, color = Palette.destructive)
        }
      }
      // The name.
      Column(Modifier.fillMaxWidth().card().padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          T(L("wordLists.editor.name"), weight = FontWeight.SemiBold)
          T("*", weight = FontWeight.SemiBold, color = Palette.destructive)
        }
        InputBox(
          name, { name = it }, Modifier.fillMaxWidth().focusRequester(nameFocus), invalid = nameError != null, height = 44.dp,
          imeAction = ImeAction.Next, onImeAction = { rows.firstOrNull()?.let { pendingFocus = it.id to 0 } },
        )
        T(nameError ?: L("wordLists.editor.nameHelp"), size = 12.sp, color = if (nameError != null) Palette.destructive else Palette.mutedForeground)
      }
      // The words.
      Column(Modifier.fillMaxWidth().card()) {
        Row(Modifier.padding(horizontal = 24.dp, vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          T(L("wordLists.editor.words"), size = 16.sp, weight = FontWeight.Bold)
          CountBadge("${rows.size} / ${Format.number(MAX_WORDS.toDouble(), 0)}")
          Spacer(Modifier.weight(1f))
          TypleButton({ picker.launch(arrayOf("*/*")) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.SM) {
            ButtonText(L("wordLists.import.open"), Icons.Outlined.FileUpload)
          }
        }
        Row(
          Modifier.fillMaxWidth().height(34.dp).background(Palette.muted.copy(alpha = 0.5f)).hairline(Edge.TOP).hairline(Edge.BOTTOM)
            .padding(horizontal = 24.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          val header = 12.sp
          T("#", Modifier.width(60.dp), size = header, weight = FontWeight.Medium, color = Palette.mutedForeground)
          Row(Modifier.weight(1f)) {
            T(L("wordLists.editor.display"), size = header, weight = FontWeight.Medium, color = Palette.mutedForeground, maxLines = 1)
            T("*", size = header, color = Palette.destructive)
          }
          Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            T(L("wordLists.editor.input"), size = header, weight = FontWeight.Medium, color = Palette.foreground, maxLines = 1)
            T(L("wordLists.editor.inputHint"), size = header, weight = FontWeight.Medium, color = Palette.mutedForeground, maxLines = 1)
          }
          T(L("wordLists.editor.annotationOptional"), Modifier.weight(1f), size = header, weight = FontWeight.Medium,
            color = Palette.mutedForeground, maxLines = 1)
          Spacer(Modifier.width(76.dp))
        }
        WordRows(
          rows, rowErrors, ::requester,
          onChange = { id, word -> rows = rows.map { if (it.id == id) it.copy(word = word) else it } },
          onNext = ::next, onMove = ::move, onRemove = ::remove,
        )
        Hairline()
        Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
          Row(
            Modifier.fillMaxWidth().height(44.dp).dashed(Palette.border, Radius.lg)
              .clickable(enabled = rows.size < MAX_WORDS, role = Role.Button) { addRow() },
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Glyph(Icons.Outlined.Add, tint = Palette.mutedForeground)
            T(L("wordLists.editor.addWord"), color = Palette.mutedForeground)
          }
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val small = 12.sp
            Kbd("Enter")
            T(L("wordLists.editor.shortcutNext"), size = small, color = Palette.mutedForeground)
            T("・", size = small, color = Palette.mutedForeground)
            Kbd("Ctrl+Enter")
            T(L("wordLists.editor.shortcutSave"), size = small, color = Palette.mutedForeground)
            T("・", size = small, color = Palette.mutedForeground)
            Glyph(Icons.Outlined.DragHandle, size = 12.dp, tint = Palette.mutedForeground)
            T(L("wordLists.editor.shortcutDrag"), size = small, color = Palette.mutedForeground)
          }
        }
      }
      if (original != null && original.records.isNotEmpty() && original.words.size != words.size && currentRecordCount(original) > 0) {
        T(L("wordLists.editor.recount", original.words.size, words.size, currentRecordCount(original)),
          Modifier.fillMaxWidth().background(Palette.amberSoft, RoundedCornerShape(Radius.lg)).padding(14.dp), size = 13.sp, color = Palette.amber)
      }
      // The footer.
      Row(
        Modifier.fillMaxWidth().shadow(4.dp, RoundedCornerShape(Radius.xl)).card().padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        T(if (changed) L("wordLists.editor.unsaved") else L("wordLists.editor.noChanges"), color = if (changed) Palette.foreground else Palette.mutedForeground)
        T(L("wordLists.editor.wordTotal", rows.count { it.filled }), color = Palette.mutedForeground)
        Spacer(Modifier.weight(1f))
        TypleButton(::leave, variant = ButtonVariant.GHOST, size = ButtonSize.LG) { ButtonText(L("common.form.cancel")) }
        TypleButton(::save, size = ButtonSize.LG, enabled = !saving) {
          ButtonText(L("wordLists.editor.save"))
          T("Ctrl+Enter", size = 11.sp, color = Palette.primaryForeground.copy(alpha = 0.6f))
        }
      }
    }
  }

  imported?.let { importWords ->
    AlertDialog(
      onDismissRequest = { imported = null },
      title = { T(L("wordLists.import.existing"), size = 18.sp, weight = FontWeight.SemiBold) },
      text = { T(L("wordLists.import.appendHint", rows.count { it.filled }, importWords.size), color = Palette.mutedForeground) },
      confirmButton = {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          TypleButton({ add(importWords, replacing = true) }, variant = ButtonVariant.DESTRUCTIVE) {
            ButtonText(L("wordLists.import.replaceWith", importWords.size))
          }
          TypleButton({ add(importWords, replacing = false) }) { ButtonText(L("wordLists.import.add", importWords.size)) }
        }
      },
      dismissButton = { TypleButton({ imported = null }, variant = ButtonVariant.OUTLINE) { ButtonText(L("common.form.cancel")) } },
      containerColor = Palette.card,
      shape = RoundedCornerShape(Radius.xl),
    )
  }
  if (confirmDiscard) {
    ConfirmDialog(
      L("wordLists.editor.discardTitle"), L("wordLists.editor.discardDescription"), L("wordLists.editor.discard"),
      onConfirm = { app.navigate(Route.Lists) }, onDismiss = { confirmDiscard = false }, dismiss = L("wordLists.editor.keepEditing"),
    )
  }
}

private fun description(original: WordList?): String {
  if (original == null) return L("wordLists.editor.description")
  val last = listOverviews(listOf(original))[0].lastPracticed
  val practice = if (original.records.isEmpty()) L("wordLists.row.notPracticed")
  else L("wordLists.row.practiced", original.records.size, Format.day(last?.let { Instant.ofEpochMilli(it.toLong()) } ?: Instant.now()))
  return L("wordLists.page.editDescription", original.words.size, practice)
}

/** InputStream.readNBytes is Java 11 (Android 13); this reads up to `limit` bytes on older versions too. */
private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
  val out = java.io.ByteArrayOutputStream()
  val buffer = ByteArray(8192)
  while (out.size() < limit) {
    val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
    if (read < 0) break
    out.write(buffer, 0, read)
  }
  return out.toByteArray()
}

@Composable
private fun WordRows(
  rows: List<EditorRow>,
  errors: Map<Long, String>,
  requester: (Long, Int) -> FocusRequester,
  onChange: (Long, Word) -> Unit,
  onNext: (Long, Int) -> Unit,
  onMove: (Int, Int) -> Unit,
  onRemove: (Int) -> Unit,
) {
  // Dragging a row by its handle: it follows the finger and swaps places with a neighbour half a row away.
  var dragging by remember { mutableStateOf<Long?>(null) }
  var offset by remember { mutableFloatStateOf(0f) }
  val heights = remember { mutableStateMapOf<Long, Int>() }
  Column {
    rows.forEachIndexed { index, row ->
      if (index > 0) Hairline()
      val lifted = dragging == row.id
      Column(
        Modifier.fillMaxWidth().onSizeChanged { heights[row.id] = it.height }
          .zIndex(if (lifted) 1f else 0f)
          .offset { IntOffset(0, if (lifted) offset.roundToInt() else 0) }
          .background(if (lifted) Palette.card else androidx.compose.ui.graphics.Color.Transparent)
          .padding(horizontal = 24.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
      ) {
        val error = errors[row.id]
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
          Row(Modifier.width(60.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
              Modifier.size(width = 20.dp, height = 36.dp)
                .semantics { contentDescription = L("wordLists.wordRow.drag", index + 1) }
                .pointerInput(row.id) {
                  detectDragGesturesAfterLongPress(
                    onDragStart = { dragging = row.id; offset = 0f },
                    onDragEnd = { dragging = null; offset = 0f },
                    onDragCancel = { dragging = null; offset = 0f },
                    onDrag = { change, amount ->
                      change.consume()
                      offset += amount.y
                      val current = rows.indexOfFirst { it.id == row.id }
                      val height = (heights[row.id] ?: 1).toFloat()
                      if (offset > height / 2 && current < rows.size - 1) {
                        onMove(current, current + 1)
                        offset -= height
                      } else if (offset < -height / 2 && current > 0) {
                        onMove(current, current - 1)
                        offset += height
                      }
                    },
                  )
                },
              contentAlignment = Alignment.Center,
            ) { Glyph(Icons.Outlined.DragHandle, size = 16.dp, tint = Palette.mutedForeground) }
            T("${index + 1}", color = Palette.mutedForeground, monospacedDigits = true)
          }
          Cell(row.word.display, { onChange(row.id, row.word.copy(display = it)) }, L("wordLists.editor.displayPlaceholder"),
            error != null && row.word.display.isBlank(), requester(row.id, 0), L("wordLists.editor.displayLabel", index + 1)) { onNext(row.id, 0) }
          Cell(row.word.input, { onChange(row.id, row.word.copy(input = it)) }, row.word.display,
            error != null && row.word.input.isNotEmpty(), requester(row.id, 1), L("wordLists.editor.inputLabel", index + 1)) { onNext(row.id, 1) }
          Cell(row.word.annotation, { onChange(row.id, row.word.copy(annotation = it)) }, L("wordLists.editor.annotationPlaceholder"),
            false, requester(row.id, 2), L("wordLists.editor.annotationLabel", index + 1)) { onNext(row.id, 2) }
          RowMenu(index, rows.size, onMove, onRemove)
          TypleButton({ onRemove(index) }, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, enabled = !(rows.size == 1 && !row.filled),
            label = L("wordLists.editor.deleteWordN", index + 1)) { Glyph(Icons.Outlined.Delete, tint = Palette.mutedForeground) }
        }
        if (error != null) T(error, Modifier.padding(start = 72.dp), size = 12.sp, color = Palette.destructive)
      }
    }
  }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Cell(
  value: String,
  onValueChange: (String) -> Unit,
  placeholder: String,
  invalid: Boolean,
  focus: FocusRequester,
  label: String,
  onNext: () -> Unit,
) {
  InputBox(
    value, onValueChange, Modifier.weight(1f).focusRequester(focus).semantics { contentDescription = label },
    placeholder = placeholder, invalid = invalid, imeAction = ImeAction.Next, onImeAction = onNext,
  )
}

@Composable
private fun RowMenu(index: Int, count: Int, onMove: (Int, Int) -> Unit, onRemove: (Int) -> Unit) {
  var open by remember { mutableStateOf(false) }
  Box {
    TypleButton({ open = true }, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("wordLists.editor.wordActions", index + 1)) {
      Glyph(Icons.Outlined.MoreHoriz)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
      MenuItem(L("wordLists.editor.moveUp"), Icons.Outlined.ArrowUpward, enabled = index > 0) { open = false; onMove(index, index - 1) }
      MenuItem(L("wordLists.editor.moveDown"), Icons.Outlined.ArrowDownward, enabled = index < count - 1) { open = false; onMove(index, index + 1) }
      MenuItem(L("wordLists.editor.moveFirst"), Icons.Outlined.VerticalAlignTop, enabled = index > 0) { open = false; onMove(index, 0) }
      MenuItem(L("wordLists.editor.moveLast"), Icons.Outlined.VerticalAlignBottom, enabled = index < count - 1) { open = false; onMove(index, count - 1) }
      HorizontalDivider(color = Palette.border)
      MenuItem(L("wordLists.editor.deleteWord"), Icons.Outlined.Delete, color = Palette.destructive) { open = false; onRemove(index) }
    }
  }
}
