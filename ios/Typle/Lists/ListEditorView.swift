import SwiftUI
import TypleCore
import UniformTypeIdentifiers

/// Creating or editing a list, as a page like /create and /edit/<id> (src/components/WordListEditor.tsx). An empty
/// 入力する文字 means the same as the word shown, and whitespace in words is kept, since it can be meant to be typed.
struct ListEditorView: View {
  @Environment(AppModel.self) private var app
  let listId: String?

  private struct Row: Identifiable, Equatable {
    let id = UUID()
    var word: Word
    var filled: Bool { !word.display.isEmpty || !word.input.isEmpty || !word.annotation.isEmpty }
  }

  private enum Field: Hashable {
    case name, display(UUID), input(UUID), annotation(UUID)
  }

  @State private var name = ""
  @State private var rows: [Row] = []
  @State private var saved: (String, [Word])?
  @State private var errorMessage: String?
  @State private var nameError: String?
  @State private var rowErrors: [UUID: String] = [:]
  @State private var importing = false
  @State private var imported: [Word]?
  @State private var saving = false
  @State private var confirmDiscard = false
  @State private var loaded = false
  @FocusState private var focus: Field?

  private var original: WordList? { listId.flatMap { id in app.lists.first { $0.id == id } } }
  private var words: [Word] { rows.map(\.word) }
  private var changed: Bool { saved.map { $0.0 != name || $0.1 != words } ?? false }

