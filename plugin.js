/**
 * Session Styler — Hermes Desktop plugin (v1.0.0)
 * ---------------------------------------------------------------------------
 * Customizes the SESSION LIST rows (the sidebar): icons, colors and sizes.
 *
 * Install: <HERMES_HOME>/desktop-plugins/session-styler/plugin.js   (folder == id)
 * Reload : ⌘K / Ctrl+K → "Reload desktop plugins"
 *
 * HOW IT WORKS (and why it survives updates)
 *   The app ships no CSS hook for the session list, so this plugin does two
 *   things outside of the app bundle:
 *     1. annotates rows it recognizes (`data-hms-row`, `data-hms-state`,
 *        `data-hms-profile`, `data-hms-dot`, ...) — annotations are additive and
 *        removed the moment the plugin is off, so nothing can be broken;
 *     2. injects ONE <style> element (`#hermes-session-styler-style`) whose
 *        rules are keyed off those annotations and off `:root` custom
 *        properties.
 *   Every selector lives in HOOKS below with fallbacks, the pane's Advanced tab
 *   can override them at runtime (no code edit), and the diagnostics line shows
 *   which hook matched how many rows — so after an app update you can see at a
 *   glance whether anything drifted. Nothing is patched on disk: the plugin
 *   lives outside the app, so client updates cannot remove it.
 *
 * Plain ESM, loaded uncompiled: UI is jsx() calls, never JSX syntax.
 * Only these specifiers resolve: @hermes/plugin-sdk, react, react/jsx-runtime.
 */

import {
  Badge,
  Button,
  Codicon,
  Input,
  PALETTE_AREA,
  PANES_AREA,
  STATUSBAR_AREAS,
  SegmentedControl,
  Separator,
  Switch,
  Tip,
  atom,
  cn,
  haptic,
  host,
  useValue
} from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'session-styler'
const VERSION = '1.1.0'
const STYLE_ID = 'hermes-session-styler-style'
const STORE_KEY = 'config'

/* ---------------------------------------------------------------------------
 * DOM hooks — the ONLY things that can drift with an app update.
 * Each entry is a list of candidates, tried in order; the first that matches
 * anything wins and the winner is reported in the pane's Diagnostics line.
 * ------------------------------------------------------------------------ */
const HOOKS = {
  /* The session row's tap target (verified: SidebarRowBody → <button
   * data-slot="row-button">, class "… self-stretch py-0.5 …"). */
  row: [
    '[data-slot="row-button"]',
    'button[class*="self-stretch"][class*="gap-1.5"][class*="py-0.5"]',
    'button[class*="items-center"][class*="pl-2"][class*="pr-2"]'
  ],
  /* Title span (SidebarRowLabel → text-[0.8125rem]). */
  label: ['span[class*="text-[0.8125rem]"]', 'span[class*="truncate"][class*="min-w-0"]'],
  /* Small figures: age / model / counts. */
  meta: ['[class*="text-[0.625rem]"]', '[class*="text-[0.6875rem]"]'],
  /* Fixed leading cell that holds the status dot (SIDEBAR_ROW_LEAD). */
  lead: ['span[class*="place-items-center"][class*="size-3.5"]', 'span[class*="place-items-center"][class*="grid"]'],
  /* The status dot itself (session-status-dot.tsx). */
  dot: ['span[class*="rounded-full"][class*="size-1"]'],
  /* Owning-profile chip (ProfileTag → ProfileGlyph with role="img"). */
  profileGlyph: ['[data-row-actions] [role="img"][aria-label]', '[role="img"][aria-label]'],
  /* Trailing actions column — where the plugin's own ✦ button goes. */
  actions: ['[data-row-actions]'],
  /* Branch stem (└─ / ├─) inside the status dot: marks a child session. */
  stem: ['span[class*="font-mono"][class*="text-[0.625rem]"]']
}

/* Status-dot class tokens, in priority order (verified against
 * session-status-dot.tsx DOT_VARIANTS at commit 6005aa1). */
const STATE_TOKENS = [
  ['needsInput', ['amber-500']],
  ['working', ['bg-(--ui-accent)']],
  ['stalled', ['border-(--ui-accent)']],
  ['background', ['border-(--ui-text-tertiary)']],
  ['unread', ['bg-(--ui-success)']],
  ['draft', ['border-(--ui-text-quaternary)']],
  ['idle', ['size-1 ']]
]

const STATES = ['idle', 'working', 'stalled', 'needsInput', 'unread', 'background', 'draft']

/* ---------------------------------------------------------------------------
 * Config
 * ------------------------------------------------------------------------ */
const DEFAULTS = {
  on: true,
  /* icons: mode 'dot' keeps the core dot; 'emoji' / 'codicon' replace it. */
  icons: { mode: 'emoji', size: 13, color: '', byState: { idle: '', working: '⚡', stalled: '⏳', needsInput: '❗', unread: '🟢', background: '📡', draft: '📝' } },
  colors: { on: false, states: { idle: '', working: '', stalled: '', needsInput: '', unread: '', background: '', draft: '' }, icon: '', title: '', meta: '', tint: false, tintColor: '', tintStrength: 12 },
  size: { on: false, rowHeight: 26, label: 13, meta: 10, lead: 14, gap: 6, radius: 6 },
  rules: [],
  /* Per-conversation overrides, keyed "<profile>::<title>" — set from the
   * row's own ✦ menu, so one conversation can carry its own icon without a
   * regex rule and without a rule that also hits its siblings. */
  sessionOverrides: {},
  /* A branch child (rendered with a └─/├─ stem under its parent) inherits the
   * parent's icon unless it has an override of its own. */
  inheritBranch: true,
  /* The hover ✦ button in each row that opens the per-conversation menu. */
  rowMenu: true,
  /* Look of the conversation you are currently in (core paints the row with
   * bg-(--ui-row-active-background)). */
  selected: { icon: '', color: '', size: 0 },
  maxRules: 40,
  hooks: {}
}

const PRESETS = {
  default: { size: { on: false } },
  compact: { size: { on: true, rowHeight: 22, label: 12, meta: 9, lead: 12, gap: 4, radius: 4 } },
  roomy: { size: { on: true, rowHeight: 32, label: 14, meta: 11, lead: 16, gap: 8, radius: 8 } }
}

