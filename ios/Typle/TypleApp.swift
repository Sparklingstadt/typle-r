import SwiftUI
import TypleCore

@main
struct TypleApp: App {
  @State private var app = AppModel()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(app)
        .task { await app.reload() }
        #if os(macOS)
        // The smallest window the pages are laid out for: the top bar's parts and the practice card fit in it.
        .frame(minWidth: 800, minHeight: 560)
        #endif
        #if os(macOS) && DEBUG
        // Screenshots: `-TypleSnapshot <file>` saves the window and quits.
        .task { await MacSnapshot.takeIfAsked() }
        #endif
    }
    #if os(macOS)
    // As wide as the web app's sidebar layout, at the height of the web captures.
    .defaultSize(width: 1280, height: 820)
    .commands { TypleCommands(app: app) }
    #endif
  }
}

/// The web app's layout (src/app/layout.tsx): a 56pt top bar, and below it the sidebar beside the page when the
/// window is at least 1280pt wide, or a drawer opened from the menu button when it is narrower.
struct RootView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.colorScheme) private var systemScheme
  @State private var drawerOpen = false

  var body: some View {
    GeometryReader { proxy in
      let wide = proxy.size.width >= 1280
      VStack(spacing: 0) {
        TopBar(showsMenu: !wide, onMenu: { withAnimation(.easeOut(duration: 0.2)) { drawerOpen = true } })
        HStack(spacing: 0) {
          if wide {
            ScrollView { NavList(onNavigate: {}).padding(12) }
              .frame(width: 240)
              .background(Palette.background)
              .hairline(.trailing)
          }
          page.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .overlay(alignment: .leading) {
        if drawerOpen && !wide {
          ZStack(alignment: .leading) {
            Color.black.opacity(0.5).ignoresSafeArea()
              .onTapGesture { closeDrawer() }
              .accessibilityLabel(L("nav.closeMenu"))
              .accessibilityAddTraits(.isButton)
            Drawer(onClose: closeDrawer)
              .frame(width: 288)
              .transition(.move(edge: .leading))
          }
        }
      }
    }
    .background(Palette.background)
    .tint(Palette.primary)
    .foregroundStyle(Palette.foreground)
    .environment(\.locale, app.language.locale)
    .preferredColorScheme(app.appearance == .system ? nil : app.appearance == .dark ? .dark : .light)
    // Text comes from the chosen language's bundle, so the whole tree is rebuilt when it changes.
    .id(app.language)
  }

  private func closeDrawer() {
    withAnimation(.easeOut(duration: 0.2)) { drawerOpen = false }
  }

  @ViewBuilder
  private var page: some View {
    if app.route == .general {
      // Settings stay reachable when the data cannot be read, to switch where it is kept.
      GeneralSettingsView()
    } else if app.document == nil {
      if let error = app.loadError {
        PageScroll {
          VStack(alignment: .leading, spacing: 12) {
            Label(L("errors.loadFailed"), systemImage: "exclamationmark.triangle").font(.headline).foregroundStyle(Palette.destructive)
            Text(error).font(.system(size: 14))
            HStack {
              Button(L("common.retry")) { Task { await app.reload() } }.buttonStyle(.typle())
              Button(L("nav.links.general")) { app.navigate(.general) }.buttonStyle(.typle(.outline))
            }
          }
          .padding(24)
          .card()
        }
      } else {
        ProgressView(L("common.loading")).frame(maxWidth: .infinity, maxHeight: .infinity).background(Palette.page)
      }
    } else {
      switch app.route {
      case .home: HomeView()
      case .practice: PracticeView()
      case .records: RecordsView()
      case .rankings: RankingsView()
      case .lists: ListsView()
      case .createList: ListEditorView(listId: nil)
      case .editList(let id): ListEditorView(listId: id).id(id)
      case .general: GeneralSettingsView()
      case .devices: DevicesView()
      }
    }
  }
}

/// The top bar (src/components/Navbar): menu button when narrow, the brand, and on the right where data is saved,
/// the light and dark switch and the account.
struct TopBar: View {
  @Environment(AppModel.self) private var app
  @Environment(\.colorScheme) private var scheme
  var showsMenu: Bool
  var onMenu: () -> Void

  var body: some View {
    HStack(spacing: 4) {
      if showsMenu {
        Button(action: onMenu) { Image(systemName: "line.3.horizontal").font(.system(size: 18)) }
          .buttonStyle(.typle(.ghost, size: .iconLg))
          .accessibilityLabel(L("nav.openMenu"))
      }
      Brand { app.navigate(.home) }
      Spacer(minLength: 8)
      StorageBadge()
      Button {
        app.setAppearance(scheme == .dark ? .light : .dark)
      } label: {
        Image(systemName: scheme == .dark ? "moon" : "sun.max").font(.system(size: 18))
      }
      .buttonStyle(.typle(.ghost, size: .iconLg))
      .accessibilityLabel(L("nav.theme.label"))
      .accessibilityValue(L(scheme == .dark ? "nav.theme.toLight" : "nav.theme.toDark"))
      AccountButton()
    }
    .padding(.horizontal, 12)
    .frame(height: 56)
    .background(Palette.background)
    .hairline(.bottom)
  }
}

/// The black keyboard tile and 「Typle」 (src/components/Navbar/Brand.tsx).
struct Brand: View {
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: "keyboard")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Palette.primaryForeground)
          .frame(width: 28, height: 28)
          .background(Palette.primary, in: RoundedRectangle(cornerRadius: 7))
        Text("Typle").font(.system(size: 18, weight: .bold)).foregroundStyle(Palette.foreground)
      }
      .padding(.horizontal, 4)
      .frame(height: 40)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(L("nav.links.home"))
  }
}

