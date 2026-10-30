# Redesign phase 2: shell and look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page the redesign's look and shell: the sage palette in both themes, a
header with the boxed `cc` mark, a phone bottom bar and desktop tabs, build tint and badge,
the theme applied before first paint, and About in Settings in place of the footer.

**Architecture:** Values change in `src/styles/tokens.css` only, so every existing component
restyles without touching its layout. The shell is rendered by a new `src/lib/ui/shell.ts`
(lit `render` into two empty slots in each route's HTML), driven by `applyChrome`, which also
stamps the build's environment on `<html data-env>` for the tint. An identical inline
`<head>` script on every page applies the saved theme before CSS paints. A new `cc-about`
component on the Settings page replaces `cc-site-footer`.

**Tech Stack:** Bun, TypeScript, Lit, `@kcstyles/reset.css`, `bun:test`, happy-dom.

**Spec:** [`PRD.md`](../../../PRD.md), decided changes RD-03, RD-05, RD-08, RD-20, RD-21
(DD-45, DD-46), interface rules UI-01 to UI-21, answered question 12. Roadmap:
[`2026-10-30-redesign-roadmap.md`](2026-10-30-redesign-roadmap.md). Visual reference: the
approved prototype linked from the PRD's decided-changes intro (palette, `header()`,
`bottom()`, desktop `dtop`, `envBadge()`, `aboutRows()`).

## Global Constraints

- Values live once, in `src/styles/tokens.css`. Shadow CSS (`src/styles/shared.ts`, component
  `css`) uses only `var(--cc-*)`: no literal hex, `rem`/`px` or colour (UI-01; checked by eye).
- The dark palette is written twice (`@media (prefers-color-scheme: dark)` with
  `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`); the drift test in
  `src/routes/chrome.test.ts` keeps them identical. Dark blocks override colour tokens only.
- `--cc-leading` stays at least `1.65`; the font stack keeps system and Thai faces, no web
  fonts (UI-06). Focus stays visible through `--cc-focus-ring` (UI-16). The shell pads for
  `env(safe-area-inset-*)` (UI-19).
- Three button variants only: none, `data-variant="quiet"`, `data-variant="danger"` (UI-02).
- Never select on translated text; styles and tests use classes, `data-tab`, `data-action`,
  `data-row`, `data-testid` (UI-04).
- Every new piece of interface text goes in both `src/lib/i18n/en.ts` and `th.ts` (UI-03).
  The build marks (`(dev)`, `(local)`, `(pr-<n>)`, badge text) and the product name are not
  translated.
- Dates are formatted by hand with `displayDate` (UI-05); no `Intl` date formatting.
- `#styles/*` maps to `.ts` only; routes import `tokens.css` and `app.css` by relative path.
- Existing panels keep their layouts in this phase; only tokens and the shell change.
- Tests sit next to the code as `*.test.ts`. Commits are conventional, lower case, scoped.
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`.

## Decisions

Made by the controller for this phase:

- **Stacked pull requests.** The redesign merges to main once, at the end. This phase only has
  to leave its preview usable; no adapters for old pages. The pull request's base is the
  phase 1 branch (`worktree-redesign-plan`), not main.
- **Look and shell only.** Tokens and look (RD-03, RD-21) from the prototype palette, both
  themes. Components restyle through tokens; their layouts don't change.
- **Shell.** Header in the prototype's style (boxed `cc` mark, date, bold rule). Phone: bottom
  bar Home, Transactions, +, Cards, Settings. Desktop: tabs on the right of the header plus a
  Payment button. `/` is Home (today's dashboard content for now).
- **Transactions is a placeholder.** `/transactions` says the page arrives in a later update
  and points to Cards. + and Payment link to it until phase 4 builds the payment form. *Due
  next* and *Purchases by date* stay on Home.
- **Build marking.** Non-production builds tint the header and bottom bar and show a badge
  (`development`, `local`, `preview · pr-<n>`); every page's `<title>` ends with `titleMark`.
- **Theme before first paint** through an inline `<head>` script reading `cc:theme`, failing
  safe when storage throws (RD-05).
- **Footer dropped** (question 12). About in Settings shows Environment, Built (hidden in
  development), Source on GitHub, Commit (preview and production), Changelog (production).
- **Moved out of phase 2.** Running `migratePayments` at startup and backup version 3 for
  download and restore move to phase 4; widening `Card.location` and version 3 location checks
  move to phase 6. The roadmap already says so.
- **Thai nav labels.** Home หน้าหลัก, Transactions รายการเคลื่อนไหว, Cards บัตร, Settings
  ตั้งค่า, Payment ชำระ.

Made by this plan (the PRD and the controller leave them open):

- **Text colours darkened for contrast.** The prototype's light warning (`#b8701f`, 3.4:1 on
  its tint), danger (`#c0504d`, 3.8:1), muted (`#66746d`, 4.3:1 on the sunken ground) and white
  on the accent (`#3d8b6a`, 4.1:1) fall short of AA's 4.5:1. The tokens use `#95591a`,
  `#a8403d`, `#5f6b65` and `#367d5f`, all above 4.5:1. The preview build's badge uses dark text
  (`#22302a`, 4.8:1) because white on its amber is 2.9:1; the local tint moves to `#2a72bd`.
