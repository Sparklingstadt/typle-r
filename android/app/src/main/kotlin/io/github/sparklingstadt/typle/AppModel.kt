package io.github.sparklingstadt.typle

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.chosenDevice
import io.github.sparklingstadt.typle.storage.ApiWorkspaceStore
import io.github.sparklingstadt.typle.storage.LocalWorkspaceStore
import io.github.sparklingstadt.typle.storage.TokenVault
import io.github.sparklingstadt.typle.storage.WorkspaceStore
import io.github.sparklingstadt.typle.support.AppLanguage
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.Localization
import io.github.sparklingstadt.typle.support.errorText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The web app's pages, in the order of its sidebar. */
sealed interface Route {
  data object Home : Route
  data object Practice : Route
  data object Records : Route
  data object Rankings : Route
  data object Lists : Route
  data object CreateList : Route
  data class EditList(val id: String) : Route
  data object General : Route
  data object Devices : Route

  /** The sidebar item a page belongs to; the list editor belongs to 単語リスト as /edit/<id> does. */
  val navigationItem: Route get() = if (this is EditList) Lists else this

  companion object {
    /** For the screenshots' launch extras (`typleRoute records`). */
    fun fromName(name: String): Route? = when (name) {
      "home" -> Home
      "practice" -> Practice
      "records" -> Records
      "rankings" -> Rankings
      "lists" -> Lists
      "createList" -> CreateList
      "general" -> General
      "devices" -> Devices
      else -> null
    }
  }
}

enum class Appearance { SYSTEM, LIGHT, DARK }

enum class StorageKind {
  /** This tablet's file, the default. */
  LOCAL,
  /** An account through the Go API. */
  API,
}

/** What a launch asks for before the first screen: set by the debug build's sample data for screenshots. */
object Launch {
  var store: WorkspaceStore? = null
  var route: Route? = null
  var rankingsList: String? = null
  var language: AppLanguage? = null
  var typing: String? = null
}

val LocalApp = staticCompositionLocalOf<AppModel> { error("No AppModel") }

/** The app's state: the workspace of the chosen store and the choices remembered on this tablet. */
class AppModel(application: Application) : AndroidViewModel(application) {
  private val prefs = application.getSharedPreferences("typle", Context.MODE_PRIVATE)
  private val vault = TokenVault(application)

  var route by mutableStateOf<Route>(Route.Home)
  /** The list the best records page shows, like `/rankings?list=<id>`. */
  var rankingsList by mutableStateOf<String?>(null)
  /** A list another screen asked the practice screen to open, like `/play?list=<id>`. */
  var practiceRequest by mutableStateOf<String?>(null)
  /**
   * Counts arrivals on the practice page. The run lives in a ViewModel so it survives turning the tablet, and starts
   * again on each new visit, as the iPad app's practice screen does when it is opened again.
   */
  var practiceVisit by mutableIntStateOf(0)
    private set

  var storage by mutableStateOf(StorageKind.entries.firstOrNull { it.name == prefs.getString("typle-r:storage", null) } ?: StorageKind.LOCAL)
    private set
  var serverUrl by mutableStateOf(prefs.getString("typle-r:api-url", null) ?: "")
    private set
  var store by mutableStateOf<WorkspaceStore>(LocalWorkspaceStore(application.filesDir))
    private set
  var document by mutableStateOf<WorkspaceDocument?>(null)
    private set
  var loading by mutableStateOf(false)
    private set
  var loadError by mutableStateOf<String?>(null)
    private set

  /** Whether the practice screen shows the live elapsed time, speed, accuracy and mistakes. */
  var liveStatsVisible by mutableStateOf(!prefs.getBoolean("typle-r:live-stats-hidden", false))
    private set
  /** The stored device choice for the current store: a device id, "" for 未選択, or null before the first choice. */
  var selectedDeviceId by mutableStateOf<String?>(null)
    private set
  /** The display language, chosen in 一般 like the web app's. */
  var language by mutableStateOf(AppLanguage.from(prefs.getString("typle-r:language", null)) ?: AppLanguage.preferred())
    private set
  var appearance by mutableStateOf(Appearance.entries.firstOrNull { it.name == prefs.getString("typle-r:theme", null) } ?: Appearance.SYSTEM)
    private set

  init {
    Launch.language?.let { language = it }
    Localization.use(language, application.assets)
    val demo = Launch.store
    if (demo != null) {
      store = demo
      Launch.route?.let { route = it }
      rankingsList = Launch.rankingsList
    } else {
      makeStore(storage, serverUrl)?.let { store = it }
      selectedDeviceId = prefs.getString("typle-r:device:${store.accountId}", null)
    }
    viewModelScope.launch { reload() }
  }

  fun changeLanguage(language: AppLanguage) {
    this.language = language
    Localization.use(language, getApplication<Application>().assets)
    prefs.edit().putString("typle-r:language", language.tag).apply()
  }

