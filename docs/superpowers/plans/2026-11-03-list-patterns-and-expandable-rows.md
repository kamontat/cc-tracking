# List Patterns and Expandable Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every list is a row list or a card list drawn from one shared style each, and rows in
Needs you, Transactions (Upcoming and ledger) and the Lists view open in place with details and
actions.

**Architecture:** Part 1 folds local copies into `rowPanel` (shadow) and one light-DOM
`.row-panel` (app.css), and one shared `lineCards` style. Part 2 turns `actionRow` into the one
opening-row helper (head button + hidden details region), moves the write actions into one
`src/lib/ui/row-actions.ts`, and wires Needs you (Home), the ledger and the Lists view to it.

**Tech Stack:** TypeScript, Lit 3, Bun test (happy-dom), Biome.

**Spec:** `docs/superpowers/specs/2026-11-03-list-patterns-and-expandable-rows-design.md`

## Global Constraints

- Branch `redesign/refinement`, worktree `.claude/worktrees/redesign-plan`; implementers commit
  only; no push, branch, worktree or PR.
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build`. `format` rewrites the phase 7 mockup HTML; restore it with
  `git checkout -- docs/superpowers/specs/2026-11-02-redesign-phase-7-card-tile-mockup.html`.
- Shadow CSS only through `var(--cc-*)`; values in `src/styles/tokens.css`. Three button variants
  (none, `quiet`, `danger`). No selector on translated text. Strings in `en.ts` and `th.ts`.
- Opened-row head: one `<button type="button">` with `aria-expanded` and `aria-controls`; nothing
  interactive inside it. Details region `hidden` when closed. One open row per component.
- Two-step *Delete* (plans, payments) and *Confirm* (waiting lists) stay two-step; a draft's
  *Delete* is one step (DD-74) and refuses a list that is no longer a draft.
- Hover: ground, never underline; focus ring (DD-105, DD-109).

## Review Focus

- A write action from an opened row fails (storage error): the page's error banner shows, the row
  stays open, nothing half-written — Task 5 and Task 6 tests.
- The item behind an open row disappears after an action (plan marked paid): no stale open id
  breaks the next open — Task 3 test (`prune`).
- A two-step swap is mid-way and an unrelated repaint happens (clock tick, another row): the swap
  stays — Task 6 test.
- A draft sent from another tab, then *Delete* pressed on Home: refused with the draft page's
  error — Task 4 and Task 5 tests.
- Thai text in an opened row is long: buttons wrap, the list does not get wider — Task 3 CSS
  (`min-inline-size: 0`, wrap) + controller screenshots at 390.

---

### Task 1: Shadow row and card lists use the shared styles

**Files:**
- Modify: `src/components/cc-pay-picker.ts`, `src/components/cc-list-table.ts`,
  `src/components/cc-list-amounts.ts`, `src/components/cc-list-reply.ts`, `src/styles/shared.ts`
- Test: `cc-pay-picker.test.ts`, `cc-list-table.test.ts`, `cc-list-amounts.test.ts`,
  `cc-list-reply.test.ts`, `row-hover.test.ts`

**Interfaces:**
- Produces: `export const lineCards: CSSResult` in `shared.ts` — the `.line` card-list section
  style now duplicated in `cc-list-amounts.ts:60` and `cc-list-reply.ts:54` (moved verbatim).

- [ ] **Step 1: Failing tests:**
  - pay picker: its rows sit in an element with class `panel`, and its styles include
    `rowPanel.cssText`; no local `.list` rule remains.
  - list table: the table sits in a `.panel` (rowPanel) and body rows are divided by
    `border-top: var(--cc-border-width) solid var(--cc-border)`.
  - list amounts add-card picker: candidates render inside a `.panel`, one
    `button[data-card]` row each, showing the chip (`.mini`) and `id) name`; clicking one still
    adds the card (existing test kept).
  - `cc-list-amounts` and `cc-list-reply` styles both contain `lineCards.cssText`; neither defines
    its own `.line {` block.
- [ ] **Step 2: Run** the four test files — FAIL.
- [ ] **Step 3: Implement.** No visual change for the pay picker and the sections; the table gets
  the row-list look (muted header row, bold total row).
- [ ] **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `refactor(ui): row and card lists use the shared styles`.

### Task 2: One light-DOM row panel

**Files:**
- Modify: `src/styles/app.css` (`.set` ~655, `.set-row` ~688, `.saved-lines` ~1554, Locations
  `.location-row` ~798), `src/styles/shared.ts` (`setRows` divider), templates that use `.set`
  / `.saved-lines` only if a class rename needs it (`src/routes/settings.ts`,
  `src/routes/settings/locations-page.ts`, `src/routes/list/view-page.ts`)
- Test: create `src/styles/row-panel.test.ts`

**Interfaces:**
- Produces: `.row-panel` in app.css with exactly `rowPanel` `.panel`'s background, border,
  radius, side padding (`var(--cc-space-4)`), vertical padding 0, and divider
  (`.row-panel > * + * { border-top: var(--cc-border-width) solid var(--cc-border) }`). `.set` and
  `.saved-lines` get these values from it (class added in markup, or the selectors grouped with
  `.row-panel`; least churn). Non-link rows get no hover ground.

- [ ] **Step 1: Failing test** (`row-panel.test.ts`): parse `app.css`; the `.row-panel` rule's
  `background`, `border`, `border-radius`, `padding` equal `rowPanel`'s `.panel` rule values
  (parse `rowPanel.cssText`); the divider rule matches; `.set` and `.saved-lines` either carry the
  class in their templates (assert in rendered settings/view page tests) or appear in the same
  selector list as `.row-panel`; `setRows.cssText`'s divider equals `rowPanel`'s divider value.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `refactor(ui): settings, locations and saved lines share one row panel`.

### Task 3: The opening-row helper

**Files:**
- Modify: `src/components/action-row.ts`; Test: create `src/components/action-row.test.ts`

**Interfaces:**
- Produces (replacing today's `onToggle`/`expanded`/`below`, which nothing uses):
  - `ActionRowOptions` gains `open?: { expanded: boolean; onToggle: () => void; detailsId: string; details: TemplateResult }`.
    With `open`, the head is `button.a-hit[aria-expanded][aria-controls=detailsId]` holding the
    icon, text, the amount (`.amount`, moved inside the head) and a chevron (`.a-chev`, an icon
    from `#lib/ui/icons`, rotated when expanded); `action` and `details` render inside
    `div.a-details[id=detailsId][role=region]` with `hidden` unless expanded (details first, then
    `.a-btns` with `action`). Without `open`, today's link/plain behaviour is unchanged.
  - `ActionRowOptions` gains `lead?: TemplateResult`, which replaces the kind icon in the head;
    ledger purchase and payment rows (Task 6) pass their card chip (`cardMini`) there, so they
    keep today's look. `ActionKind` gains `"purchase"`, `"payment"` and `"saved"` (used for
    `data-item`; their icon is only drawn when no `lead` is given — give `"saved"` a neutral icon).
  - `export function useOpenRow(host: ReactiveControllerHost)` — a tiny Lit controller in
    `action-row.ts`: `isOpen(id)`, `toggle(id)` (opening one closes others, second tap closes),
    `prune(ids: string[])` (forget an id no longer present). Detail ids are `${host prefix}-${id}`.
  - Styles (`actionRowStyles`): details padding and gap from tokens; buttons right-aligned from
    900px, full-width stacked below; text wraps (`min-inline-size: 0`); hover ground on
    `button.a-hit` per DD-105/109; chevron rotation under `prefers-reduced-motion: reduce` has no
    transition.

