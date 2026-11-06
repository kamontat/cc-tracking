---
name: project-pages
description: Use when adding, renaming or editing a page or route under src/pages/ (the atomic pages tier), changing an address or query key, linking between pages, or when a page builds but paints unstyled, has no Google Tag Manager, or 404s after deploy.
---

# Pages

Pages are the *pages* tier of Atomic Design: a layout (template) filled with the page's
content. Layouts are the `project-layouts` skill; components are the `project-components`
skill.

## How routes map

Every `.astro` file under `src/pages/`, at any depth, is a route: its path without the
extension, with `index.astro` answering its directory. Files and directories starting with
`_` are not routes, and **any `.ts` under `src/pages/` becomes an endpoint** — which is why
tests live in `tests/`, never beside a page.

```text
src/pages/index.astro          ->  /             (dist/index.html)
src/pages/cards.astro          ->  /cards        (dist/cards.html)
src/pages/card/edit.astro      ->  /card/edit    (dist/card/edit.html)
```

`astro.config.ts` sets `build.format: "file"` and `trailingSlash: "never"`, so Cloudflare's
static assets serve `card/edit.html` at `/card/edit`. Link with root-relative paths that match
exactly — `/card/edit`, never `/card/edit/`.

The site is `output: "static"`: a dynamic route (`[id].astro`) needs `getStaticPaths()`,
and since cards exist only in the reader's browser there is nothing to enumerate at build
time. A page picks its record from the query string instead (`/card?id=`); moving to path
ids is the record-paths plan in `TODO.md`, an open design.

## Every address is a contract

- An address or query key change updates `ENDPOINTS.md` in the same change.
- Pages read state from the query string only; no page reads or writes a fragment. Unknown
  keys are ignored, and a page rewriting its own address leaves out keys at their default.
- A removed or moved address that people may have bookmarked gets a 301 in
  `public/_redirects` (as `/backup` → `/settings`). `astro dev` and `astro preview` ignore
  that file; check redirects on the preview deploy.
- Behaviour a page ships goes in `PRD.md` and `PRD_TH.md` together, IDs in step.

## The shape of a page today

Every page is `AppLayout` (the static shell, PRD DD-173) with the page's title, route, tab,
width and *+ New* choice, and one script registering its legacy route module, which renders
the Lit components into `#page`:

```astro
---
import AppLayout from "#layouts/AppLayout.astro"
---

<AppLayout title="Edit card" route="card/edit" tab="cards" fab={false} mainClass="page--form">
	<script>
		import { start } from "#legacy/routes/card/edit"
		import { onPage } from "#lib/ui/spa"

		onPage("card/edit", start)
	</script>
</AppLayout>
```

- `route` is the page's path under `src/pages/` without `.astro` (`index` for Home); the
  script registers the same name.
- `tab` is the place the page belongs to (the card pages under Cards, `/pay` under
  Transactions, Locations under Settings, the list pages under Home).
- `fab={false}` is for a page where the reader is mid-task.

`tests/pages/pages.test.ts` lists every page with the width, tab and *+ New* each asks for,
checks each registers the route of the same name and renders the shell, and fails on a page
that does not reach `BaseLayout`. Add a new page to every list.

## Navigation is client-side (PRD DD-174)

`BaseLayout` turns on Astro's `<ClientRouter />`: a link, or Back and Forward, fetches the
next page and swaps it in with a view transition, with no reload. Every address is still its
own static page, so this changes nothing in `ENDPOINTS.md`. What follows from it:

- **A page's script runs once**, the first time the page is visited. Never start a page's
  work at the top of a module: register it with `onPage(route, start)` (`#lib/ui/spa`),
  which runs `start` on every visit to a page whose `<main data-route>` names that route.
  `tests/legacy/routes/spa-ready.test.ts` fails on a route that starts itself on import.
- **Clean up on leaving.** Anything a page sets up beyond its own DOM — a language
  listener (`subscribe(fn, { signal: pageSignal() })`), a `popstate` or document listener,
  a timer — passes `pageSignal()` or stops itself, since the next page swaps in without a
  reload. Components clean up when their elements disconnect.
- **History.** Rewrite the address in place with `history.replaceState(history.state, …)`,
  never `null`: the router keeps its own state on each page's entry and skips entries
  without it, so Back would land on a page it doesn't show. An in-page entry pushed for an
  open sheet (`pushState(null, …)`) carries no state on purpose, so its Back stays the
  page's own `popstate`.
- A full reload (`location.assign`/`replace`) still works and is fine after a save.

## The shape a page is moving to

As components convert (see `project-components`), a page composes organisms inside its
layout and keeps the page-level decisions — which sections, in which order, and the data
that is the same for every reader (tab, title):

```astro
---
import NeedsYou from "#components/organisms/NeedsYou.astro"
import ReadyToUse from "#components/organisms/ReadyToUse.astro"
import AppLayout from "#layouts/AppLayout.astro"
---

<AppLayout title="Home" tab="home">
	<NeedsYou />
	<ReadyToUse />
</AppLayout>
```

The page itself stays static. An organism like `NeedsYou` is a static `.astro` frame (heading,
empty state) holding a Svelte island for the rows built from the reader's data (PRD DD-172),
so a page holds no `<script>` once its route module is gone.

A page is never imported by anything and gets no directory under `src/components/`. When its
last Lit piece is gone, its route module is deleted and the "runs the route module" check
drops that page.

## Adding a page

1. Create `src/pages/<path>.astro` over `BaseLayout` (or a layout wrapping it).
2. Add it to the page lists in `tests/pages/pages.test.ts`, and its address to
   `ENDPOINTS.md`.
3. `bun run build` and confirm it in the `generating static routes` list, then
   `bun run preview` and open it.
