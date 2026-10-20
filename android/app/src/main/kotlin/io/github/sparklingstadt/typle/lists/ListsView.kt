package io.github.sparklingstadt.typle.lists

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.ListOrder
import io.github.sparklingstadt.typle.core.ListOverview
import io.github.sparklingstadt.typle.core.MAX_LISTS
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.encodeWordCsv
import io.github.sparklingstadt.typle.core.listOverviews
import io.github.sparklingstadt.typle.core.matchesQuery
import io.github.sparklingstadt.typle.core.sortOverviews
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.ConfirmDialog
import io.github.sparklingstadt.typle.design.CountBadge
import io.github.sparklingstadt.typle.design.FilterMenu
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.IconTile
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.SearchField
import io.github.sparklingstadt.typle.design.StatusMessage
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.dashed
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.Localization
import io.github.sparklingstadt.typle.support.errorText
import java.io.File
import java.time.Instant
import kotlinx.coroutines.launch

/** The word lists page (src/app/(workspace)/edit/page.tsx): search, sort, practise, edit, copy, export and delete. */
@Composable
fun ListsView() {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  var query by remember { mutableStateOf("") }
  var order by remember { mutableStateOf(ListOrder.ADDED) }
  var deleting by remember { mutableStateOf<WordList?>(null) }
  var message by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  val all = listOverviews(app.lists)
  val items = sortOverviews(all.filter { matchesQuery(it.list, query) }, order, Localization.locale)

  fun duplicate(list: WordList) {
    scope.launch {
      try {
        val copy = app.duplicateList(list.id)
        failed = false
        message = L("wordLists.page.created", copy.name)
      } catch (e: Exception) {
        failed = true
        message = errorText(e)
      }
    }
  }

  PageScroll {
    PageHeader(L("wordLists.page.title"), L("wordLists.page.description"))
    message?.let { StatusMessage(it, failed) }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        T(L("wordLists.manager.heading"), size = 16.sp, weight = FontWeight.Bold)
        CountBadge("${app.lists.size} / $MAX_LISTS")
        Spacer(Modifier.weight(1f))
        TypleButton({ app.navigate(Route.CreateList) }, size = ButtonSize.LG, enabled = app.lists.size < MAX_LISTS) {
          ButtonText(L("wordLists.manager.create"), Icons.Outlined.Add)
        }
      }
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        SearchField(query, { query = it }, L("wordLists.manager.search"), Modifier.widthIn(max = 384.dp).weight(1f, fill = false))
        FilterMenu(L("wordLists.order.label"), ListOrder.entries.map { it to L("wordLists.order.${it.name.lowercase()}") }, order, { order = it })
        Spacer(Modifier.weight(1f))
        T(if (query.isEmpty()) L("wordLists.manager.count", all.size) else L("wordLists.manager.countFiltered", items.size, all.size),
          color = Palette.mutedForeground, maxLines = 1)
      }
      if (items.isEmpty()) {
        Column(
          Modifier.fillMaxWidth().dashed(Palette.border, Radius.xl).padding(40.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          IconTile(Icons.AutoMirrored.Outlined.List)
          T(if (query.isEmpty()) L("wordLists.empty.title") else L("wordLists.manager.noMatch", query), size = 16.sp, weight = FontWeight.SemiBold)
          if (query.isEmpty()) T(L("wordLists.empty.description"), color = Palette.mutedForeground)
        }
      } else {
        Column(Modifier.fillMaxWidth().card()) {
          items.forEachIndexed { index, item ->
            if (index > 0) Hairline()
            ListRow(item, onDuplicate = ::duplicate, onDelete = { deleting = it })
          }
        }
      }
      T(L("wordLists.manager.csvNote"), size = 12.sp, color = Palette.mutedForeground)
    }
  }

  deleting?.let { list ->
    ConfirmDialog(
      L("wordLists.delete.title", list.name),
      if (list.records.isEmpty()) L("wordLists.delete.listOnly") else L("wordLists.delete.withRecords"),
      L("common.delete.confirm"),
      onConfirm = {
        scope.launch {
          try {
            app.deleteList(list.id)
            failed = false
            message = L("wordLists.page.deleted", list.name)
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

@Composable
private fun ListRow(item: ListOverview, onDuplicate: (WordList) -> Unit, onDelete: (WordList) -> Unit) {
  val app = LocalApp.current
  val context = LocalContext.current
  var menuOpen by remember { mutableStateOf(false) }
  val list = item.list
  val preview = list.words.take(6).joinToString(L("wordLists.row.separator")) { it.display.trim() }
  val rest = maxOf(0, list.words.size - 6)
  Row(
    Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
    horizontalArrangement = Arrangement.spacedBy(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f).clickable(role = Role.Button) { app.navigate(Route.EditList(list.id)) }, verticalArrangement = Arrangement.spacedBy(3.dp)) {
      T(list.name, size = 16.sp, weight = FontWeight.Medium, color = Palette.foreground, maxLines = 2)
      T(if (rest > 0) L("wordLists.row.more", preview, rest) else preview, color = Palette.mutedForeground, maxLines = 1)
    }
    Column(Modifier.width(180.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
      T(L("wordLists.row.wordCount", list.words.size), weight = FontWeight.Medium)
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Glyph(Icons.Outlined.History, size = 11.dp, tint = Palette.mutedForeground)
        val last = item.lastPracticed
        T(if (last != null) L("wordLists.row.practiced", item.practiceCount, Format.day(Instant.ofEpochMilli(last.toLong()))) else L("wordLists.row.notPracticed"),
          size = 12.sp, color = Palette.mutedForeground, maxLines = 1)
      }
    }
    TypleButton({ app.practice(list.id) }, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("wordLists.row.practiceList", list.name)) {
      Glyph(Icons.Outlined.Keyboard, tint = Palette.mutedForeground)
    }
    TypleButton({ app.navigate(Route.EditList(list.id)) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG, label = L("wordLists.row.editList", list.name)) {
      ButtonText(L("wordLists.row.edit"), Icons.Outlined.Edit)
    }
    Box {
      TypleButton({ menuOpen = true }, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("wordLists.row.moreFor", list.name)) {
        Glyph(Icons.Outlined.MoreHoriz)
      }
      DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
        MenuItem(L("wordLists.row.practiceThis"), Icons.Outlined.Keyboard) { menuOpen = false; app.practice(list.id) }
        MenuItem(L("wordLists.row.rankings"), Icons.Outlined.EmojiEvents) { menuOpen = false; app.showRankings(list.id) }
        MenuItem(L("wordLists.row.records"), Icons.Outlined.History) { menuOpen = false; app.navigate(Route.Records) }
        HorizontalDivider(color = Palette.border)
        MenuItem(L("wordLists.row.export"), Icons.Outlined.IosShare) { menuOpen = false; shareCsv(context, list) }
        MenuItem(L("wordLists.row.copy"), Icons.Outlined.ContentCopy, enabled = app.lists.size < MAX_LISTS) { menuOpen = false; onDuplicate(list) }
        HorizontalDivider(color = Palette.border)
        MenuItem(L("wordLists.row.delete"), Icons.Outlined.Delete, color = Palette.destructive) { menuOpen = false; onDelete(list) }
      }
    }
  }
}

@Composable
fun MenuItem(title: String, icon: ImageVector, enabled: Boolean = true, color: Color = Palette.foreground, onClick: () -> Unit) {
  DropdownMenuItem(
    text = { T(title, color = color) },
    leadingIcon = { Glyph(icon, tint = color) },
    enabled = enabled,
    onClick = onClick,
  )
}

/** A list's words as a CSV file, shared through the share sheet (src/components/WordListExport.tsx). */
fun shareCsv(context: Context, list: WordList) {
  val name = list.name.replace(Regex("[/\\\\?%*|\"<>:\\p{Cntrl}]"), "_").trim().ifEmpty { "words" }
  val directory = File(context.cacheDir, "exports").apply { mkdirs() }
  val file = File(directory, "$name.csv")
  file.writeText(encodeWordCsv(list.words))
  val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
  val send = Intent(Intent.ACTION_SEND).apply {
    type = "text/csv"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_TITLE, "$name.csv")
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }
  context.startActivity(Intent.createChooser(send, list.name))
}
