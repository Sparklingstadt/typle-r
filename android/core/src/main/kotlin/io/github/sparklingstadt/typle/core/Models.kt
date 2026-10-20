package io.github.sparklingstadt.typle.core

import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * An error that names a message under `errors` instead of carrying text, so the app shows it in the reader's
 * language (as AppError does in src/core/appError.ts). `values` fill `{name}` placeholders in the message.
 */
class TypleException(val key: String, val values: Map<String, String> = emptyMap()) : RuntimeException(key) {
  override fun equals(other: Any?): Boolean = other is TypleException && other.key == key && other.values == values
  override fun hashCode(): Int = key.hashCode() * 31 + values.hashCode()
}

@Serializable
data class Word(val display: String, val input: String, val annotation: String = "")

@Serializable
data class PracticeDevice(val id: String, val name: String, val layout: String = "")

/** A practice record as stored. Records from older versions may lack every field but `time` and `date`. */
@Serializable
data class StoredRecord(
  val id: String? = null,
  val time: Double,
  val date: String,
  val mistakes: Int? = null,
  val accuracy: Double? = null,
  val device: PracticeDevice? = null,
  val wordCount: Int? = null,
)

@Serializable
data class WordList(
  val id: String,
  val name: String,
  val words: List<Word>,
  val records: List<StoredRecord> = emptyList(),
  val createdAt: String,
)

data class WorkspaceDocument(val lists: List<WordList>, val devices: List<PracticeDevice>)

/** The JSON form Typle stores and sends: unknown fields are skipped and absent optional fields stay absent. */
val TypleJson = Json {
  ignoreUnknownKeys = true
  explicitNulls = false
  encodeDefaults = true
}

/** A new random id in the form of `crypto.randomUUID`, as the web app gives records and lists. */
fun randomId(): String = UUID.randomUUID().toString()

/** JavaScript's `trim`. */
internal val String.trimmed: String get() = trim()

/** JavaScript's `Array.from`, which splits a string into code points. */
internal val String.codePointList: List<Int> get() = codePoints().toArray().toList()

internal fun codePointString(codePoint: Int): String = String(Character.toChars(codePoint))

/** JavaScript's `Math.round`, which rounds halves up. */
internal fun jsRound(value: Double): Double = kotlin.math.floor(value + 0.5)

/** Array.prototype.sort with a "less than" test; Kotlin's sort is stable, as JavaScript's is. */
internal fun <T> List<T>.stableSorted(less: (T, T) -> Boolean): List<T> =
  sortedWith { a, b -> if (less(a, b)) -1 else if (less(b, a)) 1 else 0 }
