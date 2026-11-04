# List patterns and expandable rows — design

Work happens on `redesign/refinement` (PR #35, base `redesign/implement`): every change is a
commit pushed to #35, following `shipping-a-change` except no new worktree, branch or PR. Preview:
`https://pr-35-cc-tracking.kcinth.workers.dev`. Nothing merges until the user approves. The user
handed every open choice to the builder ("use your best judgment, make no mistake"); each choice
below is the builder's call unless marked as the user's.

## Intent

The user wants the app's lists to follow one convention (their words): every list is one of two
kinds,

- **A row list**: the items grouped in one panel, a line between them (Needs you, Transactions,
  purchase lists, …);
- **A card list**: each item its own standalone panel (card tiles, limit groups, …).

Then, in some row lists, a tap should **open the row in place** instead of going to another page:
the opened row shows a little more and a couple of actions, so the list stays short and an
everyday action (mark a plan paid, confirm a list) takes no page change. The user named
Transactions, the purchase lists and Needs you.

An audit (2026-11-03) found most lists already fit, a few built their own copy of the row-list
look, and three fit neither. Part 1 fixes that; Part 2 adds opening rows. Part 1 ships first.

## Goals

- Every repeated list of items is a row list or a card list, and each kind is drawn from one
  shared style, not a local copy.
- Rows in Needs you, Transactions' *Upcoming*, the Transactions ledger and the purchase lists list
  open in place to show detail and actions; the page a row led to stays one button away.
- Opening a row never widens anything; only that row grows taller.

## Non-goals

- No change to card lists' content (tiles and group panels stay as they are).
- No inline payment form: *Pay* still opens the existing payment page (one payment flow).
- No inline purchase editing on Transactions (the card page edits purchases).
- No *Copy text* in opened rows (only the draft review step has a copy today; adding one per
  status is a separate change).
- No opening rows in Owed, the payment card picker, Settings or Locations (each row there has one
  job: the tap is the action).
- No change to how the card page's statements open (they already open in place and are the model).

## Anti-goals

- A row that both navigates and toggles (a link inside a toggle button, or two tap targets in one
  row head).
- An action that writes data behind one tap where today it takes two (the two-step *Delete* and
  *Confirm* stay two-step).
- Losing the opened row or a half-done two-step swap when the page repaints after an action.

## Part 1: two list kinds

### The rule (goes into AGENTS.md "Design system conventions" and a new PRD UI row)

- **Row list**: `rowPanel` from `src/styles/shared.ts` (`.panel` holding rows, a hairline between
  rows, the panel's side padding, hover ground DD-105/DD-109). Light-DOM pages use the same values
  through app.css classes that mirror it (below).
- **Card list**: each item a standalone panel with its own border and radius, gaps between, in a
  grid or a stack (`card-tile.ts` `.tiles`/`.tile`, `cc-group-panels.ts` `.gpanel`, the purchase
  list's per-card sections).
- A list that is neither is a bug.

### Changes

1. **Payment card picker** (`cc-pay-picker.ts`): its local `.list` already has `rowPanel`'s panel
   values and divides `button[data-card]` rows itself. Switch it to `rowPanel`'s `.panel` (a rename
   with no visual change) and drop the local copy. Keep its rows and their hover;
   `row-hover.test.ts` keeps passing.
2. **Light-DOM row lists** (Settings `.set`/`.set-row` in app.css and `setRows` in shared.ts; the
   saved list's `.saved-lines` in app.css; Locations' `.location-row` inside `.set`): these cannot
   take shadow `rowPanel`. Make one light-DOM row-list panel class in app.css, `.row-panel`, whose
   panel values match `rowPanel`'s `.panel` exactly (surface, border, `--cc-radius-md`, side
   padding `--cc-space-4`, vertical padding 0, hairline divider between direct children), and have
   `.set` and `.saved-lines` use it (rename or alias; least churn). Rows keep their own padding,
   so a settings row looks as it does now apart from `.set`'s `--cc-space-1` vertical padding going
   (*builder's call*: one panel definition beats a 4px difference). Rows that are not links or
   buttons get no hover ground (as `rowPanel`, where only link and button rows hover).
   `setRows` (shadow, used inside `.set` by `cc-about` and `cc-display-settings`) draws no panel
   (the light-DOM `.set` is its panel); only its divider is aligned to `rowPanel`'s. A test
   compares values: `.row-panel` equals `rowPanel`'s `.panel` for background, border, radius, side
   and vertical padding and divider; `setRows`' divider equals `rowPanel`'s.
3. **Shared list view** (`cc-list-table.ts`, a `<table>` in its own box): keep the `<table>`
   (header and total row are tabular data; screen readers need it) but draw it as a row list: the
   box takes `rowPanel` values, rows divided by the same hairline, header and total rows styled as
   rows (muted header, bold total). Test the panel class and the dividers.
4. **Draft list's add-card picker** (`cc-list-amounts.ts` `.picker`, loose quiet buttons): make it a
   row list (`rowPanel`), one row per candidate card in the panel form (chip, `id) name`), the row
   a button that adds the card as today.
5. **Draft and reply per-card sections** (`cc-list-amounts.ts` and `cc-list-reply.ts`, the same
   local `.line` CSS twice): they are a card list; move the shared `.line` CSS into one export in
   `shared.ts` (`lineCards` or similar) used by both. No visual change.
6. **Card page statements** (nested purchases inside an opened statement): already the opening-row
   pattern; leave as is.
7. **Needs you / Upcoming action rows** (`action-row.ts`, rows inside `rowPanel`'s `.panel`): they
   are a row list and stay; Part 2 changes them.

## Part 2: rows that open in place

### The pattern (one helper, used everywhere)

- Extend `actionRow` in `src/components/action-row.ts` (it already has `onToggle` and `expanded`)
  into the one opening-row helper; the Transactions ledger rows and the purchase lists rows use it
  too (or the same markup from one shared helper; no list builds its own).
- **The row head is one `<button type="button">`** with `aria-expanded` and `aria-controls` naming
  the details region; it holds what the row shows today (icon or chip, title, subtitle, amount)
  plus a chevron at the end that turns when open. No link or button inside the head.
- **The details region** (`id` referenced by `aria-controls`, `hidden` when closed) sits under the
  head inside the same row: muted detail lines, then a button row (the app's three button
  variants; links styled as buttons with `a.btn` where the action is a page). Buttons are
  right-aligned from 900px, full width stacked below 900px, as today's action rows.
- **One open row per component.** Opening another closes the first. On Transactions,
  `cc-tx-ledger` (Upcoming and every day panel of the ledger) is one component, so at most one row
  is open on the whole page; Home's Needs you is one; the Lists view is one. A second tap on the open head
  closes it. Nothing about it goes in the address. A repaint after an action keeps the open row
  open if the item still exists; an item that disappears (e.g. a plan marked paid) simply goes.
- Keyboard: the head is a native button (Enter/Space). Focus stays on the head when toggling.
  The existing two-step swaps move focus as they do today (DD-110).
- Hover and focus keep DD-105/DD-109 (ground, never underline; focus ring).
- Motion: open/close may animate height only under the app's reduced-motion rule
  (`src/lib/ui/motion.ts`); no animation is fine.

### What each row shows and offers

Wording below is English; Thai strings go into `th.ts` with the same keys (the user reviews Thai).

| List | Row (closed, as today) | Opened: details | Opened: actions |
|---|---|---|---|
| Needs you, overdue bill | as today | statement close and due dates; what is left | **Pay** (`a.btn`, primary → today's `payAddress` with card and amount); **Open card** (quiet link) |
| Needs you, planned payment | as today (DD-155) | the note, if any | **Paid** (quiet) and **Delete** (danger, two-step *Delete*/*Cancel*), the same as Upcoming today |
| Needs you and Upcoming, waiting list | as today | each line: card (line form) and planned amount; total | **Record reply** (primary link → today's list page); **Confirm** (quiet, two-step *Save*/*Cancel*, as Upcoming today) |
| Needs you, draft list | as today | each line: card and amount; total | **Continue** (primary link → draft page); **Delete** (danger, **one step**, as the draft page's *Delete draft*: DD-74, the user's 2026-10-31 decision; refuses a list that is no longer a draft, as `storedDraft` in `src/routes/list/entry.ts` does) |
| Upcoming, planned payment | as today, but *Paid*/*Delete* move from the row into the opened area | the note | **Paid**, **Delete** (two-step) |
| Transactions ledger, purchase | as today, but no longer a link | the note; the statement it falls in (close and due dates); the list it came from, if any | **Open card** (quiet link); **Open list** (quiet link, only when from a list) |
| Transactions ledger, payment | as today, but *Delete* moves into the opened area | the note; which statements it paid and how much of each (from `LedgerStatement.payments`; the ledger component is handed the card ledgers it does not have today) | **Delete** (danger, two-step) |
| Purchase lists (Transactions *Lists* view) | as today, but no longer a link | each line: card and amount (and made / not made once replied); total | by status, the same as Needs you: draft **Continue** + **Delete** (one step); sent **Record reply** + **Confirm** (two-step); saved **Open** (primary link → saved list page) |

- Note: a purchase from a list links to the list today, not the card; the opened row offers both.
- Home gains the write actions it lacks today (*Paid*, *Delete* a plan, *Confirm* a list, *Delete*
  a draft); the Lists view gains *Confirm* and *Delete* too. Their logic moves out of
  `src/routes/transactions.ts` (and the draft page for list delete) into one shared module under `src/lib/ui/` so both pages call the same code and show the
  same errors. Delete of a draft uses the repository's existing `deletePurchaseList`, and the draft
  page calls the shared function too.
- Upcoming's buttons moving into the opened area amends DD-108 and DD-110 (same buttons, new
  place). Needs you rows stop being links (amends DD-106/DD-108 where they say the whole row opens
  the item).

### Tests (beyond each row's content and actions above)

- Opening one row closes the other; the head is a `button` with `aria-expanded`/`aria-controls`;
  no `a`/`button` inside the head; details `hidden` when closed.
- Marking a plan paid from Home writes the payment and the row goes; an error shows Home's error
  banner and the row stays open.
- A two-step swap survives a repaint caused by an unrelated change.
- `row-hover.test.ts` covers the new heads (ground on hover, no underline, focus ring).
- Every interactive part works in English and Thai, light and dark, 390 and 1280 (screenshots
  before handing over).

## Left to the builder

- Exact CSS for the chevron, the details region spacing (tokens only) and the light-DOM class
  names.
- Whether ledger rows reuse `actionRow` directly or share a smaller head/details helper with it,
  as long as there is one implementation of the pattern.
- Splitting the work into commits (Part 1 before Part 2).

## Docs

- `AGENTS.md`: the two list kinds and the opening-row pattern under "Design system conventions".
- `PRD.md` and `PRD_TH.md` together: a UI row for the two list kinds, DD rows after the last in use
  (DD-162 onward) for Part 1 and Part 2, dated notes on DD-77 (a paid payment's row now opens;
  *Delete* moves into it), DD-106, DD-108, DD-110 and any row whose "the row opens the page"
  wording changes. DD-74 stands.
- `ENDPOINTS.md` only if an address changes (none expected).
