# Shows every page of the app with its sample data (Demo.cs, --demo) and saves a screenshot of each window into
# windows/screenshots, to compare with the web app. Run it by hand on Windows.
param(
  [string]$App = 'windows/publish/Typle.exe',
  [string]$Out = 'windows/screenshots'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$App = (Resolve-Path $App).Path

# The runner's screen is small; a larger one keeps the whole 1280×820 window on it.
try { Set-DisplayResolution -Width 1920 -Height 1080 -Force } catch { Write-Host "Set-DisplayResolution: $_" }

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@

function Test-Blank([System.Drawing.Bitmap]$Bitmap) {
  # PrintWindow can give a black picture of a composed window; then the screen is copied instead.
  foreach ($x in 0.25, 0.5, 0.75) {
    foreach ($y in 0.25, 0.5, 0.75) {
      $pixel = $Bitmap.GetPixel([int]($Bitmap.Width * $x), [int]($Bitmap.Height * $y))
      if ($pixel.R -gt 8 -or $pixel.G -gt 8 -or $pixel.B -gt 8) { return $false }
    }
  }
  return $true
}

function Capture([string]$Name, [string[]]$Arguments = @(), [int]$Settle = 6) {
  Get-Process Typle -ErrorAction SilentlyContinue | Stop-Process -Force
  $process = Start-Process -FilePath $App -ArgumentList (@('--demo') + $Arguments) -PassThru
  for ($i = 0; $i -lt 60 -and $process.MainWindowHandle -eq 0 -and -not $process.HasExited; $i++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
  }
  if ($process.HasExited) { throw "$Name`: Typle exited with $($process.ExitCode)" }
  $window = $process.MainWindowHandle
  [Win32]::SetWindowPos($window, [IntPtr]::Zero, 0, 0, 0, 0, 0x0001 -bor 0x0004) | Out-Null  # SWP_NOSIZE | SWP_NOZORDER
  [Win32]::SetForegroundWindow($window) | Out-Null
  Start-Sleep -Seconds $Settle
  $rect = New-Object Win32+RECT
  [Win32]::GetWindowRect($window, [ref]$rect) | Out-Null
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $dc = $graphics.GetHdc()
  [Win32]::PrintWindow($window, $dc, 2) | Out-Null  # PW_RENDERFULLCONTENT
  $graphics.ReleaseHdc($dc)
  if (Test-Blank $bitmap) {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
  }
  $graphics.Dispose()
  $bitmap.Save((Join-Path $Out "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Host "$Name`: ${width}x$height"
  Stop-Process -Id $process.Id -Force
}

foreach ($route in 'home', 'practice', 'records', 'rankings', 'lists', 'createList', 'editList', 'general', 'devices') {
  Capture $route @('--route', $route, '--language', 'ja', '--theme', 'light')
}
Capture 'typing-practice' @('--route', 'practice', '--language', 'ja', '--theme', 'light', '--typing', 'hogefx') 12
Capture 'result-practice' @('--route', 'practice', '--language', 'ja', '--theme', 'light', '--typing', 'hogefoobar') 12
Capture 'detail-rankings' @('--route', 'rankings', '--language', 'ja', '--theme', 'light', '--rankings-list', 'sample-1')
Capture 'dark-practice' @('--route', 'practice', '--language', 'ja', '--theme', 'dark')
Capture 'en-practice' @('--route', 'practice', '--language', 'en', '--theme', 'light')

# Errors the screens did not expect are written here (App.Log).
$log = Join-Path $env:LOCALAPPDATA 'Typle\error.log'
if (Test-Path $log) {
  Write-Host '--- error.log ---'
  Get-Content $log
}
Get-ChildItem $Out
