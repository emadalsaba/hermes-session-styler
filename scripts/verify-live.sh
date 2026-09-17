#!/usr/bin/env bash
# Verify session-styler LIVE on the personal machine, without touching its UI:
#   1. the file the app would load (version + hash), 2. the app's own local-storage
#   record of having loaded it, 3. the profile mirror on this server.
set -uo pipefail
HOST="${1:-desktop}"
EXPECTED_SHA="$(sha256sum /opt/data/profiles/system-update/desktop-plugins/session-styler/plugin.js | cut -d' ' -f1)"

echo "── local plugin file ─────────────────────────────────────────────"
printf '   sha256 %s\n' "$EXPECTED_SHA"

probe=$(mktemp /tmp/verify-styler.XXXX.ps1)
cat > "$probe" <<'PS1'
$ErrorActionPreference='SilentlyContinue'
$plug='C:\Users\alsaba\AppData\Local\hermes\desktop-plugins\session-styler\plugin.js'
$ls='C:\Users\alsaba\AppData\Roaming\Hermes\Local Storage\leveldb'
Write-Output ("file      : v" + (Select-String -Path $plug -Pattern "const VERSION = '([^']+)'" | Select-Object -First 1).Matches.Groups[1].Value +
              "  sha256 " + (Get-FileHash $plug -Algorithm SHA256).Hash.ToLower())
Write-Output ("app since : " + ((Get-Process Hermes | Sort-Object StartTime | Select-Object -First 1).StartTime.ToString('u')))
$stamp = $null; $keys = @{}
foreach ($f in Get-ChildItem $ls -File) {
  $s=[System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($f.FullName))
  if ($s.Contains('session-styler')) { $keys['plugin keys'] = $f.Name }
  $i=$s.IndexOf('"version"'); if ($i -ge 0 -and $s.Contains('lastLoad')) {
    $j=$s.LastIndexOf('lastLoad',$i)
    $k=$s.IndexOf('}', $i)
    if ($j -ge 0 -and $k -gt $i) { $stamp = $s.Substring($j, [Math]::Min(400, $k-$j+1)) }
  }
}
if ($keys.Count -eq 0) { Write-Output "storage   : NO plugin keys → the running app has not loaded the plugin (needs palette reload / restart)" }
else { $keys.GetEnumerator() | ForEach-Object { Write-Output ("storage   : " + $_.Key + " present in " + $_.Value) } }
if ($stamp) { Write-Output ("stamp     : " + $stamp) } else { Write-Output "stamp     : not written yet" }
Write-Output "DONE"
PS1
scp -q -o ConnectTimeout=10 "$probe" "$HOST:C:/Users/alsaba/verify-styler.ps1" && \
  timeout 200 ssh "$HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\alsaba\\verify-styler.ps1"
rm -f "$probe"

echo "── profile mirror on this server (ui_meta['session-styler']) ─────"
python3 - <<'PY'
import glob, re, json
found = False
for f in sorted(glob.glob('/opt/data/profiles/*/profile.yaml')):
    txt = open(f, encoding='utf-8').read()
    if 'session-styler' not in txt:
        continue
    found = True
    block = txt[txt.index('session-styler'):]
    uid = re.search(r'updatedAt:\s*(\d+)', block)
    ver = re.search(r'version:\s*([\w.\-]+)', block)
    lv  = re.search(r'lastLoad:[\s\S]{0,400}?version:\s*([\w.\-]+)', block)
    ov  = re.search(r'sessionOverrides:([\s\S]{0,300})', block)
    print(f'   {f}')
    print(f'     mirrored version : {ver.group(1) if ver else "?"}')
    print(f'     last load (stamp): {lv.group(1) if lv else "none"}')
    print(f'     updatedAt        : {uid.group(1) if uid else "?"}')
    print(f'     overrides        : {(ov.group(1).strip()[:180] if ov else "")!r}')
    for beacon in re.finditer(r'(session-styler\.load\.[\w.]+):\n((?: {4,}\S.*\n)+)', txt):
        name, block = beacon.group(1), beacon.group(2)
        ver = re.search(r'version:\s*([\w.\-]+)', block)
        rows = re.search(r'rows:\s*(\d+)', block)
        icons = re.search(r'icons:\s*(\d+)', block)
        at = re.search(r"at:\s*'?([^'\n]+)'?", block)
        hook = re.search(r'hook:\s*\'?\"?([^\n\'"]+)', block)
        print(f'     load beacon      : {name}')
        print(f'        v{ver.group(1) if ver else "?"} · rows {rows.group(1) if rows else "?"} · icons {icons.group(1) if icons else "?"} · at {at.group(1) if at else "?"}')
        print(f'        hook           : {hook.group(1).strip() if hook else "?"}')
if not found:
    print('   nothing mirrored yet — no machine has pushed its settings to the profile')
PY
