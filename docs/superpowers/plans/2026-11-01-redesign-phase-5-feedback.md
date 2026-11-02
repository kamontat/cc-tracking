# Redesign phase 5, feedback round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Act on the user's first review of the phase 5 preview (PR #33, 2026-11-01): margins
on the card page, payments on statements, adding a purchase without a list, a calmer card
page and edit page, new card titles, and Archive/Delete beside Edit.

**Architecture:** The ledger records which payment parts settled each statement
(`src/lib/domain/ledger.ts`). Card titles come from `#lib/ui/card-label`. A compact sticky
sub-header (`src/lib/ui/sub-header.ts`) replaces the large back header on the card page and the
edit page. The purchase sheet gains an add mode, used on the card page and on a new `/purchase`
page (picker plus sheet, like `/pay`) that the *+ New* menu links to.

**Tech Stack:** Bun, TypeScript, Lit, `bun:test`, happy-dom.

**Spec:** `PRD.md` (DD-111 to DD-120, UI-14, RD-09, FR-16 to FR-22, DR-11). Base plan:
[`2026-10-31-redesign-phase-5-cards.md`](2026-10-31-redesign-phase-5-cards.md) — its Global
Constraints still bind. Prototype `subHead`, `vCard`, `vEdit` in
`/Users/kamontat/Personal/cc-tracking/.playwright-mcp/cc-flows.html`.

## Global Constraints

Same as the base plan: satang and `PlainDate` rules, domain imports nothing from storage or UI,
tokens only through `var(--cc-*)`, three button variants, no selector on translated text, every
string in `en.ts` and `th.ts`, saves awaited and a failed write keeps typing, two-step deletes,
`data-numeric` on amounts, full check list before each commit, screenshots at 1280 and 390 in
both themes before reporting a screen done.

## Decisions (user, 2026-11-01)

- **A purchase can be added without a list** (reverses open question 13). Two ways in: the card
  page's *Add purchase* (the purchase sheet over the page, card fixed) and the *+ New* menu's
  *Add purchase*, which opens `/purchase`: a card picker (only cards that can take a purchase,
  FR-22, by place then id, with search) under a back header, and `/purchase?card=<id>` with the
  sheet over it — the same address and Back rules as `/pay` (DD-76, DD-102). The sheet: date
  (today), amount, note. It warns without blocking when the date is the card's close date or in
  the future (FR-20), and after a save over the room says by how much it went over which group
  (FR-19, DR-11). A new purchase is stamped `addedAt` now (DR-15). From the card page a save
  stays on the page; from `/purchase` it goes to the card page (`location.replace`).
- **Payments show in an unfolded statement**: the payment parts that settled it, from the
  ledger (FIFO: payments naming the period first, then the pool oldest statement first, the pool
  spent in payment date order). Each reads `date · Payment · +฿part`, and `(part of ฿total)` when
  the payment was split. Purchases and payments in one list by date. A payment part has no Edit
  or Delete here (payments are deleted from Transactions, DD-77). A statement with payments but
  no purchases can also unfold.
