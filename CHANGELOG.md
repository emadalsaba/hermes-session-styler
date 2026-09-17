# Changelog

## 1.2.2 — 2026-09-17

**Added — a load you can verify from anywhere**

- Every load writes a **load stamp** (version, rows, icons, per-conversation override count, locale,
  profile, sync result, time) into local storage, and carries it inside the mirrored blob. A machine
  that never opens the app window — the server, another desktop — can therefore answer "did the
  update load, and did it break anything?" from the profile's `ui_meta` copy alone. The pane shows the
  same stamp under Advanced → Last load.
- `syncOnLoad()` reconciles **both directions** on every load: a newer server blob is adopted, and
  newer local settings are pushed. A machine whose settings predate the sync feature now refreshes the
  mirror on its own, with no user edit and no palette trip.

**Tests**: 108 assertions (adds the stamp round-trip and the catch-up push).

## 1.2.1 — 2026-09-17

**Added**

- A **Help** tab in the pane: a short usage guide (per-conversation icons, branch inheritance, the
  leading-mark layouts, the cross-machine sync and the update procedure) rendered in the app's
  language through the plugin's own `ar` / `en` bundles.

**Changed**

- All repository documentation — README, CHANGELOG, release notes, script output — is English only.
  In-app text remains localized (Arabic + English, following the app's language).

**Tests**: 103 assertions (adds the Help tab and a bundle-coverage check).

## 1.2.0 — 2026-09-17

**Changed — a custom icon is never replaced by the state**

- The leading mark is now two parts: the conversation's own icon, then its state beside it.
  Layouts: `icon + state` (default — the core dot stays, just smaller), `icon only`, `dot only`.
- The state mark beside it can be the dot, a per-state icon, or nothing, with its own size and gap.

**Added — the plugin speaks the app's language**

- Full `ar` + `en` bundles registered through `ctx.i18n.register`, resolved against the app's active
  locale (React UI via `usePluginI18n`, module-level code — the row menu, toasts, palette labels —
  via `ctx.i18n.t`). Other locales fall back to English; adding one is a single bundle.

**Added — settings follow you to a new machine**

- Per-conversation icons and every style setting are mirrored into the active profile's `ui_meta` on
  the gateway (`profiles.configure`), keyed `session-styler`. `ctx.storage` is `window.localStorage`
  (per machine), so this is the piece that makes a new machine — install the plugin, connect to the
  same profile — restore the same icons on load.
- A newer server blob wins over an older local one; local changes are stamped and pushed (debounced);
  the mirror's state and a **Sync now** button live in the pane's Advanced tab, with a new ⌘K command.

**Fixed**

- A torn-down plugin instance also cancels its pending settings push (a reload could otherwise mirror
  a stale config).
- With the leading mark switched off, the core dot is left exactly as core drew it.

**Tests**: 101 assertions (the three leading-mark layouts, the locale switch, the mirror push, the
restore-on-a-fresh-machine path).

## 1.1.0 — 2026-09-17

**Added**

- **Per-conversation icons.** Every row carries a **✦** button on hover that opens a menu bound to
  that conversation: an icon grid, a free-text glyph, icon colors, hide-the-row, and *Back to the
  state icon* to clear it. Overrides are keyed `<profile>::<title>` and win over rules. The same menu
  opens from ⌘K for the active conversation, and the pane's Sessions tab lists the visible
  conversations with a per-row Customize button.
- **Branch inheritance.** A branch child (the row rendered with a `└─` / `├─` stem under its parent)
  inherits its parent's icon and color instead of falling back to its own state icon — a
  branch-of-a-branch inherits through the chain, and a child with its own override still wins.
  Toggle: pane → Sessions → *Branch inheritance*.
- **The active conversation's own look** — icon, color and size, all optional.
- `scripts/check-hooks.sh` now watches the branch-stem span, the active-row class and the
  `data-row-actions` slot (21 anchors).

**Fixed**

- **A reloaded plugin's previous incarnation kept running.** The app disposes what goes through
  `ctx`, not module scope, so the old instance's `MutationObserver` and 4 s safety net stayed alive
  and fought the new one. `register()` now hands the previous incarnation's teardown over via
  `ctx.onDispose` plus a `window.__hermesSessionStylerCleanup` marker, and the teardown marks the
  instance **dead**, so a queued mutation or an already-scheduled timer cannot re-arm it.
- **Clearing a per-conversation override did nothing.** The config store deep-merges patches, so a
  deleted key came straight back; override writes now assign that map instead of merging it, and an
  empty/false field drops the entry entirely.

**Tests**: 86 assertions (the ✦ menu round-trip, branch inheritance in four shapes, the
active-conversation look, the hot-reload handover).

## 1.0.1 — 2026-09-17

**Fixed**

- **Nothing visible out of the box.** 1.0.0 defaulted to `dot` mode with colors and sizes off, so a
  successful install looked exactly like no install at all. Emoji icons are now ON by default (idle
  rows keep the quiet core dot), so the sidebar changes the moment the plugin loads.
- A mode switch (`emoji` ⇄ `codicon`) now replaces the injected element instead of re-tagging a
  `<span>` into a codicon `<i>`, so the glyph tag always matches the mode.

**Added**

- A load toast — `Session Styler v1.0.1 · N rows · M icons — ⌘K to tune` — and a distinct warning
  when zero rows match (hook drift): proof of load on screen, no guessing.

**Tests**: 56 assertions.

## 1.0.0 — 2026-09-17

First public release.

**Added**

- Session-list (sidebar) styling as a Hermes Desktop plugin: `session-styler`, a single uncompiled
  ESM file using `@hermes/plugin-sdk`.
- **Icons** — per-state glyph (idle, working, stalled, needs input, unread, background, draft) as an
  emoji or a VS Code codicon, replacing the core status dot; an icon-size slider; a `dot` mode that
  leaves the core dot untouched.
- **Colors** — per-state dot color, icon color, title color, meta/age color, and an optional row
  background tint (color + strength).
- **Sizes** — row height, title size, meta size, lead-cell size, gap, radius; Compact/Roomy presets
  and a *Measure current* button that seeds the sliders from the live app.
- **Rules** — match a row by title (text or regex), owning profile, or state, then set an icon, a
  color, or hide the row.
- **Pane UI** with a live preview built from the real row markup, a status-bar chip showing
  `rows/icons` (click to toggle), and ⌘K commands.
- **Update resilience** — a hooks table with automatic fallbacks, runtime hook overrides editable
  from the pane, a diagnostics line naming the hook that matched, a 4 s safety net that restores the
  injected stylesheet, and `scripts/check-hooks.sh`.
- **Ops scripts** — `scripts/install.sh` (local, idempotent, hash-verified) and
  `scripts/sync-to-client.sh` (push to the machine running the desktop app over SSH, verified).
- **Test harness** (`test/`) — jsdom + a stub SDK over a fixture of the real session-row markup.

**Notes**

- Built and verified against Hermes Desktop build `6005aa1`.
- The plugin lives outside the app bundle, so client and backend updates cannot remove it; it never
  patches app files, and disabling it removes every change it made.
