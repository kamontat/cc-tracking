# cc-tracking

Tracks company credit cards: where each card physically is, when its statement
closes and payment is due, and which statement a purchase lands on.

## Running it

```bash
bun install
bun run dev        # http://127.0.0.1:3000
bun run build      # static pages into dist/
bun run preview    # serve the build
bun test           # the whole suite
bun run typecheck  # tsc --noEmit
bun run check      # biome check
```

`bun run build` goes through `scripts/build.ts`, which stamps
`BUN_PUBLIC_COMMIT_SHA` and `BUN_PUBLIC_BUILT_AT` into the environment before
handing over to `bun-server build`; the bundler inlines both, and the footer on
every page shows them alongside a link to the repository and to the commit. Set
either variable yourself to override what git reports. A dev server inlines
nothing, so the footer there reads `dev` and the time the page was opened.

## Pages

- `/` — a workspace for entering a pile of receipts. The purchase form is always
  open, and offers only the cards that may take one; see *Which cards can take a
  purchase* below. After each add it keeps the card and date and clears the
  rest. Under it, *This sitting* lists what was entered since *Start new batch*
  was last pressed, latest first, and survives reloads; purchases saved before
  entry times were recorded never show there. Beside it, *Purchases by date*
  counts purchases, their total and the cards used across every card (archived
  ones included) for a preset or custom range of purchase dates, then *Due next*
  and *Can spend now*.
- `/cards` — the card registry and the limit groups, each list searchable,
  filterable and sortable, and each section foldable. When adding or editing a
  card, you choose its physical location from a dropdown: one of Bangkok,
  Phichit, or Krabi, and can mark it as a supplementary card (บัตรเสริม) with its
  own cardholder. Cards
  already stored in this browser from before the locations were fixed are reset
  to Bangkok once at startup; the page then names those cards, once, with a
  Dismiss button, so you can pick the correct location by hand.
- `/settings` — which places take new purchases, saving and restoring a backup,
  and resetting all data. The old `/backup` address redirects here.
- `/card?id=<cardId>` — one card's statements, purchases, and paid state, with
  paging. A month with no purchases in it starts collapsed, so a long run of
  unused months stays one line each. Each purchase can be edited in place (date,
  amount and note; the card stays fixed) or deleted.

## Which cards can take a purchase

The answer belongs to where a card is kept, not to the card. The *Purchases*
section on `/settings` ticks the places that take new purchases; only unarchived
cards kept in a ticked place appear in the dashboard's purchase form and in
*Can spend now*. Every card still appears everywhere else, including the due
list.

Out of the box only Krabi is ticked, which reproduces the rule that was in force
before: purchases were only ever entered against the Krabi cards. Unticking every
place is kept as a real answer, and the purchase form then says that no card can
take a purchase and points at Settings.

## Limit groups and how much room is left

A limit group is a pool of credit, not a property of one card. Every card
points at a group, and two cards that share a limit — one account with two
physical cards, say — point at the same group, so there is one number to watch
for both of them rather than two that would drift apart.

A group's available credit is its limit less every purchase sitting on a
statement that has not been marked paid, and that includes the open period —
the cycle still being spent on right now. Money spent this cycle leaves the
limit the moment it is spent; the only way it comes back is marking the
statement it landed on as paid, and doing that returns exactly that
statement's total. A payment records no amount of its own, so paying something
other than the full statement is not representable — a known limit of this
model, not an oversight.

An archived card still weighs on the group it shares. Archiving a card retires
it from new purchases and from the dashboard, not from what it already owes,
so its unpaid statements keep counting against the pool even though the card
itself no longer appears in the panel below.

The dashboard's *Can spend now* panel lists only the cards that can take a
purchase (see above), each showing the close and due dates of the statement a
purchase made today would land on. Those are deliberately not the dates *Due
next* shows: that list answers what has to be paid, this one answers what
happens if you spend today, and on a card with an overdue statement the two
disagree — both are correct for the question they answer.

A purchase entered for more than a group's remaining credit is still saved.
The app is a record of what happened, not a gate on what is allowed, and a
stored limit can itself be stale or wrong; refusing the entry would just mean
a real purchase goes unrecorded. The confirmation names the amount it went
over by instead.

A card stored before this feature existed has no group at all. It shows as
unassigned in the card table and is left out of the dashboard's panel until it
is edited once and a group is chosen — the card form will not save a card
without one.

## How statements work

Each card carries a billing cycle rule: either *closes on day N, due M days
later* or *closes on day N, due on day M*. Statements are never stored — they
are computed from that rule, so a period's close date, due date, purchases, and
total are always derived from the card as it is now. Only a paid statement
leaves a record behind, and that record freezes the close and due dates it was
paid against, so editing a cycle rule can never rewrite settled history.

