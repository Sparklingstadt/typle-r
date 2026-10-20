package io.github.sparklingstadt.typle.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CompositionFilterTest {
  @Test fun composingTextIsNotJudged() {
    assertNull(committedText("ほげ", 0, 2))
    assertEquals("hoge", committedText("hoge", -1, -1))
    assertNull(committedText("中国", 1, 2))
    // An empty composing span, as some keyboards leave after committing, is not composition.
    assertEquals("ab", committedText("ab", 2, 2))
  }
}
