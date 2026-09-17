/**
 * Harness: boots session-styler/plugin.js inside a jsdom document whose session
 * list mirrors the real Hermes Desktop markup, then asserts what the plugin did.
 *
 *   node run-tests.mjs [path/to/plugin.js]
 */
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { copyFileSync, readFileSync } from 'node:fs'

import { ARABIC_TITLE, BRANCH_ROWS, DEFAULT_ROWS, ROW_HTML } from './fixture.mjs'

const PLUGIN_PATH = process.argv[2] || '/opt/data/profiles/system-update/desktop-plugins/session-styler/plugin.js'
const SDK = await import('@hermes/plugin-sdk')

let failures = 0
const results = []
const check = (name, condition, detail = '') => {
  results.push({ detail, name, ok: Boolean(condition) })
  if (!condition) failures += 1
}

/* ---------------------------------------------------------------- jsdom boot */
const dom = new JSDOM(`<!doctype html><html><head></head><body>${ROW_HTML(DEFAULT_ROWS)}</body></html>`, {
  pretendToBeVisual: true,
  url: 'http://localhost/'
})
const { window } = dom
/* Timers stay Node's own: aliasing jsdom's window.setTimeout makes jsdom's
 * timer path re-enter itself through the global. */
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'CSS', 'CustomEvent', 'Event', 'navigator']) {
  if (window[key] === undefined) continue
  try {
    globalThis[key] = window[key]
  } catch {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key], writable: true })
  }
}
globalThis.document = window.document

/* The plugin is loaded from this harness's own folder so that its
 * `@hermes/plugin-sdk` import resolves to the stub in ./node_modules. */
const LOCAL_PLUGIN = new URL('./plugin.under-test.mjs', import.meta.url)
copyFileSync(PLUGIN_PATH, LOCAL_PLUGIN)
const source = readFileSync(PLUGIN_PATH, 'utf8')
const VERSION_IN_SOURCE = (source.match(/const VERSION = '([^']+)'/) || [])[1]
const plugin = (await import(`${LOCAL_PLUGIN.href}?t=${Date.now()}`)).default

/* ------------------------------------------------------------ fake plugin ctx */
const registrations = []
const saved = []
const ctx = {
  source: 'plugin:session-styler',
  register: contribution => {
    registrations.push(contribution)
    return () => undefined
  },
  registerMany: list => {
    for (const contribution of list) registrations.push(contribution)
    return () => undefined
  },
  rest: async () => ({}),
  socket: () => () => undefined,
  onEvent: () => () => undefined,
  os: { writeClipboard: text => SDK.clipboard.push(text) },
  i18n: {
    register: bundles => SDK.pluginI18n.register('session-styler', bundles),
    /* ctx.i18n.t is the module-level, locale-aware translator */
    t: (key, ...args) => SDK.translateNow('session-styler', key, ...args)
  },
  storage: {
    get: (key, fallback) => {
      const hit = saved.filter(entry => entry.key === key).pop()
      return hit ? hit.value : fallback
    },
    set: (key, value) => saved.push({ key, value }),
    remove: key => {
      saved.push({ key, value: undefined })
    }
  }
}

/* Boot a fresh plugin instance the way the app does a reload: unload the
 *  previous one first, so two instances never annotate the same DOM with
 *  different configs. */
