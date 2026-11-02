# Redesign phase 1: rules and storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the domain rules and storage the redesign needs (card payments with credit,
planned payments, purchase lists, editable locations, old-purchase deletion, backup version 3,
delete guards, build stamps) without changing any page yet.

**Architecture:** Everything is additive. New pure modules in `src/lib/domain/`, new records
and methods on the `Repository`, a new `transfer-v3.ts` beside the current `transfer.ts`, and a
payment converter that is tested here but only run at startup in phase 2. Current pages keep
using `buildStatement`, `outstandingOf`, `StatementPayment` and `transfer.ts` untouched, so the
app works the same after this phase.

**Tech Stack:** Bun, TypeScript, `bun:test`, happy-dom, Lit (untouched here).

**Spec:** [`PRD.md`](../../../PRD.md), decided changes RD-06, RD-07, RD-09 to RD-12, RD-17,
RD-18, RD-20, decisions DD-39 to DD-46, answered questions 12 to 18. Roadmap:
[`2026-10-30-redesign-roadmap.md`](2026-10-30-redesign-roadmap.md).

## Global Constraints

- Money is whole satang integers (DR-01). Every amount and limit stored is a positive integer.
- Dates are `PlainDate` strings; date arithmetic only through `#lib/domain/date` (DR-02). No
  local-time `Date`.
- `src/lib/domain` imports nothing from storage or the interface (DC-01).
- Every new message key goes into both `src/lib/i18n/en.ts` and `th.ts` (UI-03); the catalog
  coverage test enforces it.
- Existing domain and storage tests keep passing without changing what they expect, except
  where a task below says so.
- Every new `Repository` method is covered in `src/lib/storage/contract.ts`, so both
  `InMemoryRepository` and `LocalStorageRepository` pass it.
