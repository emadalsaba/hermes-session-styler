/**
 * Stand-in for @hermes/plugin-sdk, used only by the local test harness.
 * Mirrors the real exports the plugin imports, with the same shapes.
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

export const host = {
  state: {
    profile: { get: () => 'default', subscribe: () => () => undefined },
    gateway: { get: () => 'open', subscribe: () => () => undefined }
  },
  notify: input => notifications.push({ kind: input?.kind, message: input?.message }),
  notifyError: input => notifications.push({ kind: 'error', message: String(input) }),
  logs: () => undefined,
  navigate: () => undefined,
  onEvent: () => () => undefined,
  request: async () => ({})
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
