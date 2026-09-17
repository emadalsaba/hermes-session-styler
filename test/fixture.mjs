/**
 * Fixture: the session-list DOM exactly as the running app renders it.
 * Markup copied from apps/desktop/src/app/chat/sidebar/{session-row,chrome,row-geometry}.tsx
 * and components/ui/{profile-glyph,row-button}.tsx at commit 6005aa1 (the build
 * stamp of the installed Hermes Desktop app).
 */

export const ROW_HTML = rows => `
<nav id="sidebar">
  ${rows
    .map(
      row => `
  <div class="min-h-[1.625rem] pr-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md${row.selected ? ' bg-(--ui-row-active-background)' : ''}"${row.working ? ' data-working="true"' : ''}>
    ${row.arc ? '<span aria-hidden="true" class="arc-border arc-row"></span>' : ''}
    <button data-slot="row-button" type="button" class="pl-2 pr-2 gap-1.5 flex h-full min-w-0 items-center self-stretch py-0.5 bg-transparent text-left">
      <span class="grid size-3.5 shrink-0 place-items-center overflow-hidden">
        <span class="flex items-center gap-0.5">
          ${row.stem ? `<span aria-hidden="true" class="shrink-0 font-mono text-[0.625rem] leading-none text-(--ui-text-quaternary)">${row.stem}</span>` : ''}
          <span ${row.dotAttrs || ''}></span>
        </span>
      </span>
      <span class="min-w-0 flex-1 self-center">
        <span class="hover-marquee block font-normal group-hover:text-foreground group-data-[working=true]:text-foreground/90 min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) leading-[1.35]">${row.title}</span>
      </span>
    </button>
    <div class="flex shrink-0 items-center self-stretch" data-row-actions>
      <span class="pointer-events-none whitespace-nowrap text-[0.625rem] leading-none text-(--ui-text-tertiary)">2m</span>
      ${
        row.profile
          ? `<span role="img" aria-label="Profile: ${row.profile}" class="grid size-4 shrink-0 place-items-center rounded-[3px] text-[0.5rem] font-semibold uppercase leading-none" style="background-color: color-mix(in srgb, hsl(200 68% 58%) 22%, transparent); color: hsl(200 68% 58%)">${row.profile
              .charAt(0)
              .toUpperCase()}</span>`
          : ''
      }
      <button aria-label="More actions" type="button" class="size-5 rounded-[4px] bg-transparent text-transparent"><i class="codicon codicon-kebab-vertical"></i></button>
    </div>
  </div>`
    )
    .join('')}
</nav>`

/** A right-to-left session title — user data, not copy. */
export const ARABIC_TITLE = 'نموذج جديد للفواتير'

export const DEFAULT_ROWS = [
  { title: 'Odoo sync report', profile: 'odoo', selected: true, dotAttrs: 'aria-hidden="true" class="size-1 rounded-full bg-(--ui-text-quaternary)" style="background-color: hsl(200 68% 58%)"' },
  { title: 'Weekly review', profile: 'personal', dotAttrs: 'class="size-1 rounded-full bg-(--ui-text-quaternary)"' },
  { title: 'Deploy Hermes update', profile: 'system-update', dotAttrs: 'role="status" class="size-1.5 rounded-full bg-(--ui-accent)"', working: true, arc: true },
  /* One row keeps a non-Latin title on purpose: session titles are user data,
   * and the plugin must match / annotate them regardless of script (RTL safe). */
  { title: ARABIC_TITLE, profile: 'odoo', dotAttrs: 'aria-label="finished unread" class="size-1.5 rounded-full bg-(--ui-success)"' },
  { title: 'Waiting for your approval', profile: 'work-emails', dotAttrs: 'role="status" class="size-1.5 rounded-full bg-amber-500"' },
  { title: 'Empty draft', profile: null, dotAttrs: 'class="size-1.5 rounded-full border border-(--ui-text-quaternary)"' }
]

/* A parent with a branch child (└─ stem), exactly as the depth-first sidebar
 * list renders it: the child row follows its parent directly. */
export const BRANCH_ROWS = [
  { title: 'Parent project', profile: 'odoo', dotAttrs: 'class="size-1 rounded-full bg-(--ui-text-quaternary)"' },
  { title: 'Branch child', profile: 'odoo', stem: '└─ ', dotAttrs: 'class="size-1.5 rounded-full bg-(--ui-accent)"', working: true },
  { title: 'Deep branch child', profile: 'odoo', stem: '└─ ', dotAttrs: 'class="size-1.5 rounded-full bg-(--ui-success)"' }
]