- **Header date is `dd MMM yyyy`** on both widths (`displayDate` of `today()`), with no weekday:
  UI-05 formats dates by hand and the catalog has no weekday names.
- **`/card` marks Cards** as the current tab: a card is a sub-screen of Cards (RD-08). Paths
  are matched with a trailing slash ignored.
- **A preview without a PR number** marks the title ` (preview)` and the badge `preview`,
  never `(pr-)`.
- **The brand is not translated.** The mark reads `cc` boxed then `tracking`, with
  `aria-label` from `nav.brand`.
- **Footer keys move to About.** `footer.repo` and `footer.changelog` become `about.source`
  and `about.changelog` with their existing English and Thai text; `footer.commit` and
  `footer.built` go. `nav.dashboard` and `title.dashboard` become `nav.home` and `title.home`.
- **Desktop from 900px**, as the prototype: tabs and Payment show in the header, the bottom bar
  hides.

## Review Focus

- Storage that throws on read (Safari private mode, blocked site data): the head script must
  not throw and must leave `data-theme` unset, and the page still renders (Task 3).
- A preview built without a PR number: no `(pr-)` in the title or the badge (Tasks 2 and 4).
- Switching language while the shell is up: every tab label re-renders in Thai and the current
  tab keeps `aria-current="page"` (Task 4).
- A path with a trailing slash (`/cards/`, `/settings/`) or the card page (`/card`) still
  marks the right tab (Task 4).
- A build stamp that is empty or unreadable on a non-development build: About hides *Built*
  rather than showing `Invalid Date` or `NaN` (Task 6).

---

### Task 1: The sage palette and softer shapes

**Files:**
- Modify: `src/styles/tokens.css`
- Test: `src/routes/chrome.test.ts` (holds the existing drift test)

**Interfaces:**
- Produces, as tokens (every existing token name stays, so components restyle untouched):
  `--cc-rule-width`, `--cc-radius-xs`, `--cc-icon-size`, `--cc-icon-size-sm`,
  `--cc-tabbar-height`, `--cc-add-size`, `--cc-add-lift`, `--cc-add-shadow`,
  `--cc-group-1` … `--cc-group-4` and `--cc-group-1-text` … `--cc-group-4-text`, and per
  build `--cc-env`, `--cc-env-text`, with `--cc-env-tint` and `--cc-env-rule-width`.

Values (light; dark in brackets, written in both dark blocks):

| Token | Light | Dark |
|---|---|---|
| `--cc-bg` | `#f6f7f3` | `#121815` |
| `--cc-surface` | `#ffffff` | `#1b231f` |
| `--cc-surface-sunken` | `#eef1ea` | `#24302a` |
| `--cc-border` | `#e1e6de` | `#2c3832` |
| `--cc-text` | `#22302a` | `#e6ede8` |
| `--cc-text-muted` | `#5f6b65` | `#9aa9a1` |
| `--cc-link` | `#2f7457` | `#8ed7b4` |
| `--cc-accent` | `#367d5f` | `#74c9a1` |
| `--cc-accent-hover` | `#2f7457` | `#8ed7b4` |
| `--cc-accent-text` (ink on accent) | `#ffffff` | `#0f1a14` |
| `--cc-accent-surface` | `#e2f0e8` | `#1f3b2f` |
| `--cc-danger` / `-surface` | `#a8403d` / `#f8e2e0` | `#ef8a86` / `#3b1e1d` |
| `--cc-warning` / `-surface` | `#95591a` / `#fbecd9` | `#e7a55e` / `#3a2a18` |
| `--cc-success` | `#2f7457` | `#8ed7b4` |
| `--cc-group-1` / `-text` | `#e3e9fb` / `#3552b8` | `#1f2944` / `#9fb3f5` |
| `--cc-group-2` / `-text` | `#dff1e7` / `#2f7457` | `#1b3328` / `#8ed7b4` |
| `--cc-group-3` / `-text` | `#efe5f7` / `#7a45a8` | `#2e2240` / `#cfa6ef` |
| `--cc-group-4` / `-text` | `#fbe6dd` / `#b1532f` | `#3a241b` / `#f2a882` |
| `--cc-focus-ring` | `0 0 0 3px rgb(54 125 95 / 0.4)` | `0 0 0 3px rgb(116 201 161 / 0.45)` |
| `--cc-backdrop` | `rgb(10 20 15 / 0.42)` | `rgb(0 0 0 / 0.6)` |
| `--cc-shadow-sm` | `0 1px 2px rgb(34 48 42 / 0.04)` | unchanged |
| `--cc-select-chevron` | stroke `%235f6b65` | stroke `%239aa9a1` |