- Key segments are `encodeURIComponent`-encoded, like today's keys (DC-02).
- Tests sit next to the code as `*.test.ts`. Commits are conventional, lower case, scoped:
  `feat(domain): …`, `feat(storage): …`, `feat(build): …`.
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`.

## Decisions this plan makes (the PRD leaves them open)

- **Planned or paid is a field.** `CardPayment.status` is `"planned"` or `"paid"`. A plan whose
  date passes stays a plan until marked paid (RD-12 says it counts only once marked).
- **Migrated payments keep their statement.** A payment converted from an old per-statement
  record carries `period`; allocation applies it to that statement first and lets only any
  overflow join the oldest-first pool. New payments have no `period`. This keeps every old
  statement's paid and left amounts exactly as they were (the PRD's acceptance criterion),
  even where old data paid a later statement before an earlier one.
- **Frozen dates get their own record.** `StatementDates { cardId, period, closeDate, dueDate }`,
  written the first time a payment reaches a statement and never rewritten (DD-02, DD-38).
- **Only lists waiting for the spender hold room.** Drafts don't (RD-09: "A waiting list holds
  its amounts").
- **Location ids.** The three existing locations keep the ids `bangkok`, `phichit`, `krabi`. A
  new location's id is a slug of its name, with `-2`, `-3` … on a clash. Renaming keeps the id.

## Review Focus

- A payment that exactly equals what is owed: owed 0, credit 0, every statement paid (Task 1).
- A payment on a card with no purchases yet: all of it is credit, and the next purchase uses it
  up (Task 1).
- Archived cards: their balance and credit still count toward the group's room (Task 3).
- An old payment record without `parts` converts at the statement's current total (DR-29),
  not at zero (Task 9).
- Renaming a location keeps its id, so cards kept there still point at it (Task 6).

---

### Task 1: Card payments and the ledger

**Files:**
- Modify: `src/lib/domain/types.ts` (add types)
- Create: `src/lib/domain/ledger.ts`
- Test: `src/lib/domain/ledger.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PaymentStatus = "planned" | "paid";
  export type CardPayment = { id: string; cardId: string; date: PlainDate; amount: number;
    status: PaymentStatus; period?: Period };  // period: only on converted records
  export type StatementDates = { cardId: string; period: Period; closeDate: PlainDate; dueDate: PlainDate };
  export type LedgerStatement = { cardId: string; period: Period; closeDate: PlainDate;
    dueDate: PlainDate; purchases: Purchase[]; total: number; paidAmount: number;
    remaining: number; paid: boolean; open: boolean };
  export type CardLedger = { statements: LedgerStatement[]; owed: number; credit: number };
  export function cardLedger(card: Card, purchases: Purchase[], payments: CardPayment[],
    frozen: StatementDates[], today: PlainDate): CardLedger;
  export function newlyFrozen(card: Card, ledger: CardLedger,
    frozen: StatementDates[]): StatementDates[];
  ```

`statements` are newest first and cover every period with a purchase for the card plus the
open period (`openPeriod` from `statement.ts`). `paid` is `paidAmount > 0 && remaining === 0`.
`open` marks the open period. Close and due dates come from `frozen` when a record exists for
the period, else from the cycle. `newlyFrozen` returns a record for each statement with
`paidAmount > 0` that has none yet.

Allocation, in order:
1. Only `status === "paid"` payments count.
2. Payments with a `period` apply to that statement, capped at its total; any overflow joins
   the pool.
3. The pool (period-less payments plus overflow) settles statements oldest first, the open
   period and later periods included.
4. What is left of the pool is `credit`. `owed` is the sum of `remaining`.

- [ ] **Step 1: Write the failing tests** in `ledger.test.ts`, using a card with
  `{ kind: "offset", closeDay: 10, dueOffsetDays: 25 }` and today `2026-10-30`:
  - `"pays the oldest statement first"`: purchases 1_000 on `2026-08-05` (Aug) and 2_000 on
    `2026-09-05` (Sep), one paid payment of 1_500 → Aug `remaining` 0 and `paid`, Sep
    `remaining` 1_500, `owed` 1_500, `credit` 0.
  - `"settles the open period too"`: purchase 3_000 on `2026-10-20` (open period Nov), paid
    payment 3_000 → that statement `paid`, `open` true, `owed` 0.
  - `"exact payment leaves no credit"` (review focus): purchases totalling 4_000, payment
    4_000 → `owed` 0, `credit` 0, every statement `paid`.
  - `"extra money becomes credit"`: purchase 1_000, payment 1_500 → `credit` 500, `owed` 0.
  - `"credit pays later purchases"` (review focus): no purchases, payment 2_000 dated
    `2026-10-01` → `credit` 2_000; add a purchase of 1_200 on `2026-10-15` → `credit` 800,
    `owed` 0.
  - `"planned payments change nothing"`: purchase 1_000, planned payment 1_000 → `owed`
    1_000, `credit` 0.
  - `"a payment with a period pays that statement first"`: Aug 1_000 and Sep 2_000, a paid
    payment of 2_000 with `period: "2026-09"` → Sep `paid`, Aug `remaining` 1_000.
  - `"overflow from a period payment joins the pool"`: Aug 1_000, Sep 2_000, payment 2_500
    with `period: "2026-09"` → Sep paid, Aug `remaining` 500.
  - `"frozen dates win over the cycle"`: a `StatementDates` for `2026-09` with closeDate
    `2026-09-12` → that statement's `closeDate` is `2026-09-12`.
  - `"newlyFrozen names statements first reached by money"`: Aug paid in part, Sep untouched,
    no frozen records → returns exactly one record, for `2026-08`, with the cycle's dates.
  - `"statements are newest first"`: periods come back in descending order.

- [ ] **Step 2: Run** `bun test src/lib/domain/ledger.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Add the types to `types.ts` and implement `cardLedger` and `newlyFrozen` in
  `ledger.ts`.** Reuse `periodOfPurchase`, `closeDateOf`, `dueDateOf`, `openPeriod`,
  `comparePeriods`, `sumAmounts`.

- [ ] **Step 4: Run** `bun test src/lib/domain/ledger.test.ts`. Expected: PASS. Then
  `bun run test`: every existing test still passes.

- [ ] **Step 5: Commit** `feat(domain): card ledger that settles the oldest statement first`.

### Task 2: What is due, on the ledger

**Files:**
- Modify: `src/lib/domain/ledger.ts`
- Test: `src/lib/domain/ledger.test.ts`