const ICON_PALETTE = ['⚡', '🔥', '✅', '⏳', '❗', '🟢', '🟡', '🔴', '🔵', '🟣', '📦', '🧪', '🧩', '🚀', '💎', '⭐', '🎯', '📌', '🧠', '🤖', '🛠️', '💤', '📝', '📡', '🔒', '✦', '●', '▲', '★', '—']
const COLOR_SWATCHES = ['var(--ui-accent)', 'var(--ui-success)', '#f43f5e', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8']
const STATE_LABEL = {
  idle: 'خامل / idle',
  working: 'يعمل / working',
  stalled: 'متوقف مؤقتًا / stalled',
  needsInput: 'ينتظر إجابتك / needs input',
  unread: 'غير مقروء / unread',
  background: 'خلفية تعمل / background',
  draft: 'مسودة / draft'
}

function merge(base, patch) {
  if (patch == null) return base
  const out = Array.isArray(base) ? patch.slice() : { ...base }
  for (const key of Object.keys(patch)) {
    const b = base[key]
    const p = patch[key]
    out[key] = b && p && typeof b === 'object' && typeof p === 'object' && !Array.isArray(b) && !Array.isArray(p) ? merge(b, p) : p
  }
  return out
}

/* ---------------------------------------------------------------------------
 * Stores
 * ------------------------------------------------------------------------ */
const $config = atom(DEFAULTS)

/** The annotated shell for a given title — how the pane reaches a row's menu. */
function findShellByTitle(title) {
  const hooks = resolveHooks($config.get())
  for (const sel of hooks.row) {
    let rows = []
    try {
      rows = Array.from(document.querySelectorAll(sel))
    } catch {
      rows = []
    }
    for (const row of rows) {
      if (!(row instanceof Element)) continue
      const shell = row.parentElement instanceof Element ? row.parentElement : row
      if (!shell.hasAttribute('data-hms-row')) continue
      const label = row.querySelector(selList(hooks.label))
      if ((label?.textContent || '').trim() === title) return shell
    }
  }
  return null
}
const $stats = atom({ on: true, rows: 0, styled: 0, hook: '—', states: {}, profiles: [], warnings: [], lastRun: 0, error: '' })
/** Snapshot of the rows as last annotated — powers the pane's «جلسات» tab. */
const $rows = atom([])

let store = null /* plugin-scoped persistence, set in register() */
const runtime = { dead: false, observer: null, timer: null, debounce: null, busy: false, disposers: [], booted: false, os: null }

/** Clipboard via the SDK's OS door (ctx.os), with the DOM API as fallback. */
function copyToClipboard(text) {
  try {
    if (runtime.os && typeof runtime.os.writeClipboard === 'function') {
      const result = runtime.os.writeClipboard(text)
      if (result && typeof result.then === 'function') result.then(() => undefined, () => undefined)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const result = navigator.clipboard.writeText(text)
      if (result && typeof result.then === 'function') result.then(() => undefined, () => undefined)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

function persist() {
  try {
    if (store) store.set(STORE_KEY, $config.get())
  } catch {
    /* persistence is best-effort */
  }
}

/** Apply a config change. `replace` lists keys whose patch value must be
 *  ASSIGNED rather than deep-merged — without it a deleted nested entry (a
 *  cleared per-conversation override) comes back on the merge. */
function setConfig(patch, { silent, replace } = {}) {
  const next = merge($config.get(), patch)
  for (const key of replace || []) next[key] = patch[key]
  $config.set(next)
  persist()
  applyAll()
  if (!silent) haptic('tap')
}

function resetConfig() {
  $config.set({ ...DEFAULTS, icons: merge(DEFAULTS.icons, {}), colors: merge(DEFAULTS.colors, {}), size: merge(DEFAULTS.size, {}) })
  persist()
  applyAll()
}

/* ---------------------------------------------------------------------------
 * DOM helpers
 * ------------------------------------------------------------------------ */
function firstMatch(root, candidates) {
  for (const sel of candidates) {
    try {
      if (root.querySelector(sel)) return sel
    } catch {
      /* invalid selector — skip it */
    }
  }
  return null
}

function resolveHooks(cfg) {
  const out = { overridden: [] }
  for (const key of Object.keys(HOOKS)) {
    const custom = cfg.hooks?.[key]
    if (typeof custom === 'string' && custom.trim()) {
      out[key] = [custom.trim()]
      out.overridden.push(key)
    } else {
      out[key] = HOOKS[key]
    }
  }
  return out
}

function detectState(row, shell, dot) {
  if (dot) {
    const cls = ` ${dot.className} `
    for (const [state, tokens] of STATE_TOKENS) {
      if (tokens.every(t => cls.includes(t))) return state
    }
  }
  if (shell && shell.getAttribute('data-working') === 'true') return 'working'
  return null
}

function detectProfile(root, hook) {
  for (const sel of hook) {
    let node = null
    try {
      /* The owning-profile chip lives in the row's trailing actions column,
       * which is a SIBLING of the tap target — so search the whole shell. */
      node = root.querySelector(sel)
    } catch {
      node = null
    }
    if (!node) continue
    const label = node.getAttribute('aria-label') || ''
    const tail = label.match(/[A-Za-z0-9][A-Za-z0-9_.-]*$/)
    if (tail) return tail[0]
  }
  return null
}

function ruleMatches(rule, ctx) {
  if (!rule || !rule.value) return false
  const value = String(rule.value).trim()
  if (!value) return false
  if (rule.type === 'state') return ctx.state === value
  if (rule.type === 'profile') return ctx.profile === value
  if (rule.type === 'title') {
    try {
      return new RegExp(value, 'i').test(ctx.title || '')
    } catch {
      return (ctx.title || '').toLowerCase().includes(value.toLowerCase())
    }
  }
  return false
}

function readTitle(row, hook) {
  const sel = firstMatch(row, hook)
  if (!sel) return ''
  const node = row.querySelector(sel)
  return (node?.textContent || '').trim()
}

function ensureIcon(lead, glyph, mode) {
  if (!lead) return null
  let node = lead.querySelector('.hms-icon')
  if (!glyph) {
    if (node) node.remove()
    lead.removeAttribute('data-hms-hide-dot')
    return null
  }
  const wanted = mode === 'codicon' ? 'I' : 'SPAN'
  if (node && node.tagName !== wanted) {
    /* mode switched under us — swap the element so the tag matches the mode */
    node.remove()
    node = null
  }
  if (!node) {
    node = document.createElement(mode === 'codicon' ? 'i' : 'span')
    node.setAttribute('data-hms-owned', '1')
    lead.insertBefore(node, lead.firstChild)
  }
  const cls = mode === 'codicon' ? `codicon codicon-${glyph} hms-icon` : 'hms-icon'
  if (node.className !== cls) node.className = cls
  const text = mode === 'codicon' ? '' : glyph
  if (node.textContent !== text) node.textContent = text
  lead.setAttribute('data-hms-hide-dot', '1')
  lead.setAttribute('data-hms-owned', '1')
  return node
}

/* ---------------------------------------------------------------------------
 * Stylesheet
 * ------------------------------------------------------------------------ */
function px(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? `${n}px` : null
}

function cssFor(cfg, hooks) {
  const vars = []
  const rules = []

  const iconSize = px(cfg.icons.size)
  vars.push(`--hms-icon-size: ${iconSize || '13px'};`)

  if (cfg.colors.on) {
    for (const state of STATES) {
      const dot = cfg.colors.states?.[state]
      const icon = cfg.colors.icon
      if (dot) {
        vars.push(`--hms-dot-${state}: ${dot};`)
        rules.push(`[data-hms-row][data-hms-state="${state}"] [data-hms-dot]{background-color:var(--hms-dot-${state}) !important;border-color:var(--hms-dot-${state}) !important;}`)
      }
      if (icon) {
        vars.push(`--hms-icon-${state}: ${icon};`)
        rules.push(`[data-hms-row][data-hms-state="${state}"] .hms-icon{color:var(--hms-icon-${state}) !important;}`)
      }
    }
    const title = cfg.colors.title
    if (title) {
      vars.push(`--hms-title: ${title};`)
      rules.push(`[data-hms-row] ${selList(hooks.label)}{color:var(--hms-title) !important;}`)
    }
    const meta = cfg.colors.meta
    if (meta) {
      vars.push(`--hms-meta: ${meta};`)
      rules.push(`[data-hms-row] ${selList(hooks.meta)}{color:var(--hms-meta) !important;}`)
    }
    if (cfg.colors.tint && cfg.colors.tintColor) {
      const strength = Math.max(2, Math.min(60, Number(cfg.colors.tintStrength) || 12))
      vars.push(`--hms-tint: color-mix(in srgb, ${cfg.colors.tintColor} ${strength}%, transparent);`)
      rules.push('[data-hms-row]{background-color:var(--hms-tint) !important;}')
    }
  }

  if (cfg.size.on) {
    const rowH = px(cfg.size.rowHeight)
    const label = px(cfg.size.label)
    const meta = px(cfg.size.meta)
    const lead = px(cfg.size.lead)
    const gap = px(cfg.size.gap)
    const radius = px(cfg.size.radius)
    if (rowH) vars.push(`--hms-row-h: ${rowH};`)
    if (gap) vars.push(`--hms-gap: ${gap};`)
    if (radius) vars.push(`--hms-radius: ${radius};`)
    if (lead) vars.push(`--hms-lead: ${lead};`)
    if (rowH) rules.push('[data-hms-row]{min-height:var(--hms-row-h) !important;}')
    if (radius) rules.push('[data-hms-row]{border-radius:var(--hms-radius) !important;}')
    if (gap) rules.push('[data-hms-row] > [data-slot="row-button"]{gap:var(--hms-gap) !important;}')
    if (lead) rules.push(`[data-hms-row] ${selList(hooks.lead)}{width:var(--hms-lead) !important;height:var(--hms-lead) !important;}`)
    if (label) {
      vars.push(`--hms-label: ${label};`)
      rules.push(`[data-hms-row] ${selList(hooks.label)}{font-size:var(--hms-label) !important;}`)
    }
    if (meta) {
      vars.push(`--hms-meta-size: ${meta};`)
      rules.push(`[data-hms-row] ${selList(hooks.meta)}{font-size:var(--hms-meta-size) !important;}`)
    }
  }

  rules.push('.hms-icon{display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:var(--hms-icon-size,13px);font-style:normal;}')
  /* the row's own ✦ affordance + its menu — plain CSS on purpose: Tailwind only
     emits classes the app itself uses, and this DOM is injected at runtime */
  rules.push('.hms-rowbtn{display:grid;place-items:center;width:1.125rem;height:1.125rem;flex:0 0 auto;border:0;border-radius:3px;background:transparent;color:var(--ui-text-quaternary);font-size:0.6875rem;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s ease,color .12s ease;}')
  rules.push('[data-hms-row]:hover .hms-rowbtn,.hms-rowbtn:focus-visible{opacity:1;}')
  rules.push('.hms-rowbtn[data-hms-custom="1"]{opacity:1;color:var(--ui-accent);}')
  rules.push('.hms-menu{position:fixed;z-index:var(--z-over-modal-content,210);width:14rem;padding:0.5rem;border-radius:6px;border:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-elevated) 96%,transparent);color:var(--ui-text-primary);box-shadow:var(--shadow-md,0 8px 24px rgb(0 0 0 / 0.35));backdrop-filter:blur(0.75rem) saturate(1.08);font-size:0.6875rem;}')
  rules.push('.hms-menu-head{margin-bottom:0.375rem;}')
  rules.push('.hms-menu-title{font-size:0.75rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}')
  rules.push('.hms-menu-sub{margin-top:0.125rem;color:var(--ui-text-tertiary);font-size:0.625rem;}')
  rules.push('.hms-menu-label{margin:0.375rem 0 0.25rem;color:var(--ui-text-quaternary);font-size:0.625rem;}')
  rules.push('.hms-menu-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:0.125rem;}')
  rules.push('.hms-menu-emoji{display:grid;place-items:center;height:1.25rem;border:0;border-radius:3px;background:transparent;font-size:0.8125rem;line-height:1;cursor:pointer;}')
  rules.push('.hms-menu-emoji:hover,.hms-menu-emoji.is-active{background:var(--ui-control-active-background,color-mix(in srgb,currentColor 12%,transparent));}')
  rules.push('.hms-menu-row{display:flex;align-items:center;gap:0.25rem;}')
  rules.push('.hms-menu-input{min-width:0;flex:1;height:1.375rem;padding:0 0.25rem;border:1px solid var(--ui-stroke-secondary);border-radius:3px;background:transparent;color:inherit;font-size:0.6875rem;outline:none;}')
  rules.push('.hms-menu-act{height:1.375rem;padding:0 0.375rem;border:1px solid var(--ui-stroke-secondary);border-radius:3px;background:transparent;color:inherit;font-size:0.625rem;cursor:pointer;white-space:nowrap;}')
  rules.push('.hms-menu-act:hover{background:var(--ui-control-active-background,color-mix(in srgb,currentColor 12%,transparent));}')
  rules.push('.hms-menu-swatch{width:1rem;height:1rem;padding:0;border:1px solid var(--ui-stroke-secondary);border-radius:3px;cursor:pointer;}')
  rules.push('.hms-menu-swatch.is-active{outline:1px solid var(--ui-accent);outline-offset:1px;}')
  rules.push('.hms-menu-actions{display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.5rem;}')
  rules.push('.hms-menu-foot{margin-top:0.375rem;color:var(--ui-text-quaternary);font-size:0.5625rem;line-height:1.4;}')
  rules.push('[data-hms-hide-dot] > span:not(.hms-icon){display:none !important;}')
  rules.push('[data-hms-hidden="1"]{display:none !important;}')

  return `:root{${vars.join('')}}\n${rules.join('\n')}\n`
}

function selList(candidates) {
  return candidates.filter(Boolean).join(',')
}

function ensureStyle(cfg, hooks) {
  let node = document.getElementById(STYLE_ID)
  if (!node) {
    node = document.createElement('style')
    node.id = STYLE_ID
    node.setAttribute('data-hms-owned', '1')
    ;(document.head || document.documentElement).appendChild(node)
  }
  const css = cssFor(cfg, hooks)
  if (node.textContent !== css) node.textContent = css
  return node
}

function removeStyle() {
  const node = document.getElementById(STYLE_ID)
  if (node) node.remove()
}

/* ---------------------------------------------------------------------------
 * Per-conversation identity + inheritance
 * ------------------------------------------------------------------------ */

/** Override key. The row DOM exposes no session id — only its title, its
 *  profile chip and its state — so a conversation is addressed by profile +
 *  title. Renaming a session therefore drops its override (and the pane says
 *  so); everything else about the override is durable. */
function sessionKey(profile, title) {
  return `${profile || ''}::${(title || '').trim()}`
}

function overrideFor(cfg, profile, title) {
  const map = cfg.sessionOverrides || {}
  return map[sessionKey(profile, title)] || null
}

/** A branch child paints a └─/├─ stem inside its status dot (session-row.tsx
 *  passes a depth-first list, so a child is the row right after its parent). */
function readStem(row, hook) {
  for (const sel of hook) {
    let nodes = []
    try {
      nodes = row.querySelectorAll(sel)
    } catch {
      nodes = []
    }
    for (const node of nodes) {
      if (/[└├]/.test((node.textContent || '').trim())) return (node.textContent || '').trim()
    }
  }
  return ''
}

/** Core paints the row you are in with `bg-(--ui-row-active-background)`. */
function isSelectedRow(shell) {
  try {
    return String(shell.className).includes('row-active-background')
  } catch {
    return false
  }
}

function describeRow(row, hooks) {
  const shell = row.parentElement instanceof Element ? row.parentElement : row
  const title = readTitle(row, hooks.label)
  const profile = detectProfile(shell, hooks.profileGlyph)
  return {
    profile,
    row,
    shell,
    stem: readStem(row, hooks.stem),
    title
  }
}

function setSessionOverride(info, patch) {
  const key = sessionKey(info.profile, info.title)
  const current = ($config.get().sessionOverrides || {})[key] || {}
  const next = { ...current, ...patch }
  /* Every field is "meaningful when truthy": an empty icon/color and an
   * explicit false (`hide`) all mean "no override here", so they are dropped
   * rather than stored — otherwise the entry survives as dead weight. */
  for (const field of Object.keys(next)) {
    if (next[field] === '' || next[field] === null || next[field] === undefined || next[field] === false) delete next[field]
  }
  const map = { ...($config.get().sessionOverrides || {}) }
  if (Object.keys(next).length === 0) delete map[key]
  else map[key] = next
  setConfig({ sessionOverrides: map }, { silent: true, replace: ['sessionOverrides'] })
}

/* ---------------------------------------------------------------------------
 * The row's own ✦ menu (plain DOM — plugins cannot mount React outside a
 * contribution, and no react-dom is importable)
 * ------------------------------------------------------------------------ */
let menuEl = null
let menuDisposers = []

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  node.setAttribute('data-hms-owned', '1')
  return node
}

function closeSessionMenu() {
  for (const dispose of menuDisposers.splice(0)) {
    try {
      dispose()
    } catch {
      /* ignore */
    }
  }
  if (menuEl) {
    menuEl.remove()
    menuEl = null
  }
}

function openSessionMenu(shell, event) {
  const cfg = $config.get()
  const hooks = resolveHooks(cfg)
  const row = shell.querySelector(selList(hooks.row)) || shell.querySelector(HOOKS.row[0])
  if (!row) return
  const info = describeRow(row, hooks)
  const override = overrideFor(cfg, info.profile, info.title) || {}

  closeSessionMenu()

  const menu = el('div', 'hms-menu')
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('data-hms-menu', info.title)

  /* header */
  const head = el('div', 'hms-menu-head')
  head.appendChild(el('div', 'hms-menu-title', info.title || '(بدون عنوان)'))
  head.appendChild(
    el(
      'div',
      'hms-menu-sub',
      `${info.profile ? `${info.profile} · ` : ''}${info.stem ? 'فرعية / branch ' : ''}${override.icon ? 'أيقونة مخصّصة / custom' : 'تلقائي / auto'}`
    )
  )
  menu.appendChild(head)

  /* icon grid */
  menu.appendChild(el('div', 'hms-menu-label', 'أيقونة هذه المحادثة / icon'))
  const grid = el('div', 'hms-menu-grid')
  for (const icon of ICON_PALETTE) {
    const button = el('button', cn('hms-menu-emoji', override.icon === icon && 'is-active'), icon)
    button.type = 'button'
    button.addEventListener('click', () => {
      setSessionOverride(info, { icon })
      openSessionMenu(shell)
    })
    grid.appendChild(button)
  }
  menu.appendChild(grid)

  /* custom glyph */
  const customRow = el('div', 'hms-menu-row')
  const input = document.createElement('input')
  input.className = 'hms-menu-input'
  input.setAttribute('data-hms-owned', '1')
  input.placeholder = cfg.icons.mode === 'codicon' ? 'codicon name' : 'أي رمز / أي إيموجي'
  input.value = override.icon || ''
  customRow.appendChild(input)
  const apply = el('button', 'hms-menu-act', 'تطبيق')
  apply.type = 'button'
  apply.addEventListener('click', () => {
    setSessionOverride(info, { icon: input.value.trim() })
    openSessionMenu(shell)
  })
  customRow.appendChild(apply)
  menu.appendChild(customRow)

  /* color */
  menu.appendChild(el('div', 'hms-menu-label', 'لون الأيقونة / color'))
  const colors = el('div', 'hms-menu-row')
  for (const color of COLOR_SWATCHES.slice(0, 8)) {
    const swatch = el('button', cn('hms-menu-swatch', override.color === color && 'is-active'))
    swatch.type = 'button'
    swatch.style.backgroundColor = color
    swatch.title = color
    swatch.addEventListener('click', () => {
      setSessionOverride(info, { color })
      openSessionMenu(shell)
    })
    colors.appendChild(swatch)
  }
  menu.appendChild(colors)

  /* actions */
  const actions = el('div', 'hms-menu-actions')
  const inherits = el(
    'button',
    'hms-menu-act',
    info.stem ? 'وراثة من المحادثة الأم / inherit from parent' : 'متابعة الحالة / back to state icon'
  )
  inherits.type = 'button'
  inherits.addEventListener('click', () => {
    setSessionOverride(info, { icon: '', color: '', hide: false })
    openSessionMenu(shell)
  })
  actions.appendChild(inherits)
  const hideBtn = el('button', 'hms-menu-act', override.hide ? '☑ إخفاء الجلسة' : '☐ إخفاء الجلسة')
  hideBtn.type = 'button'
  hideBtn.addEventListener('click', () => {
    setSessionOverride(info, { hide: override.hide ? false : true })
    openSessionMenu(shell)
  })
  actions.appendChild(hideBtn)
  menu.appendChild(actions)

  menu.appendChild(el('div', 'hms-menu-foot', 'النقطة الأصلية تعود بخيار «متابعة الحالة». التسمية تُحدَّد بالعنوان.'))

  document.body.appendChild(menu)
  menuEl = menu

  const rect = shell.getBoundingClientRect()
  const anchorX = Number.isFinite(event?.clientX) ? event.clientX : rect.right
  const anchorY = Number.isFinite(event?.clientY) ? event.clientY : rect.top
  const width = menu.offsetWidth || 208
  const height = menu.offsetHeight || 260
  const left = Math.max(8, Math.min(anchorX, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(anchorY + 6, window.innerHeight - height - 8))
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  const onPointerDown = downEvent => {
    if (menuEl && !menuEl.contains(downEvent.target)) closeSessionMenu()
  }
  const onKeyDown = keyEvent => {
    if (keyEvent.key === 'Escape') closeSessionMenu()
  }
  const onScroll = () => closeSessionMenu()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onScroll, true)
  menuDisposers.push(
    () => document.removeEventListener('pointerdown', onPointerDown, true),
    () => document.removeEventListener('keydown', onKeyDown, true),
    () => window.removeEventListener('scroll', onScroll, true)
  )
}

/** The hover ✦ affordance: a real button in the row's trailing actions slot,
 *  so a conversation can be styled the way core styles it — from the row. */
function ensureRowButton(info, hooks, show) {
  const existing = info.shell.querySelector('.hms-rowbtn')
  if (!show) {
    if (existing) existing.remove()
    return
  }
  let button = existing
  if (!button) {
    let host = null
    for (const sel of hooks.actions) {
      try {
        host = info.shell.querySelector(sel)
      } catch {
        host = null
      }
      if (host) break
    }
    if (!host) return
    button = el('button', 'hms-rowbtn', '✦')
    button.type = 'button'
    button.title = 'أيقونة هذه المحادثة / this conversation’s icon'
    button.addEventListener('pointerdown', downEvent => {
      downEvent.preventDefault()
      downEvent.stopPropagation()
      haptic('tap')
      if (menuEl && menuEl.getAttribute('data-hms-menu') === info.title) closeSessionMenu()
      else openSessionMenu(info.shell, downEvent)
    })
    host.insertBefore(button, host.firstChild)
  }
  if (button.getAttribute('data-hms-row-icon') !== info.icon) {
    button.setAttribute('data-hms-row-icon', info.icon || '')
    button.setAttribute('data-hms-custom', overrideFor($config.get(), info.profile, info.title) ? '1' : '0')
  }
}

/* ---------------------------------------------------------------------------
 * Annotation pass
 * ------------------------------------------------------------------------ */
function annotate() {
  if (runtime.dead) return
  if (!document || !document.body) return
  const cfg = $config.get()
  const hooks = resolveHooks(cfg)
  runtime.busy = true
  const states = {}
  const profiles = new Set()
  const warnings = []
  const snapshot = []
  let rows = 0
  let styled = 0
  let hook = '—'

  try {
    /* pick the first row hook that matches anything */
    let rowSel = null
    for (const sel of hooks.row) {
      try {
        if (document.querySelector(sel)) {
          rowSel = sel
          break
        }
      } catch {
        /* invalid override */
      }
    }
    if (!rowSel) {
      closeSessionMenu()
      $stats.set({ on: cfg.on, rows: 0, styled: 0, hook: 'no match', states: {}, profiles: [], warnings: ['لم يُعثر على أي صف جلسة / no session row matched'], lastRun: Date.now(), error: '' })
      runtime.busy = false
      return
    }
    hook = rowSel

    /* pass 1 — describe every row */
    const list = []
    for (const row of document.querySelectorAll(rowSel)) {
      if (!(row instanceof Element)) continue
      if (row.hasAttribute('data-hms-preview')) continue
      rows += 1
      const shell = row.parentElement instanceof Element ? row.parentElement : row
      const dot = row.querySelector(selList(hooks.dot))
      const state = detectState(row, shell, dot) || 'idle'
      const profile = detectProfile(shell, hooks.profileGlyph)
      const title = readTitle(row, hooks.label)
      const stem = readStem(row, hooks.stem)
      const override = overrideFor(cfg, profile, title)
      const mode = cfg.icons.mode
      const info = {
        dot,
        hidden: false,
        icon: '',
        iconSource: '',
        color: '',
        own: 'state',
        override,
        profile,
        row,
        selected: isSelectedRow(shell),
        shell,
        state,
        stem,
        title
      }
      /* baseline: the state icon */
      if (mode !== 'dot') info.icon = cfg.icons.byState?.[state] || ''
      /* rules */
      for (const rule of cfg.rules || []) {
        if (!ruleMatches(rule, info)) continue
        if (rule.icon) {
          info.icon = rule.icon
          info.own = 'rule'
        }
        if (rule.color) info.color = rule.color
        if (rule.hide) info.hidden = true
      }
      /* per-conversation override wins over every rule */
      if (override) {
        if (override.icon) {
          info.icon = override.icon
          info.own = 'session'
        }
        if (override.color) info.color = override.color
        if (override.hide) info.hidden = true
      }
      list.push(info)
    }

    /* pass 2 — branch inheritance: a child takes its parent's icon. The list is
     * depth-first, so the row right before a child IS its parent (and a branch
     * of a branch inherits through the chain). */
    if (cfg.inheritBranch) {
      let parent = null
      for (const info of list) {
        if (info.stem && parent && info.own !== 'session' && info.own !== 'rule') {
          if (parent.icon) {
            info.icon = parent.icon
            info.iconSource = 'parent'
            info.own = 'parent'
          }
          if (!info.color && parent.color) info.color = parent.color
        }
        parent = info
      }
    }

    /* pass 3 — apply to the DOM */
    for (const info of list) {
      const { shell, dot, state, profile, title } = info
      if (!info.iconSource) info.iconSource = info.own

      /* the conversation you are in can look different */
      if (info.selected) {
        if (cfg.selected?.icon) {
          info.icon = cfg.selected.icon
          info.iconSource = 'selected'
        }
        if (cfg.selected?.color) info.color = cfg.selected.color
      }

      if (shell.getAttribute('data-hms-state') !== state) shell.setAttribute('data-hms-state', state)
      if (profile) {
        if (shell.getAttribute('data-hms-profile') !== profile) shell.setAttribute('data-hms-profile', profile)
        profiles.add(profile)
      } else if (shell.hasAttribute('data-hms-profile')) {
        shell.removeAttribute('data-hms-profile')
      }
      shell.setAttribute('data-hms-row', '1')
      shell.setAttribute('data-hms-owned', '1')
      if (info.selected) shell.setAttribute('data-hms-selected', '1')
      else shell.removeAttribute('data-hms-selected')
      if (info.stem) shell.setAttribute('data-hms-branch', '1')
      else shell.removeAttribute('data-hms-branch')
      if (dot) {
        dot.setAttribute('data-hms-dot', '1')
        dot.setAttribute('data-hms-owned', '1')
      }
      if (info.hidden) shell.setAttribute('data-hms-hidden', '1')
      else shell.removeAttribute('data-hms-hidden')

      if (info.color) shell.style.setProperty('--hms-icon-rule', info.color)
      else shell.style.removeProperty('--hms-icon-rule')

      const mode = cfg.icons.mode
      const lead = info.row.querySelector(selList(hooks.lead))
      if (lead) {
        lead.setAttribute('data-hms-owned', '1')
        ensureIcon(lead, info.icon, mode === 'codicon' ? 'codicon' : 'emoji')
      }
      if (cfg.selected?.size && info.selected) shell.style.setProperty('--hms-icon-size', `${cfg.selected.size}px`)
      else shell.style.removeProperty('--hms-icon-size')

      ensureRowButton(info, hooks, cfg.rowMenu)
      if (info.icon) styled += 1
      states[state] = (states[state] || 0) + 1

      snapshot.push({
        branch: Boolean(info.stem),
        custom: Boolean(info.override),
        icon: info.icon,
        key: sessionKey(profile, title),
        profile: profile || '',
        selected: info.selected,
        source: info.iconSource,
        state,
        title
      })
    }
  } catch (err) {
    warnings.push(String((err && err.message) || err))
  } finally {
    runtime.busy = false
    $stats.set({
      on: cfg.on,
      rows,
      styled,
      hook,
      states,
      profiles: Array.from(profiles).sort(),
      warnings,
      lastRun: Date.now(),
      error: ''
    })
    $rows.set(snapshot)
    runtime.quietUntil = Date.now() + 120
  }
}

/* ---------------------------------------------------------------------------
 * Lifecycle
 * ------------------------------------------------------------------------ */
function isOurs(node) {
  try {
    return node instanceof Element ? Boolean(node.closest('[data-hms-owned]')) : false
  } catch {
    return false
  }
}

function schedule() {
  if (runtime.dead) return
  if (runtime.debounce) clearTimeout(runtime.debounce)
  runtime.debounce = setTimeout(() => {
    runtime.debounce = null
    applyAll()
  }, 150)
}

function onMutations(records) {
  if (runtime.dead || runtime.busy) return
  if (Date.now() < (runtime.quietUntil || 0)) return
  for (const record of records) {
    if (!isRelevant(record)) continue
    schedule()
    return
  }
}

/** Our own writes must not re-trigger the pass (infinite loop), but a React
 *  re-render that drops an injected icon must — so childList churn inside a
 *  stamped node counts when the added/removed nodes are not ours. */
function isRelevant(record) {
  try {
    if (record.type === 'childList') {
      for (const node of record.removedNodes) {
        if (node instanceof Element && (node.classList?.contains('hms-icon') || node.hasAttribute?.('data-hms-owned'))) return true
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element && !node.classList?.contains('hms-icon') && !node.hasAttribute?.('data-hms-owned')) return true
      }
      return false
    }
    return !isOurs(record.target)
  } catch {
    return true
  }
}

function applyAll() {
  if (runtime.dead) return
  const cfg = $config.get()
  if (!cfg.on) {
    detach()
    removeStyle()
    $stats.set({ on: false, rows: 0, styled: 0, hook: 'off', states: {}, profiles: [], warnings: [], lastRun: Date.now(), error: '' })
    return
  }
  const hooks = resolveHooks(cfg)
  ensureStyle(cfg, hooks)
  annotate()
  attach()
}

function attach() {
  if (runtime.dead || runtime.observer || !document?.documentElement) return
  runtime.observer = new MutationObserver(onMutations)
  runtime.observer.observe(document.documentElement, {
    attributeFilter: ['class', 'data-working', 'aria-label', 'style', 'data-state'],
    attributes: true,
    childList: true,
    subtree: true
  })
  runtime.timer = setInterval(() => {
    if (runtime.dead) return
    if (!document.getElementById(STYLE_ID)) applyAll()
    else if (!runtime.busy) annotate()
  }, 4000)
  runtime.disposers.push(() => {
    runtime.observer?.disconnect()
    runtime.observer = null
    if (runtime.timer) clearInterval(runtime.timer)
    runtime.timer = null
  })
}

function detach() {
  for (const dispose of runtime.disposers.splice(0)) {
    try {
      dispose()
    } catch {
      /* ignore */
    }
  }
  if (runtime.debounce) {
    clearTimeout(runtime.debounce)
    runtime.debounce = null
  }
  /* strip every annotation we may have left behind */
  for (const attr of ['data-hms-row', 'data-hms-state', 'data-hms-profile', 'data-hms-dot', 'data-hms-owned', 'data-hms-hidden', 'data-hms-rule-color', 'data-hms-hide-dot', 'data-hms-selected', 'data-hms-branch']) {
    document.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr))
  }
  document.querySelectorAll('.hms-icon, .hms-rowbtn').forEach(node => node.remove())
  closeSessionMenu()
}