  /** The top bar's switch, which like the web app's sets light or dark from what is showing now. */
  fun changeAppearance(appearance: Appearance) {
    this.appearance = appearance
    prefs.edit().putString("typle-r:theme", appearance.name).apply()
  }

  fun navigate(route: Route) {
    if (route == Route.Practice && this.route != Route.Practice) practiceVisit++
    this.route = route
  }

  fun changeLiveStatsVisible(visible: Boolean) {
    liveStatsVisible = visible
    prefs.edit().putBoolean("typle-r:live-stats-hidden", !visible).apply()
  }

  private fun makeStore(kind: StorageKind, serverUrl: String): WorkspaceStore? = when (kind) {
    StorageKind.LOCAL -> LocalWorkspaceStore(getApplication<Application>().filesDir)
    StorageKind.API -> {
      val url = ApiWorkspaceStore.apiUrl(serverUrl)
      val token = vault.read()
      if (url == null || token == null) null else ApiWorkspaceStore(url, token)
    }
  }

  val lists: List<WordList> get() = document?.lists ?: emptyList()
  val devices: List<PracticeDevice> get() = document?.devices ?: emptyList()
  val defaultDeviceName: String get() = L("format.defaultDevice")

  /** The device this tablet practises on: the built-in デフォルト until another is chosen, or none for 未選択. */
  val chosenPracticeDevice: PracticeDevice? get() = chosenDevice(devices, selectedDeviceId, defaultDeviceName)

  fun chooseDevice(id: String) {
    selectedDeviceId = id
    prefs.edit().putString("typle-r:device:${store.accountId}", id).apply()
  }

  suspend fun reload() {
    loading = true
    loadError = null
    val current = store
    try {
      val loaded = current.load()
      // A store switched while this one was loading has its own load.
      if (current !== store) return
      document = loaded
    } catch (e: CancellationException) {
      loading = false
      throw e
    } catch (e: Exception) {
      if (current !== store) return
      document = null
      loadError = errorText(e)
    }
    loading = false
  }

  /** Switches where the workspace is kept. The two are separate and nothing is copied between them. */
  suspend fun useStorage(kind: StorageKind, serverUrl: String? = null, token: String? = null) {
    if (serverUrl != null) {
      if (ApiWorkspaceStore.apiUrl(serverUrl) == null) throw TypleException("apiInvalidURL")
      this.serverUrl = serverUrl.trim()
      prefs.edit().putString("typle-r:api-url", this.serverUrl).apply()
    }
    if (token != null) vault.write(token.trim())
    val next = makeStore(kind, this.serverUrl) ?: throw TypleException("apiNotConfigured")
    storage = kind
    prefs.edit().putString("typle-r:storage", kind.name).apply()
    store = next
    document = null
    selectedDeviceId = prefs.getString("typle-r:device:${next.accountId}", null)
    reload()
  }

  /** Forgets the token and goes back to this tablet's data. */
  suspend fun signOut() {
    vault.write(null)
    try { useStorage(StorageKind.LOCAL) } catch (_: TypleException) {}
  }

  val hasToken: Boolean get() = vault.read() != null

  // Changes. Each throws the reason it failed, for the screen to show; the shown data stays as it was.

  // A change finishes even when the screen that asked for it goes away, so the shown data and the store's own copy
  // never fall behind what was saved.
  private suspend fun applyChange(change: suspend (WorkspaceStore) -> WorkspaceDocument) = withContext(NonCancellable) {
    val current = store
    val next = change(current)
    if (current === store) document = next
  }

  suspend fun saveList(list: WordList, editing: Boolean) = applyChange { it.saveList(list, editing) }

  suspend fun duplicateList(id: String): WordList {
    val current = store
    return withContext(NonCancellable) {
      val (next, copy) = current.duplicateList(id) { n -> if (n == 1) L("lists.copySuffix") else L("lists.copySuffixNumbered", n) }
      if (current === store) document = next
      copy
    }
  }

  suspend fun deleteList(id: String) = applyChange { it.deleteList(id) }

  suspend fun addRecord(record: StoredRecord, listId: String) = applyChange { it.addRecord(record, listId) }

  suspend fun deleteRecord(record: StoredRecord, listId: String) = applyChange { it.deleteRecord(record, listId) }

  suspend fun saveDevice(device: PracticeDevice, editing: Boolean) {
    val name = defaultDeviceName
    applyChange { it.saveDevice(device, editing, name) }
  }

  suspend fun deleteDevice(id: String) = applyChange { it.deleteDevice(id) }

  fun practice(listId: String) {
    practiceRequest = listId
    navigate(Route.Practice)
  }

  fun showRankings(listId: String?) {
    rankingsList = listId
    route = Route.Rankings
  }
}
