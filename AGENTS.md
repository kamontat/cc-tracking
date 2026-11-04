
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Stack

- Static pages, no server code. Each page is `src/routes/<path>.html` with a module that
  renders Lit components (`lit`, decorators) from `src/components/`; domain rules live in
  `src/lib/domain/`, storage (browser `localStorage`) in `src/lib/storage/`.
- `@kctools/bun-server` builds and serves the pages: `bun run dev` (dev server, `--port` to
  change it from 3000), `bun run build` (through `scripts/build.ts`, which stamps the
  `BUN_PUBLIC_*` build info, into `dist/`) and `bun run preview` (serves the build).
- Deployed as Cloudflare static assets: `wrangler.jsonc` serves `dist/`, and
  `public/_redirects` holds the redirects.
- Tests are `bun test` with happy-dom preloaded (`bunfig.toml`, `tests/setup-happydom.ts`),
  so components render in tests. `bun run check` is Biome, `bun run typecheck` is `tsc`.
- Import through the aliases in `package.json` `imports`: `#lib/*`, `#components/*` and
  `#styles/*`, each mapping to a `.ts` file.
- Every piece of UI text is a catalog key with an entry in both `src/lib/i18n/en.ts` and
  `src/lib/i18n/th.ts`.
- An address or query key change must update `ENDPOINTS.md` in the same change.

## Change workflow

- Every change: follow `.claude/skills/shipping-a-change` (worktree and branch, test first,
  check/format/test, commit, push, pull request, preview URL).
- After the user approves: follow `.claude/skills/landing-a-change` (dated changelog entry,
  merge to main, delete the worktree, back on main).

## Design system conventions

- Values live once, in `src/styles/tokens.css`. Shadow CSS (`src/styles/shared.ts`, and any
  component's local `css`) references them only through `var(--cc-*)`, never a literal hex,
  `rem`/`px`, or colour. Only part of this is machine-checked
  (`src/components/token-leftovers.test.ts`, `src/styles/tokens.test.ts`,
  `src/styles/row-panel.test.ts`), so review the rest by eye.
- Buttons take `data-variant="quiet"` or `data-variant="danger"`; no attribute means the primary
  variant. Don't invent a fourth.
- Never key a CSS selector off translated text -- the interface ships in English and Thai. Use
  classes or locale-invariant attributes instead.
- Every list is one of two kinds, and a list that is neither is a bug. A **row list** is one
  panel with a line between the rows: `rowPanel` (`src/styles/shared.ts`) in a shadow component,
  the light-DOM `.row-panel` (`app.css`) elsewhere. A **card list** is one standalone panel per
  item: `card-tile.ts`, the limit group panels (`.gpanel`), the purchase list's per-card sections
  (`lineCards`). Don't write a local copy of either look.
- A row that opens in place is `actionRow` with `open` (`src/components/action-row.ts`); never
  build another. Its head is one `<button type="button">` with `aria-expanded` and `aria-controls`
  and nothing interactive inside; the buttons go in `action` as bare buttons (a page is an
  `a.btn`) and show in the details region, `hidden` when closed. One row is open per component:
  use `useOpenRow` (which also resets a `useTwoStep` swap when its row closes). The two-step
  *Delete* and *Confirm* are `useTwoStep` (`two-step.ts`). Namespace a row's id by kind and card
  (`plan:<card>:<id>`, `list:<id>`), since a payment's id repeats across cards.
- `#styles/*` maps to `.ts` only, so the route modules import `tokens.css` and `app.css` by
  relative path, not through the alias.

## Product requirements

- Before planning a refactor, a redesign or any change to behaviour, read `PRD.md`. It holds
  the requirements, the domain rules and data contracts to keep, the decisions and their
  reasons, and the open questions to settle with the user first.
- When a change ships, update `PRD.md` and `PRD_TH.md` together, keeping the IDs in step.
