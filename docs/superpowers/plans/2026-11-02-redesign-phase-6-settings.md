# Redesign phase 6: Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Settings in the redesign's look, make location records the truth (any location
per card, managed at `/settings/locations`), add deleting old purchases, make clipboard restore
short, and close the roadmap's phase 6 leftovers.

**Architecture:** Location records (`repo.listLocations()`) replace `settings.purchaseLocations`
everywhere; a once-only seed fills them from settings. `Card.location` becomes any record id.
Settings becomes a route-rendered page of `.set` row panels plus two sheets (`cc-restore-sheet`,
`cc-purge-sheet`) and a sub-page `/settings/locations`. A storage-side `applyPurge` runs the
existing `planPurge`.

**Tech Stack:** Bun, TypeScript, Lit 3, happy-dom tests (`bun test`), biome.

**Spec:** `docs/superpowers/specs/2026-11-02-redesign-phase-6-settings-design.md` (read it with
this plan). Prototype: `/Users/kamontat/Personal/cc-tracking/.playwright-mcp/cc-flows.html`
(`vSettings`, `vLocations`, `shPurge`, CSS `.set`, `.locrow`, `.setg`).

## Global Constraints

- Work in `/Users/kamontat/Personal/cc-tracking/.claude/worktrees/redesign-plan`, branch
  `redesign-phase-6`. Do not push; the controller pushes.
- Every task: test first and watch it fail, then `bun run format && bun run check && bun run
  typecheck && bun run test && bun run build` all pass before its commit.
- Shadow CSS references values only through `var(--cc-*)` from `src/styles/tokens.css`; no
  literal hex, rem, px, em or colour in component CSS (UI-01).
- Buttons: no attribute (primary), `data-variant="quiet"` or `data-variant="danger"`. No fourth.
- Never select on translated text; use classes or `data-*`.
- Every user-facing string goes in both `src/lib/i18n/en.ts` and `th.ts` (the coverage test
  enforces it). Thai wording: best effort; the user reviews it.
- Commits: conventional, lower case, scoped (`feat(settings): …`, `refactor(locations): …`),
  ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't touch
  `CHANGELOG.md`.
- In sentences and row titles on new screens, name a card by its name with `[id]` muted.
- Locations are always listed A to Z by shown name in the reader's language (user's answer).

## Review Focus

1. A Thai-only location name (no Latin letters): id falls back to `location`, `location-2`; it
   must add, rename, sort and show correctly. (Task 10 test.)
2. Pasting text that is not a backup, or an empty clipboard: the sheet shows the error and keeps
   the reader on the paste step with nothing written. (Task 8 test.)
3. Restoring a version 2 file without `settings` over a browser whose records were renamed or
   deleted: cards must end up on a stored location; no card left pointing at a missing id.
   (Task 5 test.)
4. Switching language while a sheet or an inline confirmation is open re-renders it in the new
   language without losing the step. (Tasks 8, 9 tests.)
5. Deleting old purchases when the plan is empty but older purchases exist (unpaid
   statements): button disabled, the "K older purchases stay" line shows. (Task 9 test.)

---

### Task 1: Seed location records once

**Files:**
- Create: `src/lib/storage/seed-locations.ts`, `src/lib/storage/seed-locations.test.ts`
- Modify: `src/lib/ui/page.ts` (bootstrap: seed before `migrateLocations`)

**Interfaces:**
- Produces: `SEED_KEY = "cc:migration:location-records"`;
  `seedLocations(repo: Repository, storage: Pick<Storage, "getItem" | "setItem">): Promise<void>`
  — when the marker is unset and `repo.listLocations()` is empty, saves
  `defaultLocations(await repo.getSettings())`; then sets the marker. Records already stored:
  only sets the marker.

