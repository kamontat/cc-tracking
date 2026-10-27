# Dashboard entry workspace

Date: 2026-10-27

## Why

The person entering purchases works through a pile of receipts: several cards, often several
purchase dates, entered one after another. Two things go wrong today:

1. **Losing their place.** They get distracted mid-pile, come back, and can't tell which receipts
   are already entered. Purchases only show per card (`/card?id=…`), and nothing records when a
   purchase was typed in.
2. **No cross-card count.** They want to know how many purchases (and how much) fall within a
   date or date range, across all cards. Nothing shows that today.

## Goals

- The dashboard becomes a workspace for entering a pile of receipts: the add form is always on
  screen, and what was entered since the pile was started is listed right next to it.
- A cross-card summary of purchases within a chosen date range: count, total, cards used, and the
  list.
- Works on desktop and phone width.

## Non-goals

- Visual redesign: new colours, friendlier styling, progress bars in Spendable. The person liked
  those in the mockup but explicitly deferred them; they go into `TODO.md` (see below). Keep
  using the existing tokens and components.
- Actions on the "This sitting" list. It is read-only: no edit, delete or undo there. Edit and
  delete keep living on the card page.
- A separate purchases page. Everything lives on the dashboard.
- Backfilling entry time for purchases that already exist.

## Anti-goals

- Losing the "This sitting" list on reload, tab close or the next day: that is exactly the
  distraction it exists to survive.
- Making the add flow slower than today's dialog for one-off entries.

## Decided with the person

Layout ("direction B" of the mockup at `.superpowers/brainstorm/…/dashboard.html`):

- **Desktop:** two columns.
  - Left: **Add purchase** form, always visible (no dialog on the dashboard), then **This
    sitting**.
  - Right: **Purchases by date**, then **Due next**, then **Spendable**.
- **Mobile:** one column, same order: form, This sitting, Purchases by date, Due next, Spendable.

**This sitting**

- Lists every purchase entered since the last press of **Start new batch**, newest-entered first.
- Header shows count and total of those purchases.
- Each row: how long ago it was entered, card, note, purchase date, amount.
- Survives reload, closing the tab, and days passing, until **Start new batch** is pressed.
- Read-only.
- Needs each newly saved purchase to record when it was entered. Purchases saved before this
  change have no entry time and never appear here.

**Purchases by date**

- Range presets: Today, This week, This month, Last month, Custom (from/to dates).
- Optional card filter (All cards by default).
- Shows count of purchases, total amount, and number of cards used.
- The list is collapsed by default ("Show N purchases"); expanded, it is grouped by day.

**Deferred:** create `TODO.md` at the repo root (it does not exist yet) with an item to redesign
the UX/UI, flows and colouring, noting the mockup's friendlier colours and the "used this cycle"
progress bar in Spendable as starting points.

## My calls (not confirmed by the person; flag if wrong)

- **The date range filters on purchase date** (the date on the receipt), not on entry time. The
  person said "added within specific date"; the mockup used purchase date and they didn't object.
- **After an add, the form clears amount and note but keeps the card and date**, since receipts
  come in runs from one card or one day.
- **The "lands on statement X, due Y" confirmation stays**, shown as today (and the over-limit
  note), above the two columns.
- **The card page keeps its Add purchase dialog** unchanged; only the dashboard loses the dialog.
- **Editing a purchase keeps its original entry time**; it doesn't jump back to the top of This
  sitting.
- **Week starts Monday.** "This week" is Monday-Sunday containing today.
- **The batch start is per browser**, like the rest of the data (local storage). It's stored with
  the app's data rather than separately, so it's in one place; whether it goes into backup
  export/import is the builder's call (exclude it if unsure: it's a working-state marker, not
  records).
- **First ever load (no batch start stored)** treats the batch as started at that moment, so This
  sitting begins empty.
- **Panels' open/closed state** keeps using `panelOpen`/`rememberPanel` for Due next, Spendable
  and Purchases by date. This sitting and the form are always open.
- **Entry time is stored as an ISO 8601 instant string**, optional on `Purchase` (`addedAt?:
  string`); import accepts purchases with or without it.
- **Batch start lives behind its own Repository method** (with a contract test), not in
  `Settings`, so it stays out of backup export/import. Clear all clears it too.
- **Purchases added from the card page also get an entry time.** The card page's edit path
  currently rebuilds the purchase from the form; it must carry `addedAt` over.
- **"Start new batch" asks inline before resetting**: the first press turns into a "Start new
  batch? / Keep" pair in place (no dialog); only the second press resets. Losing the list by a
  stray click is the anti-goal.
- **Archived cards count in Purchases by date.** A range answers "what was bought then", and
  archiving a card later shouldn't change that answer. Their rows carry an "archived" tag, and
  the card filter lists them after the active cards, also tagged. Cards hidden from the add form
  by the purchase setting still appear in the filter. Archived cards stay out of the add form.
- **Default range preset is This month.**
- **"Today" refreshes** if the tab stays open past midnight (presets and the form's default date
  follow it).

## Constraints

- Bun, Lit, existing structure (`src/routes/index.ts`, `src/components/*`, `src/lib/*`).
- All strings through `t()`, in both `en.ts` and `th.ts`; `coverage.test.ts` enforces this.
- Design system rules in `CLAUDE.md`: values only via `var(--cc-*)` tokens; button variants are
  primary, `quiet`, `danger` only; no selectors keyed off translated text.
- Change workflow in `.claude/skills/shipping-a-change` (worktree, test first, check/format/test,
  PR, preview URL).
- Every `Repository` implementation must pass `contract.ts`; extend the contract for `addedAt`
  round-tripping.

## Left to the builder

- Component split (e.g. a `cc-sitting-list` and `cc-purchase-range` component, or route-level
  templates), and whether `cc-quick-add` is reused inline or wrapped.
- How the "x min ago" text refreshes (timer or on repaint).
- How the range presets compute dates (reuse `#lib/domain/date` helpers).
- Exact copy for new strings, in English and Thai.
- Test layout, following the existing `*.test.ts` beside each module.
