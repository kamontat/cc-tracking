# Endpoints

Every address the app answers, as of the redesign (phases 1 to 7; no address changed in
phase 7). The site is static: each page is `src/pages/<path>.astro`, built to `dist/<path>.html` and
served at `/<path>` (`index.astro` at `/`), never with a trailing slash. The pages read their state from the query string only; no page reads
or writes a fragment (`#...`).

Unknown query keys are ignored, and a value the page does not know reads as the default.
A sort's direction (`dir`, `odir`) defaults to that sort's own, so it is written only when it
runs the other way.
Keys marked _repeated_ may appear more than once (`?card=a&card=b`). Pages that rewrite their
own address leave a key out while it holds its default, so the bare path is the default view.

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

### `/cards`

| Key         | Values                                 | Default        | Notes                                                                                                                                                                                    |
| ----------- | -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`      | `cards`, `groups`                      | `cards`        | Which view shows below 900px: the card list or the limit groups. Written only as `groups`; anything else reads as `cards`. From 900px both sit side by side and the key changes nothing. |
| `q`         | any text                               | empty          | Search.                                                                                                                                                                                  |
| `loc`       | location id (repeated)                 | any            | Kept only when the id is a stored location.                                                                                                                                              |
| `owner`     | `KC`, `NT`, `RI` (repeated)            | any            | Card owner.                                                                                                                                                                              |
| `ungrouped` | `1`                                    | off            | Only cards in no stored limit group.                                                                                                                                                     |
| `sort`      | `card`, `room`, `name`, `close`, `due` | `card`         | Order within each section. `close` and `due` put the soonest full date shown on the card first. The retired `place` reads as `card`.                                                     |
| `dir`       | `asc`, `desc`                          | the sort's own | Direction. `room` defaults to `desc` (most room first), the others to `asc`.                                                                                                             |
| `by`        | `place`, `holder`, `limit`, `none`     | `place`        | Sections: each place, each account holder, each limit group (A to Z, then none), or one flat list.                                                                                       |
| `group`     | limit group id                         | none           | Opens the limit group sheet on that group.                                                                                                                                               |
| `newGroup`  | `1`                                    | none           | Opens a blank limit group sheet; wins over `group`.                                                                                                                                      |

Switching the view, filter and sort changes rewrite the address (`replaceState`); opening a group sheet pushes
one (`pushState`), keeping the other keys. Example: `/cards?owner=KC&sort=room&group=<id>`.

### `/card`

| Key  | Values  | Notes                                                     |
| ---- | ------- | --------------------------------------------------------- |
| `id` | card id | Required. A missing or unknown id shows "card not found". |

- `/card?id=<id>` -- the card's page.

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

Two steps on one path, told apart by `card`.

Picker step (no `card`):

| Key     | Values                      | Default | Notes                                                                                     |
| ------- | --------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `q`     | any text                    | empty   | Search.                                                                                   |
| `loc`   | location id (repeated)      | any     | Kept only when the id is a stored location.                                               |
| `owner` | `KC`, `NT`, `RI` (repeated) | any     | Card owner.                                                                               |
| `sort`  | `room`, `close`, `due`      | `room`  | Order.                                                                                    |
| `dir`   | `asc`, `desc`               | `desc`  | Direction; every sort defaults to `desc` (most room, longest to close, latest due first). |
| `by`    | `none`, `place`, `holder`   | `none`  | Sections: one flat list, each place, or each account holder.                              |

Entering step (any `card`):

| Key    | Values             | Notes                                                                                                                  |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `card` | card id (repeated) | Cards on the new list, in order. Cards that cannot take purchases are dropped. Other keys are kept ahead of the cards. |

- `/list/new` -- the picker.
- `/list/new?owner=KC&sort=due` -- the picker, filtered and sorted.
- `/list/new?sort=due&dir=asc` -- the picker, soonest due first.
- `/list/new?card=<id>&card=<id>` -- entering amounts for those cards.

### `/list/draft`

| Key  | Values  | Notes                         |
| ---- | ------- | ----------------------------- |
| `id` | list id | Required. Edits a draft list. |

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
