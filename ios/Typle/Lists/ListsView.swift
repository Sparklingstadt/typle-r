import SwiftUI
import TypleCore
import UniformTypeIdentifiers

/// The word lists (src/app/(workspace)/edit/page.tsx): search, sort, practise, edit, copy, export and delete.
struct ListsView: View {
  @Environment(AppModel.self) private var app
  @State private var query = ""
  @State private var order = ListOrder.added
  @State private var editing: EditorTarget?
  @State private var deleting: WordList?
  @State private var errorMessage: String?

  var body: some View {
    let items = sortOverviews(listOverviews(app.lists).filter { matchesQuery($0.list, query) }, order: order)
    List {
      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
      }
      ForEach(items) { item in
        Button { editing = .edit(item.list) } label: { row(item) }
          .foregroundStyle(.primary)
          .swipeActions(edge: .trailing) {
            Button(role: .destructive) { deleting = item.list } label: { Label(L("common.delete"), systemImage: "trash") }
          }
          .swipeActions(edge: .leading) {
            Button { app.practice(listId: item.list.id) } label: { Label(L("lists.practice"), systemImage: "play") }.tint(.accentColor)
          }
          .contextMenu { menu(item.list) }
      }
    }
    .overlay {
      if items.isEmpty {
        if query.isEmpty {
          ContentUnavailableView(L("lists.empty"), systemImage: "list.bullet.rectangle")
        } else {
          ContentUnavailableView.search(text: query)
        }
      }
    }
    .searchable(text: $query, prompt: L("lists.search"))
    .navigationTitle(L("nav.lists"))
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { editing = .create } label: { Label(L("lists.create"), systemImage: "plus") }
          .disabled(app.lists.count >= maxLists)
      }
      ToolbarItem(placement: .secondaryAction) {
        Picker(L("lists.order"), selection: $order) {
          ForEach(ListOrder.allCases, id: \.self) { order in Text(L("lists.order.\(order.rawValue)")).tag(order) }
        }
      }
    }
    .sheet(item: $editing) { target in
      ListEditorView(target: target)
    }
    .confirmationDialog(L("lists.deleteTitle"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { list in
      Button(L("common.delete"), role: .destructive) { delete(list) }
    } message: { list in
      Text(L("lists.deleteMessage", list.name, list.records.count))
    }
  }

  private func row(_ item: ListOverview) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(item.list.name).font(.headline)
      Text(item.list.words.prefix(6).map { $0.display.trimmingCharacters(in: .whitespacesAndNewlines) }.joined(separator: L("lists.wordSeparator"))
           + (item.list.words.count > 6 ? L("lists.moreWords", item.list.words.count - 6) : ""))
        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
      HStack(spacing: 12) {
        Label(L("lists.wordCount", item.list.words.count), systemImage: "textformat")
        Label(L("lists.recordCount", item.practiceCount), systemImage: "clock")
        if let last = item.lastPracticed {
          Text(L("lists.lastPracticed", Date(timeIntervalSince1970: last / 1000).formatted(.relative(presentation: .named))))
        }
      }
      .font(.caption).foregroundStyle(.secondary)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private func menu(_ list: WordList) -> some View {
    Button { app.practice(listId: list.id) } label: { Label(L("lists.practice"), systemImage: "play") }
    Button { editing = .edit(list) } label: { Label(L("common.edit"), systemImage: "pencil") }
    Button { duplicate(list) } label: { Label(L("lists.duplicate"), systemImage: "plus.square.on.square") }
      .disabled(app.lists.count >= maxLists)
    ShareLink(item: CsvExport(list: list), preview: SharePreview(list.name)) {
      Label(L("lists.export"), systemImage: "square.and.arrow.up")
    }
    Divider()
    Button(role: .destructive) { deleting = list } label: { Label(L("common.delete"), systemImage: "trash") }
  }

  private func duplicate(_ list: WordList) {
    Task {
      do {
        errorMessage = nil
        try await app.duplicateList(id: list.id)
      } catch { errorMessage = errorText(error) }
    }
  }

  private func delete(_ list: WordList) {
    Task {
      do {
        errorMessage = nil
        try await app.deleteList(id: list.id)
      } catch { errorMessage = errorText(error) }
    }
  }
}

enum EditorTarget: Identifiable {
  case create
  case edit(WordList)

  var id: String {
    switch self {
    case .create: return "create"
    case .edit(let list): return list.id
    }
  }
}

/// A list's words as a CSV file, written only when shared (src/components/WordListExport.tsx).
struct CsvExport: Transferable {
  var list: WordList

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(exportedContentType: .commaSeparatedText) { export in SentTransferredFile(try export.write()) }
  }

  func write() throws -> URL {
    let unsafe = CharacterSet(charactersIn: "/\\?%*|\"<>:").union(.newlines).union(.controlCharacters)
    let name = list.name.components(separatedBy: unsafe).joined(separator: "_").trimmingCharacters(in: .whitespaces)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent((name.isEmpty ? "words" : name) + ".csv")
    try Data(encodeWordCsv(list.words).utf8).write(to: url, options: .atomic)
    return url
  }
}
