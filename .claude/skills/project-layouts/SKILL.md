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
  `detectLocale`'s rule) before anything paints. `tests/legacy/routes/theme-boot.test.ts`
  holds the theme to `src/lib/ui/theme.ts`, `tests/layouts/locale-boot.test.ts` holds the
  language to `detectLocale`, and `tests/pages/pages.test.ts` checks the boot comes before
  the first `<link>`;
- writes `<title>{title} — cc-tracking</title>` from its required `title` prop;
  `bootstrap` replaces it with the translated title in the browser;
- imports the global sheets in order: `@kcstyles/reset.css`, `../styles/tokens.css`,
  `../styles/app.css`;
- runs `loadGtm(import.meta.env.PUBLIC_GTM_ID, document)` from `#lib/gtm` in a processed
  `<script>`; without the id at build time the bundler drops it (see `project-deploy`);
- runs `startCopy(document)` from `#lib/i18n/copy` in the same script, putting every page's
  `data-i18n` copy in the reader's locale (PRD DD-171, see `project-components`);
- renders the shell the legacy route modules draw into: `#site-header`, `<main id="page">`
  with `page` plus the page's `mainClass` (`page--narrow`, `page--form`, `page--tx`,
  `card-page`) and `#tabbar`, then the default `<slot />`.

Something every page needs in `<head>` goes here, not into pages.

## Rules

- A layout is `src/layouts/<Name>Layout.astro`, imported as `#layouts/<Name>Layout.astro`.
- Layouts may import components from any tier and other layouts; they never import pages,
  and components never import layouts.
- Every layout other than `BaseLayout` wraps `BaseLayout` and forwards `title` (and any
  other head prop); it never writes `<html>` or `<head>` itself.
  `tests/pages/pages.test.ts` fails on a layout or page that does not reach `BaseLayout`.
- A layout arranges; it holds no page copy. Text, links and data come from the page through
  props or slots.
- Use named slots for regions a page fills; the default slot is the main content.

## Where the shell is going

Today the legacy `chrome.ts` (`src/legacy/lib/ui/`) draws the header, brand, build mark and tab bar into the empty
`#site-header` and `#tabbar` at runtime. The planned step is an `AppLayout` that wraps
`BaseLayout` and renders `SiteHeader` and `TabBar` organisms at build time, taking the
current tab from the page. When it lands, the slots move out of `BaseLayout` into it, and
`chrome.ts` keeps only what needs the browser (the locale, the build mark from
`#lib/ui/build-info`).

## Testing

Render a layout with the Container API under `// @vitest-environment node`, passing props
and slots:

```ts
const html = await container.renderToString(BaseLayout, {
	props: { title: "Cards", mainClass: "page--narrow" },
	slots: { default: "<p>Body</p>" },
})
expect(html).toMatch(/<main class="page page--narrow"/)
```

The Container does not run processed scripts, so `tests/layouts/BaseLayout.test.ts` checks
the GTM call and the stylesheet order in the source text, and `loadGtm` itself is tested in
`tests/lib/gtm.test.ts`. What only a browser shows (the favicon, styles applied, no theme
flash) is a preview check in the PR.
