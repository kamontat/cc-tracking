# Redesign phase 5: Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card registry with the prototype's Cards page (grouped by place, search,
filter, sort, limit groups beside the list), a new card page (room hero, owed, next bill,
*Use on a list*, *Make a payment*, statements that unfold to their purchases), a full edit
screen for a card, and a sheet for a limit group. The registry dialogs, the card and group
tables and the `/cards` query view go.

**Architecture:** Pure rules for the Cards page live in `src/lib/domain/cards-view.ts`
(filter, sort, place sections, archived split, group panels, delete guard). The address
carries the view and the open group sheet (`src/lib/ui/cards-query.ts`). Lit components draw
the results, the filter sheet, the group panels, the group form, the card hero, the
statements and the purchase edit form; routes `/cards`, `/card`, `/card/new` and
`/card/edit` wire them to storage.

**Tech Stack:** Bun, TypeScript, Lit, `@kcstyles/reset.css`, `bun:test`, happy-dom.

**Spec:** [`PRD.md`](../../../PRD.md): RD-16 (and RD-07, RD-21's group pastels); FR-01 to
FR-08, FR-10, FR-12, FR-16, FR-21, FR-22, FR-38; US-10, US-16 to US-18; CD-09, CD-10; DC-13,
DC-15, DC-16 (both retire); DR-18 to DR-20, DR-24; DD-67, DD-78, DD-96; UI-01 to UI-21; open
question 15. Roadmap: [`2026-10-30-redesign-roadmap.md`](2026-10-30-redesign-roadmap.md)
(phase 5 row and notes). Visual reference: the approved prototype (`vCards`, `cardRow`,
`cardResults`, `vCard`, `vEdit`, `shFilter` for cards), copy at
`/Users/kamontat/Personal/cc-tracking/.playwright-mcp/cc-flows.html`.

## Global Constraints

- Money is whole satang (DR-01): typed amounts through `parseAmount`, shown through
  `formatAmount`. Dates are `PlainDate`; arithmetic through `#lib/domain/date` (DR-02); shown
  with `displayDate` or `headerDate`, never `Intl` (UI-05).
- `src/lib/domain` imports nothing from storage or the interface; components never import
  `#lib/storage` (DC-01).
- Shadow CSS and `app.css` use only `var(--cc-*)`; values live in `tokens.css` (UI-01). Three
  button variants (UI-02). No selector on translated text (UI-04).
- Every new string in both `en.ts` and `th.ts` (UI-03), using the glossary's Thai terms
  (กลุ่มวงเงิน limit group, เจ้าของบัตร account holder). Card names, ids and notes are never
  translated (UI-13).
- Cards are named per UI-14 through `#lib/ui/card-label` (panel rows: chip + `id) name`;
  sentences: the name, short `c-[id]`).
- Saves are awaited; a failed write keeps what was typed and shows why (UI-11). A language
  switch re-renders in place (UI-12). Deleting asks twice (UI-09).
- Numeric cells carry `data-numeric` (UI-17). Empty states name the next step (UI-15).
- Components stay flat in `src/components/` (the catalog test's glob is not recursive);
  new routes are `src/routes/card/new.html` + `new.ts` and `src/routes/card/edit.html` +
  `edit.ts`, beside the existing `src/routes/card.html` (check in the built `dist/` and on the
  preview that `/card`, `/card/new` and `/card/edit` all answer).
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`. Conventional, lower-case, scoped commits.
- Before reporting a screen done, screenshot it at 1280 and 390 beside the prototype (memory:
  match the prototype). happy-dom can't see layout.

## Decisions

Asked of the user on 2026-10-31 (the first four), or the builder's call (question 15 leaves
addresses to the builder).

- **Fixing a purchase stays on the card page.** Tapping a statement row unfolds it to its
  purchases (date, note, amount); each purchase has *Edit* and *Delete*. *Edit* opens a sheet
  with date, amount and note (the card fixed, FR-21); *Delete* swaps to *Delete ฿X?* with
  *Delete* (danger) and *Keep*. Archived cards included. Purchases are added only from
  purchase lists: the card page's *Add purchase* dialog goes (DD-67).
- **A limit group is edited in a sheet over Cards.** `/cards?group=<id>` opens it on that
  group, `/cards?group=new` on a blank one. Tapping a group panel pushes the address (Back
  closes the sheet); Close, Escape and the backdrop step back when the page pushed it, else
  replace the address without `group`, as `/pay` does (DD-102). Fields: name, limit, account
  holder (KC, NT, RI as a segmented control). *Delete group* (danger, two steps) only while no
  card uses it. *Add group* sits under the Limit groups heading.
- **Archived cards fold at the end** of the results: *Archived (N)*, closed by default and
  remembered through `cc:panel:cards-archive`. Search and filters apply to them too; the
  sort is the same; they never sit in a place section.
- **Adding and editing a card is a full screen.** `/card/new` and `/card/edit?id=<id>` share
  one form under a back header: name; card id (disabled when editing, *Card id can't change*)
  and last 4; *Kept in* as a segmented control of the locations; limit group (a select of
  `name (holder) · limit`); the billing cycle (closes on day, then *due days after close* or
  *due on day*, both kinds kept); cardholder (*Account holder (KC)* or *Supplementary card*
  with its own holder); comment; *Save changes*. Editing adds *Archive card* / *Unarchive
  card* (quiet) and *Delete card* (danger, two steps) when the card has no purchases and is
  on no draft and no list waiting for the spender. A save replaces the address with
  `/card?id=<id>`; a failed one keeps the form. The card page's *Edit* links to
  `/card/edit?id=`; the Cards page's *Add card* links to `/card/new`.
- **Addresses** (question 15): `/cards?q=&loc=&owner=&sort=&group=`, `/card?id=`,
  `/card/new`, `/card/edit?id=`. `loc` and `owner` repeat for several values. Defaults are
  left out and the address is replaced, not pushed, except opening a group sheet. The old
  `edit`, `group` (as a filter), `dir`, `gq`, `gowner`, `gsort`, `gdir` keys are no longer
  read (DC-15, DC-16 retire). `/card/new` and `/card/edit` mark the Cards tab.
- **Cards page layout** (prototype `vCards`): heading *Cards* with *Add card*; the shared
  search, filter button (count of active filters), sort label and removable chips; results;
  *Limit groups* (count) beside the results from 900px, below them on a phone. Sort *By place*
  (default) shows a section per location in location order, each headed by its name and
  `N cards · takes purchases`; any other sort (*Most room*, *Name*, *Close day*) is one flat
  list headed `N cards`, whose rows add `· place · holder`. A row: the chip, `id) name`
  (UI-14), and on the right the group's room with *room*, or `N% used` in the warn colour from
  80%, or *credit ฿X* when the card holds credit. No match: *No card matches. Clear the
  search or a filter.* No cards at all: *No cards yet. Add one with Add card.*
- **Filter sheet for cards**: *Kept in* (locations), *Account holder* (KC, NT, RI), *Sort by*
  (radio list), *Clear all*, *Show N cards* / *Nothing matches*, through the shared
  `filter-sheet.ts` frame. Search matches id, name, last 4 and comment.
- **Group panel** (prototype aside): `name (holder)`, `room of limit`, the bar, then the card
  ids, `N% used`, and *getting full* from 80%. Usage is `used + held` (DD-96). Computed once
  per load (roadmap note).
- **Card page** (prototype `vCard`): back header with `id) name`, `name · ••••last4`, *Edit*;
  archived and supplementary badges under it; the hero on the group's pastel (`name · holder`
  and `· shared with …` naming the other cards by id; the room big; *room of ฿limit*; the
  bar; `N% used · buy today: closes D, due D`); three stats (*Owed*, *Next bill* in the bad
  colour when overdue, *Credit* when there is credit else *Kept in*); *Use on a list*
  (`/list/new?card=<id>`) or, when the card can't take a purchase, the note naming the reason
  (archived, or the place isn't ticked, FR-22); *Make a payment* (quiet, `payAddress` with the
  next bill); *Statements* with each row `Mon YYYY` + tag (*Current*, *Overdue N days*, *Due
  in N days* within 7, *Due D*, *Paid*) + `closes D · due D` or *paid in full*, and what is left
  on the right; quiet months folded (DR-22); *Show older statements*. The comment shows under
  the stats when set.
- **Delete guard in storage**: `deleteCard` also refuses a card on a draft or a list waiting
  for the spender (roadmap note), and the contract suite tests it. The interface hides the
  button as well.

## Review Focus

- The Cards page, card page and edit screen match the prototype at 1280 and 390, both themes.
- Room, owed, next bill and group usage agree with Home and Transactions for the same data.
- Back behaviour of the group sheet matches `/pay` (no duplicate history entries).
- Nothing left referencing the removed components, keys or query names (the catalog test
  catches unused keys).

---

### Task 1: Cards page rules

**Files:** create `src/lib/domain/cards-view.ts` + `cards-view.test.ts`.

- [ ] Types: `CardsSort = "place" | "room" | "name" | "close"`, `CardsFilter = { q: string;
  locations: string[]; owners: Owner[] }`, `CardsView = CardsFilter & { sort: CardsSort }`,
  `DEFAULT_CARDS_VIEW`.
- [ ] `matchesCard(card, group, filter)`: q (case-insensitive, trimmed) over id, name, last 4,
  comment; location in `locations` when any; holder (`cardOwnerOf`) in `owners` when any.
- [ ] `cardsResults(cards, groups, rooms, view, locationOrder)` returns `{ sections:
  { location, cards }[] | null; flat: Card[] | null; archived: Card[]; count: number }`:
  unarchived matches either split by location in `locationOrder` (sort `place`, inside a
  section by id as today) or one flat list sorted by room (most first, ties by id), name
  (locale compare, ties by id), close day (ties by id). Archived matches sorted the same way,
  flat.
- [ ] `groupPanels(groups, cards, rooms)`: per group `{ group, room, limit, usedPct, cardIds,
  full: usedPct >= 80 }`, usedPct from `used + held` (DD-96), rounded, clamped at 0.
- [ ] `cardUsePct(room)` shared by row and hero.
- [ ] Tests for each, including ties, empty filters, unknown group, archived split.
- [ ] Commit `feat(cards): cards page rules`.

### Task 2: Delete guard for cards on lists

**Files:** `src/lib/storage/*repository*` (the implementation(s) and the contract suite).

- [ ] Failing contract test: `deleteCard` rejects (same error style as the purchase guard) when
  a list with status `draft` or `sent` has a line on the card; a `saved` list does not block.
- [ ] Implement in every repository implementation. Commit `feat(storage): refuse deleting a card on an open list`.

### Task 3: Cards address

**Files:** create `src/lib/ui/cards-query.ts` + test; delete `src/lib/ui/list-view-query.ts`
and its test once Task 5 no longer imports it (do the delete in Task 5).

- [ ] `readCardsView(search)`, `writeCardsView(view)` (defaults left out, `loc`/`owner`
  repeated, unknown sort or owner ignored), `readGroupSheet(search): string | "new" | null`,
  `groupSheetAddress(search, id | null)`.
- [ ] Commit `feat(cards): cards page address`.

### Task 4: Cards page components

**Files:** create `src/components/cc-cards-list.ts`, `cc-cards-filter.ts`,
`cc-group-panels.ts`, `cc-group-sheet.ts` (+ tests). Reuse `list-controls.ts`,
`filter-sheet.ts`, `cardMini`/`cardPanelLabel`, `#styles/shared` (`filterSheet`, rows, bars).
Look at `cc-tx-ledger`, `cc-tx-filter`, `cc-owed-list` and `cc-pay-form` for how phase 4
draws rows, the sheet and the bar.

- [ ] `cc-cards-list`: props `results`, `groups`, `rooms`, `credits`, `settings`; draws
  sections / flat list / folded archived (`<details>` remembered by `rememberPanel`), rows as
  links to `/card?id=` (encoded), the right side per the Decisions, the two empty states.
- [ ] `cc-cards-filter`: sheet like `cc-tx-filter` with location and owner chips and sort
  radios; emits `apply` with the draft view and `close`.
- [ ] `cc-group-panels`: heading *Limit groups* (count) with *Add group*; one button-panel per
  group emitting `open-group` with its id; empty state *No limit groups yet. Add one.*
- [ ] `cc-group-sheet`: the group form (port the fields and checks of `cc-limit-group-form`:
  name required, limit above zero through `parseAmount`, holder required) inside the sheet
  frame of `cc-pay-form`/`cc-modal`; *Save*, and for an existing unused group *Delete group* →
  *Delete NAME?* *Delete*/*Keep*; emits `save-group`, `delete-group`, `close`; shows `error`.