**Interfaces:**
- Consumes: `CardLedger`, `LedgerStatement` (Task 1).
- Produces:
  ```ts
  export type LedgerUrgency = "overdue" | "soon" | "due" | "open" | "paid";
  export function ledgerUrgency(statement: LedgerStatement, today: PlainDate): LedgerUrgency;
  export function nextBill(ledger: CardLedger): LedgerStatement | null;
  ```

`ledgerUrgency`: `"open"` for the open period or any statement whose close date is today or
later; `"paid"` when `remaining === 0`; `"overdue"` past the due date; `"soon"` within 7 days
of it; else `"due"`. A statement with total 0 is `"paid"` (never overdue, as DR-07).
`nextBill` is the oldest statement that is not `open` and has `remaining > 0`, or null.

- [ ] **Step 1: Write the failing tests**: `"overdue after the due date"`, `"soon within 7
  days"` (due `2026-11-04`, today `2026-10-30` → `"soon"`), `"due further out"`, `"open period
  is open even when owed"`, `"empty statement is never overdue"`, `"nextBill skips the open
  period"`, `"nextBill is null when nothing closed is owed"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/ledger.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** both functions; reuse `daysBetween` and `compareDates`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): urgency and next bill on the card ledger`.

### Task 3: Purchase lists

**Files:**
- Modify: `src/lib/domain/types.ts`
- Create: `src/lib/domain/purchase-list.ts`
- Test: `src/lib/domain/purchase-list.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ListStatus = "draft" | "sent" | "saved";
  export type ListLine = { cardId: string; amount: number; made?: boolean; actual?: number };
  export type PurchaseList = { id: string; date: PlainDate; status: ListStatus;
    lines: ListLine[]; sentAt?: string; savedAt?: string; movedTo?: string };
  export function listTotal(list: PurchaseList): number;         // planned amounts; saved lists sum actual of made lines
  export function allAnswered(list: PurchaseList): boolean;
  export function saveReply(list: PurchaseList, opts: { now: string; newId: () => string;
    moveUnmade: boolean }):
    | { ok: true; saved: PurchaseList; purchases: Purchase[]; draft: PurchaseList | null }
    | { ok: false; reason: "unanswered" };
  ```

The domain never throws catalog errors (only `date.ts` imports a type from i18n), so
`saveReply` returns `{ ok: false, reason: "unanswered" }` when any line has no `made`. Each made
line becomes a purchase on `list.date` for `actual ?? amount`, with `note` `""` and `addedAt`
`now`. With `moveUnmade` and at least one not-made line, `draft` is a new `"draft"` list dated
the next day (`addDays(list.date, 1)`) holding those lines without answers, and `saved.movedTo`
is its id. `saved.status` is `"saved"`, `savedAt` is `now`.

- [ ] **Step 1: Write the failing tests**: `"total of a sent list is its planned amounts"`,
  `"total of a saved list counts only made lines at their real amount"`, `"refuses to save
  until every line is answered"`, `"made lines become purchases on the list date"` (a line
  of 22_000 answered with `actual` 21_640 → purchase amount 21_640, date `list.date`),
  `"not-made lines move to a draft for the next day"` (`2026-10-30` → `2026-10-31`),
  `"no draft when moveUnmade is off"`, `"no draft when every line was made"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/purchase-list.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `purchase-list.ts`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): purchase lists and the spender's reply`.

### Task 4: Room on a group

**Files:**
- Create: `src/lib/domain/room.ts`
- Test: `src/lib/domain/room.test.ts`

**Interfaces:**
- Consumes: `CardLedger` (Task 1), `PurchaseList` (Task 3).
- Produces:
  ```ts
  export type GroupRoom = { group: LimitGroup; used: number; available: number;
    held: number; room: number; level: "within" | "high" | "over"; sharedWith: number };
  export function heldBy(lists: PurchaseList[], cards: Card[], groupId: string,
    exceptListId?: string): number;
  export function groupRoom(group: LimitGroup, cards: Card[],
    ledgers: Map<string, CardLedger>, lists: PurchaseList[], cardId: string,
    exceptListId?: string): GroupRoom;
  ```

`used` is the sum over every card in the group, archived included, of `owed - credit`.
`available = limit - used` (above the limit when credit exceeds what is owed). `held` is
`heldBy` over lists with status `"sent"` only. `room = available - held`. `level` uses
`usageLevel(used, limit)` from `limit.ts` (DR-23). `sharedWith` counts the group's other cards,
archived included (DR-24).

