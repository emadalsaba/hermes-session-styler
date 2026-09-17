/**
 * Stand-in for @hermes/plugin-sdk, used only by the local test harness.
 * Mirrors the real exports the plugin imports, with the same shapes — plus the
 * plugin i18n registry and the gateway RPC door (profiles.list /
 * profiles.configure) the plugin needs for cross-machine settings.
 */
import { createElement, useSyncExternalStore } from 'react'

export const PANES_AREA = 'panes'
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const THEMES_AREA = 'themes'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
export const TITLEBAR_AREAS = { left: 'titlebar.left', center: 'titlebar.center', right: 'titlebar.right' }

export function atom(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set: next => {
      value = next
      for (const listener of listeners) listener(value)
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useValue($atom) {
  return useSyncExternalStore($atom.subscribe, $atom.get, $atom.get)
}

export function cn(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(' ')
}

export const notifications = []
export const clipboard = []

/* ---- plugin i18n (same resolution as core: active locale → en → key) ---- */
const pluginLocales = new Map()
export const pluginI18n = {
  register(id, bundles) {
    pluginLocales.set(id, { ...(pluginLocales.get(id) || {}), ...bundles })
  },
  locale: 'en'
}
function translateWith(id) {
  return (key, ...args) => {
    const bundles = pluginLocales.get(id) || {}
    const active = bundles[pluginI18n.locale] || {}
    const value = active[key] ?? bundles.en?.[key]
    return typeof value === 'function' ? value(...args) : value ?? key
  }
}
export function usePluginI18n(id) {
  return translateWith(id)
}

/** Module-level translator against the active locale (ctx.i18n.t in the app). */
export function translateNow(id, key, ...args) {
  return translateWith(id)(key, ...args)
}

/* ---- canned gateway: profiles.list / profiles.configure, recorded ---- */
export const rpc = { calls: [], profiles: [{ name: 'odoo', ui_meta: {} }] }

export const host = {
  state: {
    profile: { get: () => 'odoo', subscribe: () => () => undefined },
    gateway: { get: () => 'open', subscribe: () => () => undefined }
  },
  notify: input => notifications.push({ kind: input?.kind, message: input?.message }),
  notifyError: input => notifications.push({ kind: 'error', message: String(input) }),
  logs: () => undefined,
  navigate: () => undefined,
  onEvent: () => () => undefined,
  request: async (method, params) => {
    rpc.calls.push({ method, params })
    if (method === 'profiles.list') {
      return { profiles: rpc.profiles }
    }
    if (method === 'profiles.configure') {
      const target = rpc.profiles.find(row => row.name === (params?.name || 'odoo')) || rpc.profiles[0]
      target.ui_meta = { ...(target.ui_meta || {}), ...(params?.ui_meta || {}) }
      return { ok: true, applied: { ui_meta: true } }
    }
    return {}
  }
}

export function haptic() {}

export function Tip({ children }) {
  return children
}

export function Button({ children, ...rest }) {
  const { size, variant, ...domProps } = rest
  return createElement('button', { type: 'button', ...domProps }, children)
}

export function Input({ children, ...rest }) {
  const { containerClassName, prefix, suffix, ...domProps } = rest
  return createElement('input', domProps)
}

export function Switch({ checked, onCheckedChange, size, ...rest }) {
  return createElement('button', {
    ...rest,
    'aria-checked': checked ? 'true' : 'false',
    onClick: () => onCheckedChange?.(!checked),
    role: 'switch',
    type: 'button'
  })
}

export function SegmentedControl({ onChange, options, value }) {
  return createElement(
    'div',
    { role: 'tablist' },
    options.map(option =>
      createElement(
        'button',
        { 'data-active': option.id === value, key: option.id, onClick: () => onChange(option.id), type: 'button' },
        option.label
      )
    )
  )
}

export function Badge({ children }) {
  return createElement('span', null, children)
}

export function Separator() {
  return createElement('hr')
}

export function Codicon({ name, size }) {
  return createElement('i', { className: `codicon codicon-${name}`, 'data-size': size })
}
