import SwiftUI
import TypleCore

/// The best runs of each list (src/app/(workspace)/rankings/page.tsx). Rank 1 is the best every other screen shows.
struct RankingsView: View {
  @Environment(AppModel.self) private var app
  @State private var selected: String?
  @State private var order = RankOrder.accuracy
  @State private var sort = ListSort.recent
  @State private var includeOthers = false

  var body: some View {
    let rankings = sortRankings(app.lists.map { listRanking($0, order: order, includeOthers: includeOthers) }, sort: sort)
    let current = rankings.first { $0.list.id == selected } ?? rankings.first { !$0.records.isEmpty } ?? rankings.first
    HStack(spacing: 0) {
      List(rankings, selection: Binding(get: { current?.id }, set: { selected = $0 })) { ranking in
        VStack(alignment: .leading, spacing: 3) {
          HStack {
            Text(ranking.list.name).lineLimit(1)
            if ranking.improved { Image(systemName: "arrow.up.right").foregroundStyle(.green).accessibilityLabel(L("rankings.improved")) }
          }
          Text(ranking.best.map { L("rankings.bestSummary", Format.duration($0.time), formatAccuracy($0.accuracy)) } ?? L("rankings.noRecord"))
            .font(.caption).foregroundStyle(.secondary)
        }
        .tag(ranking.id)
      }
      .listStyle(.sidebar)
      .frame(width: 300)
      Divider()
      if let current {
        detail(current)
      } else {
        ContentUnavailableView(L("records.empty"), systemImage: "trophy")
      }
    }
    .navigationTitle(L("nav.rankings"))
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Picker(L("rankings.order"), selection: $order) {
          Text(L("rankings.order.accuracy")).tag(RankOrder.accuracy)
          Text(L("rankings.order.speed")).tag(RankOrder.speed)
        }
        .pickerStyle(.segmented)
      }
      ToolbarItem(placement: .secondaryAction) {
        Picker(L("rankings.sort"), selection: $sort) {
          ForEach(ListSort.allCases, id: \.self) { sort in Text(L("rankings.sort.\(sort.rawValue)")).tag(sort) }
        }
      }
    }
  }

  private func detail(_ ranking: ListRanking) -> some View {
    let stats = rankingStats(ranking.ranked)
    return List {
      SwiftUI.Section {
        HStack(spacing: 24) {
          figure(L("rankings.best"), ranking.best.map { Format.duration($0.time) } ?? "—")
          figure(L("rankings.recentTime", stats.recentCount), stats.recentTime.map(Format.duration) ?? "—")
          figure(L("rankings.recentAccuracy"), stats.recentAccuracy.map { formatAccuracy($0) } ?? "—")
        }
        .padding(.vertical, 6)
        if !ranking.others.isEmpty {
          Toggle(L("rankings.includeOthers", ranking.others.count), isOn: $includeOthers)
          if ranking.fallback && !includeOthers { Text(L("rankings.fallback", ranking.list.words.count)).font(.footnote).foregroundStyle(.secondary) }
        }
      } header: {
        Text(ranking.list.name)
      }
      SwiftUI.Section(L("rankings.ranked", ranking.ranked.count)) {
        if ranking.ranked.isEmpty {
          Text(L("practice.best.empty")).foregroundStyle(.secondary)
        }
        ForEach(Array(ranking.ranked.prefix(100).enumerated()), id: \.offset) { index, record in
          HStack(spacing: 12) {
            Text("\(index + 1)").font(.headline).monospacedDigit().frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
              Text(Format.duration(record.time)).font(.body.weight(.medium)).monospacedDigit()
              Text(Format.device(record.device)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
              Text(formatAccuracy(record.accuracy)).monospacedDigit()
              Text(Format.date(record.date)).font(.caption).foregroundStyle(.secondary)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
      SwiftUI.Section {
        Button { app.practice(listId: ranking.list.id) } label: { Label(L("lists.practice"), systemImage: "play") }
      }
    }
  }

  private func figure(_ term: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(term).font(.caption).foregroundStyle(.secondary)
      Text(value).font(.title3.weight(.semibold)).monospacedDigit()
    }
    .accessibilityElement(children: .combine)
  }
}
