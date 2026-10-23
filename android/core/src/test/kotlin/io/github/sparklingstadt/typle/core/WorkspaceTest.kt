package io.github.sparklingstadt.typle.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WorkspaceTest {
  private val words = listOf(Word(display = "a", input = "a"))

  @Test fun workspaceFileRoundTrip() {
    val list = WordList(
      id = "1", name = "A", words = words, createdAt = "2026-01-01",
      records = listOf(StoredRecord(id = "r", time = 1.5, date = "2026-01-01T00:00:00.000Z", mistakes = 0, accuracy = 100.0, wordCount = 1)),
    )
    val file = WorkspaceFile(accountId = "android:local", revision = 3,
      document = WorkspaceDocument(lists = listOf(list), devices = listOf(PracticeDevice(id = "d", name = " Tab "))))
    val decoded = decodeWorkspaceFile(encodeWorkspaceFile(file), "android:local")
    assertEquals(listOf(list), decoded.lists)
    assertEquals(listOf(PracticeDevice(id = "d", name = "Tab")), decoded.devices)
    assertThrows(TypleException::class.java) { decodeWorkspaceFile(encodeWorkspaceFile(file), "other") }
    assertThrows(TypleException::class.java) { decodeWorkspaceFile("{}".toByteArray(), "android:local") }
    // Fields from link sharing are dropped, and unknown record fields do not fail the read.
    val web = """{"version":1,"accountId":"android:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","shared":true,"shareId":"s","words":[{"display":"a","input":"a","annotation":""}],"records":[{"time":5,"date":"2024/09/22 10:05"}]}]}"""
    assertEquals(5.0, decodeWorkspaceFile(web.toByteArray(), "android:local").lists[0].records[0].time, 0.0)
  }

  @Test fun unreadableFileIsAnError() {
    val e = assertThrows(TypleException::class.java) { decodeWorkspaceFile("{\"version\":2}".toByteArray(), "android:local") }
    assertEquals("savedDataUnreadable", e.key)
    assertEquals("savedDataUnreadable", assertThrows(TypleException::class.java) { decodeWorkspaceFile("not json".toByteArray(), "android:local") }.key)
  }

  @Test fun writesTheWebShape() {
    val file = WorkspaceFile(accountId = "android:local", revision = 0,
      document = WorkspaceDocument(lists = listOf(WordList(id = "1", name = "A", words = words, createdAt = "2026-01-01",
        records = listOf(StoredRecord(time = 1.0, date = "2026-01-01")))), devices = emptyList()))
    val text = encodeWorkspaceFile(file).decodeToString()
    // The annotation is written even when empty, and absent record fields stay absent rather than null.
    assertEquals(true, text.contains("\"annotation\":\"\""))
    assertEquals(false, text.contains("null"))
    assertEquals(true, text.startsWith("{\"version\":1,"))
  }

  @Test fun initialListsMatchThePacks() {
    val lists = initialLists()
    assertEquals(listOf("sample-1", "sample-2"), lists.map { it.id }.take(2))
    assertEquals(193, lists[2].words.size)
    assertEquals(listOf("linux-commands-basic", "vim"), listOf(lists[3].id, lists.last().id))
    validateLists(lists)
  }
}
