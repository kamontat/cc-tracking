# Redesign phase 4: Transactions and payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make card payments the stored truth (conversion at startup, backup version 3), and
build the payment form (`/pay`), planned payments, and the Transactions page: one ledger with
*Upcoming*, search, filter and sort, a Lists view, and what each card owes.

**Architecture:** `bootstrap` runs `migratePayments` after the location migration; from then on
`loadMoneyData` reads `listCardPayments` and `listStatementDates`. Pure rules live in
`src/lib/domain/pay.ts` (card choice, form figures, mark paid) and
`src/lib/domain/transactions.ts` (ledger entries, filters, sorts, day groups, month summary,
upcoming, owed rows). The address carries the Transactions view (`src/lib/ui/tx-query.ts`).
Lit components render each piece; routes `/transactions` and `/pay` wire them to storage.
The card page and Cards page switch to the ledger; the old payment dialog goes.

**Tech Stack:** Bun, TypeScript, Lit, `@kcstyles/reset.css`, `bun:test`, happy-dom.

**Spec:** [`PRD.md`](../../../PRD.md): RD-11 to RD-14 (and the phase 4 parts of RD-10, RD-15);
DD-42, DD-43, DD-44, DD-47 to DD-49, DD-57, DD-65, DD-75; FR-14, FR-15, FR-25; DR-01, DR-02,
DR-17, DR-31; DC-02 to DC-06; UI-01 to UI-21; open questions 14 and 16. Roadmap:
[`2026-10-30-redesign-roadmap.md`](2026-10-30-redesign-roadmap.md) (phase 4 row and notes).
Visual reference: the approved prototype (`vTx`, `shPick`, `shPay`, `shFilter`, `owedPanel`).

## Global Constraints

- Money is whole satang (DR-01): typed amounts through `parseAmount`, shown through
  `formatAmount`. Dates are `PlainDate`; arithmetic through `#lib/domain/date` (DR-02); shown
  with `displayDate` or `headerDate`, never `Intl` (UI-05).
- `src/lib/domain` imports nothing from storage or the interface; components never import
  `#lib/storage` (DC-01).
- Shadow CSS and `app.css` use only `var(--cc-*)`; values live in `tokens.css` (UI-01). Three
  button variants (UI-02). No selector on translated text (UI-04).
- Every new string in both `en.ts` and `th.ts` (UI-03), using the glossary's Thai terms:
  การชำระที่วางแผนไว้ (planned payment), เครดิต (credit), กำลังจะมาถึง (Upcoming),
  รายการเคลื่อนไหว (Transactions). Card names, ids and notes are never translated (UI-13).
- Direction is sign and word, never colour alone: a purchase reads `−฿…` and *Purchase*, a
  payment `+฿…` and *Payment* (DD-43, UI-07).
- Cards are named `id) Name (last4)` through `cardLabelHtml`/`cardLabelText` (UI-14, DD-70).
- Saves are awaited; a failed write keeps what was typed and shows why (UI-11). A language
  switch re-renders in place (UI-12). Deleting a payment asks twice (UI-09).
