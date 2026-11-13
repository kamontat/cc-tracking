# Endpoints

Every address the app answers, kept in step with the code: a change to an address or a query
key updates this file in the same change (last: Cards' tabs, `/cards` and `/cards/limits`, 2026-11-13, PRD DD-197). The site is static: each page is `src/pages/<path>.astro`, built to `dist/<path>.html` and
served at `/<path>` (`index.astro` at `/`), never with a trailing slash. The pages read their state from the query string only; no page reads
or writes a fragment (`#...`).

Unknown query keys are ignored, and a value the page does not know reads as the default.
A sort's direction (`dir`, `odir`) defaults to that sort's own, so it is written only when it
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
filters and the `limit` key (part 3, DD-197).

## Redirects

| From      | To          | Status | Source              |
| --------- | ----------- | ------ | ------------------- |
| `/backup` | `/settings` | 301    | `public/_redirects` |

## Home

### `/`

No query.

## Transactions

### `/transactions`

| Key      | Values                                          | Default        | Notes                                                                                                           |
| -------- | ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `view`   | `ledger`, `lists`, `owed`                       | `ledger`       | Which view shows. On desktop `owed` sits beside the ledger.                                                     |
| `q`      | any text                                        | empty          | Ledger search.                                                                                                  |
| `type`   | `purchase`, `payment` (repeated)                | any            | Ledger entry types.                                                                                             |
| `card`   | card id (repeated)                              | any            | Ledger cards.                                                                                                   |
| `range`  | `today`, `week`, `month`, `lastMonth`, `custom` | none           | Ledger date preset.                                                                                             |
| `from`   | `YYYY-MM-DD`                                    | none           | Ledger range start; an invalid date is dropped.                                                                 |
| `to`     | `YYYY-MM-DD`                                    | none           | Ledger range end; an invalid date is dropped.                                                                   |
| `sort`   | `date`, `amount`                                | `date`         | Ledger order. The retired `new`, `old`, `big`, `small` read as `date`.                                          |
| `dir`    | `asc`, `desc`                                   | the sort's own | Ledger direction: `date` and `amount` default to `desc` (newest, biggest first).                                |
| `by`     | `day`, `card`, `none`                           | `day`          | Ledger sections: each day (in the date sort's direction, else newest first), each card by id, or one flat list. |
| `owed`   | `urgency`, `card`, `due`, `left`                | `urgency`      | Owed view order.                                                                                                |
| `odir`   | `asc`, `desc`                                   | the sort's own | Owed direction: `left` defaults to `desc` (most owed first), the others to `asc`.                               |
| `lq`     | any text                                        | empty          | Lists view search: a line's card id, name, last 4 or note.                                                      |
| `status` | `draft`, `sent`, `saved` (repeated)             | any            | Lists view status filter.                                                                                       |
| `lcard`  | card id (repeated)                              | any            | Lists view cards: a list with any of them on a line.                                                            |
| `lrange` | `today`, `week`, `month`, `lastMonth`, `custom` | none           | Lists view date preset, on the list's date.                                                                     |
| `lfrom`  | `YYYY-MM-DD`                                    | none           | Lists view range start; an invalid date is dropped.                                                             |
| `lto`    | `YYYY-MM-DD`                                    | none           | Lists view range end; an invalid date is dropped.                                                               |
| `lby`    | `status`, `month`, `none`                       | `status`       | Lists view sections: drafts, waiting and saved by date; each month, newest first; or every list in one.         |

The page rewrites its address (`replaceState`) on every change, so the current view can be
bookmarked. The Lists view's keys are its own, so a ledger search does not carry into it.
Example: `/transactions?view=lists&lq=fuel&status=draft&status=sent`.

### `/pay`

| Key      | Values                     | Default | Notes                                                                                                                      |
| -------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `card`   | card id                    | none    | Opens the payment sheet for that card over the picker.                                                                     |
| `amount` | whole number of satang > 0 | none    | Prefills the sheet's amount; only read with `card`. Anything else is dropped and the sheet starts at the card's next bill. |

- `/pay` -- the card picker.
- `/pay?card=<id>` -- picker with the payment sheet open.
- `/pay?card=<id>&amount=<satang>` -- sheet with the amount prefilled.

Picking a card pushes `?card=<id>` (Back closes the sheet). A save leaves for `/transactions`.

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

## Purchase lists

Each list status has its own page. A link to a stored list goes to the page for its status:
`draft` to `/list/draft`, `sent` to `/list/reply`, `saved` to `/list/view`. A page opened on
a list in another status says so and links to the right page; an unknown id links Home.

### `/list/new`

The new list itself, empty or holding the cards named (DD-195). Cards are added from its
add-a-card sheet; there is no picker step. Reached from the _+ New_ menu (`/list/new`) and a
card page's _Use on a list_ (`/list/new?card=<id>`). An `id` is ignored: a stored draft opens at
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