  var body: some View {
    VStack(spacing: 0) {
      if listId != nil && original == nil && loaded {
        PageScroll {
          Text(L("wordLists.page.notFound")).font(.system(size: 14)).padding(24).frame(maxWidth: .infinity, alignment: .leading).card()
        }
      } else {
        editor
      }
    }
    .onAppear(perform: load)
    .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText]) { readFile($0) }
    .confirmationDialog(L("wordLists.import.existing"), isPresented: Binding(get: { imported != nil }, set: { if !$0 { imported = nil } }),
                        titleVisibility: .visible, presenting: imported) { words in
      Button(L("wordLists.import.add", words.count)) { add(words, replacing: false) }
      Button(L("wordLists.import.replaceWith", words.count), role: .destructive) { add(words, replacing: true) }
    } message: { words in
      Text(L("wordLists.import.appendHint", rows.filter(\.filled).count, words.count))
    }
    .confirmationDialog(L("wordLists.editor.discardTitle"), isPresented: $confirmDiscard, titleVisibility: .visible) {
      Button(L("wordLists.editor.discard"), role: .destructive) { app.navigate(.lists) }
      Button(L("wordLists.editor.keepEditing"), role: .cancel) {}
    } message: {
      Text(L("wordLists.editor.discardDescription"))
    }
  }

  private var editor: some View {
    PageScroll {
      Button { leave() } label: {
        HStack(spacing: 6) { Image(systemName: "chevron.left").font(.system(size: 11, weight: .semibold)); Text(L("wordLists.editor.back")) }
          .font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      }
      .buttonStyle(.plain)
      PageHeader(title: original == nil ? L("wordLists.page.createTitle") : L("wordLists.page.editTitle"), description: description)
      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle").font(.system(size: 14)).foregroundStyle(Palette.destructive)
          .padding(14).frame(maxWidth: .infinity, alignment: .leading)
          .background(Palette.destructive.opacity(0.05), in: RoundedRectangle(cornerRadius: Radius.lg))
          .outlined(radius: Radius.lg, color: Palette.destructive.opacity(0.4))
      }
      nameCard
      wordsCard
      if let original, !original.records.isEmpty, original.words.count != words.count, currentRecordCount(original) > 0 {
        Text(L("wordLists.editor.recount", original.words.count, words.count, currentRecordCount(original)))
          .font(.system(size: 13)).foregroundStyle(Palette.amber)
          .padding(14).frame(maxWidth: .infinity, alignment: .leading)
          .background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: Radius.lg))
      }
      footer
    }
  }

  private var description: String {
    guard let original else { return L("wordLists.editor.description") }
    let practice = original.records.isEmpty ? L("wordLists.row.notPracticed")
      : L("wordLists.row.practiced", original.records.count, Format.day(listOverviews([original])[0].lastPracticed.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()))
    return L("wordLists.page.editDescription", original.words.count, practice)
  }

  private var nameCard: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 4) {
        Text(L("wordLists.editor.name")).font(.system(size: 14, weight: .semibold))
        Text("*").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.destructive)
      }
      TextField("", text: $name)
        .font(.system(size: 14))
        .textFieldStyle(.plain)
        .focused($focus, equals: .name)
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
        .outlined(radius: Radius.md, color: nameError == nil ? Palette.input : Palette.destructive)
        .submitLabel(.next)
        .onSubmit { focus = rows.first.map { .display($0.id) } }
      if let nameError {
        Text(nameError).font(.system(size: 12)).foregroundStyle(Palette.destructive)
      } else {
        Text(L("wordLists.editor.nameHelp")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      }
    }
    .padding(24)
    .card()
  }

  private var wordsCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 10) {
        Text(L("wordLists.editor.words")).font(.system(size: 16, weight: .bold))
        CountBadge(text: "\(rows.count) / \(maxWords.formatted())")
        Spacer()
        Button { importing = true } label: { Label(L("wordLists.import.open"), systemImage: "square.and.arrow.up") }
          .buttonStyle(.typle(.outline, size: .sm))
      }
      .padding(.horizontal, 24)
      .padding(.vertical, 16)
      HStack(spacing: 12) {
        Text("#").frame(width: 60, alignment: .leading)
        HStack(spacing: 0) { Text(L("wordLists.editor.display")); Text("*").foregroundStyle(Palette.destructive) }
          .frame(maxWidth: .infinity, alignment: .leading)
        HStack(spacing: 4) {
          Text(L("wordLists.editor.input")).foregroundStyle(Palette.foreground)
          Text(L("wordLists.editor.inputHint"))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .frame(maxWidth: .infinity, alignment: .leading)
        Text(L("wordLists.editor.annotationOptional")).frame(maxWidth: .infinity, alignment: .leading)
        Color.clear.frame(width: 76, height: 1)
      }
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(Palette.mutedForeground)
      .padding(.horizontal, 24)
      .frame(height: 34)
      .background(Palette.muted.opacity(0.5))
      .hairline(.top)
      .hairline(.bottom)
      ForEach($rows) { $row in
        let index = rows.firstIndex { $0.id == row.id } ?? 0
        if index > 0 { Hairline() }
        wordRow($row, index: index)
      }
      Hairline()
      VStack(alignment: .leading, spacing: 12) {
        Button { addRow() } label: {
          Label(L("wordLists.editor.addWord"), systemImage: "plus")
            .font(.system(size: 14))
            .labelStyle(TightLabelStyle())
            .foregroundStyle(Palette.mutedForeground)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(rows.count >= maxWords)
        HStack(spacing: 8) {
          Kbd(text: "Enter"); Text(L("wordLists.editor.shortcutNext"))
          Text("・")
          Kbd(text: "⌘+Enter"); Text(L("wordLists.editor.shortcutSave"))
          Text("・")
          Image(systemName: "line.3.horizontal").font(.system(size: 11)); Text(L("wordLists.editor.shortcutDrag"))
        }
        .font(.system(size: 12))
        .foregroundStyle(Palette.mutedForeground)
      }
      .padding(.horizontal, 24)
      .padding(.vertical, 16)
    }
    .card()
  }

  private func wordRow(_ binding: Binding<Row>, index: Int) -> some View {
    let row = binding.wrappedValue
    let error = rowErrors[row.id]
    return VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 12) {
        HStack(spacing: 14) {
          Image(systemName: "line.3.horizontal").font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
            .frame(width: 20, height: 36)
            .contentShape(Rectangle())
            .draggable(row.id.uuidString)
            .accessibilityLabel(L("wordLists.wordRow.drag", index + 1))
          Text("\(index + 1)").font(.system(size: 14)).monospacedDigit().foregroundStyle(Palette.mutedForeground)
        }
        .frame(width: 60, alignment: .leading)
        cell(L("wordLists.editor.displayPlaceholder"), binding.word.display, field: .display(row.id), invalid: error != nil && row.word.display.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
             label: L("wordLists.editor.displayLabel", index + 1))
        cell(row.word.display, binding.word.input, field: .input(row.id), invalid: error != nil && !row.word.input.isEmpty,
             label: L("wordLists.editor.inputLabel", index + 1))
        cell(L("wordLists.editor.annotationPlaceholder"), binding.word.annotation, field: .annotation(row.id), invalid: false,
             label: L("wordLists.editor.annotationLabel", index + 1))
        Menu {
          Button { move(index, to: index - 1) } label: { Label(L("wordLists.editor.moveUp"), systemImage: "arrow.up") }.disabled(index == 0)
          Button { move(index, to: index + 1) } label: { Label(L("wordLists.editor.moveDown"), systemImage: "arrow.down") }.disabled(index == rows.count - 1)
          Button { move(index, to: 0) } label: { Label(L("wordLists.editor.moveFirst"), systemImage: "arrow.up.to.line") }.disabled(index == 0)
          Button { move(index, to: rows.count - 1) } label: { Label(L("wordLists.editor.moveLast"), systemImage: "arrow.down.to.line") }.disabled(index == rows.count - 1)
          Divider()
          Button(role: .destructive) { remove(index) } label: { Label(L("wordLists.editor.deleteWord"), systemImage: "trash") }
        } label: {
          Image(systemName: "ellipsis").font(.system(size: 14)).frame(width: 32, height: 36).contentShape(Rectangle())
        }
        .plainMenu()
        .foregroundStyle(Palette.foreground)
        .accessibilityLabel(L("wordLists.editor.wordActions", index + 1))
        Button { remove(index) } label: { Image(systemName: "trash").font(.system(size: 14)) }
          .buttonStyle(.typle(.ghost, size: .icon))
          .foregroundStyle(Palette.mutedForeground)
          .disabled(rows.count == 1 && !row.filled)
          .accessibilityLabel(L("wordLists.editor.deleteWordN", index + 1))
      }
      if let error {
        Text(error).font(.system(size: 12)).foregroundStyle(Palette.destructive).padding(.leading, 72)
      }
    }
    .padding(.horizontal, 24)
    .padding(.vertical, 8)
    .dropDestination(for: String.self) { items, _ in
      guard let id = items.first.flatMap(UUID.init(uuidString:)), let from = rows.firstIndex(where: { $0.id == id }) else { return false }
      move(from, to: index)
      return true
    }
  }

  private func cell(_ placeholder: String, _ text: Binding<String>, field: Field, invalid: Bool, label: String) -> some View {
    TextField(placeholder, text: text)
      .font(.system(size: 14))
      .plainInput()
      .focused($focus, equals: field)
      .submitLabel(.next)
      .onSubmit { next(after: field) }
      .padding(.horizontal, 12)
      .frame(height: 40)
      .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
      .outlined(radius: Radius.md, color: invalid ? Palette.destructive : Palette.input)
      .frame(maxWidth: .infinity)
      .accessibilityLabel(label)
  }

  private var footer: some View {
    HStack(spacing: 12) {
      Text(changed ? L("wordLists.editor.unsaved") : L("wordLists.editor.noChanges"))
        .foregroundStyle(changed ? Palette.foreground : Palette.mutedForeground)
      Text(L("wordLists.editor.wordTotal", rows.filter(\.filled).count)).foregroundStyle(Palette.mutedForeground)
      Spacer()
      Button(L("common.form.cancel")) { leave() }.buttonStyle(.typle(.ghost, size: .lg))
      Button { save() } label: {
        HStack(spacing: 8) {
          Text(L("wordLists.editor.save"))
          Text("⌘+Enter").font(.system(size: 11)).foregroundStyle(Palette.primaryForeground.opacity(0.6))
        }
      }
      .buttonStyle(.typle(.primary, size: .lg))
      .keyboardShortcut(.return, modifiers: .command)
      .disabled(saving)
    }
    .font(.system(size: 14))
    .padding(.horizontal, 20)
    .padding(.vertical, 14)
    .card()
    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
  }

  // MARK: Actions

  private func load() {
    guard !loaded else { return }
    loaded = true
    if let original {
      name = original.name
      // An input equal to the word shown is shown as empty, as the web editor does.
      rows = original.words.map { Row(word: Word(display: $0.display, input: $0.input == $0.display ? "" : $0.input, annotation: $0.annotation)) }
    } else {
      rows = [Row(word: Word(display: "", input: ""))]
      focus = .name
    }
    saved = (name, words)
  }

  private func leave() {
    if changed { confirmDiscard = true } else { app.navigate(.lists) }
  }

  private func addRow() {
    let row = Row(word: Word(display: "", input: ""))
    rows.append(row)
    focus = .display(row.id)
  }

  private func next(after field: Field) {
    switch field {
    case .name: focus = rows.first.map { .display($0.id) }
    case .display(let id): focus = .input(id)
    case .input(let id): focus = .annotation(id)
    case .annotation(let id):
      guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
      if index + 1 < rows.count { focus = .display(rows[index + 1].id) } else if rows.count < maxWords { addRow() }
    }
  }

  private func move(_ from: Int, to: Int) {
    guard rows.indices.contains(from), rows.indices.contains(to), from != to else { return }
    let row = rows.remove(at: from)
    rows.insert(row, at: to)
  }

  private func remove(_ index: Int) {
    guard rows.indices.contains(index) else { return }
    rows.remove(at: index)
    if rows.isEmpty { rows = [Row(word: Word(display: "", input: ""))] }
  }

  private func readFile(_ result: Result<URL, Error>) {
    errorMessage = nil
    do {
      let url = try result.get()
      guard let format = WordFileFormat(fileName: url.lastPathComponent) else { throw TypleError("importFileType") }
      let access = url.startAccessingSecurityScopedResource()
      defer { if access { url.stopAccessingSecurityScopedResource() } }
      let words = try parseWordData(try Data(contentsOf: url), format: format)
      if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { name = url.deletingPathExtension().lastPathComponent }
      if rows.contains(where: \.filled) { imported = words } else { add(words, replacing: true) }
    } catch {
      errorMessage = errorText(error)
    }
  }

  private func add(_ words: [Word], replacing: Bool) {
    let kept = replacing ? [] : rows.filter(\.filled)
    guard kept.count + words.count <= maxWords else {
      errorMessage = errorText(TypleError("importTooManyRows"))
      return
    }
    rows = kept + words.map { Row(word: Word(display: $0.display, input: $0.input == $0.display ? "" : $0.input, annotation: $0.annotation)) }
    imported = nil
  }

  private func save() {
    errorMessage = nil
    nameError = nil
    rowErrors = [:]
    // Empty rows at the end are ignored; a row with only a note or input must have its word filled in.
    var kept = rows
    while let last = kept.last, !last.filled, kept.count > 0 { kept.removeLast() }
    for row in kept {
      if row.word.display.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { rowErrors[row.id] = L("wordLists.editor.displayRequired") }
      else if !row.word.input.isEmpty && row.word.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { rowErrors[row.id] = L("wordLists.editor.inputBlank") }
    }
    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { nameError = errorText(TypleError("listNameRequired")) }
    guard rowErrors.isEmpty, nameError == nil else {
      errorMessage = L("wordLists.editor.errorCount", rowErrors.count + (nameError == nil ? 0 : 1))
      return
    }
    let list = WordList(id: original?.id ?? randomId(), name: name,
                        words: kept.map { Word(display: $0.word.display, input: $0.word.input.isEmpty ? $0.word.display : $0.word.input, annotation: $0.word.annotation) },
                        records: original?.records ?? [], createdAt: original?.createdAt ?? isoString(Date()),
                        // The iPad and Mac editors do not edit these yet, so they stay as saved.
                        category: original?.category, tags: original?.tags, group: original?.group, levels: original?.levels)
    saving = true
    Task {
      do {
        try await app.saveList(list, editing: original != nil)
        saved = (name, words)
        app.navigate(.lists)
      } catch {
        errorMessage = errorText(error)
      }
      saving = false
    }
  }
}
