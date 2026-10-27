# Features

What cc-tracking does, the rules it follows and the decisions behind them, covering every
feature shipped up to 2026-10-27. It is the reference for refactoring or redesigning the site:
whatever the new code and screens look like, nothing listed here should be lost by accident.
[`CHANGELOG.md`](CHANGELOG.md) records when each feature shipped; [`README.md`](README.md)
explains how statements, limits and storage work. A Thai translation is in
[`FEATURES_TH.md`](FEATURES_TH.md).

## How to use this document

| Section | IDs | In a redesign |
|---|---|---|
| [Business requirements](#business-requirements) | BR | Keep. These are why the app exists. |
| [Functional requirements](#functional-requirements) | FR | Keep the behaviour. Where and how it is shown may change. |
| [User stories](#user-stories) | US | Walk every story through the new design before building it. |
| [Domain rules](#domain-rules) | DR | Keep exactly. Changing one changes the numbers people rely on. |
| [Data contracts](#data-contracts) | DC | Keep, or migrate on purpose. Existing browsers and backups depend on them. |
| [Interface rules](#interface-rules) | UI | Keep. They hold whatever the layout. |
| [Decisions](#decisions) | DD | Change only on purpose, after reading the reason and the rejected options. |
| [Current design](#current-design) | CD | Free to change. Listed so a change is a choice, not an accident. |

Before a redesign ships, go through the [redesign checklist](#redesign-checklist).

IDs are stable: add new ones at the end of their list rather than renumbering, and mark a
retired one as retired rather than deleting it. Each functional requirement names the business
requirements it serves, and each user story names the functional requirements it covers.

## Context

A small business holds a set of company credit cards. The cards are kept in three places
(Bangkok, Phichit and Krabi), belong to accounts held by three people (KC, NT and RI), and
some accounts share one credit limit across several physical cards. Receipts pile up and are
entered later, in batches. The app has to answer three questions at any moment: what must be
paid and by when, how much can still be spent on each card, and which statement a given
purchase lands on.

### People

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
| FR-02 | Location is one of Bangkok, Phichit or Krabi, chosen from a list. A stored location the app does not recognise is reset to Bangkok once at startup, and `/cards` names the reset cards once, with a Dismiss button. | BR-05 |
| FR-03 | A billing cycle is either *closes on day N, due M days later* (M from 1 to 60) or *closes on day N, due on day M* (days 1 to 31). A due day not later than the close day falls in the next month. A day past the end of a month is clamped to its last day. | BR-03, BR-05 |
| FR-04 | A card may be marked supplementary (บัตรเสริม) with its own cardholder. Otherwise the cardholder is the account holder of its limit group. | BR-05 |
| FR-05 | A card can be edited, archived or unarchived, and deleted only while it has no purchases. Archived cards leave the dashboard and the purchase form but keep their history and still count against their group's limit. | BR-05, BR-02 |
| FR-06 | The card list can be searched (name, id, last 4, comment), filtered by cardholder, location and limit group (including "not assigned"), and sorted by name, location, group or close day from the column headings or a sort chip. The view is kept in the address. | BR-05 |
| FR-07 | Long sections can be folded so the registry stays short on a phone. Lists start open; forms start closed and open when an edit starts. A section the user closed is not reopened by a refresh of its data. | BR-10 |

### Limit groups and spendable credit

| ID | Requirement | Serves |
|---|---|---|
| FR-08 | A limit group has a name, a credit limit in baht and an account holder (KC, NT or RI). Every card must point at one group; a card on its own is a group of one. A group can be deleted only while no card uses it. | BR-02, BR-05 |
| FR-09 | A group's available credit is its limit less every purchase on a statement not yet marked paid, including the open period. Marking a statement paid gives back exactly that statement's total. | BR-02 |
| FR-10 | The limit group list shows each group's owner, limit, cards, used and available amounts, and can be searched, filtered by owner and sorted. | BR-02 |
| FR-11 | *Can spend now* lists each unarchived card that can take a purchase, with its available credit out of its limit, a bar of how much of the limit is used (amber from 80%, red when over), whether the limit is shared, and the close and due dates a purchase made today would get. It counts cards with no group and links to assign them. It sorts by card, available, closes or due. | BR-02 |
| FR-12 | The card page shows the card's available credit, what is owed on it across unpaid statements, and its next due date. | BR-01, BR-02 |

### Statements and payments

| ID | Requirement | Serves |
|---|---|---|
| FR-13 | Statements are derived from the card's cycle and its purchases, never stored. A period runs from the day after the previous close to the close date, inclusive. | BR-03 |
| FR-14 | A statement can be marked paid and unmarked. A payment freezes the close and due dates it was paid against. | BR-01, BR-06 |
| FR-15 | *Due next* lists, per unarchived card, the oldest closed unpaid statement with money on it, or else the open period. Each row shows close date, due date, total, and an urgency badge: overdue, due within 7 days, or still open. Rows can be marked paid from the list and sorted by card, location, closes, due or total. | BR-01 |
| FR-16 | The card page lists statements newest first, marks the current one, folds a run of months with no purchases into one line, and pages back with *Show older statements*. | BR-03 |

### Purchases

| ID | Requirement | Serves |
|---|---|---|
| FR-17 | A purchase has a card, a date, an amount in baht (stored in satang) and an optional note. It records when it was first entered; an edit keeps that time. | BR-03 |
| FR-18 | After adding, the form says which statement the purchase lands on and when it is due. | BR-03 |
| FR-19 | The form shows the selected card's available credit. A purchase over it is saved, and the confirmation says by how much it went over. | BR-02, BR-07 |
| FR-20 | The form warns, without blocking, when the date is the card's close date (the bank may post it on either statement) and when the date is in the future. | BR-03, BR-07 |
| FR-21 | A purchase can be edited (date, amount, note; the card stays fixed) or deleted from the card page, archived cards included. | BR-03 |
| FR-22 | Only cards kept in a place ticked under *Purchases* in Settings can take a new purchase. Default: Krabi only. When none qualify, the form says how to fix it. | BR-11 |

### Dashboard workspace

| ID | Requirement | Serves |
|---|---|---|
| FR-23 | The dashboard's purchase form is always open. After each add it keeps the card and date and clears amount and note. A failed add keeps what was typed and shows the error beside the form. | BR-04 |
| FR-24 | *This sitting* lists purchases entered since *Start new batch* was last pressed, latest first, with how long ago, card, purchase date and amount, and a count and total. It survives reloads, closing the tab and the next day. *Start new batch* asks for a second click before clearing. | BR-04 |
| FR-25 | *Purchases by date* counts purchases, their total and the cards used, across every card (archived ones tagged), for Today, This week (Monday to Sunday), This month, Last month or a custom range of purchase dates, with a card filter. The list is folded until opened and grouped by day, each card linked to its page. | BR-12 |
| FR-26 | The dashboard re-reads the clock each minute, so a tab left open past midnight moves its default date and presets, without changing a date the user picked. | BR-04 |
| FR-27 | The purchase form and *This sitting* are the first things on the dashboard, beside or above the overview panels, on desktop and on a phone. (Today's exact layout is CD-03.) | BR-04, BR-10 |

### Data, backup and reset

| ID | Requirement | Serves |
|---|---|---|
| FR-28 | All data lives in the browser's `localStorage`. If the browser refuses storage, the page says so. | BR-08 |
| FR-29 | A backup can be saved as a downloaded JSON file or copied as compact text. | BR-08 |
| FR-30 | A backup can be restored from a file or pasted text. If the browser already holds records, the user sees both sets of counts and chooses *Merge* (keep and add) or *Replace* (delete everything first). An empty browser restores at once. | BR-08 |
| FR-31 | A backup is checked before anything is written. A wrong version, a malformed record, an unknown location or owner, or a bad date, amount or entry time is rejected with a message naming the record and the problem. | BR-08 |
| FR-32 | *Reset* deletes every card, purchase, payment, limit group and setting, after showing the counts and asking for confirmation. | BR-08 |
| FR-33 | Every write is awaited. A failed write shows a banner with a retry. | BR-08 |

### Language and presentation

| ID | Requirement | Serves |
|---|---|---|
| FR-34 | The interface is in Thai and English. The switch re-renders in place without losing typed input, and the choice is remembered. A first visit is Thai unless the browser asks for English. | BR-09 |
| FR-35 | Dates read `dd MMM yyyy` with Gregorian years in both languages; amounts read `฿1,234.56` in both. Text the user typed is never translated. | BR-09 |
| FR-36 | Light and dark themes follow the system. Urgency and limit usage are shown in words as well as colour. Every table stays readable on a phone. | BR-10 |
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
- Marking paid records the payment date and freezes the statement's close and due dates.
- Available credit on the card's group rises by exactly that statement's total.
- The card page can unmark it.
- *Covers FR-09, FR-14.*

**US-03 -- Trust settled history.** As a bookkeeper, I want a paid statement to keep its dates
when the card's cycle is edited later, so that past reconciliations stay true.
- After a cycle edit, paid statements show the dates they were paid against.
- *Covers FR-14.*

### Knowing how much is left

**US-04 -- See room on every card.** As a spender, I want to see how much each card can still
take and when a purchase made today would be due, so that I pick the right card.
- *Can spend now* lists only unarchived cards that can take a purchase.
- Each row shows available out of limit, a usage bar (amber from 80%, red when over), and the
  open period's close and due dates.
- A card sharing its limit says how many others share it.
- *Covers FR-11.*

**US-05 -- Share one limit across cards.** As a card administrator, I want several cards on
one account to draw on one limit, so that the room shown is the account's real room.
- Cards pointing at the same group show the same available amount.
- Purchases on any of them, archived ones included, reduce it.
- *Covers FR-08, FR-09, FR-05.*

**US-06 -- Find cards with no limit.** As a card administrator, I want to know which cards have
no limit group, so that I can assign them.
- The dashboard counts them and links to `/cards`; the card list can filter to "not assigned".
- The card form will not save without a group.
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
- Over the available credit: saved, and the message says by how much.
- On the close date: amber warning that the bank may post it on either statement.
- In the future: amber warning, saved anyway.
- *Covers FR-19, FR-20.*

**US-10 -- Fix a purchase.** As a bookkeeper, I want to edit or delete a purchase on the card
page, so that a typo doesn't need delete-and-re-add.
- *Edit* opens the form filled in, titled "Edit purchase", with the card fixed.
- Saving keeps the purchase id and its original entry time.
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
- Presets: Today, This week (Monday to Sunday), This month, Last month, Custom.
- Shows count, total and cards used; can filter to one card.
- Filters on purchase date, not entry time; archived cards are included and tagged.
- The detail list opens on request, grouped by day, each card linked.
- *Covers FR-25.*

**US-14 -- Review one card's history.** As a bookkeeper, I want a card's statements with their
purchases, so that I can reconcile against the bank statement.
- Newest first, the current statement marked; months with no purchases fold into one line.
- The page shows available credit, what is owed and the next due date.
- *Show older statements* pages further back.
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
- Unarchive brings one back.
- *Covers FR-05.*

**US-18 -- Keep the registry tidy.** As a card administrator, I want the registry's long
sections to fold, so that the page stays short on a phone.
- *Covers FR-07.*

### Data safety

**US-19 -- Back up my data.** As a bookkeeper, I want to save a copy of everything as a file or
as text, so that clearing the browser doesn't lose my records.
- *Download file* saves indented JSON; *Copy text* puts compact JSON on the clipboard.
- The copy button is hidden where the browser can't write the clipboard.
- *Covers FR-28, FR-29.*

**US-20 -- Restore or move my data.** As a bookkeeper, I want to restore a copy from a file or
pasted text, choosing to merge or replace, so that I can move between browsers safely.
- If the browser already has records, I see both sets of counts and choose Merge or Replace.
- Replace is shown as the dangerous choice.
- A bad copy is rejected before anything is written, naming the record and the problem.
- *Covers FR-30, FR-31.*

**US-21 -- Start over.** As a bookkeeper, I want to delete all data after a clear confirmation,
so that I can start clean.
- The confirmation shows how many of each record will go.
- *Covers FR-32.*

**US-22 -- Know when a save failed.** As a bookkeeper, I want a clear error with a retry when a
write fails, so that I never think something saved when it didn't.
- *Covers FR-28, FR-33.*

### Language and devices

**US-23 -- Use the app in Thai or English.** As any user, I want to switch language at any
time without losing what I typed, so that I can work in the language I read best.
- The choice is remembered. Dates use Gregorian years in both languages so they match bank
  statements. My own notes and names are never translated.
- *Covers FR-34, FR-35.*

**US-24 -- Use the app on a phone.** As a spender, I want the app usable on a phone, so that I
can check room before buying.
- Panels stack, every table stays readable at phone width, and dark mode follows the system.
- *Covers FR-27, FR-36.*

## Domain rules

The exact rules behind every number the app shows. Each is covered by tests next to the code
in `src/lib/domain/`; a refactor should keep those tests passing unchanged.

| ID | Rule |
|---|---|
| DR-01 | **Money** is stored as whole satang (1 baht = 100 satang). Typed amounts take digits with up to two decimals, commas ignored, and must be above zero. Shown as `฿1,234.56` in both languages. |
| DR-02 | **Dates** are plain `YYYY-MM-DD` strings in Asia/Bangkok. Reading the clock to get today is the only place a time zone enters; all date arithmetic uses `Date.UTC` and `getUTC*`, never local-time `Date`. |
| DR-03 | **A statement period** is named `YYYY-MM` after the month its close date falls in, and runs from the day after the previous close to the close date, inclusive. A purchase on the close date belongs to that statement, not the next. |
| DR-04 | **Due dates.** *Offset*: close date plus N days. *Fixed*: day M of the month; if M is not later than the close day, the due date is in the next month. A close or due day past the end of a month becomes its last day. |
| DR-05 | **Statements are derived on read.** Only payments are stored. A payment freezes the close and due dates it was paid against. |
| DR-06 | **What is due next** for a card: walking from the period of its earliest purchase up to the open period, the first closed statement that is unpaid and has a total above zero; if there is none, the open period. |
| DR-07 | **Urgency**, in order: *future* while today is on or before the close date; *open* if paid or the total is zero; *overdue* once past the due date; *soon* within 7 days of it; otherwise *open*. A period with no spending can never be overdue. |
| DR-08 | **The open period** is the statement a purchase made today would land on. The card page marks it *Current*. |
| DR-09 | **Available credit** for a group is its limit less every purchase, on every card in the group (archived ones included), that sits on a statement not marked paid, the open period included. It can go below zero. Marking a statement paid gives back exactly its total. |
| DR-10 | **Can spend now** shows the open period's close and due dates (DR-08), not what is due next (DR-06). On a card with an overdue statement the two differ, and both are right for their question. |
| DR-11 | **Over-limit note.** Adding a purchase above the available credit saves it and names the amount over. Editing a purchase never shows the note, because available credit already counts the old amount. |
| DR-12 | **Who can take a purchase**: an unarchived card whose location is in the Settings list. The default list is Krabi only. An empty list is a real answer (nobody can), not "unset". |
| DR-13 | **Owners.** A group's account holder is KC, NT or RI; a missing or unknown value reads as KC. A card's cardholder is its own owner if it is supplementary, otherwise its group's account holder, otherwise nobody (no group). A group is labelled `Name (OWNER)`, untranslated. |
| DR-14 | **Locations** are `bangkok`, `phichit` and `krabi`; the default is `bangkok`. |
| DR-15 | **Entry time** (`addedAt`) is set when a purchase is first saved, from the dashboard or the card page, and an edit keeps it. Purchases saved before 2026-10-27 have none and are never backfilled. |
| DR-16 | ***This sitting*** holds purchases whose entry time is at or after the batch start, latest entered first. On the very first load the batch start is set to that moment, so the list starts empty. |
| DR-17 | **Date ranges** filter on the purchase date, not the entry time. Weeks run Monday to Sunday. The default preset is This month. A custom range typed backwards is turned the right way round. Within a day, the latest entered comes first. |
| DR-18 | **Card page history** counts back from the later of the open period and the period of the latest purchase, so a future-dated purchase still has a statement to edit it from. |
| DR-19 | **Identity and deletion.** A card id is unique and never changes. A card can be deleted only while it has no purchases (otherwise archive it). A group can be deleted only while no card uses it. |
| DR-20 | **No group.** The card form requires a group. A card stored without one shows as not assigned and is left out of *Can spend now* until it is given one. |

## Data contracts

What existing browsers and backup files already contain. A refactor that changes any of these
needs a migration, or it loses or misreads someone's data.

| ID | Contract |
|---|---|
| DC-01 | **Repository.** Storage is reached only through the `Repository` interface, made of key lookups and prefix scans. Every implementation must pass the shared contract suite (`src/lib/storage/contract.ts`). |
| DC-02 | **Record keys** in `localStorage`: `cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, `cc:payment:<cardId>:<period>`, `cc:limitgroup:<id>`. Each segment is `encodeURIComponent`-encoded. Deleting a card scans `<encoded id>:` with the trailing colon, so it never touches a card whose id merely starts with the same text. |
| DC-03 | **Other keys**: `cc:settings` (purchase places), `cc:batch-start` (start of *This sitting*), `cc:lang` (language), `cc:panel:<name>` (a panel's open or closed state), `cc:migration:location` (cards reset by the location migration), `cc:probe` (storage check at startup). |
| DC-04 | **Reset** removes cards, purchases, payments, limit groups, settings, the batch start and any pending migration notice. It keeps `cc:lang`, so the page doesn't switch language under the reader. |
| DC-05 | **Backup format**, version 2: `{ version: 2, exportedAt, limitGroups, cards, purchases, payments, settings? }`. `settings` is optional, and a file without it leaves stored settings alone. The batch start is never in a backup. A file of any other version is rejected. |
| DC-06 | **Restore** checks the whole file before writing anything, then writes groups, cards, purchases and payments in that order (a card's group exists first). It is not atomic: a failure partway leaves part written. A card whose group is not in the file is still imported. |
| DC-07 | **Stale fields.** Cards stored before 2026-09-24 carry an `owner` field from when the owner was on the card. `Card.owner` is read only when `supplementary` is set, so those stale values are ignored. Keep that guard. |
| DC-08 | **Location migration** runs at every startup, is safe to run twice, resets unknown locations to Bangkok, and records which cards it reset for a one-time notice. A failure on one card does not stop the page loading. |
| DC-09 | **Build stamps.** `BUN_PUBLIC_COMMIT_SHA`, `BUN_PUBLIC_BUILT_AT` and `BUN_PUBLIC_PR_NUMBER` are stamped at build time. `BUN_PUBLIC_PR_NUMBER` is always set, empty outside previews, because an unset one is left as a `process.env` read that throws in the browser. |
| DC-10 | **Old address.** `/backup` redirects to `/settings`. Keep a redirect for any page address a redesign retires. |

## Interface rules

Rules that hold whatever the screens look like.

| ID | Rule |
|---|---|
| UI-01 | **One source for values.** Colours, spacing, type and shape live once in `src/styles/tokens.css`. Component styles reference them only through `var(--cc-*)`. |
| UI-02 | **Three button variants**: primary (no attribute), `data-variant="quiet"` and `data-variant="danger"`. No fourth. |
| UI-03 | **Both languages, always.** Every piece of interface text comes from the catalog, in both `en.ts` and `th.ts`; a test enforces it. Errors carry a message key and parameters, translated where shown. Never key a style or a test selector off translated text. |
| UI-04 | **No `Intl` for dates.** A Thai locale would print Buddhist Era years. Dates are formatted by hand as `dd MMM yyyy` with Gregorian years. |
| UI-05 | **Thai needs room.** Line height stays at least `1.65` so Thai vowel and tone marks are not clipped, and the font stack lists Thai faces. |
| UI-06 | **Never colour alone.** Urgency, limit usage and warnings always carry words as well as colour. |
| UI-07 | **Warnings don't block.** Unusual input (over limit, close date, future date) is saved and warned about in amber. Only invalid input (no card, an impossible date, a non-amount) is refused. |
| UI-08 | **Dangerous actions explain themselves and ask twice.** Replace, Reset and Start new batch each state their consequence and need a second, deliberate step. A dangerous choice uses the danger variant; the safe choice is the primary one. |
| UI-09 | **Don't offer what can't work.** Copy and paste buttons are hidden where the browser lacks the clipboard call they need. |
| UI-10 | **Saves are honest.** Writes are awaited, never shown ahead of time. A failed write shows a banner with a retry, and typed input is kept. |
| UI-11 | **Switching language loses nothing.** The page re-renders in place; open forms keep what was typed. |
| UI-12 | **User text is never translated.** Card names, comments and purchase notes appear as typed. |
| UI-13 | **A preview is marked.** A preview deploy adds `(pr-<n>)` to the title and brand, so it can't be mistaken for production. |
| UI-14 | **Appearance is checked by eye.** happy-dom computes no styles, so layout and colour are checked with screenshots at 390px and 1280px, in English and Thai, light and dark. |

## Decisions

Choices made along the way, with the reason and what was rejected. Revisit one only on purpose.

| ID | Decision | Why | Rejected |
|---|---|---|---|
| DD-01 | Statements are computed, never stored; only payments are. | One source of truth, no generation job. | A stored statement per card per month. |
| DD-02 | A payment freezes its close and due dates. | Editing a cycle must not rewrite paid history. | Recomputing paid statements from the current cycle. |
| DD-03 | Data lives in the browser's `localStorage`. | The data is small, and neither Bun nor happy-dom provides IndexedDB for tests. | IndexedDB; a server (a Worker with KV was built in September and is not what ships today). |
| DD-04 | Every unpaid baht counts against the limit, including the open period. | Counting only closed statements shows more room than the card really has. | Counting closed statements only. |
| DD-05 | Every card belongs to exactly one limit group. | The sum is always per group; a lone card is a group of one. | Limits on cards, with sharing as a special case. |
| DD-06 | Over-limit, close-date and future-date purchases are saved with a warning. | The app records what happened, and a stored limit can be out of date. A close-date purchase is valid, only its statement is uncertain; a future date can be a booking or instalment. | Refusing the entry. |
| DD-07 | A payment records no amount, so it settles the whole statement. | Keeps the model simple; partial payments are a known limit. | Recording a paid amount. |
| DD-08 | The account holder is on the limit group, not the card; a supplementary card has its own cardholder. | A group stands for a bank account, and two cards on one account can't name different owners. A บัตรเสริม is the exception. | Owner on every card. Copying each card's owner up to its group (cards could disagree). |
| DD-09 | A group without an owner reads as KC; no migration. | Avoids a rule for cards that disagree. | Migrating owners from cards. |
| DD-10 | Purchase eligibility is set per place in Settings, default Krabi. | Purchases were only ever entered against the Krabi cards, and a place rule needs no edit per card. | A checkbox on each card (shipped briefly, then replaced). |
| DD-11 | Locations and owners are closed lists. | The stored key stays display-neutral and translatable; a typo can't create a new place. | Free text with suggestions. |
| DD-12 | Backups stay at version 2; new optional fields don't bump it. | A bump would reject every backup already saved. | Bumping on each new field. |
| DD-13 | Restoring into a browser that holds records asks Merge or Replace, and an empty browser restores at once. | Nobody should wipe data without reading what the button does. Settings alone don't count as records. | Always merging; always asking. |
| DD-14 | Moving data between deploys (preview to production) is copy and paste. | Storage is per origin, and an iframe gets partitioned storage. | A popup and `postMessage` bridge. |
| DD-15 | The dashboard is a workspace for entering receipts: the form is always open and *This sitting* lists the current batch. | The bookkeeper works through a pile and is often interrupted; the list is how they find their place. | A dialog per purchase; a separate purchases page. |
| DD-16 | *This sitting* survives reloads and the next day, clears only on a confirmed *Start new batch*, and is read-only. | Losing it to a reload or a stray click is exactly the failure it exists to prevent. Editing stays on the card page. | Clearing on reload; edit or undo in the list. |
| DD-17 | The batch start is per browser and stays out of backups. | It is working state, not a record. | Storing it in Settings. |
| DD-18 | After an add, the form keeps the card and date and clears amount and note. | Receipts come in runs from one card or one day. | Clearing everything. |
| DD-19 | Ranges filter on purchase date, and archived cards count (tagged). | A range answers "what was bought then"; archiving later must not change it. | Filtering on entry time; hiding archived cards. |
| DD-20 | Old purchases get no entry time. | A guessed time would put them in the wrong batch. | Backfilling. |
| DD-21 | Thai is the default language unless the browser asks for English. | Thai company cards, baht, Bangkok dates: Thai is the daily language. | English by default. |
| DD-22 | A hand-written translation catalog; switching re-renders in place. | `@lit/localize` needs an extraction tool and XLIFF files, too much for two languages. A reload would lose half-filled forms. | `@lit/localize`; reloading on switch. |
| DD-23 | Thai sorting uses code-unit order. | `Intl.Collator` on `th-TH` risks the Buddhist Era handling dates avoid; today's locations sort the same either way. | `Intl.Collator`. |
| DD-24 | Components use shadow DOM with shared style modules built on tokens; `@kcstyles/reset.css` replaces Pico. | Document styles never reached inside shadow roots, so most components were unstyled. | One shared stylesheet pushed into every shadow root; rendering into the light DOM. |
| DD-25 | Teal accent on warm neutrals. | Teal stays clearly apart from the danger red and warning amber beside it. | The earlier cool grey and blue. |
| DD-26 | The usage bar measures everything unpaid against the limit and reads "of the limit used". | It matches the figure *Can spend now* already shows. | "Used this cycle". |
| DD-27 | Dashboard panels start sorted by soonest close date, and their sort resets on reload. | One shared default; panels have no saved order. The cards page keeps its view in the address instead. | Saving panel sort; most room first. |
| DD-28 | The footer's changelog link points at `main`, not the built commit. | An old deploy still points readers at the latest entries. | Linking the built commit. |
| DD-29 | "Cardholder" (หน้าบัตร) names the person on a card; "Account holder" (เจ้าของบัตร) names a group's owner. | Both used to read "Owner", which didn't tell them apart. | One word for both. |

## Current design

How the site looks and is arranged today. All of it may change in a redesign; it is listed so
that each change is a choice. Anything that also carries a rule above links to it.

| ID | Today |
|---|---|
| CD-01 | **Pages**: `/` dashboard, `/cards` registry and limit groups, `/card?id=<id>` one card, `/settings` purchase places, backup and reset. Nav: Dashboard, Cards, Settings, plus the language switch. (Keep redirects, DC-10.) |
| CD-02 | **Page shell**: sticky header with an accent mark, the brand and pill-tab nav with the current page filled; content up to `72rem` wide; footer with source, changelog, commit and build time. |
| CD-03 | **Dashboard layout**: at 960px and wider, two columns, the purchase form and *This sitting* on the narrower left and *Purchases by date*, *Due next* and *Can spend now* on the right. Narrower, one column in that order. The "lands on" confirmation sits above both columns. |
| CD-04 | **Purchase entry**: always-open form on the dashboard; a dialog on the card page for adding and editing. |
| CD-05 | ***This sitting*** columns: added, card, bought, amount. *Start new batch* turns into a confirm and Keep pair in place. |
| CD-06 | ***Purchases by date***: preset chips, from and to dates, a card filter, three summary tiles (purchases, total, cards used) that wrap on a phone, and a folded list grouped by day. |
| CD-07 | **Lists**: tables with sortable headings; below 640px they become stacked rows labelled per field, with a sort chip. Filters are pill chips with "Any". |
| CD-08 | ***Due next***: a coloured left rule and text badge per urgency. ***Can spend now***: a usage bar under each available amount, amber from 80% and red when over. |
| CD-09 | **Registry page**: four folding sections, card form, card list, limit group form, limit group list; archived cards in their own folded list. |
| CD-10 | **Card page**: summary (available, owed, next due), then statements newest first, with *Current* badge and an accent left rule, quiet months folded into one line, Edit and Delete per purchase. |
| CD-11 | **Settings page**: Purchases (place checkboxes), Backup split into *Save a copy* and *Restore a copy* side by side from 640px, then Reset. |
| CD-12 | **Look**: warm paper neutrals, teal accent, soft corners and shadows, light and dark from the system setting. Panels remember open or closed per browser. |

## Redesign checklist

Before a refactor or redesign ships:

- [ ] Every user story (US-01 to US-24) can be walked through in the new design.
- [ ] Every functional requirement is still met, or is retired here with a reason.
- [ ] Domain rule tests in `src/lib/domain/` pass without changing what they expect.
- [ ] The storage contract suite passes, and data saved by the current version loads unchanged.
- [ ] A version 2 backup from the current version restores, with and without `settings`.
- [ ] Every interface rule (UI-01 to UI-14) holds, checked in English and Thai, light and dark,
      at phone and desktop widths.
- [ ] Each decision that changed has a dated entry in `CHANGELOG.md` saying what replaced it
      and why, and is updated here.
- [ ] Retired page addresses redirect.

## Constraints and known limits

- **Single browser.** Data is not shared between browsers or people; moving it means a backup.
  There are no accounts.
- **Full payments only.** A payment records no amount, so paying part of a statement can't be
  recorded.
- **Fixed sets.** Locations (Bangkok, Phichit, Krabi) and owners (KC, NT, RI) are closed lists
  in the code.
- **Backup version 2 only.** Older backups are rejected.
- **Restore is not atomic.** A failure partway through can leave some records restored.
- **Thai sorting** uses code-unit order, not Thai collation; it matches for today's locations.

## Not yet done

- Redesign the flows between pages (tracked in [`TODO.md`](TODO.md)).
- Shared storage across devices (a Cloudflare KV design existed but is not what ships).
- Staff accounts.