- [ ] **Step 1: Write failing tests** in `seed-locations.test.ts` on `InMemoryRepository` and a
  fake storage: `seeds the three defaults with today's ticks` (settings
  `{purchaseLocations:["bangkok"]}` ⇒ records `bangkok` true, `phichit` false, `krabi` false);
  `seeds Krabi only on fresh storage` (no settings ⇒ only `krabi` true); `does not seed twice`
  (marker set, records deleted ⇒ still empty); `leaves stored records alone` (one stored record
  ⇒ unchanged, marker set); `seeds again after clearAll` (seed, `clearAll`, clear the fake
  storage's marker as `LocalRepository.clearAll` does, seed ⇒ three records).
- [ ] **Step 2:** `bun test src/lib/storage/seed-locations.test.ts` fails (module missing).
- [ ] **Step 3:** Implement. In `bootstrap`, call it inside the same try/catch as
  `migrateLocations`, before it (a failure logs and the page still renders).
- [ ] **Step 4:** Tests pass; add a `bootstrap` test in `src/lib/ui/page.test.ts`: a fresh
  memory repo has three location records once `render` is called.
- [ ] **Step 5:** Full check list, commit `feat(locations): seed location records once`.

### Task 2: Location names and order

**Files:**
- Modify: `src/lib/i18n/format.ts`, `src/lib/i18n/format.test.ts`

**Interfaces:**
- Consumes: `LocationRecord` (`#lib/domain/types`).
- Produces: `locationName(record: Pick<LocationRecord, "id" | "name">): string` — the catalog
  `location.<id>` text while `id` is `bangkok|phichit|krabi` and `name` equals its English
  default (`Bangkok`, `Phichit`, `Krabi`); else `name`.
  `sortLocations<T extends Pick<LocationRecord, "id" | "name">>(records: T[]): T[]` — a new
  array A to Z by `locationName`, `localeCompare` with `getLocale()`, then by id.
  `nameOfLocation(records: LocationRecord[], id: string): string` — `locationName` of the record
  with that id, or `id` when none.

- [ ] **Step 1: Failing tests:** `locationName` gives Thai catalog text for an untouched default
  in `th`, the stored name for a renamed default (`{id:"krabi",name:"Ao Nang"}` ⇒ `"Ao Nang"`)
  and for a custom record; `sortLocations` in `en` orders `Ayutthaya, Bangkok, Krabi, Phichit`;
  `nameOfLocation` falls back to the id.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(locations): location names in the reader's language`.

### Task 3: Records decide where purchases happen

**Files:**
- Modify: `src/lib/domain/card.ts`, `src/lib/domain/home.ts`, `src/lib/ui/money-data.ts`,
  `src/routes/index.ts`, `src/components/cc-ready-panel.ts`, `src/routes/list/picker-page.ts`,
  `src/components/cc-cards-list.ts`, `src/routes/cards.ts`, `src/routes/card.ts`, and every
  test that builds `MoneyData`/`RoomData` or calls these.
- Delete: `src/components/cc-settings.ts` and its test; `canPurchaseAt`, `withPurchaseAt` from
  `src/lib/domain/settings.ts` (keep `Settings`, `DEFAULT_SETTINGS`, `toSettings` for the seed
  and version 2 files) and the catalog keys only they used.

**Interfaces:**
- Consumes: `takesPurchases(records, id)` (`#lib/domain/locations`), `nameOfLocation` (Task 2).
- Produces: `canPurchase(card: Card, locations: LocationRecord[]): boolean`;
  `MoneyData.locations: LocationRecord[]` replaces `MoneyData.settings` (and `RoomData` where
  it carries settings); `isReady(card, groups, locations)`, `readyRows(data, …)` read
  `data.locations`. Components that showed the ticked places take
  `places: string[]` (shown names, already sorted) instead of `Location[]`.

- [ ] **Step 1: Failing tests:** `canPurchase` true for a card at a record with
  `takesPurchases: true`, false at one with false and at an unknown id; `readyRows` keeps a
  card kept at a custom record `{id:"chiang-mai",takesPurchases:true}`; `loadMoneyData` returns
  `locations` from the repo (sorted by `sortLocations`); Home's *Ready to use* empty text names
  places by `locationName`.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; `grep -rn purchaseLocations src` must show
  only `settings.ts`, `locations.ts` (`defaultLocations`), `seed-locations.ts`, `transfer-v3.ts`
  (version 2 parse) and their tests. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `refactor(locations): location records decide where purchases happen`.

### Task 4: `Card.location` takes any location id

**Files:**
- Modify: `src/lib/domain/types.ts` (`location: string`), `src/lib/domain/ready-filter.ts`,
  `src/lib/ui/ready-query.ts`, `src/lib/ui/cards-query.ts`, `src/lib/domain/cards-view.ts`,
  `src/routes/cards.ts`, `src/components/cc-cards-filter.ts`, `src/components/cc-ready-filter.ts`,
  `src/components/cc-card-form.ts`, `src/components/cc-card-hero.ts`, `src/routes/card.ts`,
  `src/components/cc-cards-list.ts`, `src/lib/storage/migrate-locations.ts`, tests beside each.
- `src/lib/i18n/format.ts`: remove `locationText` once unused.

**Interfaces:**
- Consumes: Task 2's helpers; `MoneyData.locations` (Task 3).
- Produces: `readyLocations(rows: ReadyRow[], records: LocationRecord[]): string[]` (ids, sorted
  by `sortLocations`); `ReadyFilter.locations: string[]`;
  `readReadyFilter(search, locationIds: readonly string[])` and
  `readCardsView(search: string, locationIds: readonly string[]): CardsView` keep only known ids;
  `cc-cards-filter` `.locations: LocationRecord[]`; `cc-card-form` takes
  `.locations: LocationRecord[]` and lists them all under *Kept in*;
  `migrateLocations(repo, storage)` checks each card against stored record ids: a missing
  `bangkok|phichit|krabi` gets its default record saved back (`takesPurchases: false`), any
  other unknown value moves the card to the first record of `sortLocations(records)` and is
  reported as today. `LOCATIONS`/`Location`/`toLocation` remain only for version 2 parsing,
  `defaultLocations` and the catalog.

- [ ] **Step 1: Failing tests:** a card at `chiang-mai` shows under its own section in the Cards
  `place` sort, in A to Z order; `readCardsView("?loc=chiang-mai", ["chiang-mai"])` keeps it and
  drops unknown ids; the card form's *Kept in* lists a custom record and saves its id; the card
  hero names the place by `locationName`; `migrateLocations` restores a deleted `bangkok` record
  for a card kept there, and moves a card at `"Somewhere"` to the first record.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass; `grep -rln "LOCATIONS" src`
  shows only `location.ts`, `locations.ts`, `settings.ts`, `transfer.ts`,
  `transfer-v3.ts` and tests.
- [ ] **Step 5:** Full check list, commit `feat(cards): keep a card at any location`.

### Task 5: Backup version 3 follows the records

**Files:**
- Modify: `src/lib/storage/transfer-v3.ts`, `src/lib/storage/transfer-v3.test.ts`

**Interfaces:**
- Produces: `BackupV3.converted?: true` — set by `parseAnyBackup` for a version 2 file, never
  written by `exportBackupV3`. `exportBackupV3` writes `repo.listLocations()` as stored.
  `importBackupV3(repo, backup)`: saves only file locations whose id is not stored (Merge keeps
  local renames and ticks); never touches settings; clears stale `m:<card>:<period>:` parts only
  when `backup.converted`. A version 3 file whose card names a location missing from its
  `locations` is refused with `MessageError("backup.card", …)` like other card problems
  (nothing written). After any import (merge or replace) the route runs
  `seedLocations` and `migrateLocations` (Task 1, 4) — wire that in Task 8.

- [ ] **Step 1: Failing tests:** export carries a renamed record's name and its own
  `takesPurchases`; Merge of a file with `{id:"krabi",name:"Krabi",takesPurchases:false}` over a
  stored `{id:"krabi",name:"Ao Nang",takesPurchases:true}` keeps the stored one; Merge adds a
  file-only location; Replace takes the file's; Merge of a v3 file with an `m:` payment keeps a
  local `m:<card>:<period>:1` part; a v2 file still clears it (DD-95 test kept); a v3 card at
  `"nowhere"` not in the file's locations is refused; settings unchanged after import.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; drop `storedOrDefaultLocations`.
  **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(backup): locations travel as records; merge keeps local ones`.

### Task 6: Apply a purge plan

**Files:**
- Create: `src/lib/storage/purge-run.ts`, `src/lib/storage/purge-run.test.ts`

**Interfaces:**
- Consumes: `planPurge`, `purgeCutoff`, `PurgeAge`, `PurgePlan` (`#lib/domain/purge`).
- Produces:
  `previewPurge(repo: Repository, age: PurgeAge, today: PlainDate): Promise<{ plan: PurgePlan; older: number; cutoff: PlainDate }>`
  — loads every card's purchases, card payments, statement dates and all lists, runs
  `planPurge`; `older` = purchases dated before the cutoff.
  `applyPurge(repo: Repository, plan: PurgePlan): Promise<void>` — deletes plan purchases (by
  card: look up each purchase's card from the loaded data or store `cardId` alongside; extend
  `PurgePlan.purchaseIds` to `{cardId, id}[]` if needed and update `purge.test.ts`), deletes
  `paymentIds`, saves `trimmed`, deletes `listIds`, deletes `frozenPeriods` statement dates.

- [ ] **Step 1: Failing tests** on `InMemoryRepository` with two cards (one fully paid old
  statement, one unpaid old statement): `previewPurge("1y")` counts only the paid card's old
  purchases and `older` counts both; after `applyPurge`, every card's `cardLedger(...).owed` and
  `.credit` equal before; the old saved list is gone; a draft list is kept; `"all"` with nothing
  paid leaves everything.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(reset): delete old purchases on paid statements`.

### Task 7: Settings page in the new look

**Files:**
- Modify: `src/routes/settings.ts`, `src/routes/settings.test.ts`, `src/routes/settings.html`
  (main class as other tab pages), `src/components/cc-display-settings.ts` (rows: *Language*
  segmented English/ไทย, *Theme* segmented Light/Dark/Device), `src/components/cc-about.ts`
  (rows in a `.set` panel), `src/styles/app.css` (`.settings-grid`, `.set`, `.set-row`),
  `src/styles/tokens.css` if a value is missing, en/th catalogs.

**Interfaces:**
- Consumes: `prepareBackupFile` (stays), `sortLocations`, `locationName` (Task 2),
  `seedLocations` (Task 1).
- Produces: route-level markup used by Tasks 8 and 9:
  `<section class="set-section" data-section="display|locations|backup|reset|about">` each
  with `h2` and `.set`; rows `.set-row` with `data-row="language|theme|locations|download|copy|restore|purge|delete-all"`.
  Locations row is `<a href="/settings/locations">` with subline
  `t("settings.locations.summary", {count, places})` / `t("settings.locations.none", {count})`.
  The page exposes `openSheet: "restore" | "purge" | null` state for Tasks 8, 9.

- [ ] **Step 1: Failing tests** in `settings.test.ts`: five sections in order display,
  locations, backup, reset, about, the first three inside `.settings-grid__main` and the last
  two inside `.settings-grid__side`; the locations row's subline reads "3 places · Krabi takes
  purchases" on a fresh repo; Download row subline shows `cc-tracking-YYYY-MM-DD.json`; Copy
  shows *Copied* after a click; *Delete all data* swaps to the warning with the card count,
  *Keep my data* swaps back, *Delete everything* clears and shows the done line, and afterwards
  `repo.listLocations()` has the three defaults again.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; desktop two columns at the same breakpoint
  the other pages use (check `app.css` for the Home grid), one column below. The old
  `.backup__*` and `.reset__*` CSS goes. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(settings): settings in the redesign's rows`.

### Task 8: Restore sheet

**Files:**
- Create: `src/components/cc-restore-sheet.ts`, `src/components/cc-restore-sheet.test.ts`
- Modify: `src/routes/settings.ts` (open from the Restore row; move parse/merge/replace logic
  out of the route into the sheet or a helper), catalogs.

**Interfaces:**
- Consumes: `parseAnyBackup`, `countRecordsV3`, `backupCounts`, `importBackupV3`,
  `replaceWithBackupV3` (`#lib/storage/transfer-v3`), `seedLocations`, `migrateLocations`,
  `cc-modal sheet`.
- Produces: `<cc-restore-sheet .repo=${repo} .storage=${localStorage}>`; emits
  `close`, and `restored` with `detail: { file?: string } & V3Counts`. Steps
  `"start" | "paste" | "question"`, held as state; `data-action` values `paste-clipboard`,
  `choose-file`, `paste-by-hand`, `import-text`, `merge-import`, `replace-import`, `cancel`.

- [ ] **Step 1: Failing tests:** with `navigator.clipboard.readText` stubbed to a valid backup
  and an empty repo, clicking `paste-clipboard` imports and emits `restored` (one click inside
  the sheet); with data in the repo it shows `question` with "Here" and "In the copy" counts,
  and `merge-import` writes and emits; `replace-import` replaces; readText rejecting shows the
  `paste` step with the refusal hint; no `readText` ⇒ opens on `paste` and has no
  `paste-clipboard`; invalid text shows the parse error and stays, nothing written; switching
  locale on `question` keeps the step; after a restore, cards on a missing location are fixed
  (`migrateLocations` ran).
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; the Backup panel shows the restored counts
  line after `restored`. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(backup): restore a copy from a sheet, clipboard first`.

### Task 9: Delete old purchases sheet

**Files:**
- Create: `src/components/cc-purge-sheet.ts`, `src/components/cc-purge-sheet.test.ts`
- Modify: `src/routes/settings.ts`, catalogs.

**Interfaces:**
- Consumes: `previewPurge`, `applyPurge` (Task 6), `sheetChip` (`#components/filter-sheet`,
  add `"age"` to `ChipKind`), `cc-modal sheet`.