const instances = []
async function boot(config, { rows = null, server = null } = {}) {
  /* Unload the previous incarnation through the SAME handle a reload uses
   * (ctx.onDispose → window.__hermesSessionStylerCleanup), so one process can
   * host many boots without them annotating the same DOM. */
  if (typeof window.__hermesSessionStylerCleanup === 'function') window.__hermesSessionStylerCleanup()
  await new Promise(resolve => setTimeout(resolve, 60))
  if (rows) document.body.innerHTML = ROW_HTML(rows)
  /* a fresh canned gateway per section, so a previous section's mirror can't
   * leak into this one's config (that leak is exactly what the pull does) */
  SDK.rpc.calls.length = 0
  SDK.rpc.profiles = [{ name: 'odoo', ui_meta: server ? { 'session-styler': server } : {} }]
  saved.push({ key: 'config', value: { updatedAt: Date.now(), ...config } })
  const regs = []
  const localCtx = {
    ...ctx,
    register: contribution => {
      regs.push(contribution)
      return () => undefined
    },
    registerMany: list => {
      for (const contribution of list) regs.push(contribution)
      return () => undefined
    }
  }
  const mod = (await import(`${LOCAL_PLUGIN.href}?boot=${Date.now()}-${Math.round(Math.random() * 1e6)}`)).default
  mod.register(localCtx)
  await new Promise(resolve => setTimeout(resolve, 180))
  const instance = {
    mod,
    palette: id => regs.find(entry => entry.area === SDK.PALETTE_AREA && entry.data?.id === `session-styler.${id}`),
    regs
  }
  instances.push(instance)
  return instance
}

/* --------------------------------------------------------------------- boot */
check('plugin id', plugin.id === 'session-styler', plugin.id)
check('plugin has register()', typeof plugin.register === 'function')
plugin.register(ctx)
await new Promise(resolve => setTimeout(resolve, 50))

const doc = window.document
const rows = () => doc.querySelectorAll('[data-slot="row-button"]')
const shells = () => doc.querySelectorAll('[data-hms-row]')
const styleNode = () => doc.getElementById('hermes-session-styler-style')

const palette = id => registrations.find(entry => entry.area === SDK.PALETTE_AREA && entry.data?.id === `session-styler.${id}`)
instances.push({ mod: plugin, palette, regs: registrations })

/* ---------------------------------------------------------- 1. contributions */
check('pane registered in PANES_AREA', registrations.some(entry => entry.area === SDK.PANES_AREA && entry.data?.placement === 'right'))
check('status-bar chip registered', registrations.some(entry => entry.area === SDK.STATUSBAR_AREAS.right))
check('palette commands registered (>=6)', registrations.filter(entry => entry.area === SDK.PALETTE_AREA).length >= 6)

