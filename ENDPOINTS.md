# Endpoints

Every address the app answers, kept in step with the code: a change to an address or a query
key updates this file in the same change (last: `/owed`, the calendar of what to pay each day, 2026-11-14, PRD DD-205). The site is static: each page is `src/pages/<path>.astro`, built to `dist/<path>.html` and
served at `/<path>` (`index.astro` at `/`), never with a trailing slash. The pages read their state from the query string only; no page reads
or writes a fragment (`#...`).

Unknown query keys are ignored, and a value the page does not know reads as the default.
A sort's direction (`dir`) defaults to that sort's own, so it is written only when it
runs the other way.
Keys marked _repeated_ may appear more than once (`?f.cards=a&f.cards=b`). Pages that rewrite their
own address leave a key out while it holds its default, so the bare path is the default view.

The addresses follow the tabs-and-panel plan (PRD RD-22 to RD-29, settled and built 2026-11-13,
spec `docs/superpowers/specs/2026-11-12-tabs-and-panel-design.md`): tabs as paths, the open
record in the query (`card`, `limit`, `list`; Settings' `panel`), filters prefixed `f.`, search `q`.

## Retired addresses

No retired address redirects (RD-29): each is a 404 now, and `public/_redirects` is gone.

| Was                                      | Now                                                     |
| ---------------------------------------- | ------------------------------------------------------- |
| `/card?id=<id>`                          | `/cards?card=<id>`                                      |
| `/card/new`, `/card/edit?id=<id>`        | none: the card form is in the card's panel, no address  |
| `/pay`, `/pay?card=<id>&amount=<satang>` | `/owed`; the pay form is _Pay_ on the bill (no address) |
| `/list/new?card=<id>`                    | `/transactions/lists/new?cards=<id>`                    |
| `/list/draft?id=`, `/list/reply?id=`     | `/transactions/lists/edit?list=`                        |
| `/list/view?id=`                         | `/transactions/lists?list=`                             |
| `/backup` (was a 301 to `/settings`)     | gone                                                    |
| `/settings/locations`                    | `/settings?panel=locations`                             |
| `/settings/owners`                       | `/settings?panel=owners`                                |

## Home

Three tabs, each its own page (RD-22): _Needs you_ at `/`, _Owed_ at `/owed` and _Ready to use_
at `/ready`, under the page title on every width. `/owed` and `/ready` are top-level paths, as
Home's own is `/`; the tab bar lights Home for all three. Each tab shows everything (no _See
more_). A card opens in its panel over the tab on show (`card`), as on `/cards`.

### `/`

_Needs you_: overdue bills, late and soon planned payments, lists waiting for the spender and
drafts, money at risk first (DD-62).

