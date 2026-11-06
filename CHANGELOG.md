# Changelog

This changelog is built from the design specs written for each stage of the project. Entries
are newest first. Each one says what changed and keeps the decisions behind it, because the
reasons don't show up in the code.

## 2026-11-06: Built with Astro: template conventions, a static shell, client-side navigation, Locations and Settings converted, a steady tab bar, and faster page changes

### BREAKING CHANGES

- `@kctools/bun-server`, `scripts/build.ts` and the `src/routes/*.html` pages are gone. Pages
  are `src/pages/<path>.astro` over `src/layouts/BaseLayout.astro`, built by `astro build`; the
  dev server is `bun run dev` on port 4321.
- Tests run on Vitest (`bun run test`), not `bun test`; `bun:test` imports no longer work.
  `bun run typecheck` is gone: `bun run check` runs `astro check` and then Biome.
- The build stamps are `PUBLIC_COMMIT_SHA`, `PUBLIC_BUILT_AT`, `PUBLIC_PR_NUMBER`,
  `PUBLIC_ENVIRONMENT` and `PUBLIC_BRANCH`, no longer `BUN_PUBLIC_*`.
- Google Tag Manager loads only on production. Pull request previews and local builds send no
  data, and the `<noscript>` iframe is gone.
- Tests live in `tests/`, mirroring `src/`; a `*.test.ts` under `src/` or `scripts/` no longer
  runs.
- The skills are `project-shipping`, `project-landing` and `project-changelog`; the old
  `shipping-a-change`, `landing-a-change` and `changelog` names are gone.
- Everything Lit is in `src/legacy/`, imported as `#legacy/*`: the components (was
  `src/components/*.ts`), the route modules (was `src/routes/`), and `lib/ui/{chrome,shell,
  page,icons,card-label,list-share,sub-header}.ts`, `lib/i18n/controller.ts` and
  `styles/shared.ts`. Imports of the old paths, and the `#styles/*` alias, no longer resolve.
- Pages render `AppLayout` (with a `tab` and, where needed, `fab={false}`), not `BaseLayout`,
  which now writes only the document. The legacy `shell.ts` and `cc-fab-menu` are gone,
  `chrome.ts` no longer draws the header or tab bar, and the `data-pay-page`,
  `data-list-page` and `data-form-page` attributes are gone.
- _+ New_'s menu no longer moves focus to its first action when it opens, and the arrow keys
  no longer move between its actions; Tab reaches them next (DD-104).
- A legacy route module no longer starts on import: it exports `start()`, and its page
  registers it with `onPage("<route>", start)` and names the route on `AppLayout`. Every page's
  language listener and `popstate` handler takes `{ signal: pageSignal() }`.
- Google Tag Manager now sees only the first page of a visit. Counting every page needs a
  History Change trigger in the container.

### Features

- New skills from the template, adapted to cc-tracking: `project-components`,
  `project-layouts`, `project-pages`, `project-scripts` and `project-deploy`.
- `src/components/` has the atomic tiers `atoms/`, `molecules/` and `organisms/`;
  `tests/components/atomic.test.ts` fails on a component outside a tier or importing one it
  may not, and `#components/*` imports `.astro` files as written.
- `tests/legacy/boundary.test.ts` keeps the legacy fenced: no `lit` import outside
  `src/legacy/`, and nothing outside it imports `#legacy/*` except a page's route script, so
  each conversion can delete its legacy file without breaking new code.
- Static `.astro` copy can be translated: an element written as
  `<span data-i18n="nav.cards">Cards</span>` is put in the reader's language by `startCopy`
  (`#lib/i18n/copy`), which every page runs and which follows a later change of language. A
  key either catalog lacks fails `tests/lib/i18n/markup-keys.test.ts`.
- A static element's `aria-label` is translated the same way, through `data-i18n-aria-label`.
- Svelte islands (`@astrojs/svelte`, Svelte 5) render what the browser has to; the first is
  the header's date (`HeaderDate`). `tests/container.ts` renders islands in tests, and happy-dom
  tests mount them with Svelte's client build.
