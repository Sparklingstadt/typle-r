package io.github.sparklingstadt.typle.core

import java.text.Collator
import java.time.Instant
import java.util.Locale

// src/core/rankings.ts

const val RANKING_TOP = 5
/** A best set within this many days is marked as improved in the list. */
const val IMPROVED_DAYS = 7.0
private const val DAY_MS = 24.0 * 60 * 60 * 1000
private const val TREND_POINTS = 20
private const val RECENT_RUNS = 5

data class WordCountGroup(val wordCount: Int?, val count: Int)

data class ListRanking(
  val list: WordList,
  /** The list's records on the chosen device, at any word count. */
  val records: List<StoredRecord>,
  val ranked: List<StoredRecord>,
  /** Records at another word count than the list has now; they are ranked only when asked for, or when nothing else exists. */
  val others: List<StoredRecord>,
  val otherCounts: List<WordCountGroup>,
  val fallback: Boolean,
  val best: StoredRecord?,
  val lastPracticed: Instant?,
  val improved: Boolean,
) {
  val id: String get() = list.id
}

/** Uses the same comparison as `listBest`, so a list's rank 1 here is the best shown on every other screen. */
fun listRanking(
  list: WordList,
  device: String? = null,
  order: RankOrder = RankOrder.ACCURACY,
  includeOthers: Boolean = false,
  now: Instant = Instant.now(),
): ListRanking {
  val records = list.records.filter { matchesDevice(it, device) }
  val others = records.filter { it.wordCount != list.words.size }
  val fallback = others.isNotEmpty() && others.size == records.size
  val ranked = rankRecords(if (includeOthers) records else comparableRecords(list, records), order)
  val counts = mutableListOf<WordCountGroup>()
  for (record in others) {
    val index = counts.indexOfFirst { it.wordCount == record.wordCount }
    if (index >= 0) counts[index] = counts[index].copy(count = counts[index].count + 1)
    else counts += WordCountGroup(record.wordCount, 1)
  }
  val last = records.maxOfOrNull { timeOf(it.date) } ?: 0.0
  val best = ranked.firstOrNull()
  val bestTime = best?.let { timeOf(it.date) } ?: 0.0
  return ListRanking(
    list = list, records = records, ranked = ranked, others = others,
    otherCounts = counts.stableSorted { a, b -> (a.wordCount ?: -1) > (b.wordCount ?: -1) },
    fallback = fallback, best = best,
    lastPracticed = if (last > 0) Instant.ofEpochMilli(last.toLong()) else null,
    improved = best != null && now.toEpochMilli() - bestTime < IMPROVED_DAYS * DAY_MS && ranked.any { timeOf(it.date) < bestTime },
  )
}

enum class ListSort { RECENT, NAME, COUNT }

fun sortRankings(rankings: List<ListRanking>, sort: ListSort, locale: Locale = Locale.getDefault()): List<ListRanking> {
  val collator = Collator.getInstance(locale)
  val recent = { a: ListRanking, b: ListRanking -> (a.lastPracticed?.toEpochMilli() ?: 0) > (b.lastPracticed?.toEpochMilli() ?: 0) }
  return rankings.stableSorted { a, b ->
    when (sort) {
      ListSort.NAME -> collator.compare(a.list.name, b.list.name) < 0
      ListSort.COUNT -> if (a.records.size != b.records.size) a.records.size > b.records.size else recent(a, b)
      ListSort.RECENT -> recent(a, b)
    }
  }
}

data class RankingStats(
  val recentCount: Int,
  val recentTime: Double?,
  val recentAccuracy: Double?,
  val points: List<TrendPoint>,
)

/** The figures above the table: the latest runs show where practice is now, next to the best. */
fun rankingStats(ranked: List<StoredRecord>): RankingStats {
  val byDate = ranked.stableSorted { a, b -> timeOf(a.date) < timeOf(b.date) }
  val recent = byDate.takeLast(RECENT_RUNS)
  val accuracies = recent.mapNotNull { it.accuracy }
  return RankingStats(
    recentCount = recent.size,
    recentTime = if (recent.isEmpty()) null else recent.sumOf { it.time } / recent.size,
    recentAccuracy = if (accuracies.isEmpty()) null else accuracies.sum() / accuracies.size,
    points = byDate.takeLast(TREND_POINTS).map { TrendPoint(it.date, it.time) },
  )
}
