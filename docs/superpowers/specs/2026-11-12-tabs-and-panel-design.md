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

- **Home**: _Needs you · Owed · Ready to use_, what to do: what needs you, what to pay, where
  to spend. **Transactions**: _Ledger · Lists_, what happened. **Cards**: _Cards · Limits_, the
  cards and their set-up.
- The tabs sit under the page title, a row of underlined labels that scrolls sideways if it
  must, the same on every width. They are links: each tab is its own address (below), so a
  tab is reached by Back, a bookmark or a pasted link.
- Each tab has its own search, filter and sort, as today. Changing them rewrites the address in
  place (`replaceState`).
- Owed no longer sits beside the ledger on a desktop: it is a tab on Home (decision 1).

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
sheet or a page of its own. **No form is in the address** (the user asked, 2026-11-13): the
address names the record whose panel is open (`?card=<id>`, `?limit=<id>`), never what is being
done in it. Opening a form pushes an entry with the address unchanged, so Back returns to the
record; a reload or a pasted link shows the record's summary, and the form is a tap away.
Saving, _Cancel_ or ‹ returns to the record: a step back over the form's entry, or, for a form
opened straight from a bill (_Pay_ on an owed tile or in _Needs you_, which opens the card's
panel on its pay form with the amount left filled in), the panel's content swaps back in place.
A new card's or group's blank form works the same: _+ Add card_ and _+ Add limit_ open it with
the address unchanged, and adding the record writes its address (`?card=<id>`, `?limit=<id>`)
over the form's entry, so the panel shows the new record and the list behind has it.

The card form fits the column as it is: its four sections (_Card_, _Where_, _Statement_,
_Comment_) are already one column of fields. On a phone the sheet is the full height while a form
is open, and the save button stays in view at its foot.

**Unsaved changes.** A form in the panel is one click from being swapped away, so picking another
record, ×, Escape or the backdrop asks first (_Discard your changes?_) once a field has changed.
Back leaves without asking, as leaving a page does today (no page guards a form now).

### Starting a list or a payment

- **No floating _+ New_** (retires DD-104; the user asked, 2026-11-13). Each thing starts where
  it lives: a list on the _Lists_ tab or a card, a payment on a bill or a card.
- **A list** starts from _+ Add list_ at the end of the _Lists_ tab's search row (as _Cards_ has
  _+ Add card_ and _Limits_ _+ Add limit_, the three the same quiet button), or from a card's
  _Use on a list_, which starts it with that card (`/transactions/lists/new?cards=<id>`).
- `/transactions/lists/new` is a full page (not a panel) under the _Lists_ tab's path, and the
  tab bar lights Transactions. The page is today's builder (DD-195): a sub-header with ‹ (Back), the
  lines, _+ Add a card_, and a footer with the total, _Save as draft_ and _Review_. Its
  add-a-card sheet is no longer in the address (amends DD-195; the user asked, 2026-11-13): `add`
  and `open` go. Opening it pushes an entry with the address unchanged, so Back closes it;
  picking a card in it, _All cards_ and the card before or after change nothing in the address;
  _Add to list_, _Remove from list_, _Done_ or × close it by stepping back over its entry. A new
  list's cards stay in `cards`, rewritten as cards are added or removed, so a reload keeps them
  (nothing is stored until _Save as draft_). On a desktop the sheet is a dialog in the middle,
  as today.
