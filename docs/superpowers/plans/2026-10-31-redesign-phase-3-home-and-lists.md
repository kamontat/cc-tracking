# Redesign phase 3: Home and purchase lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard with Home (*Needs you*, then *Ready to use* with sort chips and
a selection bar) and build the purchase list flow: enter amounts with warnings, review the
three-column table, copy it as text or save it as an image, mark it sent or keep it as a draft,
record the spender's reply, and show the saved list.

**Architecture:** Pure rules in `src/lib/domain/home.ts` (ready rows, room, *Needs you*) and
`src/lib/domain/list-entry.ts` (draft lines, room after, list records), fed by a page loader
`src/lib/ui/money-data.ts` that converts the stored old payments to card payments in memory
with `convertPayments` (nothing written). Home (`/`) and one new page `/list` render Lit
components: `cc-needs-you`, `cc-ready-list`, `cc-list-amounts`, `cc-list-table`,
`cc-list-reply`. Lists are stored through the phase 1 repository methods; the reply is saved
through `saveReply`, guarded by the page against a list already saved.

**Tech Stack:** Bun, TypeScript, Lit, `@kcstyles/reset.css`, `bun:test`, happy-dom.

**Spec:** [`PRD.md`](../../../PRD.md): decided changes RD-09, RD-10, RD-15; decisions DD-39 to
DD-41, DD-44 to DD-51, DD-57; BR-04; US-07 to US-09; interface rules UI-01 to UI-21; answered
questions 13 and 15; the glossary. Roadmap:
[`2026-10-30-redesign-roadmap.md`](2026-10-30-redesign-roadmap.md) (phase 3 row and notes).
Visual and behavioural reference: the approved clickable prototype (`vHome`, `vAmounts`,
`vReview`, `vConfirm`, `vSaved` and their CSS).

## Global Constraints

- Money is whole satang (DR-01); typed amounts go through `parseAmount`, shown through
  `formatAmount`. Dates are `PlainDate`, arithmetic through `#lib/domain/date` (DR-02), shown
  with `displayDate` or `headerDate`, never `Intl` (UI-05).
- `src/lib/domain` imports nothing from storage or the interface; components never import
  `#lib/storage` (DC-01).
- Values live once in `src/styles/tokens.css`; shadow CSS and `app.css` use only
  `var(--cc-*)`, never a literal hex, `rem`/`px` or colour (UI-01; checked by eye). Media
  queries may use literal widths, as today.
- Three button variants only: none, `data-variant="quiet"`, `data-variant="danger"` (UI-02).
- Never select on translated text; styles and tests use classes, `data-action`, `data-card`,
  `data-sort`, `data-item`, `data-warning`, `data-answer`, `data-field`, `data-testid` (UI-04).
- Every new string in both `src/lib/i18n/en.ts` and `th.ts` (UI-03), using the glossary's Thai
  terms: ใบรายการซื้อ (purchase list), พร้อมใช้ (ready to use), คำตอบของผู้ใช้บัตร (spender's
  reply). Card names and ids are never translated (UI-13).
- Warnings never block (UI-08) and always carry words with the colour (UI-07). Saves are
  awaited; a failed write keeps what was typed and shows why (UI-11). A language switch
  re-renders in place and loses nothing typed (UI-12).
