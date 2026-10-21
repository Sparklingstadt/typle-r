package io.github.sparklingstadt.typle.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TabletAndroid
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.StorageKind
import io.github.sparklingstadt.typle.core.DEFAULT_ACCOUNT_URL
import io.github.sparklingstadt.typle.core.accountAddress
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.IconTile
import io.github.sparklingstadt.typle.design.InputBox
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.StatusMessage
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.support.AppLanguage
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.errorText
import kotlinx.coroutines.launch

/**
 * 一般 (src/app/settings/page.tsx): the display language, and on the tablet where the data is kept, which the web app
 * decides by signing in. The GitHub login is the web app's own, so the account holds the same data as there
 * (ios/Typle/Settings/GeneralSettingsView.swift).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GeneralSettingsView() {
  val app = LocalApp.current
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var kind by remember { mutableStateOf(app.storage) }
  var serverUrl by remember { mutableStateOf(app.serverUrl) }
  var working by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  val busy = working || app.signingIn
  val signedIn = app.accountUser

  // A login finished while this screen was shown, or a sign-out, changes where the data is kept: the choice follows.
  LaunchedEffect(app.storage) { kind = app.storage }

  /** Switches where the data is kept, and says what came of it. */
  fun perform(action: suspend () -> Unit) {
    working = true
    message = null
    app.dismissSignInMessage()
    scope.launch {
      try {
        action()
        val error = app.loadError
        failed = error != null
        message = error ?: L("settings.connected", app.lists.size)
      } catch (e: Exception) {
        failed = true
        message = errorText(e)
      }
      working = false
    }
  }

  // The login goes on in a custom tab; MainActivity hands its callback to the app, which shows the result here.
  fun signIn() {
    message = null
    app.dismissSignInMessage()
    try {
      openSignIn(context, app.startSignIn(serverUrl))
    } catch (e: Exception) {
      app.cancelSignInIfIdle()
      failed = true
      message = errorText(e)
    }
  }

  PageScroll(maxWidth = 832.dp) {
    PageHeader(L("settings.title"), L("settings.description")) {}
    SettingsCard(Icons.Outlined.Translate, L("settings.language.heading"), L("settings.language.description")) {
      Pair(AppLanguage.JA, AppLanguage.EN).let { (ja, en) ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          for (language in listOf(ja, en)) {
            Choice(app.language == language, L("settings.languageNames.${language.name.lowercase()}"),
              L("settings.languages.${language.name.lowercase()}"), Modifier.weight(1f)) { app.changeLanguage(language) }
          }
        }
      }
      T(L("settings.language.note"), size = 12.sp, color = Palette.mutedForeground)
    }
    SettingsCard(if (app.storage == StorageKind.ACCOUNT) Icons.Outlined.Cloud else Icons.Outlined.TabletAndroid, L("settings.storage"), L("settings.storageHint")) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Choice(kind == StorageKind.LOCAL, L("settings.storage.local"), L("settings.storage.localDetail"), Modifier.weight(1f)) { kind = StorageKind.LOCAL }
        Choice(kind == StorageKind.ACCOUNT, L("settings.storage.account"), L("settings.storage.accountDetail"), Modifier.weight(1f)) { kind = StorageKind.ACCOUNT }
      }
      if (kind == StorageKind.ACCOUNT) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
          Labelled(L("settings.serverURL")) {
            InputBox(serverUrl, { serverUrl = it }, Modifier.fillMaxWidth(), placeholder = DEFAULT_ACCOUNT_URL, keyboardType = KeyboardType.Uri)
          }
          if (signedIn != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
              Glyph(Icons.Outlined.Person, size = 16.dp, tint = Palette.foreground)
              T(L("settings.signedIn", signedIn.name), color = Palette.foreground)
            }
          }
          T(L("settings.accountHint"), size = 12.sp, color = Palette.mutedForeground)
        }
      }
      // The buttons wrap where a narrow screen has no room for them in one line.
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (kind == StorageKind.LOCAL) {
          TypleButton({ perform { app.useStorage(StorageKind.LOCAL) } }, size = ButtonSize.LG, enabled = !busy && app.storage != StorageKind.LOCAL) {
            ButtonText(L("settings.useLocal"))
          }
        } else {
          TypleButton(::signIn, size = ButtonSize.LG, enabled = !busy) { ButtonText(L("settings.signIn")) }
          // Signed in, but keeping the data on this tablet for now.
          if (signedIn != null && app.storage == StorageKind.LOCAL && accountAddress(serverUrl)?.toString() == app.serverUrl) {
            TypleButton({ perform { app.useStorage(StorageKind.ACCOUNT) } }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG, enabled = !busy) {
              ButtonText(L("settings.useAccount"))
            }
          }
        }
        if (signedIn != null) {
          TypleButton({
            scope.launch {
              app.signOut()
              kind = StorageKind.LOCAL
              message = null
            }
          }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG, enabled = !busy) { ButtonText(L("settings.signOut")) }
        }
        if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterVertically).padding(start = 4.dp).size(18.dp), color = Palette.mutedForeground, strokeWidth = 2.dp)
      }
      // A login's result is the app's, since the login may finish while this screen is closed.
      val shown = app.signInMessage ?: message?.let { failed to it }
      shown?.let { (shownFailed, text) -> StatusMessage(text, shownFailed) }
      T(L("settings.current", if (app.storage == StorageKind.ACCOUNT) L("settings.storage.account") else L("settings.storage.local")),
        size = 12.sp, color = Palette.mutedForeground)
    }
  }
}

@Composable
private fun SettingsCard(icon: ImageVector, title: String, description: String, content: @Composable ColumnScope.() -> Unit) {
  Row(Modifier.fillMaxWidth().card().padding(20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
    IconTile(icon)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        T(title, size = 16.sp, weight = FontWeight.SemiBold)
        T(description, color = Palette.mutedForeground)
      }
      content()
    }
  }
}

/** A choice card like the web's language options: a check and 「使用中」 when chosen, an empty circle otherwise. */
@Composable
private fun Choice(selected: Boolean, title: String, subtitle: String, modifier: Modifier, onClick: () -> Unit) {
  val shape = RoundedCornerShape(Radius.md)
  Row(
    modifier.background(if (selected) Palette.muted else Palette.card, shape).border(1.dp, if (selected) Palette.foreground else Palette.border, shape)
      .clickable(role = Role.RadioButton, onClick = onClick).semantics { this.selected = selected }.padding(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      T(title, size = 16.sp, weight = FontWeight.Medium, color = Palette.foreground)
      T(subtitle, size = 12.sp, color = Palette.mutedForeground)
    }
    if (selected) {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Glyph(Icons.Outlined.Check, size = 12.dp)
        T(L("settings.language.current"), size = 12.sp, weight = FontWeight.Medium)
      }
    } else {
      Box(Modifier.size(16.dp).border(1.5.dp, Palette.ring, CircleShape))
    }
  }
}

@Composable
private fun Labelled(label: String, content: @Composable () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    T(label, weight = FontWeight.SemiBold)
    content()
  }
}