- Produces: `<cc-purge-sheet .repo=${repo} .today=${today}>`; emits `close` and `purged` with
  `detail: { count: number; age: PurgeAge }`; the Reset panel then shows
  `t("purge.done", {count, age})`.

- [ ] **Step 1: Failing tests:** opens on `1y` pressed; note reads "N purchases bought before
  DATE will be deleted." with N from `previewPurge`; choosing `6m` recounts; with N = 0 the
  danger button is disabled and reads *Nothing to delete*; with `older > N` the muted line
  "K older purchases stay: their statements aren't fully paid." shows with K = older − N;
  `Delete N purchases…` swaps to *Keep them* / *Yes, delete N*; *Keep them* swaps back; *Yes*
  applies and emits `purged`; locale switch on the second ask keeps it.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement (copy from the prototype's `shPurge`, spec
  §Delete old purchases). **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `feat(reset): delete old purchases sheet`.

### Task 10: Locations page

**Files:**
- Create: `src/routes/settings/locations.html` (copy `card/edit.html`'s head and body shape,
  title key `title.locations`), `src/routes/settings/locations.ts`,
  `src/routes/settings/locations-page.ts`, `src/routes/settings/locations-page.test.ts`
- Modify: catalogs; `src/lib/ui/shell.ts` only if the Settings tab must stay active on
  `/settings/locations` (check how `/card` keeps Cards active).

