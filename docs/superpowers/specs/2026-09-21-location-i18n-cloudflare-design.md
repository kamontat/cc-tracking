# cc-tracking — Location choices, Thai/English, Cloudflare deployment

Date: 2026-09-21
Status: Approved for implementation planning
Follows: `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`

## Problem

Three pieces of feedback came out of using the phase 1 site for real:

1. **Location is free text.** The design always named exactly three places — the
   company office in Krabi, the owner's mother's house in Phichit, and the owner
   himself in Bangkok — but the field accepts anything, so a typo silently
   creates a fourth location and splits the dashboard's grouping.
2. **The interface is English only.** The people using it read Thai day to day.
3. **It only runs locally.** Phase 2 was designed but never built, so the app
   cannot be reached from another device and the data lives in one browser.

These are three independent changes. They share one spec because they land in
sequence and the first one constrains the second, but each can be dropped
without reworking the others.

## Scope

In scope:

- `Card.location` becomes a closed set of three values, with a one-time
  migration for anything already stored.
- Full English and Thai interfaces, switchable at runtime and remembered.
- Phase 2 as already designed: a Cloudflare Worker serving the static build and
  an `/api/*` surface backed by KV, with Cloudflare Access in front.

Out of scope: adding or renaming locations through the interface, any third
language, translation of user-entered data (card names, comments, purchase
notes stay exactly as typed), and phase 3 staff accounts.

## Phase A — Location as a closed set

### Model

```ts
export const LOCATIONS = ["bangkok", "phichit", "krabi"] as const;
export type Location = (typeof LOCATIONS)[number];
```

`Card.location` changes from `string` to `Location`. The stored value is the
lowercase key, never a display label — the label is looked up per language in
phase B, so a card saved in Thai and read in English shows the right word. This
is why phase A must land before phase B rather than after.

A new `src/lib/domain/location.ts` holds the set, `DEFAULT_LOCATION =
"bangkok"`, and `toLocation(value: unknown): Location | null`.

### Migration

Unrecognised stored values are fixed once at startup, not coerced on every read.
Read-time coercion would leave the type claiming something about the data on
disk that is not true, and would quietly re-fix the same rows forever.

`migrateLocations(repo, storage)` runs from `bootstrap` in `src/lib/ui/page.ts`
before the page renders. It reads every card, rewrites any location that
`toLocation` rejects to `DEFAULT_LOCATION`, and writes the affected card names
to `cc:migration:location`. It is idempotent: a second run finds nothing to fix.
The `/cards` page reads that key on load, shows a dismissible notice naming the
cards whose location was reset so they can be corrected, and clears the key.

Migration failure must not take the page down — a card that cannot be rewritten
is logged and skipped, and the page still renders.

### Interface and validation

`cc-card-form` replaces its `<input list="cc-locations">` plus `<datalist>` with
a `<select>` over `LOCATIONS`. The component's `locations` property and the
`[...new Set(cards.map(c => c.location))]` expression that feeds it in
`src/routes/cards.ts` both go away — the set is now fixed, not derived from
existing data.

`cc-location-groups` keys on `Location`. Its `row.card.location || "Unknown"`
fallback is deleted; the type makes the empty case unreachable.

In `src/lib/storage/transfer.ts`, `cardProblem` currently accepts any non-empty
string for `location`. It gains a check that the value is one of the three and
rejects the backup naming the offending card, matching how the function already
reports a bad cycle. Import stays all-or-nothing about validation: nothing is
written if any record is malformed.

`src/lib/storage/contract.ts` seeds `location: "Krabi"` and asserts on
`"Bangkok"`; both become the lowercase keys.

## Phase B — English and Thai

### Approach

A small hand-written catalog plus a Lit reactive controller. `@lit/localize` was
considered and rejected: it adds an extraction CLI, XLIFF files, and a second
place strings live, which earns its weight at many locales rather than two.
Reloading the page on a language switch was also considered and rejected: it
discards a half-filled card form, and under phase C it refetches everything from
KV for a purely cosmetic change.

### Structure

