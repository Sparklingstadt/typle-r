package io.github.sparklingstadt.typle.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import io.github.sparklingstadt.typle.core.TypleException

/**
 * Shows the GitHub login in a custom tab, which shares the sign-in to GitHub of the app that shows it. A WebView is not
 * used: GitHub refuses it, and the password would pass through the app.
 */
fun openSignIn(context: Context, uri: Uri) {
  try {
    CustomTabsIntent.Builder().build().launchUrl(context, uri)
  } catch (_: ActivityNotFoundException) {
    throw TypleException("accountNoLoginApp")
  }
}