- [ ] **Step 1: Failing tests** (`action-row.test.ts`, render with lit `render` into a div):
  - with `open` closed: head is a `button` with `aria-expanded="false"` and `aria-controls` equal
    to the details id; `head.querySelector("a, button")` is null; details element has `hidden`;
    the amount is inside the head.
  - expanded: `aria-expanded="true"`, details not hidden, contains the details content then the
    action buttons.
  - clicking the head calls `onToggle` once.
  - `useOpenRow`: toggle a → open a; toggle b → a closed, b open; toggle b → none open;
    `prune(["a"])` while b open → none open.
  - without `open`: href rows still render `a.a-hit` (regression).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS (+ `row-hover.test.ts`).
- [ ] **Step 5: Commit** `feat(ui): one row that opens in place`.

### Task 4: Shared row actions

**Files:**
- Create: `src/lib/ui/row-actions.ts`, `src/lib/ui/row-actions.test.ts`
- Modify: `src/routes/transactions.ts` (`mark`, `confirmList`, `remove` call it),
  `src/routes/list/entry.ts` (`deleteDraft` calls it)

**Interfaces:**
- Produces (pure storage calls; callers wrap them in their page's `state.guard` with the existing
  error keys):
  - `markPlanPaid(repo: Repository, data: MoneyData, payment: CardPayment, now: PlainDate): Promise<void>` — today's `savePayment(repo, data, markPaid(payment, now), now)`.
  - `confirmWaitingList(repo: Repository, listId: string, at: Date): Promise<void>` — today's `writeListReply(repo, id, { now })`.
  - `deletePlannedPayment(repo: Repository, payment: CardPayment): Promise<void>` — today's `deletePayment`.
  - `deleteDraftList(repo: Repository, id: string): Promise<void>` — refuses (throws the same
    error the draft page's `storedDraft` throws) when the stored list is missing or not a draft,
    else `repo.deletePurchaseList(id)`.
  - Error keys stay: `tx.error.markPaid`, `tx.error.confirmList`, `tx.error.delete`,
    `purchaseList.error.delete`.

- [ ] **Step 1: Failing tests** with `InMemoryRepository`: each function's effect; `deleteDraftList`
  on a sent list rejects and the list remains; on a missing id rejects.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** and switch the two callers (their existing
  tests must still pass unchanged). **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `refactor(lists): one home for a row's write actions`.

### Task 5: Needs you rows open on Home

**Files:**
- Modify: `src/components/cc-needs-you.ts`, `src/lib/domain/home.ts` (overdue item gains
  `closeDate: PlainDate`), `src/routes/index.ts`, `src/lib/i18n/en.ts`, `th.ts`
- Test: `cc-needs-you.test.ts`, `src/lib/domain/home.test.ts`, `src/routes/index.test.ts`

**Interfaces:**
- Consumes: `actionRow` `open`, `useOpenRow` (Task 3); row-actions (Task 4).
- Produces: `cc-needs-you` emits `mark-paid {payment}`, `delete-payment {payment}`,
  `confirm-list {list}`, `delete-draft {list}` (bubbling not needed; Home listens on the element).
  Home wires them to row-actions inside its `state.guard` (error keys above), then reloads.
  New strings (en / th, builder writes Thai): `row.pay` "Pay", `row.openCard` "Open card",
  `row.recordReply` "Record reply", `row.continue` "Continue", `row.lines.total` "Total
  {amount}", `row.overdue.dates` "Closed {close} · due {due}", `row.left` "{amount} left".
  Reuse `row.paid`, `common.delete`, `row.confirm`, `row.save`, `common.cancel` and the
  existing two-step markup/focus logic — move the plan and list two-step helpers out of
  `cc-tx-ledger.ts` into `action-row.ts` (or a sibling module) so Needs you and the ledger share
  them.
- Contents per row: the spec's table (overdue: dates + left, **Pay** primary `a.btn` to
  `payAddress`, **Open card**; planned: note, **Paid**, **Delete** two-step; waiting: lines +
  total, **Record reply** primary link, **Confirm** two-step; draft: lines + total, **Continue**
  primary link, **Delete** one step).