/* ---------------------------------------------------------------------------
 * Pane UI
 * ------------------------------------------------------------------------ */
function Row({ children, className }) {
  return jsx('div', { className: cn('flex items-center justify-between gap-2 py-1', className), children })
}

function Field({ children, hint, label }) {
  return jsxs('label', {
    className: 'flex flex-col gap-1',
    children: [
      jsxs('span', {
        className: 'flex items-center justify-between gap-2 text-[0.6875rem] text-(--ui-text-tertiary)',
        children: [jsx('span', { children: label }), hint ? jsx('span', { className: 'tabular-nums', children: hint }) : null]
      }),
      children
    ]
  })
}

function Slider({ max, min, onChange, step = 1, value }) {
  return jsx('input', {
    className: 'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-(--ui-bg-tertiary)',
    max,
    min,
    onChange: event => onChange(Number(event.target.value)),
    step,
    style: { accentColor: 'var(--ui-accent)' },
    type: 'range',
    value
  })
}

function ColorField({ onChange, value }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => setDraft(value || ''), [value])
  return jsxs('div', {
    className: 'flex flex-col gap-1',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-1',
        children: [
          jsx(Input, {
            className: 'h-6 min-w-0 flex-1 text-[0.6875rem]',
            onChange: event => {
              setDraft(event.target.value)
              onChange(event.target.value.trim())
            },
            placeholder: 'inherit / #hex / var(--token)',
            value: draft
          }),
          jsx('button', {
            'aria-label': 'clear',
            className: 'grid size-6 shrink-0 place-items-center rounded-[3px] text-(--ui-text-quaternary) hover:bg-(--ui-control-active-background)',
            onClick: () => {
              setDraft('')
              onChange('')
            },
            type: 'button',
            children: jsx(Codicon, { name: 'close', size: '0.75rem' })
          })
        ]
      }),
      jsx('div', {
        className: 'flex flex-wrap gap-1',
        children: COLOR_SWATCHES.map(color =>
          jsx(
            'button',
            {
              'aria-label': color,
              className: 'size-4 shrink-0 rounded-[3px] border border-(--ui-stroke-secondary)',
              onClick: () => {
                setDraft(color)
                onChange(color)
              },
              style: { backgroundColor: color },
              title: color,
              type: 'button'
            },
            color
          )
        )
      })
    ]
  })
}

