package io.github.sparklingstadt.typle.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.StorageKind
import io.github.sparklingstadt.typle.core.Change
import io.github.sparklingstadt.typle.core.LOW_ACCURACY
import io.github.sparklingstadt.typle.core.ListTrend
import io.github.sparklingstadt.typle.core.NextList
import io.github.sparklingstadt.typle.core.NextListReason
import io.github.sparklingstadt.typle.core.STALE_DAYS
import io.github.sparklingstadt.typle.core.Scale
import io.github.sparklingstadt.typle.core.Trend
import io.github.sparklingstadt.typle.core.TrendPoint
import io.github.sparklingstadt.typle.core.accuracyScale
import io.github.sparklingstadt.typle.core.listTrends
import io.github.sparklingstadt.typle.core.nextLists
import io.github.sparklingstadt.typle.core.parseDate
import io.github.sparklingstadt.typle.core.speedScale
import io.github.sparklingstadt.typle.core.summarize
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Edge
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Pill
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.hairline
import io.github.sparklingstadt.typle.design.outlined
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.Localization
import io.github.sparklingstadt.typle.support.NumberWithUnit
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The home dashboard (src/components/Dashboard/Dashboard.tsx): this week's summary, lists to practise next and each
 * list's trend. With no records yet it shows how to start instead.
 */
@Composable
fun HomeView() {
  val app = LocalApp.current
  val now = remember { Instant.now() }
  Column(Modifier.fillMaxSize().background(Palette.page).verticalScroll(rememberScrollState())) {
    Column(
      Modifier.align(Alignment.CenterHorizontally).widthIn(max = 1280.dp).fillMaxWidth().padding(horizontal = 48.dp, vertical = 32.dp)
        .card().padding(horizontal = 64.dp, vertical = 56.dp),
      verticalArrangement = Arrangement.spacedBy(44.dp),
    ) {
      if (app.lists.any { it.records.isNotEmpty() }) Dashboard(now) else Welcome()
    }
  }
}

@Composable
private fun Welcome() {
  Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
    T(L("home.welcomeTitle"), size = 30.sp)
    T(L("home.welcomeDescription"), color = Palette.mutedForeground)
    StartButtons()
  }
}

@Composable
private fun StartButtons() {
  val app = LocalApp.current
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
    TypleButton({ app.navigate(Route.Practice) }, size = ButtonSize.LG) { ButtonText(L("dashboard.practice"), Icons.Outlined.Keyboard) }
    TypleButton({ app.navigate(Route.CreateList) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) {
      ButtonText(L("dashboard.create"), Icons.Outlined.Add)
    }
  }
}

