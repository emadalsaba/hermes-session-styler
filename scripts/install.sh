#!/usr/bin/env bash
# Install the Session Styler plugin into a Hermes home's desktop-plugins root.
#
#   ./scripts/install.sh                       # auto-detect $HERMES_HOME (or ~/.hermes)
#   ./scripts/install.sh --home /path/to/home  # explicit
#   ./scripts/install.sh --uninstall
#
# Idempotent: safe to re-run after any Hermes update.
set -euo pipefail

PLUGIN_ID="session-styler"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$HERE/plugin.js"
HOME_ARG=""
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --home) HOME_ARG="${2:-}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

resolve_home() {
  if [ -n "$HOME_ARG" ]; then echo "$HOME_ARG"; return; fi
  if [ -n "${HERMES_HOME:-}" ]; then echo "$HERMES_HOME"; return; fi
  # Windows (Git Bash / MSYS) keeps the desktop home next to the install dir.
  if [ -n "${LOCALAPPDATA:-}" ] && [ -d "$LOCALAPPDATA/hermes" ]; then echo "$LOCALAPPDATA/hermes"; return; fi
  echo "$HOME/.hermes"
}

HERMES_HOME_RESOLVED="$(resolve_home)"
TARGET="$HERMES_HOME_RESOLVED/desktop-plugins/$PLUGIN_ID"

if [ "$UNINSTALL" = "1" ]; then
  rm -rf "$TARGET"
  echo "removed: $TARGET"
  echo "now run 'Reload desktop plugins' (Ctrl/Cmd+K) in the app."
  exit 0
fi

[ -f "$SOURCE" ] || { echo "plugin.js not found next to this script ($SOURCE)" >&2; exit 1; }

mkdir -p "$TARGET"
cp "$SOURCE" "$TARGET/plugin.js"
[ -f "$HERE/README.md" ] && cp "$HERE/README.md" "$TARGET/README.md"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

SRC_HASH="$(hash_of "$SOURCE")"
DST_HASH="$(hash_of "$TARGET/plugin.js")"
echo "hermes home : $HERMES_HOME_RESOLVED"
echo "installed   : $TARGET/plugin.js"
echo "sha256      : $DST_HASH"
if [ "$SRC_HASH" != "$DST_HASH" ]; then
  echo "VERIFY FAILED: copied file does not match the source" >&2
  exit 1
fi
echo "verified    : source and installed copy are identical"
echo
echo "Next: in the desktop app press Ctrl/Cmd+K → \"Reload desktop plugins\"."
