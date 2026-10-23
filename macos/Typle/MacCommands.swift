import AppKit
import SwiftUI
import TypleCore
import UniformTypeIdentifiers

/// The Mac's menu bar: 「リストを作成」 in place of a new window (the app has one window, as the web app has one
/// tab), 一般 as the app's settings, and a menu that goes to each page of the sidebar.
struct TypleCommands: Commands {
  var app: AppModel

  var body: some Commands {
    // Reading the language rebuilds the menus in it when 一般 changes it.
    let _ = app.language
    CommandGroup(replacing: .newItem) {
      Button(L("nav.links.create")) { app.navigate(.createList) }
        .keyboardShortcut("n")
    }
    CommandGroup(replacing: .appSettings) {
      Button(L("mac.menu.settings")) { app.navigate(.general) }
        .keyboardShortcut(",")
    }
    CommandMenu(L("mac.menu.go")) {
      Button(L("nav.links.home")) { app.navigate(.home) }.keyboardShortcut("1")
      Button(L("nav.links.play")) { app.navigate(.practice) }.keyboardShortcut("2")
      Button(L("nav.links.records")) { app.navigate(.records) }.keyboardShortcut("3")
      Button(L("nav.links.rankings")) { app.navigate(.rankings) }.keyboardShortcut("4")
      Button(L("nav.links.edit")) { app.navigate(.lists) }.keyboardShortcut("5")
      Button(L("nav.links.devices")) { app.navigate(.devices) }.keyboardShortcut("6")
    }
    CommandGroup(replacing: .help) {
      Button(L("nav.links.guide")) { open("https://typle-r-six.vercel.app/guide") }
      Button(L("nav.links.about")) { open("https://typle-r-six.vercel.app/about") }
    }
  }

  private func open(_ address: String) {
    if let url = URL(string: address) { NSWorkspace.shared.open(url) }
  }
}

extension CsvExport {
  /// Saves the list's CSV where the reader chooses, as the web app's download does.
  @MainActor
  func save() {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = fileName
    panel.allowedContentTypes = [.commaSeparatedText]
    panel.canCreateDirectories = true
    guard panel.runModal() == .OK, let url = panel.url else { return }
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      NSAlert(error: error).runModal()
    }
  }
}

#if DEBUG
/// Screenshots: with `-TypleSnapshot <file>` the app saves its window as a PNG once the
/// page has settled, and quits. It draws the window itself, so the runner needs no permission to record the screen.
@MainActor
enum MacSnapshot {
  static func takeIfAsked() async {
    guard let path = UserDefaults.standard.string(forKey: "TypleSnapshot") else { return }
    try? await Task.sleep(for: .seconds(4))
    guard let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil }),
          let view = window.contentView?.superview ?? window.contentView,
          let image = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
      FileHandle.standardError.write(Data("No window to save\n".utf8))
      exit(1)
    }
    view.cacheDisplay(in: view.bounds, to: image)
    guard let png = image.representation(using: .png, properties: [:]), (try? png.write(to: URL(fileURLWithPath: path))) != nil else {
      FileHandle.standardError.write(Data("Could not save \(path)\n".utf8))
      exit(1)
    }
    NSApp.terminate(nil)
  }
}
#endif
