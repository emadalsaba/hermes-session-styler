# Session Styler — a Hermes Desktop plugin

Customizes the **session list** (the sidebar) of the Hermes Desktop app: per-conversation icons,
status marks, colors and sizes — without patching a single app file.

- Version: **1.2.1**
- Plugin id: `session-styler`
- SDK: `@hermes/plugin-sdk` (desktop app plugin — one plain ESM file, no build step)
- Verified against Hermes Desktop build `6005aa1` / Hermes `main`

---

## What it does

| Pane tab | Controls |
|---|---|
| **Sessions** | branch inheritance on/off, the hover **✦** button, the active conversation's own look (icon, color, size), and a list of the visible conversations with a Customize button per row |
| **Icons** | icon mode (core dot / emoji / codicon), icon size, the **leading mark layout** (icon + state, icon only, dot only), the **state indicator** beside it (dot / per-state icon / none) with its own size, and a per-state icon for every status |
| **Colors** | dot color per state, icon color, title color, meta/age color, and an optional row background tint (color + strength) |
| **Sizes** | row height, title size, meta size, icon-cell width, gap, corner radius — plus Compact/Roomy presets and *Measure current* (seeds the sliders from the live app) |
| **Rules** | match a row by title (text or regex), owning profile, or state → set an icon, a color, or hide the row |
| **Advanced** | hook selector overrides, cross-machine sync, JSON export/import, reset |
| **Help** | a short in-app usage guide, rendered in the app's language |

Surfaces inside the app:

- **✦ on each row** (appears on hover) — opens a menu bound to that conversation: icon grid, custom
  glyph, icon color, hide, and *Back to the state icon* to clear it.
- **⌘K / Ctrl+K commands** — on/off, compact rows, roomy rows, emoji state icons, *icon for the
  active conversation*, sync now, reset, copy diagnostics, check selectors.
- **Status-bar chip** — `rows/icons`; click to toggle the plugin.
- **Pane** — registered as a right-side pane; drag it anywhere, it tabs like a core pane.

### The leading mark is two parts

A conversation's own icon sits **next to** its state, never instead of it:

| Layout | What you see |
|---|---|
| `icon + state` (default) | your icon, plus the state dot smaller beside it |
| `icon only` | your icon alone |
| `dot only` | exactly as core draws it |

The state mark beside it can be the core dot, a per-state icon, or nothing — with its own size and
gap. So a conversation with a custom icon keeps that icon **and** keeps its status.

### Per-conversation icons

Keyed `<profile>::<title>`, set from the row's ✦ menu or the pane's Sessions tab, and they win over
rules. Because the sidebar exposes no session id to a plugin, the title is the key — renaming a
conversation drops its override (the Help tab says so).

### Branch inheritance

A branch child (rendered with a `└─` / `├─` stem under its parent) inherits its parent's icon and
color, through a branch-of-a-branch chain; a child with its own override still wins.

### Language

The plugin ships its own `ar` + `en` bundles through `ctx.i18n.register` and follows the app's active
locale (the app also offers `zh`, `zh-hant`, `ja`, `ru`, which fall back to English). Adding a locale
is one more bundle in `MESSAGES`.

---

## Why it survives updates

1. The plugin is one file **outside** the app bundle — client or backend updates cannot remove it.
2. Nothing on disk is patched: row annotations and one `<style>` element are injected at runtime and
   removed the moment the plugin is switched off.
3. Every DOM anchor lives in a hooks table **with fallbacks**, and the pane's Advanced tab accepts a
   new selector at runtime — no code edit, no reinstall.
4. The diagnostics line always reports rows matched, which hook won, the states and profiles seen,
   and when the file was last loaded.
5. `scripts/check-hooks.sh` diffs every anchor against a Hermes checkout (`--src`) or GitHub `main`
   (`--remote`) after any update: 21 anchors, `OK`/`DRIFT` per anchor.
6. A reloaded plugin hands its previous incarnation's teardown over (`ctx.onDispose` plus a window
   marker) and marks it dead, so two instances can never fight over the same rows.

---

## Install

### 1. From this repo (any machine)

```bash
git clone https://github.com/emadalsaba/hermes-session-styler.git
cd hermes-session-styler
./scripts/install.sh                                 # into $HERMES_HOME/desktop-plugins/session-styler/
./scripts/install.sh --home /path/to/hermes-home     # explicit home
./scripts/install.sh --uninstall                     # remove
```

The folder name must stay `session-styler` (it has to equal the plugin `id`).

### 2. Onto a remote client (e.g. the desktop app on a Windows box)

```bash
./scripts/sync-to-client.sh --host <ssh-alias> \
  --dest 'C:/Users/<you>/AppData/Local/hermes/desktop-plugins/session-styler'

# every machine in the registry (default /opt/data/.hermes/browser_machines.json):
./scripts/sync-to-client.sh --all \
  --dest 'C:/Users/<you>/AppData/Local/hermes/desktop-plugins/session-styler'
```

It copies, verifies SHA-256 on both sides, and exits non-zero on any mismatch.

### 3. Manually

