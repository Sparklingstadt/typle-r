package io.github.sparklingstadt.typle.records

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.DayKind
import io.github.sparklingstadt.typle.core.LOW_ACCURACY
import io.github.sparklingstadt.typle.core.NO_DEVICE
import io.github.sparklingstadt.typle.core.RecordRow
import io.github.sparklingstadt.typle.core.dayKind
import io.github.sparklingstadt.typle.core.deviceOptions
import io.github.sparklingstadt.typle.core.filterRows
import io.github.sparklingstadt.typle.core.groupByDay
import io.github.sparklingstadt.typle.core.recordRows
import io.github.sparklingstadt.typle.core.secondsPerWord
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.ConfirmDialog
import io.github.sparklingstadt.typle.design.FilterMenu
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.IconTile
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.StatusMessage
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.dashed
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.errorText
import java.time.Instant
import kotlinx.coroutines.launch

/** Every record, newest first and grouped by day, filtered by list and device (src/app/(workspace)/records/page.tsx). */
@Composable
fun RecordsView() {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  var listFilter by remember { mutableStateOf<String?>(null) }
  var deviceFilter by remember { mutableStateOf<String?>(null) }
  var deleting by remember { mutableStateOf<RecordRow?>(null) }
  var message by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  val all = recordRows(app.lists)
  val rows = filterRows(all, listFilter, deviceFilter)
  val options = deviceOptions(all.filter { listFilter == null || it.list.id == listFilter }.map { it.record })
  fun deviceName(value: String) = if (value == NO_DEVICE) L("format.noDeviceRecorded") else Format.device(options.firstOrNull { it.value == value }?.device)

  PageScroll {
    PageHeader(L("records.title"), L("records.intro"))
    message?.let { StatusMessage(it, failed) }
    if (all.isEmpty()) {
      Empty(L("records.empty.title"), L("records.empty.description"))
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        val listOptions = listOf<Pair<String?, String>>(null to L("records.filter.allLists")) +
          app.lists.filter { it.records.isNotEmpty() }.map { it.id to L("records.filterMenu.option", it.name, it.records.size) }
        FilterMenu(L("records.filter.list"), listOptions, listFilter, { listFilter = it },
          value = listFilter?.let { id -> app.lists.firstOrNull { it.id == id }?.name } ?: L("records.filterMenu.all"))
        val deviceChoices = listOf<Pair<String?, String>>(null to L("records.filter.allDevices")) +
          options.map { it.value to L("records.filterMenu.option", deviceName(it.value), it.count) }
        FilterMenu(L("records.filter.device"), deviceChoices, deviceFilter, { deviceFilter = it },
          value = deviceFilter?.let(::deviceName) ?: L("records.filterMenu.all"))
        if (listFilter != null || deviceFilter != null) {
          TypleButton({ listFilter = null; deviceFilter = null }, variant = ButtonVariant.GHOST) { ButtonText(L("records.filter.clear")) }
        }
        Spacer(Modifier.weight(1f))
        T(if (rows.size == all.size) L("records.filter.count", all.size) else L("records.filter.filteredCount", rows.size, all.size),
          color = Palette.mutedForeground, maxLines = 1)
      }
      if (rows.isEmpty()) {
        Empty(L("records.filteredEmpty.title"), L("records.filteredEmpty.description"))
      } else {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
          Columns()
          for (group in groupByDay(rows)) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Row(Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                T(dayHeading(group.day), Modifier.weight(1f), weight = FontWeight.Bold)
                T(L("records.day.summary", group.rows.size, Format.total(group.seconds)), size = 12.sp, color = Palette.mutedForeground)
              }
              Column(Modifier.fillMaxWidth().card()) {
                group.rows.forEachIndexed { index, row ->
                  if (index > 0) Hairline()
                  RecordRowView(row, app.store.canDeleteRecords) { deleting = row }
                }
              }
            }
          }
        }
        T(L("records.note"), size = 12.sp, color = Palette.mutedForeground)
      }
    }
  }

  deleting?.let { row ->
    ConfirmDialog(
      L("records.delete.title"),
      L("records.delete.description", row.list.name) + "\n" + Format.date(row.record.date) + " · " + Format.duration(row.record.time),
      L("common.delete.confirm"),
      onConfirm = {
        scope.launch {
          try {
            app.deleteRecord(row.record, row.list.id)
            failed = false
            message = L("records.delete.done", row.list.name, Format.date(row.record.date))
          } catch (e: Exception) {
            failed = true
            message = errorText(e)
          }
        }
      },
      onDismiss = { deleting = null },
    )
  }
}

