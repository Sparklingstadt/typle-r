import SwiftUI
import TypleCore

/// The practice devices (src/app/(workspace)/devices/page.tsx): the device this iPad practises on, and the registered
/// ones. Through the API, devices can be chosen but not changed.
struct DevicesView: View {
  @Environment(AppModel.self) private var app
  @State private var editing: PracticeDevice?
  @State private var creating = false
  @State private var deleting: PracticeDevice?
  @State private var message: String?
  @State private var failed = false

  var body: some View {
    let usage = deviceUsage(app.lists)
    let chosen = app.chosenPracticeDevice
    PageScroll(maxWidth: 832) {
      PageHeader(title: L("devices.title"), description: L("devices.description"))
      if let message {
        Label(message, systemImage: failed ? "exclamationmark.triangle" : "checkmark.circle")
          .font(.system(size: 14)).foregroundStyle(failed ? Palette.destructive : Palette.success)
      }
      current(chosen)
      HStack {
        Text(L("devices.listHeading")).font(.system(size: 16, weight: .bold))
        if !app.devices.isEmpty { CountBadge(text: L("devices.count", app.devices.count)) }
        Spacer()
        if !app.devices.isEmpty {
          Button { creating = true } label: { Label(L("devices.add"), systemImage: "plus") }
            .buttonStyle(.typle(.primary, size: .lg))
            .disabled(app.devices.count >= maxDevices)
        }
      }
      .padding(.top, 8)
      VStack(spacing: 12) {
        row(defaultDevice(name: app.defaultDeviceName), usage: usage[defaultDeviceId], chosen: chosen?.id == defaultDeviceId,
            detail: L("devices.defaultDetail"), editable: false)
        ForEach(app.devices) { device in
          row(device, usage: usage[device.id], chosen: chosen?.id == device.id, detail: device.layout, editable: true)
        }
        if app.devices.isEmpty { empty }
      }
    }
    .sheet(isPresented: $creating) { DeviceEditor(device: nil) { message = L("devices.added", $0); failed = false } }
    .sheet(item: $editing) { device in DeviceEditor(device: device) { message = L("devices.saved", $0); failed = false } }
    .confirmationDialog(deleting.map { L("devices.deleteTitle", $0.name) } ?? "", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { device in
      Button(L("common.delete.confirm"), role: .destructive) { delete(device) }
    } message: { device in
      let count = usage[device.id]?.count ?? 0
      Text(L("devices.deleteRemoval", device.name) + (count > 0 ? L("devices.deleteRecords", count) : L("devices.deleteNoRecords")))
    }
  }

  private func current(_ chosen: PracticeDevice?) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 16) {
        IconTile(systemName: "desktopcomputer")
        VStack(alignment: .leading, spacing: 2) {
          Text(L("devices.current.heading")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
          Text(chosen.map { Format.device($0) } ?? L("devices.choice.notSelected")).font(.system(size: 16, weight: .semibold))
        }
        Spacer()
        Menu {
          ForEach([defaultDevice(name: app.defaultDeviceName)] + app.devices) { device in
            Button { app.chooseDevice(device.id) } label: {
              if device.id == chosen?.id { Label(Format.device(device), systemImage: "checkmark") } else { Text(Format.device(device)) }
            }
          }
          Button { app.chooseDevice("") } label: {
            if chosen == nil { Label(L("devices.none"), systemImage: "checkmark") } else { Text(L("devices.none")) }
          }
        } label: {
          HStack(spacing: 6) { Text(L("devices.current.change")); Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)) }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Palette.foreground)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
            .outlined(radius: Radius.md)
        }
        .plainMenu()
        .accessibilityLabel(L("devices.current.changeLabel", chosen.map { Format.device($0) } ?? L("devices.choice.notSelected")))
        Button { app.navigate(.practice) } label: { Label(L("devices.current.practice"), systemImage: "keyboard") }
          .buttonStyle(.typle(.outline, size: .lg))
      }
      Text(chosen == nil ? L("devices.current.noteUnselected") : L("devices.current.noteSelected"))
        .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
        .padding(.leading, 56)
    }
    .padding(20)
    .card()
  }

  private func row(_ device: PracticeDevice, usage: DeviceUsage?, chosen: Bool, detail: String, editable: Bool) -> some View {
    HStack(spacing: 16) {
      IconTile(systemName: "desktopcomputer")
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(device.id == defaultDeviceId ? app.defaultDeviceName : device.name).font(.system(size: 16, weight: .semibold))
          if chosen {
            HStack(spacing: 3) { Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)); Text(L("devices.inUse")) }
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(Palette.success)
              .padding(.horizontal, 8)
              .frame(height: 22)
              .background(Palette.successSoft, in: Capsule())
              .overlay(Capsule().strokeBorder(Palette.success.opacity(0.3)))
          }
        }
        if !detail.isEmpty { Text(detail).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground) }
      }
      Spacer()
      HStack(spacing: 4) {
        Image(systemName: "clock.arrow.circlepath").font(.system(size: 11))
        Text(usage.map { L("devices.usage", $0.count, parseDate($0.lastUsed).map { Format.day($0) } ?? "") } ?? L("devices.neverUsed"))
      }
      .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
      if editable {
        Button { editing = device } label: { Image(systemName: "pencil").font(.system(size: 14)) }
          .buttonStyle(.typle(.ghost, size: .icon))
          .accessibilityLabel(L("devices.editLabel", device.name))
        Button { deleting = device } label: { Image(systemName: "trash").font(.system(size: 14)) }
          .buttonStyle(.typle(.ghost, size: .icon))
          .foregroundStyle(Palette.mutedForeground)
          .accessibilityLabel(L("devices.deleteLabel", device.name))
      }
    }
    .padding(20)
    .card()
    .contentShape(Rectangle())
    .onTapGesture { app.chooseDevice(device.id) }
    .accessibilityAddTraits(chosen ? .isSelected : [])
  }

  private var empty: some View {
    VStack(spacing: 12) {
      IconTile(systemName: "desktopcomputer", size: 48)
      Text(L("devices.empty.title")).font(.system(size: 16, weight: .semibold))
      Text(L("devices.empty.description")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).multilineTextAlignment(.center).frame(maxWidth: 360)
      Button { creating = true } label: { Label(L("devices.add"), systemImage: "plus") }.buttonStyle(.typle(.primary, size: .lg))
      Text(L("devices.empty.example")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
    }
    .frame(maxWidth: .infinity)
    .padding(40)
    .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
  }

  private func delete(_ device: PracticeDevice) {
    Task {
      do {
        try await app.deleteDevice(id: device.id)
        failed = false
        message = L("devices.deleted", device.name)
      } catch {
        failed = true
        message = errorText(error)
      }
    }
  }
}