Shape and size (not in the dark blocks): `--cc-radius-xs: 6px`, `--cc-radius-sm: 12px`,
`--cc-radius-md: 18px`, `--cc-rule-width: 2px`, `--cc-icon-size: 1.375rem`,
`--cc-icon-size-sm: 1.0625rem`, `--cc-tabbar-height: 4rem`, `--cc-add-size: 3.125rem`,
`--cc-add-lift: 1.5rem`, `--cc-add-shadow: 0 8px 18px color-mix(in oklab, var(--cc-accent) 40%, transparent)`,
`--cc-env-tint: 16%`, `--cc-env-rule-width: 3px`. Build tints, written once after the dark
blocks (the same in both themes):
`:root[data-env="development"] { --cc-env: #8a55d6; --cc-env-text: #ffffff }`,
`:root[data-env="local"] { --cc-env: #2a72bd; --cc-env-text: #ffffff }`,
`:root[data-env="preview"] { --cc-env: #d08a1c; --cc-env-text: #22302a }`.
Rewrite the palette comment ("Warm paper neutrals with a teal accent") to say sage neutrals
with a green accent, and keep the contrast notes true for the new values.

- [ ] **Step 1: Write the failing tests** in `src/routes/chrome.test.ts`, reusing its
  `blockAfter` and `declarations` helpers (lift them to file scope):
  - `"every build but production has a tint"`: for `development`, `local`, `preview`, the
    block after `:root[data-env="<env>"]` declares `--cc-env` and `--cc-env-text`.
  - `"group pastels exist in both themes"`: the first `:root {` block and the
    `:root[data-theme="dark"]` block each declare `--cc-group-1` … `--cc-group-4` and their
    `-text` pairs.
  - `"dark palettes only override tokens the light palette defines"`: every property name in
    the `:root[data-theme="dark"]` block, except `color-scheme`, is declared in the first
    `:root {` block.
  - `"leading leaves room for Thai"`: `--cc-leading` parses to a number `>= 1.65`, and
    `--cc-font-sans` contains `"Noto Sans Thai"`.
- [ ] **Step 2: Run** `bun test src/routes/chrome.test.ts`. Expected: FAIL on the tint and
  pastel tests.
- [ ] **Step 3: Rewrite the values in `tokens.css`** per the table above.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS, including the drift test.
- [ ] **Step 5: Commit** `feat(styles): sage palette, group pastels and build tints`.

### Task 2: Build marks and the About helpers

**Files:**
- Modify: `src/lib/ui/build-info.ts`, `src/lib/ui/build-info.test.ts`

**Interfaces:**
- Consumes: `Environment`, `BuildInfo`, `REPO_URL` (phase 1); `displayDate`, `formatDate`
  (`#lib/domain/date`); `Locale` (`#lib/i18n/index`).
- Produces:
  ```ts
  export function titleMark(environment: Environment, pr: string): string;  // changed
  export function envBadge(environment: Environment, pr: string): string | null;
  export function formatBuiltLocal(when: Date, locale: Locale, timeZone: string): string;
  export function sourceLabel(build: BuildInfo): string;
  export function viewerTimeZone(): string;
  ```

`titleMark("preview", "")` returns `" (preview)"`; the other cases are unchanged. `envBadge`:
production → `null`; development → `"development"`; local → `"local"`; preview →
`"preview · pr-<pr>"`, or `"preview"` when `pr` is empty. `formatBuiltLocal` reads the
viewer's local clock (`getFullYear`, `getMonth`, `getDate`, `getHours`, `getMinutes`) and
returns `<displayDate>, HH:mm (<timeZone>)`, without the brackets when `timeZone` is empty.
`sourceLabel`: preview with a PR → `#<pr> · <branch>`; otherwise the branch; an empty branch →
`kamontat/cc-tracking` (the path of `REPO_URL`). `viewerTimeZone` returns
`Intl.DateTimeFormat().resolvedOptions().timeZone`, or `""` if that throws.
`withPrSuffix` and `formatBuiltAt` stay until Tasks 4 and 6 remove their last callers.

- [ ] **Step 1: Write the failing tests** (set `process.env.TZ = "Asia/Bangkok"` at the top
  of the file):
  - `"a preview without a PR number is marked preview"` (review focus):
    `titleMark("preview", "")` → `" (preview)"`.
  - `"badge per environment"`: production `null`, development `"development"`, local
    `"local"`, preview `"42"` → `"preview · pr-42"`, preview `""` → `"preview"`.
  - `"built time reads in the viewer's zone"`: `new Date("2026-10-30T07:05:00Z")`, `"en"`,
    `"Asia/Bangkok"` → `"30 Oct 2026, 14:05 (Asia/Bangkok)"`; with `""` →
    `"30 Oct 2026, 14:05"`; with `"th"` the month comes from the Thai names `displayDate` uses.
  - `"source label"`: preview `{ pr: "31", branch: "redesign-phase-2" }` →
    `"#31 · redesign-phase-2"`; production `{ branch: "main" }` → `"main"`; development
    `{ branch: "" }` → `"kamontat/cc-tracking"`.
