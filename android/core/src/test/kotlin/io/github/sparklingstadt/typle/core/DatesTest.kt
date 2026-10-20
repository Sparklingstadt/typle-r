package io.github.sparklingstadt.typle.core

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class DatesTest {
  @Test fun storedForms() {
    assertEquals(1_791_597_600L, parseDate("2026-10-10T02:00:00.000Z")?.epochSecond)
    assertEquals(1_791_597_600L, parseDate("2026-10-10T11:00:00+09:00")?.epochSecond)
    assertEquals(1_791_590_400L, parseDate("2026-10-10")?.epochSecond)
    assertNotNull(parseDate("2024/09/22 10:05"))
    assertNotNull(parseDate("2026-09-26T03:01:23.866446Z"))
    assertNull(parseDate("abc"))
    assertEquals("2026-10-10T02:00:00.000Z", isoString(Instant.ofEpochSecond(1_791_597_600)))
  }
}
