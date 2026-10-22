import AuthenticationServices
import SwiftUI

/// 一般 (src/app/settings/page.tsx): the display language, and on the iPad where the data is kept, which the web app
/// decides by signing in. The GitHub login is the web app's own, so the account holds the same data as there.
struct GeneralSettingsView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @State private var kind = StorageKind.local
  @State private var serverURL = ""
  @State private var working = false
  @State private var message: String?
  @State private var failed = false
  @State private var loaded = false

  var body: some View {
    PageScroll(maxWidth: 832) {
      PageHeader(title: L("settings.title"), description: L("settings.description")) { EmptyView() }
      language
      storage
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      kind = app.storage
      serverURL = app.serverURL
    }
  }

  private var language: some View {
    settingsCard(icon: "character.book.closed", title: L("settings.language.heading"), description: L("settings.language.description")) {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
        ForEach(AppLanguage.allCases) { language in
          choice(selected: app.language == language, title: L("settings.languageNames.\(language.rawValue)"),
                 subtitle: L("settings.languages.\(language.rawValue)")) { app.setLanguage(language) }
        }
      }
      Text(L("settings.language.note")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
    }
  }

  private var storage: some View {
    settingsCard(icon: app.storage == .account ? "cloud" : "internaldrive", title: L("settings.storage"), description: L("settings.storageHint")) {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
        choice(selected: kind == .local, title: L("settings.storage.local"), subtitle: L("settings.storage.localDetail")) { kind = .local }
        choice(selected: kind == .account, title: L("settings.storage.account"), subtitle: L("settings.storage.accountDetail")) { kind = .account }
      }
      if kind == .account {
        VStack(alignment: .leading, spacing: 12) {
          labelled(L("settings.serverURL")) {
            TextField(AppModel.defaultServerURL, text: $serverURL)
              #if os(iOS)
              .keyboardType(.URL)
              #endif
              .plainInput()
              .font(.system(size: 14))
              .padding(.horizontal, 12).frame(height: 40)
              .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
              .outlined(radius: Radius.md, color: Palette.input)
          }
          if let user = app.accountUser {
            Label(L("settings.signedIn", user.name), systemImage: "person.crop.circle")
              .font(.system(size: 14)).foregroundStyle(Palette.foreground)
          }
          Text(L("settings.accountHint")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground).fixedSize(horizontal: false, vertical: true)
        }
      }
      HStack(spacing: 8) {
        if kind == .local {
          Button(L("settings.useLocal")) { run { try await app.useStorage(.local) } }
            .buttonStyle(.typle(.primary, size: .lg))
            .disabled(working || app.storage == .local)
        } else {
          Button(L("settings.signIn")) { run { try await app.signIn(serverURL: serverURL, authenticate: authenticate) } }
            .buttonStyle(.typle(.primary, size: .lg))
            .disabled(working)
          // Signed in, but keeping the data on this iPad for now.
          if app.accountUser != nil && app.storage == .local && sameServer {
            Button(L("settings.useAccount")) { run { try await app.useStorage(.account) } }
              .buttonStyle(.typle(.outline, size: .lg))
              .disabled(working)
          }
        }
        if app.accountUser != nil {
          Button(L("settings.signOut"), role: .destructive) {
            Task {
              await app.signOut()
              kind = .local
              message = nil
            }
          }
          .buttonStyle(.typle(.outline, size: .lg))
          .disabled(working)
        }
        if working { ProgressView().padding(.leading, 4) }
      }
      if let message {
        Label(message, systemImage: failed ? "exclamationmark.triangle" : "checkmark.circle")
          .font(.system(size: 13)).foregroundStyle(failed ? Palette.destructive : Palette.success)
      }
      Text(L("settings.current", app.storage == .account ? L("settings.storage.account") : L("settings.storage.local")))
        .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
    }
  }

  private var sameServer: Bool {
    AppModel.serverAddress(serverURL)?.absoluteString == app.serverURL
  }

  /// The GitHub login in the system's sheet, which shares Safari's sign-in to GitHub.
  private func authenticate(_ url: URL, _ scheme: String) async throws -> URL {
    try await webAuthenticationSession.authenticate(using: url, callbackURLScheme: scheme, preferredBrowserSession: .shared)
  }

  private func settingsCard<Content: View>(icon: String, title: String, description: String, @ViewBuilder content: () -> Content) -> some View {
    HStack(alignment: .top, spacing: 16) {
      IconTile(systemName: icon)
      VStack(alignment: .leading, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(title).font(.system(size: 16, weight: .semibold))
          Text(description).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).fixedSize(horizontal: false, vertical: true)
        }
        content()
      }
    }
    .padding(20)
    .frame(maxWidth: .infinity, alignment: .leading)
    .card()
  }

  /// A choice card like the web's language options: a check and 「使用中」 when chosen, an empty circle otherwise.
  private func choice(selected: Bool, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(Palette.foreground)
          Text(subtitle).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        }
        Spacer()
        if selected {
          HStack(spacing: 4) { Image(systemName: "checkmark").font(.system(size: 11, weight: .semibold)); Text(L("settings.language.current")) }
            .font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.foreground)
        } else {
          Circle().strokeBorder(Palette.ring, lineWidth: 1.5).frame(width: 16, height: 16)
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
      .background(selected ? Palette.muted : Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
      .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(selected ? Palette.foreground : Palette.border, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func labelled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).font(.system(size: 14, weight: .semibold))
      content()
    }
  }

  /// Switches or signs in, and says what came of it. Closing the login sheet is no failure and says nothing.
  private func run(_ action: @escaping () async throws -> Void) {
    working = true
    message = nil
    Task {
      do {
        try await action()
        if let error = app.loadError {
          failed = true
          message = error
        } else {
          failed = false
          message = L("settings.connected", app.lists.count)
        }
      } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
        message = nil
      } catch {
        failed = true
        message = errorText(error)
      }
      working = false
    }
  }
}
