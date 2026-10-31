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
handing over to `bun-server build`; the bundler inlines both, and Settings > About
shows them alongside a link to the repository and to the commit. Set either
variable yourself to override what git reports. A dev server inlines nothing,
so About there reads as a development build with no build time.

## Pages

- `/` — Home. *Needs you* comes first: purchase lists waiting for the spender's
  reply, overdue bills and draft lists, or *All caught up* when there are none.
  Under it, *Ready to use* lists the cards that can take a purchase (see *Which
  cards can take a purchase* below), each with its group's room, its close and due
  dates, sortable by most room, longest to close or latest due. Ticking cards
  shows a bar at the bottom with how many are selected, *Clear*, and *Enter
  amounts*, which opens a new purchase list for those cards in the order they
  were ticked.
- `/list/new?card=<id>` (once per card) — a new purchase list for those cards.
  Enter an amount per card and the purchase date, with warnings that never block
  (over the group's room, room held by lists waiting for the spender, a shared
  limit, an overdue bill, the close date, a date that has passed). *Review* shows
  the dated table with *Copy text* and *Save image* (on a phone that can share
  files, the image goes to the share sheet; elsewhere it downloads), then *Mark
  as sent* or *Save as draft instead*.
- `/list/draft?id=<list id>` — the same two steps for a stored draft, which names
  any card that can no longer take purchases and leaves it out, plus *Delete
  draft*, which deletes it at once.
- `/list/reply?id=<list id>` — the spender's reply to a waiting list: mark each
  line *Made* or *Not made*, correct the real amount, optionally move the
  not-made lines to a draft for the next day, and save. *Cancel list* deletes the
  waiting list at once, so it stops holding room; nothing is bought.
- `/list/view?id=<list id>` — a saved list, read-only: what was bought.
  Each list page opened on a list in another state links to that list's own
  page.
- `/transactions` — a placeholder until the Transactions page arrives; the + and
  Payment buttons open it for now.
- `/cards` — the card registry and the limit groups, each list searchable,
  filterable, sortable and foldable. Cards and limit groups are added and edited
  in a dialog. When adding or editing a card, you choose its physical location from a dropdown: one of Bangkok,
  Phichit, or Krabi, and can mark it as a supplementary card (บัตรเสริม) with its
  own cardholder. Cards
  already stored in this browser from before the locations were fixed are reset
  to Bangkok once at startup; the page then names those cards, once, with a
  Dismiss button, so you can pick the correct location by hand.
- `/settings` — language and theme, which places take new purchases, saving and
  restoring a backup, and resetting all data. The old `/backup` address redirects here.
- `/card?id=<cardId>` — one card's statements, purchases, and paid state, with
  paging. A month with no purchases in it starts collapsed, so a long run of
  unused months stays one line each. Each purchase can be edited in place (date,
  amount and note; the card stays fixed) or deleted. Its add/edit purchase
  dialog stays until phase 5 of the redesign replaces the card page; new
  purchases otherwise come from purchase lists.

## Which cards can take a purchase

The answer belongs to where a card is kept, not to the card. The *Purchases*
section on `/settings` ticks the places that take new purchases; only unarchived
cards kept in a ticked place, in a limit group, appear in Home's *Ready to use*.
Every card still appears everywhere else, including the overdue bills in *Needs
you*.

Out of the box only Krabi is ticked, which reproduces the rule that was in force
before: purchases were only ever entered against the Krabi cards. Unticking every
place is kept as a real answer, and the purchase form then says that no card can
take a purchase and *Ready to use* says that no card can be used and points at
Settings.

## Limit groups and how much room is left

A limit group is a pool of credit, not a property of one card. Every card
points at a group, and two cards that share a limit — one account with two
physical cards, say — point at the same group, so there is one number to watch
for both of them rather than two that would drift apart.

A group's available credit is its limit less what is still owed on every
closed statement, plus the whole of the open period — the cycle still being
spent on right now. Money spent this cycle leaves the limit the moment it is
spent; it comes back only as payments are recorded against the statement it
landed on, once that statement has closed. A statement can be paid in parts —
*Mark paid* asks for the amount and the date, starting at what is left and
today — and each payment returns exactly its own amount. The statement counts
as paid once its payments cover its total.

An archived card still weighs on the group it shares. Archiving a card retires
it from new purchases and from Home, not from what it already owes, so its
unpaid statements keep counting against the pool even though the card itself no
longer appears in *Ready to use*. A purchase list already sent to the spender
holds its amounts against the room too, until its reply is recorded.