A purchase dated exactly on the close date belongs to that statement, not the
next one.

## Where the data lives

Everything lives in this browser's `localStorage`, under keys shaped like
`cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`,
`cc:payment:<cardId>:<period>`, and `cc:limitgroup:<id>`, plus `cc:settings`
for the purchase places and `cc:batch-start` for when *This sitting* began. The
batch start is working state for this browser, so backups leave it out. Those shapes hold
as written for an ordinary card id, date, and uuid; each segment is actually
percent-encoded, so a card id containing `:` or other reserved characters
produces a key that looks a little different from the documented shape,
though it still round-trips correctly. Nothing is sent to a server: the
Cloudflare Worker only serves the built pages, so data is not shared between
browsers or devices except through a backup.

A card's location is stored as one of three lowercase keys: `bangkok`,
`phichit`, or `krabi`. These are the display-neutral keys; when a card is
shown on screen or in the UI, the location goes through a display function
that renders them as "Bangkok", "Phichit", and "Krabi".

Use *Save a copy* on `/settings` as your backup: *Download file* saves indented
JSON, and *Copy text* puts the same backup on the clipboard as compact JSON.
*Restore a copy* takes a file or pasted text. If this browser already holds
records, it shows what is here next to what is in the copy and asks: *Merge*
keeps what is here and adds the copy's records, updating any it shares, while
*Replace* deletes everything here first, settings included. An empty browser
restores straight away. *Reset* on the same page deletes every record and
setting after showing how many of each will go. Backups are version 2 and carry
`limitGroups` alongside the three lists that were already there; a version 1
file — one written before limit groups existed — is rejected outright, since
there is no code to invent groups for it. A file that is not valid JSON, is
missing its expected lists, has a limit group/card/purchase/payment with the
wrong shape, or was written by a different backup version is rejected with a
message naming what was wrong, and nothing is imported. A backup whose card
names any location other than the three known places is rejected by its
position in the file — for instance,
a card might be rejected with
`That backup's card #1 has a location that is not bangkok, phichit, or krabi.`
— and nothing is imported. Import itself is not atomic, though: it writes
limit groups, then cards, then purchases, then payments one at a time —
groups before cards, so a card's limit group always has something to point
at — and a failure partway through (for instance, storage filling up) can
leave some records imported and others not.

## Language

The interface is available in English and Thai. The picker sits in the nav on every
page; switching it re-renders the current page in place — no reload, and nothing typed
into an open form is lost. The choice is remembered in this browser's `localStorage`
under `cc:lang`, so it survives a reload and future visits. A first visit with nothing
saved yet defaults to Thai, unless the browser's own language list asks for English —
these are Thai company cards in baht on Asia/Bangkok dates, so Thai is the more likely
daily language and English is opted into, not the other way around.

Dates render as `dd MMM yyyy` — a zero-padded day and a Gregorian year — in both
languages, for example `05 Sep 2026` and `05 ก.ย. 2026`. This is deliberately not
`Intl`: a Thai locale (`th-TH`) would default to Buddhist Era years, printing `2569`
where a bank statement says `2026`, and these dates are reconciled against exactly
those statements. Money is likewise never translated or reformatted per locale;
`฿1,234.56` reads the same in either language.

Text a user typed in — a card's name, its comment, a purchase's note — is never
translated. Only the application's own wording comes from the catalog.

One consequence of avoiding `Intl` is worth knowing: the location groups on the
dashboard sort by plain UTF-16 code-unit order, not Thai collation, and the two can
disagree. A Thai dictionary treats a leading vowel like เ as following the consonant
it is pronounced with, not preceding it, so `เกา` ("to scratch") collates as if it
were spelled starting with ก and sorts *before* `ขาว` ("white") — confirmed with
`Intl.Collator("th")`. Plain code-unit order gets this backwards: เ's code point
(`U+0E40`) is higher than every consonant's, so `เกา` sorts *after* `ขาว` instead.
As it happens, the app's three actual locations — Bangkok, Phichit, and Krabi — land
in the same order under both code-unit comparison and real Thai collation, so this
gap is latent rather than visible in the UI today; it would only surface if a location
were added whose name has this shape. This is a known, deliberate trade-off rather
than a bug: fixing it needs `Intl.Collator`, and using any `Intl` API on `th-TH` risks
pulling in the same Buddhist-era year handling the date rendering above exists to
avoid.

## Features

The business requirements, functional requirements and user stories for
everything shipped so far are in [`FEATURES.md`](FEATURES.md), and in Thai in
[`FEATURES_TH.md`](FEATURES_TH.md).

## Changelog

What changed at each stage, and the decisions behind it, is in [`CHANGELOG.md`](CHANGELOG.md).
