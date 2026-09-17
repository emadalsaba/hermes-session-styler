# Runs INSIDE the interactive user session (via an interactive scheduled task) and
# invokes the Hermes desktop palette command "Reload desktop plugins".
#
# Why: a packaged build exposes no CDP port, and a plugin folder that appeared after
# the app booted is not always noticed by the renderer's directory watch. The palette
# command is the app's own, only reliable trigger — this script presses it for the user.
#
# Safety: it never presses Enter unless it has SEEN the command's list item in the UI
# Automation tree first; otherwise it closes the palette and reports, so no stray text
# can reach the chat composer.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@ -Name W -Namespace Native

$log = 'C:\Users\alsaba\hermes\plugins_reload.log'
function W([string]$m) { Add-Content -Path $log -Value (("{0} {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m)) -Encoding utf8 }
Set-Content -Path $log -Value ('=== reload requested ' + (Get-Date -Format 'u') + ' ===') -Encoding utf8

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

function Get-HermesWindow {
  $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'Chrome_WidgetWin_1')
  $wins = $AE::RootElement.FindAll($TS::Children, $cond)
  W ("electron windows: " + $wins.Count)
  foreach ($w in $wins) {
    $n = $w.Current.Name
    $h = $w.Current.NativeWindowHandle
    if (-not $h) { continue }
    W ("  window '$n' hwnd=$h")
    # the main window is the one with a menu/command surface — accept the largest titled one
    if ($n -and $n -notmatch 'pet|overlay|DevTools|quick') { return $w }
  }
  return $null
}

$win = Get-HermesWindow
if (-not $win) { W 'NO_WINDOW'; exit 1 }

try {
  $native = $win.Current.NativeWindowHandle
  [void][Native.W]::ShowWindow([IntPtr]$native, 9)   # SW_RESTORE
  [void][Native.W]::SetForegroundWindow([IntPtr]$native)
  Start-Sleep -Milliseconds 600
  W ('foreground now: ' + ([Native.W]::GetForegroundWindow() -eq [IntPtr]$native))
} catch { W ("focus failed: " + $_.Exception.Message) }

# open the command palette
[System.Windows.Forms.SendKeys]::SendWait('^k')
Start-Sleep -Milliseconds 900

function Find-ByName([string]$pattern) {
  $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
  $items = $AE::RootElement.FindAll($TS::Descendants, $cond)
  foreach ($it in $items) {
    if ($it.Current.Name -match $pattern) { return $it }
  }
  return $null
}

$item = Find-ByName 'reload desktop plugins'
W ('palette item found before typing: ' + [bool]$item)

if (-not $item) {
  # narrow the list, then look again
  [System.Windows.Forms.SendKeys]::SendWait('reload desktop plugins')
  Start-Sleep -Milliseconds 900
  $item = Find-ByName 'reload desktop plugins'
  W ('palette item found after typing: ' + [bool]$item)
}

if (-not $item) {
  W 'ITEM_NOT_FOUND — closing the palette, nothing was executed'
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
  exit 2
}

$how = ''
try {
  $ip = $item.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $ip.Invoke(); $how = 'invoke-pattern'
} catch { }
if (-not $how) {
  try {
    $lp = $item.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern)
    $lp.DoDefaultAction(); $how = 'legacy-action'
  } catch { }
}
if (-not $how) {
  # fall back to the keyboard: the top match is this item because the query is its label
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  $how = 'enter'
}
W ('reload invoked via ' + $how + ' — item name: ' + $item.Current.Name)
Start-Sleep -Milliseconds 800
W 'DONE'
