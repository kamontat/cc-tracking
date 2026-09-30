# Changelog

This changelog is built from the design specs written for each stage of the project. Entries
are newest first. Each one says what changed and keeps the decisions behind it, because the
reasons don't show up in the code.

## 2026-09-30: Changelog link in the site footer

### Features

- `cc-site-footer` links `CHANGELOG.md` on the `main` branch, between the repository and the
  commit. The link targets `main` rather than the built commit, so an old deploy still points
  readers at the latest entries.
- Messages added: `footer.changelog`.

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
