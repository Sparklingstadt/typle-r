import SwiftUI
import TypleCore

/// Every record, newest first and grouped by day, filtered by list and device (src/app/(workspace)/records/page.tsx).
struct RecordsView: View {
  @Environment(AppModel.self) private var app
  @State private var listFilter: String?
  @State private var deviceFilter: String?
  @State private var deleting: RecordRow?
  @State private var errorMessage: String?

  var body: some View {
    let all = recordRows(app.lists)
    let rows = filterRows(all, list: listFilter, device: deviceFilter)
    let options = deviceOptions(all.filter { listFilter == nil || $0.list.id == listFilter }.map(\.record))
    List {
      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
      }
      ForEach(groupByDay(rows), id: \.day) { group in
        SwiftUI.Section {
          ForEach(group.rows) { row in
            RecordRowView(row: row)
              .swipeActions {
                if app.store.canDeleteRecords {
                  Button(role: .destructive) { deleting = row } label: { Label(L("common.delete"), systemImage: "trash") }
                }
              }
          }
        } header: {
          HStack {
            Text(Format.day(group.day))
            Spacer()
            Text(L("records.dayTotal", group.rows.count, Format.duration(group.seconds)))
          }
        }
      }
    }
    .overlay {
      if rows.isEmpty {
        ContentUnavailableView(all.isEmpty ? L("records.empty") : L("records.noMatch"), systemImage: "clock")
      }
    }
    .navigationTitle(L("nav.records"))
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Menu {
          Picker(L("records.filterList"), selection: $listFilter) {
            Text(L("records.allLists")).tag(String?.none)
            ForEach(app.lists) { list in Text(list.name).tag(String?.some(list.id)) }
          }
        } label: {
          Label(listFilter.flatMap { id in app.lists.first { $0.id == id }?.name } ?? L("records.allLists"), systemImage: "line.3.horizontal.decrease.circle")
        }
        Menu {
          Picker(L("records.filterDevice"), selection: $deviceFilter) {
            Text(L("records.allDevices")).tag(String?.none)
            ForEach(options, id: \.value) { option in
              Text(L("records.deviceOption", option.value == noDevice ? L("format.noDeviceRecorded") : Format.device(option.device), option.count))
                .tag(String?.some(option.value))
            }
          }
        } label: {
          Label(deviceFilter == nil ? L("records.allDevices") : L("records.filteredDevice"), systemImage: "keyboard")
        }
      }
    }
    .confirmationDialog(L("records.deleteTitle"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { row in
      Button(L("common.delete"), role: .destructive) { delete(row) }
    } message: { row in
      Text(L("records.deleteMessage", row.list.name, Format.date(row.record.date)))
    }
  }

  private func delete(_ row: RecordRow) {
    Task {
      do {
        errorMessage = nil
        try await app.deleteRecord(row.record, listId: row.list.id)
      } catch { errorMessage = errorText(error) }
    }
  }
}

struct RecordRowView: View {
  var row: RecordRow

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Text(Format.time(row.record.date)).font(.callout).monospacedDigit().foregroundStyle(.secondary).frame(minWidth: 52, alignment: .leading)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(row.list.name).font(.body.weight(.medium)).lineLimit(1)
          if row.best {
            Label(L("records.best"), systemImage: "trophy.fill").font(.caption.weight(.bold)).foregroundStyle(.orange).labelStyle(.titleAndIcon)
          }
        }
        Text(Format.device(row.record.device)).font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 3) {
        Text(Format.duration(row.record.time)).font(.body.weight(.medium)).monospacedDigit()
        HStack(spacing: 8) {
          Text(formatAccuracy(row.record.accuracy))
          if let mistakes = row.record.mistakes { Text(L("records.mistakes", mistakes)) }
          if let wordCount = row.record.wordCount { Text(L("records.words", wordCount)) }
        }
        .font(.caption).foregroundStyle(.secondary).monospacedDigit()
      }
    }
    .accessibilityElement(children: .combine)
  }
}