- [ ] **Step 2: Run** `bun test src/lib/ui/build-info.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the five functions in `build-info.ts`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(build): badge, source label and local build time`.

### Task 3: Theme before first paint

**Files:**
- Modify: `src/routes/index.html`, `cards.html`, `card.html`, `settings.html`
- Modify: `src/routes/analytics.test.ts` (its comment says the GTM loader is the only inline
  JavaScript; say the theme script is the other)
- Create: `src/routes/theme-boot.test.ts`

**Interfaces:**
- Produces: a `<script data-theme-boot>` element, the first child of `<head>` after the two
  `<meta>` tags, byte-identical on every route page. Its text, exactly:
  ```js
  try {
    const theme = localStorage.getItem("cc:theme");
    if (theme === "light" || theme === "dark")
      document.documentElement.setAttribute("data-theme", theme);
  } catch {
    // Storage blocked: leave the theme to the device, as getTheme() does.
  }
  ```
  `theme.ts` is unchanged: `applyChrome` still calls `applyTheme()`, which agrees with the
  script on every input.

- [ ] **Step 1: Write the failing tests** in `theme-boot.test.ts`. A helper reads every
  `src/routes/*.html`, extracts the text of `<script data-theme-boot>`, and a `boot(storage,
  root)` helper runs it as `new Function("localStorage", "document", text)(storage,
  { documentElement: root })`, with `root` a fresh `document.createElement("html")`:
  - `"every page carries the same theme script"`: each page has exactly one, and all texts
    are equal.
  - `"the script runs before anything paints"`: in each page its index is below the indexes
    of `<link` and `<script type="module"`.
  - `"a saved dark theme is set before paint"`: storage `getItem` → `"dark"` →
    `data-theme="dark"`; same for `"light"`.
  - `"system and unknown values leave the device in charge"`: `"system"`, `"sepia"`, `null`
    → no `data-theme` attribute.
  - `"blocked storage fails safe"` (review focus): `getItem` throws → `boot` does not throw
    and no `data-theme` attribute.
- [ ] **Step 2: Run** `bun test src/routes/theme-boot.test.ts`. Expected: FAIL, no script
  found.
- [ ] **Step 3: Add the script** to the four pages.
- [ ] **Step 4: Run** `bun run test` and `bun run check` (biome lints inline HTML scripts).
  Expected: PASS.
- [ ] **Step 5: Run** `bun run build`, then check the built page keeps the script ahead of the
  stylesheet: in `dist/index.html`, `data-theme-boot` appears before the first
  `rel="stylesheet"`. Expected: it does. If the bundler moves stylesheets above it, move the
  script directly after `<meta charset>` and rerun.
- [ ] **Step 6: Commit** `feat(theme): apply the saved theme before first paint`.

### Task 4: The page shell

**Files:**
- Create: `src/lib/ui/icons.ts`, `src/lib/ui/shell.ts`, `src/lib/ui/shell.test.ts`
- Modify: `src/lib/ui/chrome.ts`, `src/lib/ui/chrome.test.ts`, `src/lib/ui/page.test.ts`
- Modify: `src/lib/ui/build-info.ts`, `build-info.test.ts` (remove `withPrSuffix`)
- Modify: `src/routes/index.html`, `cards.html`, `card.html`, `settings.html`, `index.ts`
  (`bootstrap("title.home", …)`)
- Modify: `src/routes/chrome.test.ts`
- Modify: `src/styles/app.css`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `titleMark`, `envBadge` (Task 2), `buildInfo`, `Environment`, `BuildInfo`;
  `today`, `displayDate`; the Task 1 tokens.
- Produces:
  ```ts
  // icons.ts: lit `svg` templates, viewBox 0 0 24 24, stroke currentColor, width 1.9,
  // round caps and joins, aria-hidden="true"
  export const icons: Record<"home" | "transactions" | "cards" | "settings" | "plus", SVGTemplateResult>;
  // shell.ts
  export type Tab = "home" | "transactions" | "cards" | "settings";
  export const TABS: readonly (readonly [tab: Tab, path: string, label: MessageKey])[];
  export function currentTab(path: string): Tab | null;
  export type ShellView = { path: string; today: PlainDate; environment: Environment; pr: string };
  export function renderShell(view: ShellView, root?: ParentNode): void;
  // chrome.ts (replaces markCurrentLink and the old positional signature)
  export function applyChrome(titleKey: MessageKey, options?: { root?: ParentNode;
    build?: Pick<BuildInfo, "environment" | "pr">; clock?: () => Date; path?: string }): void;
  ```

