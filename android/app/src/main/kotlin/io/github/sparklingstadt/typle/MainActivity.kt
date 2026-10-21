package io.github.sparklingstadt.typle

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import io.github.sparklingstadt.typle.core.AccountLogin
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  // The same AppModel the screens get from viewModel(): the activity's store and default key.
  private val app: AppModel get() = ViewModelProvider(this)[AppModel::class.java]

  override fun onCreate(savedInstanceState: Bundle?) {
    // The debug build reads the screenshots' launch extras before the app's state is made.
    DemoEntry.prepare(this, intent)
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent { TypleRoot() }
    // A login that ends after the app's process was gone starts the app with its callback. An activity made again
    // from saved state is handed its old intent, which must not finish the same login twice.
    if (savedInstanceState == null) intent?.let { receiveLogin(it) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    receiveLogin(intent)
  }

  override fun onResume() {
    super.onResume()
    app.cancelSignInIfIdle()
  }

  /** Hands `typle-r://login?…` to the app, once. */
  private fun receiveLogin(intent: Intent) {
    val data = intent.data ?: return
    if (data.scheme != AccountLogin.CALLBACK_SCHEME || data.host != "login") return
    setIntent(Intent(intent).setData(null))
    val callback = data.toString()
    val model = app
    // Undispatched, so the login is marked as being finished before onResume, which follows this, looks.
    lifecycleScope.launch(start = CoroutineStart.UNDISPATCHED) { model.finishSignIn(callback) }
  }
}
