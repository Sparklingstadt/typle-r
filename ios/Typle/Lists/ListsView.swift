import SwiftUI
import TypleCore
import UniformTypeIdentifiers

/// The word lists page (src/app/(workspace)/edit/page.tsx): search, sort, practise, edit, copy, export and delete.
struct ListsView: View {
  @Environment(AppModel.self) private var app
  @State private var query = ""
  @State private var order = ListOrder.added
  @State private var deleting: WordList?
  @State private var message: String?
  @State private var failed = false

  var body: some View {
    let all = listOverviews(app.lists)
    let items = sortOverviews(all.filter { matchesQuery($0.list, query) }, order: order, locale: Localization.locale)
    PageScroll {
      PageHeader(title: L("wordLists.page.title"), description: L("wordLists.page.description"))
      if let message {
        Label(message, systemImage: failed ? "exclamationmark.triangle" : "checkmark.circle")
          .font(.system(size: 14)).foregroundStyle(failed ? Palette.destructive : Palette.success)
      }
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 10) {
          Text(L("wordLists.manager.heading")).font(.system(size: 16, weight: .bold))
          CountBadge(text: "\(app.lists.count) / \(maxLists)")
          Spacer()
          Button { app.navigate(.createList) } label: { Label(L("wordLists.manager.create"), systemImage: "plus") }
            .buttonStyle(.typle(.primary, size: .lg))
            .disabled(app.lists.count >= maxLists)
        }
        HStack(spacing: 8) {
          SearchField(prompt: L("wordLists.manager.search"), text: $query).frame(maxWidth: 384)
          Menu {
            Picker(L("wordLists.order.label"), selection: $order) {
              ForEach(ListOrder.allCases, id: \.self) { order in Text(L("wordLists.order.\(order.rawValue)")).tag(order) }
            }
          } label: {
            HStack(spacing: 6) {
              Text(L("wordLists.order.label")).foregroundStyle(Palette.mutedForeground)
              Text(L("wordLists.order.\(order.rawValue)")).fontWeight(.medium).foregroundStyle(Palette.foreground)
              Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.mutedForeground)
            }
            .font(.system(size: 14))
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
            .outlined(radius: Radius.md, color: Palette.input)
          }
          Spacer()
          Text(query.isEmpty ? L("wordLists.manager.count", all.count) : L("wordLists.manager.countFiltered", items.count, all.count))
            .font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
        }
        if items.isEmpty {
          empty
        } else {
          VStack(spacing: 0) {
            ForEach(items.indices, id: \.self) { index in
              if index > 0 { Hairline() }
              row(items[index])
            }
          }
          .card()
        }
        Text(L("wordLists.manager.csvNote")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      }
    }
    .confirmationDialog(deleting.map { L("wordLists.delete.title", $0.name) } ?? "", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { list in
      Button(L("common.delete.confirm"), role: .destructive) { delete(list) }
    } message: { list in
      Text(list.records.isEmpty ? L("wordLists.delete.listOnly") : L("wordLists.delete.withRecords"))
    }
  }

  private var empty: some View {
    VStack(spacing: 12) {
      IconTile(systemName: "list.bullet")
      Text(query.isEmpty ? L("wordLists.empty.title") : L("wordLists.manager.noMatch", query)).font(.system(size: 16, weight: .semibold))
      if query.isEmpty {
        Text(L("wordLists.empty.description")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(40)
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
  }

  private func row(_ item: ListOverview) -> some View {
    let preview = item.list.words.prefix(6).map { $0.display.trimmingCharacters(in: .whitespacesAndNewlines) }.joined(separator: L("wordLists.row.separator"))
    let rest = max(0, item.list.words.count - 6)
    return HStack(spacing: 16) {
      Button { app.navigate(.editList(item.list.id)) } label: {
        VStack(alignment: .leading, spacing: 3) {
          Text(item.list.name).font(.system(size: 16, weight: .medium)).foregroundStyle(Palette.foreground).lineLimit(2)
          Text(rest > 0 ? L("wordLists.row.more", preview, rest) : preview).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      VStack(alignment: .leading, spacing: 3) {
        Text(L("wordLists.row.wordCount", item.list.words.count)).font(.system(size: 14, weight: .medium))
        HStack(spacing: 4) {
          Image(systemName: "clock.arrow.circlepath").font(.system(size: 10))
          Text(item.lastPracticed.map { L("wordLists.row.practiced", item.practiceCount, Format.day(Date(timeIntervalSince1970: $0 / 1000))) }
               ?? L("wordLists.row.notPracticed"))
        }
        .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      }
      .frame(width: 180, alignment: .leading)
      Button { app.practice(listId: item.list.id) } label: { Image(systemName: "keyboard").font(.system(size: 15)) }
        .buttonStyle(.typle(.ghost, size: .icon))
        .foregroundStyle(Palette.mutedForeground)
        .accessibilityLabel(L("wordLists.row.practiceList", item.list.name))
      Button { app.navigate(.editList(item.list.id)) } label: { Label(L("wordLists.row.edit"), systemImage: "pencil") }
        .buttonStyle(.typle(.outline, size: .lg))
        .accessibilityLabel(L("wordLists.row.editList", item.list.name))
      Menu { menu(item.list) } label: {
        Image(systemName: "ellipsis").font(.system(size: 15)).frame(width: 36, height: 36).contentShape(Rectangle())
      }
      .foregroundStyle(Palette.foreground)
      .accessibilityLabel(L("wordLists.row.moreFor", item.list.name))
    }
    .padding(.leading, 20)
    .padding(.trailing, 16)
    .padding(.vertical, 14)
  }

  @ViewBuilder
  private func menu(_ list: WordList) -> some View {
    Button { app.practice(listId: list.id) } label: { Label(L("wordLists.row.practiceThis"), systemImage: "keyboard") }
    Button { app.showRankings(listId: list.id) } label: { Label(L("wordLists.row.rankings"), systemImage: "trophy") }
    Button { app.navigate(.records) } label: { Label(L("wordLists.row.records"), systemImage: "clock.arrow.circlepath") }
    Divider()
    ShareLink(item: CsvExport(list: list), preview: SharePreview(list.name)) {
      Label(L("wordLists.row.export"), systemImage: "square.and.arrow.up")
    }
    Button { duplicate(list) } label: { Label(L("wordLists.row.copy"), systemImage: "plus.square.on.square") }
      .disabled(app.lists.count >= maxLists)
    Divider()
    Button(role: .destructive) { deleting = list } label: { Label(L("wordLists.row.delete"), systemImage: "trash") }
  }

  private func duplicate(_ list: WordList) {
    Task {
      do {
        let copy = try await app.duplicateList(id: list.id)
        failed = false
        message = L("wordLists.page.created", copy.name)
      } catch {
        failed = true
        message = errorText(error)
      }
    }
  }

  private func delete(_ list: WordList) {
    Task {
      do {
        try await app.deleteList(id: list.id)
        failed = false
        message = L("wordLists.page.deleted", list.name)
      } catch {
        failed = true
        message = errorText(error)
      }
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
