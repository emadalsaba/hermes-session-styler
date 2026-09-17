#!/usr/bin/env bash
# Post-update check: does the Hermes Desktop build still expose everything the
# Session Styler plugin anchors on?
#
#   ./scripts/check-hooks.sh --src "C:/Users/me/AppData/Local/hermes/hermes-agent"
#   ./scripts/check-hooks.sh --remote          # latest main from GitHub
#   ./scripts/check-hooks.sh --src <path> --quiet
#
# Exit 0 = every anchor found. Exit 1 = at least one drifted (the report names the
# file and what is missing, so the pane's Advanced tab can be patched in seconds).
set -uo pipefail

PLUGIN_ID="session-styler"
SRC=""
REMOTE=0
QUIET=0
REPO_RAW="https://raw.githubusercontent.com/NousResearch/hermes-agent/main"

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="${2:-}"; shift 2 ;;
    --remote) REMOTE=1; shift ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$REMOTE" = "1" ]; then
  SRC="$(mktemp -d)"
  trap 'rm -rf "$SRC"' EXIT
  echo "fetching Hermes main into $SRC ..."
  for rel in \
    apps/desktop/src/components/ui/row-button.tsx \
    apps/desktop/src/app/chat/sidebar/row-geometry.ts \
    apps/desktop/src/app/chat/sidebar/session-row.tsx \
    apps/desktop/src/app/chat/sidebar/chrome.tsx \
    apps/desktop/src/app/chat/session-status-dot.tsx \
    apps/desktop/src/app/chat/profile-tag.tsx \
    apps/desktop/src/i18n/en.ts \
    apps/desktop/src/i18n/ar.ts
  do
    mkdir -p "$SRC/$(dirname "$rel")"
    curl -fsS --max-time 60 "$REPO_RAW/$rel" -o "$SRC/$rel" || echo "  (could not fetch $rel)"
  done
fi

[ -n "$SRC" ] || { echo "need --src <hermes-agent checkout> or --remote" >&2; exit 2; }
[ -d "$SRC" ] || { echo "not a directory: $SRC" >&2; exit 2; }

# Try plain path first, then a glob, so it works on a checkout either way.
file_of() {
  local rel="$1"
  if [ -f "$SRC/$rel" ]; then echo "$SRC/$rel"; return 0; fi
  local base; base="$(basename "$rel")"
  local hit; hit="$(find "$SRC" -name "$base" -not -path '*/node_modules/*' 2>/dev/null | head -1)"
  [ -n "$hit" ] && echo "$hit"
  return 0
}

PASS=0
FAIL=0
FAILED_LINES=""

# check <label> <relative-file> <literal> [...more literals on the same file]
check() {
  local label="$1" rel="$2"; shift 2
  local path; path="$(file_of "$rel")"
  if [ -z "$path" ]; then
    FAIL=$((FAIL + 1))
    printf 'DRIFT  %-22s %s\n        file not found: %s\n' "$label" "missing file" "$rel"
    FAILED_LINES="$FAILED_LINES$label(file)"
    return
  fi
  local missing=""
  for literal in "$@"; do
    grep -Fq -- "$literal" "$path" || missing="$missing [$literal]"
  done
  if [ -n "$missing" ]; then
    FAIL=$((FAIL + 1))
    printf 'DRIFT  %-22s %s\n        missing:%s\n' "$label" "$rel" "$missing"
    FAILED_LINES="$FAILED_LINES$label "
  else
    PASS=$((PASS + 1))
    [ "$QUIET" = "1" ] || printf 'OK     %-22s %s\n' "$label" "$rel"
  fi
}

[ "$QUIET" = "1" ] || echo "Session Styler — DOM anchors vs $SRC"
[ "$QUIET" = "1" ] || echo "-----------------------------------------------------------"

check "row slot"        apps/desktop/src/components/ui/row-button.tsx 'data-slot="row-button"'
check "lead cell"       apps/desktop/src/app/chat/sidebar/row-geometry.ts 'SIDEBAR_ROW_LEAD' 'size-3.5' 'place-items-center'
check "row min-height"  apps/desktop/src/app/chat/sidebar/row-geometry.ts 'SIDEBAR_ROW_MIN_H' 'min-h-[1.625rem]'
check "label size"      apps/desktop/src/app/chat/sidebar/row-geometry.ts 'text-[0.8125rem]'
check "working dot"     apps/desktop/src/app/chat/session-status-dot.tsx 'bg-(--ui-accent)'
check "unread dot"      apps/desktop/src/app/chat/session-status-dot.tsx 'bg-(--ui-success)'
check "needs-input dot" apps/desktop/src/app/chat/session-status-dot.tsx 'bg-amber-500'
check "stalled dot"     apps/desktop/src/app/chat/session-status-dot.tsx 'border border-(--ui-accent)'
check "background dot"  apps/desktop/src/app/chat/session-status-dot.tsx 'border border-(--ui-text-tertiary)'
check "draft dot"       apps/desktop/src/app/chat/session-status-dot.tsx 'border border-(--ui-text-quaternary)'
check "idle dot"        apps/desktop/src/app/chat/session-status-dot.tsx 'size-1 rounded-full'
check "active dot size" apps/desktop/src/app/chat/session-status-dot.tsx 'size-1.5 rounded-full'
check "dot wrapper"     apps/desktop/src/app/chat/session-status-dot.tsx 'flex items-center gap-0.5'
check "profile chip"    apps/desktop/src/app/chat/profile-tag.tsx 'role="img"' 'aria-label'
check "profile label en" apps/desktop/src/i18n/en.ts 'ownedByProfile'
check "profile label ar" apps/desktop/src/i18n/ar.ts 'ownedByProfile'
check "working attr"    apps/desktop/src/app/chat/sidebar/session-row.tsx "data-working={liveTurn ? 'true' : undefined}"
check "actions column"  apps/desktop/src/app/chat/sidebar/chrome.tsx 'data-row-actions'

echo "-----------------------------------------------------------"
echo "anchors OK: $PASS    drifted: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Action: open the 'session styler' pane → متقدم / Advanced, paste the new selector for"
  echo "each drifted hook, press «حفظ المُحدِّدات» / Save hooks. No file edit, no reinstall needed."
  echo "Drifted: $FAILED_LINES"
  exit 1
fi
echo "Nothing to do — this build still exposes every anchor."
