package io.github.sparklingstadt.typle.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.ResolverStyle

// The forms Typle stores (see server/internal/workspace/time.go): toISOString for its own records, and the slash
// form of the sample lists and lists from before ISO dates. Like Date.parse, a date without a time is UTC, and a
// time without a zone is local.
private val slashForms = listOf("uuuu/M/d H:mm:ss", "uuuu/M/d H:mm").map {
  DateTimeFormatter.ofPattern(it).withResolverStyle(ResolverStyle.STRICT)
}
private val slashDate = DateTimeFormatter.ofPattern("uuuu/M/d").withResolverStyle(ResolverStyle.STRICT)
private val isoOut = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

/** Reads a stored date, or null when Typle would reject it. Local times follow the tablet's time zone. */
fun parseDate(value: String, zone: ZoneId = ZoneId.systemDefault()): Instant? {
  attempt { return OffsetDateTime.parse(value, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant() }
  attempt { return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE).atStartOfDay(ZoneOffset.UTC).toInstant() }
  attempt { return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME).atZone(zone).toInstant() }
  for (format in slashForms) attempt { return LocalDateTime.parse(value, format).atZone(zone).toInstant() }
  attempt { return LocalDate.parse(value, slashDate).atStartOfDay(zone).toInstant() }
  return null
}

private inline fun attempt(block: () -> Unit) {
  try { block() } catch (_: DateTimeParseException) {}
}

/** `Date.prototype.toISOString`: UTC with milliseconds, such as `2026-10-10T02:00:00.000Z`. */
fun isoString(instant: Instant): String = isoOut.format(instant)

/** Milliseconds since 1970 for a stored date, or 0 when unreadable (records are validated when read). */
internal fun timeOf(value: String): Double = (parseDate(value)?.toEpochMilli() ?: 0L).toDouble()
