package io.github.sparklingstadt.typle.core

/**
 * The text to judge after an edit of the practice field, or null while an input method is composing (romaji, pinyin):
 * like compositionstart/compositionend in the web app, only committed text counts. `composingStart` and
 * `composingEnd` are the field's composing span, -1 when there is none.
 */
fun committedText(text: String, composingStart: Int, composingEnd: Int): String? =
  if (composingStart >= 0 && composingEnd > composingStart) null else text