```
src/lib/i18n/
  catalog.ts     Catalog type derived from the English catalog
  en.ts          the source of truth for the key set
  th.ts          must satisfy Catalog, so a missing key is a type error
  index.ts       getLocale, setLocale, subscribe, t
  controller.ts  LocaleController (a Lit ReactiveController)
src/components/cc-lang-switch.ts
```

Keys are flat and dotted (`cards.title`, `form.last4.error`). `t(key, params?)`
substitutes `{name}` placeholders. Deriving `Catalog` from `en.ts` means the
Thai catalog cannot silently drift: an unfilled key fails `bun run typecheck`.

### Selecting a language

On load: a saved `cc:lang` wins; otherwise a `navigator.language` beginning with
`en` selects English; otherwise Thai. Thai is the default because the data is
Thai company cards in baht on Asia/Bangkok dates.

`setLocale` writes `cc:lang`, sets `document.documentElement.lang`, and notifies
subscribers. Components install `LocaleController`, which subscribes on connect,
calls `requestUpdate` on change, and unsubscribes on disconnect. The three
routes subscribe directly and re-run their existing `paint()`.

A failed read or write of `cc:lang` must not break language selection — the
locale falls back to the detected one and the interface still works.

### Every string, including the ones in errors

Seven components and three routes carry visible text. Less obvious: several
user-visible sentences are produced far from the interface, as thrown `Error`
messages that end up in `cc-error-banner` — `StorageUnavailableError` in
`src/lib/storage/index.ts`, every `Error` in `transfer.ts`, the
`fallbackMessage` strings passed to `createPageState`, and the duplicate-id
message in `src/routes/cards.ts`.

Those cannot be translated where they are thrown without dragging the catalog
into the storage layer. Instead the validation helpers in `transfer.ts` return a
`{ key, params }` pair rather than a finished English sentence, and the thrown
errors carry that pair; the page translates at the point it renders the banner.
`StorageError` messages that only reach `console.error` stay plain English —
they are for whoever is debugging, not for the user.

The static nav, `<title>`, and headings in `src/routes/*.html` are filled on
boot from the catalog by id.

### Formatting

Dates render as `dd MMM yyyy` in both languages, with a Gregorian year: `21 Sep
2026` in English, `21 ก.ย. 2026` in Thai. Never Buddhist Era — 2569 would not
match the bank statement the number is being reconciled against.

The day is zero-padded to two digits: `05 Sep 2026`, not `5 Sep 2026`. This is a
change from what ships today, so every date on every page shifts by one
character — deliberate, for a column of dates that lines up.

`displayDate` in `src/lib/domain/date.ts` already produces this shape from a
hand-written `MONTH_NAMES` array. It gains a locale parameter, a second array of
Thai abbreviated month names, and the existing `pad` helper applied to the day.
`Intl` is deliberately not used: it would pull in locale data and, for `th-TH`,
default to the Buddhist calendar that has to be suppressed anyway.

Money needs no translation at all. `formatAmount` produces `฿1,234.56` —
the same symbol, digits, grouping, and decimal mark in both languages — so
`src/lib/domain/money.ts` is untouched by this phase.

### Thai copy

Drafted as part of implementation, then reviewed in one pass over `th.ts`. The
terms worth a second look are *statement*, *billing cycle*, *close date*, *due
date*, and *satang*; they will be flagged in the file.

## Phase C — Cloudflare Worker and KV

This builds the phase 2 already designed in the 2026-09-15 spec, unchanged in
shape. The Worker exists (`cc-tracking`); no KV namespace exists yet.

### Files

```
wrangler.toml            name = "cc-tracking", assets binding, KV binding
worker/index.ts          /api/* handlers; everything else -> env.ASSETS.fetch
src/lib/storage/http.ts  Repository implemented over /api
```

`wrangler.toml` binds `./dist` as `ASSETS` with `html_handling =
"auto-trailing-slash"`, so `/cards` serves `cards.html` from the existing
three-page static build with no change to how the site is built. `not_found`
handling stays the default 404; this is not a single-page app. The KV namespace
binds as `CC_KV` with a placeholder id to be filled after creation.

The API is exactly the nine routes in the 2026-09-15 spec. KV keys are the
documented shapes without the `cc:` prefix (`card:<id>`,
`purchase:<cardId>:<date>:<uuid>`, `payment:<cardId>:<period>`), with each
segment percent-encoded the same way `local.ts` encodes it — otherwise a card id
containing `:` round-trips through one store and not the other.