@Composable
private fun Dashboard(now: Instant) {
  val app = LocalApp.current
  val summary = summarize(app.lists, now)
  Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      T(L("dashboard.title"), size = 30.sp)
      T(if (app.storage == StorageKind.API) L("dashboard.sourceAccount") else L("dashboard.sourceLocal"), color = Palette.mutedForeground)
    }
    StartButtons()
  }
  val weekEnd = summary.weekStart.atZone(ZoneId.systemDefault()).plusDays(6).toInstant()
  Section(L("dashboard.week.title"), L("dashboard.week.description", Format.dateWithWeekday(summary.weekStart), Format.dateWithWeekday(weekEnd))) {
    val accuracy = summary.accuracy
    val accuracyChange = accuracy?.change
    TwoColumns(
      listOf<@Composable () -> Unit>(
        { Stat(L("dashboard.week.count"), listOf(NumberWithUnit("${summary.weekCount}", L("dashboard.week.countUnit"))),
            weekDelta(summary.weekCount, summary.previousWeekCount) { L("dashboard.week.times", it) }) },
        { Stat(L("dashboard.week.streak"), listOf(NumberWithUnit("${summary.streak}", L("dashboard.week.streakUnit"))),
            if (summary.practicedToday) Delta(Icons.Outlined.Check, true, L("dashboard.week.practisedToday"))
            else Delta(Icons.Outlined.Keyboard, false, L("dashboard.week.streakNext", summary.streak + 1))) },
        { Stat(L("dashboard.week.accuracy", accuracy?.recentCount ?: 10),
            if (accuracy != null) listOf(NumberWithUnit(String.format(Locale.ROOT, "%.1f", accuracy.recent), "%")) else listOf(NumberWithUnit("—", "")),
            if (accuracyChange != null) changeDelta(accuracyChange, lowerIsBetter = false, describe = ::pointDifference, namedRecent = false)
            else Delta(Icons.Outlined.Remove, false, L(if (accuracy == null) "dashboard.week.noAccuracy" else "dashboard.week.noComparison"))) },
        { Stat(L("dashboard.week.time"), Format.totalParts(summary.weekSeconds),
            weekDelta(summary.weekSeconds.roundToInt(), summary.previousWeekSeconds.roundToInt()) { Format.total(it.toDouble()) }) },
      ),
    )
  }
  Section(L("dashboard.next.title"), L("dashboard.next.description", STALE_DAYS, LOW_ACCURACY.toInt())) {
    val items = nextLists(app.lists, now)
    if (items.isEmpty()) {
      T(L("dashboard.next.allPractised"), Modifier.fillMaxWidth().outlined().padding(16.dp))
    } else {
      Column(Modifier.fillMaxWidth().outlined()) {
        items.forEachIndexed { index, item ->
          if (index > 0) Hairline()
          NextRow(item, now)
        }
      }
    }
  }
  Section(L("dashboard.trends.title"), L("dashboard.trends.description")) {
    TwoColumns(listTrends(app.lists).map { trend -> @Composable { TrendCard(trend, now) } })
  }
}

/** Two equal columns, filled row by row, like the web's two-column grid. */
@Composable
private fun TwoColumns(items: List<@Composable () -> Unit>) {
  Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
    for (pair in items.chunked(2)) {
      Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        for (item in pair) Box(Modifier.weight(1f)) { item() }
        if (pair.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

@Composable
private fun Section(title: String, description: String, content: @Composable ColumnScope.() -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
      T(title, Modifier.semantics { heading() }, size = 20.sp)
      T(description, color = Palette.mutedForeground)
    }
    content()
  }
}

@Composable
private fun Stat(label: String, parts: List<NumberWithUnit>, delta: Delta) {
  Column(Modifier.fillMaxWidth().outlined().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    T(label, size = 13.sp, color = Palette.mutedForeground)
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
      for (part in parts) {
        T(part.value, size = 26.sp, weight = FontWeight.SemiBold, monospacedDigits = true)
        T(part.unit, Modifier.padding(end = 4.dp, bottom = 3.dp), color = Palette.mutedForeground)
      }
    }
    DeltaText(delta)
  }
}

@Composable
private fun NextRow(item: NextList, now: Instant) {
  val app = LocalApp.current
  val (icon, badge) = when (val reason = item.reason) {
    NextListReason.New -> Icons.Outlined.AutoAwesome to L("dashboard.next.new")
    is NextListReason.Stale -> Icons.Outlined.Schedule to L("dashboard.next.stale", reason.days)
    is NextListReason.Accuracy -> Icons.Outlined.TrackChanges to L("dashboard.next.lowAccuracy", reason.count, String.format(Locale.ROOT, "%.1f", reason.accuracy))
  }
  Row(
    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
    horizontalArrangement = Arrangement.spacedBy(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      T(item.list.name, size = 16.sp, weight = FontWeight.Medium)
      val last = item.lastPracticed
      T(L("dashboard.next.words", item.list.words.size) + " · " +
        (if (last != null) L("dashboard.next.lastPracticed", Format.day(last, now)) else L("dashboard.next.noRecords")),
        size = 13.sp, color = Palette.mutedForeground)
    }
    Pill(height = 24.dp) {
      Glyph(icon, size = 11.dp)
      androidx.compose.material3.Text(badge, maxLines = 1)
    }
    TypleButton({ app.practice(item.list.id) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) { ButtonText(L("dashboard.next.practice")) }
  }
}

private fun weekDelta(current: Int, previous: Int, format: (Int) -> String): Delta {
  if (current == previous) return Delta(Icons.Outlined.Remove, false, L("dashboard.week.sameAsLastWeek"))
  val more = current > previous
  return Delta(if (more) Icons.AutoMirrored.Outlined.TrendingUp else Icons.AutoMirrored.Outlined.TrendingDown, more,
    L(if (more) "dashboard.week.moreThanLastWeek" else "dashboard.week.lessThanLastWeek", format(abs(current - previous))))
}

class Delta(val icon: ImageVector, val good: Boolean, val text: String)

@Composable
fun DeltaText(delta: Delta) {
  Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    val color = if (delta.good) Palette.success else Palette.mutedForeground
    Glyph(delta.icon, Modifier.padding(top = 2.dp), size = 12.dp, tint = color)
    T(delta.text, size = 12.sp, color = color)
  }
}

