# Changelog

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