function IconField({ mode, onChange, value }) {
  return jsxs('div', {
    className: 'flex flex-col gap-1',
    children: [
      jsx(Input, {
        className: 'h-6 text-[0.6875rem]',
        maxLength: 32,
        onChange: event => onChange(event.target.value.trim()),
        placeholder: mode === 'codicon' ? 'codicon name, e.g. rocket' : 'emoji / حرف',
        value: value || ''
      }),
      jsx('div', {
        className: 'flex flex-wrap gap-0.5',
        children: ICON_PALETTE.map(icon =>
          jsx(
            'button',
            {
              className: cn(
                'grid size-5 place-items-center rounded-[3px] text-[0.75rem] hover:bg-(--ui-control-active-background)',
                value === icon && 'bg-(--ui-control-active-background)'
              ),
              onClick: () => onChange(icon),
              type: 'button',
              children: icon
            },
            icon
          )
        )
      })
    ]
  })
}

/* A live preview that uses the REAL row markup, so the injected stylesheet
 * styles it exactly like it styles the sidebar. */
function PreviewRow({ state, title }) {
  const dotClass =
    state === 'working'
      ? 'size-1.5 rounded-full bg-(--ui-accent)'
      : state === 'unread'
        ? 'size-1.5 rounded-full bg-(--ui-success)'
        : state === 'needsInput'
          ? 'size-1.5 rounded-full bg-amber-500'
          : state === 'stalled'
            ? 'size-1.5 rounded-full border border-(--ui-accent)'
            : state === 'draft'
              ? 'size-1.5 rounded-full border border-(--ui-text-quaternary)'
              : 'size-1 rounded-full bg-(--ui-text-quaternary)'

  return jsx('div', {
    'data-hms-preview': '1',
    className: 'min-h-[1.625rem] pr-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md',
    children: jsxs('button', {
      className: 'pl-2 pr-2 gap-1.5 flex h-full min-w-0 items-center self-stretch py-0.5 bg-transparent text-left',
      'data-slot': 'row-button',
      type: 'button',
      children: [
        jsx('span', {
          className: 'grid size-3.5 shrink-0 place-items-center overflow-hidden',
          children: jsx('span', {
            className: 'flex items-center gap-0.5',
            children: jsx('span', { 'aria-hidden': 'true', className: dotClass })
          })
        }),
        jsx('span', {
          className: 'min-w-0 flex-1 self-center',
          children: jsx('span', {
            className: 'min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) leading-[1.35]',
            children: title
          })
        }),
        jsx('span', {
          className: 'pointer-events-none whitespace-nowrap text-[0.625rem] leading-none text-(--ui-text-tertiary)',
          children: '2m'
        })
      ]
    })
  })
}

