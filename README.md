# Session Styler — Hermes Desktop plugin

**Customizes the Hermes Desktop session list (the sidebar): icons, colors, and sizes.**
يقوم بتخصيص قائمة الجلسات في تطبيق Hermes Desktop (الشريط الجانبي): الأيقونات والألوان والأحجام.

- Version / الإصدار: **1.0.1**
- Plugin id / المُعرّف: `session-styler`
- SDK: `@hermes/plugin-sdk` (desktop app plugin — no build step, single ESM file)
- Verified against / مُتحقَّق منه على: Hermes Desktop build `6005aa1` (2026-09-17)

> **الإصدار 1.0.1**: الإضافة تُظهر الأيقونات فورًا بعد التحميل (وضع «إيموجي» افتراضيًا)، وتُظهر
> إشعارًا عند التحميل يقول كم صفًا وكم أيقونة طُبّقت — لأن إضافة تعمل بلا تغيير مرئي لا يمكن
> تمييزها عن إضافة لم تُحمَّل. لتغيير الأيقونات أو إرجاع النقاط الأصلية: افتح اللوحة → «أيقونات».
>
> **1.0.1**: ships with emoji icons already ON (the quiet core dot is kept for idle rows), and
> announces itself in a toast on load with its match count. A plugin that loads but changes
> nothing on screen is indistinguishable from one that never loaded.

---

## ما الذي يفعله؟ (Arabic)

يستبدل النقطة الملوّنة الصغيرة التي تسبق كل جلسة بأيقونة تختارها أنت، ويلوّن النقاط والنصوص
وخلفية الصف، ويكبّر أو يصغّر ارتفاع الصف وحجم الخط — كل ذلك من داخل التطبيق، بلا تعديل ملفات
التطبيق نفسه.

أربع مجموعات تحكم:

| التبويب | ماذا يضبط |
|---|---|
| **أيقونات** | لكل حالة (خامل، يعمل، متوقف، ينتظر إجابتك، غير مقروء، خلفية، مسودة): إيموجي أو أيقونة codicon بدل النقطة، مع حجم الأيقونة |
| **ألوان** | لون نقطة كل حالة، لون الأيقونة، لون العنوان، لون الأرقام/الوقت، وتلوين خلفية الصف بشدة قابلة للضبط |
| **أحجام** | ارتفاع الصف، حجم العنوان، حجم الأرقام، خلية الأيقونة، المسافة، الحواف + قوالب (مضغوط/واسع) + **قياس الحالي** |
| **قواعد** | مطابقة حسب عنوان الجلسة (نص أو regex)، أو البروفايل، أو الحالة → أيقونة/لون/إخفاء الصف |

أوامر لوحة الأوامر (⌘K / Ctrl+K): تشغيل/إيقاف، صفوف مضغوطة، صفوف واسعة، أيقونات إيموجي،
استعادة الافتراضي، نسخ التشخيص، فحص المُحدِّدات.

شريحة في شريط الحالة تعرض `صفوف/أيقونات` — الضغط عليها يبدّل التشغيل.

### لماذا لا ينكسر بعد تحديث Hermes؟

1. الإضافة ملف واحد خارج التطبيق: `$HERMES_HOME/desktop-plugins/session-styler/plugin.js`.
   تحديث العميل (client) يستبدل مجلد التطبيق ولا يمسّ هذا المسار، وتحديث الخادم/البروفايل لا يمسّه أيضًا.
2. لا تُرقّع أي ملف من ملفات التطبيق — كل شيء يُحقن وقت التشغيل ويُزال عند الإطفاء.
3. كل مُحدِّد DOM (hook) موضوع في جدول واحد مع بدائل: إن غيّر تحديثٌ البنية، يُجرَّب البديل تلقائيًا.
4. تبويب **متقدم** يقبل مُحدِّدًا جديدًا وتُحدِّثه من داخل التطبيق بلا تعديل الكود.
5. سطر التشخيص يعرض دائمًا: عدد الصفوف، أي hook نجح، الحالات، البروفايلات — فيظهر الانحراف فورًا.
6. سكربت `scripts/check-hooks.sh` يفحص — بعد أي تحديث — أن كل نقطة اعتماد ما زالت موجودة في
   مصدر التطبيق، ويقول لك بالضبط أي ملف/سطر تغيّر.

---

## Install / التثبيت

### 1. From this repo (any machine)

```bash
git clone https://github.com/emadalsaba/hermes-session-styler.git
cd hermes-session-styler
./scripts/install.sh                 # into $HERMES_HOME/desktop-plugins/session-styler/
./scripts/install.sh --home /path/to/hermes-home    # explicit home
```

The folder name must stay `session-styler` (it must equal the plugin `id`).

### 2. Onto a remote client (e.g. the desktop app on a Windows box)

```bash
./scripts/sync-to-client.sh --host desktop \
  --dest 'C:/Users/<you>/AppData/Local/hermes/desktop-plugins/session-styler'
```

It copies, then verifies the SHA-256 on both sides and prints the result.

### 3. Manually

