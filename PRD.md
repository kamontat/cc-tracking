# cc-tracking: product requirements

| | |
|---|---|
| **Status** | Draft for the refactor and redesign |
| **Last updated** | 2026-11-02 |
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
| [Decided changes](#decided-changes-for-the-redesign) | RD | Build these. They override the rows they name. |
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
| `src/lib/domain/` | Pure rules: dates, cycles, statements, limits, ranges, money; and the phase 1 rules `ledger.ts`, `room.ts`, `purchase-list.ts`, `amount-warnings.ts`, `locations.ts`, `purge.ts`, and the phase 4 rules `pay.ts` (card choice, the payment form, planned payments) and `transactions.ts` (ledger rows, search, filter, sort, summary, owed and list rows), and the phase 5 rules `cards-view.ts` (the Cards page's search, filter, sort, place sections, archived cards and group panels). No storage, no UI. Tests beside each file. |
| `src/lib/storage/` | `Repository` interface, the `localStorage` implementation, the contract suite, backup and restore, the location migration, the payment conversion (`migrate-payments.ts`) and backup version 3 (`transfer-v3.ts`); phase 6 adds the location seed (`seed-locations.ts`) and the old-purchase deletion (`purge-run.ts`). |
| `src/lib/i18n/` | The English and Thai catalogs (`en.ts`, `th.ts`), language detection and formatting. |
| `src/lib/ui/` | Page plumbing shared by routes: load and save with error handling, panels, theme, build info, the phase 3 helpers `money-data.ts` and `list-share.ts` (`back-header.ts` gave way to `sub-header.ts` in phase 5), the phase 4 helpers `record-payment.ts` (record, mark paid and delete a payment), `save-list-reply.ts` (saves a waiting list's reply; the reply page and *Confirm* share it, DD-108), `pay-address.ts` (the payment page's address), `pay-tag.ts`, `tx-query.ts` (the Transactions address) and `ready-query.ts` (the new-list picker's address), the phase 5 `cards-query.ts` (the Cards page's address and its group sheet, DD-115), and the shell (`shell.ts`, `chrome.ts`, `icons.ts`: header, bottom bar, tabs, build marks), and `motion.ts` (`afterExit`: run a closing step once the exit animations end, DD-107). |
| `src/components/` | Lit web components (`cc-*`), one per panel, form or table. They get data as properties and send events. Phase 4 adds `cc-pay-picker`, `cc-pay-form`, `cc-tx-ledger`, `cc-tx-filter`, `cc-owed-list` and `cc-list-index`, and `cc-fab-menu` (the floating *+ New* menu, DD-104), and `action-row.ts` (the row *Needs you* and *Upcoming* share, DD-108). Phase 5 adds `cc-cards-list`, `cc-cards-filter`, `cc-group-panels` and `cc-group-sheet` (the Cards page), `cc-card-hero`, `cc-card-statements` and `cc-purchase-sheet` (the card page), and restyles `cc-card-form` for the edit screen. Phase 6 adds `cc-restore-sheet` and `cc-purge-sheet` (Settings' two sheets). |
| `src/routes/` | One HTML page and script per address: `index` (`/`), `list`, `transactions`, `pay`, `cards`, `card`, `card/new` and `card/edit`, `settings`, `settings/locations` (phase 6). |
| `src/styles/` | `tokens.css` (every value), `app.css` (page shell), `shared.ts` (styles inside components). |

Stack: Bun, TypeScript, Lit, `@kcstyles/reset.css`, happy-dom for tests, static pages on
Cloudflare Workers. Commands: `bun run dev`, `bun run test`, `bun run check`,
`bun run typecheck`, `bun run build`.

## Problem

The app works, and its rules are settled, but it grew one feature at a time over six weeks.
These call for a redesign:

- **The flows.** How pages lead into one another, and what each page asks of the reader, were
  never designed as a whole. `TODO.md` has carried this since the visual refresh on
  2026-10-27, which changed the look and deliberately left the flows alone.
- **The code.** A refactor alongside the redesign, so the structure matches the product as it
  now is rather than the order it was built in.
- **The look and phone use.** The visual style and how the app works on a phone are part of
  the redesign too.

Pain points the user named (2026-10-29):

- **The dashboard is too busy.** The purchase form, *This sitting*, *Purchases by date*, *Due
  next* and *Can spend now* share one page, and what matters is hard to find.
- **Paying is buried.** Recording a payment means hunting through *Due next* or each card's
  page.
- **The registry is clunky.** Adding and editing cards and limit groups, with their filters and
  dialogs, feels heavy.
- **Actions are split across pages.** Related actions live on different pages, so the user
  keeps jumping between them.

How the app is really used (corrected by the user, 2026-10-30). Purchases are planned, not
entered from receipts, and payments are made whenever room is needed:

- **Buying.** The bookkeeper picks one or more cards and an amount for each, weighing room,
  close date and due date. They send the spender a dated list (card id, name, last 4,
  amount), wait for the spender to say which purchases were made, then reconcile and save.
- **Paying.** The bookkeeper plans payments per card ahead of time, and pays on any day of
  the month, often before a purchase that would go over a limit. A payment can be more than
  is owed, and the app should say so.
- **How often.** Always (more than half of visits): build a purchase list, find a card to
  use, record a payment. Usually (10-40%): change a card's location or limit, check room,
  find cards with something unpaid. Rarely (under 10%): add and set up a card, find where a
  card is kept, back up, change settings. A visit lasts about ten minutes.

## Goals

- **G1. Keep everything that works.** Every requirement, user story, domain rule, data contract
  and interface rule in this document still holds after the redesign, unless it is retired
  here on purpose.
- **G2. Flows designed as a whole**, around the three questions the app answers: what to pay
  and when, how much room is left, and which statement a purchase lands on.
- **G3. Building, sending and confirming a purchase list is quick**, and a list waiting for
  the spender's reply is never lost (RD-09). *(Until 2026-10-30: entering a pile of receipts
  stays at least as fast as today's always-open form; RD-01, RD-02.)*
- **G4. No one loses data.** Data saved in a browser today, and backups saved today, load
  unchanged.
- **G5. A codebase that is easy to change**, keeping the separation between pure rules,
  storage and interface.
- **G6. Fewer page jumps.** Actions that belong to one task sit together, so a task doesn't
  send the user across pages.
- **G7. Checking room and viewing the numbers is fastest on a phone**: which card has credit,
  what is due, and the spending totals, at a glance.
- **G8. Calm to use for a ten-minute visit**: soft colours, plenty of room, and the next thing to
  do shown first (RD-15, RD-21).

## Non-goals of the redesign

- New features that are not in this document. Anything in [Out of scope](#out-of-scope) stays
  out unless decided separately.
- Changing a domain rule or data contract as a side effect of a layout change.
- Moving data to a server or adding accounts (see [Future work](#future-work)).

## Decided changes for the redesign

Settled with the user on 2026-10-30. Build these. Each overrides the rows it names elsewhere in
this document; those rows describe today's app until the change ships, and are then updated or
retired. RD-08 to RD-21 were settled later the same day, after the user corrected how the app
is used (see [Problem](#problem)), on a clickable prototype: <https://claude.ai/code/artifact/a290fd13-81d8-483a-9968-8b16e953ca6c> (private).

Phase 1 (rules and storage) shipped on 2026-10-30: the new rules and records sit beside the old ones, and no page uses them yet. See `docs/superpowers/plans/2026-10-30-redesign-roadmap.md`.

Phase 2 (shell and look) shipped on 2026-10-30: the header, bottom bar, desktop tabs, build marks, the new palette, the early theme and About replacing the footer. Every page still shows today's panels; `/transactions` is a placeholder.

Phase 3 (Home and purchase lists) shipped on 2026-10-31: Home replaced the dashboard with *Needs you* and *Ready to use*, and four pages (`/list/new`, `/list/draft`, `/list/reply`, `/list/view`) enter, review, reply to and show a purchase list (DD-58). *Due next* and *Purchases by date* are off Home until Transactions (phase 4); the card page keeps its Add purchase dialog until phase 5.

Phase 4 (Transactions and payments) shipped on 2026-10-31: Transactions became the ledger (purchases and payments by day, *Upcoming*, search, filter and sort, a *Lists* view and an *Owed* view); the payment page `/pay` (the card picker, with the payment sheet over it for a card) is where every way to pay leads, and planned payments join *Needs you* and the over-the-room warning. Payments convert to card payments at startup, download, copy and restore use backup version 3, and the card page reads the ledger: its statement list has no *Mark paid* and no per-part undo (DD-76 to DD-96). `/transactions` is no longer a placeholder, and *Due next* and *Purchases by date* are back there.

Phase 5 (Cards) shipped on 2026-11-01: the Cards page replaced the registry, with cards by place (or one flat list for any other sort), search, a filter sheet, archived cards folded at the end, and limit group panels whose sheet adds and edits a group (DD-112 to DD-117). The card page was rebuilt around the room, the bill and the statements; a purchase is edited or deleted from its statement row, and the Add purchase dialog is gone (DD-111, DD-118). A card is added and edited on a full screen, `/card/new` and `/card/edit?id=` (DD-114). Storage refuses to delete a card on a draft or a waiting list (DD-119). The old `/cards` query and `?edit=` links are retired (DC-15, DC-16). A feedback round on 2026-11-01 brought back a single purchase without a list (from the card page), listed the payment parts on each statement, gave cards a `name · holder (last4)` title, moved the card page and the edit page under a compact sub-header with Archive and Delete in the card page's More menu, and split the edit page into sections (DD-121 to DD-126). A follow-up the same day moved the payment and list pages under the sub-header too and made a payment that fails after Back say why (DD-124, DD-127).

Phase 6 (Settings) shipped on 2026-11-02: Settings took the redesign's rows in rounded panels, two columns from 900px (CD-11). Locations became stored records, seeded once from the old purchase places, managed at `/settings/locations` (add, rename, delete one with no cards, *Takes purchases*), and a card can be kept at any of them; names show in the reader's language and sort A to Z (DD-128 to DD-132, DD-140). Backup version 3 carries the records as stored and checks each card's location against them; Merge keeps the local records and deletes nothing from a version 3 file (DD-94 retired, DD-131, DD-133, DD-139). Restoring opens a sheet that reads the clipboard first (DD-134). Reset gained *Delete old purchases*, by age, with a count and a second ask, and *Delete all data* asks inline and seeds the default locations again (FR-32, DD-135, DD-136). The phase 5 leftovers closed: a *Not in a group* filter, `?newGroup=1`, the build tint before first paint, and token and wording fixes (DD-137, DD-138, DD-143).

| ID | Change | Affects |
|---|---|---|
| RD-01 | *(Replaced by RD-09.)* **Entering receipts gets its own screen**, off the dashboard. It keeps today's speed: card and date stay between adds, amount and note clear, a failed add keeps what was typed. | FR-23, FR-27, DD-20, CD-03, CD-04, G3 |
| RD-02 | *(Replaced by RD-09.)* **Recent entries replace *This sitting*.** The batch list with *Start new batch* doesn't fit and is not carried over as it is. The need stays: after an interruption the bookkeeper can see what they already entered, and doesn't skip or double-enter a receipt (BR-04, US-08). Replaced by a **recent entries** list on the entry screen: purchases sorted by when they were added (`addedAt`), newest first, grouped as today and earlier, with no batch to start or clear. Purchases without an entry time (DR-15) don't appear. `cc:batch-start` is no longer read and may stay on disk (DD-14). | FR-24, US-08, DR-16, DD-21, DD-22, DC-03, CD-05 |
| RD-03 | **A new visual direction.** Palette, type, shape and density start again. The interface rules (UI-01 to UI-21) still hold: tokens only, three button variants, never colour alone, room for Thai, both themes. *Shipped in phase 2.* | DD-32, CD-02, CD-07, CD-08, CD-12 |
| RD-04 | **Same stack.** Bun, TypeScript, Lit web components, `@kcstyles/reset.css`, happy-dom for tests, static pages on Cloudflare Workers. The refactor restructures modules and folders only. *Held through phases 1 to 6: no new runtime or framework was added.* | G5 |
| RD-05 | **No theme flash.** The saved theme is applied before the first paint, so a page never shows the wrong theme on load. *Shipped in phase 2.* | DD-28, known limits |
| RD-06 | **Restore checks ranges** with the same rules as the forms: amounts and limits above zero, last 4 exactly four digits, cycle days in range (DR-25), and payment parts as today. A file that breaks one is rejected before anything is written, naming the record and the problem. *Shipped in phase 1 (backup version 3's checks, DC-06); restore has used them since phase 4.* | DC-06, FR-31, known limits |
| RD-07 | **Delete guards move into storage.** The repository refuses to delete a card that has purchases or a limit group that cards use, and the contract suite tests it. The interface keeps hiding the buttons as well. *Shipped in phase 1.* | DR-19, DC-13 |
| RD-08 | **Pages and navigation.** Four pages: Home, Transactions, Cards and Settings. On a phone a bottom bar holds the four tabs; on a desktop they sit on the right of the header. A floating **+ New** button at the bottom right of every page (except the purchase list pages, the new-list picker among them, DD-71 and the payment page) opens a small menu above it: *New purchase list* (`/list/new`) and *Make a payment* (`/pay`, RD-14) (DD-104). It is a round + on a phone, above the bar, and a pill *+ New* on a desktop. The header keeps the boxed `cc` mark with a bold rule under it. Sub-screens (entering amounts, a card, its edit form, locations) open with a back button. *Shipped in part in phase 2: the shell, with Payment as a floating button (DD-57) that opens a placeholder until the payment form in phase 4.* *Shipped in full in phase 4: Payment leads to `/pay`, the card picker, where the payment sheet opens (DD-76).* | CD-01, CD-02, FR-27, DD-19, DD-45, question 3 |
| RD-09 | **Purchase lists replace receipt entry.** (1) On the new-list picker (`/list/new`, reached from Home's *Ready to use*), tick cards (DD-103). (2) Enter an amount for each card on its own screen, with the purchase date. (3) Review the dated table, with the columns *Card* (id), *Name (last 4)* and *Amount*; copy it as text or save it as an image for the chat, then mark it sent. (4) When the spender replies, mark each line *Made* or *Not made* and correct the real amount. (5) Save: made lines become purchases on the list's date; not-made lines can move to a draft for the next day. A list is a draft, waiting for the spender, or saved. A waiting list holds its amounts against each group's room until it is saved. A draft can be deleted (*Delete draft*) and a waiting list cancelled (*Cancel list*), which deletes it so it stops holding room; both act at once (DD-74). Each line can carry an optional note, typed under its amount, edited on the reply, and written to the purchase's `note` when the reply is saved (DD-102). *Shipped in phase 3.* *Since 2026-11-01 a single purchase can also be added without a list, from the card page's *Add purchase* (question 13, DD-121); a list is still how a planned purchase goes to the spender.* | RD-01, RD-02, FR-17, FR-18, FR-23, FR-24, US-07, US-08, DD-20 to DD-23, DD-39, DD-40, CD-03 to CD-05 |
| RD-10 | **Warnings while entering amounts.** None blocks the list. Each sits under its line with the reason in words, the line gets an amber outline, and a count shows above *Review*. *Over the room*, explaining any room held by a waiting list and any planned payment that would make room, with one action: *Lower to* the room. *Shared limit*: cards on one list that share a group go over its room together. *Overdue bill* on the card. *Close date*: the purchase date is the card's close date. *Date has passed*: shown once, at the date, with *Change to today*. Dropped: the future-date warning, since lists are planned ahead, and a warning for a card already on another list. *Shipped in phase 3; the planned-payment part of the over-room explanation shipped in phase 4 (DD-84).* | FR-19, FR-20, US-09, DR-11, DD-41 |
| RD-11 | **Payments belong to a card and can be made on any day.** A payment has a card, a date and an amount. Paid money settles the card's oldest statement first, the open period included. Paying more than is owed is accepted and said in words; the extra stays on the card as **credit**, used by its next purchases, so room can go above the limit. Existing per-statement records migrate without changing any total. *Shipped in phase 4.* | FR-09, FR-12, FR-14, FR-16, US-02, US-25, DR-05 to DR-09, DR-28 to DR-31, DC-02, DC-05 to DC-07, DD-07, DD-37, DD-38, DD-42, known limits |
| RD-12 | **Planned payments.** A payment dated later than today is a plan. It shows under *Upcoming* with *Mark paid*, and changes nothing until it is marked paid. *Shipped in phase 4.* | new |
| RD-13 | **Transactions is one ledger.** Purchases (−) and payments (+) by day, with sign and word marking direction; a month summary (purchases, payments, owed now); *Upcoming* on top, with lists waiting for the spender (each with a two-step *Confirm* that saves it as planned) and every planned payment (with *Paid* and *Delete*), in the shared action row (DD-108). Search, filter by type, card and date, and sort; filters show as removable chips, and the filter sheet counts matches before applying. On a desktop, what each card owes sits beside the ledger. Replaces *Purchases by date* and *Due next*. *Shipped in phase 4.* *Since 2026-11-02 the ledger shows 50 rows at a time (DD-146).* | FR-15, FR-25, US-01, US-13, CD-06, CD-08, DD-43 |
| RD-14 | **The payment form.** A sheet over the payment page `/pay` (a bottom sheet on a phone, a centred dialog from 900px, DD-76). The page, which the Payment button (DD-57) opens, asks which card: every card with what it owes, overdue and soon-due first, with a search box. The form then shows the card large at the top with *Change*, what it owes, its next bill and its credit, chips for *Next bill* and *Everything owed*, the amount (starting at the next bill), the date and an optional note (DD-101). The button names the amount, the card's name and, for a plan, the date: "Record ฿41,230.00 to SCB Krabi", "Plan ฿10,000.00 to UOB Krabi on 05 Nov 2026" (DD-98). *Shipped in phase 4; a sheet over the `/pay` picker since the 2026-10-31 rework.* | FR-14, CD-13, DD-44 |
| RD-15 | **Home.** *Needs you* first, money at risk first (DD-62): overdue bills, late planned payments, lists waiting for the spender, planned payments in the next three days and drafts, each opening its task, in the shared action row (DD-108, DD-110). Then a short *Ready to use*: how many cards are ready, the three with the most room (room, close date and due date for buying today), with *See more (N)* opening the rest in place and *Show less* folding them (the control *Needs you* uses; N is the hidden count); starting a list is the *+ New* menu's job (DD-104) and the new-list picker `/list/new`'s, which lists every ready card with search, filters (*Kept in*, *Account holder*), the sort (most room, longest to close, latest due) and ticks for a list (DD-103). A quiet day reads "All caught up". When more than five things need you, the first five show, with *See more (N)* opening the rest in place and *Show less* folding them again (DD-106). Replaces the dashboard panels. *Shipped in phase 3; planned payments joined Needs you in phase 4 (DD-84); the full list and the picking moved to `/list/new` in phase 4 (DD-103).* | FR-11, FR-15, US-04, CD-03, DD-34 |
| RD-16 | **Cards page.** Grouped by location by default; search; filter by location and account holder; sort by place, most room, name or close day, where any sort but place gives one flat list. Limit groups sit beside the list on a desktop (on a phone, a *Cards · Limit groups* switch shows one or the other since 2026-11-02, DD-144). A card's page shows room, owed, next bill, *Use on a list*, *Make a payment* and statements; *Edit* opens a full edit screen instead of a dialog. Old addresses need not keep working (question 15). *Shipped in phase 5 (DD-111 to DD-120).* | FR-06, FR-07, FR-38, US-16, US-18, CD-09, CD-10, DC-15, DC-16 |
| RD-17 | **Locations can be managed** at `/settings/locations`: add, rename, delete (only a location with no cards), and tick *Takes purchases* per location, which replaces *Purchase places*. Needs a stored list of locations and a migration from the fixed three. *Shipped in phase 6: the records are seeded once from the old purchase places and are the truth for where purchases happen; `Card.location` takes any record's id; the last location can't be deleted (DD-128 to DD-132, DD-140).* | FR-02, FR-22, US-11, DR-12, DR-14, DC-07, DC-08, DC-10, DD-10, DD-11, out of scope, known limits |
| RD-18 | **Delete old purchases.** Settings › Reset offers deleting purchases older than 6 months, 1 year or 3 years, or all of them. Saved lists and payments from the same time go with them. Only purchases on fully paid statements go, with the payments that settled them, so what each card owes, its credit and its room don't change. It says how many will go and asks a second time. *Delete all data* stays (FR-32). *Shipped in phase 6: a sheet from Settings › Reset with the four ages, the count and how many older purchases stay (DD-135, DD-136).* | FR-32, US-21, new |
| RD-19 | **Settings layout.** Display (language, theme); Locations (one row into RD-17); Backup (download, copy as text, restore a copy); Reset (delete old purchases, delete all data); About (RD-20). *Shipped in phase 6: each section a panel of rows, two columns from 900px (CD-11); restore in a sheet (DD-134).* | CD-11, FR-29 to FR-34 |
| RD-20 | **About, and marking a build that isn't production.** About lists *Environment* as one word (Development, Local, Preview, Production); *Built*, in the viewer's time zone, hidden in development; *Source on GitHub*, the branch with the PR number on a preview, linking the repository; *Commit*, linking it, on preview and production only; and *Changelog*, on production only. Any other build tints the header and the phone's bottom bar in its own colour, marks the tab title `(dev)`, `(local)`, `(pr-<n>)` or `(preview)`, and shows the same mark as plain text right after the brand, in the header's run of brand, mark and date. Needs build stamps for the environment and the branch. *Shipped in phase 2.* | FR-37, UI-20, DC-11, DD-35, DD-46, CD-02 |
| RD-21 | **The look.** Calm for a ten-minute visit: soft sage neutrals, a gentle green accent, a pastel colour per limit group on card chips, rounded shapes and generous spacing, in both themes. Amber and rose tints mark warnings and overdue, always with words. *Shipped in phase 2; the pastel card chips and the card page's hero on its group's pastel shipped with the Cards page in phase 5 (DD-118, DD-120).* | RD-03, G8 |

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
| FR-02 | Location is one of Bangkok, Phichit or Krabi, chosen from a list. A stored location the app does not recognise is reset to Bangkok once at startup, and the registry (the Cards page since phase 5) names the reset cards once, with a Dismiss button. *(Since phase 6 a location is any stored location record, chosen from them A to Z by shown name (RD-17, DD-132). A card naming no stored record is repaired at startup and after a restore (DD-130), and the Cards page still names the moved cards once.)* | BR-05 |
| FR-03 | A billing cycle is either *closes on day N, due M days later* (M from 1 to 60) or *closes on day N, due on day M* (days 1 to 31). See DR-04. | BR-03, BR-05 |
| FR-04 | A card may be marked supplementary (บัตรเสริม) with its own cardholder. Otherwise the cardholder is the account holder of its limit group. | BR-05 |
| FR-05 | A card can be edited, archived or unarchived, and deleted only while it has no purchases. Archived cards leave the dashboard and the purchase form but keep their history and still count against their group's limit. | BR-05, BR-02 |
| FR-06 | *(Since phase 5 the Cards page, RD-16: search matches id, name, last 4 and comment; the filters are *Kept in* and *Account holder*, with no limit group filter and no "not assigned"; the sorts are by place, most room, name and close day (DD-116). The view is kept in the address, DD-115. Since phase 6 *Kept in* offers every location, and a *Not in a group* option finds cards with no limit group, DD-137.)* The card list can be searched (name, id, last 4, comment), filtered by cardholder, location and limit group (including "not assigned"), and sorted by name, location, group or close day. The view is kept in the address, so a reload or a shared link keeps it (DC-15). | BR-05 |
| FR-07 | *(Since phase 5 a card is added and edited on a full screen, `/card/new` and `/card/edit?id=` (DD-114), and a limit group in a sheet over Cards (DD-112); each stays open on a failed save. Only the archived cards fold, and remember it (DD-113); the card list and the limit groups no longer fold.)* Cards and limit groups are added and edited in a dialog, opened by an Add button or a row's Edit button. The dialog stays open on a failed save and closes only once the write has landed. The card list, the archived list and the limit group list fold, and each remembers whether it was left open. | BR-05, BR-10 |
| FR-38 | *(Since phase 5 the card page's *Edit* opens the edit screen, `/card/edit?id=<id>` (DD-114).)* The card page's *Edit card* opens that card's edit dialog in the registry (`/cards?edit=<id>`). | BR-05 |

### Limit groups and spendable credit

| ID | Requirement | Serves |
|---|---|---|
| FR-08 | A limit group has a name, a credit limit in baht (above zero) and an account holder (KC, NT or RI). Every card must point at one group; a card on its own is a group of one. A group can be deleted only while no card uses it. | BR-02, BR-05 |
| FR-09 | A group's available credit is its limit less every purchase on a statement not yet marked paid, including the open period. Marking a statement paid gives back exactly that statement's total. See DR-09. | BR-02 |
| FR-10 | *(Since phase 5 the limit groups are panels beside the cards, with no search, filter or sort: name and holder, room of limit, the bar, the card ids, % used and *getting full* (DD-117). Since 2026-11-02 they are A to Z by name, DD-148.)* The limit group list shows each group's owner, limit, cards, used and available amounts, and can be searched, filtered by owner and sorted. | BR-02 |
| FR-11 | *(Retired in phase 3: replaced by Ready to use, RD-15.)* *Can spend now* lists each unarchived card that can take a purchase, with its available credit out of its limit, how much of the limit is used (DR-23), whether the limit is shared (DR-24), and the close and due dates a purchase made today would get, each with a relative date (DR-27). It counts cards with no group and links to assign them. It sorts by card, available, closes or due. | BR-02 |
| FR-12 | The card page shows the card's available credit, what is still owed on it (what is left on every statement not fully paid), and its next due date with what is left on it. | BR-01, BR-02 |

### Statements and payments

| ID | Requirement | Serves |
|---|---|---|
| FR-13 | Statements are derived from the card's cycle and its purchases, never stored. See DR-03 to DR-05. | BR-03 |
| FR-14 | *(Since phase 4 the payment is made in the payment sheet, RD-14, not in a dialog on a statement; there is no per-part undo, and a wrong payment is deleted from Transactions in two steps, DD-77.)* *Mark paid* on a closed statement opens a dialog for the amount and the date paid, starting at what is left and today, so paying in full is still one confirm. A statement can be paid in several parts and counts as paid once they cover its total. Each payment can be unmarked on its own. The first payment freezes the close and due dates. The open period has no *Mark paid* button; it reads "still open". | BR-01, BR-06 |
| FR-15 | *(Off Home since phase 3; shipped in Transactions as *Owed*, RD-13, phase 4, DD-89. A row leads to the payment sheet on its card, `/pay?card=`, instead of marking paid in the list.)* *Due next* lists, per unarchived card, what is due next (DR-06), with close date, due date, what is left to pay (with the full total under it), and an urgency label (DR-07). Rows can be marked paid from the list and sorted by card, location, closes, due or what is left. | BR-01 |
| FR-16 | The card page lists statements newest first, marks the current one, folds runs of quiet months into one line (DR-22), and shows 12 periods at a time with *Show older statements* for 12 more. A statement the payments cover in full reads "Paid in full"; one they cover in part reads "Paid ฿X" with "฿Y left" under it. *(Since phase 4 the statement list is read-only: it no longer lists each payment, and has no per-part *Unmark* and no *Mark paid*. A wrong payment is deleted from Transactions, DD-77; the card summary has one *Make a payment* link, DD-78.)* *(Since phase 5 a row reads `Mon YYYY` with a tag (*Current*, *Overdue N days*, *Due in N days* within 7, *Due D* or *Paid*), `closes D · due D` or *paid in full*, and what is left on the right; a row with purchases unfolds to them, each with *Edit* and *Delete* (DD-111, DD-118).)* *(Since 2026-11-01 an unfolded statement also lists the payment parts that settled it, from the ledger, in one list with its purchases by date: `date · Payment · +฿part`, with `(part of ฿total)` when the payment was split across statements. A payment part has no *Edit* or *Delete* (payments are deleted from Transactions, DD-77), and a statement with payments but no purchases unfolds too (DD-122).)* | BR-03 |

### Purchases

| ID | Requirement | Serves |
|---|---|---|
| FR-17 | A purchase has a card, a date, an amount in baht (stored in satang) and an optional note. It records when it was first entered; an edit keeps that time. *Since 2026-11-01 a purchase added on the card page is stamped `addedAt` when it is saved (DR-15, DD-121).* | BR-03 |
| FR-18 | After adding, the app says which statement the purchase lands on and when it is due. | BR-03 |
| FR-19 | The form shows the selected card's available credit. A purchase over it is saved, and the confirmation says by how much it went over which group's limit. *Met on purchase lists by RD-10 since phase 3. Since phase 5 the card page adds no purchase, so its dialog and this note are gone (DD-111). Since 2026-11-01 a purchase can be added again (DD-121): the card page's hero shows the room, and after a save over it the card page says "Saved. It went ฿X over the room of <group>.", X being this purchase's own overshoot, `amount − max(room, 0)`, the room measured before the save (DD-126). An edit never says it (DR-11).* | BR-02, BR-07 |
| FR-20 | The form warns, without blocking, when the date is the card's close date (the bank may post it on either statement) and when the date is in the future. *Met on purchase lists by RD-10 since phase 3. Since phase 5 the card page's edit sheet keeps both warnings (DD-111). Since 2026-11-01 the same sheet in add mode, on the card page, warns the same way (DD-121).* | BR-03, BR-07 |
| FR-21 | A purchase can be edited (date, amount, note; the card stays fixed) or deleted from the card page, archived cards included. *Since phase 5 its statement row unfolds to it; *Edit* opens a sheet and *Delete* asks twice (DD-111). Since 2026-11-01 the card page's *Add purchase* opens that sheet in add mode, the card fixed (DD-121); the payment parts listed beside the purchases have neither button (DD-122).* | BR-03 |
| FR-22 | Only cards kept in a place ticked under *Purchases* in Settings can take a new purchase. Default: Krabi only. When none qualify, the form says how to fix it; on the card page of a card that can't take one, the add button is hidden and a note says how to fix it. *Since phase 5 the card page's *Use on a list* gives way to that note, which names the reason: the card is archived, it has no limit group (or its group was deleted; a list needs the group, DR-20), or its place isn't ticked (naming the place and Settings), checked in that order (DD-118).* *Since phase 6 the tick is *Takes purchases* on each location record at Settings › Locations (RD-17); the default records leave only Krabi ticked. The notes on Home, the new-list picker and the card page link to `/settings/locations` (DD-142).* | BR-11 |

### Dashboard workspace

| ID | Requirement | Serves |
|---|---|---|
| FR-23 | *(Retired in phase 3: replaced by RD-09, purchase lists.)* The dashboard's purchase form is always open. After each add it keeps the card and date and clears amount and note. A failed add keeps what was typed and shows the error beside the form. With exactly one eligible card, the card is shown as text rather than a list to pick from. | BR-04 |
| FR-24 | *(Retired in phase 3: replaced by RD-09, purchase lists.)* *This sitting* lists purchases entered since *Start new batch* was last pressed (DR-16), with how long ago, card, purchase date and amount, and a count and total. It survives reloads, closing the tab and the next day. *Start new batch* asks for a second click before clearing. | BR-04 |
| FR-25 | *(Off Home since phase 3; shipped in the Transactions ledger, RD-13, phase 4, DD-85 to DD-88.)* *Purchases by date* counts purchases, their total and the cards used, across every card (archived ones tagged), for Today, This week, This month, Last month or a custom range of purchase dates (DR-17), with a card filter. The list is folded until opened and grouped by day, each card linked to its page. | BR-12 |
| FR-26 | The dashboard re-reads the clock each minute, so a tab left open past midnight moves its default date and presets to the new day, without changing a date the user picked. *Home keeps re-reading the clock since phase 3.* | BR-04 |
| FR-27 | *(Retired in phase 3: replaced by RD-09, purchase lists.)* The purchase form and *This sitting* are the first things on the dashboard, beside or above the overview panels, on desktop and on a phone. (Today's layout is CD-03.) | BR-04, BR-10 |

### Data, backup and reset

| ID | Requirement | Serves |
|---|---|---|
| FR-28 | All data lives in the browser's `localStorage`. If the browser refuses storage, the page says so. | BR-08 |
| FR-29 | A backup can be saved as a downloaded JSON file or copied as compact text. *Since phase 6 they are the rows *Download a copy* (its subline the filename it will save) and *Copy as text* (which reads *Copied* after), under Settings › Backup.* | BR-08 |
| FR-30 | A backup can be restored from a file or pasted text. If the browser already holds records, the user sees both sets of counts and chooses *Merge* (keep what is here, add the copy's records, and overwrite any it shares) or *Replace* (delete everything first). An empty browser restores at once. *Since phase 6 *Restore…* opens a sheet that reads the clipboard first, with a file or pasting by hand beside it, and asks Merge or Replace in the same sheet (DD-134). Merge keeps the local location records (DD-131).* | BR-08 |
| FR-31 | A backup's shape is checked before anything is written (DC-06). A malformed file is rejected with a message naming the record and the problem. | BR-08 |
| FR-32 | *Delete all data*, under Settings › Reset, deletes every card, limit group, purchase, payment, purchase list, location and setting. *Delete…* swaps the row for a warning in place: "This deletes N cards, N purchases, N payments, N limit groups, N lists. Language and theme stay. It can't be undone.", naming how many of each record will go (the same counts as a restored copy, each "1 card" or "N cards" as it falls), with *Keep my data* and *Delete everything* (danger). Afterwards the default locations are seeded again (DC-04, DD-128). *(Phase 6 first followed the prototype, which counted cards only; the user asked for the count of each kind back on 2026-11-02.)* *Delete old purchases* beside it deletes only old purchases on paid statements (RD-18). | BR-08 |
| FR-33 | Every write is awaited and followed by a fresh read from storage. A failed write or read shows a banner naming what failed, with a *Reload* button that reads the data again. | BR-08 |

### Language and presentation

| ID | Requirement | Serves |
|---|---|---|
| FR-34 | The interface is in Thai and English, picked under *Display* in Settings. Switching re-renders in place without losing typed input, and the choice is remembered. With nothing saved, the app follows the first of the browser's languages that it speaks, in the browser's order, else Thai. | BR-09 |
| FR-35 | Dates read `dd MMM yyyy`, zero-padded, with Gregorian years in both languages; amounts read `฿1,234.56` in both. Text the user typed is never translated. | BR-09 |
| FR-36 | The theme is picked under *Display* in Settings: Light, Dark or Device (follows the device; *Match device* until phase 6), remembered per browser. Urgency and limit usage are shown in words as well as colour. Every table stays readable on a phone. | BR-10 |
| FR-37 | *(Retired: the footer.)* The footer is gone; the commit, build time and links now live in Settings › About, and a non-production build is marked in the header (RD-20, UI-20). | -- |

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
- *Ready to use* on Home (RD-15, since phase 3) lists only unarchived cards that can take a purchase.
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
  assigned". *(Since phase 5 the link opens the Cards page, which has no "not assigned"
  filter; a card with no group shows `—` where its room would be. Since phase 6 the link opens
  `/cards?ungrouped=1`, the Cards filter's *Not in a group*, DD-137.)*
- The card form will not save without a group, and its group list is disabled until a group
  exists.
- *Covers FR-06, FR-08, FR-11.*

### Entering receipts

**US-07 -- Build a purchase list quickly.** As a bookkeeper, I want to tick cards, enter amounts, review the list and mark it sent, so that I can plan a day's buying without extra steps.
- On Home I tick cards under *Ready to use*, then enter an amount for each on one screen.
- Review shows the dated table; I copy it as text or save it as an image, then mark it sent.
- A failed save keeps what I typed and says why.
- *Covers FR-17, FR-18, FR-23 (retired; RD-09 replaces it).*

**US-08 -- Pick up where I left off.** As a bookkeeper who gets interrupted, I want a list waiting for the spender to stay on Home until its reply is saved, so that nothing is lost after an interruption.
- A list waiting for the spender, and any draft, shows under *Needs you* on Home.
- It survives a reload, closing the tab and the next day.
- Saving the reply turns made lines into purchases and removes it from *Needs you*.
- *Covers FR-24 (retired; RD-09 replaces it).*

**US-09 -- Be warned, not blocked.** As a bookkeeper, I want warnings when an amount is unusual, so that I can check it without being stopped from sending the list.
- Over the room: amber outline with the reason under the line, and one action, *Lower to* the room.
- On the close date, on an overdue bill and on a past date: amber warnings with the reason in words.
- There is no future-date warning, since lists are planned ahead.
- *Covers FR-19, FR-20; met by RD-10.*

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
- *(Since phase 6: Settings › Locations lists every location with a *Takes purchases* tick,
  Krabi on by default; only cards in ticked places appear under *Ready to use* and on the
  new-list picker; with nothing ticked the Locations page warns that *Ready to use* is empty,
  and Home and the card page link to it, RD-17, DD-142.)*
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
- Filters: cardholder, location, limit group (including not assigned). *(Since phase 5:
  *Kept in* and *Account holder*, DD-116.)*
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
- *(Since phase 5 a card has a full edit screen and a group a sheet over Cards; only the
  archived cards fold; the card page's *Edit* opens `/card/edit?id=`, DD-112 to DD-114.)*
- *Covers FR-07, FR-38.*

### Data safety

**US-19 -- Back up my data.** As a bookkeeper, I want to save a copy of everything as a file or
as text, so that clearing the browser doesn't lose my records.
- *Download a copy* (its *Download* button) saves indented JSON named `cc-tracking-<date>.json`;
  *Copy as text* (its *Copy* button, which reads *Copied* after) puts compact JSON on the
  clipboard. *(Until phase 6: *Download file* and *Copy text*.)*
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
- *Delete…* asks in place: it says how many of each record go (cards, purchases, payments,
  limit groups, lists) and that it can't be undone; *Keep my data* backs out, *Delete everything*
  (danger) deletes.
- My language and theme are kept, and the warning says so.
- Afterwards the default locations are back, so Home and the Locations page aren't empty.
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
| DR-10 | **Can spend now** shows the open period's close and due dates (DR-08), not what is due next (DR-06). On a card with an overdue statement the two differ, and both are right for their question. *Applies to *Ready to use* since phase 3.* |
| DR-11 | **Over-limit note.** Adding a purchase above the available credit saves it and names the amount over and the group. Editing a purchase never shows the note, because available credit already counts the old amount. |
| DR-12 | **Who can take a purchase**: an unarchived card whose location is in the Settings list. The default list is Krabi only. An empty list is a real answer (nobody can), not "unset". *(Since phase 6 the list is the location records ticked *Takes purchases* (RD-17); the default records tick Krabi only, and none ticked still means nobody.)* |
| DR-13 | **Owners.** A group's account holder is KC, NT or RI; a missing or unknown value reads as KC. A card's cardholder is its own owner if it is supplementary, otherwise its group's account holder, otherwise nobody (no group). A group is labelled `Name (OWNER)`, untranslated. |
| DR-14 | **Locations** are `bangkok`, `phichit` and `krabi`; the default is `bangkok`. *(Since phase 6 those are the ids of the three default records, and any other stored record is a location too, its id made from its name (DD-51). A new card starts at `bangkok` when that record exists, else the first A to Z (DD-140).)* |
| DR-15 | **Entry time** (`addedAt`) is set when a purchase is first saved, from the dashboard or the card page, and an edit keeps it. Purchases saved before 2026-10-27 have none and are never backfilled. |
| DR-16 | *(Retired in phase 3 with *This sitting*; replaced by waiting lists on Home, RD-15.)* ***This sitting*** holds purchases whose entry time is at or after the batch start, latest entered first. On the very first load the batch start is set to that moment, so the list starts empty. |
| DR-17 | **Date ranges** filter on the purchase date, not the entry time. Weeks run Monday to Sunday. The default preset is This month. A custom range typed backwards is turned the right way round. Within a day, the latest entered comes first. |
| DR-18 | **Card page history** counts back from the later of the open period and the period of the latest purchase, so a future-dated purchase still has a statement to edit it from. |
| DR-19 | **Identity and deletion.** A card id is unique and never changes. A card can be deleted only while it has no purchases (otherwise archive it). A group can be deleted only while no card uses it. (Storage enforces both now, and the UI still hides the buttons; see DC-13.) |
| DR-20 | **Not assigned** means an unarchived card with no group, or with a group id that matches no group. The card form requires a group. A not-assigned card is left out of *Can spend now* until it is given one. |
| DR-21 | **Card page paging**: 12 periods are shown, and *Show older statements* adds 12 more. |
| DR-22 | **Quiet months**: consecutive statements that are closed, empty and unpaid fold into one line. The open period and a paid empty statement never fold. The first is where the next purchase lands; a paid empty statement is kept as a rule only: since phase 4 a statement is paid only with money paid against it, so one with a total of zero stays unpaid and folds like any other quiet month. A statement with purchases starts expanded. |
| DR-23 | **Usage**: the share of the limit used, clamped to 0--100%. Amber from 80%; red only when used is greater than the limit. A zero limit reads as full once anything is spent. |
| DR-24 | **"Shared with N more"** counts every other card in the group, archived ones included. |
| DR-25 | **Cycle inputs**: close day and due day 1 to 31, days until due 1 to 60. |
| DR-26 | **Last 4** is exactly four digits in the card form. |
| DR-27 | **Relative dates** in *Can spend now* read "today", "in N days" or "N days ago". A past date there is never called overdue; overdue is the due list's word. *Applies to *Ready to use* since phase 3.* |
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
| DC-02 | **Record keys** in `localStorage`: `cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, `cc:payment:<cardId>:<period>`, `cc:limitgroup:<id>`, `cc:cardpayment:<cardId>:<id>`, `cc:statementdates:<cardId>:<period>`, `cc:list:<id>`, `cc:location:<id>`. Phase 4 adds no key. Each segment is `encodeURIComponent`-encoded. Deleting a card also removes its card payments and statement dates; it scans `<encoded id>:` with the trailing colon, so it never touches a card whose id merely starts with the same text. |
| DC-03 | **Other keys**: `cc:settings`, `cc:batch-start` (start of *This sitting*, an ISO instant; no longer read or written since phase 3, a leftover stays until reset, DD-14), `cc:lang` (`en` or `th`), `cc:theme` (theme pick), `cc:panel:<name>` (`open` or `closed`; since phase 5 only `cards-archive`, the Cards page's archived fold, DD-113; the old `cards`, `cards-archived` and `limit-groups` are no longer read, and a leftover stays until reset), `cc:migration:location` (cards reset by the location migration), `cc:migration:location-records` (`done` once the default location records are seeded, since phase 6, DD-128), `cc:migration:payments` (`done` once stored payments are converted to card payments; written at startup since phase 4, DD-80, and by Replace on restore, DD-93), `cc:probe` (storage check at startup). A failed read or write of language, theme or panel state falls back to the default and never breaks the page. |
| DC-04 | **Reset** removes cards, purchases, payments, limit groups, card payments, statement dates, lists, locations, settings, the batch start and every `cc:migration:` key (any pending migration notice, the payments marker and, since phase 6, the location seed marker). It keeps language, theme and panel state, so the page doesn't change under the reader. *Since phase 6 Settings seeds the default locations again right after *Delete all data*, Krabi taking purchases, so Home and the Locations page are not empty (DD-128).* |
| DC-05 | **Backup format**, version 3 *(version 2 until phase 4, DD-15; replaced by DD-93)*: `{ version: 3, exportedAt, limitGroups, cards, purchases, payments, statementDates, lists, locations }`, where `payments` are card payments (with their optional `note`, DD-101) and `locations` carry `takesPurchases`. The batch start, language, theme and panel state are never in a backup. Download, copy and restore all use it. A file of version 2 is converted on the way in (payments with their `parts` become card payments, its optional `settings` give the locations, and it has no lists); any other version is rejected. Since phase 6 export writes the location records as stored, or the default locations while none is stored (DD-139), and import never writes settings (DD-94 retired). The download is named `cc-tracking-<exportedAt date>.json`. |
| DC-06 | **Restore checks shapes and ranges**: valid JSON, version 2 or 3, the lists of that version present (a version 3 file also needs its statement dates, lists and locations, each record checked, and a list line's `actual`, `made` and `note`); each record an object; ids, names, `last4` and `cardId` present; owner in its closed set; a card's location in the closed set in a version 2 file, and among the file's own location ids in a version 3 file (since phase 6, `backup.problem.unknownLocation`); cycle kind known with whole-number days; dates valid `YYYY-MM-DD`; amounts and limits whole numbers; `addedAt` a valid instant if present; a card payment's or list line's `note`, if present, text (DD-101, DD-102); a payment's `parts`, if present, a non-empty list of valid dates and whole-satang amounts above zero. *Since phase 1 (RD-06) it also checks ranges, as the forms do:* purchase, card payment and list line amounts, a line's `actual` and a group's limit above zero; `last4` exactly four digits (DR-26); close day and due day 1 to 31 and days until due 1 to 60 (DR-25); a card payment's status `planned` or `paid`, a list's status `draft`, `sent` or `saved`, a line's `made` and a location's `takesPurchases` true or false. A version 2 file's payments are checked for shape only, then converted. It does not check `limitGroupId`, `archived`, `comment` or `supplementary`, that a `cardId` names a card in the file, or that a due date falls after its close date. Unknown places inside `settings` are dropped, and a `settings` that is not an object is ignored. Nothing is written when any record is bad. Restore then writes groups, cards, purchases and payments (and, from version 3, statement dates, lists and locations) in that order. It is not atomic. *Since phase 4:* counts in the confirmation include lists; Merge and Replace keep their meaning (DD-17) and Replace sets `cc:migration:payments`; import removes stale `m:` parts before converted ones (DD-95). *Since phase 6:* import no longer writes settings (DD-94 retired); Merge skips a file's location whose id is already stored (DD-131); stale `m:` parts are removed only for a file converted from version 2, so a Merge of a version 3 file deletes nothing (DD-95, DD-133); after the write the default locations are seeded if none is stored and every card naming no stored record is repaired (DD-128, DD-130). A card whose group is not in the file is still imported. |
| DC-07 | **Record shapes** (`src/lib/domain/types.ts`): `Card { id, name, last4, location, cycle, comment?, archived, supplementary?, owner?, limitGroupId? }`, where `location` is a location record's id (any record since phase 6, RD-17); `LocationRecord { id, name, takesPurchases }`; `CycleRule` is `{ kind: "offset", closeDay, dueOffsetDays }` or `{ kind: "fixed", closeDay, dueDay }`; `Purchase { id, cardId, date, amount, note, addedAt? }`; `StatementPayment { cardId, period, paidAt, closeDate, dueDate, parts? }` with `PaymentPart { paidAt, amount }`; `LimitGroup { id, name, limit, owner? }`; `CardPayment { id, cardId, date, amount, status, period?, note? }` where `status` is `planned` or `paid`, `period` is set only on records converted from the old model, and `note` is absent when none was written (DD-101); `PurchaseList { id, date, status, lines, sentAt?, savedAt?, movedTo? }` where `status` is `draft`, `sent` or `saved`, with `ListLine { cardId, amount, made?, actual?, note? }`, whose `note` is trimmed and absent when blank (DD-102). A backup's notes (payments and list lines) are trimmed on import and a blank one dropped, so the rule holds for restored data too. Purchase and group ids are random UUIDs. Amounts and limits are satang. Purchases saved from a spender's reply have ids `<list id>-<n>`. |
| DC-08 | **Settings record** `cc:settings` is `{ purchaseLocations: Location[] }`. An empty list is kept as written; a missing or garbled record falls back to `["krabi"]`. *(Since phase 6 the app no longer writes it, and reads it only to seed the location records once (DD-128); a version 2 file's `settings` still gives its locations on import (DC-05). A stored one stays until reset.)* |
| DC-09 | **Stale fields.** Cards stored before 2026-09-24 carry an `owner` from when the owner was on the card; `Card.owner` is read only when `supplementary` is set, so those values are ignored. Some cards carry a per-card purchase flag from before purchase places moved to Settings; nothing reads it. Keep both guards, and don't reuse those field names for something else. |
| DC-10 | **Location migration** runs at every startup, is safe to run twice, resets unknown locations to Bangkok, and records which cards it reset for a one-time notice. A failure on one card does not stop the page loading. *(Since phase 6 it checks each card against the stored location records, after the seed, at startup and after a restore: a missing default record comes back, any other unknown value moves the card to the first record A to Z (DD-130).)* |
| DC-11 | **Build stamps.** `BUN_PUBLIC_COMMIT_SHA`, `BUN_PUBLIC_BUILT_AT` and `BUN_PUBLIC_PR_NUMBER` are stamped at build time. `BUN_PUBLIC_PR_NUMBER` is always set, empty outside previews, because an unset one is left as a `process.env` read that throws in the browser. `BUN_PUBLIC_ENVIRONMENT` (`development`, `local`, `preview` or `production`; `local` when unset at build) and `BUN_PUBLIC_BRANCH` (the branch built) are stamped too, and always set for the same reason. |
| DC-12 | **Purchase keys contain the date.** Saving a purchase first removes any key with the same card and id under any date, so an edit that changes the date moves the record rather than copying it. |
| DC-13 | **Repository deletes guard.** Storage refuses to delete a card that has purchases, a limit group a card uses, or a location a card is kept at (RD-07, shipped in phase 1 and guarded in the repository contract suite). Since phase 5 it also refuses a card on a draft or on a list waiting for the spender (DD-119); a saved list doesn't block it. `deleteCard` still removes the card's payments, card payments and statement dates. The interface still hides the buttons as well. |
| DC-14 | **Stored order.** Cards and groups are listed in key order (by encoded id). The *Saved order* sort shows exactly that. |
| DC-15 | *(Retired in phase 5, question 15: replaced by DD-115. The old keys are no longer read.)* **Address query** on `/cards`, which shared links depend on: cards `q`, `owner`, `loc`, `group` (a group id or `none`), `sort`, `dir`; groups `gq`, `gowner`, `gsort`, `gdir`. Defaults are left out. The address is replaced, not pushed, so typing doesn't fill the Back history. |
| DC-16 | *(Retired in phase 5, question 15: the edit screen has its own address, `/card/edit?id=<id>`, DD-114.)* **Deep link** `/cards?edit=<id>` opens that card's edit dialog. It is read on first load only, and an unknown id is ignored. |
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
| UI-09 | **Dangerous actions explain themselves and ask twice.** Replace and Reset each state their consequence and need a second, deliberate step. A dangerous choice uses the danger variant; the safe choice is the primary one. *Delete draft* and *Cancel list* use the danger variant but act at once, by the user's decision (DD-74). |
| UI-10 | **Don't offer what can't work.** Copy and paste buttons are hidden where the browser lacks the clipboard call they need. The card page shows a note naming the reason instead of *Use on a list* (and, since 2026-11-01, *Add purchase*, DD-121) on a card that can't take a purchase (since phase 5; it hid Add purchase before). The card page's More menu (the edit screen until 2026-11-01, DD-124) offers *Delete card* only for a card storage would delete, and the group sheet *Delete group* only for a group no card uses. The group list in the card form is disabled while no group exists. |
| UI-11 | **Saves are honest.** Writes are awaited, never shown ahead of time. A failed write keeps typed input, and its message survives the reload that follows. |
| UI-12 | **Switching language loses nothing.** The page re-renders in place; open forms keep what was typed. |
| UI-13 | **User text is never translated.** Card names, comments and purchase notes appear as typed. |
| UI-14 | **Cards are named the same way everywhere, in one of three forms** (DD-98, `card-label.ts`). *Panel* -- a row in a list or panel: the last-4 chip on the card's group pastel, then `id) name` (`[1029] 1) SCB Krabi`); Home's *Ready to use* (a *Needs you* row carries its type icon and no chip, DD-106), the new-list picker, the purchase list lines, the reply and saved lines, Transactions' rows and Upcoming, *Owed on each card*, the payment picker and the sheet's card (the Cards page rows and the card page heading too, until 2026-11-01). *Line* -- single-line text: `id) name (last4)`, short `id) name`; the copied list text, the note on left-out cards, *Add another card*, the quick-add card choice, the filter sheet's card choices and the Transactions filter chips (short on a phone), and a draft's or moved lines' cards (short). *Name* -- buttons, notices and sentences: the name, short `c-[id]` (`c-[5]`); the payment button and notes, delete confirms, list warnings, *Move … to a draft*. A short form is for a small space, swapped by CSS between a full and a short span, never by measuring. A card no longer stored keeps its id: `id) —`, and `c-[id]` for its name. The review table keeps the id in *Card* and `Name (last4)` in *Name (last 4)*. Panel links go to the card page with the id URL-encoded. *Amended 2026-11-01 for three places (DD-123): a Cards page row's title is `id) name · holder (last4)`, with `closes D · due D` under it (the open period, short dates) and a *Supplementary* tag when the card is supplementary; the card page's and the edit page's title is `name · holder (last4)` (`cardTitle`). The holder is the cardholder (`cardOwnerOf`, DR-13: the supplementary holder, else the group's account holder), left out with its `·` when unknown; `(last4)` is left out when the card has none. A new card's edit page reads *New card*.* |
| UI-15 | **Empty states name the next step**, for example "Add one on the Cards page". |
| UI-16 | **Keyboard focus is always visible**, with a ring from `--cc-focus-ring`. |
| UI-17 | **Numbers line up.** Numeric cells carry `data-numeric`: right-aligned, tabular figures. On a phone, tables become stacked rows using each cell's `data-label`, from the same markup. |
| UI-18 | **The reset's `div` convention.** `@kcstyles/reset.css` makes every `div` a flex column, with `<div row>` and `<div block>` as the alternatives, and the shared shadow styles copy it. Dropping or swapping the reset changes every layout `div`. |
| UI-19 | **Phone safe areas.** The page shell pads for `env(safe-area-inset-*)`. |
| UI-20 | **A non-production build is marked.** It is tinted, marked after the brand and marked in the tab title (RD-20), so it can't be mistaken for production. |
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
| DD-10 | Purchase eligibility is set per place in Settings, default Krabi. *(Since phase 6 as *Takes purchases* on each location record, Settings › Locations, RD-17.)* | Purchases were only ever entered against the Krabi cards, and a place rule needs no edit per card. | A checkbox on each card (shipped, then replaced). |
| DD-11 | Locations and owners are closed lists. *(Locations stopped being one in phase 6: they are stored records the reader manages, RD-17. Owners stay closed.)* | The stored key stays display-neutral and translatable; a typo can't create a new place. | Free text with suggestions. |
| DD-12 | Unknown locations are fixed once at startup, not coerced on every read. | Read-time coercion would make the type lie about what is stored and quietly fix the same rows forever. | Coercing on read. |
| DD-13 | No migration invents a group for an old card; it shows as not assigned until assigned by hand. | Any invented group would be a guess about which cards share a limit. | Creating a group per card automatically. |
| DD-14 | Stale stored fields (old `owner`, old per-card purchase flag) stay on disk. | An unread key costs nothing, and rewriting every card risks a write failure for no gain. | Stripping them in a migration. |
| DD-15 | *(Replaced by DD-93 in phase 4, question 14.)* Backups stay at version 2; new optional fields don't bump it. | A bump would reject every backup already saved. | Bumping on each new field. |
| DD-16 | Restore keeps a card whose group is not in the file. | The group may already exist in the target browser. | Rejecting or dropping such cards. |
| DD-17 | Restoring into a browser that holds records asks Merge or Replace; an empty browser restores at once. | Nobody should wipe data without reading what the button does. Settings alone don't count as records. | Always merging; always asking. |
| DD-18 | Moving data between deploys (preview to production) is copy and paste. | Storage is per origin, and an iframe gets partitioned storage. | A popup and `postMessage` bridge. |
| DD-19 | *(Replaced in phase 5 by DD-112: the registry is gone; groups are panels on Cards, edited in a sheet.)* Limit groups live on the registry page, edited through the same dialog pattern as cards. | They belong to the registry and are rarely edited, so no fourth page; one editing pattern per page. | A separate limit groups page; inline editing in table rows. |
| DD-20 | *(Replaced by RD-01.)* The dashboard is a workspace for entering receipts: the form is always open and *This sitting* lists the current batch. | The bookkeeper works through a pile and is often interrupted; the list is how they find their place. | A dialog per purchase; a separate purchases page. |
| DD-21 | *(Replaced by RD-02.)* *This sitting* survives reloads and the next day, clears only on a confirmed *Start new batch*, and is read-only. | Losing it to a reload or a stray click is exactly the failure it exists to prevent. Editing stays on the card page. | Clearing on reload; edit or undo in the list. |
| DD-22 | *(Replaced by RD-02.)* The batch start is per browser and stays out of backups. | It is working state, not a record. | Storing it in Settings. |
| DD-23 | After an add, the form keeps the card and date and clears amount and note. | Receipts come in runs from one card or one day. | Clearing everything. |
| DD-24 | Ranges filter on purchase date, and archived cards count (tagged). | A range answers "what was bought then"; archiving later must not change it. | Filtering on entry time; hiding archived cards. |
| DD-25 | Old purchases get no entry time. | A guessed time would put them in the wrong batch. | Backfilling. |
| DD-26 | With no saved choice, the language is the browser's first supported one, else Thai. | Thai company cards, baht, Bangkok dates: Thai is the likely daily language, but a browser that prefers English should get it. | Thai always; any English entry winning. |
| DD-27 | Language and theme are kept in browser storage, outside the repository and backups. | They must apply before any data loads, and they belong to the reader, not the records. | Storing them in Settings. |
| DD-28 | *(Replaced by RD-05.)* The theme is applied by the page script, not an inline `<head>` script. | Simpler; a brief flash of the wrong theme on load is accepted for now. | An inline head script. |
| DD-29 | A hand-written translation catalog; switching re-renders in place. | `@lit/localize` needs an extraction tool and XLIFF files, too much for two languages. A reload would lose half-filled forms. | `@lit/localize`; reloading on switch. |
| DD-30 | Thai sorting uses code-unit order. *(Since phase 6 location names and the Cards name sort use `localeCompare` with the reader's language, DD-132; dates are untouched.)* | `Intl.Collator` on `th-TH` risks the Buddhist Era handling dates avoid; today's locations sort the same either way. | `Intl.Collator`. |
| DD-31 | Components use shadow DOM with shared style modules built on tokens; `@kcstyles/reset.css` replaces Pico. | Document styles never reached inside shadow roots, so most components were unstyled. | One shared stylesheet pushed into every shadow root; rendering into the light DOM. |
| DD-32 | *(Replaced by RD-03.)* Teal accent on warm neutrals. | Teal stays clearly apart from the danger red and warning amber beside it. | The earlier cool grey and blue. |
| DD-33 | The usage bar measures everything unpaid against the limit and reads "of the limit used". | It matches the figure *Can spend now* already shows. | "Used this cycle". |
| DD-34 | Dashboard panels start sorted by soonest close date, and their sort resets on reload. | One shared default; panels have no saved order. The cards page keeps its view in the address instead. | Saving panel sort; most room first. |
| DD-35 | The footer's changelog link points at `main`, not the built commit. | An old deploy still points readers at the latest entries. | Linking the built commit. |
| DD-36 | "Cardholder" (หน้าบัตร) names the person on a card; "Account holder" (เจ้าของบัตร) names a group's owner. | Both used to read "Owner", which didn't tell them apart. | One word for both. |
| DD-37 | Partial payments are parts inside the one payment record per card and period, not separate records. | The storage key and the backup's `payments` list stay unchanged, and an old record reads as one full payment, so no migration. | A separate record per payment, with its own id. |
| DD-38 | The first payment freezes the statement's dates; later payments keep them. | Settled history must not move once anything is paid against it (DD-02). | Re-freezing on each payment. |
| DD-39 | Purchases are planned as lists and confirmed by the spender, not entered from receipts. | That is how buying works: the bookkeeper chooses cards and amounts before anything is bought, and the spender confirms afterwards (2026-10-30). | A receipt entry screen (RD-01) with recent entries (RD-02). |
| DD-40 | Pick cards first, then enter amounts on their own screen. *Revised 2026-10-31: the picking moved from Home to the new-list picker `/list/new` (DD-103).* | With several cards ready, picking from a list is easier than scanning a form, and one amount per block isn't cramped on a phone. | One form with an amount field on every card row. |
| DD-41 | Going over the room offers one action, *Lower to* the room. | Simple to read and act on. Paying first stays one tap away on the Payment button. | *Pay first* in the warning; moving the extra onto another card. |
| DD-42 | A payment belongs to a card, settles the oldest statement first, and any extra becomes credit. | Payments are made on any day, often to make room, not one per statement. | Payments per statement (DD-37); only flagging an overpayment. |
| DD-43 | Transactions is one ledger of purchases (−) and payments (+). | One place to look; sign and word show direction, never colour alone. | Separate *Purchase lists* and *Payments* tabs. |
| DD-44 | The Payment button, floating on every page (DD-57), opens the payment form and asks for the card first. | Paying is frequent, and the form must know the card. A separate *+ Plan* button did the same job. | The button starting a purchase list; a *+ Plan* button on the payments view. |
| DD-45 | Navigation is Home, Transactions, Cards and Settings, with Payment one tap away (DD-57); on a desktop the tabs sit on the right of the header. | Matches how often each task happens, with Settings one tap away. | A cog in the top-right corner for Settings; a three-tab bar. |
| DD-46 | Every build other than production is tinted, marked after the brand and marked in the tab title. | Nobody should mistake a test build for the real data. | Marking previews only, with `(pr-<n>)` on the brand. |
| DD-47 | A payment is planned or paid, as a field. | RD-12 says a plan counts only once marked paid, so a plan whose date passes stays a plan. | Treating any future-dated payment as a plan. |
| DD-48 | A payment converted from an old per-statement record keeps that statement (`period`); it pays that statement first and only overflow joins the oldest-first pool. Old overpayments are capped at the statement total when converted, so a converted statement shows the capped paid amount: one that showed 1,500 paid on a 1,000 total now shows 1,000 paid, and what is left, 0, is unchanged. The conversion runs once, marked done by `cc:migration:payments`, with ids `m:<cardId>:<period>:<index>` so a failed run can be repeated safely and no two cards' converted payments share an id. | Every old statement keeps exactly the left amount it showed, and its paid amount wherever it was not overpaid (G4), and the old app never carried overpaid money anywhere. | Feeding old payments into the oldest-first pool; converting overpayments into credit; deciding "already converted" by whether any card payment exists. |
| DD-49 | Frozen statement dates are their own record (`cc:statementdates:<card>:<period>`), written the first time money reaches a statement. | Payments no longer belong to one statement, so they can't carry its dates (DD-02, DD-38). | Freezing dates on each payment. |
| DD-50 | Only lists waiting for the spender hold room; drafts don't. | RD-09 says a waiting list holds its amounts. | Drafts holding room too. |
| DD-51 | Bangkok, Phichit and Krabi keep the ids `bangkok`, `phichit`, `krabi`; a new location's id is a slug of its name (`-2`, `-3` on a clash, `location` when the name has no Latin letters or digits); renaming keeps the id. Deleting old purchases removes only purchases on closed, fully paid statements before the cutoff, with an equal amount of paid payments (trimming one if needed), and leaves a card out entirely if its owed or credit would change. | Cards and stored data refer to the id; RD-18 promises balances don't move. | Renaming ids; deleting whole statements only. |
| DD-52 | In the light theme the warning, danger and muted text colours and the accent fill are darker than the prototype's: `#95591a`, `#a8403d`, `#5f6b65`, `#367d5f`. | The prototype's colours fell short of the contrast UI-21 requires on the light panels. `#367d5f` is the accent fill that white text sits on, not an accent text colour. | Keeping the prototype colours. |
| DD-53 | The header date reads `<day>, <dd> <Mon>` on a phone (`Fri, 30 Oct`, `ศ., 30 ต.ค.`) and adds the year on a desktop (`Fri, 30 Oct 2026`); the day is padded and the year Gregorian. | The user asked for it after testing the phase 2 preview (2026-10-30). With Payment out of the header a phone has room for the weekday, but not for the year as well. | `dd MMM yyyy` without the weekday; the year on a phone too. |
| DD-54 | `/card?id=` marks the Cards tab as current. | A card belongs to Cards; no tab should look unselected on a card's page. | No tab marked on a card. |
| DD-55 | A preview build without a PR number reads `(preview)` in its header mark and its title. | A preview can be built without a pull request; the mark must still say it isn't production (RD-20). | Hiding the mark; a made-up number. |
| DD-56 | The desktop layout starts at 900px. | Below it the bottom bar fits a phone or small tablet; from it the four tabs fit the header's one line, right of the brand, mark and date. | 640px or 960px. |
| DD-57 | Payment is a floating button at the bottom right on every screen size; the bar keeps four tabs. *Revised 2026-10-31: the button is *+ New* and opens a menu with a new purchase list and a payment (DD-104).* | The user asked for it after testing the phase 2 preview (2026-10-30). | The raised + in the bar; a Payment button in the header. |
| DD-58 | Each list case has its own page (DD-75): `/list/new` with no `card` the new-list picker (DD-103), `/list/new?card=` (one per card) a new list, `/list/draft?id=` a stored draft, `/list/reply?id=` the reply to a waiting list, `/list/view?id=` a saved list. Review stays a step on the new and draft pages, holding what was typed. The entering step's back button goes to the picker, `/list/new`, on a new list (where its cards were picked) and Home on a draft (DD-103). A page opened on a list in another state links to that list's page; an unknown id links Home. *Revised 2026-10-31* (it was one `/list` page choosing by status). | Each page marks the Home tab and has a back button; the entering flow keeps its state through review. | One page per step; review as its own address. |
| DD-59 | A list holds only ready cards, and another card is added in place on the entering screen. | Lists are for places that take purchases (RD-15); going back to Home to add one card would lose the screen. | Any card on a list; going back to Home to add a card. |
| DD-60 | Room while entering amounts counts every amount on the list in the same limit group, and only lists waiting for the spender hold room (DD-50). | Two cards on one group go over its room together, and a draft isn't a promise. | Counting each line alone; drafts holding room. |
| DD-61 | Review needs at least one amount and no bad one. *Lower to* shows only when the room is above zero. | A list of nothing, or with an unreadable amount, is not worth sending; lowering to nothing or less is not an action. | Allowing an empty list; *Lower to* zero. |
| DD-62 | *Ready to use* starts sorted by most room (the picker's default sort; Home's short panel always shows the three with the most room, DD-103). *Needs you* reads money at risk first (2026-10-31): overdue bills (most days overdue first), planned payments dated today or earlier (oldest first), lists waiting for the spender (oldest list date first), planned payments in the next one to three days (soonest first), then drafts (oldest first); ties by id. `needsYou` in `home.ts` holds the order, and *See more* keeps its first five. Each row is in the shared shape of DD-108. | Most room answers "which card can I use"; a late bill or payment costs money, a waiting list only blocks work. | Sorting by soonest close date (DD-34); drafts first; waiting lists first (the order until 2026-10-31). |
| DD-63 | *(Revised 2026-10-31, DD-73.)* The copied text is a title line (`Purchase list · <date>`), a blank line, one line per card (`10) Card A10 (4412) — ฿12,500.00`), a blank line and the total (`Total · 2 cards — ฿34,500.00`). A saved list's not-made line ends `— Not made`. | It pastes into a chat (LINE, WhatsApp, iMessage) and reads there; a chat's proportional font and wrapping break any table. | Tab-separated text; a table with cells joined by ` \| ` (shipped first in phase 3). |
| DD-64 | The saved image is always drawn light (white paper, dark text) whatever the app's theme, and is named `purchase-list-<date>.png`. | It is sent to other people, who see paper, not this reader's dark mode. A canvas cannot read the theme's tokens, so the colours are fixed in the drawing. | Following the app's theme. |
| DD-65 | A saved list's table, copied text and total use only the made lines, at their real amount; a not-made line reads *Not made*. These are used when Transactions opens a saved list (phase 4); no screen shows them yet, as the saved view on `/list/view` lists its lines itself. | The saved list shows what was bought, and the total must match the purchases it made. | Showing planned amounts; counting not-made lines. |
| DD-66 | Saving a reply writes purchases (ids `<list id>-<n>`), then any draft, then the saved list. A retry overwrites those, removes any purchase or list named `<list id>-<n>` that a failed save wrote and the retry doesn't rewrite (an orphan draft included; a UUID or `<list id>-<n>-<m>` is not the reply's and stays), and a list already saved is refused. Save as draft and Mark sent likewise refuse a draft sent or saved elsewhere. | A save that stops halfway can be repeated without doubling purchases, and the list turns saved only after everything it made exists. | Random purchase ids; writing the saved list first. |
| DD-67 | *(Done in phase 5: the dialog went with the old card page, DD-111.)* The card page keeps its Add purchase dialog until phase 5 replaces the card page; production only sees the finished stack. | Removing it early would leave a card page with no way to add or edit a purchase, and the phases ship together. | Removing the dialog in phase 3. |
| DD-68 | Save image hands the PNG to the share sheet where the browser can share files, and downloads it elsewhere (or when the share fails); closing the sheet is not an error. | On a phone the image goes straight to the chat app, with no trip through the photo library. | Always downloading. |
| DD-69 | A reopened draft leaves out cards that can no longer take purchases and names them in a note. After a save the page is replaced in history, so Back doesn't reopen the list. | The reader sees why a line is gone, and Back doesn't land on a list already sent. | Dropping the cards silently; keeping the list in history. |
| DD-70 | *(Replaced 2026-10-31 by DD-98.)* Home and the purchase lists name a card `id) Name (last4)` through one helper, and a narrow place drops only the `(last4)` (UI-14). | The user asked for it after testing the phase 3 preview (2026-10-31): the id alone, or the name alone, doesn't tell the bookkeeper and the spender which plastic card it is. | The id over the name in two lines; truncating the name. |
| DD-71 | Every list page hides the floating Payment button (the *+ New* menu since DD-104): each marks `<html data-list-page>` and the shell's stylesheet hides the button, so the bottom bars use their full width. The new-list picker is a list page, so its selection bar has the full width too. Other pages keep it (DD-57), Home included. *Revised 2026-10-31: Home no longer has a selection, so `<html data-selecting>` is gone (DD-103).* | The button covered the bar's Enter amounts on a phone and sat just under it on a desktop (2026-10-31); nobody pays a bill mid-pick or mid-list, and paying is one tap away on any other page. | Reserving room for the button at the bar's end; moving the bar above the button. |
| DD-72 | From 900px every list page takes the page width and splits into the lines and a sticky side panel with the date, the summary and the primary action (CD-04); on a phone the panel's pieces flow back into the one column in the same order as before. | A 48rem column left most of a desktop empty, with centred headers and a full-width Remove (2026-10-31). | A wider single column; a bottom bar on the desktop too. |
| DD-73 | The copied text is plain lines, not a table (DD-63). The image stays a table on white (DD-64). | A table pasted in a chat loses its columns; an image keeps them. | Keeping the table for the text too. |
| DD-74 | *Delete draft* (on `/list/draft`) and *Cancel list* (on `/list/reply`) act at once, with no second step. Each deletes the stored list and goes Home, and is refused with a banner if the list is no longer a draft, or no longer waiting. | The user decided (2026-10-31): both only remove a list nothing was bought from. | A two-step confirm (UI-09). |
| DD-75 | Each list page has its own address (DD-58). | A link says what it opens. | One `/list` page choosing by status. |
| DD-76 | *(Revised twice on 2026-10-31: it was a page, `/pay`, then a sheet over any page.)* `/pay` is a page: the card picker (hint, search, every card most pressing first) under the compact sub-header (DD-124), marking the Transactions tab, with no floating *+ New* menu. `/pay?card=<id>[&amount=<satang>]` shows that page with the payment sheet over it, the amount prefilled from `amount` or else the next bill (empty with none). The sheet slides up on a phone and fades in from slightly smaller from 900px (`--cc-sheet-motion`), with no motion under `prefers-reduced-motion`. Picking a card pushes `?card=` (Back closes the sheet); Close, Escape, the backdrop and *Change* leave the picker: when the page itself pushed `?card=` (a pick, or Forward onto one) they step back in history (`history.back()`), so the picker is not in history twice; when the page was opened at `?card=` directly they replace the address with `/pay` (DD-102). Every way to pay is a link: the *+ New* menu's *Make a payment* to `/pay` (DD-104); Home's overdue item to `/pay?card=…&amount=<what is left>`; an *Owed* row to `/pay?card=…`; the card page's *Make a payment* to `/pay?card=…&amount=<next bill>` (`payAddress`). A save goes to `/transactions` with `location.replace`; a failed save keeps the sheet, the typing and the reason (one that fails after Back took the sheet away says why on the page, DD-127). An unknown card says so above the picker. There is no global sheet host and no `cc:pay` event, and `/pay` no longer redirects. | The user decided it on 2026-10-31 after the rework preview: the picker deserves a page of its own, the sheet keeps the prototype's look, and an address that names the card can be linked and reloaded. | The `/pay` page with the form inline (first phase 4 build); a sheet mounted on every page and opened by an event (first rework, which left `/pay` redirecting to `/transactions`). |
| DD-77 | A wrong payment is deleted from Transactions. *Revised 2026-10-31:* a paid payment row shows its amount on the right and a visible right-aligned *Delete* button (danger) under it (at the right of the bottom line on a phone), the same pattern as *Upcoming*'s (DD-108, DD-110); purchase rows have none. Tapping *Delete* swaps it in place for *Delete* (danger; its `aria-label` is the question "Delete ฿X to CARD?") and *Cancel* (primary), which restores it (UI-09); focus moves to the asking *Delete*, and back to *Delete* on *Cancel*, as it does for *Upcoming*'s *Confirm* and *Save*. Tapping the row opens and expands nothing. A planned row has *Paid* (DD-108) and the same delete. There is no per-part *Unmark*. | Taken by the controller while the user was away (2026-10-31), as the recommended option. Payments belong to a card (RD-11), so there is no statement part to unmark; deleting the payment is the same act, from the one place that lists payments. | Keeping *Unmark* on each statement part; a one-step delete. |
| DD-78 | The card page and the Cards page read the ledger in phase 4. The statement list loses *Mark paid* and per-part undo; the card summary gets one *Make a payment* link to the payment sheet on the card (DD-76). `cc-payment-form`, `payment-dialog.ts` and their keys go. | Taken by the controller while the user was away (2026-10-31), as the recommended option. Both pages must show the numbers that Transactions shows, and a per-statement *Mark paid* would write the old model. The new card page is phase 5. | Keeping per-statement *Mark paid* on the card page until phase 5. |
| DD-79 | Transactions has a switch *Ledger · Lists · Owed*, a small segmented control beside the title. Under it, the search box (with its icon) and a *Filter* button with a count of the filters in use share one row; a *Sort: Newest first ▾* chip (which opens the filter sheet) and the removable filter chips go below. From 900px *Owed* leaves the switch and the page is two columns (about 1.4 : 1): the ledger or *Lists* on the left, *Owed on each card* (heading, sort chip, one panel of rows) on the right. On a phone *Owed* shows that panel under the title. Each day of the ledger, *Upcoming*, *Owed* and *Lists* is one panel of rows with a line between each. *(Layout revised 2026-10-31 after the preview, to match the approved prototype.)* | Taken by the controller while the user was away (2026-10-31), as the recommended option. A phone shows one view at a time; a desktop has the room to show what each card owes beside the ledger. | *Owed* always beside the ledger; *Lists* on a page of its own. |
| DD-80 | At startup `bootstrap` awaits `migrateLocations` (a failure is logged, as before), then `migratePayments(repo, localStorage)`. A rejection renders `cc-error-banner` with a reload button instead of the page; the marker stays unset, so the reload retries. | Numbers read from half-converted payments would be wrong, so the page must not show them. The marker is written after the writes, so a retry is safe. | Logging the failure and showing the page anyway. |
| DD-81 | Every write that makes a payment paid (record, mark paid) also saves the card's newly frozen statement dates, `newlyFrozen(card, ledgerAfter, dates)` (DD-49). | The first payment freezes a statement's close and due dates (FR-14); the ledger now creates payments from more than one place, so the rule runs in the one writer. | Freezing only when a statement is marked paid. |
| DD-82 | *Mark paid* on a planned payment sets `status: "paid"` and the date to the plan's date when that is today or earlier, else to today (paid early). | A payment dated in the future would sit in the ledger as if it already happened; today is when the money actually moved. | Always keeping the planned date; always using today. |
| DD-83 | *Upcoming* holds the lists waiting for the spender (oldest date first; the row opens `/list/reply?id=`) and the planned payments (by date, then id). Planned payments are never in the ledger and change nothing (RD-12, DD-47). The section is headed *Upcoming* with "not counted yet"; a list row reads "List · <date>", a planned row "Planned · <date>" with a small *Mark paid* under its amount, and tapping a planned row opens its two-step delete. | Both are things still to happen, and each needs a person. They stay on top of Transactions until settled (Risks). | Mixing them into the ledger by date. |
| DD-84 | *Needs you* gains `planned` items: planned payments dated on or before today + 3 days, after overdue bills and before drafts, each linking to `/transactions` (its Upcoming row). *Over the room* (RD-10) passes every planned payment on a card in the line's group dated on or before the list's date; the line shows "฿X planned to be paid by then" when above zero. | RD-15 and RD-10 ask for both. The room warning already sums planned payments (`plannedBefore`), so only the lines needed the figure. | Counting planned payments as room. |
| DD-85 | Ledger search matches, case-insensitively, the card id, name and last 4, a purchase's note, and the amount as it is printed, digits only too (`41230` finds `฿41,230.00`). A query of only separators (`.`, `,`, `฿`) matches nothing it should not: it needs at least one digit to match an amount. | People type what they read on the page, or the digits of a bank statement. | Matching the raw satang value. |
| DD-86 | Filters are type (`purchase`, `payment`), cards (any number), and a date range: a preset (`today`, `week`, `month`, `lastMonth`) or a custom `from`/`to`. Sorts are `new` (default), `old`, `big`, `small`. The date sorts group rows under day headings ("Today · Sat, 31 Oct" for today); the amount sorts give one flat list with the date on each row. Within a day, purchases by `addedAt` latest first (DR-17), then payments by id. | The presets are the ones *Purchases by date* had (FR-25), so nothing is lost; amount sorts answer "what was the big one", where day headings would only get in the way. | A different set of date presets. |
| DD-87 | The month summary shows only with no search and no filter: the current month's purchases, paid payments, and owed now (the sum of every card's `owed`). It is titled "<Month> so far" and signs its figures (purchases −, payments +); the legend line "Purchases − · Payments +" was dropped on 2026-10-31, since the figures carry their own labels and signs. | A summary of a filtered list would be read as the month's total. | Showing it always, over the filtered rows. |
| DD-88 | Archived cards stay in the ledger, tagged *Archived* (DD-24). They are offered in the card filter and in *Which card?* only while they owe money. | History must stay readable (DD-24), but a card with nothing owed has no reason to take a payment. | Hiding archived cards' rows; always offering them. |
| DD-89 | *Owed* lists every card that owes money or holds credit, archived ones included while they owe. The default order is overdue (most days first), due within 7 days, then most owed, ties by id. Sort choices are `urgency`, `card`, `due`, `left` (FR-15). A row links to the payment sheet on its card (DD-76). | It replaces *Due next*, whose order was urgency; the same sorts are kept so nothing is lost. A row's one job is to pay the card. | Listing only cards with a bill due. |
| DD-90 | *Lists* shows every list, newest date first, with status chips *Draft*, *Waiting for the spender* and *Saved* (none ticked means all). A row shows the date, the status as a pill, card count and total (a saved list's made total, DD-65) and opens `listPageAddress` (DD-75). | Lists have no other index once Home shows only the ones needing action. | Showing only unsaved lists. |
| DD-91 | A purchase row links to its list when `listIdOf(purchase.id)` names a stored list (`/list/view?id=`), else to its card (`/card?id=`). | A purchase made from a list reads best next to the list's other lines; older purchases have no list. | Always linking to the card. |
| DD-92 | The Transactions address is `/transactions?view=lists|owed&q=&type=&card=&card=&range=&from=&to=&sort=&owed=&status=` (`owed` is the *Owed* view's sort: `urgency`, `card`, `due` or `left`), defaults left out, written with `history.replaceState`. | A reload or a shared link keeps the view (extends DD-58's addresses); `replaceState` keeps Back from stepping through every keystroke. | Pushing a history entry per change. |
| DD-93 | Backup is version 3 in Settings: download, copy and restore all use `transfer-v3`. Restore accepts version 2 or 3 and keeps Merge and Replace (DD-17); a version 2 file is converted on the way in. Counts include lists. Replace sets the payments marker so startup does not convert again. | Question 14 was answered with version 3. The old `transfer.ts` wrote `cc:payment:` records, which never convert once the marker is set, so download and restore had to switch together with the startup conversion. | Staying at version 2 with optional fields (DD-15, replaced). |
| DD-94 | *(Retired in phase 6: export writes the stored location records, DD-139, and import never writes settings; Merge keeps local records, DD-131.)* Export takes each location's `takesPurchases` from `settings.purchaseLocations`, and reads `defaultLocations(settings)` while no location records are stored. Import also writes `settings.purchaseLocations` from the file's locations that take purchases and are a known `Location`, when the file has any locations. Phase 6 moves purchase places to location records and changes both. | Settings still edits `settings.purchaseLocations`; it is the truth until phase 6, and records read instead would carry stale places into a backup. | Reading the stored location records for export. |
| DD-95 | Before writing a converted payment (an `m:` id with a `period`), import deletes that card's stored `m:<card>:<period>:` payments, so a record that now converts to fewer parts leaves none behind. *(Revised in phase 6, DD-133: only a file converted from version 2 in the same import clears those parts, so a Merge of a version 3 file deletes nothing. Until then a Merge of a version 3 file could delete a local `m:` part for a period the file held.)* | Converted ids are `m:<card>:<period>:<index>` and the same record always converts to the same ids; without this a restore over converted data adds up old and new parts. | Leaving the older, higher-index parts in place. |
| DD-96 | A group's usage, wherever it is shown (the Cards page's group table, the card page's bar), is what is used plus what sent lists hold: `used + held`. The card page's bar and its level tint use the same count, so the bar and the *Available* figure (`limit - used - held`, as on Home) always agree. | Room already subtracts what waiting lists hold (DD-50, DR-09); a bar that showed only `used` would sit lower than the room beside it. | Showing `used` alone in the bars. |
| DD-97 | *(Replaced 2026-10-31 by DD-98.)* Phase 4's surfaces (the payment sheet, Transactions) name a card by its name. Sentences and buttons use the name alone ("Record ฿41,230.00 to SCB Krabi", the credit note, a delete confirm, *Mark paid* messages). A row shows the name in bold, then `[id] · last4` muted (`[SCB-K] · 1029`), after a small chip with the last 4 on the card's group pastel (`--cc-group-N`, N = the group's place in the stored group order, four colours round). A ledger row shows the name in bold with the word *Purchase* or *Payment*, then a muted line with the note, "From list <date>" for a list's purchase, or `[id] · last4`. A card no longer stored is named `[id]`. One helper holds it (`card-label.ts`: `cardName`, `cardNameHtml`, `cardMetaText`, `cardIdTag`, `cardMini`, `groupTone`). Home and the purchase lists keep `id) Name (last4)` (DD-70). | The user asked for it after the phase 4 preview (2026-10-31): a bare id doesn't say which card it is; the name does, and the id stays beside it for the bookkeeper. | The id alone; `id) Name (last4)` everywhere (DD-70). |
| DD-98 | Every page names a card in one of three forms from one helper (`card-label.ts`, UI-14): *panel* (the last-4 chip, then `id) name`) for rows, *line* (`id) name (last4)`, short `id) name`) for single-line text and the copied list text (DD-63, DD-73), and *name* (the name, short `c-[id]`) for buttons, notices and sentences. A short form is shown by CSS swapping a `.cl-full` and a `.cl-short` span; nothing measures widths. The chip is read out, since the panel form says the last 4 nowhere else. Replaces DD-70 and DD-97. | The user decided it after the phase 4 rework preview (2026-10-31): one rule for every page, with the id and last 4 kept where a row has room and the name alone where a sentence reads. | DD-70's `id) Name (last4)` on Home and lists beside DD-97's name-first rows on Transactions; measuring widths in script. |
| DD-99 | A purchase amount reads red (`--cc-danger`) with `−`, a payment amount green (`--cc-success`) with `+`, always beside the word *Purchase* or *Payment* (UI-07): ledger rows and the month's summary. Upcoming amounts stay muted, since they are not counted yet. | The user decided it after the phase 4 rework preview (2026-10-31): direction should read at a glance. | Purchases in the plain text colour. |
| DD-100 | The floating Payment button and the selection bars at the foot of a page share one height token, `--cc-bar-height` (the round button, the pill, and the bars' minimum height). A bar whose content wraps (a long Thai line) grows past it. *The button is *+ New* since DD-104; its menu does not change its height.* | The user decided it after the phase 4 rework preview (2026-10-31): the two float at the bottom together and should read as one family. | Separate `--cc-fab-size` and padded bars of their own height. |
| DD-101 | A card payment can carry a note: `CardPayment.note?: string`. The payment sheet has an optional *Note* field under the amount and date; it is trimmed, and a blank one stores no `note`. The ledger shows a payment's note on its sub line (planned ones after the date under *Upcoming*), and Transactions search matches it as it does a purchase's note. Backup version 3 accepts a note that is text or absent and rejects any other (DC-05, DC-06). | The user decided it on 2026-10-31: a payment needs a word on where the money came from, just as a purchase does. | No note on payments. |
| DD-102 | A purchase-list line can carry a note: `ListLine.note?: string`. *Enter amounts* shows an optional *Note* field under each line's amount; it is kept through Review and back, a language switch, a saved draft and a sent list. The reply page shows each line's note in an editable field, made or not; saving the reply writes a made line's note to its purchase's `note`, and a not-made line moved to the next day's draft keeps its note. The saved list shows each note under its card. The note is trimmed and a blank one is not stored. The copied text and the image are unchanged (DD-63, DD-64). Backup version 3 accepts a line note that is text or absent (DC-06, `backup.problem.badNote`). Also from the same feedback round: closing the payment sheet after the page pushed `?card=` steps back in history instead of replacing (DD-76), and the sheet's figures wrap only after the baht sign or a comma and step down a size on a phone, so no digit breaks alone in Thai. | The user decided it on 2026-10-31: the spender's purpose for each purchase belongs with the plan, and the purchase should keep it without typing it again. | Notes typed only after saving, on each purchase; a note column in the copied table. |
| DD-103 | *Ready to use* moves to the new-list picker. `/list/new` with no `card` parameter is a page (a list page, so no floating *+ New* menu): a back header *New purchase list* to Home with the ready count; search (id, name or last 4), a Filter button with a count badge, a *Sort: Most room ▾* chip and removable chips, styled like Transactions; a filter sheet like Transactions' (`filterSheet` in shared.ts) with *Kept in* (the places among the ready cards), *Account holder* (`cardOwnerOf`: a supplementary card's own holder, else its group's), *Sort* (most room, longest to close, latest due), *Clear all* and *Show N cards*; rows in the panel form with a tick, room, close and due dates, an *Overdue bill* tag and the usage bar (three lines since 2026-11-02, with the owner and status tags on the second, DD-145); the selection bar *N cards selected · Clear · Enter amounts ›* opens `/list/new?card=…` in tap order (`location.assign`, so Back returns to the picker). The search, filters and sort live in the address (`/list/new?q=&loc=&loc=&owner=&sort=`, defaults left out, `history.replaceState`); the selection lives in memory and drops a card that stops being ready. `/list/new?card=…` is the entering step, unchanged. Home keeps *Needs you* and a short *Ready to use* (count, the top three by room as rows with no tick, then *See more (N)* / *Show less* to open the rest in place; no *Start a list* button, that is the *+ New* menu's and `/list/new`'s); Home has no selection, so the floating *+ New* menu always shows there (DD-71). The filter logic is pure (`ready-filter.ts`: `filterReady`, `readyLocations`, `readyOwners`). | The user decided it on 2026-10-31: Home should stay short, and picking cards for a list deserves a page with the same search and filter as Transactions. | Keeping the full ticked grid on Home; a sheet over Home for picking. |
| DD-104 | The floating button is *+ New*, a speed dial: a round + on a phone, a pill *+ New* from 900px, `--cc-bar-height` tall (DD-100). Tapping it opens a small menu above it with two actions, each with an icon: *New purchase list* (`/list/new`) and *Make a payment* (`/pay`). (*Add purchase* was added on 2026-11-01 and taken out the same day at the user's request, DD-121.) The button carries `aria-expanded` and `aria-controls`; opening moves focus to the first action, the arrow keys move between them, Escape or the button again closes it and hands focus back, and a tap outside closes it. The + turns to a × while it is open. The menu slides up and fades in, and back out on close, before it hides (none of it under `prefers-reduced-motion`). It stays hidden on the list pages (DD-71), and `/pay`. `cc-fab-menu`, light DOM, drawn by app.css. | The user asked for it on 2026-10-31: starting a list is as frequent as paying, and both belong one tap from anywhere. | Two floating buttons; a menu in the header. |
| DD-105 | A row that is a link or a button (*Needs you*, the ledger, the payment and new-list pickers, *Owed on each card*, the *Lists* rows) shows a quiet ground on hover (`--cc-surface-sunken`, carried to the panel's inner edges, DD-109), never an underline; keyboard focus keeps its ring (UI-16). | The user asked for it on 2026-10-31: an underlined row title read as a broken link. | Underlining the title (the first phase 4 build). |
| DD-106 | A *Needs you* row's icon says what kind of thing it is, so overdue and planned rows carry no card chip besides it; the row's words and shape are now DD-108's. More than five things show the first five and a quiet *See more (N)* button (N hidden) that opens the rest in place, in the same order, and reads *Show less* to fold them (`aria-expanded`). | The user asked for both on 2026-10-31; the rows themselves are to be redesigned next. | Keeping the chip; capping the list with a link to another page. |
| DD-107 | Sheets and the *+ New* menu animate out as well as in: the payment sheet and the filter sheets (Transactions, the new-list picker) slide down on a phone and shrink and fade from 900px, their backdrop fading, and only then leave the page (`cc-modal` marks itself `closing`; `leave()` lets a page close one after its exit, as *Show N* and *Change* do). The wait follows the running animations (`afterExit` in `motion.ts`, capped at 400ms) and is skipped when none runs, so `prefers-reduced-motion` and the tests close at once. A sheet held by a save in flight ignores Escape, the backdrop and Close. | The user asked for it on 2026-10-31: a sheet that vanished on close felt broken beside one that slid in. | Waiting a fixed time; `animationend` listeners alone, which never fire under reduced motion. |
| DD-108 | *Needs you* and *Upcoming* share one row shape (`action-row.ts`): an icon for the kind (draft grey, waiting amber clock, planned grey clock, overdue rose alert), a bold title, a muted subtitle (no badge, DD-110), then optionally an amount on the right with an action button under it. Titles: "Draft list for <date>", "Waiting on list for <date>", "Planned: pay <name> (<holder>) <today / tomorrow / in N days / N days ago>", "Overdue: <name> (<holder>)" with the subtitle "for N days" (DD-110); dates are `displayDate`. A list names its cards as `<name> (<holder>)`, comma separated, when three or fewer, else "N cards". Both lists put the amount in the same right-aligned slot (the subtitle never repeats it): a waiting or draft list its total (muted, −), a planned payment its amount (green, +), an overdue bill the amount left (in the danger red `--cc-danger`, as overdue tags are, with no sign, since it is owed, not a transaction; the words "Overdue" and "for N days" still carry the meaning, UI-07). *Needs you* rows have no button and the whole row opens the item; a planned payment's subtitle is its date (dd MMM yyyy), and *Upcoming* adds the note after it. Buttons are right-aligned under the amount on desktop; below 900px the row stacks and the amount sits on its own bottom line at the left (the buttons at the right of that line). A waiting list on *Upcoming* has *Confirm*, which swaps in place for *Save* and *Cancel* (the question is the *Save* button's `aria-label`, "Save all N as made?") before it saves every line made at its planned amount through the reply's own save path (`writeListReply`: ids `<list>-<n>`, notes carried, refused once the list is no longer waiting); a planned payment has *Paid* (mark paid) and, after it, a visible *Delete* (DD-110). Upcoming keeps every planned payment and drops the "not counted yet" note. A planned payment's note stays after its date on Upcoming. | The user specified the row on 2026-10-31: the two lists said the same things in different shapes, and confirming a list that went as planned took a whole page. | Two row designs; a one-tap *Confirm* that writes purchases with no second step; opening the reply page for every confirm. |
| DD-109 | Every row list (*Needs you*, *Upcoming*, the ledger, *Owed on each card*, *Lists*, the payment picker, the new-list picker) hovers the same way: the ground reaches the panel's inner edges (two side shadows the width of the panel's side padding, `--cc-space-4`; the panel clips them at its rounded corners), and the lines between rows stay whole. A neutral badge (`.tag` with no urgency or tone) and a neutral icon tile, whose fill is that ground, turn to `--cc-surface` on hover so they still show, in both themes. Below 900px a row in *Upcoming* and in the ledger stacks: the icon or chip beside a full-width title that may wrap, the subtitle and badge under it, then a last line with the amount on the left and the action button on the right (the amount alone when there is no action), in line with the text. From 900px the side-by-side layout stays. The same markup serves both; only CSS switches. | The user asked on 2026-10-31: the hover stopped short of the panel edge, the badge vanished into the hover ground, and on a phone long titles squeezed against the amount and button. | A separate phone row component; a hover that leaves the side padding bare. |
| DD-110 | In *Needs you* and *Upcoming* only (2026-10-31): the kind badge is gone, since the icon and the title say it. A card reads `<name> (<holder>)`, e.g. "Krungsri Bangkok (RI)", the holder being `cardOwnerOf` (DR-13: a supplementary card's own owner, else its group's account holder; none gives just the name), in the planned and overdue titles and in the card list of waiting and draft subtitles (`cardOwnerName` in `card-label.ts`); a card no longer stored stays `c-[id]`. An overdue row is "Overdue: <name> (<holder>)" with "for 1 day / N days" under it and the amount left on the right. A planned payment on *Upcoming* is plain text, not a button: *Paid* and a danger *Delete* sit side by side on the right, and *Delete* swaps the pair in place (nothing opens under the row) for *Delete* (danger, `aria-label` "Delete ฿X to <name>?") and *Cancel* (primary, UI-09), which restores *Paid* and *Delete*. | The user asked for it on 2026-10-31: the badge repeated the icon, two cards of one name needed their holder, and the hidden tap-to-delete was not discoverable. | Keeping the badge; the last 4 to tell cards apart; delete behind a row tap. |
| DD-111 | A purchase is fixed on the card page. Tapping a statement row unfolds it to its purchases (date, note, amount), and the unfolding is kept by period across reloads. Each purchase has *Edit* and *Delete*. *Edit* opens a sheet (`cc-purchase-sheet`) with the card fixed and named, date, amount and note, the close-date and future-date warnings, and *Save changes*; it closes only once the write lands, and a failed one keeps the sheet and the reason. *Delete* swaps to *Delete ฿X?* with *Delete* (danger) and *Keep*, and focus follows the swap; once the purchase is gone, focus goes to its statement row. Archived cards included. Purchases are added only from purchase lists; the card page's Add purchase dialog, `cc-quick-add` and `purchase-dialog.ts` are gone (DD-67). *Revised 2026-11-01: a purchase can be added again, through this sheet in add mode, from the card page's *Add purchase* (DD-121); the old dialog and `cc-quick-add` stay gone. An unfolded statement also lists its payment parts, which have no *Edit* or *Delete* (DD-122).* | The user decided it on 2026-10-31: a wrong amount is found on the card's statements, so it is fixed there; every new purchase comes from a list (question 13). | Opening the purchase in Transactions; keeping the Add purchase dialog. |
| DD-112 | A limit group is added and edited in a sheet over Cards. `/cards?group=<id>` opens it on that group, `/cards?group=new` on a blank one (`/cards?newGroup=1` since phase 6, DD-137), and an unknown id opens nothing. Tapping a group panel or *Add group* (under the *Limit groups* heading) pushes the address, so Back closes the sheet; Close, Escape and the backdrop step back when the page pushed it, else replace the address without `group`, as `/pay` does (DD-76). Fields: name, limit (above zero) and account holder (KC, NT, RI) as a segmented control. The sheet is headed *Add limit group* or *Edit NAME*, and its button reads *Add limit group* or *Save changes*. A save closes the sheet only once it lands; a failed one keeps the sheet, the typing and the reason, and a retry of a new group writes the same id. *Delete group* (danger, two steps) shows only while no card uses the group. | The user decided it on 2026-10-31: groups are edited rarely and belong beside the cards, and an address that names the group can be linked and reloaded. The two button labels, already in the catalog, say what the press does better than a bare *Save*. | A page per group; the registry's dialog (DD-19); a bare *Save*. |
| DD-113 | Archived cards fold at the end of the Cards results: *Archived (N)*, closed by default and remembered through `cc:panel:cards-archive`. Search and filters apply to them too, the sort is the same, and they never sit in a place section; their rows use the flat form (`· place · holder`). | The user decided it on 2026-10-31: an archived card is history, still counted against its group, so it stays findable but out of the way. | Hiding archived cards; a filter for them. |
| DD-114 | *(Revised 2026-11-01: a compact sub-header, sections, and Archive and Delete moved to the card page's More menu, DD-124, DD-125.)* A card is added and edited on a full screen. `/card/new` and `/card/edit?id=<id>` share one form (`cc-card-form`) under the compact sub-header (DD-124): *New card* with no subtitle, back to `/cards`; or the card's title `name · holder (last4)` (DD-123, the stored card's, so it does not change while you type) with *Card id can't change* under it, back to the card. The form is in four panels, each named by a small heading (DD-125): *Card* (name; card id, disabled when editing; last 4), *Where and who* (*Kept in* as a segmented control; limit group, a select of `name (holder) · limit`; the cardholder, *Account holder (KC)* or *Supplementary card* with its own holder), *Billing cycle* (the kind, *due days after close* or *due on day*, both kinds kept; then *closes on day* and the due), *Comment*; then *Add card* or *Save changes*. The edit page has no *Archive card* or *Delete card*: they are on the card page's More menu (DD-124). A save replaces the address with `/card?id=<id>`; a failed write keeps the form and its reason. Both pages mark the Cards tab and `<html data-form-page>`, which hides the *+ New* menu so it doesn't cover the form's buttons on a phone. | The user decided it on 2026-10-31 (RD-16): the form is long, with a cycle and a cardholder, and a dialog on a phone hid half of it. Archive acts on what is stored so a half-typed edit is never saved by it. The heading names the card as every other heading does (UI-14), rather than the prototype's bare id. The user asked on 2026-11-01 after testing the phase 5 preview for the slim header and the form in sections; Archive and Delete moving to the card page is a ruling in that round, so they live in one place. | A dialog over Cards; separate forms for new and edit; saving the typing on Archive. |
| DD-115 | The Cards address is `/cards?q=&loc=&owner=&ungrouped=&sort=&group=` (`ungrouped` and `newGroup` since phase 6); `loc` and `owner` repeat for several values, and `sort` is `place` (default), `room`, `name` or `close`. Defaults are left out and the address is replaced, not pushed, except opening a group sheet (DD-112). The old `edit`, `group` (as a filter), `dir`, `gq`, `gowner`, `gsort` and `gdir` keys are no longer read (DC-15 and DC-16 retire). The other addresses are `/card?id=`, `/card/new` and `/card/edit?id=`. *(Until phase 6 the filter offered only the three fixed places. Since phase 6 `Card.location` takes any location id (RD-17): the filter's *Kept in* offers every stored record A to Z by shown name, and `loc` keeps any record id (DD-132). `ungrouped=1` is the *Not in a group* filter, and the blank group sheet is `?newGroup=1`, not `?group=new` (DD-137).)* | Question 15 left addresses to the builder. A reload or shared link keeps the view, and typing doesn't fill the Back history (as DD-92). Until phase 6 no card could be kept at a custom place, so offering one would only have emptied the list. | Keeping the old keys working; pushing every change. |
| DD-116 | The Cards page: heading *Cards* with *Add card* (a link to `/card/new`); the shared search, a *Filter* button with a count of the filters in use, the sort chip and removable chips; the results; *Limit groups* beside them from 900px and below them on a phone (since 2026-11-02 a phone shows one or the other through a switch, DD-144). *By place* (the default) shows a section per location, in location order, headed by its name and `N cards · takes purchases`; *Most room*, *Name* and *Close day* give one flat list headed `N cards`, whose rows add `· place` (`· place · holder` until 2026-11-01; the holder is in the title now, DD-123). A row is the chip and the title `id) name · holder (last4)`, with `closes D · due D` (the open period, from the ledger, so frozen dates hold) under it and a *Supplementary* tag on a supplementary card (DD-123, amending UI-14; until 2026-11-01 the chip and `id) name`), and on the right the group's room with *room*, or `N% used` in the warn colour from 80%, or *credit ฿X* when the card holds credit; a card with no group, or a deleted one, shows *No limit group* in muted text. Search matches id, name, last 4 and comment. The filter sheet is *Filter cards*: *Kept in*, *Account holder*, *Sort by* as a radio list, *Clear all* (keeps the search), and *Show N cards* or *Nothing matches*. No match reads *No card matches. Clear the search or a filter.*; no cards at all reads *No cards yet. Add one with Add card.* The tab title is *Cards — cc-tracking*. | The user approved the prototype's Cards view (`vCards`) on 2026-10-31. Places answer "which cards are here"; a flat list answers "which has most room". A radio list says only one sort applies. | The registry's tables with sortable headings; sort as chips like Transactions'. |
| DD-117 | A group panel shows `name (holder)`, `room of limit`, the usage bar, then the card ids, `N% used` and *getting full* from 80%. Usage is `used + held` (DD-96). Each group's room is worked out once per load, not on every paint. | The panel answers "how much room does this account have, and on which cards"; one count per load keeps typing in the search quick. | Recomputing on each paint. |
| DD-118 | *(Revised 2026-11-01: compact sub-header and More menu, *Add purchase*, payments listed, inner margins; DD-121, DD-122, DD-124.)* The card page: the compact sub-header (DD-124) with the title `name · holder (last4)` (DD-123), the subtitle `id · Kept in place`, and on the right *Edit* (to `/card/edit?id=`) and the More menu (`⋯`: *Archive card* or *Unarchive card*, and *Delete card*, danger, two steps, only when storage would delete the card); *Archived* and *Supplementary card* badges under it; a hero on the group's pastel (`group · holder` and `· shared with` the other cards' ids, the room big, *room of ฿limit*, the bar, `N% used · buy today: closes D, due D`), or a note when the card has no group; three stats (*Owed*, *Next bill* in the danger colour when overdue, and *Credit* when there is credit, else *Kept in*); the comment when set; after a purchase over the room, by how much (DD-126); the actions *Use on a list* (`/list/new?card=<id>`), *Add purchase* (the purchase sheet over the page, DD-121) and *Make a payment* (quiet, `payAddress` with the next bill), or, in place of the first two, the note saying why the card can't take a purchase (FR-22: archived, no limit group, or its place not ticked); on a phone the first action takes a full row and the other two share the next, from 640px all three sit in a row; *Statements* (FR-16, DD-111), each unfolding to its purchases and payment parts (DD-122), quiet months folded (DR-22), and *Show older statements*. Everything sits inside the page's inner margins; an unfolded statement's items sit inside the row's padding, and the row's focus ring is inset so it never touches the panel edge. An unknown or missing id shows the error and the sub-header back to `/cards`. | The user approved the prototype's card view (`vCard`) on 2026-10-31: the room and the bill come first, and the two things to do next sit under them. The user asked on 2026-11-01 after testing the phase 5 preview: the prototype's slim header, *Add purchase* on the page, and the payments shown on the statements they settled. Archive and Delete moved here so they live in one place (a ruling in that round). | The old summary, table of statements and Add purchase dialog; the big back header with `id) name` and `name · ••••last4` (the first phase 5 build). |
| DD-119 | `deleteCard` also refuses a card on a draft or on a list waiting for the spender, with the reason `guard.cardOnList`; a saved list doesn't block it. The contract suite tests it, and the card page's More menu (the edit screen until 2026-11-01, DD-124) hides *Delete card* as well (DC-13). | A list holding a deleted card would point at nothing, and a waiting list holds room on its group. | Guarding only in the interface; dropping the card from the list. |
| DD-120 | The light theme's `--cc-group-4-text` darkens from `#b1532f` to `#a74e2c` on `--cc-group-4` (`#fbe6dd`), 4.21:1 to 4.63:1, before the group chips ship on Cards. Same hue and saturation. | Text on a chip must pass WCAG AA (4.5:1). | Changing the group's pastel instead. |
| DD-121 | A purchase can be added without a list (question 13, re-answered), only from the card page's *Add purchase*, which opens the purchase sheet (`cc-purchase-sheet` in add mode) over the page with the card fixed. A separate `/purchase` page (a card picker, with `/purchase?card=<id>` opening the sheet over it) was built on 2026-11-01, left out of the *+ New* menu at the user's request the same day, and then removed, also at the user's request, since nothing linked it. The sheet: *Add purchase*, date (today), amount, note, *Save purchase*; it warns without blocking when the date is the card's close date or in the future (FR-20). The id is made once per opening, so a retried save writes the same record; the purchase is stamped `addedAt` when saved (DR-15). A save over the room is kept, stays on the card page and the page says by how much (FR-19, DD-126). A failed save keeps the sheet, the typing and the reason. | The user asked on 2026-11-01 after testing the phase 5 preview, reversing question 13's first answer: some purchases are recorded without a list. | Every purchase through a list (question 13's first answer); a purchase form on Transactions; a separate `/purchase` card-picker page (built, then removed). |
| DD-122 | An unfolded statement lists the payment parts that settled it, from the ledger (`LedgerStatement.payments`, summing to what is paid). The ledger spends money first in, first out: a payment naming the period pays it first, then the pool settles statements oldest first, spending payments in payment date order. Each part reads `date · Payment · +฿part` in green, with `(part of ฿total)` on its own line under *Payment* when the payment was split across statements; two parts of one payment on one statement are one line. Purchases and payments share one list by date (a purchase first on a tie), on one set of columns so the amounts line up. A payment part has no *Edit* or *Delete* (payments are deleted from Transactions, DD-77). A statement with payments but no purchases unfolds too. | The user asked on 2026-11-01 after testing the phase 5 preview: a statement said "Paid ฿X" but not which payment paid it. | Payments in a separate list under the statement; per-part *Unmark* (retired in phase 4). |
| DD-123 | Cards carry a title with their holder in three places (amends UI-14 there, `cardTitle` and `cardRowTitle` in `card-label.ts`). A Cards page row: `id) name · holder (last4)`, plain text that wraps on a phone, with `closes D · due D` (the open period, short dates) under it and a *Supplementary* tag on a supplementary card; the right side is unchanged, and the flat view's extra line is the place only. The card page and the edit page: `name · holder (last4)`. The holder is the cardholder (`cardOwnerOf`, DR-13), left out with its `·` when unknown; `(last4)` is left out when the card has none. A new card's page reads *New card* (and its tab *New card — cc-tracking*). | The user asked on 2026-11-01 after testing the phase 5 preview, giving this format. The row keeps the full title on a phone, where it wraps (a ruling in that round: the user asked for the full format). | A short `id) name` on a phone (the row's first build); the holder on the extra line. |
| DD-124 | The card page and the edit page sit under a compact sub-header (`sub-header.ts`, the prototype's `subHead`): a slim bar, sticky under the app header, with a back arrow, the title, a muted subtitle line, and actions on the right. The card page's subtitle is `id · Kept in place`, its actions *Edit* and a More menu (`cc-more-menu`, `⋯`, labelled *More*): *Archive card* or *Unarchive card*, and *Delete card* (danger) only when storage would delete the card (no purchases, on no draft or waiting list, DD-119). *Delete card* asks in place (*Delete <name>?* with *Delete* and *Keep*), focus following; Escape, an outside tap or a choice closes the menu (Escape and a choice hand focus back to `⋯`). Archive saves in place; Delete goes to `/cards`; a refused or failed write shows its reason on the page. The edit page's subtitle is *Card id can't change* (edit) or nothing (new), and it keeps only *Save changes*: Archive and Delete live in one place, the card page. Since the follow-up on 2026-11-01 every sub-page uses it and the big back header is gone: `/pay` (*Make a payment*, no subtitle, its back a button that steps back in history), the new-list picker (*New purchase list* over how many ready cards in which places), enter amounts and the draft (*New purchase list* or *Draft list* over the list's date and card count, which follows a new date), the review (*Review list*, its back a button to the amounts), the reply (*Spender's reply* over *List for <date>*), the saved list (its date over *Purchase list · saved*) and a list page opened on a list it does not show (*Purchase list*). A list page's side panel parks under the bar from 900px (`--cc-sub-header-height`). | The user asked on 2026-11-01 after testing the phase 5 preview, for a header like the prototype's `subHead`. Archive and Delete leaving the edit page is a ruling in that round: one place for them. | Archive and Delete on both pages; the big back header on the card page. |
| DD-125 | The edit page is in sections: panels *Card* (name, card id, last 4), *Where and who* (kept in, limit group, cardholder), *Billing cycle* (kind, close day, due) and *Comment*, each a `<section>` labelled by a small, muted, uppercase heading over its panel; *Add card* or *Save changes* comes last. | The user asked on 2026-11-01 after testing the phase 5 preview. | One long panel (the first phase 5 build). |
| DD-126 | The over-room note says how far this purchase went over: `amount − max(room, 0)`, the room measured before the save, so it is never more than the purchase, and 0 when it fits or the card has no group (`overRoom` in `home.ts`, used by the card page). The note goes at the next write on the page (archive, unarchive, a purchase edited or deleted, deleting the card) and when the add or edit sheet opens. The room is the same as on list lines (RD-10). The card page takes no `?over=` address hand-off (it was only for `/purchase`, since removed). | A ruling in the 2026-11-01 feedback round (the note itself is DD-121's, which the user asked for after testing the phase 5 preview): with the room already gone, "went ฿X over" should name this purchase's share, not the group's whole overshoot. | `amount − room` (more than the purchase when the room was already negative). |
| DD-127 | A payment save that fails after Back took its sheet away says why on the page. Back (or Forward) while a save is held updates the page at once: it knows which entry it is on, and the sheet goes when the address drops `?card=`. If that save then fails, the page banner shows the reason with *Try again*, which reopens the sheet for that card as a pick does (it pushes `?card=<id>`, so Close steps back over it) with the amount, date and note that were typed. A save that succeeds after Back still leaves for `/transactions` with `location.replace`, once, adding no history entry. | The user approved it on 2026-11-01 after a review of the phase 5 branch found that a save failing after Back left the picker with no reason and nothing saved. | Ignoring Back while a save is held (the first build); reopening the sheet by itself on a failure. |
| DD-128 | Location records are seeded once. At startup `bootstrap` runs `seedLocations` before `migrateLocations` (a failure is logged and the page still renders): while no record is stored and the marker `cc:migration:location-records` is unset, it stores `defaultLocations(settings)`, Bangkok, Phichit and Krabi with the old purchase-place ticks, then sets the marker. A restore runs it again after writing. Reset removes the marker with every `cc:migration:` key (DC-04), and *Delete all data* removes it and seeds at once, so the defaults come back with Krabi taking purchases. The app no longer reads or writes `settings.purchaseLocations` otherwise. | The ticks set under the old *Purchases* section carry over, and the records become the one truth for where purchases happen (RD-17). A marker under `cc:migration:` follows the payment conversion (DD-48) and goes with it on reset. A call in the phase 6 design (2026-11-02). | Keeping `settings.purchaseLocations` as the truth beside the records (DD-94); seeding whenever no record is stored, with no marker. |
| DD-129 | The last location can't be deleted: the Locations page offers *Delete* only on a location no card is kept at (archived cards count), and never on the only one left. Storage still refuses to delete a location a card uses (`guard.locationInUse`, DC-13). | A card always needs a place and the edit screen requires one, so with no record a new card would have nowhere to go. A call in the phase 6 design (2026-11-02). | Allowing an empty list. |
| DD-130 | A card whose location names no stored record is repaired by `migrateLocations`, at startup after the seed and after every restore. A card at `bangkok`, `phichit` or `krabi` whose record is missing gets that default record back, taking no purchases; any other value moves the card to the first record A to Z (DD-132), and the Cards page names the moved cards once (FR-02). With no record at all, Bangkok comes back and the unknown cards move there. | A version 2 file without `settings`, a card stored as free text, or a copy that brings cards without their records must still load (G4), and a default place is better brought back than guessed. A call in the phase 6 design (2026-11-02); the no-record case is a ruling while building. | Refusing the data; moving every unknown card to Bangkok (the rule until phase 6, DC-10). |
| DD-131 | Merge keeps the local location records: a file's location whose id is already stored is skipped, so an old backup cannot undo a rename or a *Takes purchases* tick. Replace takes the file's records. | Merge is additive (DD-17), and a location's name and tick are choices the reader made here. A call in the phase 6 design (2026-11-02). | Overwriting them as Merge does other records. |
| DD-132 | Location names and order. A record whose name is still its English default (`Bangkok`, `Phichit`, `Krabi` on the ids `bangkok`, `phichit`, `krabi`) shows the catalog name in the reader's language; any other name shows as typed (`locationName`, UI-13). Everywhere locations are listed (the Locations page, the edit screen's *Kept in*, the Cards filter and its `loc`, the Cards *By place* sections, the new-list picker's *Kept in*) they sort A to Z by that shown name with `localeCompare` in the reader's language, ties by id. The Cards *Name* sort uses the reader's language too. There is no order field, and the backup shape is unchanged. | The user answered on 2026-11-02: A to Z by name. The default records are stored in English (DD-128), and a Thai reader should still read Thai (a phase 3 note). | An order field the reader arranges; seeding the names in the reader's language. |
| DD-133 | Merge of a version 3 file is purely additive. `parseAnyBackup` marks a file converted from version 2 during this import (`converted: true`, never written by export), and only then does `importBackupV3` clear a card's stored `m:<card>:<period>:` parts before writing the converted ones (DD-95). | A version 3 file's payments carry their own ids, so nothing in it stands for a stale converted part, and Merge should never delete. No help text is then needed. A call in the phase 6 design (2026-11-02). | Saying in the Merge help that Merge can delete (the roadmap's other option). |
| DD-134 | Restore is a sheet, clipboard first (the shared sheet of the Cards and Transactions filters). *Restore…* opens it on *Paste from clipboard* (primary), *Choose a file* (quiet) and *Paste by hand* (a quiet link); a browser without `navigator.clipboard.readText` opens straight on the text box with *Restore*. The clipboard and a file are parsed at once; a parse failure shows in the sheet and stays on that step; a refused clipboard read falls back to the text box with a one-line hint. An empty browser imports at once; one with data shows *Here* and *In the copy* counts, *Merge* (primary) and *Replace* (danger), each with its hint, and *Cancel*. Answering writes, closes the sheet and shows the imported counts under Backup. Nothing is written before Merge or Replace is answered on a browser with data. | The user said restoring from the clipboard took too many clicks: *Restore…*, *Paste from clipboard*, *Merge* is three (two on an empty browser), down from four or five. Taken while the user was away, as the recommended of three options (the phase 6 design, 2026-11-02). | The side-by-side *Save a copy* and *Restore a copy* boxes (until phase 6, CD-11); a paste box always open on the page. |
| DD-135 | The *Delete old purchases* sheet: chips *6 months*, *1 year* (the default), *3 years* and *All*, each recounting; the note "N purchases bought before DATE will be deleted." or "Nothing is older than AGE."; then, when K purchases before the cutoff stay (their statement isn't fully paid, or their card is left out so its balances hold, DD-51), a muted line "K older purchases stay: their statements aren't fully paid."; the explanation line; and *Delete N purchases…* (danger; disabled as *Nothing to delete* at none), which swaps to "This can't be undone." with *Keep them* and *Yes, delete N*. Yes applies `planPurge` with `purgeCutoff` through the repository (purchases, the payments that settled them, trimmed payments, saved lists and frozen statement dates named in the plan), closes the sheet and the Reset panel says "Deleted N purchases older than AGE." K is counted in the interface; `planPurge` is unchanged. Owed, credit and room are equal before and after, tested on the memory repository. | A count of what goes, alone, would leave the reader wondering why an old purchase is still there. A call in the phase 6 design (2026-11-02). | Widening `planPurge` to report what stays; no line for what stays. |
| DD-136 | A purge that fails shows its error inside the sheet, as restore does, not in the page banner. What was written stays: like restore, it is not atomic. | The reader sees it where they acted, as in the restore sheet. A ruling while building phase 6 (the design named the page banner). | The page error banner. |
| DD-137 | Two Cards addresses. `?ungrouped=1` is a *Not in a group* option in the Cards filter (a card with no limit group, or one that no longer exists), and *Ready to use*'s *Assign them* links to `/cards?ungrouped=1`. The blank group sheet is `?newGroup=1`, so a group whose id is `new` opens as itself at `?group=new`. | *Assign them* landed on a page with no way to find those cards (US-06). A separate key can't collide with any id, where reserving `new` would refuse a restored group. A ruling while building phase 6 (a phase 5 leftover). | Pointing *Assign them* elsewhere; reserving the id `new`. |
| DD-138 | The build tint is set before first paint. Each page's head script, after the saved theme, sets `<html data-env>` from the hostname: `localhost` or `127.0.0.1` is local, `pr-<n>-….workers.dev` is preview, anything else production; a failure leaves it unset. `chrome.ts` still stamps the build's own environment once the bundle runs, so a development build or a preview built without a PR number ends with its own value. | A non-production build should not flash production's look (UI-20), as the theme no longer flashes (RD-05). The hostname is all an inline script knows before the bundle loads. A phase 5 leftover. | Leaving the tint to `chrome.ts` after first paint (until phase 6); writing the build into each HTML file. |
| DD-139 | Export writes the stored location records as they are; while none is stored it writes `defaultLocations(settings)` instead. | A version 3 file whose cards name no location in it is refused on restore (DC-06), so an export must never write one. A ruling while building phase 6. | Writing an empty `locations`. |
| DD-140 | A new card starts kept at Bangkok when that record exists, else at the first location A to Z (DD-132). | There is always one to start at, since the last location can't be deleted (DD-129). A ruling while building phase 6. | No starting place. |
| DD-141 | Settings › Backup keeps one muted line under its panel: "Your data lives only in this browser. Download a copy to keep it safe." | It is the page's only word on BR-08 and G4: clearing the site's data erases everything. A ruling while building phase 6; the prototype has no such line. | Dropping it with the old boxes. |
| DD-142 | Every note that says where to tick a place links to `/settings/locations` with "Choose places in Locations": Home's *Ready to use*, the new-list picker, and the card page's note on a card whose place takes no purchases ("… Tick it under Settings › Locations."). `/settings/locations` marks the Settings tab. | The *Purchases* section the notes named is gone, and an empty state names its next step (UI-15). Found in review while building phase 6. | Linking to `/settings`; text with no link. |
| DD-143 | The edit screen's cycle kind reads *Days after close* (*Due days after close* until phase 6), and in Thai both kinds are shorter (กี่วันหลังสรุปยอด, วันที่แน่นอน), so the segmented control stays on one line at 390px. | It wrapped to two lines on a phone (a phase 5 leftover). | A smaller type size; stacking the two kinds. |
| DD-144 | Below 900px Cards shows one view at a time: a segmented switch *Cards · Limit groups* at the right end of the title's row (Transactions' switch, DD-79; under the heading until the second 2026-11-02 change) shows the card list, with its search and filters, or the limit group panels. The row under it holds the shown view's add button at the right, *+ Add card* or *+ Add group*; the panels' own *Limit groups* heading is hidden on a phone, the switch names it. The view is in the address (`?view=groups`; `cards`, the default, is left out; `history.replaceState`), so a reload or a group sheet's address keeps it. From 900px the switch is hidden and both sit side by side, whatever the address says, each under a one-row heading of the same height: *Cards* with *+ Add card* at its end, and *Limit groups* with its count and *+ Add group* at its end. | The user asked after the phase 6 preview (2026-11-02): on a phone the groups sat under a long list of cards, out of reach. Then (same day) the switch and the add button belonged in the header, one add button for the view in sight, and the two desktop headings should line up. The same switch as Transactions reads the same way on both pages. | Groups under the list (DD-116); a separate page for groups. |
| DD-145 | A *Ready to use* row (Home's panel and the new-list picker, `ready-row.ts`) has three lines: `id) name` in the panel form with the room on the right; the tags, owners then status; the close and due dates, then the usage bar. A card that is not supplementary has one owner tag, the account holder (`ownerOf` the group, KC when none is stored, as Cards reads it); a supplementary one has the cardholder, *Account* and the account holder, and *Sub* (Thai บัญชี, เสริม). *Overdue bill* moves from the dates line to the tag line. The picker's button is still named by the card and its room alone. *(Since the second 2026-11-02 change the note under the room reads as Cards does, DD-149.)* | The user asked after the phase 6 preview (2026-11-02): whose card it is decides whether it can be used for a purchase, and the dates line was crowded. | The owner in the title (as on Cards, DD-123); tags on the dates line. |
| DD-146 | The Transactions ledger shows its first 50 rows, then a quiet *Show 50 more · N left* under them (*Show N more* when fewer than 50 are left); each press adds 50. Search, filters and sort run over every entry, the results line counts every match, and a search, filter or sort change starts again at 50. A day cut part-way keeps its heading, and the next press fills that day under the same heading. The count is not kept in the address. | The user asked after the phase 6 preview (2026-11-02): years of entries made the page long and slow to draw. A button keeps the page predictable and needs no scroll listener. | Endless scroll; pages with numbers; keeping the count in the address. |
| DD-147 | On the new-list picker only, a card's `id) name` is a link to `/card?id=…` that opens in a new tab (`target="_blank"`, `rel="noopener"`); its click and key events stop at the link, so the row's tick does not change. Its name reads "{name} (opens in a new tab)". Home's *Ready to use* rows have no link. | The user asked (2026-11-02): check a card's details without leaving the half-made pick. A new tab keeps the ticks in memory. | The same tab (loses the selection); a link on Home too. |
| DD-148 | Limit groups are listed A to Z by name, then by id (`byGroupName` in `list-view.ts`, `localeCompare` in the reader's language): the Cards page's group panels and the card form's *Limit group* select. A group's chip colour still follows the stored order. | The user asked (2026-11-02): a group is found by its name; the form had sorted by holder, then name. | Holder, then name (the form's old order); stored order (the panels' old order). |
| DD-149 | A *Ready to use* row (Home and the new-list picker) labels its room as the Cards page does, from one helper (`roomNote` in `src/lib/ui/room-note.ts`): *N% used* in the warn tone once the group has used 80% or more (`used + held`, so a group over its limit reads over 100%), else *credit ฿…* when the card holds a credit (`ReadyRow.credit`, from the card's ledger), else *room*. While the group pools other cards the label adds *· shared* (`ready.shared`), e.g. *112% used · shared*. | The user asked (2026-11-02): *room* under a negative amount, or under an overpaid card's room, misread the row; Cards already said it. | A Ready-only label; dropping the shared hint. |

## Out of scope

Not built, on purpose. Adding any of these is a new decision.

- Personal spending; this tracks company purchases only.
- Charts, budgets, receipt uploads, bank statement import, notifications, splitting personal
  and company spending, multi-currency.
- Interest, fees and minimum payments; different limits for cards inside one shared group;
  a history of limit changes.
- Adding or renaming owners in the interface; a third language. *(Locations became editable
  in phase 6: RD-17.)*
- Edit, delete or undo in *This sitting*.

## Current design

How the site looks and is arranged today. All of it may change in a redesign; it is listed so
that each change is a choice.

| ID | Today |
|---|---|
| CD-01 | **Pages**: `/` Home (*Needs you*, a short *Ready to use*), `/list/new` the new-list picker (DD-103), `/list/new?card=` (per card) a new purchase list, `/list/draft?id=` a draft, `/list/reply?id=` the spender's reply, `/list/view?id=` a saved list (DD-58), `/transactions` the ledger, `/pay` the payment page (DD-76), `/cards` cards and limit groups (`?group=` opens a group's sheet, DD-112; `?view=groups` shows the groups on a phone, DD-144), `/card?id=<id>` one card, `/card/new` and `/card/edit?id=<id>` the card form (DD-114), `/settings` display, locations, backup, reset and About, `/settings/locations` the locations (RD-17). Nav: Home, Transactions, Cards, Settings, with a floating *+ New* menu (DD-104). (Keep redirects, DC-17.) |
| CD-02 | **Page shell**: sticky one-line header with a bold rule. On the left the boxed `cc` mark and `tracking` (the only link), then the build mark as plain text (`(pr-30)`, none on production). On a phone the date (`Fri, 30 Oct`) sits at the right edge. From 900px a decorative middle dot and the date with its year (`Fri, 30 Oct 2026`) follow the mark as one run of text, and the tabs sit on the right, right-aligned, the brand, the build mark, the date and the tab labels on one centre line (the tabs reach up through the bar's padding as far as down, so their underline still sits on the rule); on a phone a bottom bar with the four tabs; a floating *+ New* menu at the bottom right of every page (DD-104); content up to `72rem` wide; no footer; a non-production build is tinted and marked (RD-20). |
| CD-03 | **Home layout**: one column, *Needs you* then a short *Ready to use* panel: the heading with the count and places, the three cards with the most room as panel rows (no tick), then *See more (N)* / *Show less* (quiet) when more cards are ready; no *Start a list* button (the *+ New* menu starts one). **New-list picker** (`/list/new`, DD-103): a back header (*New purchase list*, back to Home, the count under it); the search box and the Filter button (a badge counts the filters in use) on one row, then the *Sort: … ▾* chip and a removable chip per filter, as on Transactions; one panel of rows (tick, the card in the panel form, room, close and due dates, an *Overdue bill* tag, the usage bar). Once cards are ticked a sticky selection bar (*N cards selected*, *Clear*, *Enter amounts ›*) sits above the bottom bar; no floating Payment button on this page (DD-71). *(The old dashboard layout, with the purchase form, *This sitting*, *Purchases by date*, *Due next* and *Can spend now*, is retired; so are Home's segmented sort and its 1/2/4-across ticked tiles.)* |
| CD-04 | **Purchase entry**: purchases come from purchase lists (RD-09). Since phase 5 the card page edits a purchase in a sheet and deletes one in two steps (DD-111); since 2026-11-01 a single purchase can also be added without a list, from the card page's *Add purchase* (DD-121). **List page layout** (DD-72): no floating Payment button on any list page (DD-71). On a phone one column, `48rem` at most, with the bottom action bar at full width. From 900px it takes the page width: the lines (two across from 1200px) on the left and a sticky side panel on the right with the date, the summary and the primary action: Review on Enter amounts; Copy text, Save image, Mark as sent and Save as draft on the review; the move checkbox and Save on the reply; the summary and the moved draft's link on a saved list. *Delete draft* (on a draft's both steps) and *Cancel list* (on the reply) come last in the panel, in the danger variant; on a phone they sit below the bottom bar. Everything is left aligned; a line card's header is one row, the card on the left and a small Remove on the right. |
| CD-05 | *(Retired in phase 3 with *This sitting*.)* ***This sitting*** columns: added, card, bought, amount. *Start new batch* turns into a confirm and Keep pair in place. |
| CD-06 | *(Gone from Home since phase 3; returns with Transactions, phase 4.)* ***Purchases by date***: preset chips, from and to dates, a card filter, three summary tiles (purchases, total, cards used) that wrap on a phone, and a folded list grouped by day. |
| CD-07 | **Lists**: tables with sortable headings; below 640px they become stacked rows with a sort chip. Filters are pill chips with "Any". |
| CD-08 | ***Due next***: a coloured left rule and text badge per urgency. ***Can spend now***: a usage bar under each available amount. |
| CD-09 | **Cards page** (the registry until phase 5): heading *Cards* with *Add card*; search, *Filter* with a count, the sort chip and removable chips; cards by place, or one flat list for any other sort; *Archived (N)* folded at the end; *Limit groups* with *Add group* and a panel per group, beside the results from 900px and below them on a phone (DD-116, DD-117). *(The registry's dialogs, its card table and its limit group table are retired.)* |
| CD-10 | **Card page** (rebuilt in phase 5, DD-118; revised 2026-11-01): the compact sub-header with `name · holder (last4)`, `id · Kept in place`, *Edit* and the More menu (*Archive card*, *Delete card*, DD-124); badges; the hero on the group's pastel with the room and the bar; three stats; the comment; *Use on a list*, *Add purchase* and *Make a payment* (or why the card can't take a purchase); then *Statements* newest first, one row per month with its tag and what is left, unfolding to its purchases (with *Edit* and *Delete*) and the payment parts that settled it (DD-122), quiet months folded into one line, and *Show older statements*. |
| CD-11 | **Settings page** (rebuilt in phase 6, RD-19): the title, then sections, each a heading over one rounded panel of rows; a row is a label with a muted subline on the left and its control on the right, and a row that is one action is a button. Display (*Language*, English / ไทย; *Theme*, Light / Dark / Device, as segmented controls); Locations (*Manage locations* › to `/settings/locations`, its subline "N places · X, Y take purchases"); Backup (*Download a copy*, its subline the filename; *Copy as text*; *Restore a copy*, which opens the restore sheet, DD-134), with the muted line under it (DD-141); Reset (*Delete old purchases*, which opens the purge sheet, DD-135; *Delete all data*, which asks in place, FR-32); About (RD-20). From 900px two columns: Display, Locations and Backup on the left, Reset and About on the right; on a phone one column in that order. **Locations page** (`/settings/locations`): the compact sub-header *Locations* back to Settings; one panel with a block per location A to Z (name, "N cards", *Rename*, *Delete* when allowed, DD-129; a *Takes purchases* tick), a warning when none takes purchases, the note that a location with cards can't be deleted, and *Add a location*. *(Until phase 6: Purchases with place checkboxes, and Backup split into *Save a copy* and *Restore a copy* side by side from 640px.)* |
| CD-12 | **Look**: sage neutrals, a green accent, pastel group colours, rounded shapes (radii 6, 12 and 18px). |
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
- The page footer (FR-37), replaced by Settings › About and the build marks (RD-20).
- Backup format version 1.
- *Mark paid* as one click that settled the whole statement, replaced by the payment dialog and
  partial payments (DD-37).
- The dashboard's purchase form, replaced by purchase lists (RD-09).
- *This sitting* and *Start new batch*, replaced by waiting lists on Home (RD-15).
- *Can spend now*, replaced by *Ready to use* (RD-15).
- *Due next* and *Purchases by date* on Home; they came back in Transactions (RD-13, phase 4).
- The old payment dialog (`payment-dialog.ts`, `cc-payment-form`), replaced by the page `/pay` (DD-76). The sheet mounted on every page (`pay-sheet.ts`, `mountPayHost`, the `cc:pay` event) and the `/pay` redirect of the first 2026-10-31 rework, replaced by the `/pay` picker page with its sheet.
- Per-part *Unmark* and *Mark paid* on the card page's statements, replaced by deleting the payment from Transactions (DD-77, DD-78).
- The version 2 backup download and copy (`transfer.ts`'s export), replaced by version 3 (DD-93); a version 2 file still restores.
- The registry page: its card and limit group dialogs, card table and limit group table, and the folds of the card list and the limit group list, replaced by the Cards page, the group sheet and the edit screen (DD-112 to DD-116).
- The `/cards` query view (DC-15) and the `/cards?edit=<id>` deep link (DC-16), replaced by DD-115 with no redirect (question 15).
- The card page's Add purchase dialog (`cc-quick-add`, `purchase-dialog.ts`), replaced by purchase lists; a purchase is edited from its statement row (DD-67, DD-111).
- Settings' *Purchases* section with its place checkboxes, replaced by *Takes purchases* on each location at `/settings/locations` (RD-17); `settings.purchaseLocations` is read only to seed the records once (DD-128).
- Settings' side-by-side *Save a copy* and *Restore a copy* boxes, replaced by rows and the restore sheet (DD-134).
- Import writing `settings.purchaseLocations`, and export reading it (DD-94).
- The blank group sheet's `?group=new`, replaced by `?newGroup=1` (DD-137).

## Acceptance criteria for the redesign

The redesign is done when all of these hold.

- [x] The open questions it depends on are answered and recorded here. *(Checked 2026-11-02: all 18.)*
- [ ] Every user story (US-01 to US-25) can be walked through in the new design.
- [ ] Every functional requirement is still met, or is retired here with a reason.
- [ ] Domain rule tests in `src/lib/domain/` pass without changing what they expect.
- [ ] The storage contract suite passes, and data saved by the current version loads unchanged.
- [x] A version 2 backup from the current version restores, with and without `settings`, and
      with payments both with and without `parts`.
- [ ] *(Dropped 2026-10-30, question 15.)* `/cards` links with a query and `/cards?edit=<id>`
      still open the same view.
- [x] The delete guards in DR-19 still hold (DC-13). *(Checked 2026-11-02: the contract suite refuses both.)*
- [ ] Every interface rule (UI-01 to UI-21) holds, checked in English and Thai, light and dark,
      at phone and desktop widths.
- [ ] Each decision that changed has a dated entry in `CHANGELOG.md` saying what replaced it
      and why, and is updated here.
- [ ] *(Dropped 2026-10-30, question 15.)* Retired page addresses redirect.
- [ ] A purchase list for three cards takes no more than: tick the cards, enter the amounts,
      review, mark sent; then *Made* or *Not made* per line and save (G3).
- [x] Payment records saved before RD-11 load as card payments, and every statement's paid
      and left amounts stay the same.
- [x] Every decided change (RD-03 to RD-21) is built, and the rows it names are updated or
      retired. *(Checked 2026-11-02: each row carries its phase.)*
- [ ] The user has walked the main flows on the preview, on a phone and a desktop, and
      approved them.

## Constraints and known limits

- **Single browser.** Data is not shared between browsers or people; moving it means a backup.
  There are no accounts.
- **Storage cap.** Browsers allow `localStorage` about 5 MB per site, and a full store only shows
  up as a failed save.
- **No overpayment record.** Paying more than is left is accepted, but the extra is not kept as
  credit toward the next statement. *(Changed by RD-11: the extra becomes credit.)*
- **Shared limits depend on every card.** A group's room is only as right as the payments
  marked on every card in it; one card left unmarked understates the room on all of them.
- **Fixed sets.** Locations (Bangkok, Phichit, Krabi) and owners (KC, NT, RI) are closed lists
  in the code. *(Locations became editable in phase 6: RD-17. Owners stay closed.)*
- **Backup version 2 only.** Older backups are rejected.
- **Restore is not atomic.** It checks shapes and ranges (DC-06, RD-06) but not that records
  refer to each other, and a failure partway can leave some records restored.
- **Thai sorting** uses code-unit order, not Thai collation; it matches for today's locations.
  *(Since phase 6 location names and the Cards name sort follow the reader's language, DD-132.)*
- **Small data.** Pages load every card and purchase; fine at today's size, worth revisiting if
  it grows.

## Risks

| Risk | What protects against it |
|---|---|
| A layout change quietly changes a number (what's due, how much is left). | Domain rules live in `src/lib/domain/` with tests; keep them unchanged (DR). |
| A refactor renames a storage key or field, and existing data stops loading. | Data contracts (DC) and the storage contract suite; migrate on purpose or not at all. |
| Old backups stop restoring. | DC-05, DC-06 and DD-15; test a current backup against the new build. |
| A shared link or the card page's *Edit card* breaks. | DC-15 and DC-16. |
| Removing a delete button's condition lets a card with purchases be deleted, taking them with it. | DR-19 and DC-13; the storage layer refuses it too, and the contract suite checks it. |
| Thai is broken or untranslated in a new screen. | UI-03 to UI-06; the catalog coverage test; screenshots in Thai. |
| Replacing *This sitting* drops the need with the mechanism, and the bookkeeper loses their place after an interruption. | G3, RD-02, US-08. Met in phase 3: waiting lists stay on Home until their reply is saved (RD-15). |
| Stricter restore checks reject an old backup the user relies on. | RD-06 only rejects values the forms never allowed; check a real backup before shipping. |
| A refactor drops the reading of old payment records without `parts`, and paid statements turn unpaid. | DR-29; the domain tests cover old records. |
| Moving payments from statements to cards changes what was paid or is left on an old statement. | RD-11 requires a migration that keeps every total; test it on a real backup. |
| A list waiting for the spender holds room and is forgotten. | Waiting lists stay at the top of Home and Transactions until saved (RD-13, RD-15). |
| Deleting old purchases changes what a card owes. | RD-18 deletes only purchases on fully paid statements, after a count and a second confirmation. |
| Something is dropped because no one knew it existed. | This document; the [Retired](#retired) list says what was removed on purpose. |

## Open questions

To settle with the user before the redesign is planned. Record each answer here, and move it
into the matching section.

1. **What hurts today?** *Answered 2026-10-29*: a busy dashboard, paying buried, a clunky
   registry, and actions split across pages. See [Problem](#problem) and G6.
2. **What else is driving the redesign?** *Answered 2026-10-29*: the look and phone use, as well
   as the flows and the code. See [Problem](#problem).
3. **Pages.** Keep four pages (dashboard, cards, one card, settings), or reorganise? For
   example, should paying statements, entering receipts and checking room be separate places?
   *Answered 2026-10-30*: none of the three as drawn. Four pages, Home, Transactions, Cards and
   Settings, with + for payments (RD-08), after the user corrected how the app is used. The
   mockups first offered:
   - **A. Task tabs.** One place per task: Overview (read-only numbers), Add receipts, Pay
     (every unpaid statement across cards), Cards (registry, limit groups, card detail),
     Settings. Bottom tabs on a phone, top tabs on a desktop.
   - **B. Hub and sheets.** One Overview page; adding receipts, paying, editing a card and
     card history open as sheets over it and return to the same spot. Cards and Settings stay
     separate pages.
   - **C. Card-centric.** Overview lists cards; everything about one card (room, statements,
     paying, purchases, editing) lives on its page. Add receipts is its own screen. Paying
     several cards means visiting each.
4. **Entering receipts.** *Answered 2026-10-30*: entering receipts gets its own screen (RD-01).
   *This sitting* doesn't fit as it is and is replaced (RD-02, question 11). *Superseded by
   RD-09: purchases come from purchase lists.*
5. **Phone first?** *Answered 2026-10-29*: checking room and viewing the numbers. See G7.
6. **Look.** *Answered 2026-10-30*: start again (RD-03).
7. **Refactor depth.** *Answered 2026-10-30*: keep the same stack (RD-04).
8. **Theme flash.** *Answered 2026-10-30*: fix it (RD-05).
9. **Restore checks.** *Answered 2026-10-30*: check ranges (RD-06).
10. **Delete guards.** *Answered 2026-10-30*: move them into storage (RD-07).
11. **What replaces *This sitting*?** *Answered 2026-10-30*: a recent entries list on the entry
    screen, sorted by when each purchase was added (RD-02). *Superseded by RD-09: a list waiting
    for the spender's reply is how the bookkeeper keeps their place.*
12. **Footer.** About in Settings now shows the build details (RD-20). Drop the page footer
    (FR-37), or keep a slim one? *Answered 2026-10-30*: drop it; About replaces it.
13. **A single purchase outside a list.** Is it still needed for an odd receipt, or does every
    purchase come from a list (RD-09)? *Answered 2026-10-30*: not needed; every purchase
    comes from a list. *Re-answered 2026-11-01, after testing the phase 5 preview*: needed. A
    single purchase can be added from the card page (DD-121); lists stay
    the way a planned purchase goes to the spender.
14. **Backup format.** Lists, planned payments, credit and the list of locations are new
    records. Add them as optional lists in version 2 (DD-15), or move to version 3 with a
    migration? *Answered 2026-10-30*: version 3. A version 2 backup still restores, migrated
    on the way in (G4).
15. **Page addresses.** Choose addresses for Transactions, a card, its edit screen and
    `/settings/locations`, and keep `/card?id=`, `/cards?…` and `/cards?edit=<id>` working
    (DC-15 to DC-17). *Answered 2026-10-30*: old links need not keep working, and retired
    addresses need no redirect. DC-15 to DC-17 retire with the redesign; the new addresses are
    the builder's call.
16. **Credit on statements.** How credit shows on a card's statements and in *Owed*, and
    whether it can be refunded or moved to another card. *Answered 2026-10-30*: it stays on the
    card and its next purchases use it up; no refunds or moves.
17. **Delete old purchases.** Confirm the age choices (6 months, 1, 2, 3 years), and whether
    saved lists and payments that old go too (RD-18). *Answered 2026-10-30*: 6 months, 1 year,
    3 years, or all; lists and payments from the same time go too.
18. **Thai words** for the new terms in the glossary. *Answered 2026-10-30*: use them as written.

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
| Location | สถานที่ | Where a card is kept: Bangkok, Phichit or Krabi, editable from RD-17. |
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
| Purchase places | สถานที่ที่บันทึกรายการใหม่ได้ | The locations whose cards can take a new purchase (DR-12); since phase 6, the locations ticked *Takes purchases* (บันทึกรายการซื้อได้). |
| This sitting | รอบนี้ | *(Retired in phase 3.)* Purchases entered since *Start new batch* was last pressed (DR-16). |
| Batch start | เวลาเริ่มรอบ | *(Retired in phase 3.)* When the current sitting began. |
| Entry time | เวลาที่เพิ่ม | When a purchase was first entered (`addedAt`), as opposed to its purchase date. |
| Satang | สตางค์ | 1/100 baht; how money is stored (DR-01). |
| Purchase list | ใบรายการซื้อ | A dated list of cards and amounts sent to the spender before buying (RD-09). |
| Spender's reply | คำตอบของผู้ใช้บัตร | Which lines on a list were made, with the real amounts. |
| Ready to use | พร้อมใช้ | Cards in places that take purchases, shown on Home to pick for a list (RD-15). |
| Planned payment | การชำระที่วางแผนไว้ | A payment dated later than today; it counts once marked paid (RD-12). |
| Credit | เครดิต | Money paid beyond what a card owes, used by its next purchases (RD-11). |
| Upcoming | กำลังจะมาถึง | Waiting lists and planned payments, not counted yet (RD-13). |
| Transactions | รายการเคลื่อนไหว | The ledger of purchases (−) and payments (+) (RD-13). |
| Environment | สภาพแวดล้อม | Which build is running: development, local, preview or production (RD-20). |
