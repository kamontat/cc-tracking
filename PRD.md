# cc-tracking: product requirements

| | |
|---|---|
| **Status** | Draft for the refactor and redesign |
| **Last updated** | 2026-10-28 |
| **Baseline** | Everything shipped up to 2026-10-28, including partial payments ([`CHANGELOG.md`](CHANGELOG.md)) |
| **Thai translation** | [`PRD_TH.md`](PRD_TH.md), same IDs in the same order |

## Summary

cc-tracking tracks a small business's company credit cards: where each card is kept, when each
statement closes and must be paid, how much credit is left on accounts that several cards
share, and which statement a purchase lands on. It runs entirely in the browser, in Thai and
English.

The site is about to be refactored and redesigned. This document is the full context for that
work. It says why the app exists, what it must keep doing, the exact rules behind its numbers,
the data that existing browsers and backups already hold, and every decision made along the
way, with the reason. It also says what is free to change, and lists what is still undecided
as [open questions](#open-questions).

## For agents: read this first

1. **Read the whole document before planning.** Then read [`README.md`](README.md) for how
   statements, limits and storage work, and `AGENTS.md` for the stack and conventions.
2. **Know what you may change.** Each section's role in the redesign:

| Section | IDs | In the redesign |
|---|---|---|
| [Business requirements](#business-requirements) | BR | Keep. These are why the app exists. |
| [Functional requirements](#functional-requirements) | FR | Keep the behaviour. Where and how it is shown may change. |
| [User stories](#user-stories) | US | Walk every story through the new design before building it. |
| [Domain rules](#domain-rules) | DR | Keep exactly. Changing one changes the numbers people rely on. |
| [Data contracts](#data-contracts) | DC | Keep, or migrate on purpose. Existing browsers, backups and shared links depend on them. |
| [Interface rules](#interface-rules) | UI | Keep. They hold whatever the layout. |
| [Decisions](#decisions) | DD | Change only on purpose, after reading the reason and the rejected options. |
| [Out of scope](#out-of-scope) | -- | Not built on purpose. Adding one is a new decision. |
| [Current design](#current-design) | CD | Free to change. Listed so a change is a choice, not an accident. |
| [Retired](#retired) | -- | Removed on purpose. Don't bring back by accident. |

3. **Settle the open questions with the user first.** Don't guess the answers to
   [open questions](#open-questions); ask, then record the answer here.
4. **Follow the change workflow.** Every change goes through
   `.claude/skills/shipping-a-change` (worktree, test first, checks, pull request, preview URL)
   and lands through `.claude/skills/landing-a-change` only after the user approves.
5. **Finish with the [acceptance criteria](#acceptance-criteria-for-the-redesign)** and update
   this document: a changed decision gets a new reason, a retired requirement is marked retired.

IDs are stable: add new ones at the end of their list rather than renumbering, and mark a
retired one as retired rather than deleting it. Each functional requirement names the business
requirements it serves, and each user story names the functional requirements it covers.

### Where things live

| Path | What |
|---|---|
| `src/lib/domain/` | Pure rules: dates, cycles, statements, limits, ranges, money. No storage, no UI. Tests beside each file. |
| `src/lib/storage/` | `Repository` interface, the `localStorage` implementation, the contract suite, backup and restore, the location migration. |
| `src/lib/i18n/` | The English and Thai catalogs (`en.ts`, `th.ts`), language detection and formatting. |
| `src/lib/ui/` | Page plumbing shared by routes: load and save with error handling, panels, theme, list view in the address, build info. |
| `src/components/` | Lit web components (`cc-*`), one per panel, form or table. They get data as properties and send events. |
| `src/routes/` | One HTML page and script per address: `index` (`/`), `cards`, `card`, `settings`. |
| `src/styles/` | `tokens.css` (every value), `app.css` (page shell), `shared.ts` (styles inside components). |

Stack: Bun, TypeScript, Lit, `@kcstyles/reset.css`, happy-dom for tests, static pages on
Cloudflare Workers. Commands: `bun run dev`, `bun run test`, `bun run check`,
`bun run typecheck`, `bun run build`.

## Problem

The app works, and its rules are settled, but it grew one feature at a time over six weeks.
Two things now call for a redesign:

- **The flows.** How pages lead into one another, and what each page asks of the reader, were
  never designed as a whole. `TODO.md` has carried this since the visual refresh on
  2026-10-27, which changed the look and deliberately left the flows alone.
- **The code.** A refactor alongside the redesign, so the structure matches the product as it
  now is rather than the order it was built in.

The specific pain points need the user's own walk-throughs and are not yet written down; see
[open questions](#open-questions).

## Goals

- **G1. Keep everything that works.** Every requirement, user story, domain rule, data contract
  and interface rule in this document still holds after the redesign, unless it is retired
  here on purpose.
- **G2. Flows designed as a whole**, around the three questions the app answers: what to pay
  and when, how much room is left, and which statement a purchase lands on.
- **G3. Entering a pile of receipts stays at least as fast** as today's always-open form and
  *This sitting* list.
- **G4. No one loses data.** Data saved in a browser today, and backups saved today, load
  unchanged.
- **G5. A codebase that is easy to change**, keeping the separation between pure rules,
  storage and interface.

## Non-goals of the redesign

- New features that are not in this document. Anything in [Out of scope](#out-of-scope) stays
  out unless decided separately.
- Changing a domain rule or data contract as a side effect of a layout change.
- Moving data to a server or adding accounts (see [Future work](#future-work)).

## Background

A small business holds a set of company credit cards. The cards are kept in three places
(Bangkok, Phichit and Krabi), belong to accounts held by three people (KC, NT and RI), and
some accounts share one credit limit across several physical cards. Receipts pile up and are
entered later, in batches. The app has to answer three questions at any moment: what must be
paid and by when, how much can still be spent on each card, and which statement a given
purchase lands on.

The data is small: about a dozen cards and a few hundred purchases a year. Several choices
below (full scans at startup, loading every purchase on a page) rely on that.

### Users

- **Bookkeeper** -- enters receipts in batches, marks statements paid, and reconciles the app
  against bank statements. The main user. Often interrupted halfway through a pile.
- **Card administrator** -- keeps the card registry right: adds cards, sets billing cycles,
  limit groups, locations and holders, archives cards that are retired. Often the same
  person as the bookkeeper.
- **Spender** -- needs to know, before buying, which card has room and when that purchase
  will be due.

## Business requirements

| ID | Requirement |
|---|---|
| BR-01 | Never miss a card payment: show what is due next across every card, and how urgent it is. |
| BR-02 | Know how much can still be spent on each card, counting limits that several cards share. |
| BR-03 | Record every purchase against the right card and the statement the bank will put it on. |
| BR-04 | Make entering a pile of receipts fast and resumable after an interruption. |
| BR-05 | Keep an accurate registry of cards: where each is kept, who holds it, its billing cycle and its limit group. |
| BR-06 | Keep settled history stable: paying a statement freezes it against later changes to the card. |
| BR-07 | Record what happened, not police it: over-limit, future-dated and close-date purchases are saved with a warning, never refused. |
| BR-08 | Data stays private to the user's own browser, and the user can back it up, move it and restore it without losing anything. |
| BR-09 | Work in Thai and English, with dates and amounts that match Thai bank statements. |
| BR-10 | Work on a phone as well as a desktop. |
| BR-11 | Control which places new purchases may be entered from, without editing every card. |
| BR-12 | Report spending over a period: how many purchases, how much, on which cards. |

## Functional requirements

### Card registry

| ID | Requirement | Serves |
|---|---|---|
| FR-01 | A card has a unique id (fixed once saved), a name, the last 4 digits (exactly four), a location, a billing cycle, a limit group, an optional comment and an archived flag. | BR-05 |
| FR-02 | Location is one of Bangkok, Phichit or Krabi, chosen from a list. A stored location the app does not recognise is reset to Bangkok once at startup, and the registry names the reset cards once, with a Dismiss button. | BR-05 |
| FR-03 | A billing cycle is either *closes on day N, due M days later* (M from 1 to 60) or *closes on day N, due on day M* (days 1 to 31). See DR-04. | BR-03, BR-05 |
| FR-04 | A card may be marked supplementary (บัตรเสริม) with its own cardholder. Otherwise the cardholder is the account holder of its limit group. | BR-05 |
| FR-05 | A card can be edited, archived or unarchived, and deleted only while it has no purchases. Archived cards leave the dashboard and the purchase form but keep their history and still count against their group's limit. | BR-05, BR-02 |
| FR-06 | The card list can be searched (name, id, last 4, comment), filtered by cardholder, location and limit group (including "not assigned"), and sorted by name, location, group or close day. The view is kept in the address, so a reload or a shared link keeps it (DC-15). | BR-05 |
| FR-07 | Cards and limit groups are added and edited in a dialog, opened by an Add button or a row's Edit button. The dialog stays open on a failed save and closes only once the write has landed. The card list, the archived list and the limit group list fold, and each remembers whether it was left open. | BR-05, BR-10 |
| FR-38 | The card page's *Edit card* opens that card's edit dialog in the registry (`/cards?edit=<id>`). | BR-05 |

### Limit groups and spendable credit

| ID | Requirement | Serves |
|---|---|---|
| FR-08 | A limit group has a name, a credit limit in baht (above zero) and an account holder (KC, NT or RI). Every card must point at one group; a card on its own is a group of one. A group can be deleted only while no card uses it. | BR-02, BR-05 |
| FR-09 | A group's available credit is its limit less every purchase on a statement not yet marked paid, including the open period. Marking a statement paid gives back exactly that statement's total. See DR-09. | BR-02 |
| FR-10 | The limit group list shows each group's owner, limit, cards, used and available amounts, and can be searched, filtered by owner and sorted. | BR-02 |
| FR-11 | *Can spend now* lists each unarchived card that can take a purchase, with its available credit out of its limit, how much of the limit is used (DR-23), whether the limit is shared (DR-24), and the close and due dates a purchase made today would get, each with a relative date (DR-27). It counts cards with no group and links to assign them. It sorts by card, available, closes or due. | BR-02 |
| FR-12 | The card page shows the card's available credit, what is still owed on it (what is left on every statement not fully paid), and its next due date with what is left on it. | BR-01, BR-02 |

### Statements and payments

| ID | Requirement | Serves |
|---|---|---|
| FR-13 | Statements are derived from the card's cycle and its purchases, never stored. See DR-03 to DR-05. | BR-03 |
| FR-14 | *Mark paid* on a closed statement opens a dialog for the amount and the date paid, starting at what is left and today, so paying in full is still one confirm. A statement can be paid in several parts and counts as paid once they cover its total. Each payment can be unmarked on its own. The first payment freezes the close and due dates. The open period has no *Mark paid* button; it reads "still open". | BR-01, BR-06 |
| FR-15 | *Due next* lists, per unarchived card, what is due next (DR-06), with close date, due date, what is left to pay (with the full total under it), and an urgency label (DR-07). Rows can be marked paid from the list and sorted by card, location, closes, due or what is left. | BR-01 |
| FR-16 | The card page lists statements newest first, marks the current one, folds runs of quiet months into one line (DR-22), and shows 12 periods at a time with *Show older statements* for 12 more. A statement with payments lists each one under its purchases, as an amount off the total with its own *Unmark*, and ends with what is left to pay. | BR-03 |

### Purchases

| ID | Requirement | Serves |
|---|---|---|
| FR-17 | A purchase has a card, a date, an amount in baht (stored in satang) and an optional note. It records when it was first entered; an edit keeps that time. | BR-03 |
| FR-18 | After adding, the app says which statement the purchase lands on and when it is due. | BR-03 |
| FR-19 | The form shows the selected card's available credit. A purchase over it is saved, and the confirmation says by how much it went over which group's limit. | BR-02, BR-07 |
| FR-20 | The form warns, without blocking, when the date is the card's close date (the bank may post it on either statement) and when the date is in the future. | BR-03, BR-07 |
| FR-21 | A purchase can be edited (date, amount, note; the card stays fixed) or deleted from the card page, archived cards included. | BR-03 |
| FR-22 | Only cards kept in a place ticked under *Purchases* in Settings can take a new purchase. Default: Krabi only. When none qualify, the form says how to fix it; on the card page of a card that can't take one, the add button is hidden and a note says how to fix it. | BR-11 |

### Dashboard workspace

| ID | Requirement | Serves |
|---|---|---|
| FR-23 | The dashboard's purchase form is always open. After each add it keeps the card and date and clears amount and note. A failed add keeps what was typed and shows the error beside the form. With exactly one eligible card, the card is shown as text rather than a list to pick from. | BR-04 |
| FR-24 | *This sitting* lists purchases entered since *Start new batch* was last pressed (DR-16), with how long ago, card, purchase date and amount, and a count and total. It survives reloads, closing the tab and the next day. *Start new batch* asks for a second click before clearing. | BR-04 |
| FR-25 | *Purchases by date* counts purchases, their total and the cards used, across every card (archived ones tagged), for Today, This week, This month, Last month or a custom range of purchase dates (DR-17), with a card filter. The list is folded until opened and grouped by day, each card linked to its page. | BR-12 |
| FR-26 | The dashboard re-reads the clock each minute, so a tab left open past midnight moves its default date and presets to the new day, without changing a date the user picked. | BR-04 |
| FR-27 | The purchase form and *This sitting* are the first things on the dashboard, beside or above the overview panels, on desktop and on a phone. (Today's layout is CD-03.) | BR-04, BR-10 |

### Data, backup and reset

| ID | Requirement | Serves |
|---|---|---|
| FR-28 | All data lives in the browser's `localStorage`. If the browser refuses storage, the page says so. | BR-08 |
| FR-29 | A backup can be saved as a downloaded JSON file or copied as compact text. | BR-08 |
| FR-30 | A backup can be restored from a file or pasted text. If the browser already holds records, the user sees both sets of counts and chooses *Merge* (keep what is here, add the copy's records, and overwrite any it shares) or *Replace* (delete everything first). An empty browser restores at once. | BR-08 |
| FR-31 | A backup's shape is checked before anything is written (DC-06). A malformed file is rejected with a message naming the record and the problem. | BR-08 |
| FR-32 | *Reset* deletes every card, purchase, payment, limit group and setting, after showing the counts and asking for confirmation. | BR-08 |
| FR-33 | Every write is awaited and followed by a fresh read from storage. A failed write or read shows a banner naming what failed, with a *Reload* button that reads the data again. | BR-08 |

### Language and presentation

| ID | Requirement | Serves |
|---|---|---|
| FR-34 | The interface is in Thai and English, picked under *Display* in Settings. Switching re-renders in place without losing typed input, and the choice is remembered. With nothing saved, the app follows the first of the browser's languages that it speaks, in the browser's order, else Thai. | BR-09 |
| FR-35 | Dates read `dd MMM yyyy`, zero-padded, with Gregorian years in both languages; amounts read `฿1,234.56` in both. Text the user typed is never translated. | BR-09 |
| FR-36 | The theme is picked under *Display* in Settings: Match device, Light or Dark, remembered per browser. Urgency and limit usage are shown in words as well as colour. Every table stays readable on a phone. | BR-10 |
| FR-37 | Every page's footer shows the commit and build time and links the source and the changelog. A preview deploy marks its title and brand with `(pr-<n>)`. | -- |

## User stories

Each story is followed by its acceptance criteria.

### Paying on time

**US-01 -- See what is due next.** As a bookkeeper, I want one list of what each card owes
next, so that I never miss a due date.
- Each unarchived card appears once, with the oldest closed unpaid statement that has money
  on it, or the open period when nothing is owed.
- Overdue rows say how many days overdue; rows due within 7 days are marked as due soon.
- The list sorts by card, location, closes, due or total.
- *Covers FR-15, FR-36.*

**US-02 -- Mark a statement paid.** As a bookkeeper, I want to mark a statement paid from the
dashboard or the card page, so that the due list and available credit move on.
- Only a closed statement can be marked paid.
- The payment dialog starts at what is left and today, so paying in full is one confirm.
- The first payment freezes the statement's close and due dates.
- Available credit on the card's group rises by exactly the amount paid.
- The card page can unmark each payment.
- *Covers FR-09, FR-14.*

**US-03 -- Trust settled history.** As a bookkeeper, I want a paid statement to keep its dates
when the card's cycle is edited later, so that past reconciliations stay true.
- After a cycle edit, paid statements show the dates they were paid against.
- *Covers FR-14.*

**US-25 -- Pay a statement in parts.** As a bookkeeper, I want to record each payment toward a
statement as it happens, so that a bill paid 40,000 one day and 60,000 another is tracked
exactly.
- Each payment has its own amount and date, and is listed on the card page with its own
  *Unmark*.
- The statement shows what was paid and what is left; it counts as paid once nothing is left.
- *Due next*, the card page's *Next due* and *Owed*, and the group's available credit all use
  what is left.
- Unmarking the last payment returns the statement to unpaid.
- *Covers FR-12, FR-14, FR-15, FR-16.*

### Knowing how much is left

**US-04 -- See room on every card.** As a spender, I want to see how much each card can still
take and when a purchase made today would be due, so that I pick the right card.
- *Can spend now* lists only unarchived cards that can take a purchase.
- Each row shows available out of limit, how much of the limit is used in words and as a bar,
  and the open period's close and due dates.
- A card sharing its limit says how many others share it.
- *Covers FR-11.*

**US-05 -- Share one limit across cards.** As a card administrator, I want several cards on
one account to draw on one limit, so that the room shown is the account's real room.
- Cards pointing at the same group show the same available amount.
- Purchases on any of them, archived ones included, reduce it.
- *Covers FR-08, FR-09, FR-05.*

**US-06 -- Find cards with no limit.** As a card administrator, I want to know which cards have
no limit group, so that I can assign them.
- The dashboard counts them and links to the registry; the card list can filter to "not
  assigned".
- The card form will not save without a group, and its group list is disabled until a group
  exists.
- *Covers FR-06, FR-08, FR-11.*

### Entering receipts

**US-07 -- Enter a pile of receipts quickly.** As a bookkeeper, I want the purchase form always
open and ready for the next receipt, so that I can work through a pile without extra clicks.
- After an add, card and date stay; amount and note clear.
- The confirmation names the statement close date and due date.
- A failed add keeps what I typed and shows why.
- *Covers FR-17, FR-18, FR-23.*

**US-08 -- Pick up where I left off.** As a bookkeeper who gets interrupted, I want to see what
I already entered this sitting, so that I don't skip or double-enter a receipt.
- *This sitting* lists purchases entered since the batch started, latest first, with count and
  total.
- It survives a reload, closing the tab and the next day.
- *Start new batch* needs a second click before it clears the list.
- Purchases saved before entry times were recorded never appear.
- *Covers FR-24.*

**US-09 -- Be warned, not blocked.** As a bookkeeper, I want warnings when a purchase is
unusual, so that I can check it without being stopped from recording it.
- Over the available credit: saved, and the message says by how much and over which limit.
- On the close date: amber warning that the bank may post it on either statement.
- In the future: amber warning, saved anyway.
- *Covers FR-19, FR-20.*

**US-10 -- Fix a purchase.** As a bookkeeper, I want to edit or delete a purchase on the card
page, so that a typo doesn't need delete-and-re-add.
- *Edit* opens the form filled in, titled "Edit purchase", with the card fixed.
- Saving keeps the purchase id and its original entry time; a changed date moves it to the
  right statement.
- Works on archived cards too.
- *Covers FR-21.*

**US-11 -- Control where purchases are entered.** As a card administrator, I want to choose
which places take new purchases, so that cards kept elsewhere can't be picked by mistake.
- Settings lists Bangkok, Phichit and Krabi as checkboxes; Krabi is on by default.
- Only cards in ticked places appear in the purchase form and in *Can spend now*.
- With nothing ticked, the form and Settings say so and say how to fix it.
- *Covers FR-22.*

**US-12 -- Stay correct past midnight.** As a bookkeeper who leaves the tab open, I want the
default date to follow the real day, so that tomorrow's receipts aren't dated yesterday.
- After midnight the default date and the date presets move to the new day.
- A date I picked by hand is left alone.
- *Covers FR-26.*

### Reporting

**US-13 -- Summarise spending over a period.** As a bookkeeper, I want purchases counted and
totalled for a range of dates, so that I can report what was bought then.
- Presets: Today, This week (Monday to Sunday), This month (the default), Last month, Custom.
- Shows count, total and cards used; can filter to one card.
- Filters on purchase date, not entry time; archived cards are included and tagged.
- The detail list opens on request, grouped by day, each card linked.
- *Covers FR-25.*

**US-14 -- Review one card's history.** As a bookkeeper, I want a card's statements with their
purchases, so that I can reconcile against the bank statement.
- Newest first, the current statement marked; quiet months fold into one line.
- The page shows available credit, what is owed and the next due date.
- *Show older statements* pages further back, 12 periods at a time.
- *Covers FR-12, FR-16.*

### Managing cards

**US-15 -- Register a card.** As a card administrator, I want to add a card with its cycle,
location, group and holder, so that its statements are worked out for me.
- Id must be unique and cannot change after saving; last 4 must be four digits.
- Cycle is either "due N days after closing" or "due on a fixed day".
- A supplementary card asks for its own cardholder.
- *Covers FR-01 to FR-04.*

**US-16 -- Find a card fast.** As a card administrator, I want to search, filter and sort the
card list, so that I can find a card among many.
- Search matches name, id, last 4 and comment.
- Filters: cardholder, location, limit group (including not assigned).
- The view is kept in the address, so a reload or shared link keeps it.
- *Covers FR-06.*

**US-17 -- Retire a card.** As a card administrator, I want to archive a card, so that it leaves
daily views but keeps its history.
- Archived cards leave the dashboard and purchase form, appear in an "Archived (N)" list, and
  still count against their group.
- Unarchive brings one back. Delete is offered only for a card with no purchases.
- *Covers FR-05.*

**US-18 -- Keep the registry tidy.** As a card administrator, I want to add and edit cards and
groups without the page growing, and fold the lists I am not using, so that the registry stays
short on a phone.
- Add and Edit open a dialog; a failed save keeps the dialog open.
- Each list remembers whether I left it open.
- From a card's page, *Edit card* opens its dialog in the registry.
- *Covers FR-07, FR-38.*

### Data safety

**US-19 -- Back up my data.** As a bookkeeper, I want to save a copy of everything as a file or
as text, so that clearing the browser doesn't lose my records.
- *Download file* saves indented JSON named `cc-tracking-<date>.json`; *Copy text* puts compact
  JSON on the clipboard.
- The copy button is hidden where the browser can't write the clipboard.
- *Covers FR-28, FR-29.*

**US-20 -- Restore or move my data.** As a bookkeeper, I want to restore a copy from a file or
pasted text, choosing to merge or replace, so that I can move between browsers safely.
- If the browser already has records, I see both sets of counts and choose Merge or Replace.
- Replace is shown as the dangerous choice.
- A malformed copy is rejected before anything is written, naming the record and the problem.
- *Covers FR-30, FR-31.*

**US-21 -- Start over.** As a bookkeeper, I want to delete all data after a clear confirmation,
so that I can start clean.
- The confirmation shows how many of each record will go.
- My language and theme are kept.
- *Covers FR-32.*

**US-22 -- Know when a save failed.** As a bookkeeper, I want a clear error when a write fails,
so that I never think something saved when it didn't.
- The banner names what failed and stays after the page re-reads its data.
- *Covers FR-28, FR-33.*

### Language and devices

**US-23 -- Use the app in Thai or English.** As any user, I want to pick my language in
Settings without losing what I typed, so that I can work in the language I read best.
- The choice is remembered. Dates use Gregorian years in both languages so they match bank
  statements. My own notes and names are never translated.
- *Covers FR-34, FR-35.*

**US-24 -- Use the app on a phone.** As a spender, I want the app usable on a phone, so that I
can check room before buying.
- Panels stack, every table stays readable at phone width, and the theme follows the device
  unless I pick Light or Dark.
- *Covers FR-27, FR-36.*

## Domain rules

The exact rules behind every number the app shows. Each is covered by tests next to the code
in `src/lib/domain/`; a refactor should keep those tests passing unchanged.

| ID | Rule |
|---|---|
| DR-01 | **Money** is stored as whole satang (1 baht = 100 satang). Typed amounts take digits with up to two decimals, commas ignored, and must be above zero; limits follow the same rule. Shown as `฿1,234.56` in both languages. |
| DR-02 | **Dates** are plain `YYYY-MM-DD` strings in Asia/Bangkok. Reading the clock to get today is the only place a time zone enters; all date arithmetic uses `Date.UTC` and `getUTC*`, never local-time `Date`. |
| DR-03 | **A statement period** is named `YYYY-MM` after the month its close date falls in, and runs from the day after the previous close to the close date, inclusive. A purchase on the close date belongs to that statement, not the next. |
| DR-04 | **Due dates.** *Offset*: close date plus N days. *Fixed*: day M of the month; if M is not later than the close day, the due date is in the next month. A close or due day past the end of a month becomes its last day. |
| DR-05 | **Statements are derived on read.** Only payments are stored, one record per card and period, holding every part paid toward that statement (DR-28). The first part freezes the close and due dates; later parts keep them. |
| DR-06 | **What is due next** for a card: walking from the period of its earliest purchase up to the open period, the first closed statement that is unpaid and has a total above zero; if there is none, the open period. |
| DR-07 | **Urgency**, in order: *future* while today is on or before the close date; *open* if paid or the total is zero; *overdue* once past the due date; *soon* within 7 days of it; otherwise *open*. A period with no spending can never be overdue. A *future* statement cannot be marked paid. |
| DR-08 | **The open period** is the statement a purchase made today would land on. The card page marks it *Current*. |
| DR-09 | **Available credit** for a group is its limit less, on every card in the group (archived ones included), what is left on each closed statement plus the whole of the open period. The open period counts in full even if stored data holds a payment against it. It can go below zero. Each payment gives back exactly its amount. |
| DR-10 | **Can spend now** shows the open period's close and due dates (DR-08), not what is due next (DR-06). On a card with an overdue statement the two differ, and both are right for their question. |
| DR-11 | **Over-limit note.** Adding a purchase above the available credit saves it and names the amount over and the group. Editing a purchase never shows the note, because available credit already counts the old amount. |
| DR-12 | **Who can take a purchase**: an unarchived card whose location is in the Settings list. The default list is Krabi only. An empty list is a real answer (nobody can), not "unset". |
| DR-13 | **Owners.** A group's account holder is KC, NT or RI; a missing or unknown value reads as KC. A card's cardholder is its own owner if it is supplementary, otherwise its group's account holder, otherwise nobody (no group). A group is labelled `Name (OWNER)`, untranslated. |
| DR-14 | **Locations** are `bangkok`, `phichit` and `krabi`; the default is `bangkok`. |
| DR-15 | **Entry time** (`addedAt`) is set when a purchase is first saved, from the dashboard or the card page, and an edit keeps it. Purchases saved before 2026-10-27 have none and are never backfilled. |
| DR-16 | ***This sitting*** holds purchases whose entry time is at or after the batch start, latest entered first. On the very first load the batch start is set to that moment, so the list starts empty. |
| DR-17 | **Date ranges** filter on the purchase date, not the entry time. Weeks run Monday to Sunday. The default preset is This month. A custom range typed backwards is turned the right way round. Within a day, the latest entered comes first. |
| DR-18 | **Card page history** counts back from the later of the open period and the period of the latest purchase, so a future-dated purchase still has a statement to edit it from. |
| DR-19 | **Identity and deletion.** A card id is unique and never changes. A card can be deleted only while it has no purchases (otherwise archive it). A group can be deleted only while no card uses it. (The UI enforces both; see DC-13.) |
| DR-20 | **Not assigned** means an unarchived card with no group, or with a group id that matches no group. The card form requires a group. A not-assigned card is left out of *Can spend now* until it is given one. |
| DR-21 | **Card page paging**: 12 periods are shown, and *Show older statements* adds 12 more. |
| DR-22 | **Quiet months**: consecutive statements that are closed, empty and unpaid fold into one line. The open period and a paid empty statement never fold (one is where the next purchase lands; the other's payment can still be undone). A statement with purchases starts expanded. |
| DR-23 | **Usage**: the share of the limit used, clamped to 0--100%. Amber from 80%; red only when used is greater than the limit. A zero limit reads as full once anything is spent. |
| DR-24 | **"Shared with N more"** counts every other card in the group, archived ones included. |
| DR-25 | **Cycle inputs**: close day and due day 1 to 31, days until due 1 to 60. |
| DR-26 | **Last 4** is exactly four digits in the card form. |
| DR-27 | **Relative dates** in *Can spend now* read "today", "in N days" or "N days ago". A past date there is never called overdue; overdue is the due list's word. |
| DR-28 | **Payments in parts.** A statement's paid amount is the sum of its parts; what is left is the total less that, never below zero, so paying more than is left is accepted and leaves nothing owed. A statement is paid when a payment record exists and nothing is left. A partly paid statement is unpaid for DR-06 and DR-07, so it stays due and can become overdue. |
| DR-29 | **Old payment records.** A record without `parts` (saved before 2026-10-28) reads as one part for the statement's whole total, dated its `paidAt`. |
| DR-30 | **Part order and undo.** Parts are kept oldest first, and the record's `paidAt` is the latest part's date. Unmarking removes one part; removing the last one deletes the record. |
| DR-31 | **Payment input.** The amount follows DR-01 (above zero, up to two decimals); the date must be a real date. |

## Data contracts

What existing browsers, backup files and links already contain. A refactor that changes any of
these needs a migration, or it loses or misreads someone's data.

| ID | Contract |
|---|---|
| DC-01 | **Repository.** Storage is reached only through the `Repository` interface, made of key lookups and prefix scans. Every implementation must pass the shared contract suite (`src/lib/storage/contract.ts`). `src/lib/domain` imports nothing from storage or the interface, and components get data as properties and send events; none imports `#lib/storage`. |
| DC-02 | **Record keys** in `localStorage`: `cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, `cc:payment:<cardId>:<period>`, `cc:limitgroup:<id>`. Each segment is `encodeURIComponent`-encoded. Deleting a card scans `<encoded id>:` with the trailing colon, so it never touches a card whose id merely starts with the same text. |
| DC-03 | **Other keys**: `cc:settings`, `cc:batch-start` (start of *This sitting*, an ISO instant), `cc:lang` (`en` or `th`), `cc:theme` (theme pick), `cc:panel:<name>` (`open` or `closed`, for `range`, `due`, `spendable`, `cards`, `cards-archived`, `limit-groups`), `cc:migration:location` (cards reset by the location migration), `cc:probe` (storage check at startup). A failed read or write of language, theme or panel state falls back to the default and never breaks the page. |
| DC-04 | **Reset** removes cards, purchases, payments, limit groups, settings, the batch start and any pending migration notice. It keeps language, theme and panel state, so the page doesn't change under the reader. |
| DC-05 | **Backup format**, version 2: `{ version: 2, exportedAt, limitGroups, cards, purchases, payments, settings? }`. `settings` is optional, and a file without it leaves stored settings alone. The batch start, language, theme and panel state are never in a backup. A file of any other version is rejected. The download is named `cc-tracking-<exportedAt date>.json`. |
| DC-06 | **Restore checks shapes only**: valid JSON, version 2, the four lists present; each record an object; ids, names, `last4` and `cardId` present; location and owner in their closed sets; cycle kind known with whole-number days; dates valid `YYYY-MM-DD`; amounts and limits whole numbers; `addedAt` a valid instant if present; a payment's `parts`, if present, a non-empty list of valid dates and whole-satang amounts above zero. It does not check ranges (a zero amount or a day of 40 passes), `limitGroupId`, `archived`, `comment` or `supplementary`. Unknown places inside `settings` are dropped, and a `settings` that is not an object is ignored. Restore then writes groups, cards, purchases and payments in that order. It is not atomic. A card whose group is not in the file is still imported. |
| DC-07 | **Record shapes** (`src/lib/domain/types.ts`): `Card { id, name, last4, location, cycle, comment?, archived, supplementary?, owner?, limitGroupId? }`; `CycleRule` is `{ kind: "offset", closeDay, dueOffsetDays }` or `{ kind: "fixed", closeDay, dueDay }`; `Purchase { id, cardId, date, amount, note, addedAt? }`; `StatementPayment { cardId, period, paidAt, closeDate, dueDate, parts? }` with `PaymentPart { paidAt, amount }`; `LimitGroup { id, name, limit, owner? }`. Purchase and group ids are random UUIDs. Amounts and limits are satang. |
| DC-08 | **Settings record** `cc:settings` is `{ purchaseLocations: Location[] }`. An empty list is kept as written; a missing or garbled record falls back to `["krabi"]`. |
| DC-09 | **Stale fields.** Cards stored before 2026-09-24 carry an `owner` from when the owner was on the card; `Card.owner` is read only when `supplementary` is set, so those values are ignored. Some cards carry a per-card purchase flag from before purchase places moved to Settings; nothing reads it. Keep both guards, and don't reuse those field names for something else. |
| DC-10 | **Location migration** runs at every startup, is safe to run twice, resets unknown locations to Bangkok, and records which cards it reset for a one-time notice. A failure on one card does not stop the page loading. |
| DC-11 | **Build stamps.** `BUN_PUBLIC_COMMIT_SHA`, `BUN_PUBLIC_BUILT_AT` and `BUN_PUBLIC_PR_NUMBER` are stamped at build time. `BUN_PUBLIC_PR_NUMBER` is always set, empty outside previews, because an unset one is left as a `process.env` read that throws in the browser. |
| DC-12 | **Purchase keys contain the date.** Saving a purchase first removes any key with the same card and id under any date, so an edit that changes the date moves the record rather than copying it. |
| DC-13 | **Repository deletes don't guard.** `deleteCard` also deletes the card's purchases and payments; `deleteLimitGroup` checks nothing. The "no purchases" and "no cards" rules (DR-19) live in the interface only. A redesign must keep them there or move them down, not drop them. |
| DC-14 | **Stored order.** Cards and groups are listed in key order (by encoded id). The *Saved order* sort shows exactly that. |
| DC-15 | **Address query** on `/cards`, which shared links depend on: cards `q`, `owner`, `loc`, `group` (a group id or `none`), `sort`, `dir`; groups `gq`, `gowner`, `gsort`, `gdir`. Defaults are left out. The address is replaced, not pushed, so typing doesn't fill the Back history. |
| DC-16 | **Deep link** `/cards?edit=<id>` opens that card's edit dialog. It is read on first load only, and an unknown id is ignored. |
| DC-17 | **Old address.** `/backup` redirects to `/settings`. Keep a redirect for any page address a redesign retires. |

## Interface rules

Rules that hold whatever the screens look like.

| ID | Rule |
|---|---|
| UI-01 | **One source for values.** Colours, spacing, type and shape live once in `src/styles/tokens.css`. Component styles reference them only through `var(--cc-*)`. The dark theme overrides colour tokens only; sizes and spacing are the same in both. The dark palette is written twice (for a dark device and for an explicit Dark pick), and a test fails if the copies drift. |
| UI-02 | **Three button variants**: primary (no attribute), `data-variant="quiet"` and `data-variant="danger"`. No fourth. |
| UI-03 | **Both languages, always.** Every piece of interface text comes from the catalog, in both `en.ts` and `th.ts`; a test enforces it. Errors are kept as a message key and parameters, so a language switch re-translates an error already showing. Errors that only reach the console stay in English. |
| UI-04 | **Never select by translated text.** Styles and tests select by class, `data-field`, `data-action`, `data-testid` and other locale-free attributes. |
| UI-05 | **No `Intl` for dates.** A Thai locale would print Buddhist Era years. Dates are formatted by hand as `dd MMM yyyy`, zero-padded so a column lines up, with Gregorian years. |
| UI-06 | **Thai needs room.** Line height stays at least `1.65` so Thai vowel and tone marks are not clipped. The font stack lists system and Thai faces; there are no web fonts. The page sets `<html lang>` on load and on every switch. |
| UI-07 | **Never colour alone.** Urgency, limit usage and warnings always carry words as well as colour. |
| UI-08 | **Warnings don't block.** Unusual input (over limit, close date, future date) is saved and warned about in amber. Only invalid input (no card, an impossible date, a non-amount) is refused. |
| UI-09 | **Dangerous actions explain themselves and ask twice.** Replace, Reset and Start new batch each state their consequence and need a second, deliberate step. A dangerous choice uses the danger variant; the safe choice is the primary one. |
| UI-10 | **Don't offer what can't work.** Copy and paste buttons are hidden where the browser lacks the clipboard call they need. The card page hides Add purchase on a card that can't take one. The group list in the card form is disabled while no group exists. |
| UI-11 | **Saves are honest.** Writes are awaited, never shown ahead of time. A failed write keeps typed input, and its message survives the reload that follows. |
| UI-12 | **Switching language loses nothing.** The page re-renders in place; open forms keep what was typed. |
| UI-13 | **User text is never translated.** Card names, comments and purchase notes appear as typed. |
| UI-14 | **Cards are named the same way everywhere.** Panels show `id)` and the name, linked to the card page with the id URL-encoded. Pickers show `id — Name`. The last 4 digits appear only in the registry and on the card page heading (`id · ••••1234`). |
| UI-15 | **Empty states name the next step**, for example "Add one on the Cards page". |
| UI-16 | **Keyboard focus is always visible**, with a ring from `--cc-focus-ring`. |
| UI-17 | **Numbers line up.** Numeric cells carry `data-numeric`: right-aligned, tabular figures. On a phone, tables become stacked rows using each cell's `data-label`, from the same markup. |
| UI-18 | **The reset's `div` convention.** `@kcstyles/reset.css` makes every `div` a flex column, with `<div row>` and `<div block>` as the alternatives, and the shared shadow styles copy it. Dropping or swapping the reset changes every layout `div`. |
| UI-19 | **Phone safe areas.** The page shell pads for `env(safe-area-inset-*)`. |
| UI-20 | **A preview is marked.** A preview deploy adds `(pr-<n>)` to the title and brand, so it can't be mistaken for production. |
| UI-21 | **Appearance is checked by eye.** happy-dom computes no styles, so layout and colour are checked with screenshots at 390px and 1280px, in English and Thai, light and dark. |

## Decisions

Choices made along the way, with the reason and what was rejected. Revisit one only on purpose.

| ID | Decision | Why | Rejected |
|---|---|---|---|
| DD-01 | Statements are computed, never stored; only payments are. | One source of truth, no generation job. The app must work out when a bill closes and is due, not record what it is told. Storing them later would be an additive change. | A stored statement per card per month; entering statements by hand. |
| DD-02 | A payment freezes its close and due dates. | Editing a cycle must not rewrite paid history. | Recomputing paid statements from the current cycle. |
| DD-03 | Data lives in the browser's `localStorage`. | The data is small, and neither Bun nor happy-dom provides IndexedDB for tests. | IndexedDB; a server (a Worker with KV was built in September and later removed). |
| DD-04 | Every unpaid baht counts against the limit, including the open period. | Counting only closed statements shows more room than the card really has. | Counting closed statements only. |
| DD-05 | Every card belongs to exactly one limit group. | The sum is always per group; a lone card is a group of one. | Limits on cards, with sharing as a special case. |
| DD-06 | Over-limit, close-date and future-date purchases are saved with a warning. | The app records what happened, and a stored limit can be out of date. A close-date purchase is valid, only its statement is uncertain; a future date can be a booking or instalment. | Refusing the entry. |
| DD-07 | *Retired 2026-10-28, replaced by DD-37.* A payment recorded no amount and settled the whole statement. | Kept the model simple. | Recording a paid amount. |
| DD-08 | The account holder is on the limit group, not the card; a supplementary card has its own cardholder. | A group stands for a bank account, and two cards on one account can't name different owners. A บัตรเสริม is the exception. | Owner on every card. |
| DD-09 | A group without an owner reads as KC; no migration. | Copying each card's owner up to its group would need a rule for cards that disagree. | Migrating owners from cards. |
| DD-10 | Purchase eligibility is set per place in Settings, default Krabi. | Purchases were only ever entered against the Krabi cards, and a place rule needs no edit per card. | A checkbox on each card (shipped, then replaced). |
| DD-11 | Locations and owners are closed lists. | The stored key stays display-neutral and translatable; a typo can't create a new place. | Free text with suggestions. |
| DD-12 | Unknown locations are fixed once at startup, not coerced on every read. | Read-time coercion would make the type lie about what is stored and quietly fix the same rows forever. | Coercing on read. |
| DD-13 | No migration invents a group for an old card; it shows as not assigned until assigned by hand. | Any invented group would be a guess about which cards share a limit. | Creating a group per card automatically. |
| DD-14 | Stale stored fields (old `owner`, old per-card purchase flag) stay on disk. | An unread key costs nothing, and rewriting every card risks a write failure for no gain. | Stripping them in a migration. |
| DD-15 | Backups stay at version 2; new optional fields don't bump it. | A bump would reject every backup already saved. | Bumping on each new field. |
| DD-16 | Restore keeps a card whose group is not in the file. | The group may already exist in the target browser. | Rejecting or dropping such cards. |
| DD-17 | Restoring into a browser that holds records asks Merge or Replace; an empty browser restores at once. | Nobody should wipe data without reading what the button does. Settings alone don't count as records. | Always merging; always asking. |
| DD-18 | Moving data between deploys (preview to production) is copy and paste. | Storage is per origin, and an iframe gets partitioned storage. | A popup and `postMessage` bridge. |
| DD-19 | Limit groups live on the registry page, edited through the same dialog pattern as cards. | They belong to the registry and are rarely edited, so no fourth page; one editing pattern per page. | A separate limit groups page; inline editing in table rows. |
| DD-20 | The dashboard is a workspace for entering receipts: the form is always open and *This sitting* lists the current batch. | The bookkeeper works through a pile and is often interrupted; the list is how they find their place. | A dialog per purchase; a separate purchases page. |
| DD-21 | *This sitting* survives reloads and the next day, clears only on a confirmed *Start new batch*, and is read-only. | Losing it to a reload or a stray click is exactly the failure it exists to prevent. Editing stays on the card page. | Clearing on reload; edit or undo in the list. |
| DD-22 | The batch start is per browser and stays out of backups. | It is working state, not a record. | Storing it in Settings. |
| DD-23 | After an add, the form keeps the card and date and clears amount and note. | Receipts come in runs from one card or one day. | Clearing everything. |
| DD-24 | Ranges filter on purchase date, and archived cards count (tagged). | A range answers "what was bought then"; archiving later must not change it. | Filtering on entry time; hiding archived cards. |
| DD-25 | Old purchases get no entry time. | A guessed time would put them in the wrong batch. | Backfilling. |
| DD-26 | With no saved choice, the language is the browser's first supported one, else Thai. | Thai company cards, baht, Bangkok dates: Thai is the likely daily language, but a browser that prefers English should get it. | Thai always; any English entry winning. |
| DD-27 | Language and theme are kept in browser storage, outside the repository and backups. | They must apply before any data loads, and they belong to the reader, not the records. | Storing them in Settings. |
| DD-28 | The theme is applied by the page script, not an inline `<head>` script. | Simpler; a brief flash of the wrong theme on load is accepted for now. | An inline head script. |
| DD-29 | A hand-written translation catalog; switching re-renders in place. | `@lit/localize` needs an extraction tool and XLIFF files, too much for two languages. A reload would lose half-filled forms. | `@lit/localize`; reloading on switch. |
| DD-30 | Thai sorting uses code-unit order. | `Intl.Collator` on `th-TH` risks the Buddhist Era handling dates avoid; today's locations sort the same either way. | `Intl.Collator`. |
| DD-31 | Components use shadow DOM with shared style modules built on tokens; `@kcstyles/reset.css` replaces Pico. | Document styles never reached inside shadow roots, so most components were unstyled. | One shared stylesheet pushed into every shadow root; rendering into the light DOM. |
| DD-32 | Teal accent on warm neutrals. | Teal stays clearly apart from the danger red and warning amber beside it. | The earlier cool grey and blue. |
| DD-33 | The usage bar measures everything unpaid against the limit and reads "of the limit used". | It matches the figure *Can spend now* already shows. | "Used this cycle". |
| DD-34 | Dashboard panels start sorted by soonest close date, and their sort resets on reload. | One shared default; panels have no saved order. The cards page keeps its view in the address instead. | Saving panel sort; most room first. |
| DD-35 | The footer's changelog link points at `main`, not the built commit. | An old deploy still points readers at the latest entries. | Linking the built commit. |
| DD-36 | "Cardholder" (หน้าบัตร) names the person on a card; "Account holder" (เจ้าของบัตร) names a group's owner. | Both used to read "Owner", which didn't tell them apart. | One word for both. |
| DD-37 | Partial payments are parts inside the one payment record per card and period, not separate records. | The storage key and the backup's `payments` list stay unchanged, and an old record reads as one full payment, so no migration. | A separate record per payment, with its own id. |
| DD-38 | The first payment freezes the statement's dates; later payments keep them. | Settled history must not move once anything is paid against it (DD-02). | Re-freezing on each payment. |

## Out of scope

Not built, on purpose. Adding any of these is a new decision.

- Personal spending; this tracks company purchases only.
- Charts, budgets, receipt uploads, bank statement import, notifications, splitting personal
  and company spending, multi-currency.
- Interest, fees and minimum payments; different limits for cards inside one shared group;
  a history of limit changes.
- Adding or renaming locations or owners in the interface; a third language.
- Edit, delete or undo in *This sitting*.

## Current design

How the site looks and is arranged today. All of it may change in a redesign; it is listed so
that each change is a choice.

| ID | Today |
|---|---|
| CD-01 | **Pages**: `/` dashboard, `/cards` registry and limit groups, `/card?id=<id>` one card, `/settings` display, purchase places, backup and reset. Nav: Dashboard, Cards, Settings. (Keep redirects, DC-17.) |
| CD-02 | **Page shell**: sticky header with an accent mark, the brand and pill-tab nav with the current page filled; content up to `72rem` wide; footer with source, changelog, commit and build time. |
| CD-03 | **Dashboard layout**: at 960px and wider, two columns, the purchase form and *This sitting* on the narrower left and *Purchases by date*, *Due next* and *Can spend now* on the right. Narrower, one column in that order. The "lands on" confirmation sits above both columns. |
| CD-04 | **Purchase entry**: always-open form on the dashboard; a dialog on the card page for adding and editing. |
| CD-05 | ***This sitting*** columns: added, card, bought, amount. *Start new batch* turns into a confirm and Keep pair in place. |
| CD-06 | ***Purchases by date***: preset chips, from and to dates, a card filter, three summary tiles (purchases, total, cards used) that wrap on a phone, and a folded list grouped by day. |
| CD-07 | **Lists**: tables with sortable headings; below 640px they become stacked rows with a sort chip. Filters are pill chips with "Any". |
| CD-08 | ***Due next***: a coloured left rule and text badge per urgency. ***Can spend now***: a usage bar under each available amount. |
| CD-09 | **Registry page**: Add a card and Add limit group buttons open dialogs; the card list (open by default) with an archived list inside it (folded), and the limit group list (folded). |
| CD-10 | **Card page**: summary (available, owed, next due), then statements newest first, with a *Current* badge and an accent left rule, quiet months folded into one line, Edit and Delete per purchase, payment rows in the same columns as purchases with their own *Unmark*, and a *Left to pay* row; what is left also sits under the month's total. |
| CD-11 | **Settings page**: Display (language and theme), Purchases (place checkboxes), Backup split into *Save a copy* and *Restore a copy* side by side from 640px, then Reset. |
| CD-12 | **Look**: warm paper neutrals, teal accent, soft corners and shadows. |
| CD-13 | **Payments**: *Mark paid* opens a dialog with the balance ("paid · left"), the date paid and the amount. |

## Retired

Removed on purpose; listed so a redesign doesn't think they were lost.

- The dashboard's *Cards by location* panel.
- A per-card *Can be used for new purchases* checkbox, replaced by purchase places in
  Settings (DD-10).
- The language switch in the header (`cc-lang-switch`), replaced by *Display* in Settings.
- Folding add and edit forms on the registry page, replaced by dialogs.
- The dashboard's Add a purchase dialog, replaced by the always-open form.
- Pico CSS, replaced by `@kcstyles/reset.css` and tokens (DD-31).
- The Cloudflare Worker with KV storage behind Cloudflare Access; the site is now static pages
  only.
- Backup format version 1.
- *Mark paid* as one click that settled the whole statement, replaced by the payment dialog and
  partial payments (DD-37).

## Acceptance criteria for the redesign

The redesign is done when all of these hold.

- [ ] The open questions it depends on are answered and recorded here.
- [ ] Every user story (US-01 to US-25) can be walked through in the new design.
- [ ] Every functional requirement is still met, or is retired here with a reason.
- [ ] Domain rule tests in `src/lib/domain/` pass without changing what they expect.
- [ ] The storage contract suite passes, and data saved by the current version loads unchanged.
- [ ] A version 2 backup from the current version restores, with and without `settings`, and
      with payments both with and without `parts`.
- [ ] `/cards` links with a query and `/cards?edit=<id>` still open the same view.
- [ ] The delete guards in DR-19 still hold (DC-13).
- [ ] Every interface rule (UI-01 to UI-21) holds, checked in English and Thai, light and dark,
      at phone and desktop widths.
- [ ] Each decision that changed has a dated entry in `CHANGELOG.md` saying what replaced it
      and why, and is updated here.
- [ ] Retired page addresses redirect.
- [ ] Entering ten receipts in a row on the dashboard takes no more steps than today (G3):
      pick card and date once, then amount, note and add for each.
- [ ] The user has walked the main flows on the preview, on a phone and a desktop, and
      approved them.

## Constraints and known limits

- **Single browser.** Data is not shared between browsers or people; moving it means a backup.
  There are no accounts.
- **Storage cap.** Browsers allow `localStorage` about 5 MB per site, and a full store only shows
  up as a failed save.
- **No overpayment record.** Paying more than is left is accepted, but the extra is not kept as
  credit toward the next statement.
- **Shared limits depend on every card.** A group's room is only as right as the payments
  marked on every card in it; one card left unmarked understates the room on all of them.
- **Fixed sets.** Locations (Bangkok, Phichit, Krabi) and owners (KC, NT, RI) are closed lists
  in the code.
- **Backup version 2 only.** Older backups are rejected.
- **Restore is shallow and not atomic.** It checks shapes, not ranges (DC-06), and a failure
  partway can leave some records restored.
- **Theme flash.** A saved theme that differs from the device can flash briefly on load.
- **Thai sorting** uses code-unit order, not Thai collation; it matches for today's locations.
- **Small data.** Pages load every card and purchase; fine at today's size, worth revisiting if
  it grows.

## Risks

| Risk | What protects against it |
|---|---|
| A layout change quietly changes a number (what's due, how much is left). | Domain rules live in `src/lib/domain/` with tests; keep them unchanged (DR). |
| A refactor renames a storage key or field, and existing data stops loading. | Data contracts (DC) and the storage contract suite; migrate on purpose or not at all. |
| Old backups stop restoring. | DC-05, DC-06 and DD-15; test a current backup against the new build. |
| A shared link or the card page's *Edit card* breaks. | DC-15 and DC-16. |
| Removing a delete button's condition lets a card with purchases be deleted, taking them with it. | DR-19 and DC-13; the storage layer does not guard. |
| Thai is broken or untranslated in a new screen. | UI-03 to UI-06; the catalog coverage test; screenshots in Thai. |
| A redesign hides *This sitting* or slows entry, and the bookkeeper loses their place. | G3, DD-20, DD-21. |
| A refactor drops the reading of old payment records without `parts`, and paid statements turn unpaid. | DR-29; the domain tests cover old records. |
| Something is dropped because no one knew it existed. | This document; the [Retired](#retired) list says what was removed on purpose. |

## Open questions

To settle with the user before the redesign is planned. Record each answer here, and move it
into the matching section.

1. **What hurts today?** Which flows feel slow, confusing or out of order, on a phone and on a
   desktop? This needs the user's own walk-through of each page.
2. **What else is driving the redesign** besides the flows and the code: the look, phone use,
   or something new?
3. **Pages.** Keep four pages (dashboard, cards, one card, settings), or reorganise? For
   example, should paying statements, entering receipts and checking room be separate places?
4. **Entering receipts.** Should the purchase form stay always open on the dashboard, and the
   card page keep its own dialog? Should *This sitting* allow edit or delete (today it is
   read-only by decision DD-21)?
5. **Phone first?** Which tasks must be fastest on a phone: checking room before buying,
   entering receipts, or marking paid?
6. **Look.** Keep the warm neutrals and teal accent from 2026-10-27 (DD-32), or start again?
7. **Refactor depth.** Keep Lit web components and the current folder split, or change the
   stack? Is a framework change on the table?
8. **Theme flash.** Fix the brief flash of the wrong theme on load (DD-28) as part of this work?
9. **Restore checks.** Should restore start checking ranges (DC-06), now that the code is being
   reworked anyway?
10. **Delete guards.** Move the "no purchases" and "no cards" checks into the storage layer
    (DC-13)?

## Future work

Not part of this redesign.

- Show how much browser storage the app uses: a bar of bytes used against the cap on the
  settings page, split by kind (tracked in [`TODO.md`](TODO.md)).
- Shared storage across devices.
- Staff accounts. The earlier design expected sign-in through Cloudflare Access and a
  "recorded by" field on each purchase.

## Glossary

| Term | Thai on screen | Meaning |
|---|---|---|
| Card | บัตร | A physical company credit card, identified by an id the user picks. |
| Supplementary card | บัตรเสริม | A card issued on someone else's account, with its own cardholder. |
| Cardholder | หน้าบัตร | The person on the card (DR-13). |
| Account holder | เจ้าของบัตร | The owner of a limit group's account: KC, NT or RI. |
| Location | ที่อยู่ | Where a card is kept: Bangkok, Phichit or Krabi. |
| Limit group | กลุ่มวงเงิน | A pool of credit one or more cards draw on. |
| Available | คงเหลือ | A group's limit less everything unpaid (DR-09). |
| Billing cycle | รอบบิล | A card's rule for its close and due dates (DR-04). |
| Statement | ใบแจ้งยอด | One period's purchases on one card, worked out from the cycle (DR-03, DR-05). |
| Period | รอบ | A statement's month, `YYYY-MM`, named after its close date. |
| Close date | วันสรุปยอด | The last day of a statement period. |
| Due date | วันครบกำหนด | When a statement must be paid. |
| Open period | รอบปัจจุบัน | The statement a purchase made today lands on (DR-08); marked *Current*. |
| Due next | ครบกำหนดถัดไป | The statement that needs paying next on a card (DR-06). |
| Mark paid | บันทึกว่าชำระแล้ว | Record a payment toward a closed statement; it is paid once payments cover the total (DR-28). |
| Payment part | ชำระเงิน | One payment toward a statement: an amount and the date paid. |
| Left to pay | ยอดคงเหลือ | A statement's total less what was paid, never below zero (DR-28). |
| Unmark | ยกเลิกชำระ | Remove one payment from a statement (DR-30). |
| Archived | เก็บเข้าคลัง | A retired card: hidden from daily views, history kept, still counts against its group. |
| Purchase places | ที่ที่บันทึกรายการใหม่ได้ | The locations whose cards can take a new purchase (DR-12). |
| This sitting | รอบนี้ | Purchases entered since *Start new batch* was last pressed (DR-16). |
| Batch start | เวลาเริ่มรอบ | When the current sitting began. |
| Entry time | เวลาที่เพิ่ม | When a purchase was first entered (`addedAt`), as opposed to its purchase date. |
| Satang | สตางค์ | 1/100 baht; how money is stored (DR-01). |
