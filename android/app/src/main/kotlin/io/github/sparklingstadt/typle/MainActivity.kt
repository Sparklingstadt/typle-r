package io.github.sparklingstadt.typle

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import io.github.sparklingstadt.typle.core.AccountLogin

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
    // A task the login started is opened again from the recent apps with the same intent, whose login was finished.
    if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
    val data = intent.data ?: return
    if (data.scheme != AccountLogin.CALLBACK_SCHEME || data.host != "login") return
    setIntent(Intent(intent).setData(null))
    app.receiveSignIn(data.toString())
  }
}
