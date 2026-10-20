package io.github.sparklingstadt.typle.core

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// src/core/dashboard.ts. Records store UTC timestamps; every day and week boundary here follows the viewer's local
// time zone, which tests pin by passing their own.

const val STALE_DAYS = 3
const val LOW_ACCURACY = 90.0
private const val DASHBOARD_TREND_POINTS = 20

fun startOfWeek(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): Instant =
  instant.atZone(zone).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(zone).toInstant()

internal fun daysBetween(from: Instant, to: Instant, zone: ZoneId): Int =
  ChronoUnit.DAYS.between(from.atZone(zone).toLocalDate(), to.atZone(zone).toLocalDate()).toInt()

private fun plusDays(instant: Instant, days: Long, zone: ZoneId): Instant = instant.atZone(zone).plusDays(days).toInstant()

private fun newestFirst(records: List<StoredRecord>) = records.stableSorted { a, b -> timeOf(a.date) > timeOf(b.date) }

private fun average(values: List<Double>) = values.sum() / values.size

data class Change(val recent: Double, val recentCount: Int, val previous: Double, val previousCount: Int)

private fun change(newest: List<Double>, recentCount: Int, previousCount: Int): Change? {
  if (recentCount <= 0 || previousCount <= 0) return null
  return Change(average(newest.take(recentCount)), recentCount, average(newest.drop(recentCount).take(previousCount)), previousCount)
}

data class AccuracySummary(val recent: Double, val recentCount: Int, val change: Change?)

data class DashboardSummary(
  val weekStart: Instant,
  val weekCount: Int,
  val previousWeekCount: Int,
  val weekSeconds: Double,
  val previousWeekSeconds: Double,
  val streak: Int,
  val practicedToday: Boolean,
  val accuracy: AccuracySummary?,
)

fun summarize(lists: List<WordList>, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): DashboardSummary {
  val records = lists.flatMap { it.records }
  val weekStart = startOfWeek(now, zone)
  fun between(from: Instant, to: Instant) =
    records.filter { timeOf(it.date) >= from.toEpochMilli() && timeOf(it.date) <= to.toEpochMilli() }
  val week = between(weekStart, plusDays(weekStart, 7, zone).minusMillis(1))
  // Compare against the same point of last week so Monday is not measured against a whole week.
  val previousWeek = between(plusDays(weekStart, -7, zone), plusDays(now, -7, zone))
  val days = records.map { startOfDay(Instant.ofEpochMilli(timeOf(it.date).toLong()), zone) }.toSet()
  val today = startOfDay(now, zone)
  val practicedToday = today in days
  var streak = 0
  var day = if (practicedToday) today else plusDays(today, -1, zone)
  while (day in days) {
    streak++
    day = plusDays(day, -1, zone)
  }
  val newest = newestFirst(records).mapNotNull { it.accuracy }
  val recentCount = min(10, newest.size)
  return DashboardSummary(
    weekStart = weekStart, weekCount = week.size, previousWeekCount = previousWeek.size,
    weekSeconds = week.sumOf { it.time }, previousWeekSeconds = previousWeek.sumOf { it.time },
    streak = streak, practicedToday = practicedToday,
    accuracy = if (recentCount > 0) AccuracySummary(average(newest.take(recentCount)), recentCount,
      change(newest, recentCount, min(10, newest.size - recentCount))) else null,
  )
}

sealed interface NextListReason {
  data object New : NextListReason
  data class Stale(val days: Int) : NextListReason
  data class Accuracy(val accuracy: Double, val count: Int) : NextListReason
}

data class NextList(val list: WordList, val lastPracticed: Instant?, val reason: NextListReason) {
  val id: String get() = list.id
}

/** Lists to practise next: unused ones, ones not practised for days, and ones with low recent accuracy, taken in turn. */
fun nextLists(lists: List<WordList>, now: Instant = Instant.now(), limit: Int = 3, zone: ZoneId = ZoneId.systemDefault()): List<NextList> {
  val unused = mutableListOf<NextList>()
  var stale = mutableListOf<NextList>()
  var weak = mutableListOf<NextList>()
  for (list in lists) {
    val records = newestFirst(list.records)
    val latest = records.firstOrNull()
    if (latest == null) {
      unused += NextList(list, null, NextListReason.New)
      continue
    }
    val lastPracticed = Instant.ofEpochMilli(timeOf(latest.date).toLong())
    val days = daysBetween(lastPracticed, now, zone)
    if (days >= STALE_DAYS) {
      stale += NextList(list, lastPracticed, NextListReason.Stale(days))
      continue
    }
    val recent = records.mapNotNull { it.accuracy }.take(5)
    if (recent.isNotEmpty() && average(recent) < LOW_ACCURACY) {
      weak += NextList(list, lastPracticed, NextListReason.Accuracy(average(recent), recent.size))
    }
  }
  stale = stale.stableSorted { a, b -> (a.reason as NextListReason.Stale).days > (b.reason as NextListReason.Stale).days }.toMutableList()
  weak = weak.stableSorted { a, b ->
    (a.reason as NextListReason.Accuracy).accuracy < (b.reason as NextListReason.Accuracy).accuracy
  }.toMutableList()
  // Take from each reason in turn so a pile of unused lists never hides neglected or weak ones.
  val groups = listOf(unused, stale, weak)
  val picked = mutableListOf<NextList>()
  var index = 0
  while (picked.size < limit && groups.any { index < it.size }) {
    for (group in groups) if (index < group.size && picked.size < limit) picked += group[index]
    index++
  }
  return picked
}

