# cc-tracking — Design

Date: 2026-09-15
Revised: 2026-09-21 (storage amendments after sanity check; see Verified Assumptions)
Status: Approved for implementation planning

## Problem

A set of company credit cards is physically distributed across three places: the
company office in Krabi, the owner's mother's house in Phichit, and the owner
himself in Bangkok. Three questions need answering at any moment:

1. Where is a given card right now?
2. When does each card's statement close, and when is its payment due?
3. If a purchase is made on a given date, which statement does it land on and by
   when must it be paid?

The application tracks company purchases only. Personal spending is out of scope.

## Scope

In scope for phase 1:

- Card registry: id, name, last 4 digits, location, billing cycle rule, optional comment.
- Purchase records: card, date, amount, note.
- Derived statements with computed close and due dates.
- Marking a statement paid or unpaid.
- Dashboard covering all three questions above.
- JSON export and import of the whole dataset.

Explicitly out of scope: charts, budgets, receipt uploads, bank import,
notifications, personal/company expense splitting, multi-currency.

## Core Modeling Decision

Statements are **derived, not stored**. The system persists cards, purchases, and
one small record per paid statement. Every statement period — its close date, due
date, member purchases, and total — is computed on read from the owning card's
cycle rule.

Rejected alternatives:

- **Materialized statements** (a stored row per card per month, produced by a
  generation job). This buys immunity from retroactive rule edits and an audit
  trail, at the cost of generation logic, backfill, a scheduled job on the
  Worker, and two sources of truth to reconcile. The problem it solves does not
  exist yet, and materializing later is an additive change.
- **Manual statement entry.** Zero date math, maximum typing, and it contradicts
  the requirement that the app answer *when* rather than record what was told to it.

Retroactive rule edits are handled by freezing: a `StatementPayment` record
stores the close and due dates as they were computed at the time of payment, so
editing a card's cycle rule never rewrites the history of statements already paid.

## Data Model

```ts
type Card = {
  id: string;          // owner-chosen internal id, e.g. "kbank-visa"; immutable, used as KV key
  name: string;        // "KBank Visa Platinum"
  last4: string;       // "4821"
  location: string;    // "Krabi" | "Phichit" | "Bangkok" — free text, suggestions from existing values
  cycle: CycleRule;
  comment?: string;
  archived: boolean;   // cancelled cards stay for history but leave the dashboard
};

type CycleRule =
  | { kind: "offset"; closeDay: number; dueOffsetDays: number }  // closes 18th, due 15 days later
  | { kind: "fixed";  closeDay: number; dueDay: number };        // closes 18th, due on the 5th

type Purchase = {
  id: string;          // crypto.randomUUID(); ordering comes from the date, not the id
  cardId: string;
  date: string;        // "2026-09-15", purchase date in Asia/Bangkok
  amount: number;      // satang (integer), to avoid floating-point drift
  note: string;
};

type StatementPayment = {
  cardId: string;
  period: string;      // "2026-09" — the month the period's close date falls in
  paidAt: string;
  closeDate: string;   // frozen at payment time
  dueDate: string;     // frozen at payment time
};

type Statement = {      // derived, never persisted
  cardId: string;
  period: string;
  closeDate: string;
  dueDate: string;
  purchases: Purchase[];
  total: number;
  paid: boolean;
};
```

Both cycle rule kinds must be supported simultaneously; different cards in the
set use different conventions.

## Date Rules

All date logic lives in pure functions with no storage or DOM dependency, and
carries the bulk of the test suite.

- Timezone is fixed to Asia/Bangkok. Dates are plain `YYYY-MM-DD` strings; the
  `Date` object is not used for calendar arithmetic, to avoid timezone drift.
- Day-of-month clamping: a `closeDay` or `dueDay` of 31 resolves to 28 or 29 in
  February, and to 30 in 30-day months.
- `offset` rule: due date is the close date plus N calendar days. No clamping needed.
- `fixed` rule: the due day falls in the month after the close date when
  `dueDay <= closeDay`, and in the same month otherwise. Closing on the 18th with
  a due day of 5 means the 5th of the following month; closing on the 5th with a
  due day of 25 means the 25th of the same month.
