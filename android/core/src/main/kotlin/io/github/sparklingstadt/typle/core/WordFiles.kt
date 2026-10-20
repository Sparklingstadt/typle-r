package io.github.sparklingstadt.typle.core

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

// src/plugins/formats/delimited.ts

/** Larger word files are refused before they are read. */
const val MAX_IMPORT_BYTES = 1024 * 1024

enum class WordFileFormat(internal val delimiter: Int) {
  CSV(','.code),
  TSV('\t'.code);

  companion object {
    /** The format for a file name's extension, or null for other files. */
    fun fromFileName(fileName: String): WordFileFormat? {
      val extension = fileName.substringAfterLast('.', "").lowercase()
      return entries.firstOrNull { it.name.lowercase() == extension }
    }
  }
}

/** Reads a UTF-8 word file, refusing other encodings and files over the size limit. */
fun parseWordData(data: ByteArray, format: WordFileFormat): List<Word> {
  if (data.size > MAX_IMPORT_BYTES) throw TypleException("importTooLarge")
  val text = try {
    Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(data)).toString()
  } catch (_: CharacterCodingException) {
    throw TypleException("importFileEncoding")
  }
  return parseWordFile(text, format)
}

private data class Row(val cells: List<String>, val line: Int)

/** Reads CSV and TSV, including escaped quotes and quoted multiline fields. */
fun parseWordFile(source: String, format: WordFileFormat): List<Word> {
  if (source.encodeToByteArray().size > MAX_IMPORT_BYTES) throw TypleException("importTooLarge")
  val delimiter = format.delimiter
  var text = source.codePointList
  if (text.firstOrNull() == 0xFEFF) text = text.drop(1)
  val rows = mutableListOf<Row>()
  var cells = mutableListOf<String>()
  val value = StringBuilder()
  var quoted = false
  var closed = false
  var line = 1
  var start = 1
  fun fail() = TypleException("importQuote", mapOf("line" to line.toString()))
  fun field() {
    cells += value.toString()
    value.setLength(0)
    closed = false
  }
  fun row() {
    val explicit = closed
    field()
    if (cells.size > 1 || cells.any { it.trimmed.isNotEmpty() } || explicit) rows += Row(cells, start)
    cells = mutableListOf()
  }
  val quote = '"'.code
  val cr = '\r'.code
  val lf = '\n'.code
  var i = 0
  while (i < text.size) {
    val c = text[i]
    val next = text.getOrNull(i + 1)
    if (quoted) {
      if (c == quote) {
        if (next == quote) { value.append('"'); i++ } else { quoted = false; closed = true }
      } else {
        value.appendCodePoint(c)
        if (c == lf || (c == cr && next != lf)) line++
      }
    } else if (c == delimiter) {
      field()
    } else if (c == cr || c == lf) {
      row()
      if (c == cr && next == lf) i++
      line++
      start = line
    } else if (closed) {
      throw fail()
    } else if (c == quote) {
      if (value.isNotEmpty()) throw fail()
      quoted = true
    } else {
      value.appendCodePoint(c)
    }
    i++
  }
  if (quoted) throw fail()
  row()
  val header = if (rows.isEmpty()) emptyList() else rows.removeAt(0).cells.map { if (it.trimmed == "anotation") "annotation" else it.trimmed }
  if ("input" !in header || "display" !in header) throw TypleException("importHeaderRequired")
  if (header.toSet().size != header.size) throw TypleException("importHeaderDuplicate")
  if (header.any { it !in listOf("input", "display", "annotation") }) throw TypleException("importHeaderUnknown")
  if (rows.isEmpty()) throw TypleException("importNoRows")
  if (rows.size > MAX_WORDS) throw TypleException("importTooManyRows")
  return rows.map { (cells, line) ->
    if (cells.size != header.size) throw TypleException("importColumnCount", mapOf("line" to line.toString()))
    fun get(name: String) = header.indexOf(name).let { if (it >= 0) cells[it] else "" }
    val word = Word(display = get("display"), input = get("input"), annotation = get("annotation"))
    if (word.input.trimmed.isEmpty() || word.display.trimmed.isEmpty()) throw TypleException("importFieldRequired", mapOf("line" to line.toString()))
    if (word.input.length > MAX_WORD_FIELD || word.display.length > MAX_WORD_FIELD || word.annotation.length > MAX_ANNOTATION) {
      throw TypleException("importFieldTooLong", mapOf("line" to line.toString()))
    }
    word
  }
}

/** Keeps exact typing strings, including whitespace, quotes and newlines. */
fun encodeWordCsv(words: List<Word>): String {
  fun cell(value: String) = "\"" + value.replace("\"", "\"\"") + "\""
  return "﻿input,display,annotation\r\n" +
    words.joinToString("\r\n") { listOf(it.input, it.display, it.annotation).joinToString(",", transform = ::cell) } + "\r\n"
}
