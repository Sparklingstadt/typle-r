package io.github.sparklingstadt.typle.core

// src/core/devices.ts

const val MAX_DEVICES = 100
const val MAX_DEVICE_NAME = 100
const val MAX_DEVICE_LAYOUT = 200

fun isDevice(device: PracticeDevice): Boolean =
  device.id.isNotEmpty() && device.id.length <= 100 && device.name.trimmed.isNotEmpty() &&
    device.name.length <= MAX_DEVICE_NAME && device.layout.length <= MAX_DEVICE_LAYOUT

fun decodeDevices(devices: List<PracticeDevice>): List<PracticeDevice> {
  if (devices.size > MAX_DEVICES || !devices.all(::isDevice) || devices.any { it.id == DEFAULT_DEVICE_ID } ||
    devices.map { it.id }.toSet().size != devices.size) throw TypleException("deviceDataInvalid")
  return devices.map { PracticeDevice(id = it.id, name = it.name.trimmed, layout = it.layout.trimmed) }
}

/**
 * Every account has the built-in デフォルト device, which is practised on until another is chosen. It is not stored
 * with the registered devices, and its name is shown in the reader's language by this id.
 */
const val DEFAULT_DEVICE_ID = "default"

fun defaultDevice(name: String): PracticeDevice = PracticeDevice(id = DEFAULT_DEVICE_ID, name = name, layout = "")

/**
 * The device a stored choice names: none for 未選択 (""), and the built-in device when nothing was chosen yet (null)
 * or the chosen device has since been deleted.
 */
fun chosenDevice(devices: List<PracticeDevice>, id: String?, defaultName: String): PracticeDevice? {
  if (id == "") return null
  return devices.firstOrNull { it.id == id } ?: defaultDevice(defaultName)
}

/** Whether records on this device id still have a device to practise on, rather than a deleted one. */
fun deviceExists(devices: List<PracticeDevice>, id: String): Boolean = id == DEFAULT_DEVICE_ID || devices.any { it.id == id }

enum class DeviceField { NAME, LAYOUT, FORM }

data class DeviceProblem(val field: DeviceField, val error: TypleException)

/**
 * Explains why a device cannot be saved, in terms of the field to fix. `defaultName` is the built-in device's name
 * in the reader's language, which a registered device may not reuse.
 */
fun deviceProblem(devices: List<PracticeDevice>, device: PracticeDevice, editing: Boolean, defaultName: String = ""): DeviceProblem? {
  val name = device.name.trimmed
  if (name.isEmpty()) return DeviceProblem(DeviceField.NAME, TypleException("deviceNameRequired"))
  if (device.name.length > MAX_DEVICE_NAME) {
    return DeviceProblem(DeviceField.NAME, TypleException("deviceNameTooLong", mapOf("max" to MAX_DEVICE_NAME.toString())))
  }
  if (device.layout.length > MAX_DEVICE_LAYOUT) {
    return DeviceProblem(DeviceField.LAYOUT, TypleException("deviceLayoutTooLong", mapOf("max" to MAX_DEVICE_LAYOUT.toString())))
  }
  if (editing && devices.none { it.id == device.id }) return DeviceProblem(DeviceField.FORM, TypleException("deviceDeleted"))
  devices.firstOrNull { it.id != device.id && it.name.lowercase() == name.lowercase() }?.let {
    return DeviceProblem(DeviceField.NAME, TypleException("deviceNameDuplicate", mapOf("name" to it.name)))
  }
  if (defaultName.isNotEmpty() && name.lowercase() == defaultName.lowercase()) {
    return DeviceProblem(DeviceField.NAME, TypleException("deviceNameDuplicate", mapOf("name" to defaultName)))
  }
  if (!editing && devices.size >= MAX_DEVICES) {
    return DeviceProblem(DeviceField.FORM, TypleException("deviceLimit", mapOf("max" to MAX_DEVICES.toString())))
  }
  return null
}

fun saveDevice(devices: List<PracticeDevice>, device: PracticeDevice, editing: Boolean, defaultName: String = ""): List<PracticeDevice> {
  deviceProblem(devices, device, editing, defaultName)?.let { throw it.error }
  val normalized = decodeDevices(listOf(device))[0]
  return decodeDevices(if (editing) devices.map { if (it.id == device.id) normalized else it } else devices + normalized)
}

data class DeviceUsage(val count: Int, val lastUsed: String)

/** Records keep a snapshot of the device, so its id still links them after the device is renamed. */
fun deviceUsage(lists: List<WordList>): Map<String, DeviceUsage> {
  val usage = mutableMapOf<String, DeviceUsage>()
  for (record in lists.flatMap { it.records }) {
    val device = record.device ?: continue
    val current = usage[device.id]
    usage[device.id] = if (current == null) DeviceUsage(1, record.date)
    else DeviceUsage(current.count + 1, if (timeOf(record.date) > timeOf(current.lastUsed)) record.date else current.lastUsed)
  }
  return usage
}
