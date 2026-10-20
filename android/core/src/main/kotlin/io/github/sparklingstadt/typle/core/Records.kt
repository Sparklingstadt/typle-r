package io.github.sparklingstadt.typle.core

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

// src/core/records.ts

fun makeRecord(session: TypingSession, wordCount: Int, id: String, device: PracticeDevice?): StoredRecord {
  val finishedAt = session.finishedAt
  if (finishedAt == null || session.startedAt == null) throw TypleException("practiceIncomplete")
  val result = sessionResult(session)
  return StoredRecord(id = id, time = result.time, date = isoString(Instant.ofEpochMilli(finishedAt.toLong())),
    mistakes = result.mistakes, accuracy = result.accuracy, device = device, wordCount = wordCount)
}

/** Adds a record once: sending the same record id again leaves the list as it is. */
fun addRecord(lists: List<WordList>, listId: String, record: StoredRecord): List<WordList> {
  if (lists.none { it.id == listId }) throw TypleException("recordListDeleted")
  return lists.map { list ->
    if (list.id != listId || list.records.any { it.id != null && it.id == record.id }) list
    else list.copy(records = list.records + record)
  }
}

enum class RankOrder {
  /** The higher accuracy wins and time breaks ties (records without accuracy come last). */
  ACCURACY,
  /** The reverse. */
  SPEED,
}

fun rankRecords(records: List<StoredRecord>, order: RankOrder = RankOrder.ACCURACY): List<StoredRecord> =
  rankIndices(records, order).map { records[it] }

internal fun rankIndices(records: List<StoredRecord>, order: RankOrder = RankOrder.ACCURACY): List<Int> =
  records.indices.toList().stableSorted { a, b ->
    val x = records[a]
    val y = records[b]
    val accuracyX = x.accuracy ?: -1.0
    val accuracyY = y.accuracy ?: -1.0
    when (order) {
      RankOrder.ACCURACY -> if (accuracyX != accuracyY) accuracyX > accuracyY else x.time < y.time
      RankOrder.SPEED -> if (x.time != y.time) x.time < y.time else accuracyX > accuracyY
    }
  }

fun bestRecords(records: List<StoredRecord>, limit: Int = 5, order: RankOrder = RankOrder.ACCURACY): List<StoredRecord> =
  rankRecords(records, order).take(limit)

/**
 * Editing a list changes the task, so only runs at its current word count are compared. Records without a word
 * count predate that field and cannot be matched. With no matching run, every record is compared instead.
 */
fun comparableRecords(list: WordList, records: List<StoredRecord> = list.records): List<StoredRecord> {
  val same = records.filter { it.wordCount == list.words.size }
  return same.ifEmpty { records }
}

/** The record every screen shows as a list's best. */
fun listBest(list: WordList): StoredRecord? = bestRecords(comparableRecords(list), limit = 1).firstOrNull()

/** The position of the list's best in `list.records`. */
internal fun listBestIndex(list: WordList): Int? {
  val same = list.records.indices.filter { list.records[it].wordCount == list.words.size }
  val candidates = same.ifEmpty { list.records.indices.toList() }
  return rankIndices(candidates.map { list.records[it] }).firstOrNull()?.let { candidates[it] }
}

/** Removes a record by id, or by date and time for records from before ids. */
fun removeRecord(lists: List<WordList>, listId: String, record: StoredRecord): List<WordList> = lists.map { list ->
  if (list.id != listId) list
  else list.copy(records = list.records.filterNot { item ->
    if (record.id != null) item.id == record.id else item.date == record.date && item.time == record.time
  })
}

data class RecordRow(
  val list: WordList,
  val record: StoredRecord,
  val index: Int,
  val id: String,
  /** Whether this record currently ranks first in its list. */
  val best: Boolean,
)

/** Every record with its list, newest first. */
fun recordRows(lists: List<WordList>): List<RecordRow> = lists.flatMap { list ->
  val best = listBestIndex(list)
  list.records.mapIndexed { index, record ->
    RecordRow(list, record, index, "${list.id}-${record.id ?: "$index-${record.date}"}", index == best)
  }
}.stableSorted { a, b -> timeOf(a.record.date) > timeOf(b.record.date) }

/** The filter value for records without a device. */
const val NO_DEVICE = "none"

fun matchesDevice(record: StoredRecord, device: String?): Boolean = when (device) {
  null -> true
  NO_DEVICE -> record.device == null
  else -> record.device?.id == device
}

fun filterRows(rows: List<RecordRow>, list: String?, device: String?): List<RecordRow> =
  rows.filter { (list == null || it.list.id == list) && matchesDevice(it.record, device) }

data class DeviceOption(val value: String, val device: PracticeDevice?, val count: Int)

/**
 * Devices come from the records themselves, so deleted or renamed devices can still be picked (by id, with the
 * newest name). Records without a device are grouped last.
 */
fun deviceOptions(records: List<StoredRecord>): List<DeviceOption> {
  val options = mutableListOf<DeviceOption>()
  for (record in records.stableSorted { a, b -> timeOf(a.date) > timeOf(b.date) }) {
    val value = record.device?.id ?: NO_DEVICE
    val index = options.indexOfFirst { it.value == value }
    if (index >= 0) options[index] = options[index].copy(count = options[index].count + 1)
    else options += DeviceOption(value, record.device, 1)
  }
  return options.stableSorted { a, b ->
    val noneA = a.value == NO_DEVICE
    val noneB = b.value == NO_DEVICE
    if (noneA != noneB) noneB else a.count > b.count
  }
}

data class RecordDay(val day: Instant, val rows: List<RecordRow>, val seconds: Double)

/** Days follow the viewer's local calendar. */
fun groupByDay(rows: List<RecordRow>, zone: ZoneId = ZoneId.systemDefault()): List<RecordDay> {
  val groups = mutableListOf<RecordDay>()
  for (row in rows) {
    val day = startOfDay(parseDate(row.record.date) ?: Instant.EPOCH, zone)
    val last = groups.lastOrNull()
    if (last != null && last.day == day) groups[groups.size - 1] = last.copy(rows = last.rows + row, seconds = last.seconds + row.record.time)
    else groups += RecordDay(day, listOf(row), row.record.time)
  }
  return groups
}

internal fun startOfDay(instant: Instant, zone: ZoneId): Instant = instant.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()

enum class TimeUnit { HOURS, MINUTES, SECONDS }

data class TimePart(val value: String, val unit: TimeUnit)

/** Seconds keep two decimals so close runs stay distinguishable; a minute or more is split into minutes and seconds. */
fun recordTimeParts(seconds: Double): List<TimePart> {
  // Round first so 59.999 becomes 1 min 00.00 s rather than 60.00 s.
  val hundredths = jsRound(seconds * 100).toInt()
  if (hundredths < 6000) return listOf(TimePart(String.format(Locale.ROOT, "%.2f", hundredths / 100.0), TimeUnit.SECONDS))
  return listOf(TimePart((hundredths / 6000).toString(), TimeUnit.MINUTES),
    TimePart(String.format(Locale.ROOT, "%05.2f", (hundredths % 6000) / 100.0), TimeUnit.SECONDS))
}

fun secondsPerWord(record: StoredRecord): Double? {
  val wordCount = record.wordCount ?: return null
  return if (wordCount > 0) record.time / wordCount else null
}

fun formatAccuracy(accuracy: Double?): String {
  if (accuracy == null) return "—"
  val rounded = jsRound(accuracy * 10) / 10
  return if (rounded == kotlin.math.floor(rounded)) "${rounded.toLong()}%" else "$rounded%"
}
