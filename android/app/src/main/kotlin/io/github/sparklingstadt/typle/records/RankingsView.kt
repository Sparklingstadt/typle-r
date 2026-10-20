package io.github.sparklingstadt.typle.records

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.IMPROVED_DAYS
import io.github.sparklingstadt.typle.core.ListRanking
import io.github.sparklingstadt.typle.core.ListSort
import io.github.sparklingstadt.typle.core.NO_DEVICE
import io.github.sparklingstadt.typle.core.RANKING_TOP
import io.github.sparklingstadt.typle.core.RankOrder
import io.github.sparklingstadt.typle.core.deviceOptions
import io.github.sparklingstadt.typle.core.formatAccuracy
import io.github.sparklingstadt.typle.core.listRanking
import io.github.sparklingstadt.typle.core.parseDate
import io.github.sparklingstadt.typle.core.rankingStats
import io.github.sparklingstadt.typle.core.sortRankings
import io.github.sparklingstadt.typle.core.speedScale
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Edge
import io.github.sparklingstadt.typle.design.FilterMenu
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.RankBadge
import io.github.sparklingstadt.typle.design.SearchField
import io.github.sparklingstadt.typle.design.SegmentedPills
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.ValueWithUnit
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.hairline
import io.github.sparklingstadt.typle.home.TrendChart
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.Localization
import java.time.Duration
import java.time.Instant
import java.util.Locale

/**
 * Each list's personal best (src/app/(workspace)/rankings/page.tsx): the lists, and for a chosen list its figures,
 * time trend and top records. Rank 1 is the best every other screen shows.
 */
@Composable
fun RankingsView() {
  val app = LocalApp.current
  var order by remember { mutableStateOf(RankOrder.ACCURACY) }
  var sort by remember { mutableStateOf(ListSort.RECENT) }
  var device by remember { mutableStateOf<String?>(null) }
  var query by remember { mutableStateOf("") }
  var showAll by remember { mutableStateOf(false) }
  val devices = deviceOptions(app.lists.flatMap { it.records })
  fun deviceName(value: String) = if (value == NO_DEVICE) L("format.noDeviceRecorded") else Format.device(devices.firstOrNull { it.value == value }?.device)

  PageScroll(maxWidth = 1088.dp) {
    PageHeader(L("rankings.title"), L("rankings.intro"))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
      FilterMenu(
        L("rankings.filter.device"),
        listOf<Pair<String?, String>>(null to L("rankings.filter.allDevices")) + devices.map { it.value to deviceName(it.value) },
        device, { device = it }, value = device?.let(::deviceName) ?: L("records.filterMenu.all"),
      )
      SegmentedPills(listOf(RankOrder.ACCURACY to L("rankings.order.accuracy"), RankOrder.SPEED to L("rankings.order.speed")), order) { order = it }
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Glyph(Icons.Outlined.Info, size = 12.dp, tint = Palette.mutedForeground)
        T(L(if (order == RankOrder.ACCURACY) "rankings.orderNotes.accuracy" else "rankings.orderNotes.speed"), size = 12.sp, color = Palette.mutedForeground)
      }
    }
    val chosen = app.rankingsList?.let { id -> app.lists.firstOrNull { it.id == id } }
    if (chosen != null) {
      Detail(listRanking(chosen, device, order, includeOthers = showAll), order, showAll) { showAll = !showAll }
    } else {
      Lists(device, order, sort, { sort = it }, query, { query = it })
    }
  }
}

