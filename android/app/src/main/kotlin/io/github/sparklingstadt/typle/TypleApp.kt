package io.github.sparklingstadt.typle

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.DarkColors
import io.github.sparklingstadt.typle.design.Edge
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.Hairline
import io.github.sparklingstadt.typle.design.LightColors
import io.github.sparklingstadt.typle.design.LocalColors
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.StorageBadge
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.hairline
import io.github.sparklingstadt.typle.devices.DevicesView
import io.github.sparklingstadt.typle.home.HomeView
import io.github.sparklingstadt.typle.lists.ListEditorView
import io.github.sparklingstadt.typle.lists.ListsView
import io.github.sparklingstadt.typle.practice.PracticeView
import io.github.sparklingstadt.typle.records.RankingsView
import io.github.sparklingstadt.typle.records.RecordsView
import io.github.sparklingstadt.typle.settings.GeneralSettingsView
import io.github.sparklingstadt.typle.support.L
import kotlinx.coroutines.launch

/** The app with its colours, language and state. */
@Composable
fun TypleRoot(app: AppModel = viewModel()) {
  val dark = when (app.appearance) {
    Appearance.SYSTEM -> isSystemInDarkTheme()
    Appearance.LIGHT -> false
    Appearance.DARK -> true
  }
  val colors = if (dark) DarkColors else LightColors
  val view = LocalView.current
  SideEffect {
    val window = (view.context as? Activity)?.window ?: return@SideEffect
    WindowCompat.getInsetsController(window, view).apply {
      isAppearanceLightStatusBars = !dark
      isAppearanceLightNavigationBars = !dark
    }
  }
  // Menus and dialogs come from Material; their surfaces take the card colour and the foreground.
  val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
    primary = colors.primary, onPrimary = colors.primaryForeground, surface = colors.card, onSurface = colors.foreground,
    surfaceContainer = colors.card, surfaceContainerHigh = colors.card, surfaceContainerHighest = colors.card,
    onSurfaceVariant = colors.mutedForeground, background = colors.page, onBackground = colors.foreground, outline = colors.border,
  )
  CompositionLocalProvider(LocalApp provides app, LocalColors provides colors) {
    MaterialTheme(colorScheme = scheme) {
      CompositionLocalProvider(
        LocalContentColor provides colors.foreground,
        // No colour in the text style: text takes LocalContentColor, which buttons and badges set for their content.
        LocalTextStyle provides TextStyle(fontSize = 14.sp),
      ) {
        // Text comes from the chosen language's messages, so the whole tree is rebuilt when it changes.
        key(app.language) { RootView() }
      }
    }
  }
}

/**
 * The web app's layout (src/app/layout.tsx): a 56dp top bar, and below it the sidebar beside the page when the
 * window is at least 1280dp wide, or a drawer opened from the menu button when it is narrower.
 */
@Composable
fun RootView() {
  var drawerOpen by remember { mutableStateOf(false) }
  BoxWithConstraints(Modifier.fillMaxSize().background(Palette.background).windowInsetsPadding(WindowInsets.safeDrawing)) {
    val wide = maxWidth >= 1280.dp
    Column(Modifier.fillMaxSize()) {
      TopBar(showsMenu = !wide, onMenu = { drawerOpen = true })
      Row(Modifier.fillMaxSize()) {
        if (wide) {
          Column(Modifier.width(240.dp).fillMaxHeight().background(Palette.background).hairline(Edge.END).padding(12.dp)) {
            NavList(onNavigate = {})
          }
        }
        Box(Modifier.weight(1f).fillMaxHeight().background(Palette.page)) { Page() }
      }
    }
    val open = drawerOpen && !wide
    AnimatedVisibility(open, enter = fadeIn(), exit = fadeOut()) {
      Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
          .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { drawerOpen = false }
          .semantics { contentDescription = L("nav.closeMenu") },
      )
    }
    AnimatedVisibility(open, enter = slideInHorizontally { -it }, exit = slideOutHorizontally { -it }) {
      Drawer(onClose = { drawerOpen = false })
    }
    BackHandler(enabled = open) { drawerOpen = false }
  }
}