data class TrendPoint(val date: String, val value: Double)

data class Trend(val points: List<TrendPoint>, val change: Change?)

data class ListTrend(
  val list: WordList,
  val count: Int,
  val lastPracticed: Instant,
  val speed: Trend,
  val accuracy: Trend,
  val best: StoredRecord,
) {
  val id: String get() = list.id
}

private fun trend(points: List<TrendPoint>): Trend {
  val newest = points.map { it.value }.reversed()
  val recentCount = min(5, (newest.size + 1) / 2)
  return Trend(points.takeLast(DASHBOARD_TREND_POINTS), change(newest, recentCount, min(5, newest.size - recentCount)))
}

fun listTrends(lists: List<WordList>): List<ListTrend> = lists.filter { it.records.isNotEmpty() }.map { list ->
  val records = newestFirst(list.records).reversed()
  ListTrend(
    list = list, count = records.size,
    lastPracticed = Instant.ofEpochMilli(timeOf(records.last().date).toLong()),
    // Seconds per word stays comparable after words are added to or removed from a list.
    speed = trend(records.mapNotNull { record -> record.wordCount?.let { TrendPoint(record.date, record.time / it) } }),
    accuracy = trend(records.mapNotNull { record -> record.accuracy?.let { TrendPoint(record.date, it) } }),
    best = listBest(list)!!,
  )
}.stableSorted { a, b -> a.lastPracticed > b.lastPracticed }

data class Scale(val domain: Pair<Double, Double>, val ticks: List<Double>, val decimals: Int)

private fun tidy(value: Double) = jsRound(value * 1e6) / 1e6

private fun niceStep(value: Double): Double {
  val power = 10.0.pow(floor(log10(value)))
  val fraction = value / power
  return tidy((if (fraction <= 1) 1.0 else if (fraction <= 2) 2.0 else if (fraction <= 2.5) 2.5 else if (fraction <= 5) 5.0 else 10.0) * power)
}

private fun decimals(step: Double): Int = step.toBigDecimal().stripTrailingZeros().scale().coerceAtLeast(0)

fun speedScale(values: List<Double>): Scale {
  val low0 = values.minOrNull() ?: 0.0
  val high = values.maxOrNull() ?: 0.0
  var step = niceStep(max(max(high - low0, high * 0.1), 0.01) / 2)
  var low = tidy(floor(low0 / step) * step)
  while (tidy(low + step * 2) < high) {
    step = niceStep(step * 1.001)
    low = tidy(floor(low0 / step) * step)
  }
  return Scale(low to tidy(low + step * 2), listOf(tidy(low + step * 2), tidy(low + step), low), decimals(step))
}

fun accuracyScale(values: List<Double>): Scale {
  val low = max(0.0, min(80.0, floor((values.minOrNull() ?: 0.0) / 10) * 10))
  return Scale(low to 100.0, listOf(100.0, (low + 100) / 2, low), 0)
}

/** A total practice time in whole units, such as 18 minutes 32 seconds. */
fun durationParts(seconds: Double): List<TimePart> {
  val total = jsRound(seconds).toInt()
  if (total < 60) return listOf(TimePart(total.toString(), TimeUnit.SECONDS))
  if (total < 3600) return listOf(TimePart((total / 60).toString(), TimeUnit.MINUTES), TimePart((total % 60).toString(), TimeUnit.SECONDS))
  return listOf(TimePart((total / 3600).toString(), TimeUnit.HOURS), TimePart((total % 3600 / 60).toString(), TimeUnit.MINUTES))
}

enum class DayKind { TODAY, YESTERDAY, THIS_YEAR, OTHER_YEAR }

/** How a day reads next to today: today and yesterday by name, other days by date, with the year only when it differs. */
fun dayKind(instant: Instant, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): DayKind {
  val days = daysBetween(instant, now, zone)
  if (days == 0) return DayKind.TODAY
  if (days == 1) return DayKind.YESTERDAY
  return if (instant.atZone(zone).year == now.atZone(zone).year) DayKind.THIS_YEAR else DayKind.OTHER_YEAR
}