**Interfaces:**
- Consumes: `repo.listLocations/saveLocation/deleteLocation`, `listCards`, `locationId`,
  `renameLocation`, `canDeleteLocation` (`#lib/domain/locations`), `sortLocations`,
  `locationName`, `subHeader` (`#lib/ui/sub-header`), `createPageState`.
- Produces: `renderLocationsPage(repo: Repository, root: HTMLElement): void`. Row markup
  `.location-row[data-location=<id>]`, `data-action` `rename`, `save-name`, `cancel-name`,
  `delete`, `confirm-delete`, `cancel-delete`, `takes-purchases` (checkbox), form
  `data-action="add-location"`.

- [ ] **Step 1: Failing tests:** sub-header *Locations* with Back to `/settings`; rows A to Z
  with "N cards" (archived count); *Delete* only on a row with 0 cards and not the last record;
  delete asks once inline then removes; toggling *Takes purchases* saves; with none ticked the
  warning note shows; rename to "" or to another record's name (case-insensitive, trimmed) shows
  a field message and saves nothing; rename keeps the id; add "Chiang Mai" ⇒ id `chiang-mai`,
  `takesPurchases: false`; add "เชียงใหม่" twice ⇒ ids `location`, `location-2`, refused as a
  duplicate the second time (Review Focus 1: same name refused; a different Thai name gets
  `location-2`); a renamed default shows its stored name in both languages.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement, styled as the prototype's `vLocations` with
  shared row CSS from Task 7. **Step 4:** Pass; `bun run build` emits
  `settings/locations.html`.