- [ ] **Step 1: Write the failing tests**: `"room is limit less owed"`, `"credit lifts room
  above the limit"`, `"archived cards still count"` (review focus), `"a sent list holds
  room"`, `"a draft list holds nothing"`, `"a list can leave itself out"` (via
  `exceptListId`), `"sharedWith counts archived cards"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/room.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `room.ts`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): group room with credit and lists that hold it`.

### Task 5: Warnings while entering amounts

**Files:**
- Create: `src/lib/domain/amount-warnings.ts`
- Test: `src/lib/domain/amount-warnings.test.ts`

**Interfaces:**
- Consumes: `GroupRoom` (Task 4), `nextBill`, `ledgerUrgency` (Task 2), `isCloseDate` (`cycle.ts`).
- Produces:
  ```ts
  export type AmountWarning =
    | { kind: "over-room"; over: number; room: number; held: number; plannedBefore: number }
    | { kind: "shared-limit"; cardIds: string[]; over: number }
    | { kind: "overdue-bill"; remaining: number; dueDate: PlainDate }
    | { kind: "close-date"; closeDate: PlainDate };
  export type DraftLine = { card: Card; amount: number; room: GroupRoom; ledger: CardLedger;
    planned: CardPayment[] };
  export function lineWarnings(line: DraftLine, lines: DraftLine[], date: PlainDate,
    today: PlainDate): AmountWarning[];
  export function datePassed(date: PlainDate, today: PlainDate): boolean;
  ```

Rules (RD-10): when two or more lines share a group and their amounts together exceed that
group's `room`, every one of them gets `"shared-limit"` (with all their card ids, sorted) and
not `"over-room"`. Otherwise `"over-room"` when `amount > room.room`, where `plannedBefore` is
the sum of that card's planned payments dated on or before `date`. `"overdue-bill"` when the
card's `nextBill` is `"overdue"`. `"close-date"` when `date` is the card's close date.
`datePassed` is `date < today`. There is no future-date warning.

- [ ] **Step 1: Write the failing tests**: one per warning kind, plus `"shared limit replaces
  over-room"`, `"no warnings for a line that fits"`, `"zero amount gives no room warnings"`,
  `"plannedBefore counts only plans on or before the date"`, `"datePassed is false for
  today"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/amount-warnings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): warnings while entering list amounts`.

### Task 6: Locations as records

**Files:**
- Create: `src/lib/domain/locations.ts` (the closed set in `location.ts` stays for phase 2)
- Test: `src/lib/domain/locations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LocationRecord = { id: string; name: string; takesPurchases: boolean };
  export function defaultLocations(settings: Settings): LocationRecord[];
  export function locationId(name: string, existing: LocationRecord[]): string;
  export function renameLocation(records: LocationRecord[], id: string, name: string): LocationRecord[];
  export function canDeleteLocation(id: string, cards: Card[]): boolean;
  export function takesPurchases(records: LocationRecord[], id: string): boolean;
  ```

`defaultLocations` returns Bangkok, Phichit and Krabi with ids `bangkok`, `phichit`, `krabi`,
`takesPurchases` from `settings.purchaseLocations` (DC-08 rules: an empty list is kept).
`locationId` lower-cases, turns runs of non-alphanumerics into `-`, trims dashes, and adds
`-2`, `-3` … on a clash; an all-Thai name with no ASCII gives `location`, then `location-2`.
`canDeleteLocation` is false while any card, archived included, is kept there.

- [ ] **Step 1: Write the failing tests**: `"defaults follow the purchase places"` (default
  settings → only Krabi takes purchases), `"an empty purchase list is kept"`, `"id is a slug
  of the name"` (`"Chiang Mai"` → `chiang-mai`), `"id clash gets a number"`, `"Thai-only name
  gets a fallback id"` (`"เชียงใหม่"` → `location`), `"rename keeps the id"` (review focus),
  `"a location with an archived card can't be deleted"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/locations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): locations as editable records`.

### Task 7: Choosing old purchases to delete