Icon paths, from the prototype: home `M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z`;
transactions `M8 3 4 7l4 4`, `M4 7h16`, `m16 21 4-4-4-4`, `M20 17H4`; cards
`<rect x="2" y="5" width="20" height="14" rx="2.5"/>` and `M2 10h20`; plus `M12 5v14M5 12h14`;
settings the Lucide `settings` cog (the prototype's `cog`), a path plus
`<circle cx="12" cy="12" r="3"/>`.

`TABS` in order: home `/` `nav.home`; transactions `/transactions` `nav.transactions`; cards
`/cards` `nav.cards`; settings `/settings` `nav.settings`. `currentTab` strips one trailing
slash (except on `/`), maps `/card` to `"cards"`, and returns `null` for anything else.

Each route page's body becomes: the GTM `<noscript>`, `<header class="site-header"
id="site-header"></header>`, `<main class="page" id="page"></main>`, `<div id="tabbar"></div>`,
and (until Task 6) `<cc-site-footer>`. `renderShell` renders into the first two:

- Into `#site-header`: `<div class="site-header__bar">` holding
  `<a class="site-header__brand" href="/" aria-label=${t("nav.brand")}><span class="site-header__mark">cc</span>tracking</a>`;
  the badge `<span class="site-header__badge" data-testid="env-badge">` only when `envBadge`
  is not null; `<span class="site-header__date" data-testid="today">` with
  `displayDate(view.today, getLocale())`; `<nav class="site-header__tabs" aria-label=${t("nav.pages")}>`
  with one `<a data-tab=… href=…>${icon}${label}</a>` per tab; then
  `<a class="site-header__pay" data-action="payment" href="/transactions">${icons.plus}${t("nav.payment")}</a>`.
- Into `#tabbar`: `<nav class="tabbar" aria-label=${t("nav.pages")}>` with home,
  transactions, `<a class="tabbar__add" data-action="payment" href="/transactions" aria-label=${t("nav.payment")}>${icons.plus}</a>`,
  cards, settings. Tab links carry `data-tab` and the icon above the label.
- The link for `currentTab(view.path)` gets `aria-current="page"` in both navs.

`applyChrome` sets `document.title` to `t(titleKey) + titleMark(environment, pr)`,
`document.documentElement.lang`, and `document.documentElement.dataset.env`, calls
`applyTheme()` and `renderShell({ path, today: today(clock()), … })`, and re-runs all but
`applyTheme` on every locale change (`subscribe`). Defaults: `root` is `document`, `build` is
`buildInfo()`, `clock` is `() => new Date()`, `path` is `location.pathname`.

`app.css`, replacing the pill nav and the `::before` brand shape (values only through tokens;
media queries may use literal widths, as today):
- `.site-header`: sticky, `background: var(--cc-bg)`,
  `border-bottom: var(--cc-rule-width) solid var(--cc-text)`, top padding includes
  `env(safe-area-inset-top)`. Bar: row, centred, `max-width: 72rem`, date pushed right on a
  phone (`margin-inline-start: auto`).
- `.site-header__brand`: `var(--cc-font-mono)`, bold, `var(--cc-text)`, no underline;
  `.site-header__mark`: `background: var(--cc-text)`, `color: var(--cc-bg)`, small inline
  padding, `var(--cc-radius-xs)`.
- `.site-header__badge`: mono, `var(--cc-text-xs)`, bold, `background: var(--cc-env)`,
  `color: var(--cc-env-text)`, `var(--cc-radius-xs)`.
- Tint: `:root[data-env]:not([data-env="production"]) .site-header` gets
  `background: color-mix(in oklab, var(--cc-env) var(--cc-env-tint), var(--cc-bg))` and
  `border-bottom-color: var(--cc-env)`; the same selector on `.tabbar` gets
  `border-top: var(--cc-env-rule-width) solid var(--cc-env)`.
- `.tabbar`: fixed to the bottom, five equal columns, `var(--cc-surface)`, top border, bottom
  padding `calc(var(--cc-space-2) + env(safe-area-inset-bottom, 0px))`, side padding with the
  left and right insets. Links: icon (`var(--cc-icon-size)`) over a `var(--cc-text-xs)` label,
  `var(--cc-text-muted)`; `[aria-current="page"]` gets `var(--cc-link)`, weight 650 and
  `var(--cc-accent-surface)` (weight and fill, not colour alone). Labels may wrap to two
  lines, never clip. `.tabbar__add`: `var(--cc-add-size)` square, `var(--cc-radius-md)`,
  `var(--cc-accent)` with `var(--cc-accent-text)`, raised by `var(--cc-add-lift)`,
  `var(--cc-add-shadow)`.
- `.page`: bottom padding adds `var(--cc-tabbar-height)` below 900px so the bar never covers
  the last panel.
- From `@media (min-width: 900px)`: `.tabbar` hidden; `.site-header__tabs` and
  `.site-header__pay` shown (hidden below). Tabs: row, `var(--cc-text-muted)`, icon
  `var(--cc-icon-size-sm)`, a bottom border of `var(--cc-env-rule-width)` transparent that
  sits on the header rule; current tab `var(--cc-text)`, bold, border `var(--cc-accent)`. Pay:
  primary button look with the plus icon.
- Re-measure the header and update `--cc-header-height` in `tokens.css` so `.split__aside`
  still clears it.

Catalog changes (both files): rename `nav.dashboard` → `nav.home` (en `Home`, th unchanged
`หน้าหลัก`) and `title.dashboard` → `title.home` (en `Home — cc-tracking`, th unchanged); add
`nav.transactions` (`Transactions` / `รายการเคลื่อนไหว`), `nav.payment` (`Payment` / `ชำระ`),
`nav.pages` (`Pages` / `หน้า`).

- [ ] **Step 1: Write the failing tests** in `shell.test.ts`:
  - `"current tab per path"`: `/` home, `/transactions` transactions, `/cards` cards, `/card`
    cards, `/settings` settings, `/cards/` and `/settings/` (review focus) cards and settings,
    `/nope` null.
  - `"header carries the mark, the date and the tabs"`: after `renderShell({ path: "/cards",
    today: "2026-10-30", environment: "production", pr: "" })` on a mounted
    `#site-header` and `#tabbar`: `.site-header__mark` text `cc`; `[data-testid="today"]`
    text `30 Oct 2026`; `.site-header__tabs a` hrefs `["/", "/transactions", "/cards",
    "/settings"]` with texts `Home`, `Transactions`, `Cards`, `Settings`;
    `.site-header__pay` href `/transactions`, text `Payment`.
  - `"bottom bar is home, transactions, add, cards, settings"`: `.tabbar > a` in order with
    `data-tab` `home`, `transactions`, then `.tabbar__add` (`aria-label` `Payment`, href
    `/transactions`), then `cards`, `settings`.
  - `"the current tab is marked in both navs"`: path `/cards` → the two `[data-tab="cards"]`
    links have `aria-current="page"`, no other link has it.
  - `"no badge in production"`; `"badge per build"`: development `development`, local
    `local`, preview `"7"` `preview · pr-7`, preview `""` `preview` (review focus).
  - `"Thai labels"`: `setLocale("th")`, render → tab texts `หน้าหลัก`,
    `รายการเคลื่อนไหว`, `บัตร`, `ตั้งค่า`; Payment `ชำระ`.
  In `chrome.test.ts` (rewrite for the new signature, mounting the two slots):
  - `"title carries the build mark"`: `title.cards` with `{ environment: "preview", pr: "42" }`
    → `Card registry — cc-tracking (pr-42)`; `local` → `… (local)`; `production` → bare;
    preview `""` → `… (preview)`.
  - `"stamps the build on the root"`: `document.documentElement.dataset.env` equals the
    environment.
  - `"a language switch re-renders the shell and keeps the current tab"` (review focus):
    with `path: "/settings"`, apply,
    `setLocale("th")` → `[data-tab="settings"]` links read `ตั้งค่า` and still carry
    `aria-current="page"`; `document.title` is Thai.
  In `src/routes/chrome.test.ts`: `"every route page carries the shell slots"`: each page has
  `id="site-header"`, `id="page"` and `id="tabbar"`, and no `site-header__nav`.
  In `page.test.ts`: the storage-failure test mounts the two slots and reads
  `[data-tab="home"]` in Thai instead of `#nav-dashboard`.
- [ ] **Step 2: Run** `bun test src/lib/ui src/routes/chrome.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `icons.ts`, `shell.ts`, the new `applyChrome`, the catalog keys,
  the HTML slots, and `index.ts`'s title key; delete `markCurrentLink`, `NAV_PATHS` and
  `withPrSuffix` (and its tests).
- [ ] **Step 4: Run** `bun run test`. Expected: PASS, including the catalog coverage test.
- [ ] **Step 5: Write the shell styles** in `app.css` as listed above.
- [ ] **Step 6: Run** `bun run dev` and look at `/` and `/cards` at 390px and 1280px:
  bottom bar on the phone with + raised, tabs and Payment on the desktop, header rule bold,
  development tint and badge showing. Expected: matches the prototype's shell.
- [ ] **Step 7: Commit** `feat(shell): header, bottom bar, desktop tabs and build marks`.

### Task 5: The placeholder Transactions page

**Files:**
- Create: `src/routes/transactions.html`, `src/routes/transactions.ts`,
  `src/routes/transactions.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `bootstrap` (`#lib/ui/page`), the shell slots (Task 4), the theme script (Task 3).
- Produces: `export function renderTransactionsPage(root: HTMLElement): void;` and the route
  `/transactions`.

The HTML is a copy of `cards.html` with `transactions.ts` as its module and a title of
`Transactions — cc-tracking`; it keeps GTM, the theme script and the shell slots. The page
renders `<h1>` `t("nav.transactions")`, `<p class="placeholder">` `t("transactions.soon")`
and `<a href="/cards" data-action="to-cards">` `t("transactions.toCards")`, and re-renders on
`subscribe`. `bootstrap("title.transactions", () => renderTransactionsPage(root))`.

| Key | en | th |
|---|---|---|
| `title.transactions` | Transactions — cc-tracking | รายการเคลื่อนไหว — cc-tracking |
| `transactions.soon` | Every purchase and payment in one list is coming in a later update. Until then, record a payment from the card's own page. | รายการซื้อและการชำระทั้งหมดในรายการเดียวจะมาในการอัปเดตครั้งถัดไป ระหว่างนี้บันทึกการชำระได้ที่หน้าของบัตรแต่ละใบ |
| `transactions.toCards` | Go to Cards | ไปที่บัตร |

- [ ] **Step 1: Write the failing tests** in `transactions.test.ts`: `"names the page and
  the next step"` (h1 `Transactions`, `.placeholder` text equals the catalog's
  `transactions.soon`, `[data-action="to-cards"]` href `/cards`); `"re-renders in Thai"`
  (after `setLocale("th")`, h1 `รายการเคลื่อนไหว`).
- [ ] **Step 2: Run** `bun test src/routes/transactions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and keys.
- [ ] **Step 4: Run** `bun run test` (the GTM, theme-script and shell-slot tests now scan five
  pages) and `bun run build` (the build lists `/transactions`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(transactions): placeholder page for + and Payment`.

### Task 6: About in Settings, and no footer

**Files:**
- Create: `src/components/cc-about.ts`, `src/components/cc-about.test.ts`
- Delete: `src/components/cc-site-footer.ts`, `src/components/cc-site-footer.test.ts`
- Modify: every `src/routes/*.html` (remove `<cc-site-footer>`), `src/lib/ui/page.ts` (drop
  the footer import and its comment), `src/routes/settings.ts`, `src/routes/settings.test.ts`,
  `src/routes/chrome.test.ts`
- Modify: `src/lib/ui/build-info.ts`, `build-info.test.ts` (remove `formatBuiltAt`)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Modify: `README.md` (the build paragraph names the footer), `scripts/build.ts` (its comment)

**Interfaces:**
- Consumes: `buildInfo`, `BuildInfo`, `REPO_URL`, `CHANGELOG_URL`, `commitUrl`,
  `shortCommit`, `parseBuiltAt`, `formatBuiltLocal`, `sourceLabel`, `viewerTimeZone` (Task 2).
- Produces:
  ```ts
  @customElement("cc-about") export class CcAbout extends LitElement {
    @property({ attribute: false }) build: BuildInfo;        // defaults to buildInfo()
    @property({ attribute: "time-zone" }) timeZone: string;  // defaults to viewerTimeZone()
  }
  ```

`cc-about` (styles `base` plus local `css` through tokens only, rows like the prototype's
`.set`: label left in muted text, value right, a border between rows) renders
`<h2>` `t("about.title")` and a `<dl>` of `<div data-row=…><dt>…</dt><dd>…</dd></div>`, in
this order, each only when its rule holds:

| `data-row` | Shown | Value |
|---|---|---|
| `environment` | always | `t("about.env.<environment>")` |
| `built` | not development, and `parseBuiltAt(builtAt)` is not null | `formatBuiltLocal(at, getLocale(), timeZone)` |
| `source` | always | link to `REPO_URL`, text `sourceLabel(build)` |
| `commit` | preview or production, and `commit` not empty | link to `commitUrl(commit)`, text `shortCommit(commit)` in mono |
| `changelog` | production | link to `CHANGELOG_URL`, text `t("about.whatsNew")` |

Links open in a new tab (`target="_blank" rel="noreferrer"`). The settings page adds
`<article class="about"><cc-about></cc-about></article>` as its last article.

| Key | en | th |
|---|---|---|
| `about.title` | About | เกี่ยวกับ |
| `about.environment` | Environment | สภาพแวดล้อม |
| `about.env.development` | Development | พัฒนา |
| `about.env.local` | Local | ในเครื่อง |
| `about.env.preview` | Preview | ทดลอง |
| `about.env.production` | Production | ใช้งานจริง |
| `about.built` | Built | build เมื่อ |
| `about.source` (was `footer.repo`) | Source on GitHub | ซอร์สโค้ดบน GitHub |
| `about.commit` | Commit | commit |
| `about.changelog` (was `footer.changelog`) | Changelog | บันทึกการเปลี่ยนแปลง |
| `about.whatsNew` | What's new | มีอะไรใหม่ |

Remove `footer.repo`, `footer.changelog`, `footer.commit`, `footer.built`.

- [ ] **Step 1: Write the failing tests** in `cc-about.test.ts` (mount with a set `build` and
  `time-zone="Asia/Bangkok"`, `process.env.TZ = "Asia/Bangkok"`, built
  `2026-10-30T07:05:00Z`, commit `3270f3d9c1a4e8b2f6d0a7c5e9b1d3f2a4c6e8b0`):
  - `"production shows every row"`: `data-row` order `environment, built, source, commit,
    changelog`; environment `Production`; built `30 Oct 2026, 14:05 (Asia/Bangkok)`; source
    text `main`, href `REPO_URL`; commit text `3270f3d`, href `commitUrl(sha)`; changelog href
    `CHANGELOG_URL`.
  - `"preview names its pull request"`: `{ pr: "31", branch: "redesign-phase-2" }` → source
    `#31 · redesign-phase-2`; commit shown; no changelog row.
  - `"local hides commit and changelog"`: rows `environment, built, source`.
  - `"development hides the build time"`: rows `environment, source`; source text
    `kamontat/cc-tracking` when the branch is empty.
  - `"an unreadable build time is hidden"` (review focus): production with `builtAt` `""`,
    then `"not a date"` → no `built` row, and the text contains neither `Invalid` nor `NaN`.
  - `"reads in Thai"`: after `setLocale("th")`, `h2` `เกี่ยวกับ`, environment `ใช้งานจริง`.
  In `settings.test.ts`: `"About comes last"`: the last `article` is `.about` and holds a
  `cc-about`. In `src/routes/chrome.test.ts`, replace `"every route page carries the site
  footer"` with `"no route page carries a footer"` (no `<cc-site-footer`).
- [ ] **Step 2: Run** `bun test src/components/cc-about.test.ts src/routes`. Expected: FAIL.
- [ ] **Step 3: Implement** `cc-about`, wire it into `settings.ts`, remove the footer from
  the pages, `page.ts`, the catalogs and `build-info.ts`, and delete the footer files.
  Update the README build paragraph to say Settings › About shows the build, and the
  `scripts/build.ts` comment to match.
- [ ] **Step 4: Run** `bun run test`, `bun run typecheck`, `bun run build`. Expected: PASS;
  `grep -r "cc-site-footer\|footer\." src` finds nothing.
- [ ] **Step 5: Commit** `feat(settings): about replaces the page footer`.

### Task 7: Documents and shipping

**Files:**
- Modify: `PRD.md`, `PRD_TH.md` (same IDs, same order)

- [ ] **Step 1: Update both PRDs:**
  - CD-01: pages are `/` Home (today's dashboard panels for now), `/transactions` (a
    placeholder until phase 4), `/cards`, `/card?id=<id>`, `/settings`; nav Home,
    Transactions, +, Cards, Settings.
  - CD-02: sticky header with the boxed `cc` mark, the date and a bold rule; phone bottom bar
    with a raised +; from 900px tabs on the right of the header and a Payment button; content
    up to `72rem`; no footer; build tint and badge.
  - CD-12: sage neutrals, a green accent, group pastels, rounded shapes (radii 6, 12, 18px).
  - FR-37: retired (the footer), pointing to RD-20 and About; add the footer to *Retired*.
  - UI-20: a non-production build is tinted, badged and marked in the title (RD-20).
  - RD-03, RD-21: shipped in phase 2 (pastel card chips arrive with the Cards page). RD-05:
    shipped. RD-08: shipped in part (the shell; + and Payment open a placeholder until the
    payment form in phase 4). RD-20: shipped.
  - DD-28 stays replaced; *Constraints and known limits*: drop the theme flash line.
  - *Where things live*: `src/lib/ui/` lists the shell; `src/routes/` lists `transactions`.
  - Decided-changes intro: phase 2 (shell and look) shipped, with the date.
  - Add this plan's own decisions as DD-52 to DD-56 (contrast-darkened text colours; header
    date without weekday; `/card` marks Cards; a preview without a PR reads `preview`;
    desktop from 900px), in both languages.
- [ ] **Step 2: Run** `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`. Expected: all pass.
- [ ] **Step 3: Commit** `docs(prd): shell and look shipped`.
- [ ] **Step 4: Ship** through `.claude/skills/shipping-a-change`, with `--base
  worktree-redesign-plan` for the stacked pull request. The test plan's preview checklist,
  each at 390px and 1280px, in English and Thai, light and dark (UI-21):
  - Header: boxed `cc`, date, bold rule; preview tint and `preview · pr-<n>` badge readable.
  - Phone: bottom bar with + raised, current tab filled, Thai labels not clipped, bar never
    covers the last panel, home-indicator inset respected.
  - Desktop: tabs right of the date with the current one underlined, Payment button.
  - Theme: reload with Dark picked on a light device (and the reverse) shows no flash.
  - Every page (`/`, `/transactions`, `/cards`, `/card?id=…`, `/settings`): panels readable,
    focus ring visible on Tab, warnings and overdue still carry words.
  - Settings › About: rows for a preview; no footer on any page.
