# Endpoints

Every address the app answers, kept in step with the code: a change to an address or a query
key updates this file in the same change (last: Home's tabs, `/`, `/owed` and `/ready`, with Cards' search, filters and grouping on `/owed` and `/ready`, 2026-11-13, PRD DD-199). The site is static: each page is `src/pages/<path>.astro`, built to `dist/<path>.html` and
served at `/<path>` (`index.astro` at `/`), never with a trailing slash. The pages read their state from the query string only; no page reads
or writes a fragment (`#...`).

Unknown query keys are ignored, and a value the page does not know reads as the default.
A sort's direction (`dir`) defaults to that sort's own, so it is written only when it
runs the other way.
Keys marked _repeated_ may appear more than once (`?card=a&card=b`). Pages that rewrite their
own address leave a key out while it holds its default, so the bare path is the default view.

**Planned (PRD RD-22 to RD-29, settled 2026-11-13, not built yet).** Every address below is
replaced by the tabs-and-panel plan: tabs as paths (`/owed`, `/ready`, `/transactions/lists`,
`/cards/limits`), the open record in the query (`card`, `limit`, `list`), filters prefixed `f.`,
and `/card`, `/pay`, `/list/*` and the `/backup` redirect retired. The full list is in
`docs/superpowers/specs/2026-11-12-tabs-and-panel-design.md`. This file stays in step with the
code: each part of the plan rewrites the addresses it changes here as it ships. Shipped so far:
`card` on `/cards` (part 2, DD-196); Cards' tabs, `/cards` and `/cards/limits`, with `f.`
filters and the `limit` key (part 3, DD-197); Transactions' tabs, `/transactions` and
`/transactions/lists`, with `f.` filters and the `card` and `list` keys, and the list pages
`/transactions/lists/new` and `/transactions/lists/edit` (part 4, DD-198); Home's tabs, `/`,
`/owed` and `/ready`, with the `card` and `list` keys and, on `/owed` and `/ready`, Cards' `q`,
`f.` filters, `sort`, `dir` and `by` (part 5, DD-199).

## Redirects

| From      | To          | Status | Source              |
| --------- | ----------- | ------ | ------------------- |
| `/backup` | `/settings` | 301    | `public/_redirects` |

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

_Owed_: every card that owes, as payment tiles, under Cards' control row (search, _Filter_, the
sort and group chips, a chip per filter) and Cards' _Filter · Sort · Group_ sheet, with _Bill_
added.

