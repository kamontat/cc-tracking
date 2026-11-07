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

## The shape of a page

Every page is `AppLayout` (the static shell, PRD DD-173) with the page's title and its
`titleKey`, tab, width and *+ New* choice, and in its `main` slot one Svelte island organism
that renders the reader's data in the browser (PRD DD-172):

```astro
---
import ListEntryPage from "#components/organisms/ListEntryPage.svelte"
import AppLayout from "#layouts/AppLayout.astro"
---

<!-- A stored draft to finish, send or delete (`?id=`); the list is the reader's data, so the page is an island. -->
<AppLayout title="Draft list" titleKey="title.listDraft" tab="home" fab={false} mainClass="page--narrow">
	<Fragment slot="main">
		<ListEntryPage client:load mode="draft" />
	</Fragment>
</AppLayout>
```

- `title` is the English tab title before the bundle runs; `titleKey` is its catalog key, which
  the copy pass translates (adding the build's mark).
- `tab` is the place the page belongs to (the card pages under Cards, `/pay` under
  Transactions, Locations under Settings, the list pages under Home).
- `mainClass` is the width (`page--narrow`, `page--form`, `page--tx`, `card-page`); leave it
  out for the full width.
- `fab={false}` is for a page where the reader is mid-task.
- The page itself stays static: no `<script>`. The island opens the store with
  `openRepository()` (`#lib/ui/startup`), loads through `createPageState`
  (`#lib/ui/page-state`) and reads and writes its address through the `AddressBar` seam
  (`#lib/ui/address-bar`); see `project-components`.

`tests/pages/pages.test.ts` lists every page with the width, tab and *+ New* each asks for,
checks each renders its content in `<main>` with a translated title and the shell, and fails
on a page that does not reach `BaseLayout`. Add a new page to every list.

## Navigation is client-side (PRD DD-174)

`BaseLayout` turns on Astro's `<ClientRouter />`: a link, or Back and Forward, fetches the
next page and swaps it in with a view transition, with no reload. Every address is still its
own static page, so this changes nothing in `ENDPOINTS.md`. What follows from it:

- **An island mounts on every visit** and is torn down when the next page swaps in, so it
  starts its work in `onMount`, never in its top-level code (which also runs at build time).
- **Clean up on leaving.** Anything an island sets up beyond its own DOM — a language
  listener, a `popstate` or document listener, a timer — is undone in the function `onMount`
  returns, since the next page swaps in without a reload. `subscribe` (`#lib/i18n/index`)
  and `AddressBar`'s `onPop` return a remover: call it there.
- **History.** Rewrite the address in place with `history.replaceState(history.state, …)`,
  never `null`: the router keeps its own state on each page's entry and skips entries
  without it, so Back would land on a page it doesn't show. An in-page entry pushed for an
  open sheet (`pushState(null, …)`) carries no state on purpose, so its Back stays the
  page's own `popstate`.
- A full reload (`location.assign`/`replace`) still works and is fine after a save.

## Static parts and slots (PRD DD-175)

A page composes components inside `AppLayout`'s `main` slot and keeps the page-level
decisions — which sections, in which order, and what is the same for every reader (tab,
title, width). What is the same for every reader stays `.astro`; only what shows the reader's
data is the island. Settings > Locations has a static sub-header over its island:

```astro
---
import SubHeader from "#components/molecules/SubHeader.astro"
import LocationsEditor from "#components/organisms/LocationsEditor.svelte"
import AppLayout from "#layouts/AppLayout.astro"
---

<!-- Settings > Locations (RD-17): a static sub-header, and the reader's locations as an island. -->
<AppLayout title="Locations" titleKey="title.locations" tab="settings" mainClass="page--form">
	<Fragment slot="main">
		<SubHeader titleKey="settings.locations.title" back="/settings" />
		<LocationsEditor client:load />
	</Fragment>
</AppLayout>
```

When sections share state but static ones sit between them, as on Settings (DD-176), one
island draws the shared sections and the page passes the rest in as named slots:

```astro
<SettingsPanels client:load>
	<DisplaySettings slot="display" client:load />
	<About slot="about" />
</SettingsPanels>
```

The Svelte 5 island receives each slot as a snippet prop of the same name
(`display?: Snippet`, rendered with `{@render display?.()}`); a test passes one with
`createRawSnippet`. A slot arrives wrapped in `<astro-slot>`, so a parent rule like
`.set > * + *` no longer reaches the slotted rows: they draw their own dividers.

A page is never imported by anything and gets no directory under `src/components/`.

## Adding a page

1. Settle the behaviour in `PRD.md` first, and add its rows to `PRD.md` and `PRD_TH.md`
   together, IDs in step.
2. Write the island organism in `src/components/organisms/` (`project-components`), with its
   logic as plain functions in `src/lib/` and tests mirroring both under `tests/`.
3. Create `src/pages/<path>.astro` in the shape above: `AppLayout` with `title`, `titleKey`,
   `tab`, `mainClass` and `fab` as needed, and the island with `client:load` in the `main`
   slot.
4. Add the title key and every string the island shows to both `src/lib/i18n/en.ts` and
   `th.ts`.
5. Add the page to every list in `tests/pages/pages.test.ts`, and its address and query keys
   to `ENDPOINTS.md`.
6. `bun run build` and confirm it in the `generating static routes` list, then
   `bun run preview` and open it. Screenshot it at 390 and 1280px, light and dark, English
   and Thai, for the PR.
