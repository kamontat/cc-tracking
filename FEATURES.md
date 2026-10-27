# Features

What cc-tracking does and why, written as business requirements, functional requirements and
user stories. It covers every feature shipped up to 2026-10-27. [`CHANGELOG.md`](CHANGELOG.md)
records when each one shipped and the decisions behind it; [`README.md`](README.md) explains
how statements, limits and storage work. A Thai translation is in
[`FEATURES_TH.md`](FEATURES_TH.md).

IDs are stable: add new ones at the end of their list rather than renumbering. Each functional
requirement names the business requirements it serves, and each user story names the
functional requirements it covers.

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
| FR-05 | A card can be edited, archived, unarchived or deleted. Archived cards leave the dashboard and the purchase form but keep their history and still count against their group's limit. | BR-05, BR-02 |
| FR-06 | The card list can be searched (name, id, last 4, comment), filtered by cardholder, location and limit group (including "not assigned"), and sorted by name, location, group or close day from the column headings or a sort chip. The view is kept in the address. | BR-05 |
| FR-07 | Every section on `/cards` (card form, card list, limit group form, limit group list) folds. Lists start open, forms start closed and open when an edit starts. | BR-10 |

### Limit groups and spendable credit

| ID | Requirement | Serves |
|---|---|---|
| FR-08 | A limit group has a name, a credit limit in baht and an account holder (KC, NT or RI). Every card must point at one group; a card on its own is a group of one. | BR-02, BR-05 |
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
| FR-27 | On desktop the dashboard has two columns (form and *This sitting* on the left; *Purchases by date*, *Due next* and *Can spend now* on the right); on a phone they stack in that order. | BR-10 |

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
| FR-36 | Light and dark themes follow the system. Urgency is shown by a text badge as well as colour. Tables turn into stacked rows below 640px. | BR-10 |
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

**US-18 -- Keep the registry tidy.** As a card administrator, I want each section on `/cards`
to fold, so that the page stays short on a phone.
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
- Panels stack; tables become stacked rows below 640px; dark mode follows the system.
- *Covers FR-27, FR-36.*

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