@Composable
private fun Page() {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  // Settings stay reachable when the data cannot be read, to switch where it is kept.
  if (app.route == Route.General) {
    GeneralSettingsView()
    return
  }
  if (app.document == null) {
    val error = app.loadError
    if (error != null) {
      PageScroll {
        Column(Modifier.fillMaxWidth().card().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Glyph(Icons.Outlined.WarningAmber, size = 18.dp, tint = Palette.destructive)
            T(L("errors.loadFailed"), size = 17.sp, weight = FontWeight.SemiBold, color = Palette.destructive)
          }
          T(error)
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TypleButton({ scope.launch { app.reload() } }) { ButtonText(L("common.retry")) }
            TypleButton({ app.navigate(Route.General) }, variant = ButtonVariant.OUTLINE) { ButtonText(L("nav.links.general")) }
          }
        }
      }
    } else {
      Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(Modifier.size(28.dp), color = Palette.mutedForeground, strokeWidth = 2.dp)
        Spacer(Modifier.height(12.dp))
        T(L("common.loading"), color = Palette.mutedForeground)
      }
    }
    return
  }
  when (val route = app.route) {
    Route.Home -> HomeView()
    Route.Practice -> PracticeView()
    Route.Records -> RecordsView()
    Route.Rankings -> RankingsView()
    Route.Lists -> ListsView()
    Route.CreateList -> ListEditorView(null)
    is Route.EditList -> key(route.id) { ListEditorView(route.id) }
    Route.General -> GeneralSettingsView()
    Route.Devices -> DevicesView()
  }
}

/**
 * The top bar (src/components/Navbar): menu button when narrow, the brand, and on the right where data is saved,
 * the light and dark switch and the account.
 */
@Composable
private fun TopBar(showsMenu: Boolean, onMenu: () -> Unit) {
  val app = LocalApp.current
  val dark = Palette.dark
  Row(
    Modifier.fillMaxWidth().height(56.dp).background(Palette.background).hairline(Edge.BOTTOM).padding(horizontal = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    if (showsMenu) {
      TypleButton(onMenu, variant = ButtonVariant.GHOST, size = ButtonSize.ICON_LG, label = L("nav.openMenu")) {
        Glyph(Icons.Outlined.Menu, size = 20.dp)
      }
    }
    Brand { app.navigate(Route.Home) }
    Spacer(Modifier.weight(1f))
    StorageBadge()
    TypleButton(
      { app.changeAppearance(if (dark) Appearance.LIGHT else Appearance.DARK) },
      variant = ButtonVariant.GHOST, size = ButtonSize.ICON_LG,
      label = L("nav.theme.label") + " " + L(if (dark) "nav.theme.toLight" else "nav.theme.toDark"),
    ) { Glyph(if (dark) Icons.Outlined.DarkMode else Icons.Outlined.LightMode, size = 20.dp) }
    AccountButton()
  }
}

/** The black keyboard tile and 「Typle」 (src/components/Navbar/Brand.tsx). */
@Composable
private fun Brand(onClick: () -> Unit) {
  Row(
    Modifier.height(40.dp).clip(RoundedCornerShape(Radius.md)).clickable(role = Role.Button, onClick = onClick)
      .semantics { contentDescription = L("nav.links.home") }.padding(horizontal = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).background(Palette.primary), contentAlignment = Alignment.Center) {
      Glyph(Icons.Outlined.Keyboard, size = 16.dp, tint = Palette.primaryForeground)
    }
    T("Typle", size = 18.sp, weight = FontWeight.Bold, color = Palette.foreground)
  }
}

