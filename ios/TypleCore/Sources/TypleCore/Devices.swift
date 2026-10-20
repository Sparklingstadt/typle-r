import Foundation

// src/core/devices.ts

public let maxDevices = 100
public let maxDeviceName = 100
public let maxDeviceLayout = 200

/// Every account has the built-in デフォルト device, which is practised on until another is chosen. It is not stored
/// with the registered devices, and its name is shown in the reader's language by this id.
public let defaultDeviceId = "default"

public func defaultDevice(name: String) -> PracticeDevice {
  PracticeDevice(id: defaultDeviceId, name: name, layout: "")
}

/// The device a stored choice names: none for 未選択 (""), and the built-in device when nothing was chosen yet (nil)
/// or the chosen device has since been deleted.
public func chosenDevice(_ devices: [PracticeDevice], id: String?, defaultName: String) -> PracticeDevice? {
  if id == "" { return nil }
  return devices.first { $0.id == id } ?? defaultDevice(name: defaultName)
}

/// Whether records on this device id still have a device to practise on, rather than a deleted one.
public func deviceExists(_ devices: [PracticeDevice], id: String) -> Bool {
  id == defaultDeviceId || devices.contains { $0.id == id }
}

public func isDevice(_ device: PracticeDevice) -> Bool {
  !device.id.isEmpty && device.id.jsLength <= 100 && !device.name.trimmed.isEmpty &&
    device.name.jsLength <= maxDeviceName && device.layout.jsLength <= maxDeviceLayout
}

public func decodeDevices(_ devices: [PracticeDevice]) throws -> [PracticeDevice] {
  if devices.count > maxDevices || !devices.allSatisfy(isDevice) || devices.contains(where: { $0.id == defaultDeviceId }) ||
    Set(devices.map(\.id)).count != devices.count { throw TypleError("deviceDataInvalid") }
  return devices.map { PracticeDevice(id: $0.id, name: $0.name.trimmed, layout: $0.layout.trimmed) }
}

public enum DeviceField: Sendable {
  case name, layout, form
}

public struct DeviceProblem: Equatable, Sendable {
  public var field: DeviceField
  public var error: TypleError
}

/// Explains why a device cannot be saved, in terms of the field to fix. `defaultName` is the built-in device's name
/// in the reader's language, which a registered device may not reuse.
public func deviceProblem(_ devices: [PracticeDevice], _ device: PracticeDevice, editing: Bool, defaultName: String = "") -> DeviceProblem? {
  let name = device.name.trimmed
  if name.isEmpty { return DeviceProblem(field: .name, error: TypleError("deviceNameRequired")) }
  if device.name.jsLength > maxDeviceName {
    return DeviceProblem(field: .name, error: TypleError("deviceNameTooLong", ["max": String(maxDeviceName)]))
  }
  if device.layout.jsLength > maxDeviceLayout {
    return DeviceProblem(field: .layout, error: TypleError("deviceLayoutTooLong", ["max": String(maxDeviceLayout)]))
  }
  if editing && !devices.contains(where: { $0.id == device.id }) { return DeviceProblem(field: .form, error: TypleError("deviceDeleted")) }
  if let same = devices.first(where: { $0.id != device.id && $0.name.lowercased() == name.lowercased() }) {
    return DeviceProblem(field: .name, error: TypleError("deviceNameDuplicate", ["name": same.name]))
  }
  if !defaultName.isEmpty && name.lowercased() == defaultName.lowercased() {
    return DeviceProblem(field: .name, error: TypleError("deviceNameDuplicate", ["name": defaultName]))
  }
  if !editing && devices.count >= maxDevices {
    return DeviceProblem(field: .form, error: TypleError("deviceLimit", ["max": String(maxDevices)]))
  }
  return nil
}

public func saveDevice(_ devices: [PracticeDevice], _ device: PracticeDevice, editing: Bool, defaultName: String = "") throws -> [PracticeDevice] {
  if let problem = deviceProblem(devices, device, editing: editing, defaultName: defaultName) { throw problem.error }
  let normalized = try decodeDevices([device])[0]
  return try decodeDevices(editing ? devices.map { $0.id == device.id ? normalized : $0 } : devices + [normalized])
}

public struct DeviceUsage: Equatable, Sendable {
  public var count: Int
  public var lastUsed: String
}

/// Records keep a snapshot of the device, so its id still links them after the device is renamed.
public func deviceUsage(_ lists: [WordList]) -> [String: DeviceUsage] {
  var usage: [String: DeviceUsage] = [:]
  for record in lists.flatMap(\.records) {
    guard let device = record.device else { continue }
    if let current = usage[device.id] {
      usage[device.id] = DeviceUsage(count: current.count + 1,
                                     lastUsed: timeOf(record.date) > timeOf(current.lastUsed) ? record.date : current.lastUsed)
    } else {
      usage[device.id] = DeviceUsage(count: 1, lastUsed: record.date)
    }
  }
  return usage
}