| Key    | Values  | Default | Notes                                                                                                                                                  |
| ------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card` | card id | none    | Opens the card's panel (an overdue bill's _Open card_ or _Pay_). Wins over `list`. An invalid id or a card not stored opens nothing, and the key goes. |
| `list` | list id | none    | Opens the list's panel (a waiting list's or a draft's row), as on `/transactions/lists`. A list not stored opens nothing, and the key goes.            |

A list's row and _Open card_ push their key (Back closes the panel); another row rewrites it.
_Pay_ on an overdue bill opens the card's panel straight on its pay form with the amount left
filled in; the form has no address (`/?card=<id>`), and its save, _Cancel_ and ‹ swap the card
back in place.

### `/owed`

_Owed_: the money to have ready each day (DD-205): a calendar, or the days by week or by month,
with the totals over it and late money apart. Cards' search and _Filter_, with no sort and no
group.

| Key           | Values                             | Default         | Notes                                                                                                                                 |
| ------------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `q`           | text                               | empty           | Search: the card's id, name, last 4 or comment, as on `/cards`.                                                                       |
| `f.locations` | stored location id, _repeated_     | any             | Only cards kept there. An id with no stored location is dropped.                                                                      |
| `f.owners`    | stored owner id, _repeated_        | any             | Only cards held by them (a supplementary card's own holder, else its limit group's owner).                                            |
| `f.range`     | `7`, `14`, `30`, `60`, `all`       | `30`            | How far ahead from today; `all` is everything owed. Late money shows whatever the range.                                              |
| `f.shows`     | `bill`, `plan`, `open`, _repeated_ | all three       | Which money: closed bills, planned payments, open statements (estimates). Written only when not all three; none reads as all three.   |
| `view`        | `calendar`, `week`, `month`        | `calendar`      | The calendar, or the days in week or month sections.                                                                                  |
| `month`       | `YYYY-MM`                          | the day's month | The calendar's month; without it, the picked day's month, else the next paying day's. A month with nothing in range reads as today's. |
| `day`         | `YYYY-MM-DD`                       | none            | The calendar's picked day; without it (or when it has nothing), the shown month's first paying day.                                   |
| `card`        | card id                            | none            | Opens the card's panel (_Pay_ on a card). An invalid id or a card not stored opens nothing, and the key goes.                         |

A search, filter or view change rewrites the address (`replaceState`), keys at their default left
out, keeping `card`; picking a day writes `day`, and ‹ or › writes `month` and drops `day`.
Switching the view drops `day`. _Pay_ opens the card's panel on its pay form with the amount
filled in, with no address of its own (`/owed?card=<id>`). Example:
`/owed?f.owners=KC&f.range=14&view=week`. The per-card keys `f.states`, `sort`, `dir` and `by` are
retired here (ignored like any unknown key); what each card owes moves to `/cards` as a filter in
a change of its own.

### `/ready`

_Ready to use_: every card that can take a purchase now, as card tiles, under Cards' control row
and _Filter · Sort · Group_ sheet.

| Key           | Values                             | Default | Notes                                                                                                |
| ------------- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `q`           | text                               | empty   | Search: the card's id, name, last 4 or comment, as on `/cards`.                                      |
| `f.locations` | stored location id, _repeated_     | any     | Only cards kept there. An id with no stored location is dropped.                                     |
| `f.owners`    | `KC`, `NT`, `RI`, _repeated_       | any     | Only cards held by them.                                                                             |
| `sort`        | `room`, `close`, `due`             | `room`  | Order: room, close date or due date.                                                                 |
| `dir`         | `asc`, `desc`                      | `desc`  | Direction: every sort defaults to `desc` (most room, longest to close, latest due).                  |
| `by`          | `place`, `holder`, `limit`, `none` | `place` | Sections, as on `/cards`; each keeps the order. `none` is one flat list under the count and places.  |
| `card`        | card id                            | none    | Opens the card's panel (a tile). An invalid id or a card not stored opens nothing, and the key goes. |

A search, filter, sort or grouping change rewrites the address (`replaceState`), keys at their
default left out, keeping `card`; a tile pushes `card`. Example:
`/ready?f.owners=KC&sort=close&by=limit&card=7`.

## Transactions

Two tabs, each its own page (RD-22): _Ledger_ at `/transactions` and _Lists_ at
`/transactions/lists`, under the page title on every width. The tab bar lights Transactions for
both, and for the list pages under `/transactions/lists/`. A filter takes `f.` (RD-29). What each
card owes is no longer on Transactions: it is Home's _Owed_, `/owed`.

### `/transactions`

The ledger: the month's summary, _Upcoming_, and purchases and payments by day.

| Key       | Values                                          | Default        | Notes                                                                                                                                                            |
| --------- | ----------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`       | any text                                        | empty          | Search: a card, a note or an amount.                                                                                                                             |
| `f.types` | `purchase`, `payment` (repeated)                | any            | Entry types.                                                                                                                                                     |
| `f.cards` | card id (repeated)                              | any            | Cards.                                                                                                                                                           |
| `f.range` | `today`, `week`, `month`, `lastMonth`, `custom` | none           | Date preset.                                                                                                                                                     |
| `f.from`  | `YYYY-MM-DD`                                    | none           | Range start; an invalid date is dropped.                                                                                                                         |
| `f.to`    | `YYYY-MM-DD`                                    | none           | Range end; an invalid date is dropped.                                                                                                                           |
| `sort`    | `date`, `amount`                                | `date`         | Order. The retired `new`, `old`, `big`, `small` read as `date`.                                                                                                  |
| `dir`     | `asc`, `desc`                                   | the sort's own | Direction: `date` and `amount` default to `desc` (newest, biggest first).                                                                                        |
| `by`      | `day`, `card`, `none`                           | `day`          | Sections: each day (in the date sort's direction, else newest first), each card by id, or one flat list.                                                         |
| `card`    | card id                                         | none           | Opens the card's panel (a purchase's _Open card_), as on `/cards`. An id not in the card id format (RD-28) or a card not stored opens nothing, and the key goes. |

