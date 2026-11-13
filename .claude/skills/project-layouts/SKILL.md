---
name: project-layouts
description: Use when writing or editing a layout in src/layouts/ (the atomic template tier), changing what goes in every page's <html> or <head> — title, noindex, the theme boot, global CSS, Google Tag Manager — or the app shell (header, page, tab bar), adding a layout that wraps BaseLayout, or debugging a page with missing head tags, styles, theme or analytics.
---

# Layouts

Layouts are the *templates* tier of Atomic Design: they arrange organisms into a page shape
and leave the content to pages. Components are the `project-components` skill; routes are
the `project-pages` skill.

## BaseLayout owns the document

`src/layouts/BaseLayout.astro` is the only file that writes `<html>`, `<head>` and `<body>`.
It:

- ships `<html lang="en">`, which the boot script corrects before first paint;
- sets `charset`, `viewport`, `<meta name="robots" content="noindex, nofollow">` (PRD
  DD-169) and the favicon;
- runs the **boot** first in `<head>`: an `is:inline` script that applies the saved theme
  (`cc:theme`), the build tint (`data-env`) and the reader's language (`<html lang>`, by
  `detectLocale`'s rule) before anything paints. `tests/layouts/theme-boot.test.ts`
  holds the theme to `src/lib/ui/theme.ts`, `tests/layouts/locale-boot.test.ts` holds the
  language to `detectLocale`, and `tests/pages/pages.test.ts` checks the boot comes before
  the first `<link>`. It carries `data-astro-rerun`, so it runs again after every
  ClientRouter swap, which takes the next page's `<html>` attributes;
- renders Astro's `<ClientRouter />` (PRD DD-174): navigation swaps the next page in without
  a reload (see `project-pages` for what a page must do about it);
- writes `<title>{title} — cc-tracking</title>` from its required `title` prop, with
  `data-i18n-title` from the optional `titleKey`, which the copy pass replaces with the
  translated title (and the build's mark) in the browser;
- imports the global sheets in order: `@kcstyles/reset.css`, `../styles/tokens.css`,
  `../styles/app.css`;
- runs `loadGtm(import.meta.env.PUBLIC_GTM_ID, document)` from `#lib/gtm` in a processed
  `<script>`; without the id at build time the bundler drops it (see `project-deploy`);
- runs `startCopy(document)` from `#lib/i18n/copy` in the same script, putting every page's
  `data-i18n` copy in the reader's locale (PRD DD-171, see `project-components`), and again
  after every swap (`astro:after-swap`). That script runs once per visit to the site, not
  once per page;
- renders the page into `<body>` through its default `<slot />`.

Something every page needs in `<head>` goes here, not into pages. The shell every page shows
is `AppLayout`'s.

## AppLayout is the app shell

`src/layouts/AppLayout.astro` wraps `BaseLayout` and is what every page renders (PRD DD-173).
It lays out, in `<body>`:

- the `SiteHeader` organism (`#site-header`): the brand, the build mark (static, from the
  build stamps), today's date (the `HeaderDate` island, `transition:persist` so it survives
  navigation) and the header tabs;
- `<main id="page">` with `page` plus the page's `mainClass` (`page--narrow`,
  `page--form`), holding the page's `main` slot (its island);
- the `TabBar` organism (`#tabbar`): the bottom tabs (nothing floats beside them: the
  *+ New* menu retired, PRD DD-200);
- the default `<slot />`, after the tab bar, for anything a page needs outside `<main>`.

The header and the bottom bar's `nav` (`Tabs`) carry `transition:animate="none"`: on a
navigation the page's content cross-fades while the shell holds still. Put it on the box that
paints, not on a wrapper: `#tabbar` holds only a `position: fixed` child, so it has no height,
and naming it let the bar fade out with the page.

Props: `title` and `titleKey` (forwarded to `BaseLayout`), `tab` (the page's place, marked
in both navs) and `mainClass`. `tests/layouts/AppLayout.test.ts` covers it, and
`tests/pages/pages.test.ts` holds every page to its tab.

## Rules

- A layout is `src/layouts/<Name>Layout.astro`, imported as `#layouts/<Name>Layout.astro`.
- Layouts may import components from any tier and other layouts; they never import pages,
  and components never import layouts.
- Every layout other than `BaseLayout` wraps `BaseLayout` and forwards `title` (and any
  other head prop); it never writes `<html>` or `<head>` itself.
  `tests/pages/pages.test.ts` fails on a layout or page that does not reach `BaseLayout`.
- A layout arranges; it holds no page copy. Text, links and data come from the page through
  props or slots.
- Use named slots for regions a page fills, as `AppLayout`'s `main`.

## Testing

Render a layout under `// @vitest-environment node` with `createContainer` from
`tests/container.ts` (it carries the Svelte renderer the shell's island needs), and query
the result with `parseHtml`:

```ts
const html = await (await createContainer()).renderToString(AppLayout, {
	props: { title: "Cards", tab: "cards", mainClass: "page--narrow" },
	slots: { main: "<p>Body</p>" },
})
expect(parseHtml(html).querySelector("main#page")?.className).toBe("page page--narrow")
```

The Container does not run processed scripts, so `tests/layouts/BaseLayout.test.ts` checks
the GTM call and the stylesheet order in the source text, and `loadGtm` itself is tested in
`tests/lib/gtm.test.ts`. What only a browser shows (the favicon, styles applied, no theme
flash) is a preview check in the PR.