**Files:**
- Create: `src/lib/domain/purge.ts`
- Test: `src/lib/domain/purge.test.ts`

**Interfaces:**
- Consumes: `cardLedger` (Task 1), `PurchaseList` (Task 3).
- Produces:
  ```ts
  export type PurgeAge = "6m" | "1y" | "3y" | "all";
  export function purgeCutoff(age: PurgeAge, today: PlainDate): PlainDate;
  export type PurgePlan = { purchaseIds: string[]; paymentIds: string[];
    trimmed: CardPayment[]; listIds: string[]; frozenPeriods: { cardId: string; period: Period }[] };
  export function planPurge(cards: Card[], purchases: Purchase[], payments: CardPayment[],
    frozen: StatementDates[], lists: PurchaseList[], cutoff: PlainDate, today: PlainDate): PurgePlan;
  ```

`purgeCutoff`: `6m` → same day six months back, clamped (`2026-10-30` → `2026-04-30`); `1y`
→ `2025-10-30`; `3y` → `2023-10-30`; `all` → `addDays(today, 1)`.

Per card, a purchase goes when its date is before `cutoff` and its whole statement is closed
and `paid` (RD-18). Let P be the total going. Paid payments dated before `cutoff` go oldest
first until their sum reaches P; if the last one overshoots, it stays with its amount cut to
the overshoot and is listed in `trimmed` (same id). If payments before the cutoff sum to less
than P, purchases are dropped from the plan, newest statement first, until the sums match.
Saved lists dated before `cutoff` go. Frozen dates for removed statements go. Planned
payments never go.

- [ ] **Step 1: Write the failing tests**: `"cutoffs"` (all four ages from `2026-10-30`),
  `"only fully paid closed statements go"`, `"payments go up to what the purchases took"`,
  `"an overshooting payment is trimmed, not removed"`, `"owed and credit are unchanged"`
  (apply the plan to a sample with credit on one card, rebuild every `cardLedger`, compare
  `owed` and `credit` per card before and after), `"saved lists before the cutoff go, others
  stay"`, `"planned payments stay"`.
- [ ] **Step 2: Run** `bun test src/lib/domain/purge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): choose old purchases to delete without moving balances`.

### Task 8: New records in storage, with delete guards

**Files:**
- Modify: `src/lib/storage/repository.ts`, `src/lib/storage/local.ts`, `src/lib/storage/contract.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/lib/storage/memory.test.ts`, `src/lib/storage/local.test.ts` (both run the contract)

**Interfaces:**
- Consumes: `CardPayment`, `StatementDates` (Task 1), `PurchaseList` (Task 3), `LocationRecord` (Task 6).
- Produces, on `Repository`:
  ```ts
  listCardPayments(cardId: string): Promise<CardPayment[]>;      // by date, then id
  saveCardPayment(payment: CardPayment): Promise<void>;
  deleteCardPayment(cardId: string, id: string): Promise<void>;
  listStatementDates(cardId: string): Promise<StatementDates[]>; // by period
  saveStatementDates(dates: StatementDates): Promise<void>;
  deleteStatementDates(cardId: string, period: string): Promise<void>;
  listPurchaseLists(): Promise<PurchaseList[]>;                 // by date, then id
  savePurchaseList(list: PurchaseList): Promise<void>;
  deletePurchaseList(id: string): Promise<void>;
  listLocations(): Promise<LocationRecord[]>;                   // stored order (by id)
  saveLocation(location: LocationRecord): Promise<void>;
  deleteLocation(id: string): Promise<void>;
  ```
  Keys: `cc:cardpayment:<cardId>:<id>`, `cc:statementdates:<cardId>:<period>`,
  `cc:list:<id>`, `cc:location:<id>`, each segment encoded. `deleteCard` also removes the
  card's card payments and statement dates (trailing-colon scan, DC-02). `clearAll` removes
  the four new kinds too.

Guards (RD-07), thrown as `MessageError` with these keys:
- `deleteCard` while the card has purchases → `"guard.cardHasPurchases"`.
- `deleteLimitGroup` while a card has that `limitGroupId` → `"guard.groupInUse"`.
- `deleteLocation` while a card is kept there → `"guard.locationInUse"`.

Copy for the catalogs:

| Key | en | th |
|---|---|---|
| `guard.cardHasPurchases` | This card has purchases, so it can't be deleted. Archive it instead. | บัตรนี้มีรายการซื้อ จึงลบไม่ได้ เก็บเข้าคลังแทน |
| `guard.groupInUse` | Cards still use this limit group. Move them to another group first. | ยังมีบัตรใช้กลุ่มวงเงินนี้ ย้ายบัตรไปกลุ่มอื่นก่อน |
| `guard.locationInUse` | Cards are still kept here. Move them to another location first. | ยังมีบัตรเก็บไว้ที่นี่ ย้ายบัตรไปที่อื่นก่อน |

The storage layer already imports `MessageError` (see `#lib/storage/index`), so it may throw it.

This changes what `deleteCard` does on a card with purchases; the existing contract test
`"deleting a card cascades to its purchases and payments"` changes to delete the purchases
first, then the card, and assert the payments went. That is the one existing expectation
this plan changes, as RD-07 decides. The UI already hides the button, so no page breaks.

- [ ] **Step 1: Write the failing contract tests**: save/list/delete for each new kind;
  sort orders above; `"card payments of one card only"`; `"deleting a card removes its card
  payments and statement dates"`; `"cascade does not touch a card whose id is a prefix"`
  for the new keys; `"clearAll removes the new records"`; the three guards (assert
  `MessageError` with the key); `"a location can be deleted once no card is kept there"`.
- [ ] **Step 2: Run** `bun test src/lib/storage`. Expected: FAIL on the new tests in both
  implementations.
- [ ] **Step 3: Implement** in `InMemoryRepository` and `LocalStorageRepository`; add the
  catalog keys in `en.ts` and `th.ts`.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS, including the catalog coverage test.
- [ ] **Step 5: Commit** `feat(storage): card payments, lists and locations, with delete guards`.

### Task 9: Converting stored payments

**Files:**
- Create: `src/lib/storage/migrate-payments.ts`
- Test: `src/lib/storage/migrate-payments.test.ts`

**Interfaces:**
- Consumes: `buildStatement`, `partsOf` (existing), `cardLedger` (Task 1), the Task 8 methods.
- Produces:
  ```ts
  export function convertPayments(cards: Card[], purchases: Purchase[],
    old: StatementPayment[], newId: () => string): { payments: CardPayment[]; dates: StatementDates[] };
  export async function migratePayments(repo: Repository, newId: () => string): Promise<number>;
  ```

