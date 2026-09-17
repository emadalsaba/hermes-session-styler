# Changelog

## 1.2.0 — 2026-09-17

**Added / Changed**

- **The leading mark is two parts.** A conversation's own icon now sits next to its *state* mark
  instead of replacing it: `أيقونة + حالة` (default — the core dot stays, just smaller), `أيقونة فقط`,
  or `نقطة فقط`. The state beside it can be the dot, a per-state icon, or nothing, with its own size
  and gap. So a conversation with a custom icon never loses its status again.
- **The plugin speaks the app's language.** Full `ar` + `en` bundles registered through
  `ctx.i18n.register`, resolved against the app's active locale (`usePluginI18n` in the pane,
  `ctx.i18n.t` in the row menu, toasts and palette labels); other locales fall back to English.
  Adding a locale is one more bundle in `MESSAGES`.
- **Settings follow you to a new machine.** Per-conversation icons and every style setting are
  mirrored into the **active profile's `ui_meta` on the gateway** (`profiles.configure`), keyed
  `session-styler`. `ctx.storage` is `window.localStorage` (per machine), so this is the piece that
  makes a new machine — install the plugin, connect to the same profile — restore the same icons on
  load. A newer server blob wins over an older local one; every local change is stamped and pushed
  (debounced), and the state of the mirror is shown in the pane (متقدم → مزامنة بين الأجهزة) with a
  *Sync now* button and a new ⌘K command.

**Fixed**

- A torn-down plugin instance also cancels its pending settings push (it could otherwise mirror a
  stale config after a reload).
- With the leading mark switched off, the core dot is left exactly as core drew it (it used to be
  hidden by the icon logic).

**Tests**: 101 assertions (adds the three lead layouts, the locale switch, the mirror push, and the
restore-on-a-fresh-machine path).

## 1.1.0 — 2026-09-17

**Added**

- **Per-conversation icons.** Every row now carries a **✦** button (hover) that opens a menu bound
  to THAT conversation: an icon grid, a free-text glyph, icon colours, hide-the-row, and
  «متابعة الحالة / back to state icon» to clear it. Overrides are keyed `<profile>::<title>` and win
  over rules. The same menu opens from ⌘K → *أيقونة المحادثة المفتوحة*, and the pane's new
  **جلسات** tab lists the visible conversations with a per-row customize button.
- **Branch inheritance.** A branch child (the row rendered with a └─/├─ stem under its parent)
  inherits its parent's icon and colour instead of falling back to its own state icon — a
  branch-of-a-branch inherits through the chain, and a child with its own override still wins.
  Toggle: pane → جلسات → *وراثة أيقونة المحادثة الأم*.
- **The active conversation's own look** — icon, colour and size, all optional (pane → جلسات).
- `scripts/check-hooks.sh` now watches the branch-stem span, the active-row class and the
  `data-row-actions` slot (21 anchors).

**Fixed**

- **A reloaded plugin's previous incarnation kept running.** The app disposes what goes through
  `ctx`, not module scope, so the old instance's `MutationObserver` and 4 s safety net stayed alive
  and fought the new one (icons flickering back). `register()` now hands the previous incarnation's
  teardown over via `ctx.onDispose` plus a `window.__hermesSessionStylerCleanup` marker, and the
  teardown marks the instance **dead** so a queued mutation or an already-scheduled timer cannot
  re-arm it.
- **Clearing a per-conversation override did nothing.** The config store deep-merges patches, so a
  deleted key came straight back; override writes now assign that map instead of merging it, and an
  empty/false field drops the entry entirely.

**Tests**: 86 assertions (adds the ✦ menu round-trip, branch inheritance in all four shapes, the
selected-conversation look, and the hot-reload handover).

## 1.0.1 — 2026-09-17

**Fixed**

- **Nothing visible out of the box.** 1.0.0 defaulted to `dot` mode with colors and sizes off, so
  a successful install looked exactly like no install at all. Emoji icons are now ON by default
  (idle rows keep the quiet core dot), so the sidebar changes the moment the plugin loads.
- A mode switch (`emoji` ⇄ `codicon`) now replaces the injected element instead of re-tagging a
  `<span>` into a codicon `<i>`, so the glyph tag always matches the mode.

**Added**

- A load toast: `Session Styler v1.0.1 · N صف · M أيقونة — ⌘K للتحكم`, and a distinct warning when
  zero rows match (hook drift) — proof of load on screen, no guessing.

**Tests**: 56 assertions (adds the load toast, the visible default, and the element-swap case).


## 1.0.0 — 2026-09-17

First public release.

**Added**

- Session-list (sidebar) styling as a Hermes Desktop plugin: `session-styler`, a single
  uncompiled ESM file using `@hermes/plugin-sdk`.
- **Icons** — per-state glyph (idle, working, stalled, needs input, unread, background, draft),
  as an emoji or a VS Code codicon, replacing the core status dot; icon size slider;
  `dot` mode leaves the core dot untouched.
- **Colors** — per-state dot color, icon color, title color, meta/age color, and an optional
  row-background tint (color + strength).
- **Sizes** — row height, title size, meta size, lead-cell size, gap, radius; `compact`/`roomy`
  presets and a "measure the current geometry" button that seeds the sliders from the live app.
- **Rules** — match a row by title (text or regex), owning profile, or state, then set an icon,
  a color, or hide the row. Rules are stored per plugin and applied on every pass.
- **Pane UI** with a live preview built from the real row markup, a status-bar chip showing
  `rows/icons` (click to toggle), and ⌘K commands: toggle, compact, roomy, emoji icons, reset,
  copy diagnostics, check hooks.
- **Update resilience** — hooks table with automatic fallbacks, runtime hook overrides editable
  from the pane's Advanced tab, a diagnostics line naming the hook that matched, a 4 s safety
  net that restores the injected stylesheet, and `scripts/check-hooks.sh` to diff every DOM
  anchor against a Hermes checkout (or GitHub `main`) after any update.
- **Install/ops scripts** — `scripts/install.sh` (local, idempotent, hash-verified),
  `scripts/sync-to-client.sh` (push to the machine running the desktop app over SSH, verified).
- **Test harness** (`test/`) — jsdom + a stub SDK, 53 assertions over a fixture of the real
  session-row markup.
- **Load beacon** — the plugin records `loadedVersion` + `loadedAt` in its plugin storage on
  every load and shows it in the pane's diagnostics line, so "did the app pick up the file?"
  is answerable at a glance.

**Notes**

- Built and verified against Hermes Desktop build `6005aa1`.
- The plugin lives outside the app bundle, so client and backend updates cannot remove it; it
  never patches app files, and disabling it removes every change it made.