@Composable
private fun Lists(device: String?, order: RankOrder, sort: ListSort, onSort: (ListSort) -> Unit, query: String, onQuery: (String) -> Unit) {
  val app = LocalApp.current
  val needle = query.trim().lowercase()
  val rankings = sortRankings(app.lists.map { listRanking(it, device, order) }, sort, Localization.locale)
    .filter { query.isEmpty() || it.list.name.lowercase().contains(needle) }
  val practised = rankings.filter { it.records.isNotEmpty() }
  val unpractised = rankings.filter { it.records.isEmpty() }
  Column(Modifier.fillMaxWidth().card()) {
    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
      SearchField(query, onQuery, L("rankings.list.search"), Modifier.weight(1f))
      SortMenu(sort, onSort)
    }
    Hairline()
    practised.forEachIndexed { index, ranking ->
      if (index > 0) Hairline()
      ListRow(ranking)
    }
    if (unpractised.isNotEmpty()) {
      Hairline()
      Column(Modifier.padding(bottom = 8.dp)) {
        T(if (device == null) L("rankings.list.noRecords", unpractised.size) else L("rankings.list.noDeviceRecords", unpractised.size),
          Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp), size = 12.sp, color = Palette.mutedForeground)
        for (ranking in unpractised) {
          Row(
            Modifier.fillMaxWidth().height(38.dp).clickable(role = Role.Button) { app.rankingsList = ranking.list.id }.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            T(ranking.list.name, Modifier.weight(1f), color = Palette.mutedForeground, maxLines = 1)
            T(L("rankings.list.words", ranking.list.words.size), size = 12.sp, color = Palette.mutedForeground)
            Glyph(Icons.Outlined.ChevronRight, size = 14.dp, tint = Palette.mutedForeground)
          }
        }
      }
    }
    if (rankings.isEmpty()) T(L("rankings.list.noMatch", query), Modifier.padding(16.dp), color = Palette.mutedForeground)
  }
}

@Composable
private fun SortMenu(sort: ListSort, onSort: (ListSort) -> Unit) {
  var open by remember { mutableStateOf(false) }
  Box {
    Row(
      Modifier.clickable(role = Role.Button) { open = true }.padding(4.dp),
      horizontalArrangement = Arrangement.spacedBy(4.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      T(L("rankings.list.sorts.${sort.name.lowercase()}"), size = 13.sp, color = Palette.mutedForeground)
      Glyph(Icons.Outlined.ExpandMore, size = 12.dp, tint = Palette.mutedForeground)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
      for (option in ListSort.entries) {
        DropdownMenuItem(
          text = { T(L("rankings.list.sorts.${option.name.lowercase()}"), weight = if (option == sort) FontWeight.Medium else FontWeight.Normal) },
          onClick = { open = false; onSort(option) },
        )
      }
    }
  }
}

@Composable
private fun ListRow(ranking: ListRanking) {
  val app = LocalApp.current
  Row(
    Modifier.fillMaxWidth().clickable(role = Role.Button) { app.rankingsList = ranking.list.id }.padding(horizontal = 16.dp, vertical = 12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
      T(ranking.list.name, size = 15.sp, weight = FontWeight.Medium, color = Palette.foreground)
      val best = ranking.best
      if (best != null) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
          Glyph(Icons.Outlined.EmojiEvents, size = 12.dp, tint = Palette.amber)
          Row(verticalAlignment = Alignment.Bottom) {
            T(Format.seconds(best.time), size = 13.sp, weight = FontWeight.SemiBold, monospacedDigits = true)
            T(L("format.secondsUnit"), Modifier.padding(start = 1.dp, bottom = 1.dp), size = 10.sp, color = Palette.mutedForeground)
          }
          T(formatAccuracy(best.accuracy), size = 13.sp, color = Palette.mutedForeground)
          if (ranking.improved) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
              Glyph(Icons.AutoMirrored.Outlined.TrendingUp, size = 11.dp, tint = Palette.success)
              T(L("rankings.list.improved"), size = 12.sp, weight = FontWeight.Medium, color = Palette.success)
            }
          }
        }
      }
    }
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
      T(ranking.lastPracticed?.let { Format.day(it) } ?: "", size = 12.sp, color = Palette.mutedForeground)
      T(L("rankings.list.runs", ranking.records.size), size = 12.sp, color = Palette.mutedForeground)
    }
    Glyph(Icons.Outlined.ChevronRight, size = 14.dp, tint = Palette.mutedForeground)
  }
}