Copy `plugin.js` to `<HERMES_HOME>/desktop-plugins/session-styler/plugin.js`
(Windows: `%LOCALAPPDATA%\hermes\desktop-plugins\session-styler\plugin.js`).

Then in the app: **⌘K / Ctrl+K → “Reload desktop plugins”** (a new folder is picked up
automatically within a few seconds; the command forces it). The plugin also appears in
**Settings → Plugins**, where it can be disabled or its folder revealed.

---

## Use / الاستخدام

Open the **session styler** pane (registered as a right-side pane — drag it anywhere, it becomes
a tab like any core pane). The pane has a live preview built from the *real* row markup, so what
you see is what the sidebar does.

Status-bar chip: `<rows>/<icons>` — click to toggle the whole plugin.

## After a Hermes update / بعد أي تحديث

```bash
./scripts/check-hooks.sh --src "C:/Users/<you>/AppData/Local/hermes/hermes-agent"   # local app source
./scripts/check-hooks.sh --remote                                                   # latest main from GitHub
```

- All `OK` → nothing to do; update the app and keep using it.
- Any `DRIFT` → the app renamed something. Open the pane → **متقدم**, paste the new selector for
  that hook, press **حفظ المُحدِّدات**. No file editing, no reinstall. Send the drift output along
  with a bug report and the default table will be updated in the next release.

## Troubleshooting / حل المشاكل

| Symptom | Fix |
|---|---|
| Pane/chip missing | ⌘K → “Reload desktop plugins”; check Settings → Plugins is on; the folder must be named `session-styler` |
| `rows: 0` in the diagnostics line | the row hook drifted — run `check-hooks.sh`, then set the selector in **متقدم** |
| Icons show but the dot is still there | a rule/state icon is set but the lead hook drifted; check `lead` in **متقدم** |
| Colors don't apply | enable **تشغيل تعديل الألوان** first; an empty field means "keep the core color" |
| Everything looks reset after a reinstall | settings live in plugin storage (`hermes.plugin.session-styler.config`) — export JSON from **متقدم** before reinstalling, paste it back after |
| Did the app actually load it? (toast on load + `load:` line) | the pane's diagnostics line shows `load: <version> @ <timestamp>` — that value is written by the plugin on load, so if it is missing or stale the file was not picked up |

## Uninstall

Delete `<HERMES_HOME>/desktop-plugins/session-styler/`, or turn it off in Settings → Plugins.
Turning it off removes the injected stylesheet, every annotation, and every injected icon
immediately — the app is left exactly as it was.

---

## How it works (for maintainers)

1. **Annotate** — every pass walks the row hook, resolves each row's status from the dot's own
   class tokens (`session-status-dot.tsx`), reads the owning profile from the row's profile chip,
   and stamps `data-hms-row`, `data-hms-state`, `data-hms-profile`, `data-hms-dot`.
2. **Style** — one `<style id="hermes-session-styler-style">` element carries `:root` variables
   plus rules keyed off those annotations. Nothing is patched on disk; no colors are hardcoded
   (theme variables and color-mix only).
3. **Icon** — in emoji/codicon mode a `<span class="hms-icon">` is inserted into the row's lead
   cell and the core dot is hidden by a sibling rule; `dot` mode never touches the DOM.
4. **Stay in sync** — a `MutationObserver` re-runs the pass on real DOM changes (our own writes
   are recognized and ignored, so there is no feedback loop), with a 4 s safety net that also
   restores the stylesheet if something removes it.

### Hooks this plugin depends on

| Hook | Default selector / anchor |
|---|---|
| `row` | `[data-slot="row-button"]` (fallback: the row body's class signature) |
| `label` | `span[class*="text-[0.8125rem]"]` |
| `meta` | `[class*="text-[0.625rem]"]`, `[class*="text-[0.6875rem]"]` |
| `lead` | `span[class*="place-items-center"][class*="size-3.5"]` |
| `dot` | `span[class*="rounded-full"][class*="size-1"]` |
| `profileGlyph` | `[data-row-actions] [role="img"][aria-label]` |

Status tokens read from the dot: `amber-500` → needs input, `bg-(--ui-accent)` → working,
`border-(--ui-accent)` → stalled, `border-(--ui-text-tertiary)` → background,
`bg-(--ui-success)` → unread, `border-(--ui-text-quaternary)` → draft, `size-1` → idle.

## Development / التطوير

`test/` is a dependency-free harness that boots `plugin.js` inside jsdom against a fixture of the
real session-row markup (copied from the app source at build `6005aa1`), with a stub
`@hermes/plugin-sdk`:

```bash
cd test
npm install          # jsdom + react only
node run-tests.mjs ../plugin.js
```

56 assertions: contribution areas, stylesheet generation, per-state detection, icon injection,
profile detection, rules (title regex / profile / hide), hook fallback, teardown, persistence,
the load beacon, and "drifted DOM does not throw".

The plugin file is loaded **uncompiled** by the app: plain ESM, `jsx()` calls (never JSX syntax),
and only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` may be imported.

## License

MIT — see `LICENSE`.