`createRepository` in `src/lib/storage/index.ts` stays the single switch: it
returns the HTTP repository when `BUN_PUBLIC_CC_STORAGE` is `http` and the
localStorage one otherwise. `@kctools/bun-server` passes `env: "BUN_PUBLIC_*"`
to `Bun.build`, so the value is substituted into the bundle at build time and
the unused implementation is dropped. No component, route, or domain module
changes.

### Deletes must still cascade

`deleteCard` cascades to purchases and payments, and the contract has a test
that a card id which is a prefix of another (`abc` vs `abc:def`) does not take
the longer one's records with it. KV prefix listing makes that trap easy to fall
into; the Worker's delete must scan `purchase:<encoded cardId>:` — with the
trailing colon and the encoding applied — not the bare id.

### Authentication and limits

Cloudflare Access sits in front of the whole Worker, covering `/api/*` as well
as the pages. It is dashboard configuration, not application code. The
`Cf-Access-Authenticated-User-Email` header is available later if a "recorded
by" field is wanted.

KV's known characteristics are accepted as the 2026-09-15 spec accepted them:
writes are eventually consistent within seconds, so two devices editing at once
can overwrite each other, and prefix listing pages at 1000 keys, which the
existing `from`/`to` parameters on `listPurchases` already cover.

### Operating it

`package.json` gains a `deploy` script (build, then `wrangler deploy`) and a
`cf:dev` script. The README gains a deployment section with the commands to run
in order: `wrangler login`, `wrangler kv namespace create`, paste the returned
id into `wrangler.toml`, `wrangler deploy`, then add the Access policy. Those
commands are run by the repository owner, not as part of implementation.

## Testing

Phase A: unit tests for `toLocation`; a migration test over a seeded repository
proving unknown values are rewritten once, that a second run is a no-op, and
that the affected names are recorded; a `transfer.ts` test that a backup with an
unrecognised location is rejected and names the card.

Phase B: a test asserting the Thai catalog covers every English key — the one
test that stops the catalogs drifting; `t` interpolation; the selection order
(saved, then `navigator.language`, then Thai) including a `cc:lang` read that
throws; and one component test that re-renders on a locale change without a
reload. `displayDate` is asserted in both languages, with an explicit case
pinning `21 ก.ย. 2026` rather than a Buddhist Era year, and a single-digit day
case pinning `05 Sep 2026`. The existing `date.test.ts` expectations for
unpadded days are updated, not deleted.

Phase C: `repositoryContract` runs against `http.ts` with a fetch shim over the
Worker handler backed by an in-memory KV, so the HTTP and localStorage
implementations are proven interchangeable against the same suite that already
covers the prefix-collision and cascade cases.

## Sequence and risks

A, then B, then C. A precedes B because location labels become catalog keys.
C is last because it touches no interface text and so cannot collide with B.

Open risks, to be resolved during planning or early implementation:

- **Assets binding vs. the three-page build.** The 2026-09-15 spec verified the
  build produces three flat HTML pages plus chunks, which the assets binding
  should serve unchanged, but that has not been tested against a real deploy.
- **String churn.** Phase B rewrites nearly every user-visible line; running it
  concurrently with any other phase would produce avoidable conflicts.

## Verified during design

- `@kctools/bun-server` 0.3.2 sets `env: "BUN_PUBLIC_*"` on its `Bun.build`
  call, so a `BUN_PUBLIC_`-prefixed variable is inlined at build time. This is
  what settles how the repository implementation is selected.
- `displayDate` already renders `d MMM yyyy` from a literal month-name array,
  and `formatAmount` already renders `฿1,234.56` without `Intl`. Adding Thai is
  a second array plus day padding, not a formatting rewrite.

## Assumptions

- Thai dates use Gregorian years in `dd MMM yyyy`, not Buddhist Era.
- Card names, comments, and purchase notes are never translated.
- The three locations are fixed in code; adding a fourth is a code change, which
  is acceptable because the set describes physical places that rarely change.
- The phase 1 dataset is small enough that the location migration can read and
  rewrite every card at startup without a visible delay.