fun secondsDifference(difference: Double): String? {
  val value = String.format(Locale.ROOT, "%.2f", abs(difference))
  return if (value == "0.00") null else L(if (difference > 0) "dashboard.change.slower" else "dashboard.change.faster", value)
}

fun pointDifference(difference: Double): String? {
  val value = String.format(Locale.ROOT, "%.1f", abs(difference))
  return if (value == "0.0") null else L(if (difference > 0) "dashboard.change.pointsUp" else "dashboard.change.pointsDown", value)
}

/** 「直近5回の平均は、その前の5回より 0.12 秒速い」, or without the recent window when the label already names it. */
fun changeDelta(change: Change, lowerIsBetter: Boolean, describe: (Double) -> String?, namedRecent: Boolean = true): Delta {
  val recent = if (!namedRecent) "" else if (change.recentCount == 1) L("dashboard.change.latest") else L("dashboard.change.recentAverage", change.recentCount)
  val previous = if (change.previousCount == 1) L("dashboard.change.previousLatest") else L("dashboard.change.previousAverage", change.previousCount)
  val difference = change.recent - change.previous
  val text = describe(difference) ?: return Delta(Icons.Outlined.Remove, false, capitalizedFirst(L("dashboard.change.same", recent, previous)))
  return Delta(if (difference > 0) Icons.AutoMirrored.Outlined.TrendingUp else Icons.AutoMirrored.Outlined.TrendingDown,
    (difference > 0) != lowerIsBetter, capitalizedFirst(L("dashboard.change.different", recent, previous, text)))
}

/** English sentences that start with a part left out still start with a capital. */
private fun capitalizedFirst(text: String): String = text.replaceFirstChar { it.uppercase() }

/** One list's speed and accuracy over its latest runs. */
@Composable
private fun TrendCard(trend: ListTrend, now: Instant) {
  val app = LocalApp.current
  Column(Modifier.fillMaxWidth().outlined().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
    Row(verticalAlignment = Alignment.Bottom) {
      T(trend.list.name, Modifier.weight(1f), size = 16.sp, weight = FontWeight.Medium)
      T(L("dashboard.trends.summary", trend.count, Format.day(trend.lastPracticed, now)), size = 13.sp, color = Palette.mutedForeground)
    }
    if (trend.count < 2) {
      T(L("dashboard.trends.needTwo"), color = Palette.mutedForeground)
      TypleButton({ app.practice(trend.list.id) }, variant = ButtonVariant.OUTLINE) { ButtonText(L("dashboard.trends.practice"), Icons.Outlined.Keyboard) }
    } else {
      Metric(L("dashboard.trends.speed"), trend.speed,
        if (trend.speed.points.size > 1) speedScale(trend.speed.points.map { it.value }) else null,
        { L("dashboard.trends.seconds", String.format(Locale.ROOT, "%.2f", it)) }, lowerIsBetter = true, describe = ::secondsDifference)
      Metric(L("dashboard.trends.accuracy"), trend.accuracy,
        if (trend.accuracy.points.size > 1) accuracyScale(trend.accuracy.points.map { it.value }) else null,
        { String.format(Locale.ROOT, "%.1f%%", it) }, lowerIsBetter = false, describe = ::pointDifference)
      val best = trend.best
      T(L("dashboard.trends.best", best.accuracy?.let { "${Format.number(it, 2)}%" } ?: L("dashboard.trends.notRecorded"),
        Format.seconds(best.time), Format.day(parseDate(best.date) ?: now, now)),
        Modifier.fillMaxWidth().hairline(Edge.TOP).padding(top = 12.dp), size = 13.sp, color = Palette.mutedForeground)
    }
  }
}

