package io.github.sparklingstadt.typle.devices

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import io.github.sparklingstadt.typle.LocalApp
import io.github.sparklingstadt.typle.Route
import io.github.sparklingstadt.typle.core.DEFAULT_DEVICE_ID
import io.github.sparklingstadt.typle.core.DeviceField
import io.github.sparklingstadt.typle.core.DeviceProblem
import io.github.sparklingstadt.typle.core.DeviceUsage
import io.github.sparklingstadt.typle.core.MAX_DEVICES
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.defaultDevice
import io.github.sparklingstadt.typle.core.deviceProblem
import io.github.sparklingstadt.typle.core.deviceUsage
import io.github.sparklingstadt.typle.core.parseDate
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.design.ButtonSize
import io.github.sparklingstadt.typle.design.ButtonText
import io.github.sparklingstadt.typle.design.ButtonVariant
import io.github.sparklingstadt.typle.design.ConfirmDialog
import io.github.sparklingstadt.typle.design.CountBadge
import io.github.sparklingstadt.typle.design.Glyph
import io.github.sparklingstadt.typle.design.IconTile
import io.github.sparklingstadt.typle.design.InputBox
import io.github.sparklingstadt.typle.design.PageHeader
import io.github.sparklingstadt.typle.design.PageScroll
import io.github.sparklingstadt.typle.design.Palette
import io.github.sparklingstadt.typle.design.Radius
import io.github.sparklingstadt.typle.design.StatusMessage
import io.github.sparklingstadt.typle.design.T
import io.github.sparklingstadt.typle.design.TypleButton
import io.github.sparklingstadt.typle.design.card
import io.github.sparklingstadt.typle.design.dashed
import io.github.sparklingstadt.typle.design.outlined
import io.github.sparklingstadt.typle.support.Format
import io.github.sparklingstadt.typle.support.L
import io.github.sparklingstadt.typle.support.errorText
import kotlinx.coroutines.launch

/**
 * The practice devices (src/app/(workspace)/devices/page.tsx): the device this tablet practises on, and the
 * registered ones, which can be added, changed and deleted here and, since v0.44.0, through the API too.
 */
@Composable
fun DevicesView() {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  var editing by remember { mutableStateOf<PracticeDevice?>(null) }
  var creating by remember { mutableStateOf(false) }
  var deleting by remember { mutableStateOf<PracticeDevice?>(null) }
  var message by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  val usage = deviceUsage(app.lists)
  val chosen = app.chosenPracticeDevice

  PageScroll(maxWidth = 832.dp) {
    PageHeader(L("devices.title"), L("devices.description"))
    message?.let { StatusMessage(it, failed) }
    Current(chosen)
    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
      T(L("devices.listHeading"), size = 16.sp, weight = FontWeight.Bold)
      if (app.devices.isNotEmpty()) CountBadge(L("devices.count", app.devices.size))
      Spacer(Modifier.weight(1f))
      if (app.devices.isNotEmpty()) {
        TypleButton({ creating = true }, size = ButtonSize.LG, enabled = app.devices.size < MAX_DEVICES) { ButtonText(L("devices.add"), Icons.Outlined.Add) }
      }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      DeviceRow(defaultDevice(app.defaultDeviceName), usage[DEFAULT_DEVICE_ID], chosen?.id == DEFAULT_DEVICE_ID, L("devices.defaultDetail"), null, null)
      for (device in app.devices) {
        DeviceRow(device, usage[device.id], chosen?.id == device.id, device.layout, { editing = device }, { deleting = device })
      }
      if (app.devices.isEmpty()) {
        Column(
          Modifier.fillMaxWidth().background(Palette.card, RoundedCornerShape(Radius.xl)).dashed(Palette.border, Radius.xl).padding(40.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          IconTile(Icons.Outlined.DesktopWindows, 48.dp)
          T(L("devices.empty.title"), size = 16.sp, weight = FontWeight.SemiBold)
          T(L("devices.empty.description"), Modifier.widthIn(max = 360.dp), color = Palette.mutedForeground, style = TextStyle(textAlign = TextAlign.Center))
          TypleButton({ creating = true }, size = ButtonSize.LG) { ButtonText(L("devices.add"), Icons.Outlined.Add) }
          T(L("devices.empty.example"), size = 12.sp, color = Palette.mutedForeground)
        }
      }
    }
  }

  if (creating) DeviceEditor(null, { creating = false }) { message = L("devices.added", it); failed = false }
  editing?.let { device -> DeviceEditor(device, { editing = null }) { message = L("devices.saved", it); failed = false } }
  deleting?.let { device ->
    val count = usage[device.id]?.count ?: 0
    ConfirmDialog(
      L("devices.deleteTitle", device.name),
      L("devices.deleteRemoval", device.name) + if (count > 0) L("devices.deleteRecords", count) else L("devices.deleteNoRecords"),
      L("common.delete.confirm"),
      onConfirm = {
        scope.launch {
          try {
            app.deleteDevice(device.id)
            failed = false
            message = L("devices.deleted", device.name)
          } catch (e: Exception) {
            failed = true
            message = errorText(e)
          }
        }
      },
      onDismiss = { deleting = null },
    )
  }
}