Search, filter and sort changes rewrite the address (`replaceState`), keeping `card`. A row opens
in place; a purchase's _Open card_ opens the card's panel, pushing `card` (Back closes it), and
its _Open list_ links to `/transactions/lists?list=<id>`. Example:
`/transactions?f.types=purchase&f.cards=12.3&sort=amount&card=12.3`. The retired `view`, `type`,
`range`, `from`, `to`, `owed` and `odir` are ignored like any unknown key, and the old `card`
filter now names the card panel.

### `/transactions/lists`

Every purchase list, in sections (DD-188).

| Key          | Values                                          | Default  | Notes                                                                                             |
| ------------ | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `q`          | any text                                        | empty    | Search: a line's card id, name, last 4 or note.                                                   |
| `f.statuses` | `draft`, `sent`, `saved` (repeated)             | any      | Status.                                                                                           |
| `f.cards`    | card id (repeated)                              | any      | A list with any of them on a line.                                                                |
| `f.range`    | `today`, `week`, `month`, `lastMonth`, `custom` | none     | Date preset, on the list's date.                                                                  |
| `f.from`     | `YYYY-MM-DD`                                    | none     | Range start, on the list's date; an invalid date is dropped.                                      |
| `f.to`       | `YYYY-MM-DD`                                    | none     | Range end, on the list's date; an invalid date is dropped.                                        |
| `by`         | `status`, `month`, `none`                       | `status` | Sections: drafts, waiting and saved by date; each month, newest first; or every list in one.      |
| `list`       | list id                                         | none     | Opens the list's panel. An empty id or a list not stored opens nothing, and the key is taken out. |
| `card`       | card id                                         | none     | Opens the card's panel (a list's line), as on `/cards`; wins over `list`.                         |

Search, filter and grouping changes rewrite the address (`replaceState`), keeping the open record.
A row opens its list's panel the way a tile does on `/cards` (push from nothing, rewrite when one
is open). A line in the list panel opens its card's panel a step deeper (pushes `?card=<id>` in
place of `list`, so Back returns to the list). The panel's _Continue_ (a draft) and _Record reply_
(a waiting list) go to `/transactions/lists/edit?list=<id>`; _Merge_ and _Confirm_ write in place;
a draft's _Delete_ closes the panel. _+ Add list_ (at the end of the search row) goes to
`/transactions/lists/new`. Example: `/transactions/lists?f.statuses=draft&by=month&list=<id>`.

### `/transactions/lists/new`

The builder, a full page (DD-195): a new list, empty or holding the cards named. Reached from
_+ Add list_ on the Lists tab and a card's _Use on a list_ (`/transactions/lists/new?cards=<id>`).

| Key     | Values             | Notes                                                                                         |
| ------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `cards` | card id (repeated) | The cards on the new list, in order, each once; cards that cannot take purchases are dropped. |

Adding or removing a card rewrites `cards` in place, never pushing, so a reload keeps them (nothing
is stored until _Save as draft_). The add-a-card sheet is not in the address: opening it pushes an
entry with the address unchanged, so Back closes it; picking a card, _All cards_ and the card before
or after change nothing in history; _Add to list_, _Remove from list_, _Done_ and Close step back over
its entry. A save leaves with `location.replace` for `/transactions/lists?list=<id>`, the list just
written (or the one it merged into) open in its panel, so Back does not reopen the builder.

- `/transactions/lists/new` -- an empty new list.
- `/transactions/lists/new?cards=12.3&cards=7` -- a new list holding those cards.

### `/transactions/lists/edit`

| Key    | Values            | Notes                                                                                                                                         |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `list` | list id, required | The builder on a draft, the spender's reply on a waiting list; a saved list or an unknown id says so and links to its panel or the Lists tab. |

The add-a-card sheet works as on `/transactions/lists/new`; a draft's cards come from the stored
draft, so the address stays as it is. A save leaves for `/transactions/lists?list=<id>`; deleting
the draft or cancelling the waiting list, for `/transactions/lists`. ‹ leads to the Lists tab.

## Cards

Two tabs, each its own page (RD-22): _Cards_ at `/cards` and _Limits_ at `/cards/limits`, under
the page title on every width. The tab bar lights Cards for both. A filter takes `f.` (RD-29).

### `/cards`