| Key           | Values                                    | Default        | Notes                                                                                                                                                 |
| ------------- | ----------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`           | text                                      | empty          | Search: the card's id, name, last 4 or comment, as on `/cards`.                                                                                       |
| `f.locations` | stored location id, _repeated_            | any            | Only cards kept there. An id with no stored location is dropped.                                                                                      |
| `f.owners`    | `KC`, `NT`, `RI`, _repeated_              | any            | Only cards held by them (a supplementary card's own holder, else its limit group's owner).                                                            |
| `f.states`    | `overdue`, `soon`, `unbilled`, _repeated_ | any            | Only cards whose bill is past due, due within 7 days (the pay tag's _Due in N days_), or that owe with no bill yet (all of it on the open statement). |
| `sort`        | `urgency`, `card`, `due`, `left`          | `urgency`      | Order: most urgent (overdue, due within 7 days, then most owed), card id, due date, or what is owed.                                                  |
| `dir`         | `asc`, `desc`                             | the sort's own | Direction: `left` defaults to `desc` (most owed first), the rest to `asc`.                                                                            |
| `by`          | `place`, `holder`, `limit`, `none`        | `none`         | Sections, as on `/cards`: places in order, holders then none, limit groups A to Z then none; each keeps the order. `none` is one flat list.           |
| `card`        | card id                                   | none           | Opens the card's panel (a tile, or _Pay_ on it). An invalid id or a card not stored opens nothing, and the key goes.                                  |

A search, filter, sort or grouping change rewrites the address (`replaceState`), keys at their
default left out, keeping `card`. A tile pushes `card`; _Pay_ on a tile opens the card's panel on
its pay form with what is left on the bill filled in, with no address of its own. Example:
`/owed?f.states=overdue&f.states=soon&by=holder&card=12.3`. Replaces Transactions' old
`?view=owed` (and its `owed` and `odir` keys).

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

### `/pay`

| Key      | Values                     | Default | Notes                                                                                                                      |
| -------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `card`   | card id                    | none    | Opens the payment sheet for that card over the picker.                                                                     |
| `amount` | whole number of satang > 0 | none    | Prefills the sheet's amount; only read with `card`. Anything else is dropped and the sheet starts at the card's next bill. |

- `/pay` -- the card picker.
- `/pay?card=<id>` -- picker with the payment sheet open.
- `/pay?card=<id>&amount=<satang>` -- sheet with the amount prefilled.

Picking a card pushes `?card=<id>` (Back closes the sheet). A save leaves for `/transactions`.
Still served until it retires; nothing on Home links here any more (_Pay_ on a bill opens the
card's panel on its pay form), but the floating _+ New_ menu and `/card` still do.

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

### `/card`

| Key  | Values  | Notes                                                     |
| ---- | ------- | --------------------------------------------------------- |
| `id` | card id | Required. A missing or unknown id shows "card not found". |

- `/card?id=<id>` -- the card's page. Still served; the Cards page opens a card in its panel
  instead (`/cards?card=<id>`), and this page retires with the rest of the plan.

### `/card/new`

No query. The add-card form.

### `/card/edit`

| Key  | Values  | Notes                                                     |
| ---- | ------- | --------------------------------------------------------- |
| `id` | card id | Required. A missing or unknown id shows "card not found". |

- `/card/edit?id=<id>` -- the edit form; its back link leads to `/card?id=<id>`.

## Purchase lists (old pages)

Still served, on their old keys, until they retire (RD-26): every link in the app now goes to the
pages under `/transactions/lists` instead (a draft or a waiting list to
`/transactions/lists/edit?list=<id>`, a saved list to `/transactions/lists?list=<id>`), and a
write on an old page still goes Home. A page opened on a list in another status says so and links
to where it is worked on now; an unknown id links to the Lists tab.

### `/list/new`

The new list itself, empty or holding the cards named (DD-195). Cards are added from its
add-a-card sheet; there is no picker step. Nothing links here any more (the _+ New_ menu and _Use
on a list_ go to `/transactions/lists/new`). An `id` is ignored: a stored draft opens at
`/list/draft`.

| Key    | Values             | Notes                                                                                                                                                                                  |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card` | card id (repeated) | Cards on the new list, in order, each once. Cards that cannot take purchases are dropped. Other keys are kept ahead of the cards.                                                      |
| `add`  | `1`                | The add-a-card sheet, on its picker. Written as `1`; any value, even empty, opens it.                                                                                                  |
| `open` | card id            | The add-a-card sheet, on that card: its orders when it is on the list, else ready to add it. Wins over `add`. Empty reads as none; a card neither on the list nor ready opens nothing. |

The sheet follows `/pay`'s pattern (DD-76): opening it from the list pushes an entry, so Back
closes it; moving within it (picking a card, _All cards_, the card before or after) rewrites that
entry; closing it (_Done_, _Add to list_, _Remove from list_, Close, Escape, the backdrop) steps
back over that entry, or, when the page was opened with `add` or `open` already in its address,
rewrites the address without them. Adding or removing a card rewrites `card` in place, never
pushing, and Back rewrites the current cards into the entry it lands on. The picker's old keys
(`q`, `loc`, `owner`, `sort`, `dir`, `by`) are no longer read; an old link keeps them in the
address, where they do nothing.

- `/list/new` -- an empty new list.
- `/list/new?card=<id>&card=<id>` -- a new list holding those cards.
- `/list/new?card=<id>&add=1` -- the list with the add-a-card sheet's picker open.
- `/list/new?card=<id>&open=<id>` -- the list with that card's sheet open.

### `/list/draft`

| Key    | Values  | Notes                                    |
| ------ | ------- | ---------------------------------------- |
| `id`   | list id | Required. Edits a draft list.            |
| `add`  | `1`     | The add-a-card sheet, as on `/list/new`. |
| `open` | card id | That card's sheet, as on `/list/new`.    |

The draft's cards come from the stored draft, never the address, so the page leaves `id` and
any other key as they are; only `add` and `open` change, as on `/list/new`.

- `/list/draft?id=<id>` -- the draft.
- `/list/draft?id=<id>&open=<card id>` -- the draft with that card's sheet open.

### `/list/reply`

| Key  | Values  | Notes                                                   |
| ---- | ------- | ------------------------------------------------------- |
| `id` | list id | Required. The spender's reply to a sent (waiting) list. |

### `/list/view`

| Key  | Values  | Notes                   |
| ---- | ------- | ----------------------- |
| `id` | list id | Required. A saved list. |

## Settings

### `/settings`

No query.

### `/settings/locations`

No query.

## Trailing slash

One trailing slash is ignored when picking the active tab, so `/cards/` highlights Cards.
