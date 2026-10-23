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
    assertEquals(85, lists.size)
    assertEquals(listOf("un-member-states-chinese-193-beginner-1", "linux-commands-basic-beginner", "sql-server-tsql-syntax-advanced"),
      listOf(lists[2].id, lists[7].id, lists.last().id))
    assertEquals(true, lists.all { it.words.size <= 40 })
    assertEquals(true, lists.all { it.category != null && !it.tags.isNullOrEmpty() })
    validateLists(lists)
  }

  // The group and levels (v0.79.0) are kept through a read and a save; a copy leaves them out.
  @Test fun keepsGroupAndLevels() {
    val web = """{"version":1,"accountId":"android:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","group":"Linuxコマンド","levels":["基本","初級"],"createdAt":"2026-01-01","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]}"""
    val lists = decodeWorkspaceFile(web.toByteArray(), "android:local").lists
    assertEquals("Linuxコマンド", lists[0].group)
    assertEquals(listOf("基本", "初級"), lists[0].levels)
    val text = encodeWorkspaceFile(WorkspaceFile(accountId = "android:local", revision = 0,
      document = WorkspaceDocument(lists = lists, devices = emptyList()))).decodeToString()
    assertEquals(true, text.contains("\"levels\":[\"基本\",\"初級\"]"))
    assertEquals(null, duplicateList(lists, "x", "z", { "（コピー）" }).copy.group)
    assertEquals(11, initialLists().count { it.group == "Linuxコマンド" })
  }

  // The category and tags (v0.78.0) are kept through a read, a save, an edit and a copy, and left out when there are none.
  @Test fun keepsCategoryAndTags() {
    val web = """{"version":1,"accountId":"android:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","category":"プログラミング","tags":["Go","CLI"],"createdAt":"2026-01-01","words":[{"display":"a","input":"a","annotation":""}],"records":[]},{"id":"y","name":"Y","createdAt":"2026-01-01","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]}"""
    val lists = decodeWorkspaceFile(web.toByteArray(), "android:local").lists
    assertEquals("プログラミング", lists[0].category)
    assertEquals(listOf("Go", "CLI"), lists[0].tags)
    val text = encodeWorkspaceFile(WorkspaceFile(accountId = "android:local", revision = 0,
      document = WorkspaceDocument(lists = lists, devices = emptyList()))).decodeToString()
    assertEquals(true, text.contains("\"tags\":[\"Go\",\"CLI\"]"))
    assertEquals(2, text.split("category").size)
    val saved = saveList(lists, lists[0].copy(category = " 語学 ", tags = listOf(" Go", "go", "")), editing = true)
    assertEquals("語学", saved[0].category)
    assertEquals(listOf("Go"), saved[0].tags)
    assertEquals(listOf("Go"), duplicateList(saved, "x", "z", { "（コピー）" }).copy.tags)
    assertEquals(true, matchesQuery(saved[0], "語学"))
    assertThrows(TypleException::class.java) { validateLists(listOf(lists[1].copy(tags = listOf("t".repeat(51))))) }
  }
}
