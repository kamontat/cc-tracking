---
name: project-deploy
description: Use when changing `bun run build`, `bun run dev`, `bun run preview`, astro.config.ts, the build stamps, public/ (_headers, _redirects), wrangler.jsonc, the dist/ output shape, or anything under .github/workflows/ — including bumping a pinned action SHA, changing Google Tag Manager, or debugging a Cloudflare deploy.
---

# Build and deployment

`project-shipping` and `project-landing` say *when* a change is built and deployed (the
preview on every pull request, production on every merge). This skill is *how*: what the
build writes, what the workflows run, and how to debug them.

## Build

`astro build` renders every route under `src/pages/` to static HTML in `dist/`, bundled
scripts and styles in `dist/_astro/` under hashed names, and copies `public/` to the root of
`dist/`. Astro empties `dist/` first. Small scripts and stylesheets are inlined into the
HTML, so a grep for something baked into a script must read the HTML too.

`astro.config.ts` fixes the output shape: `output: "static"` (no adapter, no server code),
`build.format: "file"` (`card/edit.astro` → `dist/card/edit.html`) and
`trailingSlash: "never"`. Cloudflare serves `card/edit.html` at `/card/edit`, so the three
change together; an adapter or `output: "server"` would make the deploy a Worker script,
which `wrangler.jsonc` is not set up for.

### Build stamps

Before Vite starts, `astro.config.ts` puts five stamps in the environment through
`resolveBuildEnv` (`scripts/build-env.ts`), and Vite inlines each `import.meta.env.PUBLIC_*`:

| Stamp | From | Shown |
|---|---|---|
| `PUBLIC_COMMIT_SHA` | `git rev-parse HEAD` | Settings > About, with a link to the commit |
| `PUBLIC_BUILT_AT` | the build's clock | Settings > About |
| `PUBLIC_BRANCH` | `git rev-parse --abbrev-ref HEAD` | Settings > About |
| `PUBLIC_ENVIRONMENT` | `local` unless a workflow sets it | header tint, `(local)` / `(pr-N)` title mark |
| `PUBLIC_PR_NUMBER` | `""` unless the preview workflow sets it | `(pr-N)` |

A value already in the environment wins, so a workflow (or you) can override git. A tree
without git builds with empty stamps. `buildInfo()` (`#lib/ui/build-info`) reads them and
reports `development` with no stamps on `astro dev`. Every `PUBLIC_*` is declared on
`ImportMetaEnv` in `src/env.d.ts`.

### public/

- `_headers` sends `X-Robots-Tag: noindex, nofollow` on every response (PRD DD-169). There
  is deliberately no `robots.txt`.
- `_redirects` holds the 301s for old addresses (`/backup` → `/settings`). Neither file does
  anything on `astro dev` or `astro preview`; check them on the preview deploy.

## Deployment

The site is a Cloudflare Worker serving static assets. `wrangler.jsonc` sets
`build.command` to `bun run build` and `assets.directory` to `dist/`, so wrangler runs the
build itself — environment variables for the build go on the wrangler step.

Three workflows, every action pinned to a full commit SHA with its tag in a trailing comment:

- `main.yml` — every push: install, `bun run check`, `bun run test`, `bun run build`.
- `deploy-preview.yml` — pull requests: `wrangler versions upload --preview-alias
  pr-<number>`, setting `PUBLIC_PR_NUMBER`, `PUBLIC_ENVIRONMENT: preview` and
  `PUBLIC_BRANCH` (the checkout is detached, so git can't name it). Served at
  `https://pr-<number>-cc-tracking.kcinth.workers.dev`.
- `deploy-production.yml` — pushes to `main`: `wrangler deploy` with
  `PUBLIC_ENVIRONMENT: production`, `PUBLIC_BRANCH: main` and `PUBLIC_GTM_ID`. Served at
  `https://cc-tracking.kc.in.th`.

`environment.url` in each workflow is only the link GitHub shows; wrangler never reads it.
Both deploy jobs need the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and grant
`deployments: write` on the job; the files open with `permissions: {}`. Keep that shape.

Bun's version is pinned in `mise.toml`. Bump a pinned action SHA by resolving the tag again,
never by hand, and update the trailing comment in the same edit:

```sh
GH_TOKEN=$(gh auth token --user kamontat) gh api repos/actions/checkout/releases/latest --jq .tag_name
GH_TOKEN=$(gh auth token --user kamontat) gh api repos/actions/checkout/commits/<tag> --jq .sha
```

Pushing a change under `.github/workflows/` needs a token with the `workflow` scope.

## Google Tag Manager

`BaseLayout` calls `loadGtm(import.meta.env.PUBLIC_GTM_ID, document)`. Only
`deploy-production.yml` sets the id (`GTM-5TMJN4ZX`, written in the workflow), so previews
and local builds carry no GTM code at all — the bundler drops a call it can prove does
nothing — and send no data. To confirm production has it, grep the page:
`curl -s https://cc-tracking.kc.in.th/ | grep -o GTM-5TMJN4ZX`. To try it locally:
`PUBLIC_GTM_ID=GTM-5TMJN4ZX bun run build && bun run preview`.

## Debugging a failed deploy

- `GH_TOKEN=$(gh auth token --user kamontat) gh run view <id> --log-failed` first; quote the
  decisive line.
- `Authentication error` / `10000`: the token is scoped to the `cc-tracking` Worker; check it
  and the account id.
- `Tsconfig not found astro/tsconfigs/strictest` locally: the root checkout's
  `node_modules` is stale; `bun install` in the root (see `project-scripts`).
- Deploy passed but a page is broken: the browser console. A 404 on `/_astro/` means a stale
  or partial `dist/`; a 404 on the page means no file under `src/pages/` maps to that path,
  or the link has a trailing slash.