- Moving between pages swaps the next page in with a view transition instead of reloading
  (Astro's `<ClientRouter />`, DD-174), for links and Back/Forward alike. The header and tab
  bar hold still, the date carries over, and theme, tint and language never flash.
- `#lib/ui/spa`: `onPage` starts a page's route on every visit, and `pageSignal()` lets what
  a page set up go when the reader leaves; `subscribe` takes a `signal`.

### Improvements

- The header and the bottom tab bar are static Astro, built once rather than drawn by script
  on every load (DD-173): `AppLayout` with the `SiteHeader` and `TabBar` organisms, the `Tabs`
  and `FabMenu` molecules and the `Icon` atom. Each page names its own tab, and _+ New_ is an
  HTML popover that opens and closes with no JavaScript.
- The page's language is set on `<html lang>` before first paint, by the same rule as the app
  (a saved pick, then the browser's languages, then Thai), and a Thai page keeps its
  `data-i18n` copy hidden until it is translated, so a Thai reader never sees English first.
- The thirteen copied HTML shells are one `BaseLayout` carrying the noindex meta, the theme
  boot, the global CSS and the shell slots; each page passes only its title and width, and
  imports its route module. `tests/pages/pages.test.ts` renders every page to keep that true.
- Every page now ships `<html lang="en">`, until `chrome.ts` sets the reader's locale.
- Biome extends `@kcconfigs/biome/configs/astro` (4.2.2), which lints and formats `.astro`
  files as well. The whole repo now follows its base formatting: no semicolons, 120-column
  lines, padded Markdown tables; `tests/config/biome.test.ts` checks the `.astro` rules.
- Dependencies match the template: Astro 7.4.5, Vitest 5.1.0, Biome 2.6.5, Wrangler 4.158.0.
- A page may reach `BaseLayout` through another layout, and every layout must wrap it, ready
  for an app-shell layout. `<div row>` and `<div block>` type-check in `.astro` markup.
- Landing runs `bun install` on `main` after a merge: a stale root install broke every
  worktree's build and tests with `Tsconfig not found astro/tsconfigs/strictest`.
- The hard-coded English check and the old statement payment check scan the legacy and every
  Astro UI folder, and fail when they find nothing, so an emptied folder can't pass them
  silently.
- Settings > Locations is the first page converted (DD-175): a static `SubHeader` and the
  `LocationsEditor` Svelte island replace its legacy Lit route. It looks and works as before.
- Settings is converted too (DD-176): the `SettingsPanels` island draws its sections, with
  Display (`DisplaySettings`, an island) and About (static, apart from the `BuiltTime` island)
  passed in as slots. _Restore a copy_ and _Delete old purchases_ are Svelte sheets over a new
  `Sheet` molecule. It looks and works as before; the purge sheet's age chips now line up with
  the note under them.
- `openRepository` (`#lib/ui/startup`) opens the store and runs the startup migrations for
  islands and legacy pages alike; `AppLayout`'s `titleKey` translates the page title with the
  build's mark; `ErrorBanner` and `SubHeader` are shared molecules for the pages still to come.
- `biome.json` allows files up to 2 MiB: `PRD_TH.md`'s padded tables had passed 1 MiB, and
  Biome had quietly stopped checking it.
- Pages change in about 0.3 to 0.4 s instead of 2 to 3 s with two years of purchases
  (DD-178). The hashed build files under `/_astro/` are cached for a year as `immutable`
  rather than re-checked with the server one by one on every page, and links are prefetched
  as they come into view.

### Bug fixes

- Cards, Pay and Transactions rewrote the address with `history.replaceState(null, …)`, which
  wiped the router's history state, so a later Back could land on a page it didn't show; they
  keep `history.state` now, guarded by `tests/legacy/routes/spa-ready.test.ts`.
- _+ New_ and, on a phone, the bottom tab bar no longer flash on a page change. The
  hold-still marker sat on their `#tabbar` slot, which has no height because both are
  `position: fixed`, so they faded out with the page; the bar and _+ New_ now carry it
  themselves.
- An English reader no longer sees Thai inside Settings and Locations before they load. The
  build wrote every island in Thai, the fallback for a reader with no language, while the
  static copy beside it was English; the build now writes English, and a Thai page hides an
  island (`astro-island[ssr]`) until it runs in Thai (DD-171).

### Decisions

- Slow page changes were fixed at the cause rather than covered with a loading indicator
  (DD-178): measured, the wait was network round trips, not work on the data. Pages keep a
  revalidate-every-time cache, since an old cached page would ask for hashed files a new
  deploy no longer has; with the scripts cached, no indicator is needed.
- The components stay Lit for now (DD-170). All data lives in the browser, so nothing renders
  at build time; the move to Astro components comes page by page after this. A rewrite of
  every component in one go was rejected as weeks of work with no visible gain.
- GTM follows the template: the container id is set only by the production deploy, so previews
  stop counting visits. Keeping the inline snippet on every build was the alternative.
- TypeScript stays on 6.0.3: `@astrojs/check` and `@kcconfigs/tsconfig` do not accept 7 yet.
- Translated copy (DD-171): static markup carries English plus its catalog key in
  `data-i18n`, swapped to the reader's locale by one shared pass. Per-locale pages (`/th/...`)
  were rejected: the address would fight the language setting with a redirect on every load.
- Static first, Svelte islands for what the browser renders (DD-172): a component is static
  `.astro` unless it is built from the reader's data or reacts to input, and then it is a
  small Svelte island, never a raw `<script>` building markup. Lit for the client parts and
  hand-written DOM updates were the alternatives.
- The Lit code waits in one `src/legacy/` folder rather than being sorted into the atomic
  tiers as Lit files, so `src/components/` only ever holds converted Astro and the legacy
  folder only shrinks.
- The shell is static Astro with two browser parts (DD-173): the date as a Svelte island, and
  _+ New_'s menu as an HTML popover rather than an island, so a two-link menu ships no
  JavaScript. A closed popover `div` hides itself, since the reset's `div { display: flex }`
  outranks the browser's own hiding and left the closed menu catching taps.
- Navigation through Astro's ClientRouter, not a single-page app (DD-174): every address stays
  a static page, so nothing about addresses or the deploy changes. The language stays a reader
  setting (DD-171) rather than Astro's i18n routing, which would put it in the address.
- The conversion starts with the smallest page (DD-175), Settings > Locations, to set the
  pattern every later page follows; each conversion keeps the legacy markup, so it is checked
  against production screenshots rather than redesigned along the way.
- Settings is one island for the sections that share state (a restore re-reads the Locations
  summary and clears the reset message), with the static sections passed in as slots (DD-176).
  Rejected: an island per section with a shared store, and keeping the Lit sheets inside it.

## 2026-11-04: The redesign ships, and no page is indexed

### BREAKING CHANGES

- Backups are version 3: `{ version: 3, exportedAt, limitGroups, cards, purchases, payments,
  statementDates, lists, locations }`, with card payments in `payments` and each group's
  `color`. Download and copy write only version 3, so a build from before the redesign can't
  restore a new file; keep an old download if you may need to go back. A version 2 file still
  restores, converted on the way in (payments with their `parts` become card payments, its
  `settings` give the locations); version 1 and any other version are rejected.
- Restore is stricter. A file is refused, naming the record and the problem, when an amount or
  limit is not above zero, `last4` is not four digits, a cycle day is out of range, a status or
  `takesPurchases` is not one of its values, or (version 3) a card names a location the file
  does not hold. Nothing is written when any record is bad.
- Stored data migrates once at startup, and the old records stay on disk unread:
  - Per-statement `cc:payment:` records become card payments (`cc:cardpayment:<cardId>:<id>`,
    ids `m:<cardId>:<period>:<index>`), marked done by `cc:migration:payments`. Every
    statement keeps its left amount; an old overpayment is capped at the statement's total,
    so a statement that showed 1,500 paid on 1,000 now shows 1,000 paid. If the step fails
    the page shows an error with _Reload_ instead of numbers, and the reload retries.
  - Purchase places become location records (`cc:location:<id>`), seeded once from
    `settings.purchaseLocations` and marked by `cc:migration:location-records`. The app no
    longer writes `cc:settings`, and a card at a location with no record is moved, with a
    one-time notice.
  - Every limit group gets a stored colour (`cc:migration:group-colors`): the first four in
    stored order keep the colour they showed, the rest get a random unused one.
  - `cc:batch-start` and the `cc:panel:` keys `cards`, `cards-archived` and `limit-groups` are
    no longer read; the Cards page's archived fold uses `cc:panel:cards-archive`.
- Payments belong to a card, not a statement. Money settles the oldest statement first and any
  extra stays as credit, so an overpaid card now shows credit and more room than its limit.
  _Mark paid_ and per-part _Unmark_ are gone from the card page; pay from `/pay`, and delete a
  wrong payment from Transactions.
- A statement keeps its close and due dates only once it is fully paid. One that still owes
  money, part paid included, follows the card's current cycle, so its dates can move after a
  cycle edit; dates stored earlier for such a statement are ignored.
- Storage now refuses to delete a card that has purchases or is on a draft or waiting list, a
  limit group a card uses, or a location a card is kept at (`guard.cardOnList`,
  `guard.locationInUse`), not just the interface hiding the buttons.
- Retired pages and addresses, with no redirects (question 15):
  - the dashboard at `/` is Home; the registry at `/cards` is the Cards page
  - the `/cards` query keys `edit`, `group` as a filter, `dir`, `gq`, `gowner`, `gsort` and
    `gdir`, and the `/cards?edit=<id>` deep link, are no longer read; a card is edited at
    `/card/edit?id=<id>`
  - `/backup` still redirects to `/settings`
- Removed from the interface: the page footer (now Settings › About), the dashboard's purchase
  form, _This sitting_ and _Start new batch_, _Can spend now_, the dashboard's _Due next_ and
  _Purchases by date_ (now in Transactions), the card page's Add purchase dialog
  (`cc-quick-add`), the registry's card and group tables and dialogs, the payment dialog
  (`cc-payment-form`), and Settings' _Purchases_ section and side-by-side backup boxes.
- 148 message keys are gone, among them every `footer.`, `dashboard.`, `due.`, `range.`,
  `sitting.` and `payment.` key, with the components that used them (`cc-site-footer`,
  `cc-due-list`, `cc-purchase-range`, `cc-sitting-list`, `cc-spendable`, `cc-card-table`,
  `cc-limit-group-table`, `cc-limit-group-form`, `cc-statement-list`, `cc-card-summary`,
  `cc-settings`).
- Things to re-learn:
  - Purchases are planned as lists: pick cards with _+ New › New purchase list_, enter amounts,
    send the list, then record the spender's reply. A single purchase is added from the card
    page's _Add purchase_.
  - Tapping a row in _Needs you_, _Upcoming_, the ledger or _Lists_ opens it in place instead
    of going to another page; the page it led to is a button inside (_Open card_, _Open list_,
    _Pay_, _Record reply_).
  - Places that take purchases are ticked per location at Settings › Locations.
  - Archive and Delete for a card are in the card page's More menu (`⋯`), not the edit form.
  - Restoring opens a sheet that reads the clipboard first.
  - A ledger row no longer says _Purchase_ or _Payment_: the sign (− or +) says it, backed by
    red or green.

### Features

- Four pages, Home, Transactions, Cards and Settings: a bottom bar on a phone, tabs on the right
  of the header from 900px, and a floating _+ New_ menu with _New purchase list_ and _Make a
  payment_ on every page but the list, form and payment pages. Sub-pages share a slim
  sub-header with a back arrow.
- Purchase lists: the new-list picker `/list/new` (search, _Kept in_ and _Account holder_
  filters, three sorts), entering amounts with a note per line, a review table copied as plain
  lines or saved as an image for the chat, _Mark sent_, and the spender's reply (_Made_ or _Not
  made_ with the real amount), which saves the purchases and can move not-made lines to the next
  day's draft. Each state has its own page: `/list/new`, `/list/draft`, `/list/reply`,
  `/list/view`. A waiting list holds its amounts against its group's room.
- Warnings while entering amounts, none blocking: over the room (with _Lower to_, and room a
  waiting list holds or a planned payment would make), a shared limit, an overdue bill, the
  close date, and a date that has passed (with _Change to today_).
- Home: _Needs you_, money at risk first (overdue bills, late plans, waiting lists, plans in the
  next three days, drafts), beside _Ready to use_ from 900px, which shows the four cards with
  the most room and opens the rest in place.
- Payments on any day at `/pay`: a card picker, most pressing first, then a sheet with _Next
  bill_ and _Everything owed_, the date, an optional note, and a button that names the amount
  and card. A later date makes a planned payment, which counts only once marked _Paid_.
- Transactions: one ledger of purchases (−) and payments (+) by day, a month summary,
  _Upcoming_ (waiting lists with a two-step _Confirm_, planned payments with _Paid_ and
  _Delete_), search, filters as removable chips, four sorts, 50 rows at a time, a _Lists_ view
  and _Owed on each card_, the view kept in the address.
- Rows that open in place in _Needs you_, _Upcoming_, the ledger and _Lists_: one open at a
  time, with a sentence and the actions there, and a billing cycle line that shows where a
  purchase or bill sits between its start, close and due dates, and today. Home gains _Paid_,
  _Delete_ and _Confirm_.
- Cards page: by place or one flat list, search, a filter sheet (place, holder, _Not in a
  group_, sort), archived cards folded at the end, and limit group panels (a _Cards · Limit
  groups_ switch on a phone) whose sheet adds and edits a group at `?group=<id>` or
  `?newGroup=1`.
- One wallet tile for every list of cards (_Ready to use_, the new-list picker, Cards, the
  payment picker and _Owed on each card_), in its limit group's colour, with a rail for the
  group's used share: grey, amber from 80%, red past the limit.
- Each limit group keeps one of twelve colours, chosen in the group sheet from swatches or with
  _Random_; tiles, chips, the card hero and the group panels wear it.
- The card page: room, owed, next bill and credit up front, _Use on a list_, _Add purchase_
  and _Make a payment_, and statements that unfold to their purchases (with _Edit_ and a
  two-step _Delete_) and the payment parts that settled them. Cards are added and edited on a
  full screen, `/card/new` and `/card/edit?id=`, in four sections.
- Locations at `/settings/locations`: add, rename, delete one no card uses (never the last),
  and tick _Takes purchases_. Default names show in the reader's language, and every list of
  places sorts A to Z.
- Settings › Reset › _Delete old purchases_: older than 6 months, 1 year, 3 years or all, with a
  count, a line for what stays and a second ask. Only purchases on fully paid statements go,
  with the payments that settled them, so no owed, credit or room figure moves.
- Settings › About lists the environment, build time, source and commit. Builds other than
  production tint the header and bar, mark the brand and tab title (`(dev)`, `(local)`,
  `(pr-<n>)`, `(preview)`), and set the tint before the first paint.
- No page goes into a search index. Every page carries
  `<meta name="robots" content="noindex, nofollow">`, and `public/_headers` sends
  `X-Robots-Tag: noindex, nofollow` on every response, scripts and favicon included (DD-169).

### Improvements

- A calm new look: sage neutrals, a green accent, rounded panels and generous spacing in both
  themes, with amber and rose for warnings, always with words. Light-theme text colours were
  darkened where the prototype's fell short of AA contrast.
- One rule for naming a card (_panel_, _line_ and _name_ forms from `card-label.ts`), and cards
  titled `name · holder (last4)` on their own page and edit form.
- Every repeated list is a row list (one panel, a line between rows) or a card list (a panel
  per item), each drawn from one shared style (UI-22).
- Negative amounts read with the minus sign, `−฿21,065.00`, as signed amounts do.
- Sheets and the _+ New_ menu animate out as well as in, and not at all under reduced motion.
- Keyboard: when an action takes an open row away, focus moves to the next row, the previous
  one, or the nearest heading; the group sheet's holder and colour choices are radio groups
  with arrow keys.

### Bug fixes

- A page no longer flashes the wrong theme on load: the saved theme is applied before the first
  paint.
- A part-paid statement no longer keeps due dates from an old cycle: Kbank Passion's October
  statement read _due 04 Nov_ after its cycle changed to due 15 days after the 25th (09 Nov).

### Decisions

- Built in six phases on stacked pull requests (#29 to #34), squashed into one branch, then a
  refinement round (#35), and merged to main once, so production only sees the finished app.
- Payments convert once, marked by `cc:migration:payments` with ids that repeat on a rerun, and
  a converted payment pays its own statement first, overpayments capped. Every old statement
  keeps the left amount it showed. Rejected: feeding old payments into the oldest-first pool,
  turning old overpayments into credit, and deciding "already converted" by whether any card
  payment exists.
- A failed payment conversion stops the page with a reload button, since numbers from half
  converted data would be wrong. The group colour step only logs a failure, because a colour is
  cosmetic.
- Backup moved to version 3, and download and restore switched with the startup conversion,
  because the old export wrote `cc:payment:` records that never convert once the marker is set.
  Rejected: staying at version 2 with optional fields.
- A Merge of a version 3 file is purely additive and keeps local location records, so an old
  backup can't undo a rename or a _Takes purchases_ tick. Rejected: saying in the help that
  Merge can delete; overwriting locations as other records are.
- Location records are seeded once behind a marker, and become the one truth for where purchases
  happen. Rejected: keeping `settings.purchaseLocations` beside them; seeding whenever none is
  stored. A card at an unknown place is repaired rather than the data refused, and the last
  location can't be deleted, since a card always needs one.
- `/pay` is a page with the payment sheet over it, and every way to pay is a link to it.
  Rejected: the form inline on the page; one sheet mounted on every page and opened by an event.
- Each list state has its own address, so a link says what it opens. Rejected: one `/list` page
  choosing by status; a page per step.
- The copied list is plain lines and the image a table always drawn on white, because a chat
  breaks any text table and other people see paper, not this reader's dark mode. Rejected:
  tab-separated text; a `|` table; an image that follows the theme.
- Delete draft and Cancel list act at once, since both only remove a list nothing was bought
  from (the user's call). A payment's _Delete_ and a list's _Confirm_ stay two-step everywhere
  they appear.
- Statement dates freeze when a statement is fully paid, not at the first payment: settled
  history must not move, but a statement that still owes money is not settled. Rejected:
  rewriting kept dates on a cycle edit; letting the user edit one statement's dates. Old
  records are ignored rather than migrated.
- One wallet tile for every list of cards, its colour the group it draws on and never its
  health. Rejected: a row design per page; a taller wallet card; a card link inside a tickable
  row.
- Group colours come from a fixed palette of twelve, stored on the group, so text stays readable
  in both themes and adding or deleting a group never recolours another. Rejected: a colour
  from the group's place in the order; a free colour picker; a colour per card.
- A tapped row opens in place, its head one button with nothing inside, and one row opens at a
  time. Rejected: a row that both navigates and toggles; many rows open; the open row in the
  address.
- The opened row shows a billing cycle line and one sentence (option B of three mockups), since
  where the money sits in the cycle is what only this app knows. Rejected: label and value pairs
  in a well; one line of facts with text actions.
- A purchase can again be added without a list, only from the card page, after the user found
  some purchases are recorded that way. Rejected: a purchase form on Transactions; a separate
  `/purchase` page (built, then removed).
- Old addresses don't redirect (question 15), and the Cards address is new, replaced rather than
  pushed so typing doesn't fill Back. Rejected: keeping the old keys working.
- Restore is a sheet, clipboard first: three clicks with data, two on an empty browser, down
  from four or five. Rejected: the side-by-side boxes; a paste box always open.
- No `robots.txt`. A crawler barred by `Disallow: /` never reads a page's `noindex`, so it
  could still list a bare address linked from elsewhere; the meta and the header let it read
  the page and leave it out. The `pr-*` previews show Cloudflare's own `noindex` header in
  place of ours, so the header is checked with `wrangler dev` (DD-169).

## 2026-10-30: Redesign decided from a clickable prototype

### BREAKING CHANGES

- These are decided for the build, not built yet. When they ship:
  - backups move to version 3, and a version 2 backup still restores, converted on the way
    in
  - payment records move from statements to cards, keeping every total
  - old page addresses and `/cards` links stop working, with no redirects
  - the page footer goes, replaced by About in Settings

### Features

- `PRD.md` and `PRD_TH.md` record how the app is really used, as the user corrected it.
  Purchases are planned as dated lists that the spender confirms. Payments are made on any
  day, often to make room. The documents also say how often each task happens.
- The PRD adds decided changes RD-08 to RD-21, each naming the rows it overrides:
  - four pages (Home, Transactions, Cards, Settings), with a + in the phone's bottom bar
    that opens the payment form
  - purchase lists: pick cards on Home, enter amounts, send a dated table, record the
    spender's reply, then save
  - warnings while entering amounts, none of which blocks the list
  - payments that belong to a card, settle the oldest statement first, and turn any extra
    into credit
  - planned payments, and one Transactions ledger of purchases (−) and payments (+)
  - a payment form that asks for the card first
  - a Home that shows what needs you, then the cards ready to use
  - a Cards page with search, filters and sorting
  - locations you can add, rename and delete
  - deleting old purchases
  - a Settings layout with an About section
  - non-production builds tinted, badged and marked in the tab title
  - a calm look for ten-minute visits
- Decisions DD-39 to DD-46, a new goal G8, new risks, glossary terms in both languages, and a
  link to the prototype.

### Improvements

- Every open question is answered. Question 3 (pages) settles on the four pages above. The
  new questions 12 to 18 cover:
  - the footer, which goes
  - a purchase outside a list, which isn't needed
  - the backup version, which moves to 3
  - old links, which don't need to keep working
  - credit, which the card's next purchases use up
  - the ages for deleting old purchases: 6 months, 1 year, 3 years or all
  - the Thai words, kept as written

### Decisions

- Purchase lists replace receipt entry (RD-09 replaces RD-01 and RD-02). Buying starts with
  choosing cards and amounts, not with receipts after the fact.
- Going over a card's room offers one action, _Lower to_ the room. _Pay first_ and moving the
  extra onto another card were tried in the prototype and dropped as too complicated.
- Transactions is one ledger rather than separate list and payment tabs. The + opens the
  payment form, so a separate _+ Plan_ button was dropped.
- Deleting old purchases removes only what is fully paid, with its payments and lists, so no
  card's balance moves.
- Locations become editable, which reverses DD-11 and an out-of-scope item. They need a stored
  list and a migration.

## 2026-10-30: Product requirements for the refactor and redesign

### Features

- `PRD.md` is the full context to read before refactoring or redesigning the site. It covers:
  - business and functional requirements, and user stories with acceptance criteria
  - the domain rules, data contracts and interface rules a rewrite must keep
  - every decision so far with its reason and what was rejected
  - what is out of scope, today's design (free to change) and what was retired
  - the decided changes for the redesign (RD-01 to RD-07), acceptance criteria, risks, open
    questions and a glossary
- `PRD_TH.md` is the Thai translation, with the same IDs in the same order.
- `AGENTS.md` tells agents to read `PRD.md` before changing behaviour, and to update both
  files together when a change ships.

### Improvements

- The README matches the app again. It describes:
  - purchase places in Settings, rather than a checkbox on each card
  - editing purchases in place
  - saving and restoring a copy with Merge or Replace, and Reset
  - partial payments
  - language and theme in Settings
  - adding and editing in dialogs on the registry
  - the storage keys

  It links the PRD.

### Decisions

- A PRD rather than a plain feature list. The PRD carries the redesign's problem, goals and
  open questions. It also keeps the rules, contracts and decisions, because a feature list
  would let a rewrite quietly change the numbers or break saved data and backups.
- IDs are stable. New items go at the end of their list, and a replaced item is marked, not
  deleted, so links from other documents and pull requests keep pointing at the right thing.
- Decided with the user for the redesign:
  - entering receipts gets its own screen
  - a recent entries list, newest added first, replaces _This sitting_
  - a new visual direction on the same stack (Bun, TypeScript, Lit)
  - no theme flash on load
  - restore checks ranges
  - delete guards move into storage
- The page structure is left to clickable mockups of three layouts: task tabs, a hub with
  sheets, and card-centric.
- Facts that design specs from September held, and the changelog dropped, were recovered from
  the specs removed in `ec4a13f` and checked against the code before they went in.

## 2026-10-28: Browser storage usage planned, and partial payments

### Features

- A statement can be paid in parts. _Mark paid_, on the card page and in the dashboard's due
  list, opens a dialog for the amount and the date paid, starting at what is left and today,
  so paying in full is still one click.
- `StatementPayment` gains an optional `parts` list of `{ paidAt, amount }`, oldest first, and
  `Statement` gains `paidAmount` and `remaining`. A statement counts as paid once its parts add
  up to its total.
- On the card page each payment is a row in the statement's table, under its purchases and in
  the same columns, shown as an amount off the total with its own _Unmark_. A _Left to pay_ row
  closes the table, and what is left sits under the month's total on its summary line.
- Backup import checks `parts`: a non-empty list of valid dates and positive whole-satang
  amounts.

### Improvements

- The due list's _Total_ column, its sort, the card page's _Next due_ tile, _Owed on this card_
  and limit-group usage all count only what is left on a partly paid statement, so each payment
  returns its own share of the credit.
- The Thai label for _Unmark_ is now ยกเลิกชำระ.
- `TODO.md` plans a settings-page bar showing how much of the browser's `localStorage` (about
  5 MB per site) the app's `cc:` data uses, split by cards, purchases, payments, limit groups
  and settings, so a full store shows up before a save fails.

### Decisions

- Parts live inside the one payment record per card and period, under the same
  `cc:payment:<card>:<period>` key, rather than as separate records with their own ids. That
  keeps the storage layout and the backup's `payments` list unchanged, and a record saved
  before parts existed reads as one payment of the whole total on its `paidAt`, so no
  migration is needed.
- The first payment freezes the statement's close and due dates; later payments keep them.

## 2026-10-27: Friendlier look and limit usage bars, and language and theme in Settings

### BREAKING CHANGES

- The language picker is no longer in the page header; change the language from the new
  _Display_ panel on the settings page. The `cc-lang-switch` element is removed.
- A reader who never picked a language and whose browser lists Thai before English now gets
  Thai rather than English. Pick English on the settings page to keep it.

### Features

- _Can spend now_ shows a bar under each card's available amount, with "N% of the limit used"
  in words beside it. The bar tints amber from 80% and red once the group is over its limit.
- `--cc-radius-pill`, `--cc-accent-surface` and `--cc-panel-padding` tokens.
- A _Display_ panel at the top of the settings page holds the language picker and a new theme
  picker: Match device, Light or Dark. The theme is saved in this browser under `cc:theme` and
  stamped on `<html data-theme>` on every page.

### Improvements

- Warm paper neutrals and a teal accent replace the cool grey and blue, in light and dark.
  Corners and shadows are softer, and panels get more room from 640px wide.
- The header has a small accent mark before the brand, and the nav links are pill tabs with
  the current page filled.

### Bug fixes

- _Purchases by date_'s tiles wrap on a phone instead of clipping a six-figure total.
- With no saved language, the app follows the first of the browser's languages it speaks, in
  the browser's own order, and falls back to Thai. Before, any English entry in the list won.

### Decisions

- Language and theme stay in this browser's local storage, not the repository, so they apply
  before any data loads and are not carried in a backup.
- `tokens.css` writes the dark palette twice, for a dark device and for an explicit Dark pick,
  because CSS cannot share one block between a media query and a selector. A test fails if the
  two copies drift apart.
- The theme is applied from the page script rather than an inline `<head>` script, so a saved
  theme that differs from the device can flash briefly on load; accepted for now.

- Teal, because it stays clearly apart from the danger red and warning amber that sit beside
  it in the due list and the usage bars.
- The bar measures everything still unpaid against the limit, the figure _Can spend now_
  already uses, so it says "of the limit used" rather than "used this cycle".
- The flows were left alone: redesigning them needs the reader's own walk-throughs, so they
  stay in `TODO.md`.

## 2026-10-27: Dashboard as a workspace for entering receipts

### BREAKING CHANGES

- The dashboard has no Add a purchase button or dialog any more; the purchase form is always
  open in its left column. The card page keeps its dialog.

### Features

- The dashboard's purchase form is always open. After each add it keeps the card and date and
  clears amount and note, ready for the next receipt from the same card or day.
- _This sitting_ lists the purchases entered since _Start new batch_ was last pressed, latest
  first, with how long ago each was entered, the card (id then name, as other panels name it),
  the purchase date and the amount. It survives reloads, closing the tab and the next day, and
  is read-only. _Start new batch_ asks for a second click before it clears the list.
- _Purchases by date_ counts purchases, their total and the cards used across every card for
  Today, This week (Monday to Sunday), This month, Last month or a custom range of purchase
  dates, with a card filter. Archived cards count and are tagged. The list stays folded until
  opened, grouped by day, each card linked to its page.
- Purchases record `addedAt`, when they were first entered, from the dashboard and the card
  page; an edit keeps the original. Backup import accepts it and rejects a malformed one with
  `backup.problem.badAddedAt`.
- `Repository.getBatchStart` and `saveBatchStart`, stored under `cc:batch-start`; `clearAll`
  forgets it. New `purchase-range.ts` helpers, `cc-sitting-list`, `cc-purchase-range`, and an
  `inline` mode with a `cleared` counter on `cc-quick-add`.
- `TODO.md` records the deferred UX/UI and colour redesign.

### Improvements

- On desktop the dashboard is two columns: the form and _This sitting_ on the narrower left,
  _Purchases by date_, _Due next_ and _Spendable_ on the right. On a phone they stack in that
  order.
- A failed add shows its error beside the form, with the typing left in place to retry.
- The dashboard re-reads the clock each minute, so a tab left open past midnight moves its
  default date and presets to the new day, without touching a date the reader picked.

### Decisions

- Built for one person working through a pile of receipts who gets distracted mid-pile: the
  sitting list is how they find their place, so it must outlive reloads and only clears on
  purpose.
- The range filters on the purchase date, not the entry time: it answers "what was bought
  then", and archiving a card later must not change that answer.
- Purchases saved before entry times existed are not backfilled and never appear in _This
  sitting_; guessing an entry time would put them in the wrong batch.
- The batch start is working state for one browser, not a record, so it stays out of backups.
- A friendlier visual redesign, including a "used this cycle" bar in _Spendable_, was mocked
  up and deliberately deferred to `TODO.md`.

## 2026-10-17: Clearer names for card and limit group owners

### Improvements

- The person on a card -- the card list's filter and row, and the card page -- is labelled
  `หน้าบัตร` in Thai and "Cardholder" in English, instead of `เจ้าของ` and "Owner".
- A limit group's owner -- the limit group table's column and the limit group form's field --
  is labelled `เจ้าของบัตร` in Thai and "Account holder" in English, and its missing-owner
  error reads "Choose the account holder for this limit group."

### Decisions

- English uses "Cardholder" for the card, because it names whoever is printed on the card
  face, and "Account holder" for the group, because a limit group stands for a bank account.
  Both used to read "Owner", which didn't tell them apart.

## 2026-10-12: Dependency bump, and editing purchases with close-date and future-date warnings

### BREAKING CHANGES

- The purchase form no longer refuses a date after today; it saves the purchase and warns.
  The message key `quickAdd.error.futureDate` is removed.

### Features

- Each purchase on the card page's statement list has an `Edit` button. It opens the purchase
  dialog, titled "Edit purchase", with the date, amount and note filled in; the card stays
  fixed, and saving writes over the same purchase id. Archived cards' purchases can be edited
  too, since that corrects history rather than adding to it.
- The purchase form warns, in amber, when the date is the selected card's statement close
  date: the bank may post such a purchase on this statement or the next one. The warning
  follows the date and card as they change and never blocks the save.
- The purchase form warns, in amber, when the date is in the future, and saves it anyway.
- The card page marks the current statement -- the earliest one not yet closed, where a
  purchase made today lands -- with a `Current` badge and an accent left rule.
- `isCloseDate` in `cycle.ts`; `cc-quick-add` takes a `purchase` to edit and adds its `id` to
  the `add` event; `cc-statement-list` emits `edit-purchase`.
- Messages added: `dashboard.editPurchase`, `quickAdd.save`, `quickAdd.closeDateWarning`,
  `quickAdd.futureDateWarning`, `card.error.editPurchase`, `statements.current`.

### Improvements

- Dependencies are up to date: `@kcstyles/reset.css` 2.0.0, `@kcconfigs/biome` 3.0.0,
  `@kcconfigs/tsconfig` 2.0.0 and `@happy-dom/global-registrator` 21.0.1 move a major version;
  `@kctools/bun-server` 0.4.0, `typescript-language-server` 6.0.2 and `wrangler` 4.149.0 are
  minor or patch bumps. No code changes were needed, and the existing tests pass unchanged.
- The card page counts its statements back from the latest purchase when one is dated past
  today, so a purchase dated beyond the open period still has a statement to edit or delete
  it from.
- Statement table rows are centred vertically, with `Edit` and `Delete` held together in one
  row, so the date, note and amount line up with the buttons.

### Decisions

- Both date checks warn rather than refuse. A purchase on the close date is valid, only its
  statement is uncertain; a future date can be a booking or an instalment entered ahead.
- An edited purchase shows no "over the limit" note: the remaining credit already counts its
  old amount, so weighing the new amount against it would count the purchase twice.

## 2026-10-04: Backup save and restore, with clipboard and merge-or-replace, sortable dashboard panels, a preview marker, a primary Merge button, and compact copied text

### Features

- The backup can be copied as text: `Copy text` writes the backup's JSON to the clipboard,
  compact rather than indented like the downloaded file so it takes less space, and confirms
  in its own status line.
- A backup can be restored from pasted text: `Paste text…` opens a text area with `Restore`,
  `Paste from clipboard` and `Cancel`.
- Restoring into a browser that already holds cards, purchases, payments or limit groups now
  asks first. It shows what is in this browser next to what is in the copy, then offers
  `Merge` (the old additive import) or `Replace` (delete everything, settings too, then
  restore). An empty browser restores straight away.
- `countRecords` and `replaceWithBackup` in `transfer.ts`; the reset question reuses
  `countRecords`.
- Messages added: `backup.save.title`, `backup.save.hint`, `backup.restore.title`,
  `backup.restore.hint`, `backup.copy`, `backup.copied`, `backup.paste`, `backup.pasteLabel`,
  `backup.fromClipboard`, `backup.importText`, `backup.question.file`,
  `backup.question.pasted`, `backup.here`, `backup.incoming`, `backup.counts`,
  `backup.merge`, `backup.mergeHint`, `backup.replace`, `backup.replaceHint`,
  `backup.importedText`, `backup.error.clipboard`, `backup.error.copy`.
- The dashboard's _Can spend now_ and _Due next_ panels sort from their column headings, and
  from a sort chip on the narrow layout, the same way the cards page does. _Can spend now_
  sorts by card, available, closes or due; _Due next_ by card, where, closes, due or total.
- `applySpendView`, `applyDueView` and `nextPanelSort` in `list-view.ts`; `sortChip` takes an
  optional fallback view and `sortHeader` an optional next-sort function.
- A preview deploy suffixes the page title and the header brand with `(pr-<n>)`, so it can't
  be mistaken for production. The deploy preview workflow passes the number as
  `BUN_PUBLIC_PR_NUMBER`; production shows no suffix.

### Improvements

- The Backup panel is split into two outlined halves, _Save a copy_ (`Download file`,
  `Copy text`) and _Restore a copy_ (`Choose file…`, `Paste text…`), side by side from
  640px and stacked on a phone. Restore runs one step at a time inside its own half, and
  cancelling a pasted restore returns to the text so it can be fixed.
- One verb, _restore_, runs from the button to the confirmation ("Restored …") and the error
  ("Could not restore that copy."). `backup.unreadable` no longer says "file".
- The file picker is styled as a quiet button instead of the browser's default control.
- `Merge` in the restore question is the filled primary button. As a quiet button its
  sunken grey matched the counts panel above it, so it read as a panel, not a button.
- Upgraded `@kcstyles/reset.css` 1.0.13, `@kctools/bun-server` 0.3.4, `@biomejs/biome`
  2.5.15, `typescript-language-server` 6.0.1 and `wrangler` 4.147.0.
- Both dashboard panels start soonest close date first. Before, _Can spend now_ listed the
  most room first and _Due next_ the soonest due date.

### Bug fixes

- The pasted-backup text area's monospace size now applies; `.backup__text` had lost to
  `.page textarea` on specificity.

### Decisions

- Merge or Replace is asked only when records exist. Settings alone don't count, so a fresh
  browser never sees the question.
- Each answer is a full button that states its consequence, and Replace uses the danger
  variant, so nobody wipes their data without reading what the button does.
- Copy and paste-from-clipboard buttons are hidden where `navigator.clipboard` lacks
  `writeText` or `readText`, rather than shown and failing.
- Importing straight from another deploy's origin (a preview pulling from production) was
  left out. Storage is per origin, and an iframe gets partitioned storage, so it would need a
  confirmed popup-and-`postMessage` bridge on production; copy and paste covers it for now.
- The dashboard panels have no saved order, so a third click on a heading returns to closes first
  instead of to "Saved order", and their sort chip has no "Saved order" option.
- The dashboard panel sort is kept on the component only and resets on reload, not written to the
  query string like the cards page's view.
- `BUN_PUBLIC_PR_NUMBER` is always stamped at build time, empty outside previews. The bundler
  only inlines variables that exist, and an unset one would stay a `process.env` read that
  throws in the browser and blanks the footer's commit and build time.
- The `(pr-<n>)` marker is not translated; it reads the same in English and Thai.

## 2026-09-30: Changelog link in the site footer

### Features

- `cc-site-footer` links `CHANGELOG.md` on the `main` branch, between the repository and the
  commit. The link targets `main` rather than the built commit, so an old deploy still points
  readers at the latest entries.
- Messages added: `footer.changelog`.

### Improvements

- The footer's repository and changelog links open in a new tab.

## 2026-09-24: Limit group owner, and a split, collapsible `/cards` page

### BREAKING CHANGES

- `Card.owner` is gone; the owner now lives on `LimitGroup`. Code that read a card's owner
  must go through its group. Two cards on one account can no longer name different owners.
- `ownerOf` now takes a `LimitGroup` instead of a `Card`.
- `cc-limit-groups` no longer exists. Use `cc-limit-group-form` and `cc-limit-group-table`,
  and listen for `edit-group`. Inline row editing was removed.
- `cc-card-form` no longer has an owner select.
- Messages removed: `form.owner`, `form.error.owner`.

### Features

- `LimitGroup` has an `owner?: Owner` field. The owner belongs to the account behind a card,
  and a limit group models that account. `ownerOf` still falls back to `KC` when the owner
  is missing or not recognised.
- Messages added: `limits.owner`, `limits.column.owner`, `limits.error.owner`,
  `limits.edit`, `cards.list`.

### Improvements

- Limit groups are managed by `cc-limit-group-form` and `cc-limit-group-table`, matching the
  card form and table. Edit dispatches `edit-group`, and the route keeps `editingGroup` next
  to `editing`, so the page has one editing pattern.
- The card table keeps its Owner column, which now reads the owner from the card's group.
  A card with no group shows `cards.unassigned` rather than an invented `KC`.
- All four sections on `/cards` (card form, card table, limit group form, limit group
  table) collapse. Each component owns a `<details>`, and its title moved into the
  `<summary>`. Tables start open through a static attribute, so a re-render never reopens
  a section the reader closed. Forms start closed, open when an edit target arrives, and
  follow their own `toggle` event.

### Decisions

- A group without an owner reads as `KC`, so no migration is needed. Existing groups show
  `KC` until someone edits them. Copying each card's owner up to its group was rejected
  because it would need a rule for cards that disagree.
- `Card.owner` was removed from the type but not from stored records. Unread keys cost
  nothing, and rewriting every card to strip them risks write failures for no benefit.
- The backup version stays at 2. A missing group owner is accepted. An owner outside the
  closed set is rejected.

## 2026-09-23: Credit limits and shared limit groups

### BREAKING CHANGES

- Version 1 backups are rejected. Only backup format version 2 imports.
- Every card must belong to a limit group. Cards stored before this change have none and
  show as unassigned until someone assigns them by hand on `/cards`.

### Features

- `LimitGroup { id, name, limit }`, with `limit` stored in satang. It is saved under
  `cc:limitgroup:<id>` and handled by `listLimitGroups`, `saveLimitGroup` and
  `deleteLimitGroup`, which are covered by the storage contract suite.
- `Card.limitGroupId`. It is optional only so that cards stored before this change still
  load.
- `src/lib/domain/limit.ts` with `outstandingOf`, `spendableRows` and `unassignedCards`.
  Available credit is the group's limit minus every purchase on an unpaid statement,
  including the open period. Archived cards count toward `used` but are not listed.
- A **Can spend now** dashboard panel (`cc-spendable`). It lists each card's available
  credit out of its limit, plus the open period's close and due dates, sorted with the
  most room first. It marks shared groups ("shared with N cards") and flags over-limit
  rows with `data-state="over"`. It also shows how many cards have no group, and has an
  empty state.
- `cc-quick-add` shows "Available ฿X of ฿Y" for the selected card. A purchase over that
  amount still saves, and the confirmation says by how much it went over.
- A limit group section on `/cards`, a required group select on the card form, and a
  Limit group column on the card table.
- Backup format version 2 with a `limitGroups` list. Groups are imported before cards.

### Decisions

- **Every unpaid baht counts against the limit.** Counting only closed statements would
  show more room than the card really has. Because a payment records no amount, marking a
  statement paid gives back exactly that statement's total.
- **Every card belongs to exactly one group.** A card that shares with no other card is a
  group of one, so the calculation is always done per group.
- **Breaking change, no migration.** Version 1 backups are rejected. A card with no group
  is treated as unassigned until someone assigns it by hand.
- **Over-limit purchases are recorded, not blocked.** The app records what happened, and
  the stored limit may be out of date.
- Groups are managed on `/cards` rather than on a fourth route.
- A backup card whose `limitGroupId` matches no group in the file is still imported. Import
  only adds data, and the group may already exist in the browser.
- The close and due dates come from `openPeriod`, not from `nextActionable`. The panel
  answers "if I spend today, when is that due?", while the due list answers "what do I pay
  next?".

## 2026-09-22: Design system on reset.css and shadow DOM

### BREAKING CHANGES

- `@picocss/pico` was removed in favour of `@kcstyles/reset.css@1.0.12`. Anything that
  relied on Pico's classes or document styles no longer gets them.
- Button variants moved from classes to an attribute: `class="secondary"` became
  `data-variant="quiet"` and `class="secondary outline"` became `data-variant="danger"`.
  With no attribute, a button is the primary variant.
- Shadow CSS may use values only through `var(--cc-*)`. Literal hex, rem or colour values
  are not allowed.

### Features

- New `src/styles/tokens.css` for `:root` custom properties and dark mode,
  `src/styles/app.css` for the light-DOM page shell, and `src/styles/shared.ts` for the
  shared Lit modules `base`, `controls`, `panel` and `dataTable`. Custom properties are
  inherited across shadow boundaries, so each value is defined once and each rule is
  written for both the light DOM and shadow roots.
- Token groups: type, space, shape, surface, text, accent, status, urgency and focus.
  `--cc-font-sans` lists Thai faces as well as the system Latin fonts, and `--cc-leading`
  is `1.65` so Thai vowel and tone marks don't get clipped.
- The `base` shadow reset copies the reset's `div` convention (`div` is a column flex
  container, with `<div row>` and `<div block>` as the alternatives).

### Improvements

- Layout: a sticky header, and content up to `72rem` wide. At `≥960px` the dashboard has
  two columns, with the quick-add form sticky beside the due list. On narrower screens
  quick-add comes first. Tables turn into stacked rows below `640px` using `data-label`.
- The urgency border now comes with a text badge, so the urgency doesn't depend on colour
  alone.

### Bug fixes

- Six of the eight components had no styling, because Pico's document styles never reached
  inside shadow roots. Styles now come from `@kcstyles/reset.css` and shared shadow modules.

### Decisions

- Pushing one shared `CSSStyleSheet` into every shadow root was rejected, and so was
  rendering components into the light DOM.
- There is no `<cc-nav>` component and no web fonts. The nav element ids are unchanged, so
  `chrome.ts` still works.
- Appearance is checked with Playwright screenshots at `390px` and `1280px`, in English and
  Thai, in light and dark mode. happy-dom doesn't compute styles.

## 2026-09-21: Location choices, English and Thai, Cloudflare deployment

### BREAKING CHANGES

- Phase A: location is now a fixed set. Unrecognised stored values are reset to
  `bangkok` at startup, and backup import rejects a card with an unknown location.
- Phase A: the card form uses a `<select>` instead of a free-text datalist, so a new
  location can no longer be typed in.

### Features

- Phase A: `LOCATIONS = ["bangkok", "phichit", "krabi"]`, with
  `DEFAULT_LOCATION = "bangkok"` and `toLocation` in `src/lib/domain/location.ts`. The
  lowercase key is stored and the label is looked up by language.
- Phase A: `migrateLocations` runs once at startup. It resets unrecognised values to the
  default, records which cards were reset in `cc:migration:location`, and `/cards` shows a
  notice that can be dismissed. Running it twice changes nothing, and a failure on one card
  does not stop the page from loading.
- Phase B: English and Thai. A hand-written catalog in `src/lib/i18n/` (`en.ts`, which
  defines the keys, and `th.ts`, which must satisfy `Catalog`), a `LocaleController` for
  Lit, and a `cc-lang-switch` control. Switching language re-renders in place without
  reloading the page.
- Phase B: language choice uses the saved `cc:lang` value first, then English if
  `navigator.language` starts with `en`, otherwise Thai.
- Phase B: errors carry a `{ key, params }` pair, not an English sentence, and are
  translated where the banner is rendered.
- Phase B: dates are shown as `dd MMM yyyy` with Gregorian years in both languages
  (`21 ก.ย. 2026`), never Buddhist Era, so they match bank statements. The day is
  zero-padded. `Intl` is not used for dates.
- Phase C: Cloudflare Worker and KV. `wrangler.toml` binds `./dist` as `ASSETS`
  (`auto-trailing-slash`) and adds `CC_KV`. `worker/index.ts` handles `/api/*`, and
  `src/lib/storage/http.ts` implements `Repository` over that API.
- Phase C: `BUN_PUBLIC_CC_STORAGE=http` picks the HTTP repository at build time.
- Phase C: KV keys are the localStorage keys without the `cc:` prefix, with each part
  percent-encoded the same way. Deleting a card scans `purchase:<encoded id>:` with the
  trailing colon, so deleting a card doesn't also delete records for other cards whose id
  starts with the same text.
- Phase C: Cloudflare Access protects the whole Worker. There are `deploy` and `cf:dev`
  scripts.

### Decisions

- `@lit/localize` was rejected because it needs an extraction CLI and XLIFF files, which is
  a lot for two locales. Reloading the page on a language switch was rejected because it
  would throw away a half-filled form.

## 2026-09-15: Phase 1, local card tracking

### Features

- A registry of cards (id, name, last 4 digits, location, billing cycle rule, comment,
  archived), purchases (stored in satang), and payment records for statements.
- Statements are derived when read, not stored. A `StatementPayment` stores the close and
  due dates as they were when the statement was paid, so editing a cycle rule later doesn't
  change history that is already paid.
- Two cycle rules: `offset` (the due date is the close date plus N days) and `fixed` (the
  due date is a day of the month). With `fixed`, a due day that is not later than the close
  day falls in the next month. Days past the end of a month are clamped. A statement period
  is `(previousClose, thisClose]`.
- Dates are plain `YYYY-MM-DD` strings in Asia/Bangkok, calculated with `Date.UTC` and
  `getUTC*`. Local-time `Date` values are never used.
- A `Repository` interface made only of key lookups and prefix scans, with an in-memory
  version and a localStorage version (`cc:card:`, `cc:purchase:`, `cc:payment:`). One
  contract suite tests both.
- Three pages: the dashboard (due next, quick add, cards by location), `/cards` (the
  registry, with archive or delete), and `/card?id=` (statements with Mark paid and Unmark).
- JSON export and import of all data.
- Writes are awaited, never applied ahead of time, and a failure shows a banner with a
  retry.

### Decisions

- Storing a statement per card per month was rejected. It would need a generation job and
  would give two sources of truth.
- localStorage was chosen over IndexedDB. The data is small, and neither Bun nor happy-dom
  provides `indexedDB`.
- Phase 2 was designed as a Cloudflare Worker with KV behind Cloudflare Access. It was
  built on 2026-09-21. Phase 3, staff accounts, is deferred.