/// The web app's GitHub login button. In the apps the login is in 一般, with where the data is kept.
struct AccountButton: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    if app.storage == .account {
      Button { app.navigate(.general) } label: {
        Image(systemName: "person.fill").font(.system(size: 14))
          .foregroundStyle(Palette.mutedForeground)
          .frame(width: 32, height: 32)
          .background(Palette.muted, in: Circle())
      }
      .buttonStyle(.plain)
      .padding(.horizontal, 4)
      .accessibilityLabel(L("account.connected"))
    } else {
      Button { app.navigate(.general) } label: {
        Label(L("account.connect"), systemImage: "rectangle.portrait.and.arrow.right")
      }
      .buttonStyle(.typle(.outline, size: .lg))
    }
  }
}

/// The sidebar's contents, shared by the wide layout and the drawer (src/components/Sidebar/NavList.tsx).
struct NavList: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  var onNavigate: () -> Void

  private struct Item {
    var route: Route?
    var url: String?
    var title: String
    var icon: String
  }

  private var groups: [(String?, [Item])] {
    [
      (nil, [Item(route: .home, title: L("nav.links.home"), icon: "house")]),
      (L("nav.groups.practice"), [
        Item(route: .practice, title: L("nav.links.play"), icon: "keyboard"),
        Item(route: .records, title: L("nav.links.records"), icon: "clock.arrow.circlepath"),
        Item(route: .rankings, title: L("nav.links.rankings"), icon: "trophy"),
      ]),
      (L("nav.groups.wordLists"), [
        Item(route: .lists, title: L("nav.links.edit"), icon: "list.bullet"),
        Item(route: .createList, title: L("nav.links.create"), icon: "plus"),
      ]),
      (L("nav.groups.settings"), [
        Item(route: .general, title: L("nav.links.general"), icon: "gearshape"),
        Item(route: .devices, title: L("nav.links.devices"), icon: "desktopcomputer"),
      ]),
    ]
  }

  private var help: [Item] {
    [
      Item(url: "https://typle-r-six.vercel.app/guide", title: L("nav.links.guide"), icon: "book"),
      Item(url: "https://typle-r-six.vercel.app/about", title: L("nav.links.about"), icon: "info.circle"),
      Item(url: "https://github.com/Sparklingstadt/typle-r", title: "GitHub", icon: "arrow.up.right.square"),
    ]
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(groups.indices, id: \.self) { index in
          if let label = groups[index].0 { groupLabel(label) }
          VStack(spacing: 2) {
            ForEach(groups[index].1.indices, id: \.self) { item in row(groups[index].1[item]) }
          }
        }
      }
      Spacer(minLength: 24)
      VStack(alignment: .leading, spacing: 0) {
        Hairline().padding(.bottom, 4)
        groupLabel(L("nav.help"))
        VStack(spacing: 2) { ForEach(help.indices, id: \.self) { row(help[$0]) } }
      }
    }
  }

  private func groupLabel(_ text: String) -> some View {
    Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.mutedForeground)
      .padding(.horizontal, 12).padding(.top, 16).padding(.bottom, 4)
      .accessibilityAddTraits(.isHeader)
  }

  private func row(_ item: Item) -> some View {
    let current = item.route != nil && item.route == app.route.navigationItem
    return Button {
      if let route = item.route { app.navigate(route) } else if let url = item.url.flatMap(URL.init(string:)) { openURL(url) }
      onNavigate()
    } label: {
      HStack(spacing: 12) {
        Image(systemName: item.icon).font(.system(size: 15)).frame(width: 18)
          .foregroundStyle(current ? Palette.foreground : Palette.mutedForeground)
        Text(item.title).font(.system(size: 14, weight: current ? .medium : .regular)).lineLimit(1)
          .foregroundStyle(current ? Palette.foreground : Palette.foreground.opacity(0.8))
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .frame(height: 40)
      .background(current ? Palette.accent : .clear, in: RoundedRectangle(cornerRadius: Radius.md))
      .overlay(alignment: .leading) {
        if current { Capsule().fill(Palette.primary).frame(width: 3).padding(.vertical, 10) }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(current ? .isSelected : [])
  }
}

/// The narrow layout's sidebar, sliding in from the left (src/components/Navbar/MobileNav.tsx).
struct Drawer: View {
  @Environment(AppModel.self) private var app
  var onClose: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Brand { app.navigate(.home); onClose() }
        Spacer()
        Button(action: onClose) { Image(systemName: "xmark").font(.system(size: 16)) }
          .buttonStyle(.typle(.ghost, size: .icon))
          .accessibilityLabel(L("nav.closeMenu"))
      }
      .padding(.horizontal, 4)
      StorageBadge().padding(.leading, 0)
      ScrollView { NavList(onNavigate: onClose) }
    }
    .padding(12)
    .frame(maxHeight: .infinity, alignment: .top)
    .background(Palette.background)
    .shadow(color: .black.opacity(0.15), radius: 12, x: 4)
  }
}