- [ ] i18n keys in `en.ts` and `th.ts`. Commit `feat(cards): cards page components`.

### Task 5: Cards page

**Files:** rewrite `src/routes/cards.ts` (+ `cards.test.ts`); keep `cards.html`.

- [ ] Load once: `loadMoneyData`, rooms per group computed once (`groupRoom`), credits per
  card from the ledgers, location order from the stored locations (names through the catalog
  for default names, as Home does).
- [ ] Header, controls, results, panels per the Decisions; layout grid `1fr / 20rem` from 900px
  (CSS in `app.css` with tokens), stacked below.
- [ ] Group sheet on `?group=`, with the `/pay`-style address bar seam (`push`, `replace`,
  `onPop`, `back`) so tests drive it; save and delete through the repository with
  `createPageState.guard`, closing only once written; a failed one keeps the sheet.
- [ ] Keep the location-reset notice (`takeResetNotice`).
- [ ] Delete `list-view-query.ts` (+ test). Commit `feat(cards): new cards page`.

### Task 6: Card page

**Files:** rewrite `src/routes/card.ts` (+ `card.test.ts`); create `src/components/cc-card-hero.ts`,
`cc-card-statements.ts`, `cc-purchase-sheet.ts` (+ tests); replace `cc-card-summary` and
`cc-statement-list` (delete them when unused).