Copy `plugin.js` to `<HERMES_HOME>/desktop-plugins/session-styler/plugin.js`
(Windows: `%LOCALAPPDATA%\hermes\desktop-plugins\session-styler\plugin.js`).

Then in the app: **⌘K / Ctrl+K → “Reload desktop plugins”** (a new folder is picked up within seconds
anyway; the command forces it). The plugin also appears in **Settings → Plugins**, where it can be
disabled or its folder revealed.

> Plugins are **per machine** and load from the **local** hermes home of the box running the app,
> regardless of which backend or profile the window is connected to — so install it on every machine
> the user works on.

---

## Settings that follow you to a new machine

`ctx.storage` is `window.localStorage`, which is per machine. Per-conversation icons and every style
setting are therefore also mirrored into the **active profile's `ui_meta` on the gateway**
(`profiles.configure`, the store Bot Mode uses), keyed `session-styler`.

- Install the plugin on a new machine and connect to the same profile → the same icons and settings
  come back on load (and the app says so).
- Local edits are stamped and pushed (debounced); a newer server blob wins over an older local one.
- Pane → **Advanced** → *Sync across machines* shows the state, with a **Sync now** button; there is
  also a ⌘K command.

---

## After a Hermes update

```bash
cd hermes-session-styler && ./scripts/check-hooks.sh --remote
```

- All `OK` → nothing to do; keep using it.
- Any `DRIFT` → the app renamed something. Open the pane → **Advanced**, paste the new selector for
  that hook, press **Save hooks**. No file editing, no reinstall. A drift report with the output is
  welcome as an issue.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pane/chip missing | ⌘K → “Reload desktop plugins”; check Settings → Plugins is on; the folder must be named `session-styler` |
| `rows: 0` in the diagnostics line | the row hook drifted — run `check-hooks.sh`, then set the selector in **Advanced** |
| Icon shows but the status dot is gone | raise the state indicator (pane → Icons → *State indicator* = dot or icon) |
| Colors don't apply | enable *Enable colour overrides* first; an empty field means "keep the core color" |
| Did the app load it? | the diagnostics line shows `load: <version> @ <timestamp>` — that value is written on load |
| Settings look reset after a reinstall on another machine | that machine has an older copy: enable sync in **Advanced**, then press **Sync now** |

## Uninstall

Delete `<HERMES_HOME>/desktop-plugins/session-styler/`, or turn it off in Settings → Plugins.
Switching it off removes the injected stylesheet, every annotation, the ✦ buttons and every injected
icon immediately — the app is left exactly as it was.

---

## How it works (for maintainers)

1. **Annotate** — each pass walks the row hook, resolves every row's status from the status dot's own
   class tokens, reads the owning profile from the row's profile chip, detects a branch stem, and
   stamps `data-hms-*` attributes plus its own leading mark.
2. **Style** — one `<style id="hermes-session-styler-style">` element carries `:root` variables and
   rules keyed off those annotations. No colors are hardcoded; theme variables and `color-mix` only.
3. **Stay in sync** — a `MutationObserver` re-runs the pass on real DOM changes (our own writes are
   recognized and ignored, so there is no feedback loop), with a 4 s safety net that also restores the
   stylesheet if something removes it.

### Anchors this plugin depends on

| Hook | Default selector / anchor |
|---|---|
| `row` | `[data-slot="row-button"]` (fallback: the row body's class signature) |
| `label` | `span[class*="text-[0.8125rem]"]` |
| `meta` | `[class*="text-[0.625rem]"]`, `[class*="text-[0.6875rem]"]` |
| `lead` | `span[class*="place-items-center"][class*="size-3.5"]` |
| `dot` | `span[class*="rounded-full"][class*="size-1"]` |
| `profileGlyph` | `[data-row-actions] [role="img"][aria-label]` |
| `actions` | `[data-row-actions]` |
| `stem` | `span[class*="font-mono"][class*="text-[0.625rem]"]` containing `└─` / `├─` |

Status tokens read from the dot: `amber-500` → needs input, `bg-(--ui-accent)` → working,
`border-(--ui-accent)` → stalled, `border-(--ui-text-tertiary)` → background, `bg-(--ui-success)` →
unread, `border-(--ui-text-quaternary)` → draft, `size-1` → idle. The selected conversation's shell
carries `bg-(--ui-row-active-background)`.

## Development

`test/` is a dependency-light harness that boots `plugin.js` inside jsdom against a fixture of the
real session-row markup, with a stub `@hermes/plugin-sdk` (plus a canned `profiles.list` /
`profiles.configure`):

```bash
cd test
npm install
node run-tests.mjs ../plugin.js
```

103 assertions: contributions, stylesheet generation, per-state detection, the three leading-mark
layouts, icon injection, per-conversation overrides through the ✦ menu, branch inheritance (child,
deep child, override-wins, inheritance off), the active-conversation look, the locale switch, the
settings mirror (push and restore on a fresh machine), hook fallback, teardown, the hot-reload
handover, persistence, and "a drifted DOM does not throw".

The file is loaded **uncompiled** by the app: plain ESM, `jsx()` calls (never JSX syntax), and only
`@hermes/plugin-sdk`, `react`, `react/jsx-runtime` may be imported.

## License

MIT — see `LICENSE`.
