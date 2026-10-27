# Dashboard Entry Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard into a two-column receipt-entry workspace: an always-visible add form with a persistent "This sitting" list beside it, and a cross-card "Purchases by date" summary.

**Architecture:** Purchases gain an optional `addedAt` instant; the repository gains a per-browser batch start. Pure domain helpers in `src/lib/domain/purchase-range.ts` compute ranges, summaries and the sitting list. Two new Lit components (`cc-sitting-list`, `cc-purchase-range`) render them; `cc-quick-add` gains an inline mode; `src/routes/index.ts` lays it all out with the existing `.split` grid.

**Tech Stack:** Bun, TypeScript, Lit, happy-dom tests via `bun test`, Biome.

**Spec:** `docs/superpowers/specs/2026-10-27-dashboard-entry-workspace-design.md`

## Global Constraints

- Work in a worktree per `.claude/skills/shipping-a-change` (`EnterWorktree` name `dashboard-entry-workspace`, then `bun install`). Copy the spec and this plan into the worktree's `docs/superpowers/` and commit them with Task 1.
- Every user-facing string through `t()`, added to both `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts`; `coverage.test.ts` must pass.
- Shadow CSS uses only `var(--cc-*)` tokens; no literal colours/sizes. Buttons: no attribute, `data-variant="quiet"`, or `data-variant="danger"` only.
- No CSS selector keyed off translated text.
- No visual redesign: no new colours, no progress bars. Reuse existing tokens, `listControls`, `filterChip`, `.panel`, `.split`.
- Before each commit: `bun run format && bun run check && bun run typecheck && bun run test && bun run build`, all green.
- Conventional commits, lower case, scoped (`feat(purchases): …`, `feat(dashboard): …`). Do not touch `CHANGELOG.md`.
- Dates: `PlainDate` (`YYYY-MM-DD`, Asia/Bangkok via `today()`). Week = Monday–Sunday.

## Review Focus

1. **Custom range with from after to** — reader expects the range to still work, not an empty page: bounds are swapped. Test in Task 3.
2. **Custom range with one date cleared** — reader expects an open-ended range on that side, not "no purchases". Test in Task 3.
3. **A failed save on the inline form** — amount and note must stay typed so the reader can retry; only a successful save clears them. Test in Task 7.
4. **Backup import with a malformed `addedAt`** (number, non-date string) — rejected with a named problem, not silently stored and later crashing the sitting list. Test in Task 1.
5. **Tab left open past midnight** — the form's default date and "Today"/"This week" presets follow the new day. Test in Task 7.

---

### Task 1: `addedAt` on purchases, accepted by backup import

**Files:**
- Modify: `src/lib/domain/types.ts` (`Purchase`)
- Modify: `src/lib/storage/transfer.ts` (`purchaseProblem`)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Produces: `Purchase.addedAt?: string` — ISO 8601 instant (`new Date().toISOString()`), when the purchase was first entered. Absent on purchases saved before this change.

- [ ] **Step 1: Write failing tests** in `transfer.test.ts`:
  - `"imports a purchase with addedAt and keeps it"`: a backup whose purchase has `addedAt: "2026-10-27T03:15:00.000Z"` imports, and `repo.listPurchases` returns it with that `addedAt`.
  - `"imports a purchase without addedAt"`: still imports (existing behaviour, assert explicitly).
  - `"rejects a purchase whose addedAt is not an ISO instant"`: `addedAt: 123` and `addedAt: "yesterday"` each fail with problem key `"backup.problem.badAddedAt"`.
- [ ] **Step 2:** `bun test src/lib/storage/transfer.test.ts` — FAIL (unknown key / accepted bad value).
- [ ] **Step 3:** Add `addedAt?: string` to `Purchase` with a doc comment. In `purchaseProblem`, when `addedAt` is present it must be a string with `!Number.isNaN(Date.parse(value))`, else `"backup.problem.badAddedAt"`. Add the key: en `"A purchase's entry time is not a valid date and time."`, th `"เวลาที่บันทึกรายการซื้อไม่ใช่วันเวลาที่ถูกต้อง"`.
- [ ] **Step 4:** Tests PASS; run full check list.
- [ ] **Step 5:** Commit `feat(purchases): record when a purchase was entered` (include the copied spec + plan).