@Composable
private fun Metric(title: String, trend: Trend, scale: Scale?, format: (Double) -> String, lowerIsBetter: Boolean, describe: (Double) -> String?) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Row(verticalAlignment = Alignment.Bottom) {
      T(title, Modifier.weight(1f), size = 13.sp, color = Palette.mutedForeground)
      val latest = trend.points.lastOrNull()
      if (latest != null) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          T(L("dashboard.trends.latest"), Modifier.padding(bottom = 2.dp), size = 12.sp, color = Palette.mutedForeground)
          T(format(latest.value), size = 16.sp, weight = FontWeight.SemiBold)
        }
      }
    }
    trend.change?.let { DeltaText(changeDelta(it, lowerIsBetter, describe)) }
    if (scale != null) TrendChart(trend.points, scale) else T(L("dashboard.trends.noChart"), color = Palette.mutedForeground)
  }
}

private fun shortDate(value: String?): String {
  val instant = value?.let { parseDate(it) } ?: return ""
  return DateTimeFormatter.ofPattern("M/d", Localization.locale).withZone(ZoneId.systemDefault()).format(instant)
}

/**
 * The web app's line chart (src/components/Dashboard/TrendChart.tsx): three gridlines with their values, the line with
 * a soft fill and a dot on the latest point.
 */
@Composable
fun TrendChart(points: List<TrendPoint>, scale: Scale, height: Int = 72) {
  val measurer = rememberTextMeasurer()
  val colors = Palette
  val label = TextStyle(fontSize = 11.sp, color = colors.mutedForeground, fontFeatureSettings = "tnum")
  Column(
    Modifier.fillMaxWidth().semantics {
      contentDescription = points.joinToString(", ") { "${shortDate(it.date)} ${Format.number(it.value, 2)}" }
    },
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Canvas(Modifier.fillMaxWidth().padding(vertical = 8.dp).height(height.dp)) {
      val axis = 40.dp.toPx()
      val left = axis + 4.dp.toPx()
      val right = size.width - 4.dp.toPx()
      val (low, high) = scale.domain
      fun y(value: Double) = ((1 - (value - low) / maxOf(high - low, 0.000001)) * size.height).toFloat()
      fun x(index: Int) = if (points.size > 1) left + index.toFloat() / (points.size - 1) * (right - left) else (left + right) / 2
      for (tick in scale.ticks) {
        val ty = y(tick)
        drawLine(colors.border, Offset(left, ty), Offset(right, ty), strokeWidth = 1.dp.toPx())
        val text = measurer.measure(String.format(Locale.ROOT, "%.${scale.decimals}f", tick), label)
        drawText(text, topLeft = Offset((axis - text.size.width) / 2, ty - text.size.height / 2))
      }
      if (points.isEmpty()) return@Canvas
      val line = Path()
      points.forEachIndexed { index, point ->
        if (index == 0) line.moveTo(x(index), y(point.value)) else line.lineTo(x(index), y(point.value))
      }
      val area = Path().apply {
        addPath(line)
        lineTo(x(points.size - 1), size.height)
        lineTo(x(0), size.height)
        close()
      }
      drawPath(area, colors.trend.copy(alpha = 0.1f))
      drawPath(line, colors.trend, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
      val last = Offset(x(points.size - 1), y(points.last().value))
      drawCircle(colors.card, radius = 5.dp.toPx(), center = last)
      drawCircle(colors.trend, radius = 3.dp.toPx(), center = last)
    }
    Row(Modifier.fillMaxWidth().padding(start = 40.dp)) {
      T(shortDate(points.firstOrNull()?.date), Modifier.weight(1f), size = 11.sp, color = Palette.mutedForeground, monospacedDigits = true)
      T(shortDate(points.lastOrNull()?.date), size = 11.sp, color = Palette.mutedForeground, monospacedDigits = true)
    }
  }
}