- Copy and Save image are hidden where the browser can't do them (UI-10).
- Components and routes stay flat in `src/components/` and `src/routes/` (the catalog
  coverage test's glob is not recursive). `#styles/*` maps to `.ts` only; routes import
  `tokens.css` and `app.css` by relative path.
- Tests sit next to the code as `*.test.ts`; happy-dom computes no layout (UI-21), so tests pin
  structure, catalog text, attributes, navigation targets, stored records and copied text.
- Commits are conventional, lower case, scoped. Before each commit: `bun run format`,
  `bun run check`, `bun run typecheck`, `bun run test`, `bun run build`.

## Decisions

Made by the controller for this phase:

- **One production release at the end.** Each phase only leaves its preview usable; no
  adapters for screens a later phase replaces. The pull request stacks on `redesign-phase-2`.
- **Payments in memory.** Stored payments stay the old per-statement records until phase 4
  runs the migration. Phase 3 builds each card's `CardPayment[]` and `StatementDates` in memory
  with `convertPayments(cards, purchases, oldPayments)` (no writes, no marker) and feeds
  `cardLedger`, `groupRoom` and `lineWarnings` from them. Lists are stored.
- **Home replaces the dashboard at `/`.** *Needs you* (waiting lists, overdue bills, drafts;
  planned payments arrive in phase 4), then *Ready to use* (cards in today's purchase places
  from Settings, until phase 6's location records), sort chips *Most room*, *Longest to
  close*, *Latest due*, tap to select, and a selection bar "N cards selected · Clear · Enter
  amounts". The purchase form, *This sitting*, the batch start, *Can spend now*, *Due next* and
  *Purchases by date* leave `/` (Transactions brings history and due back in phase 4). An
  overdue item opens the card page until the payment form exists (phase 4).
- **List screens are pages** in the phase 2 shell with a back-button header; a draft opens
  back into Enter amounts.
- **Copy text and Save image.** The text follows the three-column table; the image is the
  table drawn on a canvas, downloaded with a date-stamped name, with a graceful fallback.
  Marking sent sets `status: "sent"` and `sentAt`.
- **Reply** saves through `saveReply` and refuses a list already saved. Saved purchases get
  `addedAt`. Not-made lines move to a draft for the next day when the box is ticked (default
  ticked).
- **Warnings** use `lineWarnings` and `datePassed` with `groupRoom` (held by sent lists only,
  excluding the list being edited). Over the room offers only *Lower to* the room (DD-41).
- **Both catalogs**, reusing keys where they exist.
- **Final step** updates `PRD.md` and `PRD_TH.md` and ships a stacked PR with
  `--base redesign-phase-2`.

Made by this plan (the PRD and the controller leave them open):

- **Addresses.** One page, `/list`. `/list?card=<id>&card=<id>` opens Enter amounts for a new
  list (one repeated `card` parameter per card, built with `URLSearchParams`, so an id holding
  `,` or `&` survives); `/list?id=<id>` opens a stored list: a draft into Enter amounts, a sent
  list into the spender's reply, a saved list into the saved view. Review is an in-page step of
  Enter amounts (its back button returns to the amounts with everything typed), not an
  address. `/list` marks the Home tab. A static build has no dynamic paths, so `/lists/<id>` is
  not possible; `?id=` follows `/card?id=`.
- **A list holds only ready cards.** A card is ready when it is unarchived, kept in a purchase
  place and in an existing limit group (DR-12, DR-20). `card` parameters and a reopened draft's
  lines drop any card that is not ready. Not-assigned cards in a purchase place are counted
  under *Ready to use* with a link to Cards (DR-20), as *Can spend now* did.
- **Add another card** opens an in-page picker of the other ready cards (`id — Name`, UI-14)
  instead of returning to Home, so nothing typed is lost.
- **Room after** a line is its group's room less every amount on this list for that group, so
  two cards sharing a limit show the same, true figure.
- **Review needs one amount and no bad one.** Review is disabled until at least one line has an
  amount, and while any typed amount is not money; blank lines are left off the list. A
  removed last card leaves the picker open rather than leaving the page.
- **Lower to** sets the line to the group's room and shows only while that room is above zero.
- **Over-the-room explains held room in general** ("held by lists waiting for the spender"),
  since the warning carries the held amount, not which list holds it. The planned-payment part
  of RD-10's explanation arrives with planned payments in phase 4.
- **Ready to use** starts sorted by *Most room*, ties by card id; the sort resets on reload
  (as DD-34). Close and due dates are the open period's (DR-10), with the relative close date
  (DR-27).
- ***Needs you*** lists waiting lists by date, then overdue bills on unarchived cards, most days
  overdue first, then drafts by date. No greeting, no "sent at" time.
- **Copied text** is, line by line: `Purchase list · Sat, 31 Oct 2026`, the header
  `Card | Name (last 4) | Amount`, one `id | name (last4) | ฿amount` per line, and
  `Total · N cards | ฿total`, in the reader's language (dates by `headerDate` with the year).
- **Save image** draws with the current theme's tokens read from the root's computed style, and
  is named `purchase-list-<list date>.png`. Copy text shows only where
  `navigator.clipboard.writeText` exists, Save image only where a canvas gives a 2D context
  and `toBlob`; a failed save says so and points to Copy text.
- **A reply save is safe to retry.** Purchase and draft ids come from the list id
  (`<list id>-0`, `<list id>-1`, … in `saveReply`'s call order), and the writes go purchases,
  then the draft, then the saved list last, so a retry after a failed write overwrites rather
  than duplicates, and a list is marked saved only once its purchases are stored. The page
  re-reads the list before saving and refuses one already saved.
- **The card page keeps its purchase dialog** until phase 5 rebuilds the card page. Question
  13 is met on Home, which has no purchase form; phase 5 replaces *Add purchase* with *Use on a
  list*.
- **Location names come from the catalog** (`locationText`), so the roadmap note about default
  location records waits for phase 6.
- **Removed with the dashboard:** the five dashboard components, the repository's batch-start
  methods (only the dashboard used them; `clearAll` still removes a leftover `cc:batch-start`,
  DC-04), `sittingPurchases`, the panel views in `list-view.ts` (`DueRow`, spend and due sorts)
  and the catalog keys nothing reads any more.

## Review Focus

- A typed amount that is not money (`12.345`, `-5`, `1,2.3x`): the line says why, its room
  after and the total don't show `NaN`, and Review stays disabled (Task 7).
- A group whose room is already at or below zero: the over-room warning shows, *Lower to* does
  not (Task 7).
- Saving a reply fails part-way, then is retried: purchases are not duplicated and the list is
  saved once (Task 10).
- A list already saved (in another tab, or by a second tap) is refused, with nothing added
  (Task 10).
- Switching language on Enter amounts or the reply keeps every typed amount and answer (Tasks
  7 and 10).

---

### Task 1: Ledgers, room and Home rules

**Files:**
- Modify: `src/lib/domain/ledger.ts`, `src/lib/domain/ledger.test.ts`
- Create: `src/lib/domain/home.ts`, `src/lib/domain/home.test.ts`

**Interfaces:**
- Consumes: `cardLedger`, `nextBill`, `ledgerUrgency` (ledger.ts); `groupRoom`, `GroupRoom`
  (room.ts); `listTotal` (purchase-list.ts); `canPurchase` (card.ts); `closeDateOf`,
  `dueDateOf` (cycle.ts); `openPeriod` (statement.ts); `daysBetween`, `compareDates`.
- Produces:
  ```ts
  // ledger.ts
  export function ledgersFor(cards: Card[], purchases: Purchase[], payments: CardPayment[],
    dates: StatementDates[], today: PlainDate): Map<string, CardLedger>;
  // home.ts
  export type RoomData = { cards: Card[]; groups: LimitGroup[]; ledgers: Map<string, CardLedger>;
    lists: PurchaseList[] };
  export function isReady(card: Card, groups: LimitGroup[], settings: Settings): boolean;
  export function roomFor(card: Card, data: RoomData, exceptListId?: string): GroupRoom | null;
  export type ReadyRow = { card: Card; room: GroupRoom; closeDate: PlainDate; dueDate: PlainDate;
    overdue: boolean };
  export type ReadySort = "room" | "close" | "due";
  export const READY_SORTS: readonly ReadySort[];   // ["room", "close", "due"]
  export function readyRows(data: RoomData, settings: Settings, today: PlainDate): ReadyRow[];
  export function sortReady(rows: ReadyRow[], sort: ReadySort): ReadyRow[];
  export type NeedsItem =
    | { kind: "waiting"; list: PurchaseList; total: number }
    | { kind: "overdue"; card: Card; remaining: number; dueDate: PlainDate; days: number }
    | { kind: "draft"; list: PurchaseList; total: number };
  export function needsYou(data: RoomData, today: PlainDate): NeedsItem[];
  ```

`ledgersFor` maps every card, archived included (they weigh on a group's room).
`roomFor` returns `null` when the card's group is missing, else `groupRoom(group, cards,
ledgers, lists, card.id, exceptListId)` (which counts sent lists only, the roadmap note).
`readyRows` keeps cards for which `isReady` holds, in card order; dates are
`closeDateOf`/`dueDateOf` of `openPeriod(card, today)`; `overdue` is `nextBill` with
`ledgerUrgency === "overdue"`. `sortReady` returns a new array: `room` by `room.room`
descending, `close` by `closeDate` descending, `due` by `dueDate` descending, ties by card id
ascending. `needsYou`: sent lists by date then id; overdue bills of unarchived cards, `days` is
`daysBetween(dueDate, today)`, most days first then id; drafts by date then id. `total` is
`listTotal`.

Test fixture for this file (amounts in satang): group `g1` limit `100_000_00`; card `A` krabi,
`g1`, `{ kind: "offset", closeDay: 25, dueOffsetDays: 20 }`; today `2026-10-31`.

- [ ] **Step 1: Write the failing tests:**
  - ledger.test.ts `"ledgersFor gives every card a ledger, archived included"`: cards `A` and
    archived `Z` → map keys `["A", "Z"]`; `A` with one `5_000_00` purchase on `2026-10-28` has
    `owed` `5_000_00`.
  - home.test.ts `"ready cards are unarchived, in a purchase place and in a group"`: `A`, `B`
    (bangkok, g1), `C` (krabi, archived), `D` (krabi, no group), `E` (krabi, group `gone`),
    settings `["krabi"]` → `readyRows` ids `["A"]`.
  - `"room is the group's room less sent lists only"`: `A` purchase `30_000_00` on
    `2026-10-28`; sent list line `A` `10_000_00`; draft line `A` `5_000_00`; saved list line
    `A` `7_000_00` → `room.used` `30_000_00`, `held` `10_000_00`, `room` `60_000_00`.
  - `"the edited list holds nothing"`: `roomFor(A, data, sentListId).held` is `0`.
  - `"close and due dates are for buying today"`: `closeDate` `2026-11-25`, `dueDate`
    `2026-12-15`.
  - `"an unpaid bill past its due date is overdue"`: purchase on `2026-09-10` unpaid →
    `overdue` true; with a paid `CardPayment` covering it → false.
  - `"sorts by most room, longest to close, latest due"`: three rows built by hand with
    distinct values → the expected id orders; equal values fall back to id order.
  - `"needs you lists waiting, then overdue, then drafts"`: one sent list, the overdue `A`
    above, one draft, one saved list, archived overdue card `Z` → kinds
    `["waiting", "overdue", "draft"]`; the overdue item has `days` `16`, `dueDate`
    `2026-10-15`, `remaining` equal to the purchase.
  - `"a quiet day needs nothing"`: no lists, nothing overdue → `[]`.
- [ ] **Step 2: Run** `bun test src/lib/domain/ledger.test.ts src/lib/domain/home.test.ts`.
  Expected: FAIL, `ledgersFor` and `home.ts` missing.
- [ ] **Step 3: Implement** `ledgersFor` and `home.ts` as specified.
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): ready cards, room and needs-you rules`.

### Task 2: The page data loader

**Files:**
- Create: `src/lib/ui/money-data.ts`, `src/lib/ui/money-data.test.ts`

**Interfaces:**
- Consumes: `convertPayments` (`#lib/storage/migrate-payments`); `ledgersFor`, `RoomData`
  (Task 1); `Repository`.
- Produces:
  ```ts
  export type MoneyData = RoomData & { settings: Settings; purchases: Purchase[] };
  export async function loadMoneyData(repo: Repository, today: PlainDate): Promise<MoneyData>;
  ```

Reads `listCards`, `listLimitGroups`, `getSettings`, `listPurchaseLists`, and per card
`listPurchases` and `listPayments`; converts the old records with `convertPayments` and builds
`ledgers` with `ledgersFor`. A comment says phase 4 replaces the conversion with
`listCardPayments` and `listStatementDates` once `migratePayments` runs at startup.

- [ ] **Step 1: Write the failing tests** (InMemoryRepository; card `A` as in Task 1; purchase
  `10_000_00` on `2026-09-10`; an old `StatementPayment` for `2026-09` with one part
  `10_000_00`):
  - `"old payments settle the ledger without being written"`: `ledgers.get("A").owed` is `0`;
    `repo.listCardPayments("A")` and `repo.listStatementDates("A")` are empty;
    `localStorage.getItem(PAYMENTS_MIGRATION_KEY)` is null.
  - `"lists, settings and archived cards come back"`: a stored draft is in `lists`; settings
    equal what was saved; an archived card is in `cards` and has a ledger.
- [ ] **Step 2: Run** `bun test src/lib/ui/money-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `loadMoneyData`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): load cards, ledgers and lists for home and lists`.

### Task 3: *Needs you*

**Files:**
- Create: `src/components/cc-needs-you.ts`, `src/components/cc-needs-you.test.ts`
- Modify: `src/lib/ui/icons.ts` (add `clock`, `alert`, `back`, `check`, `copy`, `image`,
  `send`), `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `NeedsItem` (Task 1); `headerDate`, `formatAmount`, `icons`.
- Produces: `@customElement("cc-needs-you") class CcNeedsYou` with
  `@property({ attribute: false }) items: NeedsItem[] = []`.

Icons (Lucide paths, same `icon()` wrapper): `clock` `<circle cx="12" cy="12" r="10"/>` +
`M12 6v6l4 2`; `alert` `m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3`,
`M12 9v4`, `M12 17h.01`; `back` `m15 18-6-6 6-6`; `check` `M20 6 9 17l-5-5`; `copy`
`<rect x="8" y="8" width="14" height="14" rx="2"/>` + `M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2`;
`image` `<rect x="3" y="3" width="18" height="18" rx="2"/>`, `<circle cx="9" cy="9" r="2"/>`,
`m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21`; `send` `M22 2 11 13`, `M22 2 15 22l-4-9-9-4z`.

Renders `<h1>`: `home.needs.one` / `home.needs.many` by count, or `home.caughtUp` with
`<p class="note" data-tone="ok">` `home.caughtUpDetail` when empty. Items are one
`<a class="item" data-item=<kind> href=…>` each: an icon chip (`clock`, `alert`,
`transactions`), a bold title, a `<small>` detail, a `›`. Dates are `headerDate(date, locale,
false)`.

| Kind | href | Title | Detail |
|---|---|---|---|
| waiting | `/list?id=<id>` | `home.waiting` | `home.waitingDetail` `{date, count, total}` |
| overdue | `/card?id=<encoded id>` | `home.overdue` `{card, days}` | `home.overdueDetail` `{amount}` |
| draft | `/list?id=<id>` | `home.draft` `{date}` | card ids joined `, ` then ` · ` and the total |

| Key | en | th |
|---|---|---|
| `home.needs.one` | 1 thing needs you | มี 1 เรื่องรอคุณ |
| `home.needs.many` | {count} things need you | มี {count} เรื่องรอคุณ |
| `home.caughtUp` | All caught up | เรียบร้อยหมดแล้ว |
| `home.caughtUpDetail` | No replies to record and no bill overdue. | ไม่มีคำตอบให้บันทึก และไม่มีบิลที่เลยกำหนด |
| `home.waiting` | Waiting for the spender | รอคำตอบของผู้ใช้บัตร |
| `home.waitingDetail` | List for {date} · {count} cards · {total} | ใบรายการซื้อวันที่ {date} · {count} ใบ · {total} |
| `home.overdue` | {card} bill is {days} days overdue | บิลของ {card} เลยกำหนด {days} วัน |
| `home.overdueDetail` | {amount} left · open the card | ค้างชำระ {amount} · เปิดหน้าบัตร |
| `home.draft` | Draft list for {date} | ใบรายการซื้อฉบับร่างวันที่ {date} |

- [ ] **Step 1: Write the failing tests:**
  - `"each item opens its task"`: items waiting (list `w1`, date `2026-10-30`, 3 lines, total
    `39_300_00`), overdue (card `SCB/K`, 16 days, `41_230_00` left), draft (`d1`, lines `KB-S`,
    `KS-K`) → `[data-item]` kinds in that order; hrefs `/list?id=w1`, `/card?id=SCB%2FK`,
    `/list?id=d1`; waiting detail `List for Fri, 30 Oct · 3 cards · ฿39,300.00`; overdue title
    `SCB/K bill is 16 days overdue`; draft detail starts `KB-S, KS-K · `.
  - `"the heading counts"`: one item → `1 thing needs you`; three → `3 things need you`.
  - `"a quiet day is all caught up"`: `[]` → h1 `All caught up`, no `[data-item]`.
  - `"reads in Thai"`: `setLocale("th")` → h1 `มี 3 เรื่องรอคุณ`, waiting title
    `รอคำตอบของผู้ใช้บัตร`.
- [ ] **Step 2: Run** `bun test src/components/cc-needs-you.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the icons, the component (styles `base` plus local `css`, tokens
  only; the overdue chip uses `--cc-danger-surface`, waiting `--cc-warning-surface`, draft
  `--cc-surface-sunken`) and the keys.
- [ ] **Step 4: Run** the file and `bun test src/lib/i18n`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): needs you`.

### Task 4: *Ready to use*

**Files:**
- Create: `src/components/cc-ready-list.ts`, `src/components/cc-ready-list.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `ReadyRow`, `ReadySort`, `READY_SORTS`, `sortReady` (Task 1); `usageLevel`,
  `usageShare` (limit.ts); `relativeDayText`, `locationText`; `usageBar` (`#styles/shared`).
- Produces: `@customElement("cc-ready-list") class CcReadyList` with properties `rows:
  ReadyRow[]`, `selected: string[]`, `locations: Location[]`, `today: PlainDate`,
  `unassigned: number`, and `@state() sort: ReadySort = "room"`; event
  `toggle` (`CustomEvent<{ cardId: string }>`, bubbles, composed).

Renders `<h2>` `ready.title` with `<small>` `ready.summary` `{count, places}` (places:
`locationText` of each location, joined `, `); the chips `<button class="chip"
data-sort=<sort> aria-pressed>` labelled `ready.sort.<sort>`; then one
`<button class="pick" data-card=<id> aria-pressed=<selected>>` per row in `sortReady` order:
a tick (`icons.check` when selected), id over name, `formatAmount(room.room)` over
`ready.room` (or `ready.roomShared` when `room.sharedWith > 0`), a meta line
`ready.closes {date, relative}` and `ready.due {date}` (`displayDate`), `ready.overdue` in
danger text when `overdue`, and the usage bar `<div class="usage" data-level=…
role="img" aria-label=${t("limits.usage", { share })}>`. With no rows: `ready.empty`, the hint
`quickAdd.noEligible`, and `<a data-action="settings" href="/settings">` `ready.toSettings`.
With `unassigned > 0`: `spendable.unassigned` and `<a href="/cards">`
`spendable.unassignedAction` (both keys kept from *Can spend now*).

| Key | en | th |
|---|---|---|
| `ready.title` | Ready to use | พร้อมใช้ |
| `ready.summary` | {count} cards in {places} | {count} ใบที่ {places} |
| `ready.sort.room` | Most room | วงเงินเหลือมากสุด |
| `ready.sort.close` | Longest to close | อีกนานสุดกว่าจะสรุปยอด |
| `ready.sort.due` | Latest due | ครบกำหนดช้าสุด |
| `ready.room` | room | วงเงินเหลือ |
| `ready.roomShared` | room · shared | วงเงินเหลือ · ใช้ร่วม |
| `ready.closes` | Closes {date} · {relative} | สรุปยอด {date} · {relative} |
| `ready.due` | Due {date} | ครบกำหนด {date} |
| `ready.overdue` | Overdue bill | มีบิลเลยกำหนด |
| `ready.empty` | No card can be used right now | ตอนนี้ยังไม่มีบัตรที่ใช้ได้ |
| `ready.toSettings` | Choose places in Settings | เลือกสถานที่ในหน้าตั้งค่า |

- [ ] **Step 1: Write the failing tests** (three rows built by hand, today `2026-10-31`):
  - `"rows start with the most room"`: `[data-card]` order by room; `[data-sort="room"]` has
    `aria-pressed="true"`.
  - `"a chip re-sorts"`: click `[data-sort="close"]` → order by close date descending, that
    chip pressed, the others `false`.
  - `"tapping a card asks to toggle it"`: click `[data-card="A"]` → one `toggle` with
    `{ cardId: "A" }`; with `selected: ["A"]` that row has `aria-pressed="true"`.
  - `"a row says its room, dates and usage in words"`: room `฿60,000.00`, `room · shared` when
    shared, meta contains `Closes 25 Nov 2026 · in 25 days` and `Due 15 Dec 2026`, usage
    `aria-label` `40% of the limit used`, `Overdue bill` only on the overdue row.
  - `"nothing ready names the next step"`: `rows: []` → `[data-action="settings"]` href
    `/settings`.
  - `"not-assigned cards are counted"`: `unassigned: 2` → link to `/cards`.
  - `"reads in Thai"`: chips `วงเงินเหลือมากสุด`, `อีกนานสุดกว่าจะสรุปยอด`, `ครบกำหนดช้าสุด`;
    h2 `พร้อมใช้`.
- [ ] **Step 2: Run** `bun test src/components/cc-ready-list.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component (prototype `.pick` look: a card per row with the tick
  on the left; selected rows get `--cc-accent-surface` and a `--cc-accent` border, so state is
  not colour alone with the tick) and the keys.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): ready to use with sort chips and selection`.

### Task 5: Home replaces the dashboard

**Files:**
- Rewrite: `src/routes/index.ts`, `src/routes/index.test.ts`
- Delete: `src/components/cc-sitting-list`, `cc-spendable`, `cc-due-list`,
  `cc-purchase-range` (`.ts` and `.test.ts` each); `cc-quick-add` stays for the card page
- Modify: `src/lib/storage/repository.ts`, `local.ts`, `local.test.ts`, `contract.ts`
  (remove `getBatchStart`, `saveBatchStart`; `LocalStorageRepository.clearAll` keeps removing
  `cc:batch-start`)
- Modify: `src/lib/domain/purchase-range.ts`, `purchase-range.test.ts` (remove
  `sittingPurchases`); `src/lib/domain/list-view.ts`, `list-view.test.ts` (remove `DueRow`,
  `SPEND_SORTS`, `SpendSort`, `DUE_SORTS`, `DueSort`, `PanelView`, `DEFAULT_SPEND_VIEW`,
  `DEFAULT_DUE_VIEW`, `applySpendView`, `applyDueView`, `nextPanelSort`)
- Modify: `src/styles/app.css` (`.action-bar`), `src/lib/i18n/en.ts`, `th.ts`, `README.md`

**Interfaces:**
- Consumes: `loadMoneyData` (Task 2); `readyRows`, `needsYou`, `isReady` (Task 1);
  `cc-needs-you` (Task 3), `cc-ready-list` (Task 4); `unassignedCards`, `canPurchase`.
- Produces:
  ```ts
  export type HomeOptions = { clock?: () => Date; tickMs?: number;
    navigate?: (url: string) => void };              // default location.assign
  export function renderHomePage(repo: Repository, root: HTMLElement, options?: HomeOptions): void;
  export function listAddress(cardIds: string[]): string;   // "/list?card=A&card=B"
  ```

`renderHomePage` loads through `createPageState` (`fallbackKey: "home.error.read"`), keeps
`selected: string[]` in tap order across reloads (pruned to ready cards on each paint), and
renders: `cc-error-banner`, `<cc-needs-you>`, `<cc-ready-list>` (with `unassigned` =
unassigned cards for which `canPurchase` holds), and, when anything is selected,
`<div class="action-bar" data-testid="selection">` with `<b>` `home.selected.one|many`,
`<button data-variant="quiet" data-action="clear">` `list.clear`, and
`<button data-action="enter-amounts">` `home.enterAmounts` then `›`, which calls
`navigate(listAddress(selected))`. It re-reads the clock every `tickMs` (FR-26) and repaints on
`subscribe`. `bootstrap("title.home", (repo) => renderHomePage(repo, root))`.

`.action-bar` in `app.css`: sticky to the bottom of `.page`, above the tab bar below 900px
(`bottom` adds `--cc-tabbar-height` and the safe-area inset), surface background, border,
`--cc-radius-md`, a row with the summary left and the actions right, and an inline-end padding
of `--cc-fab-size` plus `--cc-space-4` so the floating Payment button never covers its button.

Catalog: add the keys below; rename `dashboard.error.read` to `home.error.read` (same text).
Remove every key under `dashboard.`, `due.`, `range.`, `sitting.` and `spendable.` that nothing
outside the catalogs reads any more (grep each; `dashboard.addPurchase`,
`dashboard.editPurchase`, `dashboard.answer`, `dashboard.answerOver`, `due.stillOpen`,
`spendable.unassigned`, `spendable.unassignedAction` stay). Change `statements.empty` to
`No statements yet. Purchases come from purchase lists on Home.` /
`ยังไม่มีใบแจ้งยอด รายการซื้อมาจากใบรายการซื้อที่หน้าหลัก`. README: `cc:batch-start` is no
longer read or written (a leftover stays until reset), and the dashboard paragraph describes
Home.

| Key | en | th |
|---|---|---|
| `home.selected.one` | 1 card selected | เลือกแล้ว 1 ใบ |
| `home.selected.many` | {count} cards selected | เลือกแล้ว {count} ใบ |
| `home.enterAmounts` | Enter amounts | ใส่จำนวนเงิน |
| `home.error.read` | Could not read your cards. | อ่านข้อมูลบัตรไม่สำเร็จ |

- [ ] **Step 1: Write the failing tests** in `index.test.ts` (clock
  `() => new Date("2026-10-31T03:00:00Z")`, cards `A` and `B` in krabi on `g1`, settings
  `["krabi"]`, a recording `navigate`):
  - `"needs you comes before ready to use"`: `cc-needs-you` precedes `cc-ready-list` in
    document order.
  - `"no dashboard panel is left"`: none of `cc-quick-add`, `cc-sitting-list`, `cc-spendable`,
    `cc-due-list`, `cc-purchase-range`, `[data-panel]`.
  - `"the batch start is never touched"`: with a `LocalStorageRepository` on `localStorage`,
    after the page settles `localStorage.getItem("cc:batch-start")` is null.
  - `"ticking cards shows the selection bar"`: dispatch `toggle` for `A` then `B` from
    `cc-ready-list` → `[data-testid="selection"]` contains `2 cards selected`;
    `[data-action="clear"]` → no bar, `cc-ready-list.selected` empty.
  - `"enter amounts opens the list with the picked cards"`: select `B` then `A`, click
    `[data-action="enter-amounts"]` → `navigate` got `/list?card=B&card=A`; `listAddress(["A,1",
    "x&y"])` read back by `URLSearchParams.getAll("card")` gives `["A,1", "x&y"]`.
  - `"old payments and sent lists move the room"`: `g1` limit `100_000_00`; `A` bought
    `20_000_00` on `2026-09-10`, settled by an old `StatementPayment` for `2026-09`, and
    `5_000_00` on `2026-10-28`; a sent list line `B` `10_000_00` → every ready row's
    `room.room` is `85_000_00`; *Needs you* has a `waiting` item and no `overdue` one.
  - `"an overdue bill needs you"`: `A` with an unpaid `2026-09-10` purchase → `cc-needs-you`
    items include `overdue` for `A`.
  - `"past midnight moves today"`: advance the clock a day, wait `tickMs` → `cc-ready-list.today`
    is `2026-11-01`.
  - `"a failed read shows the banner"`: a repository whose `listCards` rejects → banner text
    starts `Could not read your cards.`
  In `contract.ts` and `local.test.ts`, delete the batch-start tests; add to `local.test.ts`
  `"reset still removes a leftover batch start"` (`cc:batch-start` set by hand, `clearAll()`,
  key gone).
- [ ] **Step 2: Run** `bun test src/routes/index.test.ts src/lib/storage`. Expected: FAIL.
- [ ] **Step 3: Implement** the page, the bar styles, the deletions and the catalog changes.
- [ ] **Step 4: Run** `bun run test`, `bun run typecheck`, `bun run build`. Expected: PASS;
  `grep -rn "BatchStart\|sittingPurchases\|cc-spendable\|cc-due-list\|cc-sitting-list\|cc-purchase-range" src`
  finds nothing.
- [ ] **Step 5: Commit** `feat(home): home replaces the dashboard`.

### Task 6: List entry rules

**Files:**
- Create: `src/lib/domain/list-entry.ts`, `src/lib/domain/list-entry.test.ts`

**Interfaces:**
- Consumes: `DraftLine` (amount-warnings.ts), `GroupRoom`, `parseAmount`.
- Produces:
  ```ts
  /** 0 for blank text, satang for an amount, null for text that is not money. */
  export function lineAmount(text: string): number | null;
  /** One DraftLine per card that has a room and a ledger, in card order; planned is []. */
  export function draftLines(cards: Card[], amounts: Record<string, number>,
    rooms: Map<string, GroupRoom>, ledgers: Map<string, CardLedger>): DraftLine[];
  /** The line's group room less every amount on the list in that group. */
  export function roomAfter(line: DraftLine, lines: DraftLine[]): number;
  /** Lines with an amount above zero, in card order. */
  export function listLines(cardIds: string[], amounts: Record<string, number>): ListLine[];
  export function composeList(input: { id: string; date: PlainDate; lines: ListLine[];
    send: boolean; now: string }): PurchaseList;
  /** `${prefix}-0`, `${prefix}-1`, … one per call. */
  export function sequentialIds(prefix: string): () => string;
  ```

`composeList` gives `status: "sent"` with `sentAt: now` when `send`, else `status: "draft"`
with no `sentAt`; never `savedAt` or `movedTo`.

- [ ] **Step 1: Write the failing tests:**
  - `"reads typed amounts"`: `""` and `"  "` → `0`; `"1,250.5"` → `125050`; `"12.345"`,
    `"-5"`, `"abc"`, `"0"` → `null`.
  - `"room after counts the whole group on the list"`: two lines on one group with room
    `50_000_00`, amounts `20_000_00` and `10_000_00` → `roomAfter` is `20_000_00` for both; a
    line on another group is unaffected.
  - `"draft lines skip cards without a room"`: a card missing from `rooms` is left out;
    `planned` is `[]`.
  - `"blank lines are left off the list"`: ids `["A", "B", "C"]`, amounts `{ A: 100, C: 0 }` →
    `[{ cardId: "A", amount: 100 }]`.
  - `"a sent list carries its sent time"`: `send: true` → `status` `sent`, `sentAt` equals
    `now`; `send: false` → `draft`, no `sentAt` key.
  - `"ids follow the prefix"`: `sequentialIds("l1")` called three times → `l1-0`, `l1-1`,
    `l1-2`.
- [ ] **Step 2: Run** `bun test src/lib/domain/list-entry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `list-entry.ts`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): purchase list entry rules`.

### Task 7: Enter amounts

**Files:**
- Create: `src/components/cc-list-amounts.ts`, `src/components/cc-list-amounts.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `lineAmount`, `draftLines`, `roomAfter`, `listLines` (Task 6); `lineWarnings`,
  `datePassed`, `AmountWarning` (amount-warnings.ts); `formatAmount`, `formatAmountInput`,
  `headerDate`, `displayDate`.
- Produces: `@customElement("cc-list-amounts") class CcListAmounts` with properties
  `cards: Card[]` (the list's cards, in order), `candidates: Card[]` (ready cards not on the
  list), `rooms: Map<string, GroupRoom>`, `ledgers: Map<string, CardLedger>`, `today:
  PlainDate`, `date: PlainDate` and `entries: Record<string, string>` (both read once, as the
  starting values). Events (bubble, composed):
  `entry-change` `{ date: PlainDate; entries: Record<string, string> }` on every edit;
  `review` `{ date: PlainDate; lines: ListLine[] }`; `remove` `{ cardId }`; `add` `{ cardId }`.

Renders, as the prototype's `vAmounts`: a `<label>` `purchaseList.date` with
`<input type="date" data-field="date">` (an emptied field reads as `today`); when
`datePassed(date, today)`, `<div class="note" data-warning="date-passed">`
`purchaseList.warn.datePassed` with `<button data-variant="quiet" data-action="to-today">`
`purchaseList.warn.toToday`; one `<section class="line" data-card=<id>>` per card (with
`data-warn` when it has a warning or a bad amount): id and name,
`<button data-variant="quiet" data-action="remove">` `purchaseList.remove`, a `฿` prefixed
`<input inputmode="decimal" data-field="amount" aria-label=purchaseList.amountFor>`,
`purchaseList.roomAfter` with `formatAmount(roomAfter(…))` (`common.none` while the amount is
not money), `quickAdd.error.badAmount` under a bad amount, then one
`<p class="note" data-warning=<kind>>` per `lineWarnings(line, lines, date, today)`:

| Kind | Text | Action |
|---|---|---|
| `over-room` | `purchaseList.warn.overRoom` `{over}`; plus `purchaseList.warn.held` `{room, held}` when `held > 0` | `<button data-variant="quiet" data-action="lower">` `purchaseList.warn.lowerTo` `{room}`, only when `room > 0`; sets the amount to `formatAmountInput(room)` |
| `shared-limit` | `purchaseList.warn.shared` `{cards, group, over, room}` (ids joined `, `) | none |
| `overdue-bill` | `purchaseList.warn.overdue` `{card, date, remaining}` | `<a data-action="see-card" href="/card?id=…">` `purchaseList.warn.seeCard` |
| `close-date` | `purchaseList.warn.closeDate` `{card, date}` | none |

Then `<button data-variant="quiet" data-action="add-card">` `+ ` `purchaseList.addCard`, which
toggles a `<div class="picker">` of `<button data-card=<id>>` `id — Name` per candidate
(each emits `add`), and `purchaseList.noCards` when `cards` is empty. The footer
(`.action-bar`, light DOM style copied into the component through tokens): the warning summary
(`purchaseList.warn.lines.one|many` and `purchaseList.warn.datePassedShort`, joined ` · `, in
warning text) or `purchaseList.total` `{count}`, the total `formatAmount`, and
`<button data-action="review">` `purchaseList.review` `›`, disabled unless some amount is above
zero and none is `null`. Typed text lives in `@state()`, so a language switch keeps it.

| Key | en | th |
|---|---|---|
| `purchaseList.date` | Purchase date | วันที่ซื้อ |
| `purchaseList.amountFor` | Amount for {card} | จำนวนเงินของ {card} |
| `purchaseList.roomAfter` | Room after | วงเงินเหลือหลังซื้อ |
| `purchaseList.remove` | Remove | เอาออก |
| `purchaseList.addCard` | Add another card | เพิ่มบัตรอีกใบ |
| `purchaseList.noCards` | No cards on this list yet. Add one below. | ยังไม่มีบัตรในใบรายการนี้ เพิ่มได้ด้านล่าง |
| `purchaseList.total` | Total · {count} cards | รวม · {count} ใบ |
| `purchaseList.review` | Review | ตรวจทาน |
| `purchaseList.warn.lines.one` | 1 line has warnings | 1 บรรทัดมีคำเตือน |
| `purchaseList.warn.lines.many` | {count} lines have warnings | {count} บรรทัดมีคำเตือน |
| `purchaseList.warn.datePassedShort` | date has passed | วันที่ผ่านมาแล้ว |
| `purchaseList.warn.overRoom` | Over the room by {over}. The bank may decline it. | เกินวงเงินที่เหลือ {over} ธนาคารอาจปฏิเสธรายการนี้ |
| `purchaseList.warn.held` | Room is {room} because {held} is held by lists waiting for the spender. | วงเงินที่เหลือคือ {room} เพราะมี {held} ถูกกันไว้ให้ใบรายการซื้อที่รอคำตอบของผู้ใช้บัตร |
| `purchaseList.warn.lowerTo` | Lower to {room} | ลดเป็น {room} |
| `purchaseList.warn.shared` | Shared limit. {cards} share {group}; together they are {over} over its room of {room}. | วงเงินร่วม {cards} ใช้วงเงิน {group} ร่วมกัน รวมกันแล้วเกินวงเงินที่เหลือ {room} อยู่ {over} |
| `purchaseList.warn.overdue` | Overdue bill. {card}'s bill was due {date}, with {remaining} left. The bank may decline the card. | บิลเลยกำหนด บิลของ {card} ครบกำหนดวันที่ {date} ยังค้าง {remaining} ธนาคารอาจปฏิเสธบัตรนี้ |
| `purchaseList.warn.seeCard` | See the card | ดูบัตร |
| `purchaseList.warn.closeDate` | Close date. {card} closes on {date}; the bank may put this on either statement. | วันสรุปยอด {card} สรุปยอดวันที่ {date} ธนาคารอาจนำยอดนี้ไปไว้ในใบแจ้งยอดใบใดก็ได้ |
| `purchaseList.warn.datePassed` | This date has passed. Lists are for purchases still to make; keep it only if you are recording something already bought. | วันที่นี้ผ่านมาแล้ว ใบรายการซื้อมีไว้สำหรับการซื้อที่ยังไม่เกิดขึ้น ใช้วันที่นี้เฉพาะเมื่อบันทึกสิ่งที่ซื้อไปแล้ว |
| `purchaseList.warn.toToday` | Change to today | เปลี่ยนเป็นวันนี้ |

- [ ] **Step 1: Write the failing tests** (cards `A`, `B` on group `g1` with room
  `50_000_00`, card `C` on `g2` with room `0`; today `2026-10-31`; a `type(card, text)` helper
  sets the input and dispatches `input`):
  - `"typing shows room after and the total"`: `A` `20,000` → `A`'s room after `฿30,000.00`,
    total `฿20,000.00`; `entry-change` detail `entries.A` is `20,000`.
  - `"over the room offers lower to"`: `A` `60000` → `[data-warning="over-room"]` names
    `฿10,000.00`, `[data-action="lower"]` reads `Lower to ฿50,000.00`; click → input value
    `50000`, no warning, no `data-warn`.
  - `"held room is explained"`: room `held: 10_000_00` → the warning contains
    `held by lists waiting for the spender`; `held: 0` → it doesn't.
  - `"no lower to when the room is gone"` (review focus): `C` `100` → over-room warning shown,
    no `[data-action="lower"]`.
  - `"cards sharing a limit are warned together"`: `A` `30000`, `B` `30000` → both lines carry
    `[data-warning="shared-limit"]` naming `A, B`.
  - `"an overdue bill links to the card"`: `A`'s ledger with an overdue bill →
    `[data-warning="overdue-bill"] a` href `/card?id=A`.
  - `"buying on the close date is warned"`: date set to `A`'s close date →
    `[data-warning="close-date"]` on `A`.
  - `"a past date is warned once, with change to today"`: date `2026-10-30` → one
    `[data-warning="date-passed"]`; summary contains `date has passed`; `to-today` → input
    `2026-10-31`, note gone.
  - `"the summary counts lines with warnings"`: two warned lines → `2 lines have warnings`.
  - `"amounts that are not money stop review"` (review focus): `A` `12.345` → the line shows
    the `quickAdd.error.badAmount` text, room after `—`, total has no `NaN`, review disabled;
    blank everywhere → disabled; `A` `100` → enabled.
  - `"review sends the filled lines"`: `A` `100`, `B` blank → `review` detail
    `{ date: "2026-10-31", lines: [{ cardId: "A", amount: 10000 }] }`.
  - `"remove and add"`: `[data-action="remove"]` on `A` emits `remove` `{ cardId: "A" }`;
    `add-card` shows the picker with `C — <name>`; clicking it emits `add` `{ cardId: "C" }`.
  - `"starting values and a language switch keep what was typed"` (review focus): mounted with
    `entries: { A: "123" }`, `date: "2026-11-02"` → input values `123` and `2026-11-02`; type
    `B` `5`, `setLocale("th")` → both inputs keep `123` and `5`, labels in Thai
    (`วงเงินเหลือหลังซื้อ`).
- [ ] **Step 2: Run** `bun test src/components/cc-list-amounts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component (the amount input large, as the prototype's
  `.bigin`; `[data-warn]` lines get a `--cc-warning` outline; notes on `--cc-warning-surface`)
  and the keys.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lists): enter amounts with warnings`.

### Task 8: The list table, copy text and save image

**Files:**
- Create: `src/lib/ui/list-share.ts`, `src/lib/ui/list-share.test.ts`,
  `src/components/cc-list-table.ts`, `src/components/cc-list-table.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `headerDate`, `formatAmount`, `listTotal`, `MessageError`.
- Produces:
  ```ts
  // list-share.ts
  export type ShareTable = { title: string; date: string;
    headers: [card: string, name: string, amount: string];
    rows: [card: string, name: string, amount: string][]; total: [label: string, amount: string] };
  export function shareTable(list: Pick<PurchaseList, "date" | "lines">, cards: Card[]): ShareTable;
  export function shareText(table: ShareTable): string;
  export const imageName = (date: PlainDate): string => `purchase-list-${date}.png`;
  export type CanvasLike = { width: number; height: number;
    getContext(kind: "2d"): CanvasRenderingContext2D | null;
    toBlob(done: (blob: Blob | null) => void, type: string): void };
  export type DrawDeps = { createCanvas?: () => CanvasLike; token?: (name: string) => string };
  export function canDrawImage(deps?: DrawDeps): boolean;
  export function drawTablePng(table: ShareTable, deps?: DrawDeps): Promise<Blob | null>;
  export function downloadBlob(blob: Blob, filename: string): void;
  export type ShareApi = { copy?: (text: string) => Promise<void>;
    saveImage?: (table: ShareTable, filename: string) => Promise<void> };
  export function browserShare(): ShareApi;
  ```
  and `@customElement("cc-list-table") class CcListTable` with properties
  `list: Pick<PurchaseList, "date" | "lines">` and `cards: Card[]`.

`shareTable` (in the current locale): title `purchaseList.title`, date
`headerDate(list.date, locale, true)`, headers `purchaseList.column.card|name|amount`, rows
`[id, "<name> (<last4>)", formatAmount(amount)]` (a card no longer stored reads
`common.none` for its name), total `[purchaseList.total {count}, formatAmount(listTotal)]`.
`shareText` joins `title · date`, the headers, each row and the total, cells with ` | `,
lines with `\n`. `drawTablePng` returns null when the canvas gives no 2D context; otherwise it
sizes the canvas to the text (title, date, a header rule, rows with right-aligned amounts, a
total rule), fills with `token("--cc-surface")`, writes in `token("--cc-text")` (muted cells
`--cc-text-muted`, rules `--cc-border`) using `token("--cc-font-sans")`, at twice the CSS
size for a sharp image, and resolves `toBlob(…, "image/png")`. The default `token` reads
`getComputedStyle(document.documentElement).getPropertyValue(name).trim()`. `downloadBlob`
creates an object URL, clicks a temporary `<a download>`, then revokes the URL.
`browserShare()` sets `copy` only when `navigator.clipboard?.writeText` exists, and `saveImage`
only when `canDrawImage()`; `saveImage` throws `MessageError("purchaseList.error.image")` when
`drawTablePng` gives null.

`cc-list-table` renders `<h3>` title and `<p>` date, then `<table>` with `<thead>` the headers
(amount `data-numeric`), one `<tr>` per row (`data-label` per cell for the stacked phone
layout, UI-17), and `<tfoot>` the total, all from `shareTable`, so the table, the text and the
image say the same.

| Key | en | th |
|---|---|---|
| `purchaseList.title` | Purchase list | ใบรายการซื้อ |
| `purchaseList.column.card` | Card | บัตร |
| `purchaseList.column.name` | Name (last 4) | ชื่อ (4 หลักท้าย) |
| `purchaseList.column.amount` | Amount | จำนวนเงิน |
| `purchaseList.error.image` | Could not save the image. Use Copy text instead. | บันทึกรูปไม่สำเร็จ ใช้คัดลอกข้อความแทน |

- [ ] **Step 1: Write the failing tests:**
  - list-share.test.ts `"the text follows the table"`: list date `2026-10-31`, lines `KB-F`
    `12_500_00`, `UOB-K` `4_800_00` (names `KBank Fuel` `4412`, `UOB Krabi` `7765`) →
    exactly
    ```
    Purchase list · Sat, 31 Oct 2026
    Card | Name (last 4) | Amount
    KB-F | KBank Fuel (4412) | ฿12,500.00
    UOB-K | UOB Krabi (7765) | ฿4,800.00
    Total · 2 cards | ฿17,300.00
    ```
  - `"the text reads in Thai"`: `setLocale("th")` → first line starts `ใบรายการซื้อ · `,
    header `บัตร | ชื่อ (4 หลักท้าย) | จำนวนเงิน`.
  - `"a card no longer stored keeps its line"`: missing `UOB-K` → row
    `["UOB-K", "—", "฿4,800.00"]`.
  - `"images are named by the list date"`: `imageName("2026-10-31")` →
    `purchase-list-2026-10-31.png`.
  - `"no 2D canvas means no image"`: `createCanvas` returning `getContext: () => null` →
    `canDrawImage` false, `drawTablePng` resolves null.
  - `"the image draws every cell"`: a fake context recording `fillText` calls and a fake
    `toBlob` → every header, row cell and total string was drawn; result is the fake blob;
    `fillStyle` was set from the `token` stub's values.
  - cc-list-table.test.ts `"the table matches the share table"`: header cells, body cells and
    footer cells equal `shareTable`'s strings; amount cells carry `data-numeric`.
- [ ] **Step 2: Run** `bun test src/lib/ui/list-share.test.ts src/components/cc-list-table.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** `list-share.ts`, `cc-list-table` (styles `base`, `dataTable`, plus
  a document look like the prototype's `.doc`, tokens only) and the keys.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lists): list table, copy text and save image`.

### Task 9: The list page: amounts, review, send and draft

**Files:**
- Create: `src/routes/list.html` (a copy of `index.html` with `list.ts` and the title
  `Purchase list — cc-tracking`), `src/routes/list.ts`, `src/routes/list.test.ts`
- Create: `src/lib/ui/back-header.ts`, `src/lib/ui/back-header.test.ts`
- Modify: `src/lib/ui/shell.ts`, `src/lib/ui/shell.test.ts` (`/list` marks Home)
- Modify: `src/styles/app.css` (`.back-header`), `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `loadMoneyData` (Task 2); `isReady`, `roomFor` (Task 1); `listLines`,
  `composeList` (Task 6); `cc-list-amounts` (Task 7); `cc-list-table`, `shareTable`,
  `shareText`, `imageName`, `ShareApi`, `browserShare` (Task 8); `formatAmountInput`.
- Produces:
  ```ts
  // back-header.ts
  export function backHeader(options: { title: string; detail?: string;
    back: string | (() => void) }): TemplateResult;
  // list.ts
  export type ListPageOptions = { clock?: () => Date; search?: string;     // default location.search
    navigate?: (url: string) => void; share?: ShareApi; newId?: () => string };
  export function renderListPage(repo: Repository, root: HTMLElement, options?: ListPageOptions): void;
  ```

`backHeader` renders `<div class="back-header" row>`: an `<a href=…>` (string) or
`<button type="button" data-variant="quiet">` (function) with `data-action="back"`,
`aria-label=${t("common.back")}` and `icons.back`, then `<h1>` title with `<small>` detail.
`.back-header` in `app.css`: a row, the back control a `--cc-icon-size` square target with
`--cc-radius-sm`, the title beside it.

`currentTab` maps `/list` to `"home"`.

`renderListPage` loads `loadMoneyData` and reads `search`: with `id`, the stored list with
that id (none → view `missing`); otherwise the `card` values, kept in order when `isReady`.
View `amounts` (a new list, or a draft: cards from its lines kept when `isReady`, entries
`formatAmountInput(amount)`, its date): `backHeader({ title: t("purchaseList.new") |
t("purchaseList.draft"), back: "/" })`, `cc-error-banner`, `<cc-list-amounts>` with `rooms`
from `roomFor(card, data, editingId)`, `candidates` = ready cards not on the list, and the
page's stored `date` and `entries` (updated on `entry-change`); `remove` and `add` change the
page's card list. `review` switches to view `review`: `backHeader({ title:
t("purchaseList.reviewTitle"), back: () => view = "amounts" })`, `<cc-list-table>`, then
`<button data-variant="quiet" data-action="copy">` `icons.copy` `backup.copy` (only when
`share.copy`), `<button data-variant="quiet" data-action="save-image">` `icons.image`
`purchaseList.saveImage` (only when `share.saveImage`), a `<p class="status" role="status">`
for their outcome (`purchaseList.copied` / `backup.error.copy`, `purchaseList.imageSaved` /
the error's message), `<p class="note">` `purchaseList.sendHint`,
`<button data-action="mark-sent">` `icons.send` `purchaseList.markSent` and
`<button data-variant="quiet" data-action="save-draft">` `purchaseList.saveDraft`. Mark sent
and Save draft run in `state.guard` (`purchaseList.error.save`):
`savePurchaseList(composeList({ id: editingId ?? newId(), date, lines, send, now:
clock().toISOString() }))`, then `navigate("/")` only if it succeeded. View `missing`:
`backHeader({ title: t("purchaseList.title"), back: "/" })`, `purchaseList.missing` and
`<a href="/">` `purchaseList.toHome`. A sent or saved list shows `missing` until Task 10.
Defaults: `newId` is `crypto.randomUUID`, `share` is `browserShare()`. Repaints on `subscribe`.
`bootstrap("title.list", …)`.

| Key | en | th |
|---|---|---|
| `title.list` | Purchase list — cc-tracking | ใบรายการซื้อ — cc-tracking |
| `common.back` | Back | กลับ |
| `purchaseList.new` | New purchase list | ใบรายการซื้อใหม่ |
| `purchaseList.draft` | Draft list | ใบรายการซื้อฉบับร่าง |
| `purchaseList.reviewTitle` | Review list | ตรวจทานใบรายการซื้อ |
| `purchaseList.saveImage` | Save image | บันทึกรูปภาพ |
| `purchaseList.copied` | Copied. Paste it into the chat with the spender. | คัดลอกแล้ว วางในแชตกับผู้ใช้บัตรได้เลย |
| `purchaseList.imageSaved` | Image saved. Send it in the chat with the spender. | บันทึกรูปแล้ว ส่งในแชตกับผู้ใช้บัตรได้เลย |
| `purchaseList.sendHint` | Sent it in the chat? Mark it sent. It waits on Home until the spender replies. | ส่งในแชตแล้วใช่ไหม กดบันทึกว่าส่งแล้ว ใบรายการจะรออยู่ที่หน้าหลักจนกว่าผู้ใช้บัตรจะตอบ |
| `purchaseList.markSent` | Mark as sent | บันทึกว่าส่งแล้ว |
| `purchaseList.saveDraft` | Save as draft instead | บันทึกเป็นฉบับร่างแทน |
| `purchaseList.error.save` | Could not save the list. | บันทึกใบรายการซื้อไม่สำเร็จ |
| `purchaseList.error.read` | Could not read the list. | อ่านใบรายการซื้อไม่สำเร็จ |
| `purchaseList.missing` | This list no longer exists. | ไม่พบใบรายการซื้อนี้แล้ว |
| `purchaseList.toHome` | Go to Home | ไปที่หน้าหลัก |

- [ ] **Step 1: Write the failing tests** in `list.test.ts` (clock
  `2026-10-31T03:00:00Z`; ready cards `A`, `B`; archived `Z`; `newId` returning `l-new`; a
  recording `navigate`; a fake `share` recording calls; helpers to dispatch the
  `cc-list-amounts` events):
  - `"a new list opens with the picked cards and today"`: search `?card=B&card=A&card=Z&card=nope`
    → `cc-list-amounts.cards` ids `["B", "A"]`, `date` `2026-10-31`; `[data-action="back"]`
    href `/`.
  - `"review shows the table and comes back with everything typed"`: `entry-change`
    `{ entries: { A: "125" } }`, then `review` with one line → `cc-list-table` present;
    `[data-action="back"]` click → `cc-list-amounts.entries.A` is `125`.
  - `"mark as sent stores a waiting list and goes home"`: review then
    `[data-action="mark-sent"]` → the one stored list is `{ id: "l-new", date: "2026-10-31",
    status: "sent", sentAt: "2026-10-31T03:00:00.000Z", lines }`; `navigate` got `/`.
  - `"save as draft stores a draft"`: → status `draft`, no `sentAt`; `navigate` got `/`.
  - `"a draft opens into enter amounts and keeps its id"`: stored draft `d1` (date
    `2026-11-02`, lines `A` `12_345_00`, `Z` `100`) at `?id=d1` → cards `["A"]`, entries
    `{ A: "12345" }`, date `2026-11-02`, title `Draft list`; mark sent → one stored list, id
    `d1`, status `sent`.
  - `"a sent list holds room on a new list"`: stored sent list line `A` `10_000_00` →
    `cc-list-amounts.rooms.get("A").held` is `10_000_00`.
  - `"copy text copies the table"`: `[data-action="copy"]` → `share.copy` got `shareText` of
    the review's table; status reads `Copied. Paste it into the chat with the spender.`; with
    `share: {}` neither copy nor save-image is rendered.
  - `"save image is named by date and failure is said"`: → `share.saveImage` got
    `purchase-list-2026-10-31.png`; a `saveImage` rejecting with
    `MessageError("purchaseList.error.image")` → status shows that text.
  - `"a failed save keeps the review"`: a repository whose `savePurchaseList` rejects → banner
    starts `Could not save the list.`, `cc-list-table` still shown, `navigate` not called.
  - `"an unknown list says so"`: `?id=gone` → `purchaseList.missing` text and `a[href="/"]`.
  In `shell.test.ts`: `currentTab("/list")` is `"home"`. In `back-header.test.ts`: a string
  `back` renders `a[data-action="back"][href="/x"]`; a function renders a button that calls it;
  `aria-label` is `Back`, `กลับ` in Thai.
- [ ] **Step 2: Run** `bun test src/routes/list.test.ts src/lib/ui/back-header.test.ts src/lib/ui/shell.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** the page, `list.html`, `backHeader`, the shell change, the styles
  and the keys.
- [ ] **Step 4: Run** `bun run test` (the route scans now include `list.html`: GTM, theme
  script, shell slots) and `bun run build` (the build lists `/list`). Expected: PASS.
- [ ] **Step 5: Run** `bun run dev`: tick two cards on Home, Enter amounts, type an amount over
  the room, Lower to, Review, Copy text, Save image (a PNG named `purchase-list-<date>.png`
  downloads), Mark as sent; Home shows *Waiting for the spender*. Expected: as the prototype.
- [ ] **Step 6: Commit** `feat(lists): enter amounts, review and send a purchase list`.

### Task 10: The spender's reply and the saved list

**Files:**
- Create: `src/components/cc-list-reply.ts`, `src/components/cc-list-reply.test.ts`
- Modify: `src/routes/list.ts`, `src/routes/list.test.ts`, `src/lib/i18n/en.ts`, `th.ts`

**Interfaces:**
- Consumes: `saveReply`, `listTotal` (purchase-list.ts); `sequentialIds`, `lineAmount`
  (Task 6); `backHeader` (Task 9); `addDays`, `headerDate`, `formatAmount`,
  `formatAmountInput`; `MessageError`.
- Produces: `@customElement("cc-list-reply") class CcListReply` with `list: PurchaseList`,
  `cards: Card[]`; event `save-reply` `{ lines: ListLine[]; moveUnmade: boolean }`.

`cc-list-reply` keeps answers in `@state()` (from the list's lines: `made`, and the amount
text `formatAmountInput(actual ?? amount)`), and `moveUnmade = true`. It renders
`<p class="note">` `reply.hint`, then one `<section class="line" data-card=<id>>` per line:
id and name, `reply.planned {amount}`, `<div role="group" aria-label=reply.wasMade>` with
`<button data-answer="made" aria-pressed>` `reply.made` and
`<button data-answer="not-made" aria-pressed>` `reply.notMade`; when made,
`<label>` `reply.actual` `<input inputmode="decimal" data-field="actual">`, with
`reply.diff {diff}` in warning text when the real amount differs (`+฿500.00` / `-฿500.00`) and
`quickAdd.error.badAmount` when it is not money. Footer (`.action-bar` look): when any line is
not made, `<label><input type="checkbox" data-field="move" checked>` `reply.move {cards,
date}` (date `headerDate(addDays(list.date, 1), locale, false)`); then
`<button data-action="save-reply">`, enabled only when every line is answered and every real
amount is money: `reply.save.one|many {count, total}` (made lines, real amounts), otherwise
`reply.answerAll {answered, count}`. It emits lines as `{ cardId, amount, made }` plus
`actual` only on a made line whose real amount differs.

The page: a `sent` list renders `backHeader({ title: t("reply.title"), detail:
t("reply.listFor", { date }), back: "/" })` and `<cc-list-reply>`. On `save-reply`, in
`state.guard` (`reply.error.save`): re-read the list from `listPurchaseLists`; if its status
is `saved`, throw `MessageError("reply.error.alreadySaved")`; call `saveReply({ ...stored,
lines }, { now: clock().toISOString(), newId: sequentialIds(stored.id), moveUnmade })`; a
`{ ok: false }` throws `MessageError("reply.error.unanswered")`; write each purchase, then the
draft if any, then the saved list. The page then shows the saved view. A `saved` list
renders `backHeader({ title: headerDate(list.date, locale, true), detail:
t("saved.detail"), back: "/" })`, `<p class="note" data-tone="ok">` `saved.summary.one|many
{count, total}` (`listTotal`), one row per line (id; name, or `reply.planned` when the real
amount differs; the real amount, or a `reply.notMade` tag), and, when `movedTo`,
`<a data-action="open-draft" href="/list?id=<movedTo>">` `saved.moved {cards, date}` with
`<small>` `saved.openDraft`.

| Key | en | th |
|---|---|---|
| `reply.title` | Spender's reply | คำตอบของผู้ใช้บัตร |
| `reply.listFor` | List for {date} | ใบรายการซื้อวันที่ {date} |
| `reply.hint` | Record the spender's reply for each line. Change the amount if the real one differs. | บันทึกคำตอบของผู้ใช้บัตรทีละบรรทัด แก้จำนวนเงินถ้ายอดจริงต่างจากที่วางไว้ |
| `reply.planned` | planned {amount} | วางไว้ {amount} |
| `reply.wasMade` | Was it made? | ซื้อแล้วหรือยัง |
| `reply.made` | Made | ซื้อแล้ว |
| `reply.notMade` | Not made | ไม่ได้ซื้อ |
| `reply.actual` | Real amount | ยอดจริง |
| `reply.diff` | {diff} vs plan | {diff} เทียบกับที่วางไว้ |
| `reply.move` | Move {cards} to a draft for {date} | ย้าย {cards} ไปเป็นฉบับร่างของวันที่ {date} |
| `reply.save.one` | Save 1 purchase · {total} | บันทึก 1 รายการ · {total} |
| `reply.save.many` | Save {count} purchases · {total} | บันทึก {count} รายการ · {total} |
| `reply.answerAll` | Answer every line ({answered} of {count}) | ตอบให้ครบทุกบรรทัด ({answered} จาก {count}) |
| `reply.error.save` | Could not save the reply. | บันทึกคำตอบไม่สำเร็จ |
| `reply.error.alreadySaved` | This list was already saved, so nothing was added again. | ใบรายการนี้บันทึกไปแล้ว จึงไม่ได้เพิ่มรายการซ้ำ |
| `reply.error.unanswered` | Answer every line before saving. | ตอบให้ครบทุกบรรทัดก่อนบันทึก |
| `saved.detail` | Purchase list · saved | ใบรายการซื้อ · บันทึกแล้ว |
| `saved.summary.one` | Saved 1 purchase, {total}. It counts against the card's room now. | บันทึก 1 รายการ รวม {total} แล้ว ยอดนี้นับรวมในวงเงินของบัตรแล้ว |
| `saved.summary.many` | Saved {count} purchases, {total}. They count against each card's room now. | บันทึก {count} รายการ รวม {total} แล้ว ยอดเหล่านี้นับรวมในวงเงินของแต่ละบัตรแล้ว |
| `saved.moved` | {cards} moved to a draft for {date} | ย้าย {cards} ไปเป็นฉบับร่างของวันที่ {date} แล้ว |
| `saved.openDraft` | Open it when you're ready to send | เปิดเมื่อพร้อมส่ง |

- [ ] **Step 1: Write the failing tests** (sent list `w1`, date `2026-10-30`, lines `A`
  `12_500_00`, `B` `4_800_00`, `C` `22_000_00`):
  - cc-list-reply.test.ts `"save waits for every answer"`: answer `A` made →
    `[data-action="save-reply"]` disabled, text `Answer every line (1 of 3)`.
  - `"a made line takes the real amount"`: `A` made → `[data-field="actual"]` value `12500`;
    type `13000` → `+฿500.00 vs plan` shown.
  - `"not made offers the move, ticked"`: `B` not made → `[data-field="move"]` checked, label
    `Move B to a draft for Sat, 31 Oct`.
  - `"saving sends the answers"`: `A` made at `13000`, `B` not made, `C` made unchanged, untick
    move → button `Save 2 purchases · ฿35,000.00`; `save-reply` detail lines
    `[{ cardId: "A", amount: 1250000, made: true, actual: 1300000 }, { cardId: "B", amount:
    480000, made: false }, { cardId: "C", amount: 2200000, made: true }]`, `moveUnmade: false`.
  - `"a real amount that is not money stops the save"`: `A` actual `abc` → error text shown,
    save disabled.
  - `"answers survive a language switch"` (review focus): answer two lines, type an actual,
    `setLocale("th")` → `aria-pressed` and the typed value unchanged; `ซื้อแล้ว` labels.
  - list.test.ts `"a sent list opens the reply"`: `?id=w1` → `cc-list-reply` present, header
    title `Spender's reply`, detail `List for Fri, 30 Oct`.
  - `"saving the reply stores purchases, the draft and the saved list"`: dispatch the detail
    above with `moveUnmade: true` → purchases `A` `13_000_00` and `C` `22_000_00`, each
    `date` `2026-10-30`, `addedAt` `2026-10-31T03:00:00.000Z`, ids `w1-0`, `w1-1`; a draft
    `w1-2` dated `2026-10-31` with line `{ cardId: "B", amount: 480000 }`; list `w1` status
    `saved`, `savedAt` set, `movedTo` `w1-2`; the page shows the saved view with
    `Saved 2 purchases, ฿35,000.00.` and `[data-action="open-draft"]` href `/list?id=w1-2`.
  - `"unticked, not-made lines are dropped"`: `moveUnmade: false` → no draft, no `movedTo`.
  - `"a list already saved is refused"` (review focus): after the page loads, store `w1` as
    `saved` behind its back; dispatch → banner contains
    `This list was already saved, so nothing was added again.`; no purchases stored.
  - `"a retry after a failed write adds nothing twice"` (review focus): a repository whose
    `savePurchaseList` rejects once → banner `Could not save the reply.`; list still `sent`;
    dispatch again → exactly 2 purchases stored for the list (`w1-0`, `w1-1`), list `saved`.
  - `"a saved list shows what was bought"`: stored saved list with one made line differing
    from plan and one not made → the made row shows the real amount and `planned ฿…`, the
    other a `Not made` tag; header title `Fri, 30 Oct 2026`, detail `Purchase list · saved`.
- [ ] **Step 2: Run** `bun test src/components/cc-list-reply.test.ts src/routes/list.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** the component, the reply and saved views, and the keys.
- [ ] **Step 4: Run** `bun run test`, `bun run typecheck`, `bun run build`. Expected: PASS.
- [ ] **Step 5: Run** `bun run dev`: open the waiting list from Home, answer Made with a
  changed amount and Not made, save; the saved view links the next day's draft; Home shows the
  draft and the room has moved. Expected: as the prototype.
- [ ] **Step 6: Commit** `feat(lists): record the spender's reply and show the saved list`.

### Task 11: Documents and shipping

**Files:**
- Modify: `PRD.md`, `PRD_TH.md` (same IDs, same order),
  `docs/superpowers/plans/2026-10-30-redesign-roadmap.md` (phase 3 row links this plan; the
  phase 3 notes marked taken)

- [ ] **Step 1: Update both PRDs:**
  - Decided-changes intro: phase 3 (Home and purchase lists) shipped, with the date.
  - RD-09: *Shipped in phase 3.* RD-10: *Shipped in phase 3; the planned-payment part of the
    over-room explanation arrives with planned payments in phase 4.* RD-15: *Shipped in phase
    3; planned payments join Needs you in phase 4.*
  - FR-23, FR-24, FR-27: retired, replaced by RD-09 (purchase lists). FR-11: retired, replaced
    by *Ready to use* (RD-15). FR-15 and FR-25: off Home since phase 3; return in Transactions
    (RD-13, phase 4). FR-19, FR-20: met on lists by RD-10; the card page's purchase dialog keeps
    its notes until phase 5. FR-26: Home keeps re-reading the clock.
  - US-07: build a list quickly (tick cards, amounts, review, mark sent). US-08: a waiting list
    stays on Home until its reply is saved, so nothing is lost after an interruption. US-09:
    the RD-10 warnings (no future-date warning). US-04: *Ready to use* on Home.
  - DR-16: retired. DR-10 and DR-27: apply to *Ready to use*.
  - DC-03: `cc:batch-start` is no longer read or written (a leftover stays until reset,
    DD-14); `cc:panel:` names lose `range`, `due` and `spendable`. DC-07: purchases saved from
    a reply have ids `<list id>-<n>`.
  - UI-09: drop *Start new batch*. UI-14: the purchase list's table and text show the last 4
    beside the name.
  - CD-01: `/` is Home (*Needs you*, *Ready to use*); `/list` enters, reviews, replies to and
    shows a purchase list. CD-03: Home's layout (one column on a phone; *Needs you* then
    *Ready to use*; a sticky selection bar). CD-04: purchases come from lists; the card page
    keeps its dialog until phase 5. CD-05: retired with *This sitting*. CD-06: gone from Home
    until Transactions.
  - *Where things live*: `src/lib/ui/` adds `money-data.ts`, `list-share.ts`,
    `back-header.ts`; `src/routes/` adds `list`.
  - Retired: the dashboard's purchase form; *This sitting* and *Start new batch*; *Can spend
    now*; *Due next* and *Purchases by date* on Home (back in Transactions).
  - Glossary: *This sitting* and *Batch start* marked retired.
  - Risks: the *This sitting* row now points to waiting lists on Home (RD-15).
  - Add this plan's decisions as DD-58 onward, in both languages: `/list` with `?card=` and
    `?id=`, review as an in-page step; a list holds only ready cards; add another card in
    place; room after counts the whole group; review needs one amount and no bad one; Lower to
    only above zero; Ready to use sorted by most room; Needs you order; the copied text's shape;
    the image follows the theme and its name; retry-safe reply ids and write order; the card
    page keeps its dialog until phase 5.
- [ ] **Step 2: Run** `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`. Expected: all pass.
- [ ] **Step 3: Commit** `docs(prd): home and purchase lists shipped`.
- [ ] **Step 4: Ship** through `.claude/skills/shipping-a-change` with `--base
  redesign-phase-2` for the stacked pull request. The body says Home replaced the dashboard and
  that *Due next*, *Purchases by date* and the history come back with Transactions in phase 4.
  Preview checklist, each at 390px and 1280px, in English and Thai, light and dark (UI-21):
  - Home: *Needs you* items with their icons and words; *All caught up* on an empty day; *Ready
    to use* rows readable, chips wrap, the selected state shows the tick and fill; the
    selection bar sits above the tab bar and clear of the Payment button.
  - Enter amounts: the large amount field, room after, amber outlines with the reason under
    each line, *Lower to*, the past-date note, the summary above *Review*.
  - Review: the table stacks on a phone; Copy text pastes the table into a chat; Save image
    downloads a sharp PNG that reads in both themes and in Thai.
  - Reply: Made and Not made are clear without colour; the move box; the save button names the
    count and total. Saved view and the draft link.
  - Back buttons on every list screen; the Home tab marked on `/list`; focus ring visible on
    Tab.