- A statement period is half-open as `(previousClose, thisClose]`: a purchase
  made exactly on the close date belongs to that statement, not the next one.

## Architecture

```
src/
  lib/
    domain/
      types.ts        # Card, CycleRule, Purchase, StatementPayment, Statement
      date.ts         # YYYY-MM-DD arithmetic, clamping, validation
      cycle.ts        # CycleRule -> close and due dates for a period
      statement.ts    # slice purchases into statements, totals, paid state
      money.ts        # satang integer <-> THB display
    storage/
      repository.ts   # Repository interface + in-memory implementation for tests
      local.ts        # phase 1 implementation, localStorage
      http.ts         # phase 2 implementation, talks to the Worker
      index.ts        # factory selecting the implementation
  components/         # Lit elements: properties in, events out, no storage access
  routes/
    index.html|ts     # dashboard
    cards.html|ts     # card list, create and edit
    card.html|ts      # single card detail, ?id=<cardId>
```

Constraints that keep the storage seam honest:

- `domain/` imports nothing from `storage/` and never references `localStorage`
  or `fetch`.
- Components receive a repository as a property; they never construct one.

### Repository Interface

This interface is the only thing that differs between local and Cloudflare
deployments. Every method is a key lookup or a prefix scan, so it maps directly
onto both localStorage and Cloudflare KV without a query engine.

```ts
interface Repository {
  listCards(): Promise<Card[]>;
  getCard(id: string): Promise<Card | null>;
  saveCard(card: Card): Promise<void>;
  deleteCard(id: string): Promise<void>;

  listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]>;
  savePurchase(p: Purchase): Promise<void>;
  deletePurchase(cardId: string, id: string): Promise<void>;

  listPayments(cardId: string): Promise<StatementPayment[]>;
  savePayment(p: StatementPayment): Promise<void>;
  deletePayment(cardId: string, period: string): Promise<void>;
}
```

The phase 1 implementation stores one JSON value per entity in `localStorage`,
under the key shapes phase 2 uses in KV, prefixed with `cc:` because
localStorage is shared across the whole origin while a KV namespace is not:

```
cc:card:<cardId>
cc:purchase:<cardId>:<date>:<uuid>
cc:payment:<cardId>:<period>
```

A prefix scan is an iteration over `localStorage` keys; a key lookup is
`getItem`. Apart from that one leading prefix the key space is identical to the
KV key space, so phase 2 is a genuine drop-in rather than a translation, and the
export format is the same set of key-value pairs in both phases.

localStorage was chosen over IndexedDB deliberately. The dataset is small — on
the order of a dozen cards and a few hundred purchases per year, far inside the
5 MB budget — and IndexedDB exists in neither the Bun test runtime nor happy-dom,
so testing it would mean adding a fake implementation to test against something
no test could reach honestly. The `Repository` interface stays `async` regardless,
so nothing in the app depends on the synchronous nature of localStorage.

## User Interface

The existing stack is used as-is: `@kctools/bun-server`, Lit components, Pico
CSS. No routing library and no custom design system. Three pages, one query
parameter. `bun-server` 0.3.2 takes a directory of HTML documents and turns each
one into its own route and its own built page, which is what the three pages
below rely on.

### Dashboard (`/`)

Three panels, one per question the app exists to answer.

1. **Due next** — every active card's oldest unpaid statement, sorted by due
   date. Each row shows card name, last 4, location, close date, due date, total,
   and a Mark paid action. Rows are coloured by urgency: overdue, due within
   seven days, and everything else.
2. **Quick add purchase** — card, date (defaulting to today), amount, note. On
   save, the answer appears inline: which statement the purchase landed on and
   the date payment is due. This replaces a separate calculator page.
3. **By location** — cards grouped by location, each group showing its card count
   and next due date. Collapsed by default.

### Cards (`/cards`)

