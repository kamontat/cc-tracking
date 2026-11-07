---
name: project-scripts
description: Use when adding or changing a package script, adding a file under scripts/, running the dev server or the tests, changing vitest.config.ts, tsconfig.json, biome.json or the import aliases, or fixing a `bun run check` (astro check or Biome) or `bun run test` failure.
---

# Scripts and checks

## Package scripts

A script that is one command is that command in `package.json` — `astro dev`, `astro check`,
`biome check`, `vitest run`. `bun run` puts `node_modules/.bin` on `PATH`, so don't write
`bunx` inside a script, and don't wrap a single command in a file under `scripts/`.
Arguments pass through: `bun run test tests/lib/gtm.test.ts`, `bun run dev --port 4000`.

| Script | Does |
|---|---|
| `dev` | `astro dev` on <http://localhost:4321>, hot reload; 404s unknown paths and the trailing-slash form, as production does |
| `build` | `astro build` into `dist/` (see `project-deploy`) |
| `preview` | serves the built `dist/` without rebuilding |
| `test` | `vitest run` |
| `check` | `check:type` (`astro check`) then `check:biome` (`biome check`) |
| `format` | `biome check --unsafe --write`; read the diff after, unsafe fixes can change behaviour |
| `astro` | passthrough: `bun run astro add <integration>`, `bun run astro sync` |

**Every script runs on Bun.** `astro` and `vitest` have a `node` shebang; `bunfig.toml`'s
`[run] bun = true` runs them on Bun instead, which is also why tests can use `Bun.file` and
`Bun.Glob`. Keep it.

A *program* (generates or migrates something) is a file under `scripts/`.
`scripts/build-env.ts` is not one: `astro.config.ts` imports it to stamp the build (see
`project-deploy`).

## Where code lives

| What | Where |
|---|---|
| Routes | `src/pages/` (`project-pages`) |
| Layouts | `src/layouts/` (`project-layouts`) |
| Components | `src/components/{atoms,molecules,organisms}/` (`project-components`) |
| Domain, storage, i18n, UI helpers | `src/lib/{domain,storage,i18n,ui}/` |
| Styles | `src/styles/` (`tokens.css`, `app.css`) |
| Static files | `public/` (`_headers`, `_redirects`, favicon) |
| Tests | `tests/`, mirroring `src/` (`src/lib/gtm.ts` → `tests/lib/gtm.test.ts`); `scripts/` → `tests/scripts/` |

Aliases (`package.json` `imports`): `#lib/*` adds `.ts`, so a rune module
`src/lib/ui/open-row.svelte.ts` is `#lib/ui/open-row.svelte`; `#components/*` and
`#layouts/*` map the path as written, so `.astro` and `.svelte` imports carry their extension.
No TypeScript import carries `.ts`.

## Tests

`vitest.config.ts` wraps Astro's `getViteConfig`, so `.astro` files and the aliases resolve.
It runs `tests/**/*.test.ts` in a **happy-dom** environment (Svelte islands mount into it)
with `tests/setup.ts`, which resets the locale and `localStorage` before every test and the
seed/migration markers after. A file that renders `.astro` with the Container API starts
with `// @vitest-environment node`: under happy-dom's globals Astro's renderer mistakes a
component for a framework one ("NoMatchingRenderer").

## What `check:type` reads

`astro check` runs TypeScript over every `.astro` file and everything `tsconfig.json`
includes — `src/`, `tests/` and `scripts/` alike. `tsconfig.json` extends
`@kcconfigs/tsconfig/bun` then `astro/tsconfigs/strictest`. TypeScript stays on 6: `@astrojs/check` and
`@kcconfigs/tsconfig` don't accept 7 yet.

Worktrees sit inside the root checkout (`.claude/worktrees/*`), so Astro also resolves the
root's `tsconfig.json`. A root `node_modules` older than the merged lockfile fails every
worktree's build and tests with `Tsconfig not found astro/tsconfigs/strictest`; fix it with
`bun install` in the root (`project-landing` does this after every merge).

## Strictness

- `noUncheckedIndexedAccess`: every index and regex capture is `T | undefined`. Narrow with a
  default, `??` or a guard — not `!`, which Biome flags, tests included.
- `noPropertyAccessFromIndexSignature`: `dataset["theme"]`, not `dataset.theme`. A
  `PUBLIC_*` variable is reachable with a dot only once declared in `src/env.d.ts`.
- `exactOptionalPropertyTypes`: `{ name?: string }` rejects `{ name: undefined }`.
- `verbatimModuleSyntax`: type-only imports are `import type`.

## Biome

`biome.json` extends `@kcconfigs/biome/configs/astro` and skips `.claude/`, `public/` and
`docs/superpowers/`. The preset formats with tabs, no semicolons, 120 columns and padded
Markdown tables, and reads `.astro` templates as well as frontmatter — so an import used
only in the template is not "unused", and `.astro` files are formatted like the TypeScript
(`tests/config/biome.test.ts` guards both). Import order is enforced by the organize-imports
assist. `biome.json` is plain JSON: a comment makes Biome refuse it.