Home's *Ready to use* lists only the cards that can take a purchase (see above),
each showing the close and due dates of the statement a purchase made today would
land on. Those are deliberately not the dates of the bill an overdue card shows
under *Needs you*: that answers what has to be paid, this answers what happens if
you spend today, and on a card with an overdue statement the two disagree — both
are correct for the question they answer.

A purchase entered for more than a group's remaining credit is still saved.
The app is a record of what happened, not a gate on what is allowed, and a
stored limit can itself be stale or wrong; refusing the entry would just mean
a real purchase goes unrecorded. The confirmation names the amount it went
over by instead.

A card stored before this feature existed has no group at all. It shows as
unassigned in the card table and is left out of *Ready to use* until it
is edited once and a group is chosen — the card form will not save a card
without one.

## How statements work

Each card carries a billing cycle rule: either *closes on day N, due M days
later* or *closes on day N, due on day M*. Statements are never stored — they
are computed from that rule, so a period's close date, due date, purchases, and
total are always derived from the card as it is now. Only a statement with a
payment against it leaves a record behind: one record per card and period,
listing every payment toward it. The first payment freezes the close and due
dates, so editing a cycle rule can never rewrite settled history. A record saved
before partial payments existed has no list of payments and reads as one
payment of the whole total.

A purchase dated exactly on the close date belongs to that statement, not the
next one.

## Where the data lives

Everything lives in this browser's `localStorage`, under keys shaped like
`cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`,
`cc:payment:<cardId>:<period>`, `cc:limitgroup:<id>` and `cc:list:<id>` (a
purchase list, with its lines and status; `/list/draft`, `/list/reply` or
`/list/view` opens it by that status), plus `cc:settings` for the purchase
places. A purchase saved from a spender's reply takes the id `<list id>-<n>`
instead of a uuid, and a draft moved from it `<list id>-<n>` too, so a retried
save overwrites what a failed one wrote instead of doubling it. The old dashboard's `cc:batch-start` is no longer read
or written; a leftover one stays until a reset in Settings clears it. Those shapes hold
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

The interface is available in English and Thai. The picker is in the *Display*
panel on `/settings`, next to the theme picker (Match device, Light or Dark);
switching language re-renders the page in place — no reload, and nothing typed
into an open form is lost. Both choices are remembered in this browser's
`localStorage`, under `cc:lang` and `cc:theme`, so they survive a reload and future
visits; they are not part of a backup, and a reset leaves them alone. A first
visit with nothing saved follows the first of the browser's own languages that the
app speaks, in the browser's order, and falls back to Thai — these are Thai company
cards in baht on Asia/Bangkok dates, so Thai is the more likely daily language.

Dates render as `dd MMM yyyy` — a zero-padded day and a Gregorian year — in both
languages, for example `05 Sep 2026` and `05 ก.ย. 2026`. This is deliberately not
`Intl`: a Thai locale (`th-TH`) would default to Buddhist Era years, printing `2569`
where a bank statement says `2026`, and these dates are reconciled against exactly
those statements. Money is likewise never translated or reformatted per locale;
`฿1,234.56` reads the same in either language.

Text a user typed in — a card's name, its comment, a purchase's note — is never
translated. Only the application's own wording comes from the catalog.

One consequence of avoiding `Intl` is worth knowing: card ids, where Home breaks a tie
between cards in *Ready to use* and *Needs you*, sort by plain UTF-16 code-unit order,
not Thai collation, and the two can disagree. (Card and group names on `/cards` are
compared with `Intl.Collator` instead, so this applies to ids only.)
A Thai dictionary treats a leading vowel like เ as following the consonant it is
pronounced with, not preceding it, so `เกา` ("to scratch") collates as if it
were spelled starting with ก and sorts *before* `ขาว` ("white") — confirmed with
`Intl.Collator("th")`. Plain code-unit order gets this backwards: เ's code point
(`U+0E40`) is higher than every consonant's, so `เกา` sorts *after* `ขาว` instead.
As it happens, card ids are short Latin codes (`KB-F`, `UOB-K`), which land in the
same order under both code-unit comparison and real Thai collation, so this gap is
latent rather than visible in the UI today; it would only surface for an id written
in Thai with this shape. This is a known, deliberate trade-off rather
than a bug: fixing it needs `Intl.Collator`, and using any `Intl` API on `th-TH` risks
pulling in the same Buddhist-era year handling the date rendering above exists to
avoid.

## Product requirements

What the app must keep doing, the rules behind its numbers, the data it already
holds, the decisions made along the way, and what is still open for the coming
redesign are in [`PRD.md`](PRD.md), and in Thai in [`PRD_TH.md`](PRD_TH.md).
Read it before refactoring or redesigning anything.

## Changelog

What changed at each stage, and the decisions behind it, is in [`CHANGELOG.md`](CHANGELOG.md).
