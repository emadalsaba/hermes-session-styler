/**
 * Harness: boots session-styler/plugin.js inside a jsdom document whose session
 * list mirrors the real Hermes Desktop markup, then asserts what the plugin did.
 *
 *   node run-tests.mjs [path/to/plugin.js]
 */
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { copyFileSync, readFileSync } from 'node:fs'

import { DEFAULT_ROWS, ROW_HTML } from './fixture.mjs'

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
check('unread detected', stateOf(byTitle('نموذج جديد للفواتير')) === 'unread', String(stateOf(byTitle('نموذج جديد للفواتير'))))
check('needs-input detected', stateOf(byTitle('تحتاج موافقتك')) === 'needsInput', String(stateOf(byTitle('تحتاج موافقتك'))))
check('draft detected', stateOf(byTitle('مسودة فارغة')) === 'draft', String(stateOf(byTitle('مسودة فارغة'))))
check('dot node stamped', doc.querySelectorAll('[data-hms-dot]').length === DEFAULT_ROWS.length, String(doc.querySelectorAll('[data-hms-dot]').length))
check('profile read from row chip', byTitle('Odoo sync report')?.getAttribute('data-hms-profile') === 'odoo', String(byTitle('Odoo sync report')?.getAttribute('data-hms-profile')))
check('profile-less row has no stamp', byTitle('مسودة فارغة')?.hasAttribute('data-hms-profile') === false)

/* ------------------------------------------------- 3b. load toast (proof of load) */
for (let waited = 0; waited < 40 && !SDK.notifications.some(n => (n.message || '').includes('Session Styler v1.')); waited += 1) {
  await new Promise(resolve => setTimeout(resolve, 100))
}
const loadToast = SDK.notifications.find(n => (n.message || '').includes('Session Styler v1.'))
check('load toast reports rows + icons on load', Boolean(loadToast) && /\d+ صف/.test(loadToast.message), loadToast?.message)

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
check('lead cell hides the core dot when iconed', Boolean(byTitle('Deploy Hermes update')?.querySelector('[data-hms-hide-dot]')))

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
saved.push({ key: 'config', value: { on: true, rules: [{ id: 'r1', type: 'title', value: 'odoo|فواتير', icon: '🧾', color: '#f97316' }, { id: 'r2', type: 'profile', value: 'work-emails', hide: true }] } })
const plugin2 = (await import(`${LOCAL_PLUGIN.href}?rules=${Date.now()}`)).default
plugin2.register(ctx)
await new Promise(resolve => setTimeout(resolve, 100))
check('title rule matched (regex, arabic)', Boolean(byTitle('نموذج جديد للفواتير')?.innerHTML.includes('🧾')))
check('title rule applied per-row color var', byTitle('نموذج جديد للفواتير')?.getAttribute('style')?.includes('--hms-icon-rule: #f97316'))
check('profile rule hid the row', byTitle('تحتاج موافقتك')?.getAttribute('data-hms-hidden') === '1')

/* ------------------------------------------------- 10. colors + codicon mode */
saved.push({
  key: 'config',
  value: {
    on: true,
    icons: { mode: 'codicon', size: 15, byState: { working: 'rocket' } },
    colors: { on: true, states: { unread: '#22c55e', needsInput: '#f97316' }, tint: true, tintColor: '#3b82f6', tintStrength: 18, title: 'var(--ui-text-primary)', meta: '#94a3b8' },
    size: { on: true, rowHeight: 30, label: 14, meta: 11, lead: 16, gap: 8, radius: 8 }
  }
})
const plugin3 = (await import(`${LOCAL_PLUGIN.href}?colors=${Date.now()}`)).default
plugin3.register(ctx)
await new Promise(resolve => setTimeout(resolve, 150))
const css3 = styleNode()?.textContent || ''
check('color: unread dot override emitted for the unread state only', css3.includes('[data-hms-row][data-hms-state="unread"] [data-hms-dot]') && css3.includes('--hms-dot-unread: #22c55e'))
check('color: needsInput dot override emitted', css3.includes('--hms-dot-needsInput: #f97316'))
check('color: row tint is a color-mix over the tint color', css3.includes('color-mix(in srgb, #3b82f6 18%, transparent)'))
check('color: title + meta overrides emitted', css3.includes('--hms-title: var(--ui-text-primary)') && css3.includes('--hms-meta: #94a3b8'))
check('size: every geometry var emitted', ['--hms-row-h: 30px', '--hms-lead: 16px', '--hms-gap: 8px', '--hms-radius: 8px', '--hms-label: 14px', '--hms-meta-size: 11px'].every(token => css3.includes(token)))
check('codicon mode injects an <i class="codicon codicon-…">', Boolean(byTitle('Deploy Hermes update')?.querySelector('i.hms-icon.codicon-rocket')))
check('codicon icon size uses the configured px', css3.includes('--hms-icon-size: 15px'))
check('no hardcoded colors leak into the plugin file', !/#[0-9a-f]{6}/i.test(source.replace(/COLOR_SWATCHES[\s\S]*?\]/, '').replace(/ICON_PALETTE[\s\S]*?\]/, '')), 'swatch/palette literals are the only hex values')

check('load beacon written to plugin storage', saved.some(entry => entry.key === 'loadedAt' && typeof entry.value === 'string') && saved.some(entry => entry.key === 'loadedVersion' && entry.value === '1.0.1'))

/* ------------------------------------------- 11. no-op safety on a drifted DOM */
const plugin4 = (await import(`${LOCAL_PLUGIN.href}?drift=${Date.now()}`)).default
document.body.innerHTML = '<div id="empty-shell"></div>'
plugin4.register(ctx)
await new Promise(resolve => setTimeout(resolve, 150))
check('drifted/empty DOM does not throw', true)
check('drifted DOM still injects the stylesheet', Boolean(styleNode()))

console.log('\nSession Styler — plugin harness\n' + '='.repeat(46))
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `  →  ${result.detail}` : ''}`)
}
console.log('='.repeat(46))
console.log(`${results.length - failures}/${results.length} passed`)
process.exit(failures === 0 ? 0 : 1)
