package io.github.sparklingstadt.typle.core

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WordListsTest {
  private val words = listOf(Word("a", "a"))

  @Test fun validationAndSave() {
    val list = WordList(id = "1", name = " A ", words = words, createdAt = "2026-01-01")
    val saved = saveList(emptyList(), list, editing = false)
    assertEquals("A", saved[0].name)
    assertEquals(TypleException("listNameDuplicate"), assertThrows(TypleException::class.java) {
      saveList(saved, WordList(id = "2", name = "a", words = words, createdAt = "2026-01-01"), editing = false)
    })
    assertThrows(TypleException::class.java) { saveList(saved, WordList(id = "2", name = "B", words = emptyList(), createdAt = "2026-01-01"), editing = false) }
    assertThrows(TypleException::class.java) { saveList(saved, WordList(id = "2", name = "B", words = listOf(Word(" ", "x")), createdAt = "2026-01-01"), editing = false) }
    assertEquals(TypleException("listDeleted"), assertThrows(TypleException::class.java) { saveList(emptyList(), list, editing = true) })
    // Editing keeps the saved records.
    val withRecord = listOf(saved[0].copy(records = listOf(StoredRecord(time = 1.0, date = "2026-01-01"))))
    assertEquals(1, saveList(withRecord, saved[0].copy(name = "C"), editing = true)[0].records.size)
  }

  @Test fun copyNames() {
    val lists = listOf(
      WordList(id = "1", name = "A", words = words, createdAt = "2026-01-01"),
      WordList(id = "2", name = "A（コピー）", words = words, createdAt = "2026-01-01"),
    )
    val result = duplicateList(lists, id = "1", copyId = "3", suffix = { n -> if (n == 1) "（コピー）" else "（コピー$n）" })
    assertEquals("A（コピー2）", result.copy.name)
    assertEquals(3, result.lists.size)
  }

  @Test fun overviewsSortAndSearch() {
    val lists = listOf(
      WordList(id = "1", name = "List 10", words = words, createdAt = "2026-01-01",
        records = listOf(StoredRecord(time = 1.0, date = "2026-01-05T00:00:00.000Z"))),
      WordList(id = "2", name = "List 9", words = words + Word("日本", "nihon"), createdAt = "2026-01-02"),
    )
    val items = listOverviews(lists)
    assertEquals(listOf("2", "1"), sortOverviews(items, ListOrder.ADDED).map { it.id })
    assertEquals(listOf("2", "1"), sortOverviews(items, ListOrder.NAME, Locale.ENGLISH).map { it.id })
    assertEquals(listOf("1", "2"), sortOverviews(items, ListOrder.PRACTICED).map { it.id })
    assertEquals(listOf("2", "1"), sortOverviews(items, ListOrder.WORDS).map { it.id })
    assertEquals(listOf("2"), lists.filter { matchesQuery(it, " NIHON ") }.map { it.id })
  }
}