- [ ] **Step 5:** Full check list, commit `feat(locations): manage locations at /settings/locations`.

### Task 11: Cards leftovers

**Files:** `src/components/cc-cards-list.ts`, `src/components/cc-group-sheet.ts`,
`src/routes/card.ts`, `src/lib/ui/cards-query.ts`, `src/lib/domain/cards-view.ts`,
`src/routes/cards.ts`, `src/components/cc-cards-filter.ts`, `src/components/cc-ready-panel.ts`,
`src/routes/list/picker-page.ts`, `src/components/cc-pay-picker.ts`, `src/lib/i18n/th.ts`,
`en.ts`, tests beside each.

**Interfaces:**
- Produces: `CardsFilter.ungrouped: boolean`, address key `?ungrouped=1` (not `group`, which is
  the sheet key) read/written by `readCardsView`/`writeCardsView`; the filter
  sheet gets a *Not in a group* chip (`data-owner`-style `data-ungrouped`); *Assign them* links
  to `/cards?ungrouped=1`. Blank group sheet moves from `?group=new` to `?newGroup=1`
  (`readGroupSheet` returns `"new"` only for that key; `?group=new` is a group id).

- [ ] **Step 1: Failing tests** (one each): `ungrouped` round-trips and keeps only cards with no
  `limitGroupId` (or a missing group); *Assign them* href is `/cards?ungrouped=1`; only archived
  cards match ⇒ *No card matches* line shows above *Archived (N)*; a failed group delete keeps
  *Delete NAME?* and shows the error; *Show older statements* absent when nothing older; name
  sort uses `localeCompare(…, getLocale())` (Thai names order by `th`); `?group=new` opens the
  group with id `new`, `?newGroup=1` the blank sheet; Thai `title.card` ≠ `title.cards`; `/pay`
  picker with only archived paid-off cards reads "No card to pay. Archived cards with nothing
  owed are hidden."
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit per area or one `fix(cards): phase 5 leftovers`.