A table of id, name, last 4, location, a human-readable cycle summary ("closes
18th, due +15d"), and comment. Creation and editing share one form. A card may be
deleted only when it has no purchases; otherwise it is archived. The card `id` is
typed by the user and is immutable after creation, because it is the storage key.

### Card detail (`/card?id=<cardId>`)

Statements newest first, current period at the top. Each shows period, close
date, due date, its purchases, total, and paid state with Mark paid and Unmark
actions. Purchases are editable inline. Twelve periods are shown initially, with
a load-more action for older ones.

### Cross-cutting

Empty states name the next useful action. Amounts render as `฿1,234.56` from
satang. Dates render as `15 Sep 2026` and are entered as `YYYY-MM-DD`.

## Error Handling

- Repository calls are awaited rather than applied optimistically: a write that
  fails must never appear to have succeeded.
- Failures render as an inline Pico banner naming the failed action, with a retry.
- localStorage being unavailable or full (private window, storage disabled,
  quota exceeded) is detected at startup and on write, and reported plainly,
  rather than silently discarding data.
- Amounts are validated as positive integers in satang; dates are validated as
  real calendar dates before any arithmetic.

## Testing

- `bun test` throughout. `domain/` carries the substantive unit tests: cycle
  math, day clamping, period boundaries, the `(previousClose, thisClose]`
  rule, statement slicing, and totals.
- A single repository contract suite runs against both the in-memory and
  localStorage implementations, the latter under happy-dom's `localStorage`
  (verified working in this project), so the phase 2 HTTP implementation
  inherits a ready conformance suite.
- `bun test` needs a `test` script in `package.json`; there is none yet.

## Phases

### Phase 1 — local

The full application above, backed by localStorage. Usable offline with no
account and no network. JSON export and import ship in this phase: it is both the
migration path to phase 2 and the only backup against cleared browser storage.

### Phase 2 — Cloudflare Worker and KV

The frontend build output stays plain static assets with no server rendering.
The Worker serves those assets through its assets binding and handles `/api/*`.
Wrangler is already a dependency, so no second host is involved. The repository
factory selects `http.ts` via a build-time environment variable; no domain or
component code changes.

```
GET    /api/cards                          list with prefix "card:"
PUT    /api/cards/:id                      put  card:<id>
DELETE /api/cards/:id
GET    /api/cards/:id/purchases?from&to    list with prefix "purchase:<cardId>:"
POST   /api/cards/:id/purchases            put  purchase:<cardId>:<date>:<uuid>
DELETE /api/cards/:id/purchases/:pid
GET    /api/cards/:id/payments             list with prefix "payment:<cardId>:"
PUT    /api/cards/:id/payments/:period
DELETE /api/cards/:id/payments/:period
```

Authentication is handled by Cloudflare Access in front of the whole Worker: no
application code in this phase, and when staff are added later it is an entry in
the Cloudflare dashboard. The `Cf-Access-Authenticated-User-Email` header is
available if a "recorded by" field is wanted at that point.

Known KV characteristics, accepted deliberately: writes are eventually consistent
within seconds, so simultaneous edits from two devices can overwrite each other —
acceptable for one user, and a risk that materialized statements would have
increased rather than reduced. Prefix `list` pages at 1000 keys; the `from` and
`to` parameters already in the repository interface cover that as purchase
history grows.

## Verified Assumptions (2026-09-21)

Checked against the actual toolchain before planning, not assumed:

- `indexedDB` is `undefined` in the Bun 1.4.2 runtime, and `@happy-dom/global-registrator`
  20.14.5 does not define it either. This is what moved phase 1 to localStorage.
- happy-dom does provide a working `localStorage` and `structuredClone`.
- `crypto.randomUUID` is available in Bun, so no id dependency is needed.
- `@kctools/bun-server` 0.3.2 has no `--mode` flag; `dev` and `build` take an
  HTML file or a directory. A probe directory of three HTML documents built to
  three flat static pages plus their chunks, confirming the three-page layout
  and a static output the Worker's assets binding can serve unchanged.
- `wrangler` 4.135.0 is a devDependency; no `wrangler.toml` exists yet, which is
  a phase 2 task.
- Pico CSS is installed but not yet imported by any page.

### Phase 3 — staff accounts (not designed)

Deferred. The data model reserves nothing for it beyond what Cloudflare Access
provides; a "recorded by" field on `Purchase` is the expected shape.