@Composable
private fun Current(chosen: PracticeDevice?) {
  val app = LocalApp.current
  var open by remember { mutableStateOf(false) }
  val name = chosen?.let { Format.device(it) } ?: L("devices.choice.notSelected")
  Column(Modifier.fillMaxWidth().card().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
      IconTile(Icons.Outlined.DesktopWindows)
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        T(L("devices.current.heading"), size = 12.sp, color = Palette.mutedForeground)
        T(name, size = 16.sp, weight = FontWeight.SemiBold)
      }
      Box {
        Row(
          Modifier.height(44.dp).background(Palette.card, RoundedCornerShape(Radius.md)).outlined(Radius.md)
            .clickable(role = Role.Button) { open = true }.semantics { contentDescription = L("devices.current.changeLabel", name) }
            .padding(horizontal = 16.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          T(L("devices.current.change"), weight = FontWeight.Medium)
          Glyph(Icons.Outlined.ExpandMore, size = 14.dp)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
          for (device in listOf(defaultDevice(app.defaultDeviceName)) + app.devices) {
            Choice(Format.device(device), device.id == chosen?.id) { open = false; app.chooseDevice(device.id) }
          }
          Choice(L("devices.none"), chosen == null) { open = false; app.chooseDevice("") }
        }
      }
      TypleButton({ app.navigate(Route.Practice) }, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) {
        ButtonText(L("devices.current.practice"), Icons.Outlined.Keyboard)
      }
    }
    T(if (chosen == null) L("devices.current.noteUnselected") else L("devices.current.noteSelected"), Modifier.padding(start = 56.dp),
      size = 13.sp, color = Palette.mutedForeground)
  }
}

@Composable
private fun Choice(title: String, selected: Boolean, onClick: () -> Unit) {
  DropdownMenuItem(
    text = { T(title, weight = if (selected) FontWeight.Medium else FontWeight.Normal) },
    leadingIcon = { Box(Modifier.size(16.dp)) { if (selected) Glyph(Icons.Outlined.Check) } },
    onClick = onClick,
  )
}

@Composable
private fun DeviceRow(
  device: PracticeDevice,
  usage: DeviceUsage?,
  chosen: Boolean,
  detail: String,
  onEdit: (() -> Unit)?,
  onDelete: (() -> Unit)?,
) {
  val app = LocalApp.current
  Row(
    Modifier.fillMaxWidth().card().clickable(role = Role.Button) { app.chooseDevice(device.id) }.semantics { selected = chosen }.padding(20.dp),
    horizontalArrangement = Arrangement.spacedBy(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    IconTile(Icons.Outlined.DesktopWindows)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        T(if (device.id == DEFAULT_DEVICE_ID) app.defaultDeviceName else device.name, size = 16.sp, weight = FontWeight.SemiBold)
        if (chosen) {
          Row(
            Modifier.height(22.dp).background(Palette.successSoft, CircleShape).border(1.dp, Palette.success.copy(alpha = 0.3f), CircleShape)
              .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Glyph(Icons.Outlined.Check, size = 11.dp, tint = Palette.success)
            T(L("devices.inUse"), size = 12.sp, weight = FontWeight.Medium, color = Palette.success)
          }
        }
      }
      if (detail.isNotEmpty()) T(detail, color = Palette.mutedForeground)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
      Glyph(Icons.Outlined.History, size = 12.dp, tint = Palette.mutedForeground)
      T(usage?.let { L("devices.usage", it.count, parseDate(it.lastUsed)?.let { day -> Format.day(day) } ?: "") } ?: L("devices.neverUsed"),
        size = 13.sp, color = Palette.mutedForeground)
    }
    if (onEdit != null) {
      TypleButton(onEdit, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("devices.editLabel", device.name)) { Glyph(Icons.Outlined.Edit) }
    }
    if (onDelete != null) {
      TypleButton(onDelete, variant = ButtonVariant.GHOST, size = ButtonSize.ICON, label = L("devices.deleteLabel", device.name)) {
        Glyph(Icons.Outlined.Delete, tint = Palette.mutedForeground)
      }
    }
  }
}