### Task 2: Batch start in the repository

**Files:**
- Modify: `src/lib/storage/repository.ts` (interface + `InMemoryRepository`)
- Modify: `src/lib/storage/local.ts`
- Test: `src/lib/storage/contract.ts`, `src/lib/storage/local.test.ts`

**Interfaces:**
- Produces on `Repository`:
  - `getBatchStart(): Promise<string | null>` — ISO instant of the last "Start new batch", or null when never set.
  - `saveBatchStart(at: string): Promise<void>`
  - `clearAll()` also forgets it.
- LocalStorage key: `cc:batch-start` (JSON string). Not part of backup export/import.

- [ ] **Step 1: Failing contract tests** in `repositoryContract`:
  - `"has no batch start before one is saved"` → `null`.
  - `"saves and reads the batch start back"` → `"2026-10-27T03:00:00.000Z"` round-trips; a second save replaces it.
  - `"clearAll forgets the batch start"`.
  - In `local.test.ts`: `"stores the batch start under cc:batch-start"`, and `"keeps the batch start out of a backup export"` (export JSON has no batch-start field).
- [ ] **Step 2:** `bun test src/lib/storage` — FAIL.
- [ ] **Step 3:** Implement in both repositories; add `BATCH_START` const in `local.ts` and remove it in `clearAll` (update its doc comment's list).
- [ ] **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(purchases): remember when the current batch started`.

### Task 3: Range and sitting helpers

**Files:**
- Create: `src/lib/domain/purchase-range.ts`
- Test: `src/lib/domain/purchase-range.test.ts`

**Interfaces:**
- Consumes: `Purchase.addedAt` (Task 1); `addDays`, `parseDate`, `daysInMonth`, `compareDates` from `#lib/domain/date`; `sumAmounts` from `#lib/domain/money`.
- Produces:
  - `type RangePreset = "today" | "week" | "month" | "lastMonth" | "custom"`
  - `type DateRange = { from: PlainDate | ""; to: PlainDate | "" }` — `""` means open on that side.
  - `presetRange(preset: Exclude<RangePreset, "custom">, today: PlainDate): { from: PlainDate; to: PlainDate }`
  - `normaliseRange(range: DateRange): DateRange` — swaps from/to when both set and from > to.
  - `purchasesInRange(purchases: Purchase[], range: DateRange, cardId?: string): Purchase[]` — normalised range, inclusive, newest purchase date first, ties by `addedAt` desc then id.
  - `rangeSummary(purchases: Purchase[]): { count: number; total: number; cards: number }`
  - `sittingPurchases(purchases: Purchase[], since: string): Purchase[]` — those with a parseable `addedAt` ≥ `since`, newest `addedAt` first.

- [ ] **Step 1: Failing tests** (today = `"2026-10-27"`, a Tuesday):
  - `presetRange("today")` → `{from:"2026-10-27",to:"2026-10-27"}`; `"week"` → `2026-10-26`..`2026-11-01`; on Sunday `2026-11-01` week → `2026-10-26`..`2026-11-01`; on Monday `2026-10-26` → same; `"month"` → `2026-10-01`..`2026-10-31`; `"lastMonth"` → `2026-09-01`..`2026-09-30`; `"lastMonth"` on `2026-01-15` → `2025-12-01`..`2025-12-31`.
  - `normaliseRange({from:"2026-10-31",to:"2026-10-01"})` → swapped.
  - `purchasesInRange` with `{from:"2026-10-05",to:""}` includes everything from the 5th on; with `{from:"",to:""}` returns all; inclusive at both ends; card filter narrows; order is date desc.
  - `rangeSummary` of 3 purchases on 2 cards (10_000, 2_550, 100) → `{count:3,total:12_650,cards:2}`; empty → zeros.
  - `sittingPurchases` excludes purchases without `addedAt`, with `addedAt` before `since`, and with unparseable `addedAt`; orders newest-entered first even when purchase dates disagree.
- [ ] **Step 2:** `bun test src/lib/domain/purchase-range.test.ts` — FAIL (module missing).
- [ ] **Step 3:** Implement. Day of week: `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`, Monday offset `(dow + 6) % 7`. Compare instants with `Date.parse`.
- [ ] **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(purchases): count purchases across cards by date range`.

### Task 4: `cc-quick-add` inline mode

**Files:**
- Modify: `src/components/cc-quick-add.ts`
- Test: `src/components/cc-quick-add.test.ts`

**Interfaces:**
- Produces on `CcQuickAdd`:
  - `@property({ type: Boolean }) inline = false` — no Cancel button when true.
  - `@property({ type: Number }) cleared = 0` — each time the page increments it, the amount and note inputs empty and the amount input takes focus; card selection and date stay.

- [ ] **Step 1: Failing tests:**
  - `"inline form has no cancel button"` → no `[data-action="cancel"]`.
  - `"bumping cleared empties amount and note but keeps card and date"`: pick second card, set date `2026-10-20`, type amount/note, set `cleared = 1`, await update → amount `""`, note `""`, select value = second card, date `2026-10-20`, `document.activeElement`/shadow active element is the amount input.
  - `"without a cleared bump the typing stays"` after `add` is dispatched.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement: in `updated`, when `changed.has("cleared") && changed.get("cleared") !== undefined`, clear the two inputs and focus amount. Update the "No reset after the add" comment to explain the inline case.
- [ ] **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(purchases): let the purchase form stay open between entries`.

### Task 5: `cc-sitting-list`

**Files:**
- Create: `src/components/cc-sitting-list.ts`
- Test: `src/components/cc-sitting-list.test.ts`
- Modify: `src/lib/i18n/en.ts`, `th.ts`

**Interfaces:**
- Consumes: `sittingPurchases` output (already filtered and ordered by the page), `formatAmount`, `displayDate`, `sumAmounts`.
- Produces `<cc-sitting-list>`:
  - Properties: `purchases: Purchase[]`, `cards: Card[]`, `now: number` (ms epoch, for "ago").
  - Event: `start-batch` (no detail), fired only on the confirming click.
  - Read-only rows: `[data-testid="sitting-row"]` with entered-ago, card (`id — name`, falling back to `cardId` if the card is gone), note, purchase date, amount.
  - Header: count and total (`[data-testid="sitting-count"]`, `[data-testid="sitting-total"]`).
  - Button `[data-action="start-batch"]` (quiet). First click swaps it for `[data-action="confirm-batch"]` (danger, "Start new batch") and `[data-action="keep-batch"]` (quiet, "Keep"). Keep reverts without an event.
- Keys (en / th):
  - `sitting.title` "This sitting" / "รอบนี้"
  - `sitting.summary` "{count} added · {total}" / "เพิ่มแล้ว {count} รายการ · {total}"
  - `sitting.empty` "Nothing added since this batch started." / "ยังไม่มีรายการตั้งแต่เริ่มรอบนี้"
  - `sitting.startBatch` "Start new batch" / "เริ่มรอบใหม่"
  - `sitting.confirmBatch` "Clear this list and start a new batch?" / "ล้างรายการนี้และเริ่มรอบใหม่?"
  - `sitting.keep` "Keep" / "เก็บไว้"
  - `sitting.ago.now` "just now" / "เมื่อสักครู่"; `sitting.ago.minutes` "{n} min ago" / "{n} นาทีที่แล้ว"; `sitting.ago.hours` "{n} h ago" / "{n} ชม. ที่แล้ว"; `sitting.ago.days` "{n} d ago" / "{n} วันที่แล้ว"
  - Ago thresholds: < 1 min now; < 60 min minutes; < 24 h hours; else days (floor).

- [ ] **Step 1: Failing tests:** renders rows in given order; count/total text; empty text when no purchases; ago text for 30 s, 5 min, 3 h, 2 d; card fallback to id; start → confirm/keep shown, no event; keep → back, no event; confirm → one `start-batch` event; language switch to `th` re-renders text; no buttons inside rows.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (styles via `#styles/shared` and tokens). **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(dashboard): list what was entered this sitting`.

### Task 6: `cc-purchase-range`

**Files:**
- Create: `src/components/cc-purchase-range.ts`
- Test: `src/components/cc-purchase-range.test.ts`
- Modify: `src/lib/i18n/en.ts`, `th.ts`

**Interfaces:**
- Consumes: Task 3 helpers; `filterChip` / `listControls` patterns from `src/components/list-controls.ts`.
- Produces `<cc-purchase-range>`:
  - Properties: `purchases: Purchase[]` (all, archived cards' included), `cards: Card[]` (all), `today: PlainDate`.
  - Internal state: `preset: RangePreset = "month"`, `from`, `to` (custom), `cardId = ""`, `expanded = false`.
  - Preset chips `[data-preset="today|week|month|lastMonth|custom"]`, `aria-pressed` on the active one. Choosing Custom seeds from/to with the previous preset's range. Custom shows `input[name="from"]` and `input[name="to"]` (type date).
  - Card filter `select[name="card"]`: "All cards", then active cards, then archived cards with the archived tag in the option text.
  - Tiles: `[data-testid="range-count"]`, `[data-testid="range-total"]`, `[data-testid="range-cards"]`.
  - `<details>` with summary "Show {count} purchases"; inside, rows grouped under a date heading `[data-testid="range-day"]` (`displayDate`); each row `[data-testid="range-row"]` with card, note, amount, and `[data-testid="archived-tag"]` when the card is archived.
- Keys (en / th): `range.title` "Purchases by date" / "รายการซื้อตามวันที่"; `range.preset.today` "Today" / "วันนี้"; `range.preset.week` "This week" / "สัปดาห์นี้"; `range.preset.month` "This month" / "เดือนนี้"; `range.preset.lastMonth` "Last month" / "เดือนที่แล้ว"; `range.preset.custom` "Custom" / "กำหนดเอง"; `range.from` "From" / "ตั้งแต่"; `range.to` "To" / "ถึง"; `range.allCards` "All cards" / "ทุกบัตร"; `range.count` "purchases" / "รายการ"; `range.total` "total" / "ยอดรวม"; `range.cards` "cards used" / "บัตรที่ใช้"; `range.show` "Show {count} purchases" / "แสดง {count} รายการ"; `range.empty` "No purchases in this range." / "ไม่มีรายการในช่วงนี้"; `range.archived` "archived" / "เก็บถาวร".

- [ ] **Step 1: Failing tests** (today `2026-10-27`): default preset month counts only October purchases; switching to lastMonth updates tiles; custom with from > to still lists the purchases between them; clearing `to` makes the range open-ended; card filter narrows; archived card purchases counted, tagged, and the archived card appears last in the filter; list hidden until expanded; rows grouped by day, newest day first; empty text when none.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(dashboard): summarise purchases across cards by date`.

### Task 7: Dashboard layout and wiring; card page entry time

**Files:**
- Modify: `src/routes/index.ts`
- Modify: `src/routes/card.ts` (savePurchase call ~line 194)
- Modify: `src/styles/app.css` only if `.split` needs a dashboard variant (left column = form; tokens only)
- Test: `src/routes/index.test.ts`, `src/routes/card.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- `renderDashboardPage(repo: Repository, root: HTMLElement, clock: () => Date = () => new Date()): void` — `clock` drives `today()`, `addedAt`, the first-load batch start and the sitting "ago"; a 60 s `setInterval` re-reads it and repaints (so midnight rolls `today`).

Layout (`.split`, below 960 px it stacks in source order):
1. Title row: `h1` only (no Add a purchase button on the dashboard).
2. Error banner, then `purchaseStatus` confirmation (unchanged copy).
3. Left column: panel "Add a purchase" with `<cc-quick-add inline .cleared=${n}>` (cards = visible ∩ `canPurchase`), then `<cc-sitting-list>`.
4. Right column (`split__aside`): `<details class="panel" data-panel="range">` (default open) with `<cc-purchase-range>`, then Due next, then Spendable (both keep their `panelOpen` keys and defaults).

Behaviour:
- On load: `getBatchStart()`; if null, save `clock().toISOString()` and use it.
- `onAdd`: new purchase saved with `addedAt: clock().toISOString()`; on success set `confirmedPurchase`, increment `cleared`, reload; on failure leave `cleared` alone and show the error inside the left panel.
- `start-batch`: `saveBatchStart(clock().toISOString())`, repaint.
- Card page: new purchases get `addedAt: new Date().toISOString()`; edits keep the edited purchase's existing `addedAt` (spread from `editing`).
- Remove now-unused dashboard dialog state (`adding`, `addSubmitted`, `openAdd`, `closeAdd`); `purchaseDialog` stays for the card page.

- [ ] **Step 1: Failing tests** in `index.test.ts` (update existing tests that click `[data-action="add-purchase"]` to use the inline form):
  - `"shows the add form without opening a dialog"` — `cc-quick-add[inline]` present, no `cc-modal`.
  - `"an added purchase records addedAt and appears in This sitting"` — clock fixed at `2026-10-27T03:00:00Z`; after submit, stored purchase has that `addedAt`, one `sitting-row`, confirmation text shown.
  - `"a successful add clears amount and note, keeps card and date"`.
  - `"a failed add keeps the typing and shows the error in the form panel"` (`RejectingPurchaseRepository`).
  - `"first load with no batch start saves one, so This sitting starts empty"`.
  - `"This sitting survives a reload"` — render twice over the same repo, row still there.
  - `"Start new batch, confirmed, empties This sitting"`.
  - `"purchases from before addedAt existed do not show in This sitting"`.
  - `"Purchases by date counts across cards, archived included"`.
  - `"today rolls over at midnight"` — clock `2026-10-27T16:59:00Z` (23:59 Bangkok), advance to `2026-10-27T17:01:00Z`, run the interval tick (use fake timers or call through `setSystemTime`), form date becomes `2026-10-28`.
  - In `card.test.ts`: `"a new purchase from the card page records addedAt"`, `"editing keeps the original addedAt"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; full check list.
- [ ] **Step 5:** Commit `feat(dashboard): make the dashboard a workspace for entering receipts`.

### Task 8: TODO, README, ship

**Files:**
- Create: `TODO.md`
- Modify: `README.md` (Pages → `/` bullet)

- [ ] **Step 1:** `TODO.md`:

```markdown
# TODO

- Redesign the UX/UI, flows and colouring. Starting points from the 2026-10-27 dashboard
  mockups: friendlier colours, and a "used this cycle" progress bar per limit group in
  Spendable.
```

- [ ] **Step 2:** README `/` bullet: the dashboard is a two-column workspace — always-visible purchase form with *This sitting* (purchases entered since *Start new batch*, kept across reloads; purchases from before entry times were recorded never show), and *Purchases by date* (count, total, cards used across all cards, archived included, by preset or custom range), plus due list and spendable.
- [ ] **Step 3:** Full check list green; commit `docs: note the dashboard workspace and the pending redesign`.
- [ ] **Step 4:** Push, open PR, wait for `deploy` check, report preview URL (shipping-a-change steps 6–8). PR preview checks to list unticked: desktop two-column layout, phone stacking order, Thai copy fits.