/** 「今日・10月20日（火）」 for today and yesterday, the date alone for other days. */
private fun dayHeading(day: Instant): String = when (dayKind(day)) {
  DayKind.TODAY, DayKind.YESTERDAY -> L("records.day.heading", Format.day(day), Format.dateWithWeekday(day))
  DayKind.THIS_YEAR, DayKind.OTHER_YEAR -> Format.dateWithWeekday(day)
}

@Composable
private fun Columns() {
  Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
    val size = 12.sp
    val color = Palette.mutedForeground
    T(L("records.columns.time"), Modifier.width(52.dp), size = size, color = color, maxLines = 1)
    T(L("records.columns.listDevice"), Modifier.weight(1f), size = size, color = color, maxLines = 1)
    End(L("records.columns.duration"), 90.dp)
    End(L("records.columns.accuracy"), 70.dp)
    End(L("records.columns.perWord"), 84.dp)
    End(L("records.columns.mistakes"), 44.dp)
    Spacer(Modifier.width(32.dp))
  }
}

@Composable
private fun End(text: String, width: Dp) {
  T(text, Modifier.width(width), size = 12.sp, color = Palette.mutedForeground, maxLines = 1, style = TextStyle(textAlign = TextAlign.End))
}

@Composable
private fun Empty(title: String, description: String) {
  val app = LocalApp.current
  Column(
    Modifier.fillMaxWidth().dashed(Palette.border, Radius.xl).padding(40.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    IconTile(Icons.Outlined.History)
    T(title, size = 16.sp, weight = FontWeight.SemiBold)
    T(description, color = Palette.mutedForeground, style = TextStyle(textAlign = TextAlign.Center))
    TypleButton({ app.navigate(Route.Practice) }) { ButtonText(L("records.empty.practice"), Icons.Outlined.Keyboard) }
  }
}

/** One record as a row of the table (src/components/Records/RecordRow.tsx). */
@Composable
private fun RecordRowView(row: RecordRow, canDelete: Boolean, onDelete: () -> Unit) {
  val record = row.record
  Row(
    Modifier.fillMaxWidth().defaultMinSize(minHeight = 68.dp).padding(horizontal = 20.dp),
    horizontalArrangement = Arrangement.spacedBy(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    T(Format.time(record.date), Modifier.width(52.dp), color = Palette.mutedForeground, monospacedDigits = true)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        T(row.list.name, Modifier.weight(1f, fill = false), size = 16.sp, maxLines = 1)
        if (row.best) {
          Row(
            Modifier.height(22.dp).background(Palette.amberSoft, CircleShape).padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Glyph(Icons.Outlined.EmojiEvents, size = 12.dp, tint = Palette.amber)
            T(L("records.row.best"), size = 12.sp, weight = FontWeight.Bold, color = Palette.amber, maxLines = 1)
          }
        }
      }
      T(listOfNotNull(record.wordCount?.let { L("records.row.words", it) }, Format.device(record.device)).joinToString(L("wordLists.row.separator")),
        size = 13.sp, color = Palette.mutedForeground, maxLines = 1)
    }
    Row(Modifier.width(90.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.Bottom) {
      for (part in Format.durationParts(record.time)) {
        T(part.value, size = 15.sp, weight = FontWeight.Bold, monospacedDigits = true)
        T(part.unit, Modifier.padding(start = 1.dp, end = 1.dp, bottom = 2.dp), size = 11.sp, color = Palette.mutedForeground)
      }
    }
    val accuracy = record.accuracy
    T(if (accuracy != null) "${Format.number(accuracy)}%" else "—", Modifier.width(70.dp), monospacedDigits = true,
      color = if (accuracy != null && accuracy < LOW_ACCURACY) Palette.destructive else Palette.foreground, style = TextStyle(textAlign = TextAlign.End))
    Row(Modifier.width(84.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.Bottom) {
      val perWord = secondsPerWord(record)
      if (perWord != null) {
        T(Format.seconds(perWord), monospacedDigits = true)
        T(L("records.row.perWordUnit"), Modifier.padding(start = 1.dp, bottom = 1.dp), size = 11.sp, color = Palette.mutedForeground)
      } else {
        T("—")
      }
    }
    T(record.mistakes?.toString() ?: "—", Modifier.width(44.dp), monospacedDigits = true, style = TextStyle(textAlign = TextAlign.End))
    Box(Modifier.width(32.dp)) {
      if (canDelete) {
        TypleButton(onDelete, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("records.row.deleteLabel", row.list.name, Format.date(record.date))) {
          Glyph(Icons.Outlined.Delete, tint = Palette.mutedForeground)
        }
      }
    }
  }
}