- Numeric cells carry `data-numeric` (UI-17). Empty states name the next step (UI-15).
- Components and routes stay flat in `src/components/` and `src/routes/` (the catalog test's
  glob is not recursive); `/pay` is `src/routes/pay.html` + `pay.ts`.
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`. Conventional, lower-case, scoped commits.

## Decisions

Made by the controller. The user was away when asked (2026-10-31); each took the recommended
option and can be revised on the preview.

- **The payment form is its own page**, `/pay`: without `card` it asks *Which card?*; with
  `?card=<id>` it shows the form; `?card=<id>&amount=<satang>` prefills the amount. Back goes to
  the previous page (`history.back()` when there is one, else `/transactions`). After a save
  it replaces the address with `/transactions`. The floating Payment button links to `/pay`.
  `/pay` marks the Transactions tab and hides the floating button (`data-list-page`).
- **A wrong payment is deleted from Transactions**: tapping a payment row opens it in place
  with *Delete payment*, then a second step *Delete ฿X to CARD?* with *Delete* (danger) and
  *Keep* (UI-09). A planned row has *Mark paid* and the same delete.
- **The card page and Cards page read the ledger** in phase 4. The statement list loses Mark
  paid and per-part undo; the card summary gets one *Make a payment* link to
  `/pay?card=<id>`. `cc-payment-form`, `payment-dialog.ts` and their keys go.
- **Transactions has a switch** *Ledger · Lists · Owed*. From 900px *Owed* leaves the switch
  and sits beside the ledger (RD-13).

Made by this plan:

- **Startup.** `bootstrap` awaits `migrateLocations` (failure logged, as today), then
  `migratePayments(repo, localStorage)`. A rejection renders `cc-error-banner` with
  `startup.paymentsFailed` and a reload button instead of the page (numbers from half-converted
  payments would be wrong); the marker stays unset, so the reload retries.
- **New payments freeze dates.** Every write that makes a payment paid (record, mark paid)
  also saves `newlyFrozen(card, ledgerAfter, dates)` (DD-49).
- **Mark paid** sets `status: "paid"` and the date to the plan's date when that is today or
  earlier, else today (paid early).
- **Upcoming** holds lists waiting for the spender (oldest date first, row opens
  `/list/reply?id=`) and planned payments (by date, then id). Planned payments are never in
  the ledger and change nothing (RD-12, DD-47).
- ***Needs you*** gains `planned` items: planned payments dated on or before today + 3 days,
  after overdue bills and before drafts, each linking to `/transactions` (its Upcoming row).
- **Over the room** (RD-10) passes every planned payment on a card in the line's group dated
  on or before the list's date as `DraftLine.planned`; the warning already sums them
  (`plannedBefore`) and the line shows "฿X planned to be paid by then" when above zero.
- **Ledger search** matches, case-insensitively, the card id, name and last 4, a purchase's
  note, and the amount as `formatAmount` prints it, digits only too (`41230` finds
  `฿41,230.00`).
- **Filters**: type (`purchase`, `payment`), cards (any number), and a date range: the presets
  of `purchase-range.ts` (`today`, `week`, `month`, `lastMonth`) or a custom `from`/`to`
  (normalised by `normaliseRange`). Sorts: `new` (default), `old`, `big`, `small`; the date
  sorts group rows under day headings ("Today · Sat, 31 Oct" for today), amount sorts give one
  flat list with the date on each row. Within a day, purchases by `addedAt` latest first
  (DR-17), then payments by id.
- **Month summary** (shown only with no search or filter): the current month's purchases,
  paid payments, and owed now (the sum of every card's `owed`).
- **Archived cards** stay in the ledger, tagged *Archived* (DD-24); they are offered in the
  card filter and in *Which card?* only while they owe money.
- **Owed rows**: every card that owes money or holds credit, archived included while it owes.
  Default order: overdue (most days first), due within 7 days, then most owed, ties by id.
  Sort choices `urgency`, `card`, `due`, `left` (FR-15). A row opens `/pay?card=`.
- **Lists view**: every list, newest date first, with status chips *Draft*, *Waiting for the
  spender*, *Saved* (none ticked = all). A row shows the date, card count, status word and
  total (a saved list's made total, DD-65, via `shareTable`), and opens `listPageAddress`.
- **Purchase rows link** to their list when `listIdOf(purchase.id)` names a stored list
  (`/list/view?id=`), else to `/card?id=`.
- **Address**: `/transactions?view=lists|owed&q=&type=&card=&card=&range=&from=&to=&sort=&status=`,
  defaults left out, written with `history.replaceState`.
- **Backup version 3** in Settings: download, copy and restore all use `transfer-v3`; restore
  accepts version 2 or 3 and keeps Merge/Replace (DD-17). Counts gain lists. Export reads the
  location records, or `defaultLocations(settings)` while none are stored. Import also writes
  `settings.purchaseLocations` from the file's locations that take purchases and are a known
  `Location`, when the file has any locations (Home still reads settings until phase 6).
  Before writing a converted payment (`m:` id with a `period`), import deletes the card's
  stored `m:<card>:<period>:` payments, so a record that now converts to fewer parts leaves
  none behind.
- **Leftovers**: the action-bar CSS moves into `shared.ts`; `purchasesInRange` and
  `rangeSummary` are deleted (only `presetRange` and `normaliseRange` are used); the old
  `transfer.ts` keeps only what `transfer-v3` imports from it.

## Review Focus

1. A browser that already holds converted payments loads the same numbers after the startup
   migration as phase 3 showed in memory (same ledger) — test `loadMoneyData` after
   `migratePayments` equals the phase 3 in-memory result (Task 1).
2. A planned payment whose date has passed stays planned, out of the ledger and out of room
   (DD-47) — tests in Tasks 2 and 3.
3. Restoring a version 2 file over already-converted data leaves no stale `m:` parts (Task 10).
4. Search with Thai text or symbols (`฿`, `,`) never throws and matches notes as typed (Task 3).
5. A card id holding `&`, `:` or spaces survives `/pay?card=` and the Transactions `card`
   filter round trip (Tasks 4 and 7).

---

### Task 1: Stored payments at startup

**Files:**
- Modify: `src/lib/ui/page.ts`, `src/lib/ui/money-data.ts`, `src/lib/i18n/en.ts`, `th.ts`
- Create: `src/lib/ui/record-payment.ts`
- Test: `src/lib/ui/page.test.ts` (create if missing), `src/lib/ui/money-data.test.ts`,
  `src/lib/ui/record-payment.test.ts`

**Interfaces:**
- Produces: `MoneyData` gains `payments: CardPayment[]` and `dates: StatementDates[]`.
  `loadMoneyData(repo, today)` reads stored card payments and dates.
- Produces: `savePayment(repo: Repository, data: MoneyData, payment: CardPayment, today: PlainDate): Promise<void>`
  in `record-payment.ts`: saves the payment, then the `newlyFrozen` dates of its card computed
  from a ledger that includes it. `deletePayment(repo, payment)` wraps `deleteCardPayment`.

- [ ] **Step 1: Failing tests.** `money-data.test.ts`: "reads stored card payments" (a stored
  paid `CardPayment` lowers `ledgers.get(id).owed`); "matches the in-memory conversion after
  migratePayments" (old records → `migratePayments` → `loadMoneyData` ledgers deep-equal
  `ledgersFor(..convertPayments(..))`); "ignores old records once converted" (an old
  `StatementPayment` saved after the marker changes nothing). `page.test.ts`: "a failed
  payment conversion shows the banner, not the page" (repo whose `saveCardPayment` throws →
  render callback not called, `cc-error-banner` present, marker unset). `record-payment.test.ts`:
  "saving a paid payment freezes the statements it reaches"; "a planned payment freezes none".
- [ ] **Step 2:** `bun test src/lib/ui` — fails.
- [ ] **Step 3:** Implement. Key `startup.paymentsFailed`: "Could not update your saved
  payments. Nothing was lost. Reload to try again." (Thai too).
- [ ] **Step 4:** Tests pass; full check list.
- [ ] **Step 5:** `feat(payments): convert payments at startup and read them from storage`

### Task 2: Payment rules

**Files:**
- Create: `src/lib/domain/pay.ts`, `src/lib/domain/pay.test.ts`
- Modify: `src/lib/domain/home.ts` (+ test), `src/lib/domain/list-entry.ts` (+ test)

**Interfaces:**
- Produces in `pay.ts`:
  - `type PayChoice = { card: Card; owed: number; credit: number; bill: LedgerStatement | null; urgency: "overdue" | "soon" | "due" | "none"; days: number }`
    (`days` = days overdue for overdue, days left otherwise, 0 for none).
  - `payChoices(cards: Card[], ledgers: Map<string, CardLedger>, today: PlainDate): PayChoice[]`
    — unarchived cards plus archived ones that owe; order overdue (most days), soon, then most
    owed, then id.
  - `matchesCard(card: Card, query: string): boolean` — id, name, last4, case-insensitive.
  - `payFigures(ledger: CardLedger, today): { owed; credit; nextBill: number; overdue: boolean }`.
  - `payPreview(amount: number, date: PlainDate, owed: number, today): { plan: boolean; extra: number }`
    — `plan` when date > today; `extra = max(0, amount - owed)` for a paid one, 0 for a plan.
  - `markPaid(payment: CardPayment, today): CardPayment`.
  - `plannedOf(payments: CardPayment[]): CardPayment[]` — planned, by date then id.
- Produces in `home.ts`: `NeedsItem` gains `{ kind: "planned"; payment: CardPayment; card: Card | undefined }`;
  `needsYou(data, today, planned: CardPayment[] = [])` places them after overdue, before drafts,
  only dated ≤ `addDays(today, 3)`.
- Produces in `list-entry.ts`: `draftLines(cards, amounts, rooms, ledgers, planned: CardPayment[] = [], date?: PlainDate)`
  fills each line's `planned` with planned payments on cards in the same group dated ≤ `date`.

- [ ] **Step 1: Failing tests**, including: overdue before soon before owed; archived card
  with nothing owed left out; `markPaid` of a plan dated tomorrow → today, of one dated three
  days ago → that date; `payPreview(150000, today, 100000, today)` → `{plan:false, extra:50000}`;
  a plan dated 5 days out is not in `needsYou`, one dated 3 days out is, one dated last week
  (still planned) is too; `draftLines` puts a group-mate's plan into `planned`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** `feat(payments): rules for choosing a card, the form and planned payments`

### Task 3: Transactions rules

**Files:**
- Create: `src/lib/domain/transactions.ts`, `src/lib/domain/transactions.test.ts`
- Modify: `src/lib/domain/purchase-range.ts` (+ test): delete `purchasesInRange`, `rangeSummary`.

**Interfaces:**
- Produces:
  - `type TxEntry = { kind: "purchase"; purchase: Purchase; card: Card | undefined } | { kind: "payment"; payment: CardPayment; card: Card | undefined }`
    with helpers `entryDate`, `entryAmount`, `entryCardId`.
  - `ledgerEntries(cards, purchases, payments): TxEntry[]` — purchases and **paid** payments.
  - `type TxFilter = { q: string; types: ("purchase" | "payment")[]; cards: string[]; range: RangePreset | ""; from: PlainDate | ""; to: PlainDate | "" }`,
    `type TxSort = "new" | "old" | "big" | "small"`, `DEFAULT_TX_FILTER`.
  - `filterEntries(entries, filter, today): TxEntry[]`; `sortEntries(entries, sort): TxEntry[]`;
    `byDay(entries): { date: PlainDate; entries: TxEntry[] }[]` (keeps the given order);
    `entriesTotal(entries): number` (payments +, purchases −).
  - `monthSummary(entries, ledgers, today): { purchases: number; payments: number; owed: number }`.
  - `type OwedRow = PayChoice` (re-use) and `owedRows(cards, ledgers, today, sort: "urgency" | "card" | "due" | "left")`
    — cards with `owed > 0` or `credit > 0`.
  - `listIdOf(purchaseId: string): string | null` — drops a final `-<digits>`; null when absent.
  - `type ListFilter = ListStatus[]`; `listRows(lists, filter): PurchaseList[]` newest date first.
- [ ] **Step 1: Failing tests**: planned payment absent from `ledgerEntries`; search "41230"
  and "฿41,230" both find a ฿41,230.00 entry; Thai note search; `range:"month"` uses
  `presetRange`; backwards custom range normalised; `byDay` order for `new`; same-day purchases
  latest `addedAt` first; `listIdOf("abc-uuid-3") === "abc-uuid"`, `listIdOf("plain") === null`
  (a UUID's own dashes are fine: the last segment must be all digits and the rest non-empty);
  `owedRows` default order; `monthSummary` counts only this month.
- [ ] **Step 2–4.**
- [ ] **Step 5:** `feat(transactions): ledger, filter, sort and summary rules`

### Task 4: Transactions address

**Files:** Create `src/lib/ui/tx-query.ts`, `src/lib/ui/tx-query.test.ts`

**Interfaces:**
- Produces `type TxView = { view: "ledger" | "lists" | "owed"; filter: TxFilter; sort: TxSort; owedSort: OwedSort; status: ListStatus[] }`,
  `DEFAULT_TX_VIEW`, `readTxView(search: string): TxView` (unknown values fall back to
  defaults), `writeTxView(view: TxView): string` (`""` for the defaults, else `?…`; repeated
  `card`, `type`, `status` parameters; keys `view q type card range from to sort owed status`).
- [ ] Tests: round trip with card id `a&b:c d`; garbage `sort=zzz` → default; defaults → `""`.
- [ ] Commit `feat(transactions): keep the view in the address`.

### Task 5: Payment pages (`/pay`)

**Files:**
- Create: `src/components/cc-pay-picker.ts`, `src/components/cc-pay-form.ts` (+ tests),
  `src/routes/pay.html`, `src/routes/pay.ts` (+ `pay.test.ts`)
- Modify: `src/lib/ui/shell.ts` (+ test: Payment links `/pay`; `currentTab("/pay")` is
  `"transactions"`), i18n.

**Interfaces:**
- `cc-pay-picker`: properties `choices: PayChoice[]`, `today`; own search box; each row is an
  `<a data-card=… href="/pay?card=…">` with label, owed (`data-numeric`) and a tag (`data-urgency`
  overdue/soon/due/none, or credit) in words: "Overdue N days", "Due in N days", "Due dd MMM yyyy",
  "Nothing owed", "Credit ฿X". Empty search result: "No card matches. Clear the search."
- `cc-pay-form`: properties `card`, `figures`, `today`, `amount` (initial text); renders the card
  large with *Change* (`href="/pay"`), owed, next bill, credit; chips `data-chip="bill"`
  ("Next bill · ฿X", "Overdue bill · ฿X" when overdue) and `data-chip="owed"` ("Everything owed
  · ฿X", only when it differs); amount and date fields; notes `data-note="extra"` ("฿X more than
  owed. It stays on ID as credit for its next purchases.") and `data-note="plan"` ("Planned for
  DATE. It shows under Upcoming and counts once you mark it paid."); submit text "Record ฿X to
  ID" or "Plan ฿X to ID on DATE" (`displayDate`), "Enter an amount" and disabled while the amount
  isn't money or the date isn't real (DR-31). Sends `pay` with `{ amount, date }`; keeps typing on
  error (`error` property via `cc-error-banner`).
- `renderPayPage(repo, root, options: { clock?, search?, navigate? })`: no `card`, or an unknown
  one → picker (unknown id shows "That card isn't here any more." above it); `amount` param
  prefills. Save builds `{ id: crypto.randomUUID(), cardId, date, amount, status: plan ? "planned" : "paid" }`
  and calls `savePayment` (Task 1), then `navigate("/transactions")`.
- [ ] Tests: picker order and search; form button texts for record and plan; chip fills the
  amount; extra note only above owed; route stores a paid payment and a planned one, freezes
  dates for the paid one, navigates; a failed save keeps the amount and shows the banner.
- [ ] Commit `feat(payments): payment pages with the card picker`.

### Task 6: Ledger, filter sheet, owed and lists components

**Files:** Create with tests: `src/components/cc-tx-ledger.ts`, `cc-tx-filter.ts`,
`cc-owed-list.ts`, `cc-list-index.ts`; i18n.

**Interfaces:**
- `cc-tx-ledger`: `groups: { date; entries }[] | null` (null = flat), `entries`, `lists` (for
  purchase links), `today`, `open: string | null` (open payment id), `confirming: boolean`.
  Rows: `data-kind="purchase|payment"`, label, word, note/sub, archived tag, amount with sign
  (`data-numeric`). Purchase row is a link (list or card). Payment row is a button toggling
  `open`; open shows *Delete payment* (`data-action="delete"`) then confirm
  (`data-action="confirm-delete"` danger, `data-action="keep"` quiet). Events `toggle`,
  `delete-payment` `{ payment }`. A result head "N results · ±฿X" when `filtered`.
- `cc-tx-upcoming`-part lives in the ledger component as a separate `upcoming` property:
  `{ lists: PurchaseList[] (sent); planned: { payment; card }[] }` with *Mark paid*
  (`data-action="mark-paid"`, event `mark-paid`) and the same two-step delete.
- `cc-tx-filter`: inside `cc-modal`; draft copy of `TxFilter` + `TxSort`; type, card (cards
  list), date presets and custom range, sort; *Clear all*; apply button "Show N results" /
  "Nothing matches" (disabled) using a `count: (filter, sort) => number` property; events
  `apply` `{ filter, sort }`, `close`.
- `cc-owed-list`: `rows: PayChoice[]`, `sort`; sort chip; each row `href="/pay?card=…"`; event
  `sort`. Empty: "Nothing owed on any card."
- `cc-list-index`: `lists`, `cards`, `status`; status chips (`data-status`), rows linking
  `listPageAddress`; event `status`. Empty: "No lists yet. Start one from Home."
- [ ] Tests per component: rendered words and signs, attributes, events, the two-step delete,
  the count on the apply button.
- [ ] Commit `feat(transactions): ledger, filter, owed and lists components`.

### Task 7: Transactions page

**Files:** Rewrite `src/routes/transactions.ts` (+ test); `src/routes/transactions.html` (main
class for the two-column desktop layout); `src/styles/app.css` (`.tx-grid` from 900px: owed
aside beside the main column; the switch hides its *Owed* button from 900px).

**Interfaces:** `renderTransactionsPage(repo, root, options: { clock?, search?, replace? })`
(`replace` defaults to `history.replaceState`). Loads `loadMoneyData`; heading, switch
(`data-view`), search + Filter button with count + sort chip + removable filter chips
(`data-chip`), month summary, Upcoming, results; Lists view; Owed view. Mark paid → `savePayment(markPaid(p))`;
delete → `deletePayment`; both reload.
- [ ] Tests: default view shows summary, upcoming (sent list + planned), ledger by day; search
  writes `?q=` and hides the summary; removing a chip; filter apply; Lists view status chip;
  Owed rows link `/pay?card=`; Mark paid moves a plan into the ledger and lowers owed; delete
  needs the second step; address read on load restores the view.
- [ ] Commit `feat(transactions): the ledger page with upcoming, lists and owed`; remove the
  `transactions.soon`/`toCards` keys.

### Task 8: Planned payments on Home and in Enter amounts

**Files:** `src/routes/index.ts`, `src/components/cc-needs-you.ts`, `src/routes/list/entry.ts`,
`src/components/cc-list-amounts.ts` (+ tests); i18n.

- *Needs you* planned row: "Planned: pay ID on DATE" / "฿X · mark it paid when it goes out",
  `data-item="planned"`, link `/transactions`. Overdue row now links `/pay?card=<id>&amount=<remaining>`.
- Entry passes `plannedOf(data.payments)` and the list date to `draftLines`; the over-room note
  adds "฿X planned to be paid by then" (`data-part="planned"`) when `plannedBefore > 0`.
- [ ] Tests for both; commit `feat(home): planned payments in needs you and the room warning`.

### Task 9: Card page and Cards page on the ledger

**Files:** `src/routes/card.ts`, `src/routes/cards.ts`, `src/components/cc-statement-list.ts`,
`cc-card-summary.ts` (+ tests); delete `src/lib/ui/payment-dialog.ts`,
`src/components/cc-payment-form.ts` (+ tests) and their keys; trim `limit.ts`/`statement.ts`
functions left unused (keep any still imported).

- Card page: `loadMoneyData`; statements are the card's `LedgerStatement`s (paged as today,
  DR-21), shown without Mark paid or undo; summary shows group room (`roomFor`), owed, next
  bill, credit, and `<a data-action="pay" href="/pay?card=…">Make a payment</a>`.
  `cc-statement-list` takes `LedgerStatement[]` (urgency via `ledgerUrgency`).
- Cards page: group usage from `groupRoom(...).used`.
- [ ] Tests updated; nothing writes `savePayment` any more (grep test).
- [ ] Commit `refactor(cards): read card payments from the ledger`.

### Task 10: Backup version 3 in Settings

**Files:** `src/lib/storage/transfer-v3.ts` (+ test), `src/routes/settings.ts` (+ test),
`src/components/cc-settings.ts` if counts render there, `src/lib/storage/transfer.ts` (keep only
shared validators and the v2 types `parseAnyBackup` needs); i18n.

**Interfaces:** `exportBackupV3(repo, now)` (locations fallback), `importBackupV3(repo, backup)`
(m-part cleanup, settings from locations), `countRecordsV3(repo): Promise<V3Counts>` with
`V3Counts = { cards; purchases; payments; limitGroups; lists }`, `replaceWithBackupV3(repo, backup)`
(clearAll, import, then set `cc:migration:payments` to `done` via a `storage` parameter so the
startup conversion does not run on the restored data).
- [ ] Tests: download is version 3 with lists; restoring a v2 file over converted data leaves no
  stale `m:` parts; a v3 file round-trips; v2 with settings sets purchase places; Replace sets
  the marker; merge/replace counts include lists.
- [ ] Commit `feat(backup): download, copy and restore backup version 3`.

### Task 11: Leftovers

- Move `.action-bar*` rules from `app.css` into `shared.ts` (as a `actionBarStyles` export) and
  use it from `cc-list-amounts` and `cc-list-reply`; delete the copies.
- Remove unused catalog keys from Task 7/9; run the catalog test.
- [ ] Commit `refactor(lists): action bar styles in the shared module`.

### Task 12: Docs and ship

- `PRD.md` + `PRD_TH.md`: phase 4 shipped line; RD-08/RD-10/RD-11 to RD-15 marked shipped;
  FR-14, FR-15, FR-25 rows note Transactions/`/pay`; DC-02 (no new keys), DC-03, DC-05/DC-06
  rewritten for version 3; new decisions from this plan's Decisions list (next DD ids); retired
  rows (old payment dialog, per-part undo). Roadmap: phase 4 plan link, phase 5 notes (card page
  replaced; statement list read-only for now).
- Full check list; push; PR with `--base redesign-phase-3`; wait for deploy; report URL.