/* -------------------------------------------------------- 2. stylesheet + vars */
check('style element injected', Boolean(styleNode()))
check('style is idempotent (one node)', doc.querySelectorAll('#hermes-session-styler-style').length === 1)
const css = styleNode()?.textContent || ''
check('stylesheet sets --hms-icon-size', css.includes('--hms-icon-size'))
check('stylesheet defines .hms-icon', css.includes('.hms-icon{'))
check('stylesheet hides core dot when an icon is set', css.includes('[data-hms-hide-dot] > span:not(.hms-icon)'))
check('stylesheet has no hardcoded background on rows', !/data-hms-row\{background-color:(?!var)/.test(css))

/* ------------------------------------------------------- 3. row annotations */
check('all rows annotated', shells().length === DEFAULT_ROWS.length, `${shells().length} of ${DEFAULT_ROWS.length}`)
const stateOf = shell => shell.getAttribute('data-hms-state')
const byTitle = title => {
  for (const shell of shells()) {
    const label = shell.querySelector('span[class*="text-[0.8125rem]"]')
    if (label?.textContent.trim() === title) return shell
  }
  return null
}
check('idle detected', stateOf(byTitle('Odoo sync report')) === 'idle', String(stateOf(byTitle('Odoo sync report'))))
check('working detected', stateOf(byTitle('Deploy Hermes update')) === 'working', String(stateOf(byTitle('Deploy Hermes update'))))
check('unread detected', stateOf(byTitle(ARABIC_TITLE)) === 'unread', String(stateOf(byTitle(ARABIC_TITLE))))
check('needs-input detected', stateOf(byTitle('Waiting for your approval')) === 'needsInput', String(stateOf(byTitle('Waiting for your approval'))))
check('draft detected', stateOf(byTitle('Empty draft')) === 'draft', String(stateOf(byTitle('Empty draft'))))
check('dot node stamped', doc.querySelectorAll('[data-hms-dot]').length === DEFAULT_ROWS.length, String(doc.querySelectorAll('[data-hms-dot]').length))
check('profile read from row chip', byTitle('Odoo sync report')?.getAttribute('data-hms-profile') === 'odoo', String(byTitle('Odoo sync report')?.getAttribute('data-hms-profile')))
check('profile-less row has no stamp', byTitle('Empty draft')?.hasAttribute('data-hms-profile') === false)

/* ------------------------------------------------- 3b. load toast (proof of load) */
for (let waited = 0; waited < 40 && !SDK.notifications.some(n => (n.message || '').includes('Session Styler v1.')); waited += 1) {
  await new Promise(resolve => setTimeout(resolve, 100))
}
const loadToast = SDK.notifications.find(n => (n.message || '').includes('Session Styler v1.'))
check('load toast reports rows + icons on load', Boolean(loadToast) && /\d+ rows/.test(loadToast.message), loadToast?.message)

/* --------------------------------------------------- 4. diagnostics via public API */
SDK.notifications.length = 0
palette('hooks')?.data.run()
const diag = SDK.notifications.at(-1)?.message || ''
check('palette "hooks" reports the row count', diag.includes(String(DEFAULT_ROWS.length)), diag)

/* -------------------------------------------------------- 5. icons rendering */
/* 1.0.1: visible by default — emoji icons on every non-idle state, the quiet
 * idle dot left alone. */
const DEFAULT_ICON_ROWS = DEFAULT_ROWS.filter(row => row.dotAttrs.includes('bg-') && !row.dotAttrs.includes('bg-(--ui-text-quaternary)') || row.dotAttrs.includes('border'))
check('default config iconifies the active states', doc.querySelectorAll('.hms-icon').length === 4, String(doc.querySelectorAll('.hms-icon').length))
check('default config leaves idle dots alone', !(byTitle('Odoo sync report')?.innerHTML.includes('hms-icon')))
check('default config works on the working row', Boolean(byTitle('Deploy Hermes update')?.innerHTML.includes('⚡')))

/* flip to emoji through the persisted config path (simulates the pane's toggle) */
const paneRender = registrations.find(entry => entry.area === SDK.PANES_AREA)?.render
check('pane renders without throwing', typeof paneRender === 'function' && renderToStaticMarkup(await paneRender()).length > 500)

/* drive the plugin through its own palette commands where possible */
SDK.notifications.length = 0
palette('emoji')?.data.run()
await new Promise(resolve => setTimeout(resolve, 250))
check('emoji mode injects one icon per state row', doc.querySelectorAll('.hms-icon').length >= 4, String(doc.querySelectorAll('.hms-icon').length))
check('working row got the ⚡ icon', byTitle('Deploy Hermes update')?.innerHTML.includes('⚡'))
check('idle row got no icon (empty byState)', !(byTitle('Odoo sync report')?.innerHTML.includes('hms-icon')))
/* 1.2.0: the leading mark is the icon PLUS the state beside it — the core dot
 * stays (shrunk), so a custom icon never costs you the status. */
const leadCell = byTitle('Deploy Hermes update')?.querySelector('span[class*="place-items-center"]')
check('lead shows the icon and keeps the state dot', Boolean(leadCell?.querySelector('.hms-icon')) && !leadCell?.hasAttribute('data-hms-hide-dot') && leadCell?.getAttribute('data-hms-state-mark') === 'dot')

/* ------------------------------------------------------------- 6. size preset */
SDK.notifications.length = 0
palette('compact')?.data.run()
await new Promise(resolve => setTimeout(resolve, 250))
const cssCompact = styleNode()?.textContent || ''
check('compact preset emits row height', cssCompact.includes('min-height:var(--hms-row-h)'))
check('compact preset emits label size', cssCompact.includes('--hms-label: 12px'))
check('compact preset survives as CSS only', doc.querySelectorAll('.hms-icon').length >= 4)

/* --------------------------------------------------------------- 7. fallbacks */
const dirty = window.document.createElement('div')
dirty.innerHTML = ROW_HTML([{ title: 'Fallback row', profile: 'google', dotAttrs: 'class="size-1.5 rounded-full bg-(--ui-accent)"' }])
document.body.appendChild(dirty)
/* Strip the primary hook from EVERY row (the realistic drift: the app renames
 * the slot) so the class-only fallback is the only selector that can match. */
for (const button of doc.querySelectorAll('[data-slot="row-button"]')) button.removeAttribute('data-slot')
await new Promise(resolve => setTimeout(resolve, 250))
check('class-only fallback hook still annotates every row', doc.querySelectorAll('[data-hms-row]').length === DEFAULT_ROWS.length + 1, String(doc.querySelectorAll('[data-hms-row]').length))
SDK.notifications.length = 0
palette('hooks')?.data.run()
check('diagnostics name the fallback hook in use', (SDK.notifications.at(-1)?.message || '').includes(String(DEFAULT_ROWS.length + 1)), SDK.notifications.at(-1)?.message)
/* put the primary hook back */
for (const shell of doc.querySelectorAll('[data-hms-row]')) shell.querySelector('button')?.setAttribute('data-slot', 'row-button')
await new Promise(resolve => setTimeout(resolve, 250))

/* ------------------------------------------------------------- 8. teardown */
SDK.notifications.length = 0
palette('toggle')?.data.run() /* turns styling off */
await new Promise(resolve => setTimeout(resolve, 250))
check('off removes the stylesheet', !styleNode())
check('off strips annotations', doc.querySelectorAll('[data-hms-row]').length === 0, String(doc.querySelectorAll('[data-hms-row]').length))
check('off removes injected icons', doc.querySelectorAll('.hms-icon').length === 0)
check('off keeps the core DOM intact', rows().length === DEFAULT_ROWS.length + 1, String(rows().length))
check('off leaves the core dots in place', doc.querySelectorAll('[class*="size-1.5"]').length > 0)
check('config persisted to ctx.storage', saved.some(entry => entry.key === 'config' && entry.value?.on === false))

palette('toggle')?.data.run() /* back on */
await new Promise(resolve => setTimeout(resolve, 250))
check('toggling back on re-annotates', doc.querySelectorAll('[data-hms-row]').length >= DEFAULT_ROWS.length)

/* --------------------------------------------------------------- 9. rules */
SDK.notifications.length = 0
const $configAtom = null
/* rules are exercised through the pane's persisted config: write then re-register */
await boot({ on: true, rules: [{ id: 'r1', type: 'title', value: `odoo|${ARABIC_TITLE.slice(-6)}`, icon: '🧾', color: '#f97316' }, { id: 'r2', type: 'profile', value: 'work-emails', hide: true }] })
check('title rule matched (regex over a non-Latin title)', Boolean(byTitle(ARABIC_TITLE)?.innerHTML.includes('🧾')))
check('title rule applied per-row color var', byTitle(ARABIC_TITLE)?.getAttribute('style')?.includes('--hms-icon-rule: #f97316'))
check('profile rule hid the row', byTitle('Waiting for your approval')?.getAttribute('data-hms-hidden') === '1')

/* ------------------------------------------------- 10. colors + codicon mode */
await boot({
    on: true,
    icons: { mode: 'codicon', size: 15, byState: { working: 'rocket' } },
    colors: { on: true, states: { unread: '#22c55e', needsInput: '#f97316' }, tint: true, tintColor: '#3b82f6', tintStrength: 18, title: 'var(--ui-text-primary)', meta: '#94a3b8' },
    size: { on: true, rowHeight: 30, label: 14, meta: 11, lead: 16, gap: 8, radius: 8 }
  })
const css3 = styleNode()?.textContent || ''
check('color: unread dot override emitted for the unread state only', css3.includes('[data-hms-row][data-hms-state="unread"] [data-hms-dot]') && css3.includes('--hms-dot-unread: #22c55e'))
check('color: needsInput dot override emitted', css3.includes('--hms-dot-needsInput: #f97316'))
check('color: row tint is a color-mix over the tint color', css3.includes('color-mix(in srgb, #3b82f6 18%, transparent)'))
check('color: title + meta overrides emitted', css3.includes('--hms-title: var(--ui-text-primary)') && css3.includes('--hms-meta: #94a3b8'))
check('size: every geometry var emitted', ['--hms-row-h: 30px', '--hms-lead: 16px', '--hms-gap: 8px', '--hms-radius: 8px', '--hms-label: 14px', '--hms-meta-size: 11px'].every(token => css3.includes(token)))
check('codicon mode injects an <i class="codicon codicon-…">', Boolean(byTitle('Deploy Hermes update')?.querySelector('i.hms-icon.codicon-rocket')))
check('codicon icon size uses the configured px', css3.includes('--hms-icon-size: 15px'))
check('no hardcoded colors leak into the plugin file', !/#[0-9a-f]{6}/i.test(source.replace(/COLOR_SWATCHES[\s\S]*?\]/, '').replace(/ICON_PALETTE[\s\S]*?\]/, '')), 'swatch/palette literals are the only hex values')

check('load beacon written to plugin storage', saved.some(entry => entry.key === 'loadedAt' && typeof entry.value === 'string') && saved.some(entry => entry.key === 'loadedVersion' && entry.value === VERSION_IN_SOURCE))

/* ------------------------------------------- 11. no-op safety on a drifted DOM */
await boot({ on: true }, { rows: [] })
check('drifted/empty DOM does not throw', true)
check('drifted DOM still injects the stylesheet', Boolean(styleNode()))

/* ------------------------------- 12. per-conversation overrides + ✦ menu */
await boot(
    { on: true, icons: { mode: 'emoji' }, sessionOverrides: { [`odoo::${ARABIC_TITLE}`]: { icon: '🧾' } } },
  { rows: DEFAULT_ROWS }
)
check('session override applies to that conversation only', Boolean(byTitle(ARABIC_TITLE)?.innerHTML.includes('🧾')))
check('other rows keep their state icon', Boolean(byTitle('Deploy Hermes update')?.innerHTML.includes('⚡')))

/* the ✦ button is injected into every row's actions column */
const firstShell = byTitle('Odoo sync report')
check('✦ affordance injected into the row actions', Boolean(firstShell?.querySelector('[data-row-actions] .hms-rowbtn')))
check('✦ affordance injected once per row', doc.querySelectorAll('.hms-rowbtn').length === DEFAULT_ROWS.length, String(doc.querySelectorAll('.hms-rowbtn').length))

/* clicking it opens the per-conversation menu */
const btn = firstShell.querySelector('.hms-rowbtn')
btn.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 200 }))
const menu = doc.querySelector('.hms-menu')
check('✦ opens the row menu', Boolean(menu))
check('menu is titled with the conversation', menu?.getAttribute('data-hms-menu') === 'Odoo sync report', String(menu?.getAttribute('data-hms-menu')))
const emojis = menu ? Array.from(menu.querySelectorAll('.hms-menu-emoji')) : []
check('menu offers the icon palette', emojis.length === 30, String(emojis.length))
/* pick an icon from the menu */
const pick = emojis.find(node => node.textContent === '📦')
pick.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise(resolve => setTimeout(resolve, 200))
await new Promise(resolve => setTimeout(resolve, 150))
check('picking an icon writes a per-conversation override', byTitle('Odoo sync report')?.querySelector('.hms-icon')?.textContent === '📦', `icon=${byTitle('Odoo sync report')?.querySelector('.hms-icon')?.textContent}`)
check('override persisted under sessionOverrides', saved.some(e => e.key === 'config' && e.value?.sessionOverrides?.['odoo::Odoo sync report']?.icon === '📦'))
/* "back to state" clears it — reopen the menu from the row's ✦ first, so the
 * test never depends on the menu that the pick itself re-rendered */