/** Adding or editing a device (the web app's device dialog). */
@Composable
private fun DeviceEditor(device: PracticeDevice?, onClose: () -> Unit, onSaved: (String) -> Unit) {
  val app = LocalApp.current
  val scope = rememberCoroutineScope()
  var name by remember { mutableStateOf(device?.name ?: "") }
  var layout by remember { mutableStateOf(device?.layout ?: "") }
  var use by remember { mutableStateOf(true) }
  var problem by remember { mutableStateOf<DeviceProblem?>(null) }
  var errorMessage by remember { mutableStateOf<String?>(null) }

  fun save() {
    val edited = PracticeDevice(device?.id ?: randomId(), name, layout)
    val found = deviceProblem(app.devices, edited, device != null, app.defaultDeviceName)
    problem = found
    errorMessage = found?.takeIf { it.field == DeviceField.FORM }?.let { errorText(it.error) }
    if (found != null) return
    scope.launch {
      try {
        app.saveDevice(edited, device != null)
        // The API gives a new device its own id, so the new device is found again by its name.
        val trimmed = edited.name.trim()
        if (device == null && use) app.devices.firstOrNull { it.name == trimmed }?.let { app.chooseDevice(it.id) }
        onSaved(trimmed)
        onClose()
      } catch (e: Exception) {
        errorMessage = errorText(e)
      }
    }
  }

  Dialog(onDismissRequest = onClose) {
    Column(Modifier.widthIn(max = 480.dp).fillMaxWidth().card().padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T(if (device == null) L("devices.dialog.addTitle") else L("devices.dialog.editTitle"), size = 18.sp, weight = FontWeight.SemiBold)
        T(if (device == null) L("devices.dialog.addDescription") else L("devices.dialog.editDescription"), color = Palette.mutedForeground)
      }
      Field(L("devices.dialog.name"), false, L("devices.dialog.namePlaceholder"), name, { name = it }, L("devices.dialog.nameHelp"),
        problem?.takeIf { it.field == DeviceField.NAME }?.let { errorText(it.error) })
      Field(L("devices.dialog.layout"), true, L("devices.dialog.layoutPlaceholder"), layout, { layout = it }, L("devices.dialog.layoutHelp"),
        problem?.takeIf { it.field == DeviceField.LAYOUT }?.let { errorText(it.error) })
      if (device == null) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
          Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(L("devices.dialog.use"), weight = FontWeight.Medium)
            T(L("devices.dialog.useHelp"), size = 12.sp, color = Palette.mutedForeground)
          }
          Switch(
            checked = use, onCheckedChange = { use = it },
            colors = SwitchDefaults.colors(checkedTrackColor = Palette.primary, checkedThumbColor = Palette.primaryForeground),
          )
        }
      }
      errorMessage?.let { T(it, size = 13.sp, color = Palette.destructive) }
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Spacer(Modifier.weight(1f))
        TypleButton(onClose, variant = ButtonVariant.OUTLINE, size = ButtonSize.LG) { ButtonText(L("common.form.cancel")) }
        TypleButton(::save, size = ButtonSize.LG) { ButtonText(if (device == null) L("common.form.add") else L("common.form.save")) }
      }
    }
  }
}

@Composable
private fun Field(label: String, optional: Boolean, placeholder: String, value: String, onChange: (String) -> Unit, help: String, error: String?) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
      T(label, weight = FontWeight.SemiBold)
      if (optional) T(L("devices.dialog.optional"), color = Palette.mutedForeground)
    }
    InputBox(value, onChange, Modifier.fillMaxWidth(), placeholder = placeholder, invalid = error != null)
    T(error ?: help, size = 12.sp, color = if (error == null) Palette.mutedForeground else Palette.destructive)
  }
}
