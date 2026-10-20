package io.github.sparklingstadt.typle.support

import android.content.res.AssetManager
import io.github.sparklingstadt.typle.core.DEFAULT_DEVICE_ID
import io.github.sparklingstadt.typle.core.DayKind
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.TimeUnit
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.dayKind
import io.github.sparklingstadt.typle.core.formatAccuracy
import io.github.sparklingstadt.typle.core.parseDate
import io.github.sparklingstadt.typle.core.recordTimeParts
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The languages the app has text for. 一般 switches between them in place, as the web app's settings do. */
enum class AppLanguage(val tag: String) {
  JA("ja"), EN("en");

  val locale: Locale get() = Locale.forLanguageTag(tag)

  companion object {
    /** Japanese for a Japanese tablet, English otherwise, until one is chosen. */
    fun preferred(): AppLanguage = if (Locale.getDefault().language == "ja") JA else EN

    fun from(tag: String?): AppLanguage? = entries.firstOrNull { it.tag == tag }
  }
}

/** The text of the chosen language, from assets/messages/<tag>.json (made from the iPad app's Localizable.strings). */
object Localization {
  private val loaded = mutableMapOf<AppLanguage, JsonObject>()
  private var messages = JsonObject(emptyMap())

  var language = AppLanguage.JA
    private set
  val locale: Locale get() = language.locale

  fun use(language: AppLanguage, assets: AssetManager) {
    messages = loaded.getOrPut(language) {
      Json.parseToJsonElement(assets.open("messages/${language.tag}.json").use { it.readBytes().decodeToString() }).jsonObject
    }
    this.language = language
  }

  internal fun raw(key: String): JsonElement? = messages[key]
}

/**
 * The text for a key in the chosen language. Screens never hold literal text, as in the web app's messages. A
 * plural (`{ "one", "other", "arg" }`) is chosen by its numeric argument, as the iPad app's stringsdict is.
 */
fun L(key: String, vararg args: Any): String {
  val format = when (val value = Localization.raw(key)) {
    is JsonPrimitive -> value.content
    is JsonObject -> {
      val arg = value["arg"]?.jsonPrimitive?.intOrNull ?: 1
      val count = (args.getOrNull(arg - 1) as? Number)?.toLong()
      (if (count == 1L) value["one"] else value["other"])?.jsonPrimitive?.content ?: key
    }
    else -> key
  }
  return if (args.isEmpty()) format else String.format(Localization.locale, format, *args)
}

/** Fills `{name}` placeholders, the form error messages share with the web app. */
fun fill(text: String, values: Map<String, String>): String =
  values.entries.fold(text) { result, (name, value) -> result.replace("{$name}", value) }

/** The message for an error, in the reader's language. */
fun errorText(error: Throwable): String {
  if (error is TypleException) {
    val text = Localization.raw("errors.${error.key}") as? JsonPrimitive ?: return L("errors.workspaceRequestFailed")
    return fill(text.content, error.values)
  }
  return L("errors.workspaceRequestFailed")
}

data class NumberWithUnit(val value: String, val unit: String)

object Format {
  /** The unit's name after a number: 「秒」 / 「s」. */
  private fun unit(unit: TimeUnit): String = when (unit) {
    TimeUnit.HOURS -> L("format.hoursUnit")
    TimeUnit.MINUTES -> L("format.minutesUnit")
    TimeUnit.SECONDS -> L("format.secondsUnit")
  }

  /** Number and unit pairs joined as text, with the space English puts between them. */
  private fun joined(parts: List<NumberWithUnit>): String =
    parts.joinToString(L("format.timeSeparator")) { it.value + L("format.unitSpace") + it.unit }

  /** A record's time: 「1.08秒」「1分15.50秒」. */
  fun duration(seconds: Double): String = joined(durationParts(seconds))

  /** A record's time as number and unit pairs, for a large number with a small unit. */
  fun durationParts(seconds: Double): List<NumberWithUnit> = recordTimeParts(seconds).map { NumberWithUnit(it.value, unit(it.unit)) }

  /** A total practice time in whole units: 「18分32秒」. */
  fun totalParts(seconds: Double): List<NumberWithUnit> =
    io.github.sparklingstadt.typle.core.durationParts(seconds).map { NumberWithUnit(it.value, unit(it.unit)) }

  fun total(seconds: Double): String = joined(totalParts(seconds))

  fun seconds(value: Double): String = String.format(Locale.ROOT, "%.2f", value)

  private fun pattern(ja: String, en: String) =
    DateTimeFormatter.ofPattern(if (Localization.language == AppLanguage.JA) ja else en, Localization.locale).withZone(ZoneId.systemDefault())

  fun monthDay(instant: Instant): String = pattern("M月d日", "MMM d").format(instant)

  /** 「今日」「昨日」「10月18日」, with the year only for another year, like the web app's useFormat().day. */
  fun day(instant: Instant, now: Instant = Instant.now()): String = when (dayKind(instant, now)) {
    DayKind.TODAY -> L("format.today")
    DayKind.YESTERDAY -> L("format.yesterday")
    DayKind.THIS_YEAR -> monthDay(instant)
    DayKind.OTHER_YEAR -> pattern("y年M月d日", "MMM d, y").format(instant)
  }

  /** 「10月20日（火）」. */
  fun dateWithWeekday(instant: Instant): String = L("format.dateWithWeekday", monthDay(instant), pattern("E", "EEE").format(instant))

  fun date(value: String): String {
    val instant = parseDate(value) ?: return value
    return day(instant) + " " + time(value)
  }

  fun time(value: String): String {
    val instant = parseDate(value) ?: return value
    return pattern("HH:mm", "HH:mm").format(instant)
  }

  fun device(device: PracticeDevice?): String {
    if (device == null) return L("format.noDevice")
    val name = if (device.id == DEFAULT_DEVICE_ID) L("format.defaultDevice") else device.name
    return if (device.layout.isEmpty()) name else L("format.deviceWithLayout", name, device.layout)
  }

  fun number(value: Double, digits: Int = 1): String =
    NumberFormat.getNumberInstance(Localization.locale).apply {
      minimumFractionDigits = 0
      maximumFractionDigits = digits
    }.format(value)

  fun accuracy(value: Double?): String = formatAccuracy(value)
}
