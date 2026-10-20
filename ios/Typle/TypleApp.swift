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
    }
  }
}

/// The sidebar of the web app's layout, as a split view: it stays beside the screens in landscape and folds away in
/// portrait and Split View.
struct RootView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    NavigationSplitView {
      List(selection: $app.section) {
        SwiftUI.Section(L("nav.group.practice")) {
          item(.practice, "keyboard")
          item(.lists, "list.bullet.rectangle")
        }
        SwiftUI.Section(L("nav.group.results")) {
          item(.records, "clock.arrow.circlepath")
          item(.rankings, "trophy")
        }
        SwiftUI.Section(L("nav.group.settings")) {
          item(.devices, "keyboard.badge.ellipsis")
          item(.settings, "gearshape")
        }
      }
      .navigationTitle("Typle")
      .safeAreaInset(edge: .bottom) {
        Label(app.storage == .api ? L("settings.storage.api") : L("settings.storage.local"),
              systemImage: app.storage == .api ? "icloud" : "ipad")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding()
      }
    } detail: {
      NavigationStack {
        detail
      }
    }
  }

  private func item(_ section: AppSection, _ icon: String) -> some View {
    Label(L("nav.\(section.rawValue)"), systemImage: icon).tag(section)
  }

  @ViewBuilder
  private var detail: some View {
    if app.section == .settings {
      // Settings stay reachable when the data cannot be read, to switch where it is kept.
      SettingsView()
    } else if app.document == nil {
      if let error = app.loadError {
        ContentUnavailableView {
          Label(L("errors.loadFailed"), systemImage: "exclamationmark.triangle")
        } description: {
          Text(error)
        } actions: {
          Button(L("common.retry")) { Task { await app.reload() } }.buttonStyle(.borderedProminent)
          Button(L("nav.settings")) { app.section = .settings }
        }
        .navigationTitle("Typle")
      } else {
        ProgressView(L("common.loading"))
      }
    } else {
      switch app.section ?? .practice {
      case .practice: PracticeView()
      case .lists: ListsView()
      case .records: RecordsView()
      case .rankings: RankingsView()
      case .devices: DevicesView()
      case .settings: SettingsView()
      }
    }
  }
}