`convertPayments`: each part of each old record (`partsOf(record, total)`, where `total` is
that statement's current total from `buildStatement`) becomes a `"paid"` `CardPayment` with
`date` = part `paidAt`, the part amount, and `period` = the record's period. Each old record
gives one `StatementDates` from its `closeDate` and `dueDate`. A record whose `parts` is
absent and whose statement total is 0 gives no payment.

`migratePayments` does nothing and returns 0 when any card already has a card payment
(already converted); otherwise it saves the converted records and returns how many payments
it wrote. Old `cc:payment:` keys stay on disk (DD-14). Phase 2 calls it at startup.

- [ ] **Step 1: Write the failing tests**: `"one payment per part"`, `"a record without parts
  pays the current total"` (review focus, DR-29), `"frozen dates come from the old record"`,
  `"every statement keeps its paid and left amounts"` (for a sample with an older unpaid
  statement and a newer paid one, compare `buildStatement` with old records against
  `cardLedger` with converted ones, period by period), `"running twice converts once"`.
- [ ] **Step 2: Run** `bun test src/lib/storage/migrate-payments.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storage): convert statement payments to card payments`.

### Task 10: Backup version 3

**Files:**
- Create: `src/lib/storage/transfer-v3.ts`
- Test: `src/lib/storage/transfer-v3.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts` (new problem keys only if the existing
  `backup.*` keys don't cover a range problem)

**Interfaces:**
- Consumes: Task 8 methods, `convertPayments` (Task 9), `defaultLocations` (Task 6), the
  shape checks in `transfer.ts` (reuse its exported helpers or move shared ones into a small
  `transfer-shared.ts`, keeping `transfer.ts` behaviour unchanged).
- Produces:
  ```ts
  export const BACKUP_V3 = 3;
  export type BackupV3 = { version: 3; exportedAt: string; limitGroups: LimitGroup[];
    cards: Card[]; purchases: Purchase[]; payments: CardPayment[];
    statementDates: StatementDates[]; lists: PurchaseList[]; locations: LocationRecord[] };
  export async function exportBackupV3(repo: Repository, now: Date): Promise<BackupV3>;
  export function parseAnyBackup(text: string, newId: () => string): BackupV3;  // accepts 2 and 3
  export async function importBackupV3(repo: Repository, backup: BackupV3): Promise<void>;
  ```

A version 2 file converts on the way in: payments through `convertPayments`, locations from
`defaultLocations(settings ?? DEFAULT_SETTINGS)`, no lists. Any other version is rejected with
the existing `backup.version` key. Range checks (RD-06) apply to both versions and reject the
whole file before anything is written, naming the record: amounts, limits and payment amounts
above zero and whole; `last4` exactly four digits; close and due days 1 to 31, days until due
1 to 60 (DR-25); list line amounts above zero; payment `status` one of the two; list `status`
one of the three. Import writes groups, locations, cards, purchases, payments, statement dates,
then lists. `transfer.ts` stays wired to the current settings page until phase 6.

- [ ] **Step 1: Write the failing tests**: `"round trip keeps every record"`, `"a version 2
  file converts"` (with and without `settings`, payments with and without `parts`), `"a
  version 1 file is rejected"`, one rejection test per range rule naming the record,
  `"nothing is written when a later record is bad"`.
- [ ] **Step 2: Run** `bun test src/lib/storage/transfer-v3.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `bun run test`. Expected: PASS, `transfer.test.ts` unchanged.
- [ ] **Step 5: Commit** `feat(storage): backup version 3 with range checks`.

### Task 11: Build stamps for environment and branch

**Files:**
- Modify: `scripts/build-env.ts`, `scripts/build-env.test.ts`
- Modify: `src/lib/ui/build-info.ts`, `src/lib/ui/build-info.test.ts`
- Modify: `.github/workflows/deploy-preview.yml`, `.github/workflows/deploy-production.yml`

**Interfaces:**
- Produces:
  ```ts
  export type Environment = "development" | "local" | "preview" | "production";
  // BuildInfo gains: environment: Environment; branch: string
  export function titleMark(environment: Environment, pr: string): string;
  ```

`build-env.ts` adds `BUN_PUBLIC_ENVIRONMENT` (env value, else `"local"`) and
`BUN_PUBLIC_BRANCH` (env value, else `git rev-parse --abbrev-ref HEAD`). The preview workflow
sets `BUN_PUBLIC_ENVIRONMENT: preview` and `BUN_PUBLIC_BRANCH: ${{ github.head_ref }}`; the
production workflow sets `production` and `main`. `buildInfo()` on a dev server (the catch
path) reports `"development"` and an empty branch; an unknown value reads as `"local"`.
`titleMark`: `"development"` → `" (dev)"`, `"local"` → `" (local)"`, `"preview"` →
`" (pr-<pr>)"`, `"production"` → `""`. `withPrSuffix` stays until phase 2 replaces its callers.

- [ ] **Step 1: Write the failing tests**: in `build-env.test.ts`, `"environment defaults to
  local"`, `"branch comes from the environment when set"`; in `build-info.test.ts`, `"dev
  server reads as development"`, `"unknown environment reads as local"`, one `titleMark` test
  per environment.
- [ ] **Step 2: Run** `bun test scripts/build-env.test.ts src/lib/ui/build-info.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** and edit both workflows.
- [ ] **Step 4: Run** `bun run test` and `bun run build`. Expected: PASS; the build log shows
  no `process.env` left unreplaced.
- [ ] **Step 5: Commit** `feat(build): stamp the environment and branch`.

### Finish the phase

- [ ] Update `PRD.md` and `PRD_TH.md`: in *Where things live*, list the new modules; mark in
  the decided-changes intro that phase 1 (rules and storage) has shipped; add this plan's five
  decisions to the Decisions table as DD-47 to DD-51, in both languages.
- [ ] Ship through `.claude/skills/shipping-a-change` (one pull request for the phase).
