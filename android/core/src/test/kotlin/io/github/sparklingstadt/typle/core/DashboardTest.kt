package io.github.sparklingstadt.typle.core

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// tests/dashboard.test.cjs, with the same Tokyo calendar.
class DashboardTest {
  private val tokyo = ZoneId.of("Asia/Tokyo")
  // Sunday 2026-09-27 21:00 JST
  private val now = parseDate("2026-09-27T12:00:00Z")!!
  private val words = listOf(Word("a", "a"), Word("b", "b"))

  private fun record(date: String, time: Double = 10.0, wordCount: Int? = 2, accuracy: Double? = 100.0) =
    StoredRecord(id = date + time, time = time, date = date, mistakes = 0, accuracy = accuracy, wordCount = wordCount)

  private fun list(id: String, records: List<StoredRecord>) = WordList(id = id, name = id, words = words, records = records, createdAt = "2026-09-01")

  private fun day(seconds: Long) = isoString(Instant.ofEpochSecond(seconds))

  @Test fun weeksStartOnLocalMonday() {
    assertEquals("2026-09-20T15:00:00.000Z", isoString(startOfWeek(now, tokyo)))
    val summary = summarize(listOf(list("a", listOf(record("2026-09-20T23:30:00Z"), record("2026-09-20T14:30:00Z")))), now, tokyo)
    assertEquals(1, summary.weekCount)
  }

  @Test fun summaryComparesWithLastWeekAndCountsStreak() {
    val summary = summarize(listOf(list("a", listOf(
      record("2026-09-27T01:00:00Z", 30.0), record("2026-09-26T01:00:00Z", 30.0), record("2026-09-25T01:00:00Z", 30.0),
      record("2026-09-23T01:00:00Z", 30.0),
      record("2026-09-14T01:00:00Z", 20.0), record("2026-09-20T13:00:00Z", 20.0),
    ))), now, tokyo)
    assertEquals(4, summary.weekCount)
    assertEquals(120.0, summary.weekSeconds, 0.0)
    assertEquals(1, summary.previousWeekCount)
    assertEquals(20.0, summary.previousWeekSeconds, 0.0)
    assertEquals(3, summary.streak)
    assertTrue(summary.practicedToday)
  }

  @Test fun streakContinuesFromYesterday() {
    val summary = summarize(listOf(list("a", listOf(record("2026-09-26T01:00:00Z"), record("2026-09-25T01:00:00Z")))), now, tokyo)
    assertFalse(summary.practicedToday)
    assertEquals(2, summary.streak)
    assertEquals(0, summarize(listOf(list("a", listOf(record("2026-09-24T01:00:00Z")))), now, tokyo).streak)
  }

  @Test fun accuracyAveragesLatestTen() {
    val records = (0 until 14).map { record(day(1_788_998_400L + it * 86400L), 10.0, accuracy = if (it < 4) 80.0 else 90.0) } +
      record("2026-09-26T00:00:00Z", 10.0, accuracy = null)
    val accuracy = summarize(listOf(list("a", records)), now, tokyo).accuracy!!
    assertEquals(10, accuracy.recentCount)
    assertEquals(90.0, accuracy.recent, 1e-9)
    assertEquals(80.0, accuracy.change!!.previous, 1e-9)
    assertEquals(4, accuracy.change!!.previousCount)
    assertNull(summarize(listOf(list("a", listOf(record("2026-09-26T00:00:00Z", 1.0, accuracy = null)))), now, tokyo).accuracy)
  }

  @Test fun nextListsRotate() {
    val lists = listOf(
      list("new-1", emptyList()), list("new-2", emptyList()),
      list("stale-4", listOf(record("2026-09-23T01:00:00Z"))), list("stale-9", listOf(record("2026-09-18T01:00:00Z"))),
      list("weak", listOf(record("2026-09-26T01:00:00Z", 10.0, accuracy = 70.0), record("2026-09-10T01:00:00Z", 10.0, accuracy = 100.0))),
      list("fine", listOf(record("2026-09-26T01:00:00Z", 10.0, accuracy = 95.0))),
      list("legacy", listOf(StoredRecord(time = 5.0, date = "2026/09/26 10:05"))),
    )
    val picked = nextLists(lists, now, zone = tokyo)
    assertEquals(listOf("new-1", "stale-9", "weak"), picked.map { it.list.id })
    assertEquals(NextListReason.Stale(days = 9), picked[1].reason)
    assertEquals(NextListReason.Accuracy(accuracy = 85.0, count = 2), picked[2].reason)
    assertEquals(listOf("new-1", "stale-9", "weak", "new-2", "stale-4"), nextLists(lists, now, limit = 6, zone = tokyo).map { it.list.id })
    assertEquals(0, nextLists(listOf(list("x", listOf(record("2026-09-25T14:59:00Z")))), now, zone = tokyo).size)
    assertEquals(NextListReason.Stale(days = 3), nextLists(listOf(list("x", listOf(record("2026-09-24T14:59:00Z")))), now, zone = tokyo).first().reason)
  }

