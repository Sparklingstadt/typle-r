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