- [ ] Back header via `backHeader` with *Edit* → `/card/edit?id=`.
- [ ] Hero, stats, actions, comment per the Decisions; numbers from `roomFor`, the ledger's
  `owed`, `credit` and `nextBill` (same as today's summary).
- [ ] Statements: the same periods as today (`recentPeriods`, DR-18, DR-22 folding, 12 per
  page, *Show older statements*); a row with purchases is a button with `aria-expanded` that
  unfolds them; each purchase has *Edit* and *Delete* (swap confirm, focus follows the swap).
- [ ] `cc-purchase-sheet`: date, amount, note; card fixed and named; saves through
  `repo.savePurchase` keeping `addedAt`; closes only once written.
- [ ] Remove the Add purchase dialog: delete `src/lib/ui/purchase-dialog.ts`,
  `src/components/cc-quick-add.ts`, `SpendRow` in `limit.ts` if unused, and their keys —
  except `quickAdd.*`, `spendable.*`, `backup.copy*` keys the list pages still use (check
  with grep before deleting each).
- [ ] Commit `feat(cards): new card page`.

### Task 7: Card edit screen

**Files:** create `src/routes/card/new.html`, `new.ts`, `edit.html`, `edit.ts`, a shared
`src/routes/card/edit-page.ts` (+ test); port `cc-card-form` to the full-screen form
(rename to `cc-card-editor` or restyle in place; keep its validation tests).

- [ ] Fields and buttons per the Decisions; the new card's id must not exist (the old
  duplicate-id check); `Card.location` stays the current location set (widening is phase 6).
