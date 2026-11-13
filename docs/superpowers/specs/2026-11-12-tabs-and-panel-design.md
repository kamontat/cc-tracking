# Tabs and a detail panel: design

Date: 2026-11-12. Status: draft, for the user to settle the decisions below. Mockup:
`2026-11-12-tabs-and-panel-mockup.html` (open it in a browser; the address bar on top of each
device follows every click).

## Why

Transactions and Cards change shape with the screen. On a phone each shows one view behind a
switch (`?view=owed`, `?view=groups`); from 900px both views sit side by side and the switch,
and the address, are ignored (DD-79, DD-144). A record opens somewhere else: a card is its own
page (`/card?id=`), a group a sheet, a list one of four pages by status. So the same address
means two layouts, and opening a record loses the list it came from.

The user asked (2026-11-12) for tabs, one view at a time on every screen, with a record opening
beside its list on a desktop and in a sheet that slides up on a phone.

## The layout

### Tabs

- **Home**: _Needs you · Ready to use_, what to do now. **Transactions**: _Ledger · Lists_,
  what happened. **Cards**: _Cards · Owed · Limits_, where each card stands.
- The tabs sit under the page title, a row of underlined labels that scrolls sideways if it
  must, the same on every width. They are links: each tab is its own address (below), so a
  tab is reached by Back, a bookmark or a pasted link.
- Each tab has its own search, filter and sort, as today. Changing them rewrites the address in
  place (`replaceState`).
- Owed no longer sits beside the ledger on a desktop: it is a tab on Cards (decision 1).

### The detail panel

- Tapping a record opens its **panel**: from 900px a column on the right (about 400px) beside
  the list, which narrows and stays usable; below 900px a sheet that slides up over the list
  (about 92% of the height) with a backdrop.
- One panel at a time. On a desktop, choosing another record swaps the panel's content; on a
  phone the sheet covers the list, so it closes first.
- Closing: the × in the panel's head, Escape, Back, and on a phone the backdrop or a swipe down.
- The panel's head names the record (chip, name, id) and holds its few header actions
  (_Edit_, the `MoreMenu`), as the card page's sub-header does today.