const star2 = byTitle('Odoo sync report')?.querySelector('.hms-rowbtn')
star2?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 200 }))
const fresh = doc.querySelector('.hms-menu')
const backBtn = fresh
  ? Array.from(fresh.querySelectorAll('.hms-menu-act')).find(node => node.textContent.includes('Back to the state icon'))
  : null
backBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise(resolve => setTimeout(resolve, 200))
check('back-to-state clears the override', !(saved.filter(e => e.key === 'config').at(-1)?.value?.sessionOverrides?.['odoo::Odoo sync report']), JSON.stringify(saved.filter(e => e.key === 'config').at(-1)?.value?.sessionOverrides))
check('clearing one override keeps the others', saved.filter(e => e.key === 'config').at(-1)?.value?.sessionOverrides?.[`odoo::${ARABIC_TITLE}`]?.icon === '🧾')
check('the row falls back to its state icon', !byTitle('Odoo sync report')?.querySelector('.hms-icon'))
check('menu closes on outside pointerdown', (() => {
  doc.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
  return !doc.querySelector('.hms-menu')
})())

/* --------------------------------------- 13. branch inheritance (└─ child) */
await boot(
  { on: true, icons: { mode: 'emoji', byState: { idle: '', working: '⚡', unread: '🟢' } }, inheritBranch: true, rowMenu: false, sessionOverrides: { 'odoo::Parent project': { icon: '📦' } } },
  { rows: BRANCH_ROWS }
)
const branchDebug = `rows=${doc.querySelectorAll('[data-hms-row]').length} titles=${Array.from(doc.querySelectorAll('span[class*="text-[0.8125rem]"]')).map(n => n.textContent.trim()).join('|')}`
const parentShell = byTitle('Parent project')
const childShell = byTitle('Branch child')
const deepShell = byTitle('Deep branch child')
check('parent keeps its own icon', Boolean(parentShell?.querySelector('.hms-icon')?.textContent === '📦'), branchDebug)
check('branch child inherits the parent icon', childShell?.querySelector('.hms-icon')?.textContent === '📦', `child=${childShell?.querySelector('.hms-icon')?.textContent} ${branchDebug}`)
check('branch child marked as such', childShell?.getAttribute('data-hms-branch') === '1')
check('deep branch child inherits through the chain', deepShell?.querySelector('.hms-icon')?.textContent === '📦', `deep=${deepShell?.querySelector('.hms-icon')?.textContent}`)
check('rowMenu=false removes the ✦ button', doc.querySelectorAll('.hms-rowbtn').length === 0)

