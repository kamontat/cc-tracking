# Endpoints

Every address the app answers, as of the redesign (phases 1 to 6). The site is static: each
page is `src/routes/<path>.html`, served at `/<path>` (`index.html` at `/`). The pages read
their state from the query string only; no page reads or writes a fragment (`#...`).

Unknown query keys are ignored, and a value the page does not know reads as the default.
Keys marked *repeated* may appear more than once (`?card=a&card=b`). Pages that rewrite their
own address leave a key out while it holds its default, so the bare path is the default view.

## Redirects

| From      | To          | Status | Source            |
| --------- | ----------- | ------ | ----------------- |
| `/backup` | `/settings` | 301    | `public/_redirects` |

## Home

### `/`

No query.

## Transactions

### `/transactions`

| Key      | Values                                          | Default   | Notes |
| -------- | ----------------------------------------------- | --------- | ----- |
| `view`   | `ledger`, `lists`, `owed`                        | `ledger`  | Which view shows. On desktop `owed` sits beside the ledger. |
| `q`      | any text                                        | empty     | Ledger search. |
| `type`   | `purchase`, `payment` (repeated)                | any       | Ledger entry types. |
| `card`   | card id (repeated)                              | any       | Ledger cards. |
| `range`  | `today`, `week`, `month`, `lastMonth`, `custom` | none      | Ledger date preset. |
| `from`   | `YYYY-MM-DD`                                    | none      | Ledger range start; an invalid date is dropped. |
| `to`     | `YYYY-MM-DD`                                    | none      | Ledger range end; an invalid date is dropped. |
| `sort`   | `new`, `old`, `big`, `small`                    | `new`     | Ledger order. |
| `owed`   | `urgency`, `card`, `due`, `left`                | `urgency` | Owed view order. |
| `status` | `draft`, `sent`, `saved` (repeated)             | any       | Lists view status filter. |

The page rewrites its address (`replaceState`) on every change, so the current view can be
bookmarked. Example: `/transactions?view=lists&status=draft&status=sent`.

### `/pay`

| Key      | Values                    | Default | Notes |
| -------- | ------------------------- | ------- | ----- |
| `card`   | card id                   | none    | Opens the payment sheet for that card over the picker. |
| `amount` | whole number of satang > 0 | none   | Prefills the sheet's amount; only read with `card`. Anything else is dropped and the sheet starts at the card's next bill. |

- `/pay` -- the card picker.
- `/pay?card=<id>` -- picker with the payment sheet open.
- `/pay?card=<id>&amount=<satang>` -- sheet with the amount prefilled.

Picking a card pushes `?card=<id>` (Back closes the sheet). A save leaves for `/transactions`.

## Cards

### `/cards`

| Key         | Values                              | Default | Notes |
| ----------- | ----------------------------------- | ------- | ----- |
| `view`      | `cards`, `groups`                   | `cards` | Which view shows below 900px: the card list or the limit groups. Written only as `groups`; anything else reads as `cards`. From 900px both sit side by side and the key changes nothing. |
| `q`         | any text                            | empty   | Search. |
| `loc`       | location id (repeated)              | any     | Kept only when the id is a stored location. |
| `owner`     | `KC`, `NT`, `RI` (repeated)         | any     | Card owner. |
| `ungrouped` | `1`                                 | off     | Only cards in no stored limit group. |
| `sort`      | `place`, `room`, `name`, `close`    | `place` | Order; `place` groups by location. |
| `group`     | limit group id                      | none    | Opens the limit group sheet on that group. |
| `newGroup`  | `1`                                 | none    | Opens a blank limit group sheet; wins over `group`. |

Switching the view, filter and sort changes rewrite the address (`replaceState`); opening a group sheet pushes
one (`pushState`), keeping the other keys. Example: `/cards?owner=KC&sort=room&group=<id>`.

### `/card`

| Key  | Values  | Notes |
| ---- | ------- | ----- |
| `id` | card id | Required. A missing or unknown id shows "card not found". |

- `/card?id=<id>` -- the card's page.

### `/card/new`

No query. The add-card form.

### `/card/edit`

| Key  | Values  | Notes |
| ---- | ------- | ----- |
| `id` | card id | Required. A missing or unknown id shows "card not found". |

- `/card/edit?id=<id>` -- the edit form; its back link leads to `/card?id=<id>`.

## Purchase lists

Each list status has its own page. A link to a stored list goes to the page for its status:
`draft` to `/list/draft`, `sent` to `/list/reply`, `saved` to `/list/view`. A page opened on
a list in another status says so and links to the right page; an unknown id links Home.

### `/list/new`

Two steps on one path, told apart by `card`.

Picker step (no `card`):

| Key     | Values                      | Default | Notes |
| ------- | --------------------------- | ------- | ----- |
| `q`     | any text                    | empty   | Search. |
| `loc`   | location id (repeated)      | any     | Kept only when the id is a stored location. |
| `owner` | `KC`, `NT`, `RI` (repeated) | any     | Card owner. |
| `sort`  | `room`, `close`, `due`      | `room`  | Order. |

Entering step (any `card`):

| Key    | Values             | Notes |
| ------ | ------------------ | ----- |
| `card` | card id (repeated) | Cards on the new list, in order. Cards that cannot take purchases are dropped. Other keys are kept ahead of the cards. |

- `/list/new` -- the picker.
- `/list/new?owner=KC&sort=due` -- the picker, filtered and sorted.
- `/list/new?card=<id>&card=<id>` -- entering amounts for those cards.

### `/list/draft`

| Key  | Values  | Notes |
| ---- | ------- | ----- |
| `id` | list id | Required. Edits a draft list. |

### `/list/reply`

| Key  | Values  | Notes |
| ---- | ------- | ----- |
| `id` | list id | Required. The spender's reply to a sent (waiting) list. |

### `/list/view`

| Key  | Values  | Notes |
| ---- | ------- | ----- |
| `id` | list id | Required. A saved list. |

## Settings

### `/settings`

No query.

### `/settings/locations`

No query.

## Trailing slash

One trailing slash is ignored when picking the active tab, so `/cards/` highlights Cards.
