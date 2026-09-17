# Capture the Hermes desktop window on the CLIENT machine (runs inside the interactive
# session via a scheduled task, like the other Hermes*.ps1 helpers).
#   powershell -File capture_client_window.ps1 [-OutName shot.png]
param([string]$OutName = 'hermes_window.png')
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@ -Name U -Namespace W

$dir = 'C:\Users\alsaba\hermes'
$out = Join-Path $dir $OutName
[void][W.U]::SetProcessDPIAware()

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$cond = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'Chrome_WidgetWin_1')
$target = $null
foreach ($w in $AE::RootElement.FindAll($TS::Children, $cond)) {
  $n = ''
  try { $n = $w.Current.Name } catch {}
  if ($w.Current.NativeWindowHandle -and $n -and $n -notmatch 'pet|overlay|DevTools|quick|Google|Chrome') { $target = $w; break }
}

if (-not $target) { 'NO_WINDOW' | Out-File (Join-Path $dir 'capture.log') -Encoding utf8; exit 1 }

$h = [IntPtr]$target.Current.NativeWindowHandle
[void][W.U]::ShowWindow($h, 9)     # restore if minimised
[void][W.U]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 900

$r = $target.Current.BoundingRectangle
$w0 = [int][Math]::Max(1, $r.Width)
$h0 = [int][Math]::Max(1, $r.Height)
$bmp = New-Object System.Drawing.Bitmap($w0, $h0)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen([int]$r.X, [int]$r.Y, 0, 0, (New-Object System.Drawing.Size($w0, $h0)))
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
("captured '{0}' {1}x{2} at {3},{4} -> {5}" -f $target.Current.Name, $w0, $h0, [int]$r.X, [int]$r.Y, $out) |
  Out-File (Join-Path $dir 'capture.log') -Encoding utf8
