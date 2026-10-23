package io.github.sparklingstadt.typle.core

import java.text.Collator
import java.time.Instant
import java.util.Locale

// src/core/wordLists.ts, src/core/listOverview.ts and the limits of src/core/workspaceRequest.ts

const val MAX_LISTS = 150
const val MAX_LIST_NAME = 200
const val MAX_WORDS = 1000
const val MAX_WORD_FIELD = 1000
const val MAX_ANNOTATION = 2000
const val MAX_RECORDS = 10000
const val MAX_CATEGORY = 50
const val MAX_TAG = 50
const val MAX_TAGS = 20

/**
 * normalizeLabels: the category and tags trimmed, without empty ones or a tag repeated in another case, and null when
 * there are none.
 */
fun normalizeLabels(category: String?, tags: List<String>?): Pair<String?, List<String>?> {
  val name = (category ?: "").trimmed
  val seen = mutableSetOf<String>()
  val kept = (tags ?: emptyList()).map { it.trimmed }.filter { it.isNotEmpty() && seen.add(it.lowercase()) }
  return Pair(name.ifEmpty { null }, kept.ifEmpty { null })
}

fun validateList(list: WordList, others: List<WordList> = emptyList()) {
  val name = list.name.trimmed
  if (name.isEmpty()) throw TypleException("listNameRequired")
  if (others.any { it.name.trimmed.lowercase() == name.lowercase() }) throw TypleException("listNameDuplicate")
  if (list.words.isEmpty()) throw TypleException("wordsRequired")
  if (list.words.any { it.display.trimmed.isEmpty() || it.input.trimmed.isEmpty() }) throw TypleException("wordFieldsRequired")
}

/** The checks `decodeLists` makes on saved lists, plus the size limits of a save. */
fun validateLists(lists: List<WordList>) {
  val ids = mutableSetOf<String>()
  for (list in lists) {
    val corrupted = list.id.isEmpty() || list.id in ids || list.records.any { record ->
      !record.time.isFinite() || record.time < 0 || parseDate(record.date) == null ||
        (record.device?.let { !isDevice(it) } ?: false) ||
        (record.accuracy?.let { !it.isFinite() || it < 0 || it > 100 } ?: false) ||
        (record.mistakes?.let { it < 0 } ?: false) ||
        (record.wordCount?.let { it < 1 } ?: false)
    }
    if (corrupted) throw TypleException("savedDataCorrupted")
    validateList(list)
    ids += list.id
  }
  if (lists.any { list ->
      list.words.size > MAX_WORDS || list.records.size > MAX_RECORDS || list.name.length > MAX_LIST_NAME ||
        (list.category?.length ?: 0) > MAX_CATEGORY || (list.tags?.size ?: 0) > MAX_TAGS || (list.tags ?: emptyList()).any { it.length > MAX_TAG } ||
        list.words.any { it.input.length > MAX_WORD_FIELD || it.display.length > MAX_WORD_FIELD || it.annotation.length > MAX_ANNOTATION }
    }) throw TypleException("invalidWorkspace")
}

/**
 * Saves a new or edited list. Whitespace can be meaningful in typing strings and annotations, so only the name is
 * trimmed. The editor's copy of a list knows nothing of its records, so those stay as saved.
 */
fun saveList(lists: List<WordList>, list: WordList, editing: Boolean): List<WordList> {
  if (editing && lists.none { it.id == list.id }) throw TypleException("listDeleted")
  validateList(list, lists.filter { it.id != list.id })
  val (category, tags) = normalizeLabels(list.category, list.tags)
  val normalized = list.copy(name = list.name.trimmed, category = category, tags = tags)
  if (lists.any { it.id == list.id }) {
    return lists.map { item -> if (item.id != list.id) item else normalized.copy(records = item.records) }
  }
  if (lists.size >= MAX_LISTS) throw TypleException("listLimit", mapOf("max" to MAX_LISTS.toString()))
  return lists + normalized
}

data class ListOverview(
  val list: WordList,
  /** Position in the saved order, which is the order the lists were added in. */
  val position: Int,
  val practiceCount: Int,
  /** Milliseconds since 1970. */
  val lastPracticed: Double?,
) {
  val id: String get() = list.id
}

