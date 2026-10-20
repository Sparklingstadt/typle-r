import SwiftUI
import TypleCore
import UniformTypeIdentifiers

/// Creating or editing a list (src/components/WordListEditor.tsx). Words can be added, removed, reordered and read
/// from CSV or TSV files. Whitespace in words is kept, since it can be meant to be typed.
struct ListEditorView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let target: EditorTarget

  private struct Row: Identifiable, Equatable {
    let id = UUID()
    var word: Word
  }

  @State private var name = ""
  @State private var rows: [Row] = []
  @State private var errorMessage: String?
  @State private var importing = false
  @State private var saving = false
  @State private var loaded = false
  @State private var confirmDiscard = false

  private var original: WordList? {
    if case .edit(let list) = target { return list }
    return nil
  }

  private var changed: Bool {
    guard let original else { return !name.isEmpty || rows.contains { !$0.word.display.isEmpty || !$0.word.input.isEmpty || !$0.word.annotation.isEmpty } }
    return name != original.name || rows.map(\.word) != original.words
  }

  var body: some View {
    NavigationStack {
      List {
        if let errorMessage {
          Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
        }
        SwiftUI.Section(L("editor.name")) {
          TextField(L("editor.namePlaceholder"), text: $name)
            .textInputAutocapitalization(.never)
        }
        SwiftUI.Section {
          ForEach($rows) { $row in
            let number = (rows.firstIndex { $0.id == row.id } ?? 0) + 1
            VStack(alignment: .leading, spacing: 6) {
              Text(L("editor.wordNumber", number)).font(.caption).foregroundStyle(.secondary)
              HStack {
                field(L("editor.display"), $row.word.display)
                field(L("editor.input"), $row.word.input)
              }
              field(L("editor.annotation"), $row.word.annotation)
            }
            .padding(.vertical, 4)
          }
          .onDelete { rows.remove(atOffsets: $0) }
          .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
          Button { rows.append(Row(word: Word(display: "", input: ""))) } label: { Label(L("editor.addWord"), systemImage: "plus") }
            .disabled(rows.count >= maxWords)
          Button { importing = true } label: { Label(L("editor.import"), systemImage: "doc.badge.plus") }
        } header: {
          Text(L("editor.words", rows.count))
        } footer: {
          Text(L("editor.importHint"))
        }
      }
      .environment(\.editMode, .constant(.active))
      .navigationTitle(original == nil ? L("editor.createTitle") : L("editor.editTitle"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(L("common.cancel")) { if changed { confirmDiscard = true } else { dismiss() } }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(L("common.save")) { save() }.disabled(saving)
        }
      }
      .confirmationDialog(L("editor.discardTitle"), isPresented: $confirmDiscard, titleVisibility: .visible) {
        Button(L("editor.discard"), role: .destructive) { dismiss() }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText]) { result in
        importFile(result)
      }
    }
    .interactiveDismissDisabled(changed)
    .onAppear(perform: load)
  }

  private func field(_ label: String, _ text: Binding<String>) -> some View {
    TextField(label, text: text, axis: .vertical)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .textFieldStyle(.roundedBorder)
      .accessibilityLabel(label)
  }

  private func load() {
    guard !loaded else { return }
    loaded = true
    if let original {
      name = original.name
      rows = original.words.map { Row(word: $0) }
    } else {
      rows = [Row(word: Word(display: "", input: ""))]
    }
  }

  /// Adds the file's words after the ones already filled in, and names a new list after the file.
  private func importFile(_ result: Result<URL, Error>) {
    errorMessage = nil
    do {
      let url = try result.get()
      guard let format = WordFileFormat(fileName: url.lastPathComponent) else { throw TypleError("importFileType") }
      let access = url.startAccessingSecurityScopedResource()
      defer { if access { url.stopAccessingSecurityScopedResource() } }
      let words = try parseWordData(try Data(contentsOf: url), format: format)
      let kept = rows.filter { !$0.word.display.isEmpty || !$0.word.input.isEmpty || !$0.word.annotation.isEmpty }
      if kept.count + words.count > maxWords { throw TypleError("importTooManyRows") }
      rows = kept + words.map { Row(word: $0) }
      if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { name = url.deletingPathExtension().lastPathComponent }
    } catch {
      errorMessage = errorText(error)
    }
  }

  private func save() {
    errorMessage = nil
    let list = WordList(id: original?.id ?? randomId(), name: name, words: rows.map(\.word), records: original?.records ?? [],
                        createdAt: original?.createdAt ?? isoString(Date()))
    saving = true
    Task {
      do {
        try await app.saveList(list, editing: original != nil)
        dismiss()
      } catch {
        errorMessage = errorText(error)
      }
      saving = false
    }
  }
}
