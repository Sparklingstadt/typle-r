package io.github.sparklingstadt.typle.core

import kotlin.math.max

/** One run through a list (src/core/typing.ts). Times are milliseconds since 1970. */
data class TypingSession(
  val index: Int = 0,
  val input: String = "",
  val startedAt: Double? = null,
  val finishedAt: Double? = null,
  val attempts: Int = 0,
  val mistakes: Int = 0,
)

/**
 * Applies the input field's new value. Only characters added since the last value count as attempts, and an added
 * character is a mistake when it differs from the character at its position.
 */
fun typeInput(session: TypingSession, words: List<Word>, value: String, now: Double): TypingSession {
  if (session.finishedAt != null || session.index >= words.size) return session
  val target = words[session.index].input.codePointList
  val previous = session.input.codePointList
  val next = value.codePointList
  var common = 0
  while (common < previous.size && common < next.size && previous[common] == next[common]) common++
  val inserted = next.drop(common)
  val updated = session.copy(
    input = value,
    startedAt = session.startedAt ?: if (value.isEmpty()) null else now,
    attempts = session.attempts + inserted.size,
    mistakes = session.mistakes + inserted.withIndex().count { (offset, char) ->
      val index = common + offset
      index >= target.size || char != target[index]
    },
  )
  // Compared by code point, as JavaScript does, so composed and decomposed forms stay different.
  if (next != target) return updated
  if (session.index == words.size - 1) return updated.copy(finishedAt = now)
  return updated.copy(index = session.index + 1, input = "")
}

data class SessionResult(val time: Double, val mistakes: Int, val accuracy: Double)

fun sessionResult(session: TypingSession): SessionResult {
  val accuracy = if (session.attempts > 0)
    jsRound((session.attempts - session.mistakes).toDouble() / session.attempts * 10000) / 100 else 100.0
  return SessionResult(time = max(0.0, ((session.finishedAt ?: 0.0) - (session.startedAt ?: 0.0)) / 1000),
    mistakes = session.mistakes, accuracy = accuracy)
}

enum class CharacterState { DONE, CURRENT, ERROR, CURRENT_ERROR, PENDING }

data class InputComparison(
  val characters: List<String>,
  val states: List<CharacterState>,
  val extra: List<String>,
  /** The first wrong position, or null when everything typed so far is right. */
  val errorIndex: Int?,
)

/**
 * Compares only committed input with the characters to type. Everything from the first mismatch on is an error,
 * so a later character that happens to match is not shown as correct.
 */
fun compareInput(target: String, typed: String): InputComparison {
  val characters = target.codePointList
  val actual = typed.codePointList
  var errorIndex: Int? = actual.indices.firstOrNull { it < characters.size && actual[it] != characters[it] }
  if (errorIndex == null && actual.size > characters.size) errorIndex = characters.size
  val states = characters.indices.map { index ->
    when {
      index < actual.size -> if (errorIndex == null || index < errorIndex) CharacterState.DONE else CharacterState.ERROR
      index == actual.size -> if (errorIndex == null) CharacterState.CURRENT else CharacterState.CURRENT_ERROR
      else -> CharacterState.PENDING
    }
  }
  return InputComparison(characters.map(::codePointString), states, actual.drop(characters.size).map(::codePointString), errorIndex)
}

/** Correctly typed characters per minute; null until a second has passed. */
fun typingSpeed(session: TypingSession, now: Double): Int? {
  val startedAt = session.startedAt ?: return null
  val elapsed = (session.finishedAt ?: now) - startedAt
  return if (elapsed < 1000) null else jsRound((session.attempts - session.mistakes) / (elapsed / 60000)).toInt()
}