@Composable
private fun Detail(ranking: ListRanking, order: RankOrder, showAll: Boolean, onToggleAll: () -> Unit) {
  val app = LocalApp.current
  val stats = rankingStats(ranking.ranked)
  val shown = if (showAll) ranking.ranked else ranking.ranked.take(RANKING_TOP)
  Column(Modifier.fillMaxWidth().card().padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
    Row(
      Modifier.clickable(role = Role.Button) { app.rankingsList = null },
      horizontalArrangement = Arrangement.spacedBy(6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Glyph(Icons.AutoMirrored.Outlined.ArrowBack, size = 14.dp)
      T(L("rankings.detail.back"), size = 13.sp, weight = FontWeight.Medium)
    }
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T(ranking.list.name, size = 22.sp, weight = FontWeight.Bold)
        T(listOfNotNull(
          L("rankings.detail.words", ranking.list.words.size), L("rankings.detail.records", ranking.records.size),
          ranking.lastPracticed?.let { L("rankings.detail.lastPracticed", Format.day(it)) },
        ).joinToString("  ·  "), size = 13.sp, color = Palette.mutedForeground)
      }
      TypleButton({ app.navigate(Route.Records) }, variant = ButtonVariant.GHOST) {
        ButtonText(L("rankings.detail.viewRecords"))
        Glyph(Icons.AutoMirrored.Outlined.ArrowForward, size = 12.dp)
      }
      TypleButton({ app.practice(ranking.list.id) }) { ButtonText(L("rankings.detail.practice"), Icons.Outlined.Keyboard) }
    }
    if (ranking.records.isEmpty()) {
      Column(
        Modifier.fillMaxWidth().background(Palette.muted.copy(alpha = 0.5f), RoundedCornerShape(Radius.lg)).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
      ) {
        T(L("rankings.detail.notPractised.title"), size = 16.sp, weight = FontWeight.SemiBold)
        T(L("rankings.detail.notPractised.description"), color = Palette.mutedForeground)
      }
      return@Column
    }
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      val best = ranking.best
      if (best != null) {
        Figure(L("rankings.detail.stats.best"), Format.seconds(best.time), L("format.secondsUnit"),
          L("rankings.detail.stats.bestNote", formatAccuracy(best.accuracy), parseDate(best.date)?.let { Format.day(it) } ?: ""), highlight = true)
      }
      val recentTime = stats.recentTime
      val behind = if (recentTime != null && best != null) recentTime - best.time else null
      Figure(L("rankings.detail.stats.recentAverage", stats.recentCount), recentTime?.let { Format.seconds(it) } ?: "—", L("format.secondsUnit"),
        when {
          behind == null -> ""
          behind < 0.005 -> L("rankings.detail.stats.sameAsBest")
          else -> L("rankings.detail.stats.behindBest", Format.seconds(behind))
        })
      Figure(L("rankings.detail.stats.accuracy"), stats.recentAccuracy?.let { String.format(Locale.ROOT, "%.1f", it) } ?: "—", "%",
        L("rankings.detail.stats.recent", stats.recentCount))
      Figure(L("rankings.detail.stats.runs"), "${ranking.ranked.size}", L("rankings.detail.stats.runsUnit"),
        L("rankings.detail.stats.atCount", ranking.list.words.size))
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
        T(L("rankings.detail.trend.title"), weight = FontWeight.Bold)
        T(L("rankings.detail.trend.recent", stats.points.size), color = Palette.mutedForeground)
      }
      Box(Modifier.fillMaxWidth().background(Palette.muted.copy(alpha = 0.5f), RoundedCornerShape(Radius.lg)).padding(14.dp)) {
        if (stats.points.size > 1) TrendChart(stats.points, speedScale(stats.points.map { it.value }))
        else T(L("rankings.detail.trend.needTwo"), color = Palette.mutedForeground)
      }
    }
    if (ranking.fallback) T(L("rankings.fallback", ranking.list.words.size), size = 13.sp, color = Palette.mutedForeground)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
        T(L("rankings.detail.top.title"), weight = FontWeight.Bold)
        T(L(if (order == RankOrder.ACCURACY) "rankings.detail.top.accuracy" else "rankings.detail.top.speed"), Modifier.weight(1f), color = Palette.mutedForeground)
        T(L("rankings.detail.top.shown", shown.size, ranking.ranked.size), size = 12.sp, color = Palette.mutedForeground)
      }
      Row(
        Modifier.fillMaxWidth().hairline(Edge.BOTTOM).padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        val small = 12.sp
        val muted = Palette.mutedForeground
        T(L("rankings.detail.columns.rank"), Modifier.width(36.dp), size = small, color = muted, maxLines = 1)
        T(L("records.columns.duration"), Modifier.width(130.dp), size = small, color = muted, maxLines = 1)
        T(L("records.columns.accuracy"), Modifier.width(70.dp), size = small, color = muted, maxLines = 1)
        T(L("records.columns.mistakes"), Modifier.width(46.dp), size = small, color = muted, maxLines = 1)
        T(L("rankings.detail.columns.device"), Modifier.weight(1f), size = small, color = muted, maxLines = 1)
        T(L("rankings.detail.columns.date"), Modifier.width(110.dp), size = small, color = muted, maxLines = 1, style = TextStyle(textAlign = TextAlign.End))
      }
      val now = Instant.now()
      shown.forEachIndexed { index, record ->
        val recent = parseDate(record.date)?.let { Duration.between(it, now).seconds < IMPROVED_DAYS * 86400 } ?: false
        Row(
          Modifier.fillMaxWidth().height(44.dp).background(if (index == 0) Palette.amberSoft.copy(alpha = 0.4f) else Color.Transparent)
            .padding(horizontal = 8.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Box(Modifier.width(36.dp)) { RankBadge(index + 1) }
          Row(Modifier.width(130.dp), verticalAlignment = Alignment.Bottom) {
            T(Format.seconds(record.time), weight = FontWeight.SemiBold, monospacedDigits = true)
            T(L("format.secondsUnit"), Modifier.padding(start = 1.dp, bottom = 1.dp), size = 10.sp, color = Palette.mutedForeground)
          }
          T(formatAccuracy(record.accuracy), Modifier.width(70.dp), monospacedDigits = true)
          T(record.mistakes?.toString() ?: "—", Modifier.width(46.dp), color = Palette.mutedForeground)
          T(Format.device(record.device), Modifier.weight(1f), maxLines = 1)
          T(Format.date(record.date), Modifier.width(110.dp), size = 13.sp, weight = if (recent) FontWeight.Medium else FontWeight.Normal,
            color = if (recent) Palette.success else Palette.mutedForeground, maxLines = 1, style = TextStyle(textAlign = TextAlign.End))
        }
      }
      if (ranking.ranked.size > RANKING_TOP) {
        TypleButton(onToggleAll, variant = ButtonVariant.GHOST, size = ButtonSize.SM) {
          ButtonText(if (showAll) L("rankings.detail.top.showTop", RANKING_TOP) else L("rankings.detail.top.showAll", ranking.ranked.size))
        }
      }
    }
  }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Figure(term: String, value: String, unit: String, note: String, highlight: Boolean = false) {
  val shape = RoundedCornerShape(Radius.xl)
  Column(
    Modifier.weight(1f).fillMaxHeight().background(if (highlight) Palette.amberSoft.copy(alpha = 0.35f) else Palette.card, shape)
      .border(1.dp, if (highlight) Palette.amberBorder else Palette.border, shape).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
      if (highlight) Glyph(Icons.Outlined.EmojiEvents, size = 12.dp, tint = Palette.amber)
      T(term, size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
    }
    ValueWithUnit(value, unit, 24.sp)
    T(note, size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
  }
}