/* a child with its own override wins over inheritance */
await boot(
  { on: true, icons: { mode: 'emoji', byState: { idle: '', working: '⚡', unread: '🟢' } }, inheritBranch: true, sessionOverrides: { 'odoo::Parent project': { icon: '📦' }, 'odoo::Branch child': { icon: '🧪' } } },
  { rows: BRANCH_ROWS }
)
check('child override beats inheritance', Boolean(byTitle('Branch child')?.innerHTML.includes('🧪')))
check('parent unaffected by the child override', Boolean(byTitle('Parent project')?.innerHTML.includes('📦')))

/* inheritance off → children fall back to their state icon */
await boot(
  { on: true, icons: { mode: 'emoji', byState: { idle: '', working: '⚡', unread: '🟢' } }, inheritBranch: false, sessionOverrides: { 'odoo::Parent project': { icon: '📦' } } },
  { rows: BRANCH_ROWS }
)
check('inheritance off → child shows its state icon', Boolean(byTitle('Branch child')?.innerHTML.includes('⚡')))

/* ------------------------------------------- 14. selected conversation look */
await boot(
  { on: true, icons: { mode: 'emoji', byState: { idle: '', unread: '🟢' } }, selected: { icon: '🎯', color: 'var(--ui-accent)', size: 20 } },
  { rows: DEFAULT_ROWS }
)
const selShell = byTitle('Odoo sync report')
check('selected row is stamped', selShell?.getAttribute('data-hms-selected') === '1')
check('selected row paints the configured icon', Boolean(selShell?.innerHTML.includes('🎯')))
check('selected row paints the configured size', (selShell?.getAttribute('style') || '').includes('--hms-icon-size: 20px'), selShell?.getAttribute('style'))
check('non-selected rows are untouched by the selected look', !byTitle('Weekly review')?.innerHTML.includes('🎯'))