enum class ListOrder { ADDED, PRACTICED, NAME, WORDS }

fun listOverviews(lists: List<WordList>): List<ListOverview> = lists.mapIndexed { position, list ->
  val dates = list.records.mapNotNull { parseDate(it.date)?.toEpochMilli()?.toDouble() }
  ListOverview(list, position, list.records.size, dates.maxOrNull())
}

/** Newest first for `added`. Lists without a record come after the practised ones for `practiced`. */
fun sortOverviews(items: List<ListOverview>, order: ListOrder, locale: Locale = Locale.getDefault()): List<ListOverview> {
  val collator = Collator.getInstance(locale)
  return items.sortedWith { a, b ->
    when (order) {
      ListOrder.NAME -> naturalCompare(a.list.name, b.list.name, collator).takeIf { it != 0 } ?: b.position.compareTo(a.position)
      ListOrder.WORDS -> if (a.list.words.size != b.list.words.size) b.list.words.size.compareTo(a.list.words.size) else b.position.compareTo(a.position)
      ListOrder.PRACTICED -> {
        val x = a.lastPracticed ?: Double.NEGATIVE_INFINITY
        val y = b.lastPracticed ?: Double.NEGATIVE_INFINITY
        if (x != y) y.compareTo(x) else b.position.compareTo(a.position)
      }
      ListOrder.ADDED -> b.position.compareTo(a.position)
    }
  }
}

private val digitRun = Regex("\\d+|\\D+")

/** Compares names as Swift's `.numeric` option does, so "List 9" comes before "List 10". */
private fun naturalCompare(a: String, b: String, collator: Collator): Int {
  val x = digitRun.findAll(a).map { it.value }.toList()
  val y = digitRun.findAll(b).map { it.value }.toList()
  for (i in 0 until minOf(x.size, y.size)) {
    val result = if (x[i][0].isDigit() && y[i][0].isDigit()) x[i].toBigInteger().compareTo(y[i].toBigInteger())
    else collator.compare(x[i], y[i])
    if (result != 0) return result
  }
  return x.size.compareTo(y.size)
}

/** Matches the list name, its category and tags, and the words, so a list can be found by one of its words. */
fun matchesQuery(list: WordList, query: String): Boolean {
  val needle = query.trimmed.lowercase()
  if (needle.isEmpty()) return true
  return list.name.lowercase().contains(needle) || (list.category?.lowercase()?.contains(needle) ?: false) ||
    (list.tags ?: emptyList()).any { it.lowercase().contains(needle) } ||
    list.words.any { it.display.lowercase().contains(needle) || it.input.lowercase().contains(needle) }
}

/** The records a list's best is taken from: runs at its current word count. */
fun currentRecordCount(list: WordList): Int = list.records.count { it.wordCount == list.words.size }

/** `suffix(n)` is the localized mark for the nth copy, such as （コピー） and （コピー2）. */
fun copyName(lists: List<WordList>, name: String, suffix: (Int) -> String): String {
  val taken = lists.map { it.name.trimmed.lowercase() }.toSet()
  var n = 1
  while (true) {
    val mark = suffix(n)
    val base = name.trimmed.take(maxOf(0, MAX_LIST_NAME - mark.length)).let {
      // Do not split a surrogate pair at the cut, as String(decoding:) would replace it.
      if (it.isNotEmpty() && it.last().isHighSurrogate()) it.dropLast(1) else it
    }
    val candidate = base + mark
    if (candidate.lowercase() !in taken) return candidate
    n++
  }
}

data class DuplicateResult(val lists: List<WordList>, val copy: WordList)

/** A copy keeps the words, category and tags but starts without records, so its best is its own. */
fun duplicateList(lists: List<WordList>, id: String, copyId: String, suffix: (Int) -> String, now: Instant = Instant.now()): DuplicateResult {
  val source = lists.firstOrNull { it.id == id } ?: throw TypleException("listDeleted")
  if (lists.size >= MAX_LISTS) throw TypleException("listLimit", mapOf("max" to MAX_LISTS.toString()))
  val copy = WordList(id = copyId, name = copyName(lists, source.name, suffix), words = source.words, createdAt = isoString(now),
    category = source.category, tags = source.tags)
  return DuplicateResult(lists + copy, copy)
}