- [ ] Archive / Unarchive, Delete (only when allowed: no purchases, not on a draft or sent
  list; storage refuses anyway and the reason shows).
- [ ] `currentTab` maps `/card/new` and `/card/edit` to Cards (+ test).
- [ ] Commit `feat(cards): full card edit screen`.

### Task 8: Leftovers

- [ ] Delete `cc-card-table`, `cc-limit-group-table`, `cc-limit-group-form`, `cc-modal` if
  unused, `#lib/domain/list-view` parts only they used, and `cards.*`/`limits.*` keys left
  unused (catalog test).
- [ ] Darken light `--cc-group-4-text` to at least 4.5:1 on `--cc-group-4` (roadmap note).
- [ ] Commit `refactor(cards): remove the registry`.

### Task 9: Docs and ship

- [ ] `PRD.md` and `PRD_TH.md` in step: RD-16 shipped line; FR-06, FR-07, FR-16, FR-21,
  FR-38, CD-01, CD-04, CD-09, CD-10, DC-15, DC-16, DD-67 updated or retired; new DD rows for
  the decisions above (next free numbers); a phase 5 status paragraph.
- [ ] Roadmap: mark phase 5 notes taken, add notes for phase 6.
- [ ] Screenshots at 1280 and 390 beside the prototype. Push, PR with base
  `redesign-phase-4`, wait for the preview deploy, hand over the URL.