/* --------------------------------------- 15. hot reload hands over cleanly */
/* A: plain dots (no icons). B: emoji icons. B is registered while A is still
 * live — if A's observer/timer survived, it would strip B's icons on any later
 * mutation (and vice versa). */
await boot({ on: true, icons: { mode: 'dot' } }, { rows: DEFAULT_ROWS })
check('no icons while in dot mode', doc.querySelectorAll('.hms-icon').length === 0, String(doc.querySelectorAll('.hms-icon').length))
await boot({ on: true, icons: { mode: 'emoji' } }, { rows: null })
check('reload paints with the new config', doc.querySelectorAll('.hms-icon').length >= 3, String(doc.querySelectorAll('.hms-icon').length))
check('reload leaves a teardown handle on the window', typeof window.__hermesSessionStylerCleanup === 'function')
/* a fresh row arrives after the reload — the live instance must style it */
const late = doc.createElement('div')
late.innerHTML = ROW_HTML([{ title: 'Row after reload', profile: 'odoo', dotAttrs: 'class="size-1.5 rounded-full bg-(--ui-success)"' }])
doc.body.appendChild(late)
await new Promise(resolve => setTimeout(resolve, 400))
check('a row appearing after the reload is styled by the live instance', late.querySelector('.hms-icon')?.textContent === '🟢', `icon=${late.querySelector('.hms-icon')?.textContent}`)
check('and the main list still has its icons', doc.querySelectorAll('.hms-icon').length >= 4, String(doc.querySelectorAll('.hms-icon').length))