  @Test fun trendsUseSecondsPerWord() {
    val trends = listTrends(listOf(
      list("older", listOf(record("2026-09-20T01:00:00Z"))),
      list("recent", listOf(
        record("2026-09-26T01:00:00Z", 8.0, wordCount = 4, accuracy = 95.0),
        record("2026-09-24T01:00:00Z", 6.0, wordCount = 2, accuracy = 90.0),
        StoredRecord(time = 9.0, date = "2026-09-22T01:00:00Z"),
        record("2026-09-25T01:00:00Z", 5.0, wordCount = 2, accuracy = 100.0),
      )),
      list("empty", emptyList()),
    ))
    assertEquals(listOf("recent", "older"), trends.map { it.list.id })
    val recent = trends[0]
    assertEquals(4, recent.count)
    assertEquals(listOf(3.0, 2.5, 2.0), recent.speed.points.map { it.value })
    assertEquals(listOf(90.0, 100.0, 95.0), recent.accuracy.points.map { it.value })
    assertEquals(Change(recent = 2.25, recentCount = 2, previous = 3.0, previousCount = 1), recent.speed.change)
    assertEquals(100.0, recent.best.accuracy!!, 0.0)
    assertNull(trends[1].speed.change)
  }

  @Test fun trendsKeepTwentyPoints() {
    val records = (0 until 25).map { record(day(1_788_220_800L + it * 86400L), (it + 1).toDouble(), wordCount = 1) }
    val trend = listTrends(listOf(list("a", records)))[0]
    assertEquals(20, trend.speed.points.size)
    assertEquals(6.0, trend.speed.points[0].value, 0.0)
    assertEquals(Change(recent = 23.0, recentCount = 5, previous = 18.0, previousCount = 5), trend.speed.change)
  }

  @Test fun chartScales() {
    assertEquals(Scale(domain = 1.0 to 2.0, ticks = listOf(2.0, 1.5, 1.0), decimals = 1), speedScale(listOf(1.42, 1.92)))
    assertEquals(Scale(domain = 2.5 to 3.5, ticks = listOf(3.5, 3.0, 2.5), decimals = 1), speedScale(listOf(2.6, 3.5)))
    assertEquals(listOf(0.34, 0.32, 0.3), speedScale(listOf(0.31, 0.33)).ticks)
    assertEquals(0.01, speedScale(listOf(0.0, 0.0)).domain.second, 0.0)
    for (values in listOf(listOf(1.42, 1.92), listOf(2.6, 3.5), listOf(0.31, 0.33), listOf(7.0, 70.0), listOf(0.0, 0.0))) {
      val domain = speedScale(values).domain
      assertTrue("$values", domain.first <= values.min() && domain.second >= values.max())
    }
    assertEquals(listOf(100.0, 90.0, 80.0), accuracyScale(listOf(92.0, 98.0)).ticks)
    assertEquals(listOf(100.0, 75.0, 50.0), accuracyScale(listOf(55.0, 98.0)).ticks)
  }

  @Test fun durationsAndDays() {
    assertEquals(listOf("45"), durationParts(45.4).map { it.value })
    assertEquals(listOf("18", "32"), durationParts(1112.0).map { it.value })
    assertEquals(listOf("1", "2"), durationParts(3725.0).map { it.value })
    assertEquals(listOf(TimeUnit.HOURS, TimeUnit.MINUTES), durationParts(3725.0).map { it.unit })
    assertEquals(DayKind.TODAY, dayKind(parseDate("2026-09-27T00:30:00Z")!!, now, tokyo))
    assertEquals(DayKind.YESTERDAY, dayKind(parseDate("2026-09-26T14:30:00Z")!!, now, tokyo))
    assertEquals(DayKind.THIS_YEAR, dayKind(parseDate("2026-09-19T01:00:00Z")!!, now, tokyo))
    assertEquals(DayKind.OTHER_YEAR, dayKind(parseDate("2025-12-31T01:00:00Z")!!, now, tokyo))
  }
}