- **Address and history.** Opening a panel from nothing pushes an entry, so Back closes it.
  Swapping it for another record from the list rewrites that entry, so Back never walks through
  every card looked at. Going deeper from inside the panel (its pay or purchase form, a group's
  card, a group's form) pushes, so Back returns to where the panel was. A reload or a pasted
  address opens the panel at once.
- What the panel holds by kind:
  - **Card**: what `/card` shows today, fitted to the column: the hero (room, owed, next bill),
    the comment and over-room note, the actions (_Use on a list_, _Add purchase_, _Pay_), and
    the statements, newest first, with _Show older_. _Edit_ turns the panel into the card form;
    _+ Add card_ opens a blank one.
  - **Limit group**: its name, limit, used and room, and its cards (each opens that card's
    panel). _Edit_ turns the panel into today's group form; _+ Add limit_ opens a blank one.
  - **List**: its status, date, lines and total, and the actions its status allows
    (_Continue_ for a draft, _Enter reply_ for a waiting list, _Merge_, _Delete_).

### Work inside a panel (decision 3)

_Pay_, _Add purchase_, editing a purchase and editing the card or group itself replace the
panel's content, with a ‹ back to the record in the panel's head, instead of a sheet on top of a
sheet or a page of its own. Saving, _Cancel_ or ‹ returns to the record: a step back when its
panel is the entry before, else the address is rewritten to it (a form opened straight from an
owed tile, _Needs you_ or a pasted link). Each form is in the address (`pay`, `purchase`,
`edit`, `card=new`, `limit=new`), so a pasted link opens it. Adding a card or a group ends on the
new record's panel.

The card form fits the column as it is: its four sections (_Card_, _Where_, _Statement_,
_Comment_) are already one column of fields. On a phone the sheet is the full height while a form
is open, and the save button stays in view at its foot.

**Unsaved changes.** A form in the panel is one click from being swapped away, so picking another
record, ×, Escape or the backdrop asks first (_Discard your changes?_) once a field has changed.
Back leaves without asking, as leaving a page does today (no page guards a form now).

## Decisions to settle

Each has a recommendation, drawn in the mockup.

1. **Owed moves to Cards** (reverses RD-13's "On a desktop, what each card owes sits beside the
   ledger", DD-79's two columns and DD-144's). Owed is a list of cards, each its bill, due date
   and _Pay_: where each card stands, like _Cards_ and _Limits_, while the ledger and _Lists_ are
   what happened. Its tiles open the card's panel, whose home is Cards. It sits second,
   _Cards · Owed · Limits_. Lost: a payment landing in the ledger next to what is owed; the pay
   form returns to the card's panel, which shows what is left. Decided by the user, 2026-11-13.
   Not merged into _Cards_ (decided by the user, 2026-11-13): the two differ in which cards
   (every card, or those that owe), their order (by place, or most urgent first, flat), the
   tile's lead number (room, or the bill) and its action (none, or _Pay_). Merged, the bills
   view would be `/cards?owing=1&sort=urgency&by=none` on every visit, over 76 cards, with a
   tile carrying both numbers; and _+ New › Pay_ would land on a view no tab shows.
2. **The card page and the card form become the card panel**, as the limit group's summary and
   form are. `/card`, `/card/new` and `/card/edit` go; the Cards tab is one page. Recommended:
   yes (the user asked, 2026-11-13). Cost: the unsaved-changes prompt above, which no page has
   today.
3. **Pay, purchase and edit inside the panel** replace its content (above), never stack.
   Recommended: yes.
4. **Which records open in a panel.** Recommended: cards, limit groups and lists. A ledger row
   keeps opening in place (`ActionRow`), as it holds only its own buttons; its _Open card_
   opens the card's panel. Writing a list stays a full page, as the builder and the reply are
   too big for a column: _Continue_ and _Enter reply_ go to `/lists/edit?list=<id>`, which
   picks the builder or the reply by status (as `/purchases/<id>` was to).
5. **Record keys are named by kind and work on any tab.** Recommended: `card`, `limit` and
   `list`, not `id`, so a card's panel opens over the tab you are on: a ledger row
   (`/transactions?card=12.3`), a list's line, a limit group's card, Home's _Needs you_
   (`/?card=12.3`). You keep your place instead of jumping to the Cards tab. Each key is singular
   (one record); a filter that repeats stays plural (`cards=`), so the two never read alike.
6. **_+ New › Pay_ goes to the Owed tab** (`/cards/owed`) instead of its own picker page (`/pay`
   and `PayPicker` retire): each owed tile has _Pay_. Trade-off: a card that owes nothing is not
   on Owed, so paying ahead is from its panel (Cards tab, _Pay_). Recommended: yes; the
   alternative keeps a picker at `/payments/new`.
7. **Home gets tabs too**: _Needs you_ first at `/`, _Ready to use_ at `/ready` (amends RD-15
   and DD-184's two columns). Decided by the user, 2026-11-13. Each tab has the screen to itself,
   so both show everything and _See more (N)_ / _Show less_ go (amends DD-106): _Needs you_ every
   row, in DD-62's order, its rows still opening in place; _Ready to use_ every ready card, not
   four, sorted by most room with the new-list picker's old sorts back (most room, longest to
   close, latest due). A tile, a card's name, _Pay_ or a list row opens the panel over Home.
   `/ready` is a top-level path, as Home's own is `/`; the tab bar lights Home for it.
   Settings keeps its two columns (CD-11): it has no records to open.

## Addresses

Rules: the path names the page and its tab; the query holds the tab's list settings and the
open panel; nothing uses the fragment. A key at its default is left out. A key that repeats is
plural and repeats once per value (`?cards=12.3&cards=7`); a record key is singular. One
trailing slash is redirected away (301). No redirect from an old address; `/backup` goes.

Card ids are `^[a-z]?[0-9]+(\.[0-9]+)*$`, lower case only (`5`, `12.3`, `k1.2`; not `5.`, `.5`,
`1..2`, `K1`), checked by the card form and by restore, so no card id can be `new`. Every card in the user's 2026-11-07
backup already matches. Group and list ids are UUIDs; location ids are lower-case words. None
needs escaping.

### Panel keys, on every page that shows the panel

| Key        | Values                    | Notes                                                                                          |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `card`     | card id, `new`            | That card's panel; `new` a blank card form (no card id can be `new`). An unknown or invalid id opens nothing. |
| `pay`      | `1`                       | With `card`: the panel's pay form, starting at the next bill.                                  |
| `amount`   | whole satang > 0          | With `pay`: the amount filled in. Anything else is dropped.                                    |
| `purchase` | `new`, purchase id        | With `card`: the panel's purchase form, blank or on that purchase. Wins over `pay`.            |
| `limit`    | group id, `new`           | That limit group's panel; `new` a blank group form. Only on `/cards/limits`.                   |
| `list`     | list id                   | That list's panel. Only on `/transactions/lists` and `/` (_Needs you_).                        |
| `edit`     | `1`                       | With `card` or `limit`: the record's form instead of its summary.                              |

`card` wins over `limit` and `list` when more than one is given; `purchase` wins over `pay`, and
`pay` over `edit`.

### Pages

| Address               | Tab          | Query, besides the panel keys                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Home         | none: _Needs you_                                                                                                                                                                                                                                                                                                                            |
| `/ready`              | Home         | `sort` (`room`, `close`, `due`; default `room`); `dir` (`asc`, `desc`; default `desc`: most room, longest to close, latest due first)
| `/transactions`       | Transactions | `q` (text); `types` (`purchase`, `payment`); `cards` (card id); `range` (`today`, `week`, `month`, `lastMonth`, `custom`); `from`, `to` (`YYYY-MM-DD`); `sort` (`date`, `amount`; default `date`); `dir` (`asc`, `desc`; default `desc`); `by` (`day`, `card`, `none`; default `day`)                                         |
| `/transactions/lists` | Transactions | `q` (a line's card id, name, last 4 or note); `statuses` (`draft`, `sent`, `saved`); `cards`; `range`, `from`, `to` (on the list's date); `by` (`status`, `month`, `none`; default `status`). Its own page now, so the `l` prefix goes.                                                                                       |
| `/lists/new`          | Transactions | `cards` (card id, in order, each once; cards that cannot take purchases are dropped); `add` (`1`: the add-a-card sheet's picker); `open` (card id: that card in the sheet)                                                                                                                                                    |
| `/lists/edit`         | Transactions | `list` (list id, required: the builder for a draft, the reply for a waiting list; a saved list or an unknown id says so and links to its panel or Home); `add`, `open` as on `/lists/new`, read for a draft only                                                                                                              |
| `/cards`              | Cards        | `q` (text); `locations` (stored location id); `owners` (`KC`, `NT`, `RI`); `ungrouped` (`1`); `sort` (`card`, `room`, `name`, `close`, `due`; default `card`); `dir` (`asc`, `desc`; default `desc` for `room`, else `asc`); `by` (`place`, `holder`, `limit`, `none`; default `place`)                                       |
| `/cards/owed`        | Cards        | `sort` (`urgency`, `card`, `due`, `left`; default `urgency`); `dir` (`asc`, `desc`; default `desc` for `left`, else `asc`). Its own page now, so `owed` and `odir` lose their prefix. Only cards that owe.                                                                                                                                         |
| `/cards/limits`       | Cards        | `q` (a group's or its cards' names); `owners`; `sort` (`name`, `room`, `used`; default `name`); `dir` (default `desc` for `room` and `used`, else `asc`)                                                                                                                                                                        |
| `/settings`           | Settings     | none                                                                                                                                                                                                                                                                                                                            |
| `/settings/locations` | Settings     | none                                                                                                                                                                                                                                                                                                                            |

The builder's sheet keeps `add` and `open` (DD-195): they open a sheet over a full page, not a
record's panel. `/cards/limits` gains its own search and sort, which the group panels lack
today; dropping them keeps it a plain list (decide with 1).

Every page is a static file, so no address needs a rewrite: `_redirects`, local dev, preview
and the offline worker work as they are (the worker already ignores the query).

| Was                                        | Now                                         |
| ------------------------------------------ | ------------------------------------------- |
| `/transactions?view=owed`                  | `/cards/owed`                               |
| `/transactions?view=lists`                 | `/transactions/lists`                       |
| `/pay`, `/pay?card=<id>&amount=<satang>`   | `/cards/owed`, `…?card=<id>&pay=1&amount=<satang>` |
| `/list/new`                                | `/lists/new`                                |
| `/list/draft?id=`, `/list/reply?id=`       | `/lists/edit?list=`                         |
| `/list/view?id=`                           | `/transactions/lists?list=`                 |
| `/cards?view=groups`                       | `/cards/limits`                             |
| `/cards?group=<id>`, `?newGroup=1`         | `/cards/limits?limit=<id>`, `?limit=new`    |
| `/card?id=`                                | `/cards?card=`                              |
| `/card/new`, `/card/edit?id=`              | `/cards?card=new`, `/cards?card=<id>&edit=1` |
| Home's _Ready to use_ (part of `/`)        | `/ready`                                    |
| `/backup`                                  | gone                                        |

## When it ships

PRD.md and PRD_TH.md: new decisions for the tabs, the panel, the card page's retirement, the
pay picker's, the card form in the panel and its unsaved-changes prompt, Home's tabs, the addresses and the card id format; RD-13, DD-76, DD-79, DD-144, CD-01 and DC-17
amended. ENDPOINTS.md rewritten from the tables above. The `TODO.md` endpoint item is replaced
by this spec.

Suggested order, each its own pull request: (1) the card id check; (2) the panel molecule and
the card panel on `/cards`; (3) tabs and paths for Cards, Owed among them; (4) the same for Transactions and
lists; (5) Home's tabs and panel; (6) retire `/card`, `/card/new`, `/card/edit`, `/pay`, `/list/*`.
