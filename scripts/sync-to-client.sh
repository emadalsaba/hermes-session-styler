#!/usr/bin/env bash
# Copy the plugin to the machine(s) that run the Hermes Desktop app, over SSH,
# then verify each copy byte-for-byte.
#
#   ./scripts/sync-to-client.sh --host desktop \
#     --dest 'C:/Users/me/AppData/Local/hermes/desktop-plugins/session-styler'
#
#   ./scripts/sync-to-client.sh --all \
#     --dest 'C:/Users/me/AppData/Local/hermes/desktop-plugins/session-styler'
#
# --dest is the plugin folder ON THE CLIENT (created if missing) — the same path
# is used on every machine with --all, which fits Windows boxes that share the
# %LOCALAPPDATA%\hermes layout.
# --all walks the machine registry (default /opt/data/.hermes/browser_machines.json,
# override with --registry) and syncs to every non-local machine in it.
# Shell-agnostic: every remote step is tried POSIX-first, then via cmd.exe, and is
# accepted only when the OUTCOME proves it (a listing, a 64-hex hash). Never trust
# a probe: machines with Git in PATH answer `uname` but still run cmd.exe for ssh.
# Re-run after every Hermes update or plugin edit; it is idempotent.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$HERE/plugin.js"
HOST=""
DEST=""
ALL=0
REGISTRY="${HERMES_MACHINES:-/opt/data/.hermes/browser_machines.json}"

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    --all) ALL=1; shift ;;
    --registry) REGISTRY="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$SOURCE" ] || { echo "plugin.js not found ($SOURCE)" >&2; exit 1; }

SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes)

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
hex64() { printf '%s' "$1" | tr -d '\r' | grep -oiE '[0-9a-f]{64}' | head -1 | tr 'A-Z' 'a-z'; }

# Remote helpers — each returns success only when the OUTCOME is proven.
ensure_dir() {
  local host="$1" dest="$2" dest_win
  dest_win="$(printf '%s' "$dest" | tr '/' '\\')"
  ssh "${SSH_OPTS[@]}" "$host" "mkdir -p \"$dest\"" >/dev/null 2>&1
  if ssh "${SSH_OPTS[@]}" "$host" "cd \"$dest\" && echo OK" 2>/dev/null | grep -q OK; then return 0; fi
  ssh "${SSH_OPTS[@]}" "$host" "cmd /c md \"$dest_win\"" >/dev/null 2>&1
  ssh "${SSH_OPTS[@]}" "$host" "cmd /c cd \"$dest_win\" && echo OK" 2>/dev/null | grep -q OK
}

remote_hash() {
  local host="$1" dest="$2" dest_win raw value
  dest_win="$(printf '%s' "$dest" | tr '/' '\\')"
  raw="$(ssh "${SSH_OPTS[@]}" "$host" "sha256sum \"$dest/plugin.js\" 2>/dev/null || shasum -a 256 \"$dest/plugin.js\" 2>/dev/null" 2>/dev/null || true)"
  value="$(hex64 "$raw")"
  if [ -z "$value" ]; then
    raw="$(ssh "${SSH_OPTS[@]}" "$host" "certutil -hashfile \"$dest_win\\plugin.js\" SHA256" 2>/dev/null || true)"
    value="$(hex64 "$raw")"
  fi
  printf '%s' "$value"
}

sync_one() {
  local host="$1" dest="$2" local_hash remote_value
  echo "── $host → $dest"
  if ! ensure_dir "$host" "$dest"; then
    echo "   FAIL: cannot create/enter the target folder (check the ssh host and path)" >&2
    return 1
  fi
  if ! scp -q -o ConnectTimeout=10 "$SOURCE" "$host:$dest/plugin.js"; then
    echo "   FAIL: scp refused the copy" >&2
    return 1
  fi
  [ -f "$HERE/README.md" ] && scp -q -o ConnectTimeout=10 "$HERE/README.md" "$host:$dest/README.md" 2>/dev/null
  local_hash="$(hash_of "$SOURCE")"
  remote_value="$(remote_hash "$host" "$dest")"
  echo "   local  sha256: $local_hash"
  echo "   remote sha256: ${remote_value:-<unreadable>}"
  if [ -z "$remote_value" ] || [ "$local_hash" != "$remote_value" ]; then
    echo "   FAIL: the client copy does not match" >&2
    return 1
  fi
  echo "   verified: byte-identical"
  return 0
}

HOSTS=()
DESTS=()
if [ "$ALL" = "1" ]; then
  [ -f "$REGISTRY" ] || { echo "registry not found: $REGISTRY" >&2; exit 2; }
  while IFS=$'\t' read -r host label; do
    [ -n "$host" ] || continue
    HOSTS+=("$host"); DESTS+=("$DEST")
  done < <(python3 - "$REGISTRY" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for name, machine in (data.get('machines') or {}).items():
    if machine.get('local'):
        continue
    print(f"{machine.get('host') or name}\t{machine.get('label') or name}")
PY
  )
else
  [ -n "$HOST" ] || { echo "--host is required (an ssh host alias)" >&2; exit 2; }
  [ -n "$DEST" ] || { echo "--dest is required (the plugin folder on the client)" >&2; exit 2; }
  HOSTS=("$HOST"); DESTS=("$DEST")
fi

FAILED=0
for i in "${!HOSTS[@]}"; do
  sync_one "${HOSTS[$i]}" "${DESTS[$i]}" || FAILED=$((FAILED + 1))
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED of ${#HOSTS[@]} machine(s) FAILED" >&2
  exit 1
fi
echo "all ${#HOSTS[@]} machine(s) verified."
echo "Next: in each desktop app press Ctrl/Cmd+K → \"Reload desktop plugins\"."
echo "An edited file is hot-loaded within seconds, so re-running this script is usually enough."
