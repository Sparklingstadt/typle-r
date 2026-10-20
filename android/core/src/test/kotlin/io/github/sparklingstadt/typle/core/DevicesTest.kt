package io.github.sparklingstadt.typle.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DevicesTest {
  @Test fun deviceProblems() {
    val devices = listOf(PracticeDevice(id = "a", name = "HHKB"))
    assertEquals("deviceNameRequired", deviceProblem(devices, PracticeDevice(id = "b", name = " "), editing = false)?.error?.key)
    assertEquals(TypleException("deviceNameDuplicate", mapOf("name" to "HHKB")),
      deviceProblem(devices, PracticeDevice(id = "b", name = "hhkb"), editing = false)?.error)
    assertEquals(DeviceField.NAME, deviceProblem(devices, PracticeDevice(id = "b", name = "デフォルト"), editing = false, defaultName = "デフォルト")?.field)
    assertEquals("deviceDeleted", deviceProblem(devices, PracticeDevice(id = "z", name = "X"), editing = true)?.error?.key)
    assertEquals(PracticeDevice(id = "b", name = "Tab", layout = "JIS"),
      saveDevice(devices, PracticeDevice(id = "b", name = " Tab ", layout = " JIS "), editing = false).last())
    assertNull(chosenDevice(devices, "", "D"))
    assertEquals(DEFAULT_DEVICE_ID, chosenDevice(devices, null, "D")?.id)
    assertEquals(DEFAULT_DEVICE_ID, chosenDevice(devices, "gone", "D")?.id)
    assertEquals("HHKB", chosenDevice(devices, "a", "D")?.name)
  }

  @Test fun usageFollowsTheDeviceIdAndNewestDate() {
    val device = PracticeDevice(id = "d", name = "Tab")
    val lists = listOf(WordList(id = "l", name = "L", words = listOf(Word("a", "a")), createdAt = "2026-01-01", records = listOf(
      StoredRecord(time = 1.0, date = "2026-01-02T00:00:00.000Z", device = device),
      StoredRecord(time = 1.0, date = "2026-01-03T00:00:00.000Z", device = device.copy(name = "Renamed")),
      StoredRecord(time = 1.0, date = "2026-01-01T00:00:00.000Z", device = device),
    )))
    assertEquals(mapOf("d" to DeviceUsage(count = 3, lastUsed = "2026-01-03T00:00:00.000Z")), deviceUsage(lists))
  }
}
