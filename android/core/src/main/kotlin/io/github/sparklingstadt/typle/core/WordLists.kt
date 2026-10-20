package io.github.sparklingstadt.typle.core

// src/core/wordLists.ts, src/core/listOverview.ts and the limits of src/core/workspaceRequest.ts

const val MAX_LISTS = 100
const val MAX_LIST_NAME = 200
const val MAX_WORDS = 1000
const val MAX_WORD_FIELD = 1000
const val MAX_ANNOTATION = 2000
const val MAX_RECORDS = 10000

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
        list.words.any { it.input.length > MAX_WORD_FIELD || it.display.length > MAX_WORD_FIELD || it.annotation.length > MAX_ANNOTATION }
    }) throw TypleException("invalidWorkspace")
}
