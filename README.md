# cc-tracking

Tracks company credit cards: where each card physically is, when its statement
closes and payment is due, and which statement a purchase lands on.

## Running it

```bash
bun install
bun run dev        # http://localhost:4321
bun run build      # static pages into dist/
bun run preview    # serve the build
bun run test       # the whole suite (Vitest)
bun run check      # astro check, then biome check
bun run format     # biome fixes and formatting
```

The site is built with [Astro](https://astro.build/) from
[bun-astro-template](https://github.com/kamontat/bun-astro-template): each page is
`src/pages/<path>.astro`: `src/layouts/AppLayout.astro` (over
`src/layouts/BaseLayout.astro`) holding one Svelte island, which renders the
reader's data in the browser. Components are Astro and Svelte in
`src/components/{atoms,molecules,organisms}/`.

`astro.config.ts` stamps `PUBLIC_COMMIT_SHA`, `PUBLIC_BUILT_AT`,
`PUBLIC_ENVIRONMENT`, `PUBLIC_BRANCH` and `PUBLIC_PR_NUMBER` into the environment
before the build starts; Vite inlines them all. Settings > About shows the
commit, build time and branch alongside a link to the repository and to the commit.
The environment (`local` unless a deploy workflow sets `preview` or `production`)
tints the header and marks the tab title and brand — `(local)`, `(pr-<n>)` on a
preview — so no build is mistaken for production, which carries no mark. Set any
of these variables yourself to override what git reports. A dev server ignores
them, so About there reads as a development build with no build time, marked
`(dev)`.

## Deploy

The site is static assets on Cloudflare (`wrangler.jsonc` serves `dist/`). A push
to `main` deploys production at https://cc-tracking.kc.in.th, and each pull request
gets a preview at `https://pr-<n>-cc-tracking.kcinth.workers.dev`.
No old address redirects: a retired page is a 404.
Google Tag Manager loads only on production, where the deploy sets `PUBLIC_GTM_ID`.

## Pages

Every address and query key is listed in [`ENDPOINTS.md`](ENDPOINTS.md).

- `/`, `/owed` and `/ready` — Home's three tabs, one at a time on every screen.
  _Needs you_ (`/`) comes first: overdue bills, planned payments that are
  late, purchase lists waiting for the spender's reply, planned payments due in
  the next three days, and draft lists, or _All caught up_ when there are none.
  Each row opens in place with what it needs: _Pay_ and _Open card_ on an overdue
  bill, _Paid_ and _Delete_ on a planned payment, _Record reply_ and a two-step
  _Confirm_ on a waiting list, _Continue_ and _Delete_ on a draft. _Owed_
  (`/owed`) lists every card that owes, with _Pay_ on each bill, which opens the
  card's panel on its pay form. _Ready to use_ (`/ready`) lists every card that
  can take a purchase (see _Which cards can take a purchase_ below), sorted by
  room. A card opens in its panel over the tab (`?card=<id>`).
- `/transactions` and `/transactions/lists` — Transactions' two tabs, _Ledger_ and
  _Lists_, one at a time on every screen. The ledger lists purchases and payments,
  with an _Upcoming_ section above it for planned payments and waiting lists; a
  purchase's _Open card_ opens the card's panel (`?card=<id>`). _Lists_ holds
  every purchase list; a list opens in its panel (`?list=<id>`) with its lines,
  _Continue_ or _Record reply_, _Merge_, _Delete_ or _Confirm_, and _+ Add list_
  starts a new one.
- `/transactions/lists/new?cards=<id>` (once per card) — a new purchase list:
  each card's amounts in its add-a-card sheet, with warnings that never block
  (over the group's room, with _Lower to_ the room left; room held by lists
  waiting for the spender; a shared limit; an overdue bill; the close date; a date
  that has passed). _Review_ shows the dated table with _Copy text_ and _Save
  image_ (on a phone that can share files, the image goes to the share sheet;
  elsewhere it downloads), then _Mark as sent_; _Save as draft_ keeps it for
  later. A save opens the list in its panel on the _Lists_ tab.
- `/transactions/lists/edit?list=<list id>` — a draft in the same builder (any
  card that can no longer take purchases is named and left out, and _Delete
  draft_ deletes it at once), or the spender's reply to a waiting list: mark each
  line _Made_ or _Not made_, correct the real amount, optionally move the
  not-made lines to a draft for the next day, and save. _Cancel list_ deletes the
  waiting list at once, so it stops holding room; nothing is bought. A saved list
  has no edit page: it says so and links to its panel.
- `/cards` and `/cards/limits` — Cards' two tabs, _Cards_ and _Limits_, one at a
  time on every screen. The cards are searchable, filterable and sortable, and a
  card opens in its panel
  (`?card=<id>`): a hero with the room left in its group, what it owes, the next
  bill and any credit, then its statements, which open to the purchases on them
  and the payment parts that paid them; each purchase can be edited (date, amount
  and note; the card stays fixed) or deleted. _Add purchase_, _Pay_ and _Edit_
  (the card form: name, id, last 4, cycle, limit group, where it is kept, and
  whether it is a supplementary card (บัตรเสริม) with its own cardholder) open in
  the panel, and _+ Add card_ opens a blank card form there. A payment dated after
  today is a planned payment. The ⋯ menu holds _Archive card_ (or _Unarchive
  card_) and, while the card has no purchases and is on no open list, _Delete
  card_. The limit groups are searchable, filterable by holder and
  sortable; a group opens in its panel (`?limit=<id>`), where it is edited, and
  _+ Add limit_ adds one; each group has a colour, one of 12 swatches or _Random_.
- `/settings` — sections for _Display_ (language and theme), _Locations and
  owners_ (a row into each page), _Backup_, _Reset_ (_Delete old purchases_ and _Delete all data_) and
  _About_.
- `/settings/locations` — the stored locations: add, rename, delete (only one no
  card is kept at), and tick _Takes purchases_.
- `/settings/owners` — the stored owners, who a limit group's account or a
  supplementary card belongs to: add, rename, delete (only one no group or
  supplementary card names).

## Which cards can take a purchase

The answer belongs to where a card is kept, not to the card. Each location on
`/settings/locations` has a _Takes purchases_ tick; only unarchived cards kept in
a ticked place, in a limit group, appear in Home's _Ready to use_ and in the
new list's add-a-card sheet. Every card still appears everywhere else, including the
overdue bills in _Needs you_.

The first load stores Bangkok, Phichit and Krabi as location records, taking their
ticks from the old `cc:settings` record when there is one, and otherwise ticking
only Krabi, which reproduces the rule that was in force before: purchases were only
ever entered against the Krabi cards. That is the only time `cc:settings` is read.
Unticking every place is kept as a real answer, and _Ready to use_ then says that
no card can be used and points at Locations.

Every load also checks each card's location against the stored records. A card
kept at one of the three starting places whose record has gone gets that record
back, taking no purchases; any other unknown value moves the card to the Krabi
record when it exists, else to the first record by id. The cards page names the
moved cards once, so you can pick the correct location by hand.

## Limit groups and how much room is left

A limit group is a pool of credit, not a property of one card. Every card
points at a group, and two cards that share a limit — one account with two
physical cards, say — point at the same group, so there is one number to watch
for both of them rather than two that would drift apart.

A group's available credit is its limit less what its cards owe, less any credit
they hold, counting the open period — the cycle still being spent on right now.
Money spent this cycle leaves the limit the moment it is spent. Payments belong to
a card, not to a statement: they settle the card's oldest unpaid statement first,
the open period included, and whatever is left over stays as credit. Pay from a
bill in Home's _Owed_ or _Needs you_, or from any card's panel; a payment dated
after today is a planned payment, which counts only once it is marked paid.

An archived card still weighs on the group it shares. Archiving a card retires
it from new purchases and from Home, not from what it already owes, so its
unpaid statements keep counting against the pool even though the card itself no
longer appears in _Ready to use_. A purchase list already sent to the spender
holds its amounts against the room too, until its reply is recorded.

Home's _Ready to use_ lists only the cards that can take a purchase (see above),
each showing the close and due dates of the statement a purchase made today would
land on. Those are deliberately not the dates of the bill an overdue card shows
under _Needs you_: that answers what has to be paid, this answers what happens if
you spend today, and on a card with an overdue statement the two disagree — both
are correct for the question they answer.

A purchase entered for more than a group's remaining room is still saved.
The app is a record of what happened, not a gate on what is allowed, and a
stored limit can itself be stale or wrong; refusing the entry would just mean
a real purchase goes unrecorded. While amounts are entered on a list, going over
is a warning with _Lower to_ the room left; a purchase added in a card's panel
that goes over says by how much, once, under the card's hero.

Every card has a limit group: the card form will not save a card without one,
and restore refuses a file with a card that has none or names a group not in it.
A card that still meets none (a hand-edited store) is invalid data, left out of
every list.

## How statements work

Each card carries a billing cycle rule: either _closes on day N, due M days
later_ or _closes on day N, due on day M_. Statements are never stored — they
are computed from that rule, so a period's close date, due date, purchases, and
total are always derived from the card as it is now. Payments are stored per card
as `cc:cardpayment:<cardId>:<id>`. Once a statement is fully paid, its close and
due dates are kept under `cc:statementdates:<cardId>:<period>`, so editing a cycle
rule can never rewrite settled history; the kept dates hold only while the
statement stays fully paid (DD-167).

A purchase dated exactly on the close date belongs to that statement, not the
next one.

## Where the data lives

Everything lives in this browser's `localStorage`, under keys shaped like
`cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, `cc:limitgroup:<id>`,
`cc:cardpayment:<cardId>:<id>`, `cc:statementdates:<cardId>:<period>`,
`cc:location:<id>`, `cc:owner:<id>` and `cc:list:<id>` (a purchase list, with its lines and status;
`/transactions/lists/edit?list=<id>` works on a draft or a waiting list, and
`/transactions/lists?list=<id>` shows any list in its panel). One-off
markers and notices from data migrations sit under `cc:migration:*`, and which
panels are folded under `cc:panel:*`. A purchase saved from a spender's reply takes
the id `<list id>-<n>` instead of a uuid, and a draft moved from it `<list id>-<n>`
too, so a retried save overwrites what a failed one wrote instead of doubling it.

Older records are kept but no longer read: `cc:payment:<cardId>:<period>` (the
per-statement payments, converted to card payments once at startup), `cc:settings`
(read only to seed the locations; nothing writes it now), and the old dashboard's
`cc:batch-start`. A reset in Settings clears them. Those shapes hold as written
for an ordinary card id, date, and uuid; each segment is actually percent-encoded,
so a card id containing `:` or other reserved characters produces a key that looks
a little different from the documented shape, though it still round-trips
correctly. Nothing is sent to a server: the Cloudflare Worker only serves the
built pages, so data is not shared between browsers or devices except through a
backup.

A location is a stored record: an id, a name, and whether it takes purchases. The
three starting places have the ids `bangkok`, `phichit` and `krabi`; a location
added later takes a slug of its name. A card stores the id, so renaming a location
changes nothing on its cards.

An owner is a stored record too: an id and a name. The three starting owners have
the ids and names `KC`, `NT` and `RI`; one added later takes a slug of its name. A
limit group, and a supplementary card, stores the owner's id, so a rename shows
everywhere at once. At every load (and after a restore) a group with no owner is
given KC, a starting owner whose record has gone comes back, and any other owner
nobody stores moves to the first owner A to Z.

The _Backup_ section on `/settings` is how you keep a copy: _Download a copy_
saves indented JSON, and _Copy as text_ puts the same backup on the clipboard as
compact JSON. _Restore…_ opens a sheet that offers the clipboard first, then a
file or text pasted by hand. If this browser already holds records, it shows what
is here next to what is in the copy and asks: _Merge_ keeps what is here and adds
the copy's records, updating any it shares, while _Replace_ deletes everything
here first. An empty browser restores straight away.

The _Reset_ section has two actions. _Delete old purchases_ removes purchases
older than 6 months, 1 year, 3 years or all of them, but only those on statements
that are fully paid, with the payments that settled them and the saved lists from
the same time, so what each card owes, its credit and its room stay the same.
_Delete all data_ deletes every record after showing how many of each will go;
language and theme stay.

Backups are version 4 and carry limit groups (with their colours), cards,
purchases, card payments, statement dates, purchase lists, locations and owners. A
version 3 file still restores, with the starting owners KC, NT and RI. A
version 2 file is converted on the way in: its payments become card payments, its
locations come from its settings, and it has no lists. A version 1 file is
rejected outright. A file that is not valid JSON, is missing its expected lists,
has a record with the wrong shape, or was written by another backup version is
rejected with a message naming what was wrong, and nothing is imported. In a
version 3 or 4 file each card must name one of the file's own locations, and in a
version 4 file each group and supplementary card one of its own owners; one that does
not is rejected by its position in the file — for instance `That backup's card #1
…` — and nothing is imported. Import itself is not atomic, though: it writes limit
groups, then locations, owners, cards, purchases, card payments, statement dates and lists
one at a time — groups and locations before cards, so a card always has something
to point at — and then gives a colour to any group without one. A failure partway
through (for instance, storage filling up) can leave some records imported and
others not.

## Language

The interface is available in English and Thai. The picker is in the _Display_
section on `/settings`, next to the theme picker (Device, Light or Dark);
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
between cards in _Ready to use_ and _Needs you_, sort by plain UTF-16 code-unit order,
not Thai collation, and the two can disagree. (Card, group and location names are
compared with `localeCompare(…, locale)` instead, so this applies to ids only.)
A Thai dictionary treats a leading vowel like เ as following the consonant it is
pronounced with, not preceding it, so `เกา` ("to scratch") collates as if it
were spelled starting with ก and sorts _before_ `ขาว` ("white") — confirmed with
`Intl.Collator("th")`. Plain code-unit order gets this backwards: เ's code point
(`U+0E40`) is higher than every consonant's, so `เกา` sorts _after_ `ขาว` instead.
As it happens, card ids are short Latin codes (`KB-F`, `UOB-K`), which land in the
same order under both code-unit comparison and real Thai collation, so this gap is
latent rather than visible in the UI today; it would only surface for an id written
in Thai with this shape. This is a known, deliberate trade-off rather
than a bug: fixing it needs `Intl.Collator`, and using any `Intl` API on `th-TH` risks
pulling in the same Buddhist-era year handling the date rendering above exists to
avoid.

## Product requirements

What the app must keep doing, the rules behind its numbers, the data it already
holds, and the decisions made along the way, including the redesign that shipped
on 2026-11-04, are in [`PRD.md`](PRD.md), and in Thai in [`PRD_TH.md`](PRD_TH.md).
Read it before refactoring or redesigning anything.

## Changelog

What changed at each stage, and the decisions behind it, is in [`CHANGELOG.md`](CHANGELOG.md).