- A draft's _Continue_ and a waiting list's _Enter reply_ (in the list's panel) go to
  `/transactions/lists/edit?list=<id>`: the builder on the draft, or the reply. A saved list has no edit page;
  its panel is all there is.
- Saving leaves with `location.replace`, as today, but for the _Lists_ tab with the list just
  written open in its panel, `/transactions/lists?list=<id>` (today it is `/`; the user asked,
  2026-11-13), so the reader sees what was saved among the other lists, and Back does not reopen
  the builder.
- **A payment** starts from _Pay_ on a bill in Home's _Owed_ tab, which opens the card's pay form
  in the panel, or from _Pay_ in any card's panel (a card that owes nothing, paying ahead).
  `/pay` and its card picker retire.

## Decisions to settle

Each has a recommendation, drawn in the mockup.

1. **Owed moves to Home** (reverses RD-13's "On a desktop, what each card owes sits beside the
   ledger", DD-79's two columns and DD-144's). Owed is the cards seen through a task, as _Ready
   to use_ is: _Ready to use_ is where to spend, _Owed_ what to pay. Paying is something done,
   not a card's set-up, so Cards keeps the cards and their limits. It sits between the two,
   _Needs you · Owed · Ready to use_, at `/owed`; its tiles open the card's panel over Home
   (decision 5). An overdue bill shows in both _Needs you_ (what is urgent) and _Owed_ (every
   bill). Lost: a payment landing in the ledger next to what is owed; the pay form returns to
   the card's panel, which shows what is left. Decided by the user, 2026-11-13, after a day on
   Cards (`/cards/owed`). Not merged into _Cards_ (decided by the user, 2026-11-13): the two differ in which cards
   (every card, or those that owe), their order (by place, or most urgent first, flat), the
   tile's lead number (room, or the bill) and its action (none, or _Pay_). Merged, the bills
   view would be `/cards?owing=1&sort=urgency&by=none` on every visit, over 76 cards, with a
   tile carrying both numbers.
2. **The card page and the card form become the card panel**, as the limit group's summary and
   form are. `/card`, `/card/new` and `/card/edit` go; the Cards tab is one page. Decided by the
   user, 2026-11-13. Cost: the unsaved-changes prompt above, which no page has today.
3. **Pay, purchase and edit inside the panel** replace its content (above), never stack.
   Decided by the user, 2026-11-13.
4. **Which records open in a panel**: cards, limit groups and lists. Decided by the user,
   2026-11-13. A ledger row keeps opening in place (`ActionRow`), as it holds only its own
   buttons, and its _Open card_ opens the card's panel: decided for now, and may move to a panel
   of its own later. Writing a list stays a full page, as the builder and the reply are
   too big for a column: _Continue_ and _Enter reply_ go to `/transactions/lists/edit?list=<id>`, which
   picks the builder or the reply by status (as `/purchases/<id>` was to). Decided by the user,
   2026-11-13.
5. **Record keys are named by kind and work on any tab.** Decided by the user, 2026-11-13: `card`, `limit` and
   `list`, not `id`, so a card's panel opens over the tab you are on: a ledger row
   (`/transactions?card=12.3`), a list's line, a limit group's card, Home's _Needs you_
   (`/?card=12.3`). You keep your place instead of jumping to the Cards tab. Each key is singular
   (one record); a filter that repeats stays plural (`cards=`), so the two never read alike.
6. **No floating _+ New_, and no pay picker** (retires DD-104 and the `/pay` picker, DD-76).
   Decided by the user, 2026-11-13: a list starts on the _Lists_ tab or a card, a payment on a
   bill in _Owed_ or a card's panel (above). Lost: one button that starts either from any page;
   from Cards or Transactions, paying is a tab switch to Home's _Owed_ or a card's panel away.
7. **Home gets tabs too**: _Needs you_ first at `/`, _Owed_ at `/owed` (decision 1), _Ready to
   use_ at `/ready` (amends RD-15
   and DD-184's two columns). Decided by the user, 2026-11-13. Each tab has the screen to itself,
   so each shows everything and _See more (N)_ / _Show less_ go (amends DD-106): _Needs you_ every
   row, in DD-62's order, its rows still opening in place; _Ready to use_ every ready card, not
   four, sorted by most room with the new-list picker's old sorts back (most room, longest to
   close, latest due). A tile, a card's name, _Pay_ or a list row opens the panel over Home.
   `/owed` and `/ready` are top-level paths, as Home's own is `/`; the tab bar lights Home for
   them.
   Settings keeps its two columns (CD-11): it has no records to open.

8. **Every card has a limit group** (the user asked, 2026-11-13). A card without one is invalid
   data, so the code for it goes:
   - the card form's limit group is required (no _Choose a limit group_ that saves as none); with
     no group stored yet, the form says to add one first, from _Limits_;
   - restore rejects a card with no `limitGroupId` or one naming a group not in the file
     (amends DC-06, which did not check it), and writes nothing, as for any bad record;
   - Cards loses its _Not in a group_ filter (`ungrouped`) and the _Not in a group_ section under
     _Group by: Limit group_;
   - _Ready to use_ loses "N cards have no limit group yet" and its _Assign them_ link
     (`/cards?ungrouped=1`); the card panel loses "This card draws on no limit group" and "Give
     this card a limit group (Edit) to use it on a list"; a tile loses _No limit group_
     (`unassignedCards`, `card.hero.noGroup`, `card.noGroupNote`, `cards.page.noGroup`,
     `spendable.unassigned.*`, `cards.filter.ungrouped`);
   - deleting a group that has cards is already refused (`guard.groupInUse`), so no write can
     leave a card without one.
   Every card in the user's 2026-11-07 backup has a group that exists, so no stored data turns
   invalid. Code that still meets a card without one (a hand-edited store) treats it as invalid
   data, as it does a card at an unknown location: left out, never drawn as a special case.

## Addresses

Rules: the path names the page and its tab; the query holds the tab's list settings and the
open panel; nothing uses the fragment. Query keys come in three kinds, told apart by name (the
user asked, 2026-11-13):

- **Filters** start with `f.`: they narrow which rows show (`f.cards`, `f.from`, `f.to`, …). The
  dot is not escaped in a query, so the address reads as written.
- **Search** is `q`, with no prefix: the one free-text box each list has.
- **View** keys have no prefix: `sort`, `dir` and `by` order the rows and cut them into sections.
- **Data** keys have no prefix: they name a record (`card`, `limit`, `list`) or hold a page's
  own content (the builder's `cards`). A filter can never be read as data: `f.cards` filters,
  `cards` is what a new list holds, `card` is the open card.
 A key at its default is left out. A key that repeats is
plural and repeats once per value (`?cards=12.3&cards=7`); a key naming one record is singular.
One trailing slash is redirected away (301). No redirect from an old address; `/backup` goes.
Every page is a static file, so no address needs a rewrite: `_redirects`, local dev, preview and
the offline worker work as they are (the worker already ignores the query).

Card ids are `^[a-z]?[0-9]+(\.[0-9]+)*$`, lower case only (`5`, `12.3`, `k1.2`; not `5.`, `.5`,
`1..2`, `K1`), checked by the card form and by restore. Every card in the user's 2026-11-07
backup already matches. Group and list ids are UUIDs; location ids are lower-case words. None
needs escaping.

### The panels' keys

Each page lists which panels it opens; these are their keys.

- **Card panel**: `card` (card id; unknown or invalid opens nothing). Its forms (edit, pay,
  purchase) and a new card's form have no key.
- **Limit panel**: `limit` (group id). Its form and a new group's form have no key.
- **List panel**: `list` (list id). No keys of its own: writing a list is a page.

When a page takes more than one record key, `card` wins.

### Pages

**`/`**, Home, _Needs you_. Query: none. Panels: card, list.

**`/owed`**, Home, _Owed_: only cards that owe. Panels: card.

| Key    | Values                           | Default                       |
| ------ | -------------------------------- | ----------------------------- |
| `sort` | `urgency`, `card`, `due`, `left` | `urgency`                     |
| `dir`  | `asc`, `desc`                    | `desc` for `left`, else `asc` |

**`/ready`**, Home, _Ready to use_: every ready card. Panels: card.

| Key    | Values                 | Default                                          |
| ------ | ---------------------- | ------------------------------------------------ |
| `sort` | `room`, `close`, `due` | `room`                                           |
| `dir`  | `asc`, `desc`          | `desc` (most room, longest to close, latest due) |

**`/transactions`**, Transactions, _Ledger_. Panels: card (a row's _Open card_).

| Key       | Values                                          | Default |
| --------- | ----------------------------------------------- | ------- |
| `q`       | any text                                        | empty   |
| `f.types` | `purchase`, `payment` (repeats)                 | any     |
| `f.cards` | card id (repeats)                               | any     |
| `f.range` | `today`, `week`, `month`, `lastMonth`, `custom` | none    |
| `f.from`  | `YYYY-MM-DD`; an invalid date is dropped        | none    |
| `f.to`    | `YYYY-MM-DD`; an invalid date is dropped        | none    |
| `sort`    | `date`, `amount`                                | `date`  |
| `dir`     | `asc`, `desc`                                   | `desc`  |
| `by`      | `day`, `card`, `none`                           | `day`   |

**`/transactions/lists`**, Transactions, _Lists_. Panels: list, card (a list's line).

| Key         | Values                                          | Default  |
| ----------- | ----------------------------------------------- | -------- |
| `q`         | a line's card id, name, last 4 or note          | empty    |
| `f.statuses`| `draft`, `sent`, `saved` (repeats)              | any      |
| `f.cards`   | card id (repeats)                               | any      |
| `f.range`   | `today`, `week`, `month`, `lastMonth`, `custom` | none     |
| `f.from`    | `YYYY-MM-DD`, on the list's date                | none     |
| `f.to`      | `YYYY-MM-DD`, on the list's date                | none     |
| `by`        | `status`, `month`, `none`                       | `status` |

**`/transactions/lists/new`**, Transactions: the builder, a full page. Panels: none; its
add-a-card sheet is not in the address.

| Key     | Values            | Notes                                                                                     |
| ------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `cards` | card id (repeats) | The cards on the new list, in order, each once; cards that cannot take purchases are dropped |

**`/transactions/lists/edit`**, Transactions: a full page. Panels: none; the add-a-card sheet is
not in the address.

| Key    | Values            | Notes                                                                                                                              |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `list` | list id, required | The builder on a draft, the reply on a waiting list; a saved list or an unknown id says so and links to its panel or the Lists tab |

**`/cards`**, Cards, _Cards_. Panels: card.

| Key          | Values                                 | Default                       |
| ------------ | -------------------------------------- | ----------------------------- |
| `q`          | any text                               | empty                         |
| `f.locations`| stored location id (repeats)           | any                           |
| `f.owners`   | `KC`, `NT`, `RI` (repeats)             | any                           |
| `sort`       | `card`, `room`, `name`, `close`, `due` | `card`                        |
| `dir`        | `asc`, `desc`                          | `desc` for `room`, else `asc` |
| `by`         | `place`, `holder`, `limit`, `none`     | `place`                       |

**`/cards/limits`**, Cards, _Limits_. Panels: limit, card (a group's card). The search and sort
are new: the group panels have none today.

| Key       | Values                        | Default                                  |
| --------- | ----------------------------- | ---------------------------------------- |
| `q`       | a group's or its cards' names | empty                                    |
| `f.owners`| `KC`, `NT`, `RI` (repeats)    | any                                      |
| `sort`    | `name`, `room`, `used`        | `name`                                   |
| `dir`     | `asc`, `desc`                 | `desc` for `room` and `used`, else `asc` |

**`/settings`** and **`/settings/locations`**, Settings. Query: none. Panels: none.

### Was and now

| Was                                      | Now                                                      |
| ---------------------------------------- | -------------------------------------------------------- |
| `/transactions?view=owed`                | `/owed`                                                  |
| `/transactions?view=lists`               | `/transactions/lists`                                    |
| `/pay`, `/pay?card=<id>&amount=<satang>` | `/owed`; the pay form is _Pay_ on the bill (no address)  |
| `/list/new`                              | `/transactions/lists/new`                                |
| `/list/draft?id=`, `/list/reply?id=`     | `/transactions/lists/edit?list=`                         |
| `/list/view?id=`                         | `/transactions/lists?list=`                              |
| `/cards?view=groups`                     | `/cards/limits`                                          |
| `/cards?group=<id>`, `?newGroup=1`       | `/cards/limits?limit=<id>`; a new group has no address   |
| `/card?id=`                              | `/cards?card=`                                           |
| `/card/new`, `/card/edit?id=`            | none: forms in the panel have no address                 |
| Home's _Ready to use_ (part of `/`)      | `/ready`                                                 |
| `/backup`                                | gone                                                     |

Renamed keys: the filters take `f.`: `type` → `f.types`, the ledger's `card` → `f.cards`,
`range`/`from`/`to` → `f.range`/`f.from`/`f.to`, `status` → `f.statuses`, `loc` →
`f.locations`, `owner` → `f.owners`; the Lists view's `lq` → `q`, its `lcard`, `lrange`,
`lfrom`, `lto` → `f.cards`, `f.range`, `f.from`, `f.to`, and `lby` → `by`; `owed`, `odir` →
`/owed`'s `sort`, `dir`; the builder's `card` → `cards`. `q` stays `q`. Gone: `view`, `id`,
`group`, `newGroup`, `ungrouped`, and the builder's `add` and `open`.

## When it ships

PRD.md and PRD_TH.md: new decisions for the tabs, the panel, the card page's retirement, the
pay picker's and _+ New_'s, the card form in the panel and its unsaved-changes prompt, Home's tabs with Owed
among them, the addresses and the card id format; RD-13, RD-15, DD-76, DD-79, DD-104 (retired), DD-106, DD-144,
DD-184, CD-01 and DC-17 amended. ENDPOINTS.md rewritten from the tables above. The `TODO.md` endpoint item is replaced
by this spec.

Suggested order, each its own pull request: (1) the card id check; (2) the panel molecule and
the card panel on `/cards`; (3) tabs and paths for Cards; (4) the same for Transactions and
lists; (5) Home's tabs, Owed among them, and its panel; (6) retire `/card`, `/card/new`, `/card/edit`, `/pay`, `/list/*`.