- **Card titles** (amends UI-14 for these places only):
  - Cards page rows: title `id) name · holder (last4)`; subtitle `closes D · due D` (the
    open period, short dates); a *Supplementary* tag when the card is supplementary. The right
    side is unchanged.
  - Card page and edit page title: `name · holder (last4)`. `holder` is the cardholder
    (`cardOwnerOf`: the supplementary holder, else the group's account holder); left out with its
    `·` when unknown. `(last4)` is left out when the card has none. A new card's edit page reads
    *New card*.
- **Compact sub-header** (prototype `subHead`): a slim sticky bar under the app header: back
  arrow, title, a muted subtitle line, actions on the right. Card page subtitle: `id · Kept in
  place`; actions *Edit* and a *More* (`⋯`) menu with *Archive card* / *Unarchive card* and
  *Delete card* (danger, two steps, only when allowed: no purchases, on no draft or waiting
  list). Edit page subtitle: *Card id can't change* (edit) or nothing (new).
- **Archive and Delete leave the edit page** (Ruling: one place for them, the card page's More
  menu; the edit page keeps *Save changes*). After Delete the page goes to `/cards`.
- **Card page layout** with inner margins: hero, stats, the comment, actions (*Use on a list*,
  *Add purchase*, *Make a payment*; the reason note in place of the first two when the card can't
  take a purchase), then *Statements*. An unfolded statement's items sit inside the row's padding;
  the head's focus ring never touches the panel edge.
- **Edit page in sections**: panels *Card* (name, card id, last 4), *Where and who* (kept in,
  limit group, cardholder), *Billing cycle* (kind, close day, due), *Comment*; *Save changes* at
  the end.

---

### Task 1: Payment parts on statements (domain)

**Files:** `src/lib/domain/ledger.ts`, `types.ts` (+ tests).

- [ ] `LedgerStatement.payments: { payment: CardPayment; amount: number }[]` — the parts that
  settled it, per the Decisions' order. Sum equals `paidAmount`. Credit untouched. All existing
  ledger figures unchanged (run every existing ledger, home, transactions and card test).
- [ ] Tests: named period, pool across two statements (one payment split), payment order by
  date then id, credit left over, planned payments ignored.
- [ ] Commit `feat(ledger): payment parts on each statement`.

### Task 2: Card titles

**Files:** `src/lib/ui/card-label.ts` (+ test), `cc-cards-list.ts` (+ test), i18n.

- [ ] `cardTitle(card, groups)` → `name · holder (last4)` per the Decisions; `cardRowTitle`
  → `id) name · holder (last4)`. Text and Lit forms as card-label already has.
- [ ] Cards rows: new title, subtitle `closes D · due D` (open period via the statement rules
  the card page uses), *Supplementary* tag.
- [ ] Commit `feat(cards): card titles with holder and last 4`.

### Task 3: Compact sub-header and the card page

**Files:** create `src/lib/ui/sub-header.ts` (+ test); `src/routes/card.ts`,
`cc-card-hero.ts`, `cc-card-statements.ts` (+ tests); `app.css`/`shared.ts`.

- [ ] Sub-header per the Decisions; More menu is a small popover button list (Escape and an
  outside click close it, focus returns to `⋯`), Archive/Unarchive saves the card, Delete two
  steps then `location.replace("/cards")`, storage refusal shown.
- [ ] Margins fixed (the screenshot: unfolded items flush with the panel; head focus ring on the
  edge).
- [ ] Payments in unfolded statements (Task 1 data), no Edit/Delete on them.
- [ ] Commit `feat(cards): compact card page header, more menu, payments on statements`.

### Task 4: Add purchase without a list

**Files:** `cc-purchase-sheet.ts` (+ test) add mode; `src/routes/card.ts`; create
`src/routes/purchase.html`, `purchase.ts`, `purchase-page.ts` (+ test); `cc-fab-menu.ts`;
`src/lib/ui/shell.ts` (`/purchase` under Home? — under Transactions, like `/pay`).

- [ ] Add mode, warnings and the over-room confirmation per the Decisions (find the phase 3
  rules for close-date and future-date warnings and the over-room amount; reuse them).
- [ ] `/purchase` page modelled on `src/routes/pay-page.ts` (address bar seam, picker, sheet,
  Back rules). Picker can reuse or generalise `cc-pay-picker` only if that stays simple; else a
  small `cc-purchase-picker`.
- [ ] *+ New* menu: *New purchase list*, *Add purchase*, *Make a payment*.
- [ ] Commit `feat(purchases): add a purchase without a list`.

### Task 5: Edit page in sections

**Files:** `cc-card-form.ts` (+ test), `src/routes/card/edit-page.ts` (+ test).

- [ ] Sub-header with the new title; sections; Archive and Delete removed from the form and
  the page (their tests move to the card page in Task 3).
- [ ] Commit `feat(cards): edit page in sections`.

### Task 6: Docs and ship

- [ ] `PRD.md` + `PRD_TH.md` in step: open question 13 re-answered (2026-11-01), RD-09 and
  FR-19/FR-20/FR-21 notes, UI-14 amended, DD rows for the decisions above (next free number),
  DD-114 and DD-118 updated (Archive/Delete moved, payments listed).
- [ ] Screenshots at 1280 and 390, light and dark. Push to PR #33; wait for the preview deploy.