function StylerPane() {
  const cfg = useValue($config)
  const stats = useValue($stats)
  const rows = useValue($rows)
  const [tab, setTab] = useState('sessions')
  const [hookDraft, setHookDraft] = useState(null)
  const [ruleDraft, setRuleDraft] = useState({ type: 'title', value: '', icon: '', color: '', hide: false })

  const patch = partial => setConfig(partial)

  return jsxs('div', {
    className: 'flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2 text-xs',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          jsxs('div', {
            className: 'flex min-w-0 items-center gap-1.5',
            children: [
              jsx('span', { className: 'truncate font-medium', children: 'Session Styler' }),
              jsx(Badge, { size: 'xs', variant: stats.on ? 'success' : 'muted', children: stats.on ? 'on' : 'off' }),
              jsx(Badge, { size: 'xs', variant: 'outline', children: `v${VERSION}` })
            ]
          }),
          jsx(Switch, {
            checked: cfg.on,
            onCheckedChange: value => setConfig({ on: value }),
            size: 'xs'
          })
        ]
      }),

      jsxs('div', {
        className: 'rounded-[3px] bg-(--ui-bg-tertiary) px-2 py-1 text-[0.625rem] leading-4 text-(--ui-text-tertiary)',
        children: [
          jsxs('div', {
            children: [
              'صفوف / rows: ',
              jsx('span', { className: 'tabular-nums text-(--ui-text-secondary)', children: String(stats.rows) }),
              ' · بأيقونة / iconed: ',
              jsx('span', { className: 'tabular-nums text-(--ui-text-secondary)', children: String(stats.styled) })
            ]
          }),
          jsxs('div', { children: ['hook: ', jsx('span', { className: 'font-mono', children: stats.hook })] }),
          jsxs('div', {
            children: [
              'load: ',
              jsx('span', {
                className: 'font-mono',
                children: `${runtime.loadedVersion || VERSION} @ ${(runtime.loadedAt || '').replace('T', ' ').slice(0, 16) || '—'}`
              })
            ]
          }),
          stats.profiles.length
            ? jsx('div', { className: 'truncate', children: `profiles: ${stats.profiles.join(', ')}` })
            : null,
          Object.keys(stats.states).length
            ? jsx('div', { children: `states: ${Object.entries(stats.states).map(([k, v]) => `${k}×${v}`).join(' ')}` })
            : null,
          stats.warnings.length
            ? jsx('div', { className: 'text-amber-500', children: stats.warnings.join(' · ') })
            : null
        ]
      }),

      jsxs('div', {
        className: 'flex flex-col gap-2',
        children: [
          jsx('div', { className: 'text-[0.625rem] uppercase text-(--ui-text-quaternary)', children: 'معاينة / preview' }),
          jsxs('div', {
            className: 'flex flex-col gap-0.5 rounded-md border border-(--ui-stroke-secondary) p-1',
            children: [
              jsx(PreviewRow, { state: 'idle', title: 'Idle session' }),
              jsx(PreviewRow, { state: 'working', title: 'Working session' }),
              jsx(PreviewRow, { state: 'unread', title: 'Unread session' })
            ]
          })
        ]
      }),

      jsx(SegmentedControl, {
        onChange: setTab,
        options: [
          { id: 'sessions', label: 'جلسات' },
          { id: 'icons', label: 'أيقونات' },
          { id: 'colors', label: 'ألوان' },
          { id: 'size', label: 'أحجام' },
          { id: 'rules', label: 'قواعد' },
          { id: 'adv', label: 'متقدم' }
        ],
        value: tab
      }),

      tab === 'sessions'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx(Row, {
                children: [
                  jsx('span', { children: 'وراثة أيقونة المحادثة الأم / branch inheritance' }),
                  jsx(Switch, { checked: cfg.inheritBranch, onCheckedChange: value => setConfig({ inheritBranch: value }), size: 'xs' })
                ]
              }),
              jsx(Row, {
                children: [
                  jsx('span', { children: 'زر ✦ في الصف / hover ✦ button' }),
                  jsx(Switch, { checked: cfg.rowMenu, onCheckedChange: value => setConfig({ rowMenu: value }), size: 'xs' })
                ]
              }),
              jsx('div', {
                className: 'rounded-[3px] bg-(--ui-bg-tertiary) px-2 py-1 text-[0.625rem] leading-4 text-(--ui-text-tertiary)',
                children: jsx('span', {
                  children: 'لتغيير أيقونة محادثة: اضغط ✦ عند المرور عليها (أو الأمر «أيقونة المحادثة المفتوحة» في ⌘K) واختر من القائمة. المحادثة الفرعية ترث أيقونة الأم تلقائيًا.'
                })
              }),
              jsx(Field, {
                label: 'أيقونة المحادثة المفتوحة / selected icon',
                children: jsx(IconField, {
                  mode: cfg.icons.mode,
                  onChange: value => setConfig({ selected: { icon: value } }),
                  value: cfg.selected?.icon || ''
                })
              }),
              jsx(Field, {
                label: 'لون أيقونة المحادثة المفتوحة / selected color',
                children: jsx(ColorField, { onChange: value => setConfig({ selected: { color: value } }), value: cfg.selected?.color || '' })
              }),
              jsx(Field, {
                hint: cfg.selected?.size ? `${cfg.selected.size}px` : 'تلقائي / auto',
                label: 'حجم أيقونة المحادثة المفتوحة / selected size',
                children: jsx(Slider, {
                  max: 26,
                  min: 0,
                  onChange: value => setConfig({ selected: { size: value } }),
                  step: 1,
                  value: cfg.selected?.size || 0
                })
              }),
              jsx(Separator, {}),
              jsxs('div', {
                className: 'flex items-center justify-between',
                children: [
                  jsx('span', { className: 'text-[0.625rem] uppercase text-(--ui-text-quaternary)', children: 'الجلسات الظاهرة / visible sessions' }),
                  jsx(Badge, { size: 'xs', variant: 'outline', children: String(rows.length) })
                ]
              }),
              rows.length
                ? rows.map(entry =>
                    jsxs('div', {
                      className: 'flex items-center gap-1.5 rounded-[3px] bg-(--ui-bg-tertiary) px-1.5 py-1',
                      children: [
                        jsx('span', { className: 'w-4 shrink-0 text-center text-[0.8125rem]', children: entry.icon || '·' }),
                        jsxs('span', {
                          className: 'flex min-w-0 flex-1 flex-col',
                          children: [
                            jsx('span', { className: 'truncate text-[0.6875rem]', children: entry.title || '(بدون عنوان)' }),
                            jsx('span', {
                              className: 'truncate text-[0.5625rem] text-(--ui-text-quaternary)',
                              children: `${entry.state} · ${entry.profile || '—'}${entry.branch ? ' · فرعية' : ''}${entry.selected ? ' · مفتوحة' : ''} · ${entry.source || '—'}`
                            })
                          ]
                        }),
                        jsx('button', {
                          className: 'shrink-0 rounded-[3px] px-1 py-px text-[0.5625rem] text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground',
                          onClick: () => {
                            const shell = findShellByTitle(entry.title)
                            if (shell) openSessionMenu(shell)
                            else host.notify({ kind: 'warn', message: 'الصف غير ظاهر الآن / row not visible' })
                          },
                          type: 'button',
                          children: entry.custom ? 'تعديل' : 'تخصيص'
                        })
                      ]
                    }, entry.key)
                  )
                : jsx('div', { className: 'text-[0.625rem] text-(--ui-text-quaternary)', children: 'لا صفوف ظاهرة / no rows' })
            ]
          })
        : null,

      tab === 'icons'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx(Field, {
                label: 'النمط / mode',
                children: jsx(SegmentedControl, {
                  onChange: mode => setConfig({ icons: { mode } }),
                  options: [
                    { id: 'dot', label: 'نقطة core' },
                    { id: 'emoji', label: 'إيموجي' },
                    { id: 'codicon', label: 'codicon' }
                  ],
                  value: cfg.icons.mode
                })
              }),
              cfg.icons.mode === 'dot'
                ? jsx('div', {
                    className: 'rounded-[3px] bg-(--ui-bg-tertiary) px-2 py-1 text-[0.625rem] text-(--ui-text-tertiary)',
                    children: 'النقطة الأصلية كما هي / core dot unchanged — اختر إيموجي أو codicon لاستبدالها.'
                  })
                : null,
              jsx(Field, {
                hint: `${cfg.icons.size}px`,
                label: 'حجم الأيقونة / icon size',
                children: jsx(Slider, { max: 24, min: 8, onChange: value => setConfig({ icons: { size: value } }), value: cfg.icons.size })
              }),
              cfg.icons.mode === 'dot'
                ? null
                : jsx('div', {
                    className: 'flex flex-col gap-2',
                    children: STATES.map(state =>
                      jsxs('div', {
                        className: 'flex flex-col gap-1 rounded-md border border-(--ui-stroke-secondary) p-1.5',
                        children: [
                          jsxs('div', {
                            className: 'flex items-center gap-1.5 text-[0.6875rem]',
                            children: [
                              jsx('span', { className: 'text-(--ui-text-secondary)', children: STATE_LABEL[state] }),
                              cfg.icons.byState?.[state]
                                ? jsx('span', { className: 'text-[0.8125rem]', children: cfg.icons.byState[state] })
                                : null
                            ]
                          }),
                          jsx(IconField, {
                            mode: cfg.icons.mode,
                            onChange: value => setConfig({ icons: { byState: { [state]: value } } }),
                            value: cfg.icons.byState?.[state] || ''
                          })
                        ]
                      }, state)
                    )
                  })
            ]
          })
        : null,

      tab === 'colors'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx(Row, {
                children: [
                  jsx('span', { children: 'تشغيل تعديل الألوان / enable colors' }),
                  jsx(Switch, { checked: cfg.colors.on, onCheckedChange: value => setConfig({ colors: { on: value } }), size: 'xs' })
                ]
              }),
              jsx('div', {
                className: 'text-[0.625rem] text-(--ui-text-quaternary)',
                children: 'فارغ = لون core الأصلي / empty keeps the core color.'
              }),
              STATES.map(state =>
                jsx(Field, {
                  label: `${STATE_LABEL[state]} — نقطة`,
                  children: jsx(ColorField, {
                    onChange: value => setConfig({ colors: { states: { [state]: value } } }),
                    value: cfg.colors.states?.[state] || ''
                  })
                }, `dot-${state}`)
              ),
              jsx(Separator, {}),
              jsx(Field, {
                label: 'لون الأيقونة / icon color (كل الحالات)',
                children: jsx(ColorField, { onChange: value => setConfig({ colors: { icon: value } }), value: cfg.colors.icon || '' })
              }),
              jsx(Field, {
                label: 'لون العنوان / title color',
                children: jsx(ColorField, { onChange: value => setConfig({ colors: { title: value } }), value: cfg.colors.title || '' })
              }),
              jsx(Field, {
                label: 'لون الأرقام/الوقت / meta color',
                children: jsx(ColorField, { onChange: value => setConfig({ colors: { meta: value } }), value: cfg.colors.meta || '' })
              }),
              jsx(Row, {
                children: [
                  jsx('span', { children: 'خلفية الصف / row tint' }),
                  jsx(Switch, { checked: cfg.colors.tint, onCheckedChange: value => setConfig({ colors: { tint: value } }), size: 'xs' })
                ]
              }),
              cfg.colors.tint
                ? jsxs('div', {
                    className: 'flex flex-col gap-2',
                    children: [
                      jsx(Field, {
                        label: 'لون الخلفية / tint color',
                        children: jsx(ColorField, { onChange: value => setConfig({ colors: { tintColor: value } }), value: cfg.colors.tintColor || '' })
                      }),
                      jsx(Field, {
                        hint: `${cfg.colors.tintStrength}%`,
                        label: 'شدة الخلفية / tint strength',
                        children: jsx(Slider, { max: 40, min: 4, onChange: value => setConfig({ colors: { tintStrength: value } }), value: cfg.colors.tintStrength })
                      })
                    ]
                  })
                : null
            ]
          })
        : null,

      tab === 'size'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx(Row, {
                children: [
                  jsx('span', { children: 'تشغيل تعديل الأحجام / enable sizes' }),
                  jsx(Switch, { checked: cfg.size.on, onCheckedChange: value => setConfig({ size: { on: value } }), size: 'xs' })
                ]
              }),
              jsxs('div', {
                className: 'flex gap-1',
                children: [
                  jsx(Button, { onClick: () => setConfig({ size: { ...PRESETS.compact.size } }), size: 'xs', variant: 'outline', children: 'مضغوط' }),
                  jsx(Button, { onClick: () => setConfig({ size: { ...PRESETS.roomy.size } }), size: 'xs', variant: 'outline', children: 'واسع' }),
                  jsx(Button, {
                    onClick: () => {
                      const sample = sampleGeometry()
                      if (sample) setConfig({ size: { ...sample, on: true } })
                      else host.notify({ kind: 'warn', message: 'لا يوجد صف للقياس / no row to measure' })
                    },
                    size: 'xs',
                    variant: 'outline',
                    children: 'قياس الحالي'
                  })
                ]
              }),
              jsx(Field, {
                hint: `${cfg.size.rowHeight}px`,
                label: 'ارتفاع الصف / row height',
                children: jsx(Slider, { max: 44, min: 18, onChange: value => setConfig({ size: { rowHeight: value } }), value: cfg.size.rowHeight })
              }),
              jsx(Field, {
                hint: `${cfg.size.label}px`,
                label: 'حجم العنوان / title size',
                children: jsx(Slider, { max: 18, min: 10, onChange: value => setConfig({ size: { label: value } }), value: cfg.size.label })
              }),
              jsx(Field, {
                hint: `${cfg.size.meta}px`,
                label: 'حجم الأرقام / meta size',
                children: jsx(Slider, { max: 15, min: 8, onChange: value => setConfig({ size: { meta: value } }), value: cfg.size.meta })
              }),
              jsx(Field, {
                hint: `${cfg.size.lead}px`,
                label: 'خلية الأيقونة / lead box',
                children: jsx(Slider, { max: 22, min: 10, onChange: value => setConfig({ size: { lead: value } }), value: cfg.size.lead })
              }),
              jsx(Field, {
                hint: `${cfg.size.gap}px`,
                label: 'المسافة / gap',
                children: jsx(Slider, { max: 14, min: 2, onChange: value => setConfig({ size: { gap: value } }), value: cfg.size.gap })
              }),
              jsx(Field, {
                hint: `${cfg.size.radius}px`,
                label: 'الحواف / radius',
                children: jsx(Slider, { max: 16, min: 0, onChange: value => setConfig({ size: { radius: value } }), value: cfg.size.radius })
              })
            ]
          })
        : null,

      tab === 'rules'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx('div', {
                className: 'text-[0.625rem] text-(--ui-text-tertiary)',
                children: 'قاعدة = مطابقة (نوع/قيمة) → أيقونة أو لون أو إخفاء. القواعد تُطبَّق على الصفوف الحقيقية فورًا.'
              }),
              jsxs('div', {
                className: 'flex flex-col gap-1 rounded-md border border-(--ui-stroke-secondary) p-1.5',
                children: [
                  jsx(SegmentedControl, {
                    onChange: type => setRuleDraft({ ...ruleDraft, type }),
                    options: [
                      { id: 'title', label: 'عنوان' },
                      { id: 'profile', label: 'بروفايل' },
                      { id: 'state', label: 'حالة' }
                    ],
                    value: ruleDraft.type
                  }),
                  jsx(Input, {
                    className: 'h-6 text-[0.6875rem]',
                    onChange: event => setRuleDraft({ ...ruleDraft, value: event.target.value }),
                    placeholder: ruleDraft.type === 'title' ? 'regex أو نص (مثال: odoo|pdf)' : ruleDraft.type === 'profile' ? 'اسم البروفايل' : STATES.join(' | '),
                    value: ruleDraft.value
                  }),
                  jsxs('div', {
                    className: 'flex items-center gap-1',
                    children: [
                      jsx(Input, {
                        className: 'h-6 w-14 text-[0.6875rem]',
                        onChange: event => setRuleDraft({ ...ruleDraft, icon: event.target.value.trim() }),
                        placeholder: 'أيقونة',
                        value: ruleDraft.icon
                      }),
                      jsx(Input, {
                        className: 'h-6 min-w-0 flex-1 text-[0.6875rem]',
                        onChange: event => setRuleDraft({ ...ruleDraft, color: event.target.value.trim() }),
                        placeholder: 'لون (#hex / var)',
                        value: ruleDraft.color
                      })
                    ]
                  }),
                  jsxs('div', {
                    className: 'flex items-center gap-2',
                    children: [
                      jsxs('button', {
                        className: 'flex items-center gap-1 text-[0.6875rem] text-(--ui-text-tertiary)',
                        onClick: () => setRuleDraft({ ...ruleDraft, hide: !ruleDraft.hide }),
                        type: 'button',
                        children: [
                          jsx('span', { children: ruleDraft.hide ? '☑' : '☐' }),
                          'إخفاء الصف / hide row'
                        ]
                      }),
                      jsx(Button, {
                        onClick: () => {
                          if (!ruleDraft.value.trim()) {
                            host.notify({ kind: 'warn', message: 'أدخل قيمة للقاعدة / needs a value' })
                            return
                          }
                          const rules = (cfg.rules || []).concat([{ ...ruleDraft, id: `r${Date.now().toString(36)}` }])
                          setConfig({ rules })
                          setRuleDraft({ type: ruleDraft.type, value: '', icon: '', color: '', hide: false })
                        },
                        size: 'xs',
                        variant: 'default',
                        children: 'إضافة قاعدة'
                      })
                    ]
                  })
                ]
              }),
              (cfg.rules || []).length
                ? (cfg.rules || []).map((rule, index) =>
                    jsxs('div', {
                      className: 'flex items-center gap-1.5 rounded-[3px] bg-(--ui-bg-tertiary) px-1.5 py-1',
                      children: [
                        jsx('span', { className: 'text-[0.6875rem] text-(--ui-text-quaternary)', children: rule.type }),
                        jsx('span', { className: 'min-w-0 flex-1 truncate font-mono text-[0.625rem]', children: rule.value }),
                        rule.icon ? jsx('span', { className: 'text-[0.8125rem]', children: rule.icon }) : null,
                        rule.hide ? jsx(Badge, { size: 'xs', variant: 'warn', children: 'hide' }) : null,
                        jsx('button', {
                          'aria-label': 'remove',
                          className: 'grid size-5 place-items-center rounded-[3px] text-(--ui-text-quaternary) hover:bg-(--ui-control-active-background)',
                          onClick: () => setConfig({ rules: (cfg.rules || []).filter((_, i) => i !== index) }),
                          type: 'button',
                          children: jsx(Codicon, { name: 'trash', size: '0.75rem' })
                        })
                      ]
                    }, rule.id || `${rule.type}-${index}`)
                  )
                : jsx('div', { className: 'text-[0.625rem] text-(--ui-text-quaternary)', children: 'لا توجد قواعد / no rules yet' })
            ]
          })
        : null,

      tab === 'adv'
        ? jsxs('div', {
            className: 'flex flex-col gap-2',
            children: [
              jsx('div', {
                className: 'text-[0.625rem] leading-4 text-(--ui-text-tertiary)',
                children: 'إن غيّر تحديثٌ ما بنية الواجهة، الصق مُحدِّدًا جديدًا هنا — بلا تعديل الملف. اتركه فارغًا للافتراضي.'
              }),
              ['row', 'label', 'meta', 'lead', 'dot', 'profileGlyph'].map(key => {
                const value = hookDraft?.[key] ?? cfg.hooks?.[key] ?? ''
                return jsx(Field, {
                  label: `${key} → ${HOOKS[key][0]}`,
                  children: jsx(Input, {
                    className: 'h-6 font-mono text-[0.625rem]',
                    onChange: event => setHookDraft({ ...(hookDraft || {}), [key]: event.target.value }),
                    placeholder: HOOKS[key][0],
                    value
                  })
                }, key)
              }),
              jsxs('div', {
                className: 'flex flex-wrap gap-1',
                children: [
                  jsx(Button, {
                    onClick: () => {
                      if (!hookDraft) return
                      const clean = {}
                      for (const [key, value] of Object.entries(hookDraft)) clean[key] = String(value || '').trim()
                      setConfig({ hooks: clean })
                      setHookDraft(null)
                      host.notify({ kind: 'info', message: 'تم تحديث المُحدِّدات / hooks updated' })
                    },
                    size: 'xs',
                    variant: 'default',
                    children: 'حفظ المُحدِّدات'
                  }),
                  jsx(Button, {
                    onClick: () => {
                      setConfig({ hooks: {} })
                      setHookDraft(null)
                    },
                    size: 'xs',
                    variant: 'outline',
                    children: 'افتراضي'
                  }),
                  jsx(Button, {
                    onClick: () => {
                      const payload = JSON.stringify({ version: VERSION, config: $config.get(), stats: $stats.get() }, null, 2)
                      const done = copyToClipboard(payload)
                      host.notify({ kind: done ? 'info' : 'warn', message: done ? 'تم نسخ التشخيص / diagnostics copied' : 'الحافظة غير متاحة / clipboard unavailable' })
                    },
                    size: 'xs',
                    variant: 'outline',
                    children: 'نسخ التشخيص'
                  }),
                  jsx(Button, {
                    onClick: () => {
                      resetConfig()
                      host.notify({ kind: 'info', message: 'تمت الاستعادة / reset' })
                    },
                    size: 'xs',
                    variant: 'outline',
                    children: 'استعادة'
                  })
                ]
              }),
              jsx(Separator, {}),
              jsx('div', { className: 'text-[0.625rem] uppercase text-(--ui-text-quaternary)', children: 'تصدير/استيراد JSON' }),
              jsx('textarea', {
                className: 'h-24 w-full resize-none rounded-[3px] border border-(--ui-stroke-secondary) bg-transparent p-1 font-mono text-[0.625rem] outline-none',
                id: 'hms-config-json',
                placeholder: 'config JSON',
                readOnly: false,
                spellCheck: false,
                defaultValue: ''
              }),
              jsxs('div', {
                className: 'flex gap-1',
                children: [
                  jsx(Button, {
                    onClick: () => {
                      const el = document.getElementById('hms-config-json')
                      if (el) el.value = JSON.stringify($config.get(), null, 2)
                    },
                    size: 'xs',
                    variant: 'outline',
                    children: 'عرض الحالي'
                  }),
                  jsx(Button, {
                    onClick: () => {
                      const el = document.getElementById('hms-config-json')
                      if (!el || !el.value.trim()) return
                      try {
                        const parsed = JSON.parse(el.value)
                        setConfig(parsed)
                        host.notify({ kind: 'info', message: 'تم الاستيراد / imported' })
                      } catch (err) {
                        host.notify({ kind: 'error', message: `JSON غير صالح: ${(err && err.message) || err}` })
                      }
                    },
                    size: 'xs',
                    variant: 'default',
                    children: 'استيراد'
                  })
                ]
              }),
              jsx('div', {
                className: 'text-[0.625rem] text-(--ui-text-quaternary)',
                children: `${ID} v${VERSION} · hooks overridden: ${stats.hook}`
              })
            ]
          })
        : null
    ]
  })
}

