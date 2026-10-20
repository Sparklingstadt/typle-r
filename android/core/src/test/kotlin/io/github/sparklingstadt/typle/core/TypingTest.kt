package io.github.sparklingstadt.typle.core

import io.github.sparklingstadt.typle.core.CharacterState.CURRENT
import io.github.sparklingstadt.typle.core.CharacterState.CURRENT_ERROR
import io.github.sparklingstadt.typle.core.CharacterState.DONE
import io.github.sparklingstadt.typle.core.CharacterState.ERROR
import io.github.sparklingstadt.typle.core.CharacterState.PENDING
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The same cases as tests/*.test.cjs for src/core and the iPad app's TypleCoreTests, so every app judges runs alike.
class TypingTest {
  @Test fun mistakesRequireCorrectionAndFinishOnce() {
    val words = listOf(Word(display = "ab", input = "ab"), Word(display = "c", input = "c"))
    var s = typeInput(TypingSession(), words, "x", 1000.0)
    assertEquals(0, s.index)
    assertEquals(1, s.mistakes)
    s = typeInput(s, words, "", 1100.0)
    s = typeInput(s, words, "ab", 2000.0)
    assertEquals(1, s.index)
    assertEquals("", s.input)
    s = typeInput(s, words, "c", 3000.0)
    assertEquals(SessionResult(time = 2.0, mistakes = 1, accuracy = 75.0), sessionResult(s))
    assertEquals(s, typeInput(s, words, "c", 4000.0))
  }

  @Test fun emptyListsAndUnicode() {
    assertEquals(TypingSession(), typeInput(TypingSession(), emptyList(), "a", 0.0))
    assertEquals(2, typeInput(TypingSession(), listOf(Word(display = "x", input = "あ😀")), "あ😀", 0.0).attempts)
    // Composed and decomposed forms are different characters to type, as in JavaScript.
    val decomposed = typeInput(TypingSession(), listOf(Word(display = "é", input = "é")), "é", 0.0)
    assertNull(decomposed.finishedAt)
    assertEquals(1, decomposed.mistakes)
    // A surrogate pair is one character: typing a different emoji is one mistake, not two.
    assertEquals(1, typeInput(TypingSession(), listOf(Word(display = "x", input = "😀")), "😁", 0.0).mistakes)
  }

  @Test fun compareInputMarksFromTheFirstMismatch() {
    assertEquals(listOf(CURRENT, PENDING, PENDING, PENDING), compareInput("hoge", "").states)
    assertEquals(listOf(DONE, DONE, CURRENT, PENDING), compareInput("hoge", "ho").states)
    val typo = compareInput("hoge", "hoxe")
    assertEquals(listOf(DONE, DONE, ERROR, ERROR), typo.states)
    assertEquals(2, typo.errorIndex)
    assertEquals(listOf(DONE, ERROR, CURRENT_ERROR, PENDING), compareInput("hoge", "hx").states)
    val extra = compareInput("ab", "abc")
    assertEquals(listOf(DONE, DONE), extra.states)
    assertEquals(listOf("c"), extra.extra)
    assertEquals(2, extra.errorIndex)
    assertEquals(listOf(DONE, DONE), compareInput("あ😀", "あ😀").states)
    assertEquals(listOf("あ", "😀"), compareInput("あ😀", "").characters)
    assertNull(compareInput("あ😀", "あ😀").errorIndex)
  }

  @Test fun typingSpeed() {
    val s = TypingSession(startedAt = 1000.0, attempts = 12, mistakes = 2)
    assertNull(typingSpeed(s.copy(startedAt = null), 5000.0))
    assertNull(typingSpeed(s, 1500.0))
    assertEquals(300, typingSpeed(s, 3000.0))
    assertEquals(20, typingSpeed(s.copy(finishedAt = 31000.0), 99999.0))
  }
}