| Key           | Values                                 | Default        | Notes                                                                                                                                                                    |
| ------------- | -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `q`           | any text                               | empty          | Search: a card's id, name, last 4 or comment.                                                                                                                            |
| `f.locations` | location id (repeated)                 | any            | Kept only when the id is a stored location.                                                                                                                              |
| `f.owners`    | `KC`, `NT`, `RI` (repeated)            | any            | Card owner.                                                                                                                                                              |
| `sort`        | `card`, `room`, `name`, `close`, `due` | `card`         | Order within each section. `close` and `due` put the soonest full date shown on the card first. The retired `place` reads as `card`.                                     |
| `dir`         | `asc`, `desc`                          | the sort's own | Direction. `room` defaults to `desc` (most room first), the others to `asc`.                                                                                             |
| `by`          | `place`, `holder`, `limit`, `none`     | `place`        | Sections: each place, each account holder, each limit group (A to Z), or one flat list.                                                                                  |
| `card`        | card id                                | none           | Opens the card's detail panel (RD-23). An empty id, an id not in the card id format (RD-28) or a card not stored opens nothing, and the key is taken out of the address. |

Search, filter and sort changes rewrite the address (`replaceState`), keeping `card`. Example:
`/cards?f.owners=KC&sort=room&card=12.3`. The retired `view`, `loc`, `owner`, `group` and
`newGroup` are ignored like any unknown key.

The card panel (DD-196): a tile's click opens it, pushing `card` when no panel is open and
rewriting the entry when one is, so Back closes it rather than walking through every card seen.
Every address the page rewrites keeps `card`. No form in the panel is in the address: _Edit_,
_Add purchase_, a purchase's _Edit_ and _Make a payment_ push an entry with the address unchanged
(Back returns to the card, and a reload shows the card); _+ Add card_ (at the end of the search
row) opens a blank card form with the address unchanged (pushed when no panel is open, else over
the open card's entry without `card`), and adding the card writes `card=<new id>` over that
entry. Closing (×, Escape, the backdrop) steps back over every entry the panel pushed, or, on an
address opened with `card` already in it, rewrites it without `card`. A tile links to
`/cards?card=<id>`, which a new tab opens. Example: `/cards?q=kbank&card=12.3`.

### `/cards/limits`

Every limit group, one panel each (DD-197).

| Key        | Values                      | Default                                  | Notes                                                                                                                    |
| ---------- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `q`        | any text                    | empty                                    | Search: a group's name, or the name of one of its cards.                                                                 |
| `f.owners` | `KC`, `NT`, `RI` (repeated) | any                                      | The group's account holder.                                                                                              |
| `sort`     | `name`, `room`, `used`      | `name`                                   | A to Z by name; by room left; by the share of the limit used. Ties A to Z.                                               |
| `dir`      | `asc`, `desc`               | `desc` for `room` and `used`, else `asc` | Direction.                                                                                                               |
| `limit`    | limit group id              | none                                     | Opens the group's limit panel. An empty id or a group not stored opens nothing, and the key is taken out of the address. |
| `card`     | card id                     | none                                     | Opens the card's panel (a group's card), as on `/cards`; wins over `limit`.                                              |

Search, filter and sort changes rewrite the address (`replaceState`), keeping the open record.
A group's tile opens its panel the way a card's tile does on `/cards` (push from nothing, rewrite
when one is open). A card in the limit panel opens the card's panel a step deeper: it pushes
`?card=<id>` (in place of `limit`), so Back returns to the group. _Edit_ in the limit panel puts
the group form there, pushing an entry with the address unchanged; _+ Add limit_ (at the end of
the search row) opens a blank group form with the address unchanged, and adding the group writes
`limit=<new id>` over its entry. Deleting a group (from its form, when no card uses it) closes
the panel. Example: `/cards/limits?f.owners=KC&sort=room&limit=<id>`.

## Settings

### `/settings`

| Key     | Values                        | Default | Notes                                                                 |
| ------- | ----------------------------- | ------- | --------------------------------------------------------------------- |
| `panel` | `locations`, `owners`, `data` | none    | The panel open beside Settings (RD-17, RD-30, RD-31, DD-203, DD-204). |

_Manage locations_, _Manage owners_ and _Data summary_ each open their panel the way a card's tile opens its
panel on `/cards`: push from nothing, rewrite when another is open; × steps back over it, and
Back closes it. `locations` adds, renames and deletes the stored locations (only one no card is
kept at) and ticks _Takes purchases_; `owners` adds, renames and deletes the stored owners (only
one no limit group or supplementary card names); `data` sums up what this browser holds, kind by
kind, and the space it takes (read only). Any other value opens nothing and the key is
rewritten away. Every note that says where to tick a place links to `/settings?panel=locations`.

## Trailing slash

One trailing slash is ignored when picking the active tab, so `/cards/` highlights Cards.