function sampleGeometry() {
  try {
    const row = document.querySelector('[data-hms-row]') || document.querySelector(HOOKS.row[0])
    if (!row) return null
    const shell = row.parentElement || row
    const label = row.querySelector(HOOKS.label[0])
    const meta = row.querySelector(HOOKS.meta[0])
    const lead = row.querySelector(HOOKS.lead[0])
    const shellStyle = getComputedStyle(shell)
    const bodyStyle = getComputedStyle(row)
    return {
      rowHeight: Math.round(parseFloat(shellStyle.minHeight) || 26),
      radius: Math.round(parseFloat(shellStyle.borderRadius) || 6),
      gap: Math.round(parseFloat(bodyStyle.columnGap || bodyStyle.gap) || 6),
      label: label ? Math.round(parseFloat(getComputedStyle(label).fontSize) || 13) : 13,
      meta: meta ? Math.round(parseFloat(getComputedStyle(meta).fontSize) || 10) : 10,
      lead: lead ? Math.round(parseFloat(getComputedStyle(lead).width) || 14) : 14
    }
  } catch {
    return null
  }
}

function StylerChip() {
  const stats = useValue($stats)
  return jsx(Tip, {
    label: 'Session Styler — اضغط للتبديل / click to toggle',
    children: jsx('button', {
      className: cn(
        'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      onClick: () => {
        haptic('tap')
        setConfig({ on: !$config.get().on })
      },
      type: 'button',
      children: [
        jsx(Codicon, { name: stats.on ? 'paintcan' : 'circle-slash', size: '0.75rem' }),
        jsx('span', { children: `${stats.rows}/${stats.styled}` })
      ]
    })
  })
}

