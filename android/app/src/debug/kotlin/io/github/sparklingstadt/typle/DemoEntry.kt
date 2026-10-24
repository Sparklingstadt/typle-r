package io.github.sparklingstadt.typle

import android.app.Activity
import android.content.Intent
import io.github.sparklingstadt.typle.core.DEFAULT_DEVICE_ID
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.WorkspaceFile
import io.github.sparklingstadt.typle.core.encodeWorkspaceFile
import io.github.sparklingstadt.typle.core.initialLists
import io.github.sparklingstadt.typle.core.isoString
import io.github.sparklingstadt.typle.storage.LocalWorkspaceStore
import io.github.sparklingstadt.typle.support.AppLanguage
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

/**
 * Sample data for screenshots (android/ci/screenshots.sh): `--ez typleDemo true`
 * starts with the starting lists, a device and two weeks of records in the cache, so CI can show every page with
 * content without touching real data. `typleRoute`, `typleLanguage`, `typleTyping` and `typleRankingsList` choose
 * what is shown, like the iPad app's launch arguments.
 */
object DemoEntry {
  private var prepared = false

  fun prepare(activity: Activity, intent: Intent?) {
    val extras = intent?.extras ?: return
    if (prepared || !extras.getBoolean("typleDemo", false)) return
    prepared = true
    val directory = File(activity.cacheDir, "typle-demo").apply {
      deleteRecursively()
      mkdirs()
    }
    File(directory, "workspace.json").writeBytes(encodeWorkspaceFile(WorkspaceFile("android:local", 1, document())))
    Launch.store = LocalWorkspaceStore(directory)
    Launch.route = extras.getString("typleRoute")?.let { if (it == "editList") Route.EditList("8f3cf116-1f9f-4579-a071-e600094b104d") else Route.fromName(it) }
    Launch.rankingsList = extras.getString("typleRankingsList")
    Launch.language = AppLanguage.from(extras.getString("typleLanguage"))
    Launch.typing = extras.getString("typleTyping")
  }

  /** The same records as the iPad app's DemoData. */
  private fun document(): WorkspaceDocument {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    fun date(daysAgo: Long, hour: Long): String = isoString(today.minusDays(daysAgo).atStartOfDay(zone).toInstant().plusSeconds(hour * 3600))
    val lists = initialLists().toMutableList()
    val device = PracticeDevice("demo-tablet", "Pixel Tablet＋HHKB", "US")
    val runs = listOf(
      listOf(9.0, 20.0, 2.41, 2.0, 83.33), listOf(6.0, 21.0, 1.92, 1.0, 90.91), listOf(3.0, 19.0, 1.35, 0.0, 100.0),
      listOf(1.0, 22.0, 1.08, 1.0, 90.91), listOf(0.0, 9.0, 0.98, 0.0, 100.0),
    )
    val first = lists[0]
    lists[0] = first.copy(records = first.records + runs.mapIndexed { index, (days, hour, time, mistakes, accuracy) ->
      StoredRecord(
        id = "demo-$index", time = time, date = date(days.toLong(), hour.toLong()), mistakes = mistakes.toInt(), accuracy = accuracy,
        device = if (index % 2 == 0) device else PracticeDevice(DEFAULT_DEVICE_ID, "デフォルト"), wordCount = first.words.size,
      )
    })
    if (lists.size > 2) {
      val countries = lists[2]
      lists[2] = countries.copy(records = countries.records + StoredRecord(
        id = "demo-countries", time = 212.4, date = date(5, 20), mistakes = 14, accuracy = 88.2, device = device,
        wordCount = countries.words.size,
      ))
    }
    return WorkspaceDocument(lists, listOf(device))
  }
}
