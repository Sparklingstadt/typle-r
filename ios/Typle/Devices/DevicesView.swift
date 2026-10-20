import SwiftUI
import TypleCore

/// The practice devices (src/app/(workspace)/devices/page.tsx). Tapping one chooses it for practice on this iPad.
/// Through the API, devices can be chosen but not changed.
struct DevicesView: View {
  @Environment(AppModel.self) private var app
  @State private var editing: PracticeDevice?
  @State private var creating = false
  @State private var deleting: PracticeDevice?
  @State private var errorMessage: String?

  var body: some View {
    let usage = deviceUsage(app.lists)
    let chosen = app.chosenPracticeDevice?.id ?? ""
    List {
      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
      }
      SwiftUI.Section {
        row(defaultDevice(name: app.defaultDeviceName), usage: usage[defaultDeviceId], chosen: chosen == defaultDeviceId, editable: false)
        ForEach(app.devices) { device in
          row(device, usage: usage[device.id], chosen: chosen == device.id, editable: app.store.canEditDevices)
        }
        Button { app.chooseDevice("") } label: {
          HStack {
            Text(L("devices.none"))
            Spacer()
            if chosen.isEmpty { Image(systemName: "checkmark").foregroundStyle(.tint) }
          }
        }
        .foregroundStyle(.primary)
      } header: {
        Text(L("devices.listTitle"))
      } footer: {
        Text(app.store.canEditDevices ? L("devices.footer") : L("devices.readOnly"))
      }
    }
    .navigationTitle(L("nav.devices"))
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { creating = true } label: { Label(L("devices.add"), systemImage: "plus") }
          .disabled(!app.store.canEditDevices || app.devices.count >= maxDevices)
      }
    }
    .sheet(isPresented: $creating) { DeviceEditor(device: nil) }
    .sheet(item: $editing) { device in DeviceEditor(device: device) }
    .confirmationDialog(L("devices.deleteTitle"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { device in
      Button(L("common.delete"), role: .destructive) { delete(device) }
    } message: { device in
      Text(L("devices.deleteMessage", device.name))
    }
  }

  private func row(_ device: PracticeDevice, usage: DeviceUsage?, chosen: Bool, editable: Bool) -> some View {
    Button { app.chooseDevice(device.id) } label: {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(device.id == defaultDeviceId ? app.defaultDeviceName : device.name).font(.body.weight(.medium))
          if !device.layout.isEmpty { Text(device.layout).font(.caption).foregroundStyle(.secondary) }
          Text(usage.map { L("devices.usage", $0.count, Format.date($0.lastUsed)) } ?? L("devices.unused"))
            .font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        if chosen { Label(L("devices.inUse"), systemImage: "checkmark").labelStyle(.iconOnly).foregroundStyle(.tint) }
      }
      .contentShape(Rectangle())
    }
    .foregroundStyle(.primary)
    .accessibilityAddTraits(chosen ? .isSelected : [])
    .swipeActions {
      if editable {
        Button(role: .destructive) { deleting = device } label: { Label(L("common.delete"), systemImage: "trash") }
        Button { editing = device } label: { Label(L("common.edit"), systemImage: "pencil") }
      }
    }
    .contextMenu {
      if editable {
        Button { editing = device } label: { Label(L("common.edit"), systemImage: "pencil") }
        Button(role: .destructive) { deleting = device } label: { Label(L("common.delete"), systemImage: "trash") }
      }
    }
  }

  private func delete(_ device: PracticeDevice) {
    Task {
      do {
        errorMessage = nil
        try await app.deleteDevice(id: device.id)
      } catch { errorMessage = errorText(error) }
    }
  }
}

struct DeviceEditor: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let device: PracticeDevice?
  @State private var name = ""
  @State private var layout = ""
  @State private var problem: DeviceProblem?
  @State private var errorMessage: String?
  @State private var loaded = false

  var body: some View {
    NavigationStack {
      Form {
        SwiftUI.Section {
          TextField(L("devices.name"), text: $name)
          if let problem, problem.field == .name { Text(errorText(problem.error)).font(.footnote).foregroundStyle(.red) }
          TextField(L("devices.layout"), text: $layout)
          if let problem, problem.field == .layout { Text(errorText(problem.error)).font(.footnote).foregroundStyle(.red) }
        } footer: {
          Text(L("devices.layoutHint"))
        }
        if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
      }
      .navigationTitle(device == nil ? L("devices.add") : L("devices.edit"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button(L("common.cancel")) { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button(L("common.save")) { save() } }
      }
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      name = device?.name ?? ""
      layout = device?.layout ?? ""
    }
  }

  private func save() {
    let edited = PracticeDevice(id: device?.id ?? randomId(), name: name, layout: layout)
    problem = deviceProblem(app.devices, edited, editing: device != nil, defaultName: app.defaultDeviceName)
    errorMessage = problem?.field == .form ? problem.map { errorText($0.error) } : nil
    guard problem == nil else { return }
    Task {
      do {
        try await app.saveDevice(edited, editing: device != nil)
        dismiss()
      } catch { errorMessage = errorText(error) }
    }
  }
}
