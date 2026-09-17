# Force the desktop app to load the CURRENT plugin version on a client machine whose
# per-file watcher is dead.
#
# Why this dance: `scanDiskPlugins()` skips any plugin file it already knows by PATH
# (`if (disk.has(file)) continue`), and the palette command only runs that scan. So an
# edited plugin.js is never re-read while the app lives. Removing the folder makes the
# app unload it and drop its record; re-creating it makes the next scan see a brand-new
# plugin and import the file for real.
#
# Runs INSIDE the interactive session (scheduled task), like the other Hermes helpers.
param(
  [string]$Root = 'C:\Users\alsaba\AppData\Local\hermes\desktop-plugins',
  [string]$Id   = 'session-styler',
  [string]$Stage = 'C:\Users\alsaba\hermes\staged\session-styler',
  [int]$SettleSeconds = 18
)
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\alsaba\hermes\reload_plugin.log'
function W([string]$m) { Add-Content -Path $log -Value (("{0} {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m)) -Encoding utf8 }
Set-Content -Path $log -Value ('=== force-reload ' + $Id + ' at ' + (Get-Date -Format 'u') + ' ===') -Encoding utf8

$live = Join-Path $Root $Id
$stageFile = Join-Path $Stage 'plugin.js'

if (-not (Test-Path $stageFile)) { W ("NO_STAGED_FILE at " + $stageFile); exit 1 }
W ("staged version: " + ((Select-String -Path $stageFile -Pattern "const VERSION = '([^']+)'" | Select-Object -First 1).Matches.Groups[1].Value))

# 1) remove the live folder so the app unloads the plugin and forgets the path
if (Test-Path $live) {
  Remove-Item -Recurse -Force $live
  W 'live folder removed'
} else {
  W 'live folder was already absent'
}
Start-Sleep -Seconds $SettleSeconds

# 2) put the current build back under the canonical name
New-Item -ItemType Directory -Force -Path $live | Out-Null
Copy-Item (Join-Path $Stage 'plugin.js') (Join-Path $live 'plugin.js') -Force
if (Test-Path (Join-Path $Stage 'README.md')) { Copy-Item (Join-Path $Stage 'README.md') (Join-Path $live 'README.md') -Force }
$h = (Get-FileHash (Join-Path $live 'plugin.js') -Algorithm SHA256).Hash.ToLower()
$v = (Select-String -Path (Join-Path $live 'plugin.js') -Pattern "const VERSION = '([^']+)'" | Select-Object -First 1).Matches.Groups[1].Value
W ("live now: v" + $v + "  sha256 " + $h.Substring(0,16))
W 'DONE'