/* ------------------------------------------- 16. the lead's three layouts */
await boot(
  { on: true, icons: { mode: 'emoji' }, lead: { enabled: true, state: 'glyph', stateSize: 8, gap: 4, stateByState: { working: '🟠' } } },
  { rows: DEFAULT_ROWS }
)
const glyphLead = byTitle('Deploy Hermes update')?.querySelector('span[class*="place-items-center"]')
check('glyph mode draws the state as a second node', Boolean(glyphLead?.querySelector('.hms-icon-state')))
check('glyph mode hides the core dot', glyphLead?.hasAttribute('data-hms-hide-dot') === true)
check('glyph state mark is stamped', glyphLead?.getAttribute('data-hms-state-mark') === 'glyph')
check('state mark size reaches the stylesheet', (styleNode()?.textContent || '').includes('--hms-state-size: 8px'))

await boot({ on: true, icons: { mode: 'emoji' }, lead: { enabled: false } }, { rows: DEFAULT_ROWS })
const dotLead = byTitle('Deploy Hermes update')?.querySelector('span[class*="place-items-center"]')
check('lead disabled → no injected icon', !dotLead?.querySelector('.hms-icon'))
check('lead disabled → the core dot is untouched', !dotLead?.hasAttribute('data-hms-hide-dot'))

