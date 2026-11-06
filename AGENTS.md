Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Stack

- Static pages, no server code, built with [Astro](https://astro.build/) (from
  `kamontat/bun-astro-template`). Each page is `src/pages/<path>.astro`: the shared
  `BaseLayout` (`src/layouts/`) with a title, a `mainClass` and a `<script>` importing the
  legacy route module `src/legacy/routes/<path>.ts`, which renders Lit components (`lit`,
  decorators) from `src/legacy/components/` in the browser. Domain rules live in `src/lib/domain/`, storage (browser
  `localStorage`) in `src/lib/storage/`. `tests/pages/pages.test.ts` holds every page to
  that shape.
- `BaseLayout` owns the `<head>` (noindex, the inline theme boot, the global CSS: reset,
  `tokens.css`, `app.css`) and Google Tag Manager, which loads only when `PUBLIC_GTM_ID` is
  set at build time (the production deploy sets it).
- `bun run dev` (dev server on 4321, `--port` to change it), `bun run build` (`astro build`
  into `dist/`) and `bun run preview` (serves the build). `astro.config.ts` stamps the
  `PUBLIC_*` build info (`scripts/build-env.ts`) before Vite inlines it.
- Deployed as Cloudflare static assets: `wrangler.jsonc` serves `dist/`, and
  `public/_redirects` holds the redirects.
- Navigation is client-side through Astro's `<ClientRouter />` (PRD DD-174): every address is
  still a static page, but a page's script runs once, so it registers with `onPage` and
  cleans up with `pageSignal()` (`#lib/ui/spa`; `project-pages` has the rules).
- Components follow Atomic Design (bun-astro-template): new UI is `.astro` in
  `src/components/{atoms,molecules,organisms}/`, static wherever possible, with a Svelte
  island (not a raw `<script>`) only for what the browser must render (PRD DD-172). Layouts
  are templates, pages are pages;
  `tests/components/atomic.test.ts` enforces the tiers. Everything Lit — components, route
  modules and the `lib`/`styles` files they need — is in `src/legacy/` (imported as
  `#legacy/*`), converted one piece at a time and deleted as it goes; no new code goes there,
  and nothing outside it imports it except a page's route script
  (`tests/legacy/boundary.test.ts`). `project-components`, `project-layouts` and
  `project-pages` hold the rules.
- Tests are Vitest (`bun run test`, `vitest.config.ts`) in `tests/`, mirroring `src/`
  (`src/lib/gtm.ts` → `tests/lib/gtm.test.ts`), in a happy-dom environment with
  `tests/setup.ts`, so components render in tests. `bunfig.toml` runs every script on the
  Bun runtime, so tests may use `Bun.file`. `project-scripts` covers the scripts and checks.
- `bun run check` is `astro check` then Biome. `biome.json` extends
  `@kcconfigs/biome/configs/astro`, which reads an `.astro` file's template as well as its
  frontmatter, so an import used only in the template counts as used. Keep that preset:
  without it, `bun run format` deletes the `BaseLayout` import from every page
  (`tests/config/biome.test.ts` guards this). Its formatting has no semicolons and 120-column
  lines. The preset (4.2.2 on) turns on Biome's HTML formatter, which is off by default
  and without which `format` skips `.astro` files entirely, and indents `<script>` bodies
  under their tags.
- Import through the aliases in `package.json` `imports`: `#lib/*` and `#legacy/*` map to a
  `.ts` file; `#components/*` and `#layouts/*` take the path as written, with its extension
  (`#components/atoms/Chip.astro`).
- Every piece of UI text is a catalog key with an entry in both `src/lib/i18n/en.ts` and
  `src/lib/i18n/th.ts`.
- An address or query key change must update `ENDPOINTS.md` in the same change.

## Change workflow

- Every change: follow `.claude/skills/project-shipping` (worktree and branch, test first,
  check/format/test, commit, push, pull request, preview URL).
- After the user approves: follow `.claude/skills/project-landing` (dated changelog entry,
  merge to main, delete the worktree, back on main).
- Every skill is named `project-*` (`tests/skills.test.ts`). Build and deploy details are
  `project-deploy`; the changelog format is `project-changelog`.

## Design system conventions

- Values live once, in `src/styles/tokens.css`. Component styles (an `.astro` `<style>`, and
  in the legacy the shadow CSS in `src/legacy/styles/shared.ts` and each component's `css`)
  reference them only through `var(--cc-*)`, never a literal hex, `rem`/`px`, or colour. Only
  part of this is machine-checked (`tests/legacy/components/token-leftovers.test.ts`,
  `tests/styles/tokens.test.ts`, `tests/styles/row-panel.test.ts`), so review the rest by eye.
- Buttons take `data-variant="quiet"` or `data-variant="danger"`; no attribute means the primary
  variant. Don't invent a fourth.
- Never key a CSS selector off translated text -- the interface ships in English and Thai. Use
  classes or locale-invariant attributes instead.
- Every list is one of two kinds, and a list that is neither is a bug. A **row list** is one
  panel with a line between the rows: `rowPanel` (`src/legacy/styles/shared.ts`) in a shadow component,
  the light-DOM `.row-panel` (`app.css`) elsewhere. A **card list** is one standalone panel per
  item: `card-tile.ts`, the limit group panels (`.gpanel`), the purchase list's per-card sections
  (`lineCards`). Don't write a local copy of either look.
- A row that opens in place is `actionRow` with `open` (`src/legacy/components/action-row.ts`); never
  build another. Its head is one `<button type="button">` with `aria-expanded` and `aria-controls`
  and nothing interactive inside; the buttons go in `action` as bare buttons (a page is an
  `a.btn`) and show in the details region, `hidden` when closed. One row is open per component:
  use `useOpenRow` (which also resets a `useTwoStep` swap when its row closes). The two-step
  _Delete_ and _Confirm_ are `useTwoStep` (`two-step.ts`). Namespace a row's id by kind and card
  (`plan:<card>:<id>`, `list:<id>`), since a payment's id repeats across cards. These
  list and row rules name the legacy pieces; their Astro replacements carry the same looks
  and behaviour.
- The global sheets (`@kcstyles/reset.css`, `tokens.css`, `app.css`) are imported once, by
  `BaseLayout`.

## Product requirements

- Before planning a refactor, a redesign or any change to behaviour, read `PRD.md`. It holds
  the requirements, the domain rules and data contracts to keep, the decisions and their
  reasons, and the open questions to settle with the user first.
- When a change ships, update `PRD.md` and `PRD_TH.md` together, keeping the IDs in step.
