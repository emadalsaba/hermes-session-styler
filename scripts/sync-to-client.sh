#!/usr/bin/env bash
# Copy the plugin to the machine that runs the Hermes Desktop app, over SSH,
# then verify the two copies are identical.
#
#   ./scripts/sync-to-client.sh --host desktop \
#     --dest 'C:/Users/me/AppData/Local/hermes/desktop-plugins/session-styler'
#
# --dest is the plugin folder ON THE CLIENT (created if missing).
# Handles both POSIX (bash/uname) and Windows (cmd.exe) remotes.
# Re-run after every Hermes update or plugin edit; it is idempotent.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$HERE/plugin.js"
HOST=""
DEST=""

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$HOST" ] || { echo "--host is required (an ssh host alias)" >&2; exit 2; }
[ -n "$DEST" ] || { echo "--dest is required (the plugin folder on the client)" >&2; exit 2; }
[ -f "$SOURCE" ] || { echo "plugin.js not found ($SOURCE)" >&2; exit 1; }

SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes)

# POSIX remotes answer `uname -s`; cmd.exe does not.
if ssh "${SSH_OPTS[@]}" "$HOST" 'uname -s' >/dev/null 2>&1; then
  REMOTE_KIND="posix"
else
  REMOTE_KIND="windows"
fi
echo "→ host $HOST looks like: $REMOTE_KIND"

DEST_WIN="$(printf '%s' "$DEST" | tr '/' '\\')"
FILE_WIN="$DEST_WIN\\plugin.js"

echo "→ ensuring $DEST"
if [ "$REMOTE_KIND" = "posix" ]; then
  ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p '$DEST'"
else
  ssh "${SSH_OPTS[@]}" "$HOST" "cmd /c md \"$DEST_WIN\"" >/dev/null 2>&1 || true
fi

echo "→ copying plugin.js"
scp -q -o ConnectTimeout=10 "$SOURCE" "$HOST:$DEST/plugin.js"
[ -f "$HERE/README.md" ] && scp -q -o ConnectTimeout=10 "$HERE/README.md" "$HOST:$DEST/README.md" || true

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
normalize() {
  printf '%s' "$1" | tr -d '\r' | grep -oiE '[0-9a-f]{64}' | head -1 | tr 'A-Z' 'a-z'
}

LOCAL_HASH="$(hash_of "$SOURCE")"
if [ "$REMOTE_KIND" = "posix" ]; then
  REMOTE_RAW="$(ssh "${SSH_OPTS[@]}" "$HOST" "sha256sum '$DEST/plugin.js' 2>/dev/null || shasum -a 256 '$DEST/plugin.js' 2>/dev/null || true")"
else
  REMOTE_RAW="$(ssh "${SSH_OPTS[@]}" "$HOST" "certutil -hashfile \"$FILE_WIN\" SHA256" 2>/dev/null || true)"
fi
REMOTE_HASH="$(normalize "$REMOTE_RAW")"

echo "local  sha256: $LOCAL_HASH"
echo "remote sha256: $REMOTE_HASH"
if [ -z "$REMOTE_HASH" ] || [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
  echo "VERIFY FAILED — the client copy does not match (is the app running and holding the file?)" >&2
  exit 1
fi
echo "verified: the client copy is byte-identical"
echo
echo "Next: in the desktop app press Ctrl/Cmd+K → \"Reload desktop plugins\"."
echo "A new or edited file is hot-loaded within seconds anyway, so re-running this script is enough."
