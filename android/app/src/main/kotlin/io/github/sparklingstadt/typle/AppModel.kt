package io.github.sparklingstadt.typle

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.sparklingstadt.typle.core.AccountLogin
import io.github.sparklingstadt.typle.core.AccountUser
import io.github.sparklingstadt.typle.core.DEFAULT_ACCOUNT_URL
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.TypleJson
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.accountAddress
import io.github.sparklingstadt.typle.core.chosenDevice
import io.github.sparklingstadt.typle.storage.AccountWorkspaceStore
import io.github.sparklingstadt.typle.storage.LocalWorkspaceStore
import io.github.sparklingstadt.typle.storage.TokenVault
import io.github.sparklingstadt.typle.storage.WorkspaceStore
import io.github.sparklingstadt.typle.support.AppLanguage
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.Localization
import io.github.sparklingstadt.typle.support.errorText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

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
  /** The account of the web app's GitHub login, through its Go backend (`/api/workspace`). */
  ACCOUNT,
}

/**
 * A GitHub login that has been opened and not yet finished: kept on this tablet, since the app's process may end while
 * the login is shown. The verifier never leaves the app.
 */
@Serializable
private data class PendingLogin(val verifier: String, val url: String, val startedAt: Long)

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

  var storage by mutableStateOf(StorageKind.LOCAL)
    private set
  /** The web app the account is kept in, the production deployment unless another was signed in to. */
  var serverUrl by mutableStateOf(prefs.getString("typle-r:server-url", null) ?: DEFAULT_ACCOUNT_URL)
    private set
  /** The GitHub account signed in with, kept until signing out. */
  var accountUser by mutableStateOf(readAccountUser())
    private set
  /** Whether a GitHub login is open or being finished; the settings screen waits while it is. */
  var signingIn by mutableStateOf(false)
    private set
  /** What the last login came to, for the settings screen: (failed, text). */
  var signInMessage by mutableStateOf<Pair<Boolean, String>?>(null)
    private set
  // Counts the login callbacks being finished, so returning to the app, or another callback, does not end the wait.
  private var finishingSignIns = 0
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
      forgetApiStorage()
      // An account whose token is gone (the Keystore's key was reset) is signed out, as the iPad app treats it.
      if (accountUser != null && vault.read() == null) {
        accountUser = null
        prefs.edit().remove("typle-r:account").apply()
      }
      val saved = StorageKind.entries.firstOrNull { it.name == prefs.getString("typle-r:storage", null) } ?: StorageKind.LOCAL
      val made = makeStore(saved)
      if (made != null) {
        storage = saved
        store = made
      } else {
        // Signed out or the token is gone: this tablet's data, until signing in again.
        prefs.edit().putString("typle-r:storage", StorageKind.LOCAL.name).apply()
      }
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

  /**
   * Earlier versions kept the account through the self-hosted `/api/v1` with a GitHub token. That storage is gone: its
   * address and token are forgotten once, and the app starts on this tablet's data.
   */
  private fun forgetApiStorage() {
    val wasApi = prefs.getString("typle-r:storage", null) == "API"
    if (!wasApi && !prefs.contains("typle-r:api-url")) return
    vault.write(null)
    val editor = prefs.edit().remove("typle-r:api-url")
    if (wasApi) editor.putString("typle-r:storage", StorageKind.LOCAL.name)
    editor.apply()
  }

  private fun makeStore(kind: StorageKind): WorkspaceStore? = when (kind) {
    StorageKind.LOCAL -> LocalWorkspaceStore(getApplication<Application>().filesDir)
    StorageKind.ACCOUNT -> {
      val url = accountAddress(serverUrl)
      val token = vault.read()
      val user = accountUser
      if (url == null || token == null || user == null) null
      else {
        lateinit var made: AccountWorkspaceStore
        // A token the backend renewed replaces the old one; if it cannot be kept, the old one still works for now. A
        // store no longer in use, after a sign-out or a login to another account, keeps nothing.
        made = AccountWorkspaceStore(url, token, user.id) { if (made === store && storage == StorageKind.ACCOUNT) keepToken(it) }
        made
      }
    }
  }

  private fun readAccountUser(): AccountUser? {
    val text = prefs.getString("typle-r:account", null) ?: return null
    return try {
      TypleJson.decodeFromString(AccountUser.serializer(), text)
    } catch (_: SerializationException) {
      null
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  /** Keeps the token in the Android Keystore's care; false when this tablet cannot. */
  private fun keepToken(token: String): Boolean = try {
    vault.write(token)
    true
  } catch (_: Exception) {
    false
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

  /**
   * Starts a GitHub login through the web app at [serverUrl] and returns where it begins, for a custom tab to show. The
   * login ends at `typle-r://login?code=…`, which MainActivity hands to [receiveSignIn].
   */
  fun startSignIn(serverUrl: String): Uri {
    val url = accountAddress(serverUrl) ?: throw TypleException("accountInvalidURL")
    val login = AccountLogin(url)
    val pending = PendingLogin(login.verifier, url.toString(), System.currentTimeMillis())
    prefs.edit().putString("typle-r:login", TypleJson.encodeToString(PendingLogin.serializer(), pending)).apply()
    signInMessage = null
    signingIn = true
    return Uri.parse(login.signinUrl.toString())
  }

  /**
   * Finishes the login [callback] ended at. It runs in the app's own scope rather than the activity's, so the activity
   * going away does not stop it.
   */
  fun receiveSignIn(callback: String) {
    // Undispatched, so the login is marked as being finished before onResume, which follows this, looks.
    viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) { finishSignIn(callback) }
  }

  /**
   * Trades the address the login ended at for the app's token, keeps the account and switches to it. What came of it
   * is left in [signInMessage]. A login is finished once: its record is removed first.
   */
  private suspend fun finishSignIn(callback: String) {
    finishingSignIns++
    signingIn = true
    signInMessage = null
    val saved = prefs.getString("typle-r:login", null)
    prefs.edit().remove("typle-r:login").apply()
    // The record of the app's own login, when this is it coming back in time.
    val pending = saved?.let { decodePendingLogin(it) }?.takeIf { System.currentTimeMillis() - it.startedAt in 0..LOGIN_LIFETIME_MILLIS }
    val url = pending?.let { accountAddress(it.url) }
    // The result is shown in 一般, which may not be open when the app was started again for the login. Any other
    // `typle-r://login` leaves the page as it is, so a practice run or an unsaved list is not lost to it.
    if (url != null) navigate(Route.General)
    try {
      val result = try {
        if (pending == null || url == null) throw TypleException("accountLoginFailed")
        // The code is traded once, so the account it brings is kept even when the app is closed meanwhile, and the
        // next launch starts with it.
        withContext(NonCancellable) {
          val (token, user) = withContext(Dispatchers.IO) { AccountLogin(url, pending.verifier).finish(callback) }
          if (!keepToken(token)) throw TypleException("accountSaveFailed")
          prefs.edit()
            .putString("typle-r:account", TypleJson.encodeToString(AccountUser.serializer(), user))
            .putString("typle-r:server-url", url.toString())
            .putString("typle-r:storage", StorageKind.ACCOUNT.name)
            .apply()
          accountUser = user
          serverUrl = url.toString()
        }
        useStorage(StorageKind.ACCOUNT)
        loadError?.let { true to it } ?: (false to L("settings.connected", lists.size))
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        true to errorText(e)
      }
      signInMessage = result
    } finally {
      finishingSignIns--
      if (finishingSignIns == 0) signingIn = false
    }
  }

  private fun decodePendingLogin(text: String): PendingLogin? = try {
    TypleJson.decodeFromString(PendingLogin.serializer(), text)
  } catch (_: SerializationException) {
    null
  } catch (_: IllegalArgumentException) {
    null
  }

  /**
   * Ends the wait when the app is shown again without the login's callback, as when the custom tab was closed. The
   * record stays, so a callback that still comes is finished.
   */
  fun cancelSignInIfIdle() {
    if (finishingSignIns == 0) signingIn = false
  }

  fun dismissSignInMessage() {
    signInMessage = null
  }

  /** Switches where the workspace is kept. The two are separate and nothing is copied between them. */
  suspend fun useStorage(kind: StorageKind) {
    val next = makeStore(kind) ?: throw TypleException("accountLoginRequired")
    storage = kind
    prefs.edit().putString("typle-r:storage", kind.name).apply()
    store = next
    document = null
    selectedDeviceId = prefs.getString("typle-r:device:${next.accountId}", null)
    reload()
  }

  /**
   * Forgets the token and the account and goes back to this tablet's data. The token is a signed value the backend
   * keeps no record of, as the web app's cookie is, so there is nothing to revoke.
   */
  suspend fun signOut() {
    vault.write(null)
    prefs.edit().remove("typle-r:account").apply()
    accountUser = null
    signInMessage = null
    try { useStorage(StorageKind.LOCAL) } catch (_: TypleException) {}
  }

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

  private companion object {
    /** How long a login may stay open before its callback is no longer accepted. */
    const val LOGIN_LIFETIME_MILLIS = 10 * 60 * 1000L
  }
}