/** The web app's GitHub login button. On the tablet the account is the API connection set up in 一般. */
@Composable
private fun AccountButton() {
  val app = LocalApp.current
  if (app.storage == StorageKind.API) {
    Box(
      Modifier.padding(horizontal = 4.dp).size(32.dp).clip(CircleShape).background(Palette.muted)
        .clickable(role = Role.Button) { app.navigate(Route.General) }.semantics { contentDescription = L("account.connected") },
      contentAlignment = Alignment.Center,
    ) { Glyph(Icons.Outlined.Person, size = 16.dp, tint = Palette.mutedForeground) }
  } else {
    TypleButton({ app.navigate(Route.General) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) {
      ButtonText(L("account.connect"), Icons.AutoMirrored.Outlined.Login)
    }
  }
}

private class NavItem(val title: String, val icon: ImageVector, val route: Route? = null, val url: String? = null)

/** The sidebar's contents, shared by the wide layout and the drawer (src/components/Sidebar/NavList.tsx). */
@Composable
private fun NavList(onNavigate: () -> Unit, modifier: Modifier = Modifier) {
  val groups = listOf(
    null to listOf(NavItem(L("nav.links.home"), Icons.Outlined.Home, Route.Home)),
    L("nav.groups.practice") to listOf(
      NavItem(L("nav.links.play"), Icons.Outlined.Keyboard, Route.Practice),
      NavItem(L("nav.links.records"), Icons.Outlined.History, Route.Records),
      NavItem(L("nav.links.rankings"), Icons.Outlined.EmojiEvents, Route.Rankings),
    ),
    L("nav.groups.wordLists") to listOf(
      NavItem(L("nav.links.edit"), Icons.AutoMirrored.Outlined.List, Route.Lists),
      NavItem(L("nav.links.create"), Icons.Outlined.Add, Route.CreateList),
    ),
    L("nav.groups.settings") to listOf(
      NavItem(L("nav.links.general"), Icons.Outlined.Settings, Route.General),
      NavItem(L("nav.links.devices"), Icons.Outlined.DesktopWindows, Route.Devices),
    ),
  )
  val help = listOf(
    NavItem(L("nav.links.guide"), Icons.AutoMirrored.Outlined.MenuBook, url = "https://typle-r-six.vercel.app/guide"),
    NavItem(L("nav.links.about"), Icons.Outlined.Info, url = "https://typle-r-six.vercel.app/about"),
    NavItem("GitHub", Icons.AutoMirrored.Outlined.OpenInNew, url = "https://github.com/Sparklingstadt/typle-r"),
  )
  Column(modifier.fillMaxHeight()) {
    Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
      for ((label, items) in groups) {
        if (label != null) GroupLabel(label)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) { for (item in items) NavRow(item, onNavigate) }
      }
    }
    Spacer(Modifier.height(24.dp))
    Hairline(Modifier.padding(bottom = 4.dp))
    GroupLabel(L("nav.help"))
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) { for (item in help) NavRow(item, onNavigate) }
  }
}

@Composable
private fun GroupLabel(text: String) {
  T(text, Modifier.padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 4.dp), size = 12.sp, weight = FontWeight.Medium,
    color = Palette.mutedForeground)
}

@Composable
private fun NavRow(item: NavItem, onNavigate: () -> Unit) {
  val app = LocalApp.current
  val uri = LocalUriHandler.current
  val current = item.route != null && item.route == app.route.navigationItem
  val shape = RoundedCornerShape(Radius.md)
  Box(
    Modifier.fillMaxWidth().height(40.dp).clip(shape).background(if (current) Palette.accent else Color.Transparent)
      .clickable(role = Role.Button) {
        if (item.route != null) app.navigate(item.route) else if (item.url != null) uri.openUri(item.url)
        onNavigate()
      }
      .semantics { selected = current },
  ) {
    if (current) Box(Modifier.align(Alignment.CenterStart).padding(vertical = 10.dp).width(3.dp).fillMaxHeight().clip(CircleShape).background(Palette.primary))
    Row(
      Modifier.fillMaxSize().padding(horizontal = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Glyph(item.icon, size = 18.dp, tint = if (current) Palette.foreground else Palette.mutedForeground)
      T(item.title, size = 14.sp, weight = if (current) FontWeight.Medium else FontWeight.Normal, maxLines = 1,
        color = if (current) Palette.foreground else Palette.foreground.copy(alpha = 0.8f))
    }
  }
}

/** The narrow layout's sidebar, sliding in from the left (src/components/Navbar/MobileNav.tsx). */
@Composable
private fun Drawer(onClose: () -> Unit) {
  val app = LocalApp.current
  Column(
    Modifier.width(288.dp).fillMaxHeight().shadow(12.dp).background(Palette.background).padding(12.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
      Brand { app.navigate(Route.Home); onClose() }
      Spacer(Modifier.weight(1f))
      TypleButton(onClose, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("nav.closeMenu")) { Glyph(Icons.Outlined.Close) }
    }
    StorageBadge()
    NavList(onNavigate = onClose, modifier = Modifier.weight(1f))
  }
}