### Task 12: Look leftovers

**Files:** every `src/routes/**/*.html` head script, `src/lib/ui/chrome.ts`,
`src/routes/theme-boot.test.ts`, `src/styles/tokens.css`, `src/styles/app.css`,
`src/components/cc-card-hero.ts`, `cc-card-form.ts`, `cc-pay-form.ts`, `cc-cards-filter.ts`.

**Interfaces:**
- `data-env` before first paint: the head boot script also sets `data-env` from
  `location.hostname` (`localhost`/`127.0.0.1` ⇒ `local`, `pr-<n>-…workers.dev` ⇒ `preview`,
  else `production`); `chrome.ts` still sets the build-stamped value after (it wins when they
  differ, e.g. `development`). Keep the script identical in every html file (the theme-boot test
  compares them).
- New tokens (names as fitting `tokens.css` style): hero amount weight, line height and letter
  spacing; `--cc-tracking-caps` for `0.06em`; `--cc-ring-width` for the radio ring;
  `--cc-header-height` matched to the header's real height so the sticky sub-header sits flush.

- [ ] **Step 1: Failing tests:** theme-boot test asserts every html head script sets `data-env`
  and that a `pr-12-cc-tracking.kcinth.workers.dev` hostname yields `preview`; a CSS test (as
  existing token tests do, grep the component `css` text) finds no literal `em`/`calc(var(--cc-border-width) * 2)`
  in the four components.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; fix *Due days after close* wrap at 390px
  (shorter label key or the segmented control allows two-line-free sizing; check at 390 in Task
  13 screenshots). **Step 4:** Pass.
- [ ] **Step 5:** Full check list, commit `fix(ui): tint before first paint and token leftovers`.

### Task 13: Docs, screenshots, acceptance walk (controller)

- [ ] Update `PRD.md` and `PRD_TH.md` together: RD-17, RD-18, RD-19 built; DD-94 retired;
  DD-95, DD-115, DC-06 updated; new DD rows (from DD-128) for: seed once, last location kept,
  missing location repair, Merge keeps local locations, A-to-Z order, v3-only additive merge,
  restore sheet, purge count line, `?ungrouped=1` and `?newGroup=1`, env tint from hostname;
  the roadmap's phase 6 notes marked taken.
- [ ] Screenshots at 1280 and 390, light and dark, English and Thai, of Settings, Locations,
  both sheets, next to the prototype; fix gaps.
- [ ] Walk PRD acceptance criteria; tick what holds, list what doesn't in the PR.
- [ ] Push, PR with base `redesign-phase-5`, wait for deploy, report preview URL.
