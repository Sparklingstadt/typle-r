import SwiftUI
import UIKit

/// Where the data is kept and how the app looks. The language follows the iPad's settings for this app.
struct SettingsView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  @State private var kind = StorageKind.local
  @State private var serverURL = ""
  @State private var token = ""
  @State private var working = false
  @State private var message: String?
  @State private var failed = false
  @State private var loaded = false

  var body: some View {
    Form {
      SwiftUI.Section {
        Picker(L("settings.storage"), selection: $kind) {
          Text(L("settings.storage.local")).tag(StorageKind.local)
          Text(L("settings.storage.api")).tag(StorageKind.api)
        }
        .pickerStyle(.inline)
        .labelsHidden()
      } header: {
        Text(L("settings.storage"))
      } footer: {
        Text(L("settings.storageHint"))
      }
      if kind == .api {
        SwiftUI.Section {
          TextField(L("settings.serverURL"), text: $serverURL, prompt: Text(verbatim: "https://typle-api.example.com"))
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          SecureField(app.hasToken ? L("settings.tokenSaved") : L("settings.token"), text: $token)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        } header: {
          Text(L("settings.api"))
        } footer: {
          Text(L("settings.apiHint"))
        }
      }
      SwiftUI.Section {
        Button(kind == .api ? L("settings.connect") : L("settings.useLocal")) { apply() }
          .disabled(working || (kind == app.storage && kind == .local))
        if working { ProgressView() }
        if let message { Text(message).foregroundStyle(failed ? Color.red : Color.green) }
        if app.storage == .api {
          Button(L("settings.signOut"), role: .destructive) {
            token = ""
            Task {
              await app.signOut()
              kind = .local
              message = nil
            }
          }
        }
      } footer: {
        Text(L("settings.current", app.storage == .api ? L("settings.storage.api") : L("settings.storage.local")))
      }
      SwiftUI.Section(L("settings.display")) {
        Toggle(L("practice.header.liveStats"), isOn: Binding(get: { app.liveStatsVisible }, set: { app.setLiveStatsVisible($0) }))
        Button(L("settings.language")) {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
      }
    }
    .navigationTitle(L("nav.settings"))
    .onAppear {
      guard !loaded else { return }
      loaded = true
      kind = app.storage
      serverURL = app.serverURL
    }
  }

  private func apply() {
    working = true
    message = nil
    Task {
      do {
        try await app.useStorage(kind, serverURL: kind == .api ? serverURL : nil, token: kind == .api && !token.isEmpty ? token : nil)
        token = ""
        if let error = app.loadError {
          failed = true
          message = error
        } else {
          failed = false
          message = L("settings.connected", app.lists.count)
        }
      } catch {
        failed = true
        message = errorText(error)
      }
      working = false
    }
  }
}