/// Adding or editing a device (the web app's device dialog).
struct DeviceEditor: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let device: PracticeDevice?
  var onSaved: (String) -> Void
  @State private var name = ""
  @State private var layout = ""
  @State private var use = true
  @State private var problem: DeviceProblem?
  @State private var errorMessage: String?
  @State private var loaded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 6) {
        Text(device == nil ? L("devices.dialog.addTitle") : L("devices.dialog.editTitle")).font(.system(size: 18, weight: .semibold))
        Text(device == nil ? L("devices.dialog.addDescription") : L("devices.dialog.editDescription")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      }
      field(L("devices.dialog.name"), optional: false, placeholder: L("devices.dialog.namePlaceholder"), text: $name,
            help: L("devices.dialog.nameHelp"), error: problem?.field == .name ? problem.map { errorText($0.error) } : nil)
      field(L("devices.dialog.layout"), optional: true, placeholder: L("devices.dialog.layoutPlaceholder"), text: $layout,
            help: L("devices.dialog.layoutHelp"), error: problem?.field == .layout ? problem.map { errorText($0.error) } : nil)
      if device == nil {
        Toggle(isOn: $use) {
          VStack(alignment: .leading, spacing: 2) {
            Text(L("devices.dialog.use")).font(.system(size: 14, weight: .medium))
            Text(L("devices.dialog.useHelp")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
          }
        }
        .tint(Palette.primary)
      }
      if let errorMessage { Text(errorMessage).font(.system(size: 13)).foregroundStyle(Palette.destructive) }
      HStack {
        Spacer()
        Button(L("common.form.cancel")) { dismiss() }.buttonStyle(.typle(.outline, size: .lg))
        Button(device == nil ? L("common.form.add") : L("common.form.save")) { save() }.buttonStyle(.typle(.primary, size: .lg))
      }
    }
    .padding(24)
    .background(Palette.card)
    .sheetSize(width: 480)
    .presentationDetents([.medium])
    .onAppear {
      guard !loaded else { return }
      loaded = true
      name = device?.name ?? ""
      layout = device?.layout ?? ""
    }
  }

  private func field(_ label: String, optional: Bool, placeholder: String, text: Binding<String>, help: String, error: String?) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 2) {
        Text(label).font(.system(size: 14, weight: .semibold))
        if optional { Text(L("devices.dialog.optional")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground) }
      }
      InputBox(placeholder: placeholder, text: text, invalid: error != nil)
      Text(error ?? help).font(.system(size: 12)).foregroundStyle(error == nil ? Palette.mutedForeground : Palette.destructive)
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
        if device == nil && use { app.chooseDevice(edited.id) }
        onSaved(edited.name.trimmingCharacters(in: .whitespacesAndNewlines))
        dismiss()
      } catch { errorMessage = errorText(error) }
    }
  }
}