/* ---------------------------------------------------------------------------
 * Plugin
 * ------------------------------------------------------------------------ */
export default {
  id: ID,
  name: 'Session Styler',
  register(ctx) {
    store = ctx.storage
    runtime.os = ctx.os || null
    try {
      const saved = store?.get?.(STORE_KEY, null)
      if (saved && typeof saved === 'object') $config.set(merge(DEFAULTS, saved))
    } catch {
      /* corrupt entry → defaults */
    }

    /* Load beacon: the app writing this proves the plugin file was really
     * loaded (and when) — a missing beacon is the fastest way to tell "did the
     * app pick it up?" from the pane's diagnostics line. */
    try {
      runtime.loadedAt = store?.get?.('loadedAt', null) || null
      runtime.loadedVersion = store?.get?.('loadedVersion', null) || null
      store?.set?.('loadedAt', new Date().toISOString())
      store?.set?.('loadedVersion', VERSION)
    } catch {
      /* persistence is best-effort */
    }

    /* Hot reload / re-activate runs register() again in a NEW module instance
     * while the previous one's MutationObserver and safety-net timer are still
     * alive — the app disposes what went through `ctx`, not module scope. Hand
     * the old incarnation's teardown over before painting, or two instances
     * annotate the same DOM with different configs and the icons flicker back.
     * (`ctx.onDispose` is used when the shell provides it; the window marker is
     * the belt for shells that don't.) */
    if (typeof window !== 'undefined' && typeof window.__hermesSessionStylerCleanup === 'function') {
      try {
        window.__hermesSessionStylerCleanup()
      } catch {
        /* the previous incarnation is already gone */
      }
    }
    const cleanup = () => {
      /* DEAD, not just detached: a MutationObserver callback or a timer already
       * scheduled would otherwise re-arm this incarnation on the next tick and
       * two instances would fight over the same rows. */
      runtime.dead = true
      if (runtime.debounce) {
        clearTimeout(runtime.debounce)
        runtime.debounce = null
      }
      detach()
      removeStyle()
      closeSessionMenu()
    }
    if (typeof window !== 'undefined') window.__hermesSessionStylerCleanup = cleanup
    if (typeof ctx.onDispose === 'function') {
      try {
        ctx.onDispose(cleanup)
      } catch {
        /* older shells */
      }
    }

    /* First paint: the app may still be mounting, so kick once now and once
     * after the shell settles — then SAY SO, once. A plugin that loads but
     * changes nothing on screen is indistinguishable from one that never
     * loaded, so the load reports itself and its match count. */
    applyAll()
    setTimeout(() => applyAll(), 800)
    setTimeout(() => {
      const stats = $stats.get()
      if (!stats.on) return
      if (stats.rows > 0) {
        host.notify({ kind: 'info', message: `Session Styler v${VERSION} · ${stats.rows} صف · ${stats.styled} أيقونة — ⌘K للتحكم` })
      } else {
        host.notify({ kind: 'warn', message: `Session Styler v${VERSION}: لم يُعثر على صفوف الجلسات (rows: 0) — افتح اللوحة → متقدم` })
      }
    }, 1400)

    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'session styler',
      data: { placement: 'right', width: '300px' },
      render: () => jsx(StylerPane, {})
    })

    ctx.register({
      id: 'chip',
      area: STATUSBAR_AREAS.right,
      order: 140,
      render: () => jsx(StylerChip, {})
    })

    ctx.registerMany([
      {
        id: 'toggle',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.toggle`,
          label: 'Session Styler: تشغيل/إيقاف',
          keywords: ['session', 'styler', 'icons', 'أيقونات', 'ألوان'],
          run: () => setConfig({ on: !$config.get().on })
        }
      },
      {
        id: 'compact',
        area: PALETTE_AREA,
        data: { id: `${ID}.compact`, label: 'Session Styler: صفوف مضغوطة', keywords: ['compact'], run: () => setConfig({ size: { ...PRESETS.compact.size } }) }
      },
      {
        id: 'roomy',
        area: PALETTE_AREA,
        data: { id: `${ID}.roomy`, label: 'Session Styler: صفوف واسعة', keywords: ['roomy', 'large'], run: () => setConfig({ size: { ...PRESETS.roomy.size } }) }
      },
      {
        id: 'emojis',
        area: PALETTE_AREA,
        data: { id: `${ID}.emoji`, label: 'Session Styler: أيقونات إيموجي للحالات', keywords: ['emoji', 'icons'], run: () => setConfig({ icons: { mode: 'emoji' } }) }
      },
      {
        id: 'current',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.current`,
          label: 'Session Styler: أيقونة المحادثة المفتوحة',
          keywords: ['icon', 'session', 'conversation', 'أيقونة', 'محادثة'],
          run: () => {
            const shell = document.querySelector('[data-hms-selected]')
            if (!shell) {
              host.notify({ kind: 'warn', message: 'لم أجد المحادثة المفتوحة / no active conversation row' })
              return
            }
            openSessionMenu(shell)
          }
        }
      },
      {
        id: 'reset',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.reset`,
          label: 'Session Styler: استعادة الافتراضي',
          keywords: ['reset'],
          run: () => {
            resetConfig()
            host.notify({ kind: 'info', message: 'Session Styler: تمت الاستعادة' })
          }
        }
      },
      {
        id: 'diag',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.diagnostics`,
          label: 'Session Styler: نسخ التشخيص',
          keywords: ['diagnostics', 'hooks'],
          run: () => {
            const payload = JSON.stringify({ version: VERSION, config: $config.get(), stats: $stats.get(), hooks: HOOKS }, null, 2)
            const ok = copyToClipboard(payload)
            host.notify({ kind: ok ? 'info' : 'warn', message: ok ? 'تم نسخ التشخيص / copied' : 'الحافظة غير متاحة / clipboard unavailable' })
          }
        }
      },
      {
        id: 'hooks',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.hooks`,
          label: 'Session Styler: فحص المُحدِّدات',
          keywords: ['hooks', 'check', 'تحديث'],
          run: () => {
            const stats = $stats.get()
            host.notify({
              kind: stats.rows > 0 ? 'info' : 'error',
              message: stats.rows > 0 ? `hooks OK — ${stats.rows} صف · ${stats.styled} أيقونة` : 'لم يُعثر على صفوف — افتح تبويب «متقدم» في لوحة session styler'
            })
          }
        }
      }
    ])
  }
}