/* ------------------------------------------------------- 17. plugin i18n */
check('ctx.i18n.register received both bundles', Boolean(SDK.pluginI18n) && renderToStaticMarkup(await registrations.find(e => e.area === SDK.PANES_AREA).render()).includes('Icons'))
SDK.pluginI18n.locale = 'ar'
const paneAr = renderToStaticMarkup(await registrations.find(e => e.area === SDK.PANES_AREA).render())
/* These two Arabic literals are the `ar` bundle's own strings (localization
 * data), asserted only to prove the locale switch works. */
check('pane follows the active locale (ar)', paneAr.includes('أيقونات') && !paneAr.includes('>Icons<'), paneAr.slice(0, 80))
SDK.pluginI18n.locale = 'en'
const paneEn = renderToStaticMarkup(await registrations.find(e => e.area === SDK.PANES_AREA).render())
check('pane follows the active locale (en)', paneEn.includes('>Icons<'))
check('pane offers a Help tab', paneEn.includes('>Help<'))
check('every locale bundle covers the help steps', (() => {
  const bundles = SDK.pluginI18nBundles('session-styler')
  return ['help1', 'help2', 'help3', 'help4', 'help5', 'help6'].every(key => typeof bundles.en?.[key] === 'string' && typeof bundles.ar?.[key] === 'string' && bundles.ar[key] !== bundles.en[key])
})())

/* --------------------------------------- 18. settings travel between machines */
await boot({ on: true, icons: { mode: 'emoji' }, sync: { on: true } }, { rows: DEFAULT_ROWS })
/* a real change (pick an icon from the row's ✦ menu) must reach the profile */
const syncStar = byTitle('Deploy Hermes update')?.querySelector('.hms-rowbtn')
syncStar?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
const syncMenu = doc.querySelector('.hms-menu')
syncMenu?.querySelectorAll('.hms-menu-emoji').forEach(node => {
  if (node.textContent === '🚀') node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
})
await new Promise(resolve => setTimeout(resolve, 2400))
const pushCall = SDK.rpc.calls.filter(call => call.method === 'profiles.configure').at(-1)
const pushedBlob = pushCall?.params?.ui_meta?.['session-styler']
check('a change is mirrored to the profile store', Boolean(pushedBlob))
check('the mirrored blob carries the per-conversation icons', pushedBlob?.sessionOverrides?.['system-update::Deploy Hermes update']?.icon === '🚀')
check('the mirror targets the active profile', pushCall?.params?.name === 'odoo', String(pushCall?.params?.name))

/* a NEW machine: empty local config, the server already holds the icons */
await boot(
  { on: true, sync: { on: true }, icons: { mode: 'dot' } },
  { rows: DEFAULT_ROWS, server: { plugin: 'session-styler', version: '1.2.0', updatedAt: Date.now() + 5000, icons: { mode: 'emoji' }, sessionOverrides: { 'system-update::Deploy Hermes update': { icon: '🚀' } } } }
)
await new Promise(resolve => setTimeout(resolve, 1800))
check('a fresh machine restores the per-conversation icons from the profile', byTitle('Deploy Hermes update')?.querySelector('.hms-icon')?.textContent === '🚀', `icon=${byTitle('Deploy Hermes update')?.querySelector('.hms-icon')?.textContent}`)
check('a fresh machine restores the style settings too', styleNode()?.textContent.includes('--hms-icon-size') && doc.querySelectorAll('.hms-icon').length >= 3, String(doc.querySelectorAll('.hms-icon').length))
check('the restore reports itself', SDK.notifications.some(n => (n.message || '').includes('restored')), JSON.stringify(SDK.notifications.at(-1)))

console.log('\nSession Styler — plugin harness\n' + '='.repeat(46))
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `  →  ${result.detail}` : ''}`)
}
console.log('='.repeat(46))
console.log(`${results.length - failures}/${results.length} passed`)
process.exit(failures === 0 ? 0 : 1)