- [ ] **Step 1: Failing tests:**
  - every Needs you row head is a `button` (no `a.a-hit` left); opening one closes another.
  - overdue opened: shows "Closed … · due …" and "… left"; *Pay* href is today's `payAddress`.
  - planned: *Paid* emits `mark-paid` with the payment; *Delete* swaps to *Delete*/*Cancel*, the
    second *Delete* emits `delete-payment`.
  - waiting: lines in line form with amounts and total; *Confirm* → *Save* emits `confirm-list`.
  - draft: *Delete* emits `delete-draft` at once.
  - `home.test.ts`: overdue item carries `closeDate`.
  - `index.test.ts`: Home marks a plan paid (stored payment becomes paid, row gone); a repo whose
    write throws shows the error banner and keeps the row open; deleting a draft removes it;
    deleting a sent list refuses with the error.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `feat(home): Needs you rows open in place with their actions`.

### Task 6: Transactions rows open (Upcoming and ledger)

**Files:**
- Modify: `src/components/cc-tx-ledger.ts`, `src/routes/transactions.ts` (pass `.ledgers`),
  `en.ts`, `th.ts`; Test: `cc-tx-ledger.test.ts`, `src/routes/transactions.test.ts`,
  `row-hover.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 helpers (two-step helpers now shared).
- Produces: `@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map()` on
  `cc-tx-ledger`. One `useOpenRow` for the whole component (Upcoming + all day panels).
  Strings: `row.openList` "Open list", `row.statement` "Statement {close} · due {due}",
  `row.paidTo` "{amount} to {period}" (one per statement the payment reached).
- Contents: Upcoming waiting list and planned payment as Needs you (buttons move into the opened
  area); purchase: note, statement dates (from the card's ledger statement containing the
  purchase), the list it came from (line), **Open card**, **Open list** (only from a list);
  payment: note, each `LedgerStatement.payments` part for this payment ("{amount} to {period}"),
  **Delete** two-step. Purchase rows stop being links.

- [ ] **Step 1: Failing tests:**
  - no `a.crow` purchase rows remain; purchase head is a button; opened shows note, statement,
    list line, *Open card* href `/card?id=…` and *Open list* href `/list/view?id=…` only when from
    a list.
  - payment opened lists "{amount} to {period}" for each statement it paid; *Delete* two-step
    emits `delete-payment`.
  - Upcoming *Paid*/*Delete*/*Confirm* are not visible until the row opens, then behave as before
    (existing events).
  - at most one row open across Upcoming and two day panels.
  - a two-step swap survives a repaint (`requestUpdate()` / new `entries` array with the same
    items).
  - `transactions.test.ts`: mark-paid and confirm still write through row-actions; a failing write
    shows the error and keeps the row open.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `feat(transactions): ledger and upcoming rows open in place`.

### Task 7: Lists view rows open

**Files:**
- Modify: `src/components/cc-list-index.ts`, `src/routes/transactions.ts`; Test:
  `cc-list-index.test.ts`, `transactions.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6. Rows render through `actionRow` (kind by status: draft/waiting/saved — add
  `"saved"` to `ActionKind` with a neutral icon if needed) with `open`.
- Produces: `cc-list-index` emits `confirm-list {list}` and `delete-draft {list}`; transactions.ts
  wires them like Home (row-actions, `state.guard`, reload). Strings: `row.open` "Open".
- Contents: lines (card line form, amount; once replied, made / not made using the reply page's
  existing words) + total; draft **Continue** + **Delete** (one step); sent **Record reply** +
  **Confirm** (two-step); saved **Open** (primary link to `listPageAddress`).

- [ ] **Step 1: Failing tests** for each status's contents and events; rows are no longer links;
  one open at a time; the status filter chips still work.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; full check list.
- [ ] **Step 5: Commit** `feat(lists): purchase lists open in place`.

### Task 8: Docs

**Files:** `AGENTS.md`, `PRD.md`, `PRD_TH.md`

- [ ] **Step 1:** AGENTS.md "Design system conventions": the two list kinds (row list: `rowPanel`
  / `.row-panel`; card list: standalone panels) and "a list that is neither is a bug"; the opening
  row (`actionRow` `open`, one open per component, head is one button).
- [ ] **Step 2:** PRD.md and PRD_TH.md (same IDs): a new UI row for the two list kinds; DD-162
  (Part 1), DD-163 (the opening-row pattern), DD-164 (what each row shows and offers, Home's new
  actions), dated notes on DD-77, DD-106, DD-108, DD-110 and any row saying a Needs you / ledger
  / lists row opens a page; DD-74 stands. Thai uses สถานที่.
- [ ] **Step 3:** `bun run test`; commit `docs(prd): list kinds and rows that open in place`.
