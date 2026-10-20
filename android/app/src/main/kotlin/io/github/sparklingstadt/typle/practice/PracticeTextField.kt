package io.github.sparklingstadt.typle.practice

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.ActionMode
import android.view.DragEvent
import android.view.Gravity
import android.view.KeyEvent
import android.view.Menu
import android.view.MenuItem
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import io.github.sparklingstadt.typle.core.committedText

/**
 * The practice input. Text being composed by an input method (romaji, pinyin) is shown but never judged: only text
 * with no composing span reaches `onCommit`, like compositionstart/compositionend in the web app. Prediction,
 * autocorrection, pasting and dropping are off, and Esc on a hardware keyboard starts the run again.
 */
@Composable
fun PracticeTextField(
  text: String,
  placeholder: String,
  focusRequest: Int,
  textColor: Color,
  hintColor: Color,
  onCommit: (String) -> Unit,
  onComposingChange: (Boolean) -> Unit,
  onFocusChange: (Boolean) -> Unit,
  onEscape: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val field = remember { FieldRef() }
  AndroidView(
    factory = { context -> PracticeEditText(context).also { field.view = it } },
    modifier = modifier,
    update = { view ->
      view.onCommit = onCommit
      view.onComposingChange = onComposingChange
      view.onEscape = onEscape
      view.setOnFocusChangeListener { _, focused -> onFocusChange(focused) }
      view.hint = placeholder
      view.contentDescription = placeholder
      view.setTextColor(textColor.toArgb())
      view.setHintTextColor(hintColor.toArgb())
      view.show(text)
    },
  )
  LaunchedEffect(focusRequest) { field.view?.focusAndShowKeyboard() }
}

private class FieldRef {
  var view: PracticeEditText? = null
}

@SuppressLint("ViewConstructor")
class PracticeEditText(context: Context) : EditText(context) {
  var onCommit: (String) -> Unit = {}
  var onComposingChange: (Boolean) -> Unit = {}
  var onEscape: () -> Unit = {}
  private var composing = false
  private var updating = false

  init {
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
    imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN or EditorInfo.IME_ACTION_NONE
    isSingleLine = true
    gravity = Gravity.CENTER
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
    // The border and focus ring are drawn around it in Compose, like the web app's input.
    background = null
    setBackgroundColor(AndroidColor.TRANSPARENT)
    val padding = (12 * resources.displayMetrics.density).toInt()
    setPadding(padding, 0, padding, 0)
    isLongClickable = false
    // No cut, copy or paste menu: pasted text would count as typed.
    val noMenu = object : ActionMode.Callback {
      override fun onCreateActionMode(mode: ActionMode?, menu: Menu?) = false
      override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?) = false
      override fun onActionItemClicked(mode: ActionMode?, item: MenuItem?) = false
      override fun onDestroyActionMode(mode: ActionMode?) {}
    }
    customSelectionActionModeCallback = noMenu
    customInsertionActionModeCallback = noMenu
    addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable) {
        if (updating) return
        val value = committedText(s.toString(), BaseInputConnection.getComposingSpanStart(s), BaseInputConnection.getComposingSpanEnd(s))
        val isComposing = value == null
        if (isComposing != composing) {
          composing = isComposing
          onComposingChange(isComposing)
        }
        if (value != null) onCommit(value)
      }
    })
    setOnKeyListener { _, keyCode, event ->
      // Return does nothing; words advance when they are typed correctly.
      if (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) return@setOnKeyListener true
      if (keyCode != KeyEvent.KEYCODE_ESCAPE) return@setOnKeyListener false
      if (event.action == KeyEvent.ACTION_UP && !composing) onEscape()
      true
    }
  }

  /** Sets the judged input; replacing the text while something is being composed would cancel the composition. */
  fun show(value: String) {
    if (composing || text.toString() == value) return
    updating = true
    setText(value)
    setSelection(value.length)
    updating = false
  }

  fun focusAndShowKeyboard() {
    post {
      requestFocus()
      context.getSystemService(InputMethodManager::class.java)?.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  override fun onTextContextMenuItem(id: Int): Boolean {
    if (id == android.R.id.paste || id == android.R.id.pasteAsPlainText) return true
    return super.onTextContextMenuItem(id)
  }

  /** Dropped text would count as typed. */
  override fun onDragEvent(event: DragEvent?): Boolean = false

  /**
   * An input method can end a composition without changing the text (finishComposingText for kana that need no
   * conversion), which no TextWatcher hears. The text is judged then, once, as when it was committed with a change.
   */
  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
    val connection = super.onCreateInputConnection(outAttrs) ?: return null
    return object : InputConnectionWrapper(connection, true) {
      override fun finishComposingText(): Boolean = super.finishComposingText().also { compositionMayHaveEnded() }
      override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean =
        super.commitText(text, newCursorPosition).also { compositionMayHaveEnded() }
      override fun setComposingRegion(start: Int, end: Int): Boolean = super.setComposingRegion(start, end).also { compositionMayHaveEnded() }
    }
  }

  private fun compositionMayHaveEnded() {
    if (!composing) return
    val s = text ?: return
    val value = committedText(s.toString(), BaseInputConnection.getComposingSpanStart(s), BaseInputConnection.getComposingSpanEnd(s)) ?: return
    composing = false
    onComposingChange(false)
    onCommit(value)
  }
}
