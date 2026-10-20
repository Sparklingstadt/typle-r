package io.github.sparklingstadt.typle.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class RecordsTest {
  @Test fun recordOrderingAndDeletion() {
    val legacy = StoredRecord(time = 1.0, date = "2026-01-01")
    val slow = StoredRecord(id = "slow", time = 5.0, date = "2026-01-02", accuracy = 100.0)
    val fast = StoredRecord(id = "fast", time = 2.0, date = "2026-01-03", accuracy = 100.0)
    val records = listOf(legacy, slow, fast)
    assertEquals(listOf(fast, slow, legacy), bestRecords(records))
    assertEquals(listOf(legacy, fast, slow), bestRecords(records, order = RankOrder.SPEED))
    val lists = listOf(
      WordList(id = "a", name = "A", words = listOf(Word("a", "a")), records = records, createdAt = "2026-01-01"),
      WordList(id = "b", name = "B", words = listOf(Word("b", "b")), records = listOf(legacy), createdAt = "2026-01-01"),
    )
    assertEquals(fast, recordRows(lists).first().record)
    assertEquals(listOf(slow, fast), removeRecord(lists, "a", legacy)[0].records)
    assertEquals(listOf(legacy, slow), removeRecord(lists, "a", fast)[0].records)
    assertEquals(lists[1], removeRecord(lists, "a", fast)[1])
  }

  @Test fun makeAndAddRecordOnce() {
    val session = TypingSession(startedAt = 1_000.0, finishedAt = 3_500.0, attempts = 4, mistakes = 1)
    val record = makeRecord(session, wordCount = 2, id = "r1", device = PracticeDevice(id = "d1", name = "Tab"))
    assertEquals(2.5, record.time, 0.0)
    assertEquals(75.0, record.accuracy!!, 0.0)
    assertEquals("1970-01-01T00:00:03.500Z", record.date)
    val list = WordList(id = "l", name = "L", words = listOf(Word("a", "a")), createdAt = "2026-01-01")
    val once = addRecord(listOf(list), "l", record)
    assertEquals(once, addRecord(once, "l", record))
    assertEquals(TypleException("recordListDeleted"), assertThrows(TypleException::class.java) { addRecord(emptyList(), "l", record) })
    assertThrows(TypleException::class.java) { makeRecord(TypingSession(), wordCount = 1, id = "x", device = null) }
  }

  @Test fun bestComparesCurrentWordCount() {
    val words = listOf(Word("a", "a"), Word("b", "b"))
    val old = StoredRecord(id = "old", time = 1.0, date = "2026-01-01T00:00:00.000Z", accuracy = 100.0, wordCount = 1)
    val now = StoredRecord(id = "now", time = 9.0, date = "2026-01-02T00:00:00.000Z", accuracy = 90.0, wordCount = 2)
    val list = WordList(id = "l", name = "L", words = words, records = listOf(old, now), createdAt = "2026-01-01")
    assertEquals(now, listBest(list))
    assertEquals(listOf(now), recordRows(listOf(list)).filter { it.best }.map { it.record })
    val ranking = listRanking(list)
    assertEquals(listOf(now), ranking.ranked)
    assertEquals(listOf(old), ranking.others)
    assertFalse(ranking.fallback)
  }

  @Test fun timePartsAndAccuracy() {
    assertEquals(listOf("1", "00.00"), recordTimeParts(59.999).map { it.value })
    assertEquals(listOf("5.00"), recordTimeParts(5.0).map { it.value })
    assertEquals(listOf("1", "15.50"), recordTimeParts(75.5).map { it.value })
    assertEquals(listOf(TimeUnit.MINUTES, TimeUnit.SECONDS), recordTimeParts(75.5).map { it.unit })
    assertEquals("97.3%", formatAccuracy(97.25))
    assertEquals("100%", formatAccuracy(100.0))
    assertEquals("—", formatAccuracy(null))
  }

  @Test fun deviceOptionsPutRecordsWithoutDeviceLast() {
    val device = PracticeDevice(id = "d", name = "Tab")
    val records = listOf(StoredRecord(time = 1.0, date = "2026-01-01"), StoredRecord(time = 1.0, date = "2026-01-02", device = device))
    assertEquals(listOf("d", NO_DEVICE), deviceOptions(records).map { it.value })
  }

  @Test fun rankingStatsUseTheLatestFiveRuns() {
    val records = (1..7).map { StoredRecord(id = "$it", time = it.toDouble(), date = "2026-01-0${it}T00:00:00.000Z", accuracy = 90.0 + it) }
    val stats = rankingStats(records.reversed())
    assertEquals(5, stats.recentCount)
    assertEquals(5.0, stats.recentTime!!, 0.0)
    assertEquals(95.0, stats.recentAccuracy!!, 0.0)
    assertEquals(listOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0), stats.points.map { it.value })
  }
}
