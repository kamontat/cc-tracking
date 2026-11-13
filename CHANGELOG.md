# Changelog

This changelog is built from the design specs written for each stage of the project. Entries
are newest first. Each one says what changed and keeps the decisions behind it, because the
reasons don't show up in the code.

## 2026-11-14: Data versions 1 and 2 removed, and locations and owners in a panel over settings

### BREAKING CHANGES

- Restore refuses a version 1 or 2 backup and writes nothing. Restore it in an older build and
  download a fresh copy, which is version 4 (DD-202).

- Startup no longer converts the old per-statement payments (`cc:payment:<cardId>:<period>`). A
  browser that never opened the app after phase 4 loses those payments; payments converted
  earlier (`m:` ids) are kept. A reset still clears the leftover records.

- `StatementPayment`, `Statement`, `PaymentPart`, the repository's `listPayments`,
  `savePayment` and `deletePayment`, `buildStatement`, `partsOf`, `migratePayments` and
  `convertPayments` are gone, and `replaceWithBackupV4` no longer takes a storage argument.
  Message keys removed: `startup.paymentsFailed`, `backup.payment`, `backup.problem.badLocation`,
  `backup.problem.badPaidAt` and `backup.problem.badParts`.

- `/settings/locations` and `/settings/owners` are gone, each a 404, with no redirect: Locations
  and Owners open at `/settings?panel=locations` and `/settings?panel=owners`. Update bookmarks
  (DD-203).

- The static `SubHeader` molecule, the `.page--form` width and the message keys
  `title.locations`, `title.owners` and `locations.takesHint` are removed.

### Features

- _Manage locations_ and _Manage owners_ open their editor in the detail panel beside Settings
  (a sheet on a phone), at `?panel=locations` and `?panel=owners`. A row's click opens its panel
  in place and marks the row; the other row swaps it; ×, Escape and Back close it. A write in the
  panel updates the row's summary at once, and a restore or _Delete all data_ reads the open
  panel again. Every "choose places in Locations" link goes to the panel (DD-203).

### Improvements

- Beside an open panel, Settings stacks its two columns into one when the page has less than
  `40rem` beside the panel, through a container query on `.settings-layout`.

- A location's _Takes purchases_ tick reads its name alone, without "· its cards show under
  Ready to use".

- The version error names the range of versions read: "This backup is version 2, but this app
  reads versions 3–4." `backup.version` now takes `oldest` and `newest` in place of `expected`.

- Restore reads only versions 3 and 4. The version 2 conversion, its payment and closed-set
  location checks, and the clearing of stale `m:` parts on import are gone, so every Merge is
  purely additive (DD-95 and DD-133 retired).

### Decisions

- The stored-payment conversion went along with version 2 restore, rather than keeping it for
  browsers that never ran it, because the user asked to treat data versions 1 and 2 as removed.

- The existing `backup.version` key gives the message, not a separate "no longer supported"
  one. It gives the versions read as a range, so a later version updates it without new text.

- Locations and Owners are a panel over Settings, as the user asked, so Settings stays in view as
  a card's list does beside its panel. The panel is in the address as `panel=` (the user's
  choice over `manage=`), so a reload or a shared link keeps it, and the old pages went without
  a redirect, as RD-29 does for every retired address.

- Moving the delete note above each list was tried and reverted: the user preferred it under the
  list.

## 2026-11-13: Tabs and a detail panel, card ids and limit groups enforced, and owners managed in settings

### BREAKING CHANGES

- `/card`, `/card/new`, `/card/edit`, `/pay`, `/list/new`, `/list/draft`, `/list/reply` and
  `/list/view` are gone, each a 404, with no redirect: a card opens at `/cards?card=<id>`, a list
  at `/transactions/lists?list=<id>`, a new list at `/transactions/lists/new?cards=<id>`, a draft
  or a waiting list at `/transactions/lists/edit?list=<id>`, and a payment starts from _Pay_ on a
  bill in _Owed_ or in a card's panel. Update bookmarks (DD-200).

- The `/backup` redirect to `/settings` is gone, and `public/_redirects` with it.

- Address keys changed (RD-29): filters take `f.` (`type` → `f.types`, the ledger's `card` →
  `f.cards`, `range`/`from`/`to` → `f.range`/`f.from`/`f.to`, `status` → `f.statuses`, `loc` →
  `f.locations`, `owner` → `f.owners`); the Lists view's `lq`, `lcard`, `lrange`, `lfrom`, `lto`
  and `lby` are now `/transactions/lists`' `q`, `f.cards`, `f.range`, `f.from`, `f.to` and `by`;
  the builder's `card` is `cards`. `view`, `id`, `group`, `newGroup`, `ungrouped` and the
  builder's `add` and `open` are no longer read. An old link opens the default view.

- `/transactions?view=owed` is `/owed`, `/transactions?view=lists` is `/transactions/lists`, and
  `/cards?view=groups` is `/cards/limits`; Home's _Ready to use_ is its own tab at `/ready`.

- The floating _+ New_ button and menu are gone: a list starts from _+ Add list_ on the _Lists_
  tab or a card's _Use on a list_, a payment from _Pay_ on a bill or in a card's panel.

- Restore refuses a backup with a card whose id is outside `^[a-z]?[0-9]+(\.[0-9]+)*$` (`K1`,
  `5.`, `1..2`), with no `limitGroupId`, or naming a limit group not in the file, and writes
  nothing. Fix the file (lower-case ids, a group for every card) and restore again. Every card in
  the 2026-11-07 backup passes (RD-27, RD-28, amends DC-06).

- The _Not in a group_ filter and section and the _No account holder_ section are gone from
  Cards, and _Ready to use_ no longer counts cards without a limit group.

- Message keys removed include `card.hero.noGroup`, `card.noGroupNote`, `cards.page.noGroup`,
  `cards.filter.ungrouped`, `spendable.unassigned.*`, `spendable.unassignedAction`,
  `group.noHolder`, `cards.view.*`, `tx.view.*`, `common.seeMore`, `common.showLess`,
  `ready.title`, `tx.owed.title` and the `/pay` picker's keys.

- Backups are now written as version 4, with an `owners` list. The app before this change reads
  only versions 2 and 3, so restore a version 4 file only into the current app. Versions 2 and
  3 still restore (RD-30, DC-05).

- A version 4 backup is refused, with nothing written, when a limit group or a supplementary card
  names an owner the file's `owners` does not have (`backup.problem.unknownOwner`).

- `#lib/storage/transfer-v3` is now `#lib/storage/transfer-v4`, and its exports are renamed
  (`exportBackupV4`, `importBackupV4`, `replaceWithBackupV4`, `countRecordsV4`, `BackupV4`,
  `V4Counts`). `OWNERS` and `toOwner` are gone from `#lib/domain/owner`: owners are stored
  records (`DEFAULT_OWNERS`, `ownerName`, `sortOwners`).

- The Locations page's classes are shared as `.records`, `.record-row`, `.record-add`,
  `.record-error` and `.record-warning` (they were `.locations` and `.location-*`).

### Features

- Home, Transactions and Cards have tabs, one view at a time on every screen, each tab its own
  address: Home _Needs you_ (`/`), _Owed_ (`/owed`) and _Ready to use_ (`/ready`);
  Transactions _Ledger_ (`/transactions`) and _Lists_ (`/transactions/lists`); Cards _Cards_
  (`/cards`) and _Limits_ (`/cards/limits`). The page title sits in the tab bar, before a thin
  divider (RD-22, DD-197 to DD-199).

- A detail panel: a card (`?card=`), a limit group (`?limit=`) or a list (`?list=`) opens beside
  its list from 900px, in a column fixed to the screen whose body scrolls on its own, and in a
  sheet that slides up below 900px. Back, ×, Escape, the backdrop and a swipe down close it, and
  the card panel opens over any tab that shows a card (RD-23, DD-196).

- The card panel holds what the card page did, and its forms open in place with ‹ back to the
  card: _Edit_, _Add purchase_, a purchase's _Edit_, _Make a payment_, and _+ Add card_'s blank
  form. A form with changes asks _Discard your changes?_ before ×, Escape, the backdrop or
  another record drops it (RD-24).

- The limit panel shows a group's room, use and cards, each opening its card's panel, and its
  form; _Limits_ gains a search, a holder filter and a sort by name, room or use.

- The list panel shows a list's status, date, lines and total with the actions its status
  allows; the builder is `/transactions/lists/new`, and a draft or a waiting list opens at
  `/transactions/lists/edit?list=<id>`. Saving opens the saved list in its panel on _Lists_
  (RD-26).

- _Owed_ and _Ready to use_ have Cards' search, location and holder filters, sort and grouping;
  _Owed_ adds a bill filter (`f.states`: overdue, due soon, no bill yet), and _Pay_ on a bill
  opens the card's pay form in its panel with what is left filled in (RD-25).

- Owners are managed in Settings, as locations are: `/settings/owners` adds, renames and deletes
  an owner (only one no limit group or supplementary card names, and never the last). An owner
  is a stored record `{ id, name }` at `cc:owner:<id>`, seeded once as KC, NT and RI (RD-30).

- Every screen shows an owner by its name: tiles, the card and limit panels, Needs you and
  Upcoming rows, group labels, holder sections and filter chips. The group form's _Account
  holder_, the card form's supplementary holder, the _Account holder_ filters and holder
  sections offer every owner, A to Z by name, and `f.owners` takes any stored owner's id.

- At every load and after a restore, every limit group and supplementary card is pointed at a
  stored owner: no owner is KC's, a starting owner whose record is gone comes back, and any
  other unknown owner moves to the first owner A to Z (DC-18).

- Backup version 4 carries the owners. Merge keeps a renamed owner; into a new browser the
  copy's owners replace the seeded ones; _Delete all data_ seeds KC, NT and RI again.

### Improvements

- The card form refuses a new card's id that doesn't match the card id format, and its limit
  group is required: _Choose a limit group_ is a placeholder that can't be picked, and with no
  group stored the form says to add one first, from _Limits_ (RD-27, RD-28).

- A card without a limit group is invalid data, left out of every list like a card at an
  unknown place, and nothing on a card or a tile says it has none.

- Each Home tab has the screen to itself, so _Needs you_ and _Ready to use_ show every row with
  no _See more_; _Ready to use_ is sorted by most room, longest to close or latest due.

- The _Add a card_ sheet in the list builder is wider on a desktop, with the search box every
  list uses and its five sorts always shown as pills, so picking one never changes its height.

- A card that isn't offered on lists says why in a note whose _Settings › Locations_ is the link,
  and the panel's head buttons (‹, _Edit_, ⋯, ×) are one size, with no focus ring left on ⋯
  after a mouse click.

- Settings' Locations section is now _Locations and owners_, one list with a row into each page;
  the owners row names every owner A to Z.

- _Delete_ on a location or an owner swaps in place for _Delete_ (asking "Delete NAME?") and
  _Cancel_ on the row's own line, focus following, as a payment's _Delete_ does; the row keeps
  its name and count (amends DD-129).

### Decisions

- Settled and built the same day as PRD RD-22 to RD-29, from
  `docs/superpowers/specs/2026-11-12-tabs-and-panel-design.md` and its mockup, in six pull
  requests (#73 to #78), the last five stacked.

- One view at a time on every screen: the desktop's two columns made one address mean two
  layouts (RD-22).

- A record opens beside its list, so the reader keeps their place; forms stay out of the address,
  so a reload or a pasted link shows the record, and a form is a tap away. A ledger row still
  opens in place, for now (RD-23, RD-24).

- _Owed_ is a Home tab, not a Cards filter: the two differ in which cards, their order, the lead
  number and the action. It shows only cards that owe, so a card holding only credit is not on
  it (amends DD-89, RD-25).

- Ids go in the query, not the path, so every address stays a static page and needs no rewrite
  rule in `_redirects`, local dev or the offline worker; this replaces the record-path plan
  proved in PR #37 (RD-29).

- The tabs are static links that ship no JavaScript, so they show no counts, which would need
  the reader's data.

- From 900px the panel is fixed to the screen rather than sticky in the page: a sticky column's
  height had to guess what sat above the list, and a tab bar there pushed it past the bottom.

- The page title sits in the tab bar (one line, one rule), chosen from six mockups.

- The card form checks only a new card's id: a stored card's id can't be edited. Restore checks
  version 2 files as well as version 3, as an old file brings cards just the same. The group
  placeholder stays rather than defaulting to the first group, so a new card never lands in a
  group by accident.

- _Record reply_ keeps its name rather than the spec's _Enter reply_, so one action has one
  name.

- Owners keep their seeded ids (`KC`, `NT`, `RI`) and gain a name, so no stored group or card
  changes and a rename only changes what is shown. Rejected: initials as the only key, which
  would rewrite every group and card on a rename (DD-201).

- An unknown owner is repaired at startup rather than read as another owner on the fly, so
  stored data and every screen agree. Rejected: reading it as the first owner without
  rewriting it (DD-201).

- Owners need a new backup version rather than an optional field in version 3, so a file's
  groups and supplementary cards can be checked against its own owners (DD-201).

## 2026-11-12: Building a purchase list a card at a time, with each card's last 12 statements

### BREAKING CHANGES

- The new-list picker page is gone: `/list/new` opens the list itself. Its _Kept in_ and
  _Account holder_ filters, its grouping and its ticks went with it, and the address keys `q`,
  `loc`, `owner`, `sort`, `dir` and `by` on `/list/new` are no longer read; an old link opens
  an empty new list. Cards are picked from the list's _+ Add a card_ sheet instead (DD-195).

### Features

- _+ Add a card_ opens a sheet with every ready card as a tile, its last 12 statement cycles
  drawn under it as small bars with the 12-statement total and the day it was last used, a
  search, and sorts by _Most room_, _Least used_, _Longest unused_, _Longest to close_ and
  _Latest due_ (DD-195).

- A picked card shows its room now, its 12-statement total, the average of its closed
  statements and when it was last used, then a bar per statement (its amount over it, the open
  one faint, the average as a dashed line), then its orders, room after and warnings. _Add &
  pick another_ (or Enter) adds it and goes straight back to the cards (DD-195).

- The sheet lives in the address (`add=1` for the cards, `open=<card id>` for one card) on both
  `/list/new` and `/list/draft`, and Back closes it, as on `/pay` (DD-195).

### Improvements

- The list is one row per card: its total or _No amount yet_, how many orders, its warnings or
  room after, and its notes. A row reopens its card in the sheet to change its orders, step to
  the card before or after, or take it off, so cards can be added and amounts changed in any
  order (DD-195).

- A draft opens on the same list and sheet, and the list page's Back now goes Home.

### Decisions

- Of three mockups (`docs/superpowers/specs/2026-11-11-list-builder-mockup.html`), the user
  chose the list first with cards added from a sheet (option C), over tiles and list on one
  page (A) and a spreadsheet of every card with an amount box (B): it keeps a list with several
  orders per card short on a phone, and puts the most history beside the amount being typed.

- A card's use is counted per statement cycle by its own close day, from the ledger, not per
  calendar month (the user's answer).

- The picker keeps only search and sorts; the filters and grouping were dropped to keep the
  sheet short (the user's answer).

- Opening the sheet takes the client router's state off the list's own entry until Back
  returns, so the router lets that Back be and the page keeps what was typed; without it Astro
  swapped in a fresh page and lost every unsaved amount. Known limit: Forward onto a closed
  sheet and Back again still swaps the page.

## 2026-11-11: Grouping every list, tabbed filter sheets with an order switch, and no stale .gitkeep files

### BREAKING CHANGES

- Cards no longer has a _Place_ sort: place is now a grouping (`by=place`, the default). Old
  links with `sort=place` open on the new default _Card_ sort, which is the old order inside
  each place (DD-192).

- An amount sort on the ledger no longer gives one flat list by itself: it sorts inside each
  day. Choose _Group by: None_ (`by=none`) for one list by amount (DD-192).

### Features

- Every list can be grouped, apart from its sort: each filter sheet has a _Group by_ row and
  each page a _Group: X ▾_ chip. Cards groups by _Place_, _Account holder_, _Limit group_ or
  _None_; the new-list picker by _None_, _Place_ or _Account holder_; the ledger by _Day_,
  _Card_ or _None_; the _Lists_ view by _Status_, _Month_ or _None_. The sort runs inside each
  section, and the choice is kept in the address as `by` (`lby` on the Lists view) (DD-192).

### Improvements

- Each filter sheet is split by tabs under its heading: _Filter_, _Sort_ and _Group_ (the Lists
  view's sheet has _Filter_ and _Group_). It opens on the tab of the control that opened it: the
  _Filter_ button, the sort chip or the group chip. _Clear all_ and _Show N_ act on every tab,
  and a draft keeps its state across tabs (DD-194).

- The sort's direction is a two-part switch at the right of the _Sort_ legend (_↓ Newest_ |
  _↑ Oldest_, _↓ Most_ | _↑ Least_), the field's own direction first, with the field chips
  under it, replacing the second row of order chips. _Owed on each card_ has the same switch,
  arrows only, in place of its single ↑/↓ button (DD-193).

- The empty-folder placeholders `src/components/{atoms,molecules,organisms}/.gitkeep` are gone,
  since each folder holds its components; a test now fails on a `.gitkeep` beside other files.

### Decisions

- Sections come in a fixed order rather than following the sort: places A to Z, holders KC,
  NT, RI then none, limit groups A to Z then none, ledger cards by id, months newest first.
  Ledger days follow the date sort's direction and run newest first under an amount sort.

- The address key is `by`, not `group`, because `group` already opens a limit group's sheet on
  `/cards`.

- The order switch was picked from four mockups: tap a chip again to flip, a chip per order, a
  switch beside the sort, and a radio list with a switch. Each half of the switch is named by
  its full words (_Newest first_) and its short words are always inside them, so what is seen
  is what is said.

## 2026-11-10: Several orders per card on a purchase list, drafts before the review, merging same-day lists, a sectioned and filterable Lists view, a right-aligned update bar, a shorter card choice in the filter sheets, and sorts that run either way

### BREAKING CHANGES

- The ledger's `sort` is now `date` or `amount`, with `dir` for the direction. Old links with
  `sort=new`, `old`, `big` or `small` open on _Newest first_; bookmark the view again to keep
  another order (DD-191).

### Features

- A card on a purchase list can carry more than one order. On _Enter amounts_ the card stays
  one panel with an amount and an optional note per order, _+ Add order_ under them, and a
  small × on each order once there are two (named _Remove order N of <card>_). Each order is
  its own line: a row each on the review, the copied text and the image, answered _Made_ or
  _Not made_ on its own and saved as its own purchase. A reopened draft gathers a card's
  orders back into its one panel (RD-09, DD-186).

- _Save as draft_ sits on _Enter amounts_, under _Review_, so a list can be kept before it is
  reviewed. A draft is the list of cards with each amount optional: only text that is not money
  stops it. A card with no amount yet is stored as amount `0`, which on a draft means "not set";
  it opens blank, reads `—` in an opened row and adds nothing to the total (RD-09, DD-187).

- Lists on the same day with the same status merge: draft with draft, waiting with waiting.
  Saving a draft or marking a list sent on a day that already has one of that kind first asks
  _Merge_ or _Keep separate_, and a draft or waiting row on Home's _Needs you_ and the _Lists_
  view offers _Merge with N other lists_. Every order is kept, a card's orders together, and
  merged waiting lists keep the earliest sent time (DD-187).

- The _Lists_ view has the ledger's search box and _Filter_ button, with no sort. Search
  matches a line's card id, name, last 4 or note; the _Filter lists_ sheet offers _Status_,
  _Card_ and _Date_, and the filters in use show as removable chips. Its address keys are its
  own: `lq`, `status`, `lcard`, `lrange`, `lfrom`, `lto` (DD-189).

- The _Card_ section of the ledger's and the _Lists_ view's filter sheets stays short with many
  cards: past eight it adds a _Find a card_ box (id, name or last 4) and shows the first eight
  chips plus any card already picked, then _Show all N cards_ / _Show fewer_. Eight or fewer
  cards look as before (DD-190).

- Every sort runs either way. The ledger sorts by _Date_ or _Amount_, _Owed_ by _Urgency_,
  _Card_, _Due date_ or _Owed_, Cards by _Place_, _Room_, _Name_, _Close date_ or _Due date_, and
  the new-list picker by _Room_, _Close date_ or _Due date_, each ascending or descending. The
  filter sheets' _Sort_ section shows the fields, then the picked field's two orders in words
  (_↓ Newest first_, _↑ Oldest first_); _Owed on each card_ has a ↑/↓ button beside its sort
  select. The direction is kept in the address as `dir` (`odir` for _Owed_) (DD-191).

### Improvements

- Room after, the over-room and shared-limit warnings and the total count a card's orders
  together. Counts read `2 cards · 3 orders` (`2 ใบ · 3 รายการ`) once a card has more than one
  order, on the total and the sub-header, and stay `2 cards` otherwise.

- A card with several orders is named once in Home's list rows, the reply's _Move … to a
  draft_ and the saved list's moved note.

- The _Lists_ view is in sections: _Drafts_, then _Waiting for the spender_, then saved lists
  grouped by their date (`Saved · <date>`), newest first, each a small heading over its own row
  panel like the ledger's days. The status chips moved into the filter sheet (DD-188, DD-189).

- The review offers _Mark as sent_ only, and Backup version 3 accepts a line amount of `0` on a
  draft (and only there), so a draft with blank amounts restores (DC-06).

- A draft with no amounts yet totals `฿0.00` with no minus sign on Home and in the _Lists_
  view.

- The update bar reads _New update is available_ with _Reload_ (Thai _มีอัพเดตใหม่_ with
  _โหลดข้อมูล_), and from 900px it sits at the right end of the page's width, under the tabs,
  instead of centred; on a phone it stays centred (DD-181, FR-38).

- Biome no longer checks `.opencode/`, as it already skipped `.claude/`: formatting rewrote the
  playwright-cli skill's front matter (its `allowed-tools` globs) and failed `bun run check`.

- The four filter sheets (Cards, the ledger, _Lists_, the new-list picker) share one
  `FilterSheet` organism and its sections `FilterChips`, `DateRangeChoices` and `CardChoices`,
  with the chip look once in `app.css` (`.filter-group`). A new filter section is built from
  these rather than copied from another sheet (DD-190).

- Cards' _Sort by_ radio list is now the same pills as the other sheets, and the page's sort
  chip names the order in words (_Sort: Z to A_). The sort words are one shared set
  (`sort.field.*`, `sort.order.*`, `#lib/ui/sort-label`), replacing each page's own keys and
  `cards-sort.ts`.

### Bug fixes

- An opened row's buttons wrap within the row: a third button (a list's _Merge_) ran off a
  390px phone and hid _Confirm_.

- An opened row's details have a gap under the head, as below their last line, so the first
  line no longer touches the open head's ground (Home, the ledger, _Upcoming_ and _Lists_).

### Decisions

- A list line stays one order, so the stored list, the backup shape and the `?card=` address
  are unchanged; only the amounts step groups a card's lines into one panel.

- _Lower to_ shows only for a card with one order: with several it is unclear which order to
  lower, so the reader edits them.

- An order's remove is an × icon rather than a second _Remove_ word, which read as a duplicate
  of the card's own _Remove_ right above it.

- Merging joins only lists of the same status. Saved lists do not merge, since their purchases
  carry the list's id (DD-66); waiting lists merge without a resend, since the spender already
  has every line. The merged list is written before the others are deleted, so a failure
  part-way leaves a line twice rather than losing it.

- A draft's blank amount is `0` rather than a missing field, so totals and the stored shape
  stay as they were; only a draft may hold it.

- The _Lists_ view's search and filters use their own address keys rather than sharing the
  ledger's, so a ledger search does not carry into it. _Merge_ still counts lists the filter
  hides, since they are on that day all the same.

- A card picked past the fold stays shown, and so does one tapped since the sheet opened, so a
  chip never vanishes from under a tap; the fold and the find are not kept in the address. The
  search, sort direction and group by work is split into three pull requests, this shared sheet
  first.

- Each sort field keeps its own default direction (newest, biggest, most room, A to Z, soonest
  due, and so on), so every bare address reads as it did and `dir` is written only when it
  differs. Ties keep their order whichever way a sort runs. The old ledger sort values were
  dropped rather than mapped onto the new form, as the user chose.

## 2026-11-08: Offline scripts load whatever the server's Vary header, the list image keeps its amounts on iPad, and Cards sorts by upcoming dates

### Features

- Cards offers _Soonest due_, ordering by the full due dates shown on the tiles. The choice
  survives reloads and shared links as `sort=due`, in English and Thai.

### Bug fixes

- Cards' _Soonest to close_ sorts by the upcoming closing date, not the day number: a card
  closing this month comes before one closing early next month. Both date sorts follow the
  dates shown on the tiles, including preserved ledger dates and short-month clamping; ties
  use card id, and archived cards use the same order in their separate section.

- The saved purchase list image shows its amounts in full on iPad. Safari there drew the
  amount column (its header, every amount and the total) starting at the right margin instead
  of ending at it, so the amounts ran off the paper. Right-aligned text is now placed by its
  measured width rather than by the canvas's `textAlign`.

- The offline worker finds a cached file even when the server sent it with a `Vary` header. A
  page loads its scripts with an `Origin` header the worker's own fetch lacked, so a
  `Vary: Origin` answer (which `astro preview` gives) made every script miss the cache: offline
  the page's island never ran, and after a deploy the old version's pages asked for files that
  were gone. Production sends no `Vary` today; this keeps it working if that changes (DD-181).

### Decisions

- Cards sorts by the open period's displayed dates, not the oldest unpaid bill. The close
  sort keeps `sort=close`, so existing links use the corrected order (DD-115, DD-116).

- The worker matches with `ignoreVary`, since each cached file is the build's one copy at its
  address. Stripping `Vary` when storing was the other option; ignoring it on lookup keeps the
  stored responses as the server sent them.

## 2026-11-07: The card page, the card form, Make a payment, Transactions, the list pages and Home converted, Lit removed, and offline use

### BREAKING CHANGES

- `src/legacy/`, the `#legacy/*` alias, the `lit` dependency and `#lib/ui/spa` (`onPage`,
  `pageSignal`) are gone, and AppLayout takes no `route`: a page is `AppLayout` with a Svelte
  island in its `main` slot, which cleans up in `onMount` (DD-185).

### Features

- The site works offline (DD-181). After one visit every page, script and style is cached by a
  service worker (`dist/sw.js`, written after `astro build` by `scripts/service-worker.ts`), so
  every page opens and works with no signal; the data was already in the browser.
- After a deploy the new version downloads in the background, and a bar under the header says
  _A new version is available._ with _Reload_. Nothing changes until it is tapped; then the new
  version takes over, its old cache is dropped and the page reloads.

### Improvements

- The card page is converted (DD-179): the `CardPage` island draws the sub-header with _Edit_
  and the _More_ menu, the hero and stats, the actions, the statements and the purchase sheet.
  _New card_ and _Edit card_ are one `CardEditPage` island over the `CardForm`, whose checks
  live in `#lib/ui/card-form`. They look and work as before, and the card stays `?id=` in the
  address.
- A card's name in its text forms (`cardTitle`, `cardLine`, `cardName`, …) lives in
  `#lib/ui/card-label`; the Lit pages' `card-label` re-exports it, so islands and Lit pages
  share one copy. `SubHeaderBar` is the sub-header for a title built from the reader's data.
- Make a payment is converted (DD-180): the `PayPage` island draws the card picker and, at
  `?card=`, the payment form in a sheet. Back, _Change_, the save that lands on Transactions and
  _Try again_ after a failed save work as before. A pay tile's content comes from
  `#lib/ui/pay-tile` and is drawn by the shared card tile; the Lit pay tile stays for Home's
  _Owed_ list.

- Transactions is converted (DD-182): the `TransactionsPage` island draws the view switch, the
  search, filter and sort, the month summary, the ledger with _Upcoming_, the Lists view, the
  owed list beside them from 900px and the filter sheet. The address, the 50-row pages, the
  two-step _Delete_ and _Confirm_ and focus after a row goes work as before.
- The row that opens in place is in Svelte: `ActionRow` with `CycleLine` for the billing cycle
  and `TwoStepButtons`, kept by the rune state `OpenRows` and `TwoStep`. Their words are pure
  in `#lib/ui/row-text`, `#lib/ui/cycle-line` and `#lib/ui/ledger-drawer`. The Lit row stays
  for Home's _Needs you_ until Home converts.
- On a phone a card's filter chip on Transactions shows its short name again, as the Lit page
  did (`FilterControls` chips take a `short` form).

- The purchase list pages are converted (DD-183): `/list/new` is the card picker or, at
  `?card=`, the amounts; `/list/draft` reopens a draft in the same steps; `/list/reply` and
  `/list/view` draw the reply and the saved list. The addresses, the replace after a write, the
  retry that adds nothing twice and every word work as before.
- The list's table and image text (`list-share`) moved back to `#lib/ui`, and a list's `id` is
  read by `listId` in `#lib/ui/list-address`.

- Home is converted (DD-184): the `HomePage` island draws _Needs you_ (the opening row, five then
  _See more_) and _Ready to use_ (the four cards with the most room, then _See more_), side by
  side from 900px. The writes, their errors, focus after a row goes and the clock past midnight
  work as before. No page loads Lit any more.
- app.css places Home's two panels by their wrappers (`.home-needs`, `.home-ready`), not by the
  Lit element names.

- Lit is removed (DD-185): with every page an Astro page over Svelte islands, the Lit code, its
  tests and its decorator settings go. The tests of today's pages, tokens and headers that sat
  under `tests/legacy/` move beside the code they check, and `AGENTS.md`, the project skills
  and the README describe the Astro and Svelte code as it is.

### Bug fixes

- On a phone in Thai, a long over-the-room warning no longer widens an amount card past the
  screen's edge: the card's one column now shrinks to the card.
- In the new payment form, a reload after a failed save no longer empties the amount and note
  you typed: a field refills only when its value really changes, as the Lit form did.

### Decisions

- The card page and the two card form pages convert together (DD-179): they share the form
  and the card's title, while the statements, the purchase sheet and the _More_ menu belong to
  no other page. Converting `/card` alone and leaving the form in Lit was rejected.
- Offline caches every file on install, not only pages already opened, and serves from the cache
  first; network-first pages were rejected as slower on a weak signal and offline only for
  visited pages (DD-181).
- A new version waits for the reader's tap rather than reloading straight away, which could lose
  a form being filled in, or switching quietly on the next open, which shows the update late.
- The opening row is built once for Transactions and Home rather than per page, since both draw
  the same row; Home takes it as is (DD-182).
- An opened row's sentence is a list of pieces (words, a strong amount, a red late phrase), not
  markup in a string, so a card name or note can never inject markup through `{@html}`.
- Lit comes out as soon as no page loads it: dead code and a dependency nothing uses cost a
  reader more than they save. `onPage` goes too, since an island cleans up in `onMount` (DD-185).
- Home converts last, because _Needs you_ needed the opening row built for Transactions; Lit
  comes out in a change of its own, so this one is only Home (DD-184).
- The four list pages convert together: new and draft share the entry steps, and all four share
  the view of a list that is elsewhere. Converting one page at a time would have kept the entry
  steps in both Lit and Svelte (DD-183).
- The version is a hash of the built files, not the commit, so any changed build is a new
  version and an unchanged rebuild is not. About 60 lines of worker code, so no Workbox.

## 2026-11-06: Built with Astro: template conventions, a static shell, client-side navigation, Locations, Settings and Cards converted, a steady tab bar, and faster page changes

### BREAKING CHANGES

- `@kctools/bun-server`, `scripts/build.ts` and the `src/routes/*.html` pages are gone. Pages
  are `src/pages/<path>.astro` over `src/layouts/BaseLayout.astro`, built by `astro build`; the
  dev server is `bun run dev` on port 4321.
- Tests run on Vitest (`bun run test`), not `bun test`; `bun:test` imports no longer work.
  `bun run typecheck` is gone: `bun run check` runs `astro check` and then Biome.
- The build stamps are `PUBLIC_COMMIT_SHA`, `PUBLIC_BUILT_AT`, `PUBLIC_PR_NUMBER`,
  `PUBLIC_ENVIRONMENT` and `PUBLIC_BRANCH`, no longer `BUN_PUBLIC_*`.
- Google Tag Manager loads only on production. Pull request previews and local builds send no
  data, and the `<noscript>` iframe is gone.
- Tests live in `tests/`, mirroring `src/`; a `*.test.ts` under `src/` or `scripts/` no longer
  runs.
- The skills are `project-shipping`, `project-landing` and `project-changelog`; the old
  `shipping-a-change`, `landing-a-change` and `changelog` names are gone.
- Everything Lit is in `src/legacy/`, imported as `#legacy/*`: the components (was
  `src/components/*.ts`), the route modules (was `src/routes/`), and `lib/ui/{chrome,shell,
  page,icons,card-label,list-share,sub-header}.ts`, `lib/i18n/controller.ts` and
  `styles/shared.ts`. Imports of the old paths, and the `#styles/*` alias, no longer resolve.
- Pages render `AppLayout` (with a `tab` and, where needed, `fab={false}`), not `BaseLayout`,
  which now writes only the document. The legacy `shell.ts` and `cc-fab-menu` are gone,
  `chrome.ts` no longer draws the header or tab bar, and the `data-pay-page`,
  `data-list-page` and `data-form-page` attributes are gone.
- _+ New_'s menu no longer moves focus to its first action when it opens, and the arrow keys
  no longer move between its actions; Tab reaches them next (DD-104).
- A legacy route module no longer starts on import: it exports `start()`, and its page
  registers it with `onPage("<route>", start)` and names the route on `AppLayout`. Every page's
  language listener and `popstate` handler takes `{ signal: pageSignal() }`.
- Google Tag Manager now sees only the first page of a visit. Counting every page needs a
  History Change trigger in the container.

### Features

- New skills from the template, adapted to cc-tracking: `project-components`,
  `project-layouts`, `project-pages`, `project-scripts` and `project-deploy`.
- `src/components/` has the atomic tiers `atoms/`, `molecules/` and `organisms/`;
  `tests/components/atomic.test.ts` fails on a component outside a tier or importing one it
  may not, and `#components/*` imports `.astro` files as written.
- `tests/legacy/boundary.test.ts` keeps the legacy fenced: no `lit` import outside
  `src/legacy/`, and nothing outside it imports `#legacy/*` except a page's route script, so
  each conversion can delete its legacy file without breaking new code.
- Static `.astro` copy can be translated: an element written as
  `<span data-i18n="nav.cards">Cards</span>` is put in the reader's language by `startCopy`
  (`#lib/i18n/copy`), which every page runs and which follows a later change of language. A
  key either catalog lacks fails `tests/lib/i18n/markup-keys.test.ts`.
- A static element's `aria-label` is translated the same way, through `data-i18n-aria-label`.
- Svelte islands (`@astrojs/svelte`, Svelte 5) render what the browser has to; the first is
  the header's date (`HeaderDate`). `tests/container.ts` renders islands in tests, and happy-dom
  tests mount them with Svelte's client build.
- Moving between pages swaps the next page in with a view transition instead of reloading
  (Astro's `<ClientRouter />`, DD-174), for links and Back/Forward alike. The header and tab
  bar hold still, the date carries over, and theme, tint and language never flash.
- `#lib/ui/spa`: `onPage` starts a page's route on every visit, and `pageSignal()` lets what
  a page set up go when the reader leaves; `subscribe` takes a `signal`.

### Improvements

- The header and the bottom tab bar are static Astro, built once rather than drawn by script
  on every load (DD-173): `AppLayout` with the `SiteHeader` and `TabBar` organisms, the `Tabs`
  and `FabMenu` molecules and the `Icon` atom. Each page names its own tab, and _+ New_ is an
  HTML popover that opens and closes with no JavaScript.
- The page's language is set on `<html lang>` before first paint, by the same rule as the app
  (a saved pick, then the browser's languages, then Thai), and a Thai page keeps its
  `data-i18n` copy hidden until it is translated, so a Thai reader never sees English first.
- The thirteen copied HTML shells are one `BaseLayout` carrying the noindex meta, the theme
  boot, the global CSS and the shell slots; each page passes only its title and width, and
  imports its route module. `tests/pages/pages.test.ts` renders every page to keep that true.
- Every page now ships `<html lang="en">`, until `chrome.ts` sets the reader's locale.
- Biome extends `@kcconfigs/biome/configs/astro` (4.2.2), which lints and formats `.astro`
  files as well. The whole repo now follows its base formatting: no semicolons, 120-column
  lines, padded Markdown tables; `tests/config/biome.test.ts` checks the `.astro` rules.
- Dependencies match the template: Astro 7.4.5, Vitest 5.1.0, Biome 2.6.5, Wrangler 4.158.0.
- A page may reach `BaseLayout` through another layout, and every layout must wrap it, ready
  for an app-shell layout. `<div row>` and `<div block>` type-check in `.astro` markup.
- Landing runs `bun install` on `main` after a merge: a stale root install broke every
  worktree's build and tests with `Tsconfig not found astro/tsconfigs/strictest`.
- The hard-coded English check and the old statement payment check scan the legacy and every
  Astro UI folder, and fail when they find nothing, so an emptied folder can't pass them
  silently.
- Settings > Locations is the first page converted (DD-175): a static `SubHeader` and the
  `LocationsEditor` Svelte island replace its legacy Lit route. It looks and works as before.
- Settings is converted too (DD-176): the `SettingsPanels` island draws its sections, with
  Display (`DisplaySettings`, an island) and About (static, apart from the `BuiltTime` island)
  passed in as slots. _Restore a copy_ and _Delete old purchases_ are Svelte sheets over a new
  `Sheet` molecule. It looks and works as before; the purge sheet's age chips now line up with
  the note under them.
- Cards is converted (DD-177): the `CardsPage` island draws the heading, the search, filter
  and sort, the card tiles and the limit groups, with the filter and a group in Svelte sheets.
  The view and an open group stay in the address as before (DD-102), through a new
  `AddressBar` seam. `SvgIcon` is the icon atom for islands, and `ErrorBanner`'s Retry is
  optional for a sheet. It looks and works as before; the filter sheet's chips line up with
  their headings.
- `openRepository` (`#lib/ui/startup`) opens the store and runs the startup migrations for
  islands and legacy pages alike; `AppLayout`'s `titleKey` translates the page title with the
  build's mark; `ErrorBanner` and `SubHeader` are shared molecules for the pages still to come.
- `biome.json` allows files up to 2 MiB: `PRD_TH.md`'s padded tables had passed 1 MiB, and
  Biome had quietly stopped checking it.
- Pages change in about 0.3 to 0.4 s instead of 2 to 3 s with two years of purchases
  (DD-178). The hashed build files under `/_astro/` are cached for a year as `immutable`
  rather than re-checked with the server one by one on every page, and links are prefetched
  as they come into view.

### Bug fixes

- Cards, Pay and Transactions rewrote the address with `history.replaceState(null, …)`, which
  wiped the router's history state, so a later Back could land on a page it didn't show; they
  keep `history.state` now, guarded by `tests/legacy/routes/spa-ready.test.ts`.
- _+ New_ and, on a phone, the bottom tab bar no longer flash on a page change. The
  hold-still marker sat on their `#tabbar` slot, which has no height because both are
  `position: fixed`, so they faded out with the page; the bar and _+ New_ now carry it
  themselves.
- An English reader no longer sees Thai inside Settings and Locations before they load. The
  build wrote every island in Thai, the fallback for a reader with no language, while the
  static copy beside it was English; the build now writes English, and a Thai page hides an
  island (`astro-island[ssr]`) until it runs in Thai (DD-171).

### Decisions

- Slow page changes were fixed at the cause rather than covered with a loading indicator
  (DD-178): measured, the wait was network round trips, not work on the data. Pages keep a
  revalidate-every-time cache, since an old cached page would ask for hashed files a new
  deploy no longer has; with the scripts cached, no indicator is needed.
- The components stay Lit for now (DD-170). All data lives in the browser, so nothing renders
  at build time; the move to Astro components comes page by page after this. A rewrite of
  every component in one go was rejected as weeks of work with no visible gain.
- GTM follows the template: the container id is set only by the production deploy, so previews
  stop counting visits. Keeping the inline snippet on every build was the alternative.
- TypeScript stays on 6.0.3: `@astrojs/check` and `@kcconfigs/tsconfig` do not accept 7 yet.
- Translated copy (DD-171): static markup carries English plus its catalog key in
  `data-i18n`, swapped to the reader's locale by one shared pass. Per-locale pages (`/th/...`)
  were rejected: the address would fight the language setting with a redirect on every load.
- Static first, Svelte islands for what the browser renders (DD-172): a component is static
  `.astro` unless it is built from the reader's data or reacts to input, and then it is a
  small Svelte island, never a raw `<script>` building markup. Lit for the client parts and
  hand-written DOM updates were the alternatives.
- The Lit code waits in one `src/legacy/` folder rather than being sorted into the atomic
  tiers as Lit files, so `src/components/` only ever holds converted Astro and the legacy
  folder only shrinks.
- The shell is static Astro with two browser parts (DD-173): the date as a Svelte island, and
  _+ New_'s menu as an HTML popover rather than an island, so a two-link menu ships no
  JavaScript. A closed popover `div` hides itself, since the reset's `div { display: flex }`
  outranks the browser's own hiding and left the closed menu catching taps.
- Navigation through Astro's ClientRouter, not a single-page app (DD-174): every address stays
  a static page, so nothing about addresses or the deploy changes. The language stays a reader
  setting (DD-171) rather than Astro's i18n routing, which would put it in the address.
- The conversion starts with the smallest page (DD-175), Settings > Locations, to set the
  pattern every later page follows; each conversion keeps the legacy markup, so it is checked
  against production screenshots rather than redesigned along the way.
- Settings is one island for the sections that share state (a restore re-reads the Locations
  summary and clears the reset message), with the static sections passed in as slots (DD-176).
  Rejected: an island per section with a shared store, and keeping the Lit sheets inside it.
- Cards is one island down to its heading, whose add button follows the switch (DD-177). The
  card tile, the filter controls and the filter sheet's frame are ported, but their Lit
  versions stay until Home, Pay and Transactions convert.

## 2026-11-04: The redesign ships, and no page is indexed

### BREAKING CHANGES

- Backups are version 3: `{ version: 3, exportedAt, limitGroups, cards, purchases, payments,
  statementDates, lists, locations }`, with card payments in `payments` and each group's
  `color`. Download and copy write only version 3, so a build from before the redesign can't
  restore a new file; keep an old download if you may need to go back. A version 2 file still
  restores, converted on the way in (payments with their `parts` become card payments, its
  `settings` give the locations); version 1 and any other version are rejected.
- Restore is stricter. A file is refused, naming the record and the problem, when an amount or
  limit is not above zero, `last4` is not four digits, a cycle day is out of range, a status or
  `takesPurchases` is not one of its values, or (version 3) a card names a location the file
  does not hold. Nothing is written when any record is bad.
- Stored data migrates once at startup, and the old records stay on disk unread:
  - Per-statement `cc:payment:` records become card payments (`cc:cardpayment:<cardId>:<id>`,
    ids `m:<cardId>:<period>:<index>`), marked done by `cc:migration:payments`. Every
    statement keeps its left amount; an old overpayment is capped at the statement's total,
    so a statement that showed 1,500 paid on 1,000 now shows 1,000 paid. If the step fails
    the page shows an error with _Reload_ instead of numbers, and the reload retries.
  - Purchase places become location records (`cc:location:<id>`), seeded once from
    `settings.purchaseLocations` and marked by `cc:migration:location-records`. The app no
    longer writes `cc:settings`, and a card at a location with no record is moved, with a
    one-time notice.
  - Every limit group gets a stored colour (`cc:migration:group-colors`): the first four in
    stored order keep the colour they showed, the rest get a random unused one.
  - `cc:batch-start` and the `cc:panel:` keys `cards`, `cards-archived` and `limit-groups` are
    no longer read; the Cards page's archived fold uses `cc:panel:cards-archive`.
- Payments belong to a card, not a statement. Money settles the oldest statement first and any
  extra stays as credit, so an overpaid card now shows credit and more room than its limit.
  _Mark paid_ and per-part _Unmark_ are gone from the card page; pay from `/pay`, and delete a
  wrong payment from Transactions.
- A statement keeps its close and due dates only once it is fully paid. One that still owes
  money, part paid included, follows the card's current cycle, so its dates can move after a
  cycle edit; dates stored earlier for such a statement are ignored.
- Storage now refuses to delete a card that has purchases or is on a draft or waiting list, a
  limit group a card uses, or a location a card is kept at (`guard.cardOnList`,
  `guard.locationInUse`), not just the interface hiding the buttons.
- Retired pages and addresses, with no redirects (question 15):
  - the dashboard at `/` is Home; the registry at `/cards` is the Cards page
  - the `/cards` query keys `edit`, `group` as a filter, `dir`, `gq`, `gowner`, `gsort` and
    `gdir`, and the `/cards?edit=<id>` deep link, are no longer read; a card is edited at
    `/card/edit?id=<id>`
  - `/backup` still redirects to `/settings`
- Removed from the interface: the page footer (now Settings › About), the dashboard's purchase
  form, _This sitting_ and _Start new batch_, _Can spend now_, the dashboard's _Due next_ and
  _Purchases by date_ (now in Transactions), the card page's Add purchase dialog
  (`cc-quick-add`), the registry's card and group tables and dialogs, the payment dialog
  (`cc-payment-form`), and Settings' _Purchases_ section and side-by-side backup boxes.
- 148 message keys are gone, among them every `footer.`, `dashboard.`, `due.`, `range.`,
  `sitting.` and `payment.` key, with the components that used them (`cc-site-footer`,
  `cc-due-list`, `cc-purchase-range`, `cc-sitting-list`, `cc-spendable`, `cc-card-table`,
  `cc-limit-group-table`, `cc-limit-group-form`, `cc-statement-list`, `cc-card-summary`,
  `cc-settings`).
- Things to re-learn:
  - Purchases are planned as lists: pick cards with _+ New › New purchase list_, enter amounts,
    send the list, then record the spender's reply. A single purchase is added from the card
    page's _Add purchase_.
  - Tapping a row in _Needs you_, _Upcoming_, the ledger or _Lists_ opens it in place instead
    of going to another page; the page it led to is a button inside (_Open card_, _Open list_,
    _Pay_, _Record reply_).
  - Places that take purchases are ticked per location at Settings › Locations.
  - Archive and Delete for a card are in the card page's More menu (`⋯`), not the edit form.
  - Restoring opens a sheet that reads the clipboard first.
  - A ledger row no longer says _Purchase_ or _Payment_: the sign (− or +) says it, backed by
    red or green.

### Features

- Four pages, Home, Transactions, Cards and Settings: a bottom bar on a phone, tabs on the right
  of the header from 900px, and a floating _+ New_ menu with _New purchase list_ and _Make a
  payment_ on every page but the list, form and payment pages. Sub-pages share a slim
  sub-header with a back arrow.
- Purchase lists: the new-list picker `/list/new` (search, _Kept in_ and _Account holder_
  filters, three sorts), entering amounts with a note per line, a review table copied as plain
  lines or saved as an image for the chat, _Mark sent_, and the spender's reply (_Made_ or _Not
  made_ with the real amount), which saves the purchases and can move not-made lines to the next
  day's draft. Each state has its own page: `/list/new`, `/list/draft`, `/list/reply`,
  `/list/view`. A waiting list holds its amounts against its group's room.
- Warnings while entering amounts, none blocking: over the room (with _Lower to_, and room a
  waiting list holds or a planned payment would make), a shared limit, an overdue bill, the
  close date, and a date that has passed (with _Change to today_).
- Home: _Needs you_, money at risk first (overdue bills, late plans, waiting lists, plans in the
  next three days, drafts), beside _Ready to use_ from 900px, which shows the four cards with
  the most room and opens the rest in place.
- Payments on any day at `/pay`: a card picker, most pressing first, then a sheet with _Next
  bill_ and _Everything owed_, the date, an optional note, and a button that names the amount
  and card. A later date makes a planned payment, which counts only once marked _Paid_.
- Transactions: one ledger of purchases (−) and payments (+) by day, a month summary,
  _Upcoming_ (waiting lists with a two-step _Confirm_, planned payments with _Paid_ and
  _Delete_), search, filters as removable chips, four sorts, 50 rows at a time, a _Lists_ view
  and _Owed on each card_, the view kept in the address.
- Rows that open in place in _Needs you_, _Upcoming_, the ledger and _Lists_: one open at a
  time, with a sentence and the actions there, and a billing cycle line that shows where a
  purchase or bill sits between its start, close and due dates, and today. Home gains _Paid_,
  _Delete_ and _Confirm_.
- Cards page: by place or one flat list, search, a filter sheet (place, holder, _Not in a
  group_, sort), archived cards folded at the end, and limit group panels (a _Cards · Limit
  groups_ switch on a phone) whose sheet adds and edits a group at `?group=<id>` or
  `?newGroup=1`.
- One wallet tile for every list of cards (_Ready to use_, the new-list picker, Cards, the
  payment picker and _Owed on each card_), in its limit group's colour, with a rail for the
  group's used share: grey, amber from 80%, red past the limit.
- Each limit group keeps one of twelve colours, chosen in the group sheet from swatches or with
  _Random_; tiles, chips, the card hero and the group panels wear it.
- The card page: room, owed, next bill and credit up front, _Use on a list_, _Add purchase_
  and _Make a payment_, and statements that unfold to their purchases (with _Edit_ and a
  two-step _Delete_) and the payment parts that settled them. Cards are added and edited on a
  full screen, `/card/new` and `/card/edit?id=`, in four sections.
- Locations at `/settings/locations`: add, rename, delete one no card uses (never the last),
  and tick _Takes purchases_. Default names show in the reader's language, and every list of
  places sorts A to Z.
- Settings › Reset › _Delete old purchases_: older than 6 months, 1 year, 3 years or all, with a
  count, a line for what stays and a second ask. Only purchases on fully paid statements go,
  with the payments that settled them, so no owed, credit or room figure moves.
- Settings › About lists the environment, build time, source and commit. Builds other than
  production tint the header and bar, mark the brand and tab title (`(dev)`, `(local)`,
  `(pr-<n>)`, `(preview)`), and set the tint before the first paint.
- No page goes into a search index. Every page carries
  `<meta name="robots" content="noindex, nofollow">`, and `public/_headers` sends
  `X-Robots-Tag: noindex, nofollow` on every response, scripts and favicon included (DD-169).

### Improvements

- A calm new look: sage neutrals, a green accent, rounded panels and generous spacing in both
  themes, with amber and rose for warnings, always with words. Light-theme text colours were
  darkened where the prototype's fell short of AA contrast.
- One rule for naming a card (_panel_, _line_ and _name_ forms from `card-label.ts`), and cards
  titled `name · holder (last4)` on their own page and edit form.
- Every repeated list is a row list (one panel, a line between rows) or a card list (a panel
  per item), each drawn from one shared style (UI-22).
- Negative amounts read with the minus sign, `−฿21,065.00`, as signed amounts do.
- Sheets and the _+ New_ menu animate out as well as in, and not at all under reduced motion.
- Keyboard: when an action takes an open row away, focus moves to the next row, the previous
  one, or the nearest heading; the group sheet's holder and colour choices are radio groups
  with arrow keys.

### Bug fixes

- A page no longer flashes the wrong theme on load: the saved theme is applied before the first
  paint.
- A part-paid statement no longer keeps due dates from an old cycle: Kbank Passion's October
  statement read _due 04 Nov_ after its cycle changed to due 15 days after the 25th (09 Nov).

### Decisions

- Built in six phases on stacked pull requests (#29 to #34), squashed into one branch, then a
  refinement round (#35), and merged to main once, so production only sees the finished app.
- Payments convert once, marked by `cc:migration:payments` with ids that repeat on a rerun, and
  a converted payment pays its own statement first, overpayments capped. Every old statement
  keeps the left amount it showed. Rejected: feeding old payments into the oldest-first pool,
  turning old overpayments into credit, and deciding "already converted" by whether any card
  payment exists.
- A failed payment conversion stops the page with a reload button, since numbers from half
  converted data would be wrong. The group colour step only logs a failure, because a colour is
  cosmetic.
- Backup moved to version 3, and download and restore switched with the startup conversion,
  because the old export wrote `cc:payment:` records that never convert once the marker is set.
  Rejected: staying at version 2 with optional fields.
- A Merge of a version 3 file is purely additive and keeps local location records, so an old
  backup can't undo a rename or a _Takes purchases_ tick. Rejected: saying in the help that
  Merge can delete; overwriting locations as other records are.
- Location records are seeded once behind a marker, and become the one truth for where purchases
  happen. Rejected: keeping `settings.purchaseLocations` beside them; seeding whenever none is
  stored. A card at an unknown place is repaired rather than the data refused, and the last
  location can't be deleted, since a card always needs one.
- `/pay` is a page with the payment sheet over it, and every way to pay is a link to it.
  Rejected: the form inline on the page; one sheet mounted on every page and opened by an event.
- Each list state has its own address, so a link says what it opens. Rejected: one `/list` page
  choosing by status; a page per step.
- The copied list is plain lines and the image a table always drawn on white, because a chat
  breaks any text table and other people see paper, not this reader's dark mode. Rejected:
  tab-separated text; a `|` table; an image that follows the theme.
- Delete draft and Cancel list act at once, since both only remove a list nothing was bought
  from (the user's call). A payment's _Delete_ and a list's _Confirm_ stay two-step everywhere
  they appear.
- Statement dates freeze when a statement is fully paid, not at the first payment: settled
  history must not move, but a statement that still owes money is not settled. Rejected:
  rewriting kept dates on a cycle edit; letting the user edit one statement's dates. Old
  records are ignored rather than migrated.
- One wallet tile for every list of cards, its colour the group it draws on and never its
  health. Rejected: a row design per page; a taller wallet card; a card link inside a tickable
  row.
- Group colours come from a fixed palette of twelve, stored on the group, so text stays readable
  in both themes and adding or deleting a group never recolours another. Rejected: a colour
  from the group's place in the order; a free colour picker; a colour per card.
- A tapped row opens in place, its head one button with nothing inside, and one row opens at a
  time. Rejected: a row that both navigates and toggles; many rows open; the open row in the
  address.
- The opened row shows a billing cycle line and one sentence (option B of three mockups), since
  where the money sits in the cycle is what only this app knows. Rejected: label and value pairs
  in a well; one line of facts with text actions.
- A purchase can again be added without a list, only from the card page, after the user found
  some purchases are recorded that way. Rejected: a purchase form on Transactions; a separate
  `/purchase` page (built, then removed).
- Old addresses don't redirect (question 15), and the Cards address is new, replaced rather than
  pushed so typing doesn't fill Back. Rejected: keeping the old keys working.
- Restore is a sheet, clipboard first: three clicks with data, two on an empty browser, down
  from four or five. Rejected: the side-by-side boxes; a paste box always open.
- No `robots.txt`. A crawler barred by `Disallow: /` never reads a page's `noindex`, so it
  could still list a bare address linked from elsewhere; the meta and the header let it read
  the page and leave it out. The `pr-*` previews show Cloudflare's own `noindex` header in
  place of ours, so the header is checked with `wrangler dev` (DD-169).

## 2026-10-30: Redesign decided from a clickable prototype

### BREAKING CHANGES

- These are decided for the build, not built yet. When they ship:
  - backups move to version 3, and a version 2 backup still restores, converted on the way
    in
  - payment records move from statements to cards, keeping every total
  - old page addresses and `/cards` links stop working, with no redirects
  - the page footer goes, replaced by About in Settings

### Features

- `PRD.md` and `PRD_TH.md` record how the app is really used, as the user corrected it.
  Purchases are planned as dated lists that the spender confirms. Payments are made on any
  day, often to make room. The documents also say how often each task happens.
- The PRD adds decided changes RD-08 to RD-21, each naming the rows it overrides:
  - four pages (Home, Transactions, Cards, Settings), with a + in the phone's bottom bar
    that opens the payment form
  - purchase lists: pick cards on Home, enter amounts, send a dated table, record the
    spender's reply, then save
  - warnings while entering amounts, none of which blocks the list
  - payments that belong to a card, settle the oldest statement first, and turn any extra
    into credit
  - planned payments, and one Transactions ledger of purchases (−) and payments (+)
  - a payment form that asks for the card first
  - a Home that shows what needs you, then the cards ready to use
  - a Cards page with search, filters and sorting
  - locations you can add, rename and delete
  - deleting old purchases
  - a Settings layout with an About section
  - non-production builds tinted, badged and marked in the tab title
  - a calm look for ten-minute visits
- Decisions DD-39 to DD-46, a new goal G8, new risks, glossary terms in both languages, and a
  link to the prototype.

### Improvements

- Every open question is answered. Question 3 (pages) settles on the four pages above. The
  new questions 12 to 18 cover:
  - the footer, which goes
  - a purchase outside a list, which isn't needed
  - the backup version, which moves to 3
  - old links, which don't need to keep working
  - credit, which the card's next purchases use up
  - the ages for deleting old purchases: 6 months, 1 year, 3 years or all
  - the Thai words, kept as written

### Decisions

- Purchase lists replace receipt entry (RD-09 replaces RD-01 and RD-02). Buying starts with
  choosing cards and amounts, not with receipts after the fact.
- Going over a card's room offers one action, _Lower to_ the room. _Pay first_ and moving the
  extra onto another card were tried in the prototype and dropped as too complicated.
- Transactions is one ledger rather than separate list and payment tabs. The + opens the
  payment form, so a separate _+ Plan_ button was dropped.
- Deleting old purchases removes only what is fully paid, with its payments and lists, so no
  card's balance moves.
- Locations become editable, which reverses DD-11 and an out-of-scope item. They need a stored
  list and a migration.

## 2026-10-30: Product requirements for the refactor and redesign

### Features

- `PRD.md` is the full context to read before refactoring or redesigning the site. It covers:
  - business and functional requirements, and user stories with acceptance criteria
  - the domain rules, data contracts and interface rules a rewrite must keep
  - every decision so far with its reason and what was rejected
  - what is out of scope, today's design (free to change) and what was retired
  - the decided changes for the redesign (RD-01 to RD-07), acceptance criteria, risks, open
    questions and a glossary
- `PRD_TH.md` is the Thai translation, with the same IDs in the same order.
- `AGENTS.md` tells agents to read `PRD.md` before changing behaviour, and to update both
  files together when a change ships.

### Improvements

- The README matches the app again. It describes:
  - purchase places in Settings, rather than a checkbox on each card
  - editing purchases in place
  - saving and restoring a copy with Merge or Replace, and Reset
  - partial payments
  - language and theme in Settings
  - adding and editing in dialogs on the registry
  - the storage keys

  It links the PRD.

### Decisions

- A PRD rather than a plain feature list. The PRD carries the redesign's problem, goals and
  open questions. It also keeps the rules, contracts and decisions, because a feature list
  would let a rewrite quietly change the numbers or break saved data and backups.
- IDs are stable. New items go at the end of their list, and a replaced item is marked, not
  deleted, so links from other documents and pull requests keep pointing at the right thing.
- Decided with the user for the redesign:
  - entering receipts gets its own screen
  - a recent entries list, newest added first, replaces _This sitting_
  - a new visual direction on the same stack (Bun, TypeScript, Lit)
  - no theme flash on load
  - restore checks ranges
  - delete guards move into storage
- The page structure is left to clickable mockups of three layouts: task tabs, a hub with
  sheets, and card-centric.
- Facts that design specs from September held, and the changelog dropped, were recovered from
  the specs removed in `ec4a13f` and checked against the code before they went in.

## 2026-10-28: Browser storage usage planned, and partial payments

### Features

- A statement can be paid in parts. _Mark paid_, on the card page and in the dashboard's due
  list, opens a dialog for the amount and the date paid, starting at what is left and today,
  so paying in full is still one click.
- `StatementPayment` gains an optional `parts` list of `{ paidAt, amount }`, oldest first, and
  `Statement` gains `paidAmount` and `remaining`. A statement counts as paid once its parts add
  up to its total.
- On the card page each payment is a row in the statement's table, under its purchases and in
  the same columns, shown as an amount off the total with its own _Unmark_. A _Left to pay_ row
  closes the table, and what is left sits under the month's total on its summary line.
- Backup import checks `parts`: a non-empty list of valid dates and positive whole-satang
  amounts.

### Improvements

- The due list's _Total_ column, its sort, the card page's _Next due_ tile, _Owed on this card_
  and limit-group usage all count only what is left on a partly paid statement, so each payment
  returns its own share of the credit.
- The Thai label for _Unmark_ is now ยกเลิกชำระ.
- `TODO.md` plans a settings-page bar showing how much of the browser's `localStorage` (about
  5 MB per site) the app's `cc:` data uses, split by cards, purchases, payments, limit groups
  and settings, so a full store shows up before a save fails.

### Decisions

- Parts live inside the one payment record per card and period, under the same
  `cc:payment:<card>:<period>` key, rather than as separate records with their own ids. That
  keeps the storage layout and the backup's `payments` list unchanged, and a record saved
  before parts existed reads as one payment of the whole total on its `paidAt`, so no
  migration is needed.
- The first payment freezes the statement's close and due dates; later payments keep them.

## 2026-10-27: Friendlier look and limit usage bars, and language and theme in Settings

### BREAKING CHANGES

- The language picker is no longer in the page header; change the language from the new
  _Display_ panel on the settings page. The `cc-lang-switch` element is removed.
- A reader who never picked a language and whose browser lists Thai before English now gets
  Thai rather than English. Pick English on the settings page to keep it.

### Features

- _Can spend now_ shows a bar under each card's available amount, with "N% of the limit used"
  in words beside it. The bar tints amber from 80% and red once the group is over its limit.
- `--cc-radius-pill`, `--cc-accent-surface` and `--cc-panel-padding` tokens.
- A _Display_ panel at the top of the settings page holds the language picker and a new theme
  picker: Match device, Light or Dark. The theme is saved in this browser under `cc:theme` and
  stamped on `<html data-theme>` on every page.

### Improvements

- Warm paper neutrals and a teal accent replace the cool grey and blue, in light and dark.
  Corners and shadows are softer, and panels get more room from 640px wide.
- The header has a small accent mark before the brand, and the nav links are pill tabs with
  the current page filled.

### Bug fixes

- _Purchases by date_'s tiles wrap on a phone instead of clipping a six-figure total.
- With no saved language, the app follows the first of the browser's languages it speaks, in
  the browser's own order, and falls back to Thai. Before, any English entry in the list won.

### Decisions

- Language and theme stay in this browser's local storage, not the repository, so they apply
  before any data loads and are not carried in a backup.
- `tokens.css` writes the dark palette twice, for a dark device and for an explicit Dark pick,
  because CSS cannot share one block between a media query and a selector. A test fails if the
  two copies drift apart.
- The theme is applied from the page script rather than an inline `<head>` script, so a saved
  theme that differs from the device can flash briefly on load; accepted for now.

- Teal, because it stays clearly apart from the danger red and warning amber that sit beside
  it in the due list and the usage bars.
- The bar measures everything still unpaid against the limit, the figure _Can spend now_
  already uses, so it says "of the limit used" rather than "used this cycle".
- The flows were left alone: redesigning them needs the reader's own walk-throughs, so they
  stay in `TODO.md`.

## 2026-10-27: Dashboard as a workspace for entering receipts

### BREAKING CHANGES

- The dashboard has no Add a purchase button or dialog any more; the purchase form is always
  open in its left column. The card page keeps its dialog.

### Features

- The dashboard's purchase form is always open. After each add it keeps the card and date and
  clears amount and note, ready for the next receipt from the same card or day.
- _This sitting_ lists the purchases entered since _Start new batch_ was last pressed, latest
  first, with how long ago each was entered, the card (id then name, as other panels name it),
  the purchase date and the amount. It survives reloads, closing the tab and the next day, and
  is read-only. _Start new batch_ asks for a second click before it clears the list.
- _Purchases by date_ counts purchases, their total and the cards used across every card for
  Today, This week (Monday to Sunday), This month, Last month or a custom range of purchase
  dates, with a card filter. Archived cards count and are tagged. The list stays folded until
  opened, grouped by day, each card linked to its page.
- Purchases record `addedAt`, when they were first entered, from the dashboard and the card
  page; an edit keeps the original. Backup import accepts it and rejects a malformed one with
  `backup.problem.badAddedAt`.
- `Repository.getBatchStart` and `saveBatchStart`, stored under `cc:batch-start`; `clearAll`
  forgets it. New `purchase-range.ts` helpers, `cc-sitting-list`, `cc-purchase-range`, and an
  `inline` mode with a `cleared` counter on `cc-quick-add`.
- `TODO.md` records the deferred UX/UI and colour redesign.

### Improvements

- On desktop the dashboard is two columns: the form and _This sitting_ on the narrower left,
  _Purchases by date_, _Due next_ and _Spendable_ on the right. On a phone they stack in that
  order.
- A failed add shows its error beside the form, with the typing left in place to retry.
- The dashboard re-reads the clock each minute, so a tab left open past midnight moves its
  default date and presets to the new day, without touching a date the reader picked.

### Decisions

- Built for one person working through a pile of receipts who gets distracted mid-pile: the
  sitting list is how they find their place, so it must outlive reloads and only clears on
  purpose.
- The range filters on the purchase date, not the entry time: it answers "what was bought
  then", and archiving a card later must not change that answer.
- Purchases saved before entry times existed are not backfilled and never appear in _This
  sitting_; guessing an entry time would put them in the wrong batch.
- The batch start is working state for one browser, not a record, so it stays out of backups.
- A friendlier visual redesign, including a "used this cycle" bar in _Spendable_, was mocked
  up and deliberately deferred to `TODO.md`.

## 2026-10-17: Clearer names for card and limit group owners

### Improvements

- The person on a card -- the card list's filter and row, and the card page -- is labelled
  `หน้าบัตร` in Thai and "Cardholder" in English, instead of `เจ้าของ` and "Owner".
- A limit group's owner -- the limit group table's column and the limit group form's field --
  is labelled `เจ้าของบัตร` in Thai and "Account holder" in English, and its missing-owner
  error reads "Choose the account holder for this limit group."

### Decisions

- English uses "Cardholder" for the card, because it names whoever is printed on the card
  face, and "Account holder" for the group, because a limit group stands for a bank account.
  Both used to read "Owner", which didn't tell them apart.

## 2026-10-12: Dependency bump, and editing purchases with close-date and future-date warnings

### BREAKING CHANGES

- The purchase form no longer refuses a date after today; it saves the purchase and warns.
  The message key `quickAdd.error.futureDate` is removed.

### Features

- Each purchase on the card page's statement list has an `Edit` button. It opens the purchase
  dialog, titled "Edit purchase", with the date, amount and note filled in; the card stays
  fixed, and saving writes over the same purchase id. Archived cards' purchases can be edited
  too, since that corrects history rather than adding to it.
- The purchase form warns, in amber, when the date is the selected card's statement close
  date: the bank may post such a purchase on this statement or the next one. The warning
  follows the date and card as they change and never blocks the save.
- The purchase form warns, in amber, when the date is in the future, and saves it anyway.
- The card page marks the current statement -- the earliest one not yet closed, where a
  purchase made today lands -- with a `Current` badge and an accent left rule.
- `isCloseDate` in `cycle.ts`; `cc-quick-add` takes a `purchase` to edit and adds its `id` to
  the `add` event; `cc-statement-list` emits `edit-purchase`.
- Messages added: `dashboard.editPurchase`, `quickAdd.save`, `quickAdd.closeDateWarning`,
  `quickAdd.futureDateWarning`, `card.error.editPurchase`, `statements.current`.

### Improvements

- Dependencies are up to date: `@kcstyles/reset.css` 2.0.0, `@kcconfigs/biome` 3.0.0,
  `@kcconfigs/tsconfig` 2.0.0 and `@happy-dom/global-registrator` 21.0.1 move a major version;
  `@kctools/bun-server` 0.4.0, `typescript-language-server` 6.0.2 and `wrangler` 4.149.0 are
  minor or patch bumps. No code changes were needed, and the existing tests pass unchanged.
- The card page counts its statements back from the latest purchase when one is dated past
  today, so a purchase dated beyond the open period still has a statement to edit or delete
  it from.
- Statement table rows are centred vertically, with `Edit` and `Delete` held together in one
  row, so the date, note and amount line up with the buttons.

### Decisions

- Both date checks warn rather than refuse. A purchase on the close date is valid, only its
  statement is uncertain; a future date can be a booking or an instalment entered ahead.
- An edited purchase shows no "over the limit" note: the remaining credit already counts its
  old amount, so weighing the new amount against it would count the purchase twice.

## 2026-10-04: Backup save and restore, with clipboard and merge-or-replace, sortable dashboard panels, a preview marker, a primary Merge button, and compact copied text

### Features

- The backup can be copied as text: `Copy text` writes the backup's JSON to the clipboard,
  compact rather than indented like the downloaded file so it takes less space, and confirms
  in its own status line.
- A backup can be restored from pasted text: `Paste text…` opens a text area with `Restore`,
  `Paste from clipboard` and `Cancel`.
- Restoring into a browser that already holds cards, purchases, payments or limit groups now
  asks first. It shows what is in this browser next to what is in the copy, then offers
  `Merge` (the old additive import) or `Replace` (delete everything, settings too, then
  restore). An empty browser restores straight away.
- `countRecords` and `replaceWithBackup` in `transfer.ts`; the reset question reuses
  `countRecords`.
- Messages added: `backup.save.title`, `backup.save.hint`, `backup.restore.title`,
  `backup.restore.hint`, `backup.copy`, `backup.copied`, `backup.paste`, `backup.pasteLabel`,
  `backup.fromClipboard`, `backup.importText`, `backup.question.file`,
  `backup.question.pasted`, `backup.here`, `backup.incoming`, `backup.counts`,
  `backup.merge`, `backup.mergeHint`, `backup.replace`, `backup.replaceHint`,
  `backup.importedText`, `backup.error.clipboard`, `backup.error.copy`.
- The dashboard's _Can spend now_ and _Due next_ panels sort from their column headings, and
  from a sort chip on the narrow layout, the same way the cards page does. _Can spend now_
  sorts by card, available, closes or due; _Due next_ by card, where, closes, due or total.
- `applySpendView`, `applyDueView` and `nextPanelSort` in `list-view.ts`; `sortChip` takes an
  optional fallback view and `sortHeader` an optional next-sort function.
- A preview deploy suffixes the page title and the header brand with `(pr-<n>)`, so it can't
  be mistaken for production. The deploy preview workflow passes the number as
  `BUN_PUBLIC_PR_NUMBER`; production shows no suffix.

### Improvements

- The Backup panel is split into two outlined halves, _Save a copy_ (`Download file`,
  `Copy text`) and _Restore a copy_ (`Choose file…`, `Paste text…`), side by side from
  640px and stacked on a phone. Restore runs one step at a time inside its own half, and
  cancelling a pasted restore returns to the text so it can be fixed.
- One verb, _restore_, runs from the button to the confirmation ("Restored …") and the error
  ("Could not restore that copy."). `backup.unreadable` no longer says "file".
- The file picker is styled as a quiet button instead of the browser's default control.
- `Merge` in the restore question is the filled primary button. As a quiet button its
  sunken grey matched the counts panel above it, so it read as a panel, not a button.
- Upgraded `@kcstyles/reset.css` 1.0.13, `@kctools/bun-server` 0.3.4, `@biomejs/biome`
  2.5.15, `typescript-language-server` 6.0.1 and `wrangler` 4.147.0.
- Both dashboard panels start soonest close date first. Before, _Can spend now_ listed the
  most room first and _Due next_ the soonest due date.

### Bug fixes

- The pasted-backup text area's monospace size now applies; `.backup__text` had lost to
  `.page textarea` on specificity.

### Decisions

- Merge or Replace is asked only when records exist. Settings alone don't count, so a fresh
  browser never sees the question.
- Each answer is a full button that states its consequence, and Replace uses the danger
  variant, so nobody wipes their data without reading what the button does.
- Copy and paste-from-clipboard buttons are hidden where `navigator.clipboard` lacks
  `writeText` or `readText`, rather than shown and failing.
- Importing straight from another deploy's origin (a preview pulling from production) was
  left out. Storage is per origin, and an iframe gets partitioned storage, so it would need a
  confirmed popup-and-`postMessage` bridge on production; copy and paste covers it for now.
- The dashboard panels have no saved order, so a third click on a heading returns to closes first
  instead of to "Saved order", and their sort chip has no "Saved order" option.
- The dashboard panel sort is kept on the component only and resets on reload, not written to the
  query string like the cards page's view.
- `BUN_PUBLIC_PR_NUMBER` is always stamped at build time, empty outside previews. The bundler
  only inlines variables that exist, and an unset one would stay a `process.env` read that
  throws in the browser and blanks the footer's commit and build time.
- The `(pr-<n>)` marker is not translated; it reads the same in English and Thai.

## 2026-09-30: Changelog link in the site footer

### Features

- `cc-site-footer` links `CHANGELOG.md` on the `main` branch, between the repository and the
  commit. The link targets `main` rather than the built commit, so an old deploy still points
  readers at the latest entries.
- Messages added: `footer.changelog`.

### Improvements

- The footer's repository and changelog links open in a new tab.

## 2026-09-24: Limit group owner, and a split, collapsible `/cards` page

### BREAKING CHANGES

- `Card.owner` is gone; the owner now lives on `LimitGroup`. Code that read a card's owner
  must go through its group. Two cards on one account can no longer name different owners.
- `ownerOf` now takes a `LimitGroup` instead of a `Card`.
- `cc-limit-groups` no longer exists. Use `cc-limit-group-form` and `cc-limit-group-table`,
  and listen for `edit-group`. Inline row editing was removed.
- `cc-card-form` no longer has an owner select.
- Messages removed: `form.owner`, `form.error.owner`.

### Features

- `LimitGroup` has an `owner?: Owner` field. The owner belongs to the account behind a card,
  and a limit group models that account. `ownerOf` still falls back to `KC` when the owner
  is missing or not recognised.
- Messages added: `limits.owner`, `limits.column.owner`, `limits.error.owner`,
  `limits.edit`, `cards.list`.

### Improvements

- Limit groups are managed by `cc-limit-group-form` and `cc-limit-group-table`, matching the
  card form and table. Edit dispatches `edit-group`, and the route keeps `editingGroup` next
  to `editing`, so the page has one editing pattern.
- The card table keeps its Owner column, which now reads the owner from the card's group.
  A card with no group shows `cards.unassigned` rather than an invented `KC`.
- All four sections on `/cards` (card form, card table, limit group form, limit group
  table) collapse. Each component owns a `<details>`, and its title moved into the
  `<summary>`. Tables start open through a static attribute, so a re-render never reopens
  a section the reader closed. Forms start closed, open when an edit target arrives, and
  follow their own `toggle` event.

### Decisions

- A group without an owner reads as `KC`, so no migration is needed. Existing groups show
  `KC` until someone edits them. Copying each card's owner up to its group was rejected
  because it would need a rule for cards that disagree.
- `Card.owner` was removed from the type but not from stored records. Unread keys cost
  nothing, and rewriting every card to strip them risks write failures for no benefit.
- The backup version stays at 2. A missing group owner is accepted. An owner outside the
  closed set is rejected.

## 2026-09-23: Credit limits and shared limit groups

### BREAKING CHANGES

- Version 1 backups are rejected. Only backup format version 2 imports.
- Every card must belong to a limit group. Cards stored before this change have none and
  show as unassigned until someone assigns them by hand on `/cards`.

### Features

- `LimitGroup { id, name, limit }`, with `limit` stored in satang. It is saved under
  `cc:limitgroup:<id>` and handled by `listLimitGroups`, `saveLimitGroup` and
  `deleteLimitGroup`, which are covered by the storage contract suite.
- `Card.limitGroupId`. It is optional only so that cards stored before this change still
  load.
- `src/lib/domain/limit.ts` with `outstandingOf`, `spendableRows` and `unassignedCards`.
  Available credit is the group's limit minus every purchase on an unpaid statement,
  including the open period. Archived cards count toward `used` but are not listed.
- A **Can spend now** dashboard panel (`cc-spendable`). It lists each card's available
  credit out of its limit, plus the open period's close and due dates, sorted with the
  most room first. It marks shared groups ("shared with N cards") and flags over-limit
  rows with `data-state="over"`. It also shows how many cards have no group, and has an
  empty state.
- `cc-quick-add` shows "Available ฿X of ฿Y" for the selected card. A purchase over that
  amount still saves, and the confirmation says by how much it went over.
- A limit group section on `/cards`, a required group select on the card form, and a
  Limit group column on the card table.
- Backup format version 2 with a `limitGroups` list. Groups are imported before cards.

### Decisions

- **Every unpaid baht counts against the limit.** Counting only closed statements would
  show more room than the card really has. Because a payment records no amount, marking a
  statement paid gives back exactly that statement's total.
- **Every card belongs to exactly one group.** A card that shares with no other card is a
  group of one, so the calculation is always done per group.
- **Breaking change, no migration.** Version 1 backups are rejected. A card with no group
  is treated as unassigned until someone assigns it by hand.
- **Over-limit purchases are recorded, not blocked.** The app records what happened, and
  the stored limit may be out of date.
- Groups are managed on `/cards` rather than on a fourth route.
- A backup card whose `limitGroupId` matches no group in the file is still imported. Import
  only adds data, and the group may already exist in the browser.
- The close and due dates come from `openPeriod`, not from `nextActionable`. The panel
  answers "if I spend today, when is that due?", while the due list answers "what do I pay
  next?".

## 2026-09-22: Design system on reset.css and shadow DOM

### BREAKING CHANGES

- `@picocss/pico` was removed in favour of `@kcstyles/reset.css@1.0.12`. Anything that
  relied on Pico's classes or document styles no longer gets them.
- Button variants moved from classes to an attribute: `class="secondary"` became
  `data-variant="quiet"` and `class="secondary outline"` became `data-variant="danger"`.
  With no attribute, a button is the primary variant.
- Shadow CSS may use values only through `var(--cc-*)`. Literal hex, rem or colour values
  are not allowed.

### Features

- New `src/styles/tokens.css` for `:root` custom properties and dark mode,
  `src/styles/app.css` for the light-DOM page shell, and `src/styles/shared.ts` for the
  shared Lit modules `base`, `controls`, `panel` and `dataTable`. Custom properties are
  inherited across shadow boundaries, so each value is defined once and each rule is
  written for both the light DOM and shadow roots.
- Token groups: type, space, shape, surface, text, accent, status, urgency and focus.
  `--cc-font-sans` lists Thai faces as well as the system Latin fonts, and `--cc-leading`
  is `1.65` so Thai vowel and tone marks don't get clipped.
- The `base` shadow reset copies the reset's `div` convention (`div` is a column flex
  container, with `<div row>` and `<div block>` as the alternatives).

### Improvements

- Layout: a sticky header, and content up to `72rem` wide. At `≥960px` the dashboard has
  two columns, with the quick-add form sticky beside the due list. On narrower screens
  quick-add comes first. Tables turn into stacked rows below `640px` using `data-label`.
- The urgency border now comes with a text badge, so the urgency doesn't depend on colour
  alone.

### Bug fixes

- Six of the eight components had no styling, because Pico's document styles never reached
  inside shadow roots. Styles now come from `@kcstyles/reset.css` and shared shadow modules.

### Decisions

- Pushing one shared `CSSStyleSheet` into every shadow root was rejected, and so was
  rendering components into the light DOM.
- There is no `<cc-nav>` component and no web fonts. The nav element ids are unchanged, so
  `chrome.ts` still works.
- Appearance is checked with Playwright screenshots at `390px` and `1280px`, in English and
  Thai, in light and dark mode. happy-dom doesn't compute styles.

## 2026-09-21: Location choices, English and Thai, Cloudflare deployment

### BREAKING CHANGES

- Phase A: location is now a fixed set. Unrecognised stored values are reset to
  `bangkok` at startup, and backup import rejects a card with an unknown location.
- Phase A: the card form uses a `<select>` instead of a free-text datalist, so a new
  location can no longer be typed in.

### Features

- Phase A: `LOCATIONS = ["bangkok", "phichit", "krabi"]`, with
  `DEFAULT_LOCATION = "bangkok"` and `toLocation` in `src/lib/domain/location.ts`. The
  lowercase key is stored and the label is looked up by language.
- Phase A: `migrateLocations` runs once at startup. It resets unrecognised values to the
  default, records which cards were reset in `cc:migration:location`, and `/cards` shows a
  notice that can be dismissed. Running it twice changes nothing, and a failure on one card
  does not stop the page from loading.
- Phase B: English and Thai. A hand-written catalog in `src/lib/i18n/` (`en.ts`, which
  defines the keys, and `th.ts`, which must satisfy `Catalog`), a `LocaleController` for
  Lit, and a `cc-lang-switch` control. Switching language re-renders in place without
  reloading the page.
- Phase B: language choice uses the saved `cc:lang` value first, then English if
  `navigator.language` starts with `en`, otherwise Thai.
- Phase B: errors carry a `{ key, params }` pair, not an English sentence, and are
  translated where the banner is rendered.
- Phase B: dates are shown as `dd MMM yyyy` with Gregorian years in both languages
  (`21 ก.ย. 2026`), never Buddhist Era, so they match bank statements. The day is
  zero-padded. `Intl` is not used for dates.
- Phase C: Cloudflare Worker and KV. `wrangler.toml` binds `./dist` as `ASSETS`
  (`auto-trailing-slash`) and adds `CC_KV`. `worker/index.ts` handles `/api/*`, and
  `src/lib/storage/http.ts` implements `Repository` over that API.
- Phase C: `BUN_PUBLIC_CC_STORAGE=http` picks the HTTP repository at build time.
- Phase C: KV keys are the localStorage keys without the `cc:` prefix, with each part
  percent-encoded the same way. Deleting a card scans `purchase:<encoded id>:` with the
  trailing colon, so deleting a card doesn't also delete records for other cards whose id
  starts with the same text.
- Phase C: Cloudflare Access protects the whole Worker. There are `deploy` and `cf:dev`
  scripts.

### Decisions

- `@lit/localize` was rejected because it needs an extraction CLI and XLIFF files, which is
  a lot for two locales. Reloading the page on a language switch was rejected because it
  would throw away a half-filled form.

## 2026-09-15: Phase 1, local card tracking

### Features

- A registry of cards (id, name, last 4 digits, location, billing cycle rule, comment,
  archived), purchases (stored in satang), and payment records for statements.
- Statements are derived when read, not stored. A `StatementPayment` stores the close and
  due dates as they were when the statement was paid, so editing a cycle rule later doesn't
  change history that is already paid.
- Two cycle rules: `offset` (the due date is the close date plus N days) and `fixed` (the
  due date is a day of the month). With `fixed`, a due day that is not later than the close
  day falls in the next month. Days past the end of a month are clamped. A statement period
  is `(previousClose, thisClose]`.
- Dates are plain `YYYY-MM-DD` strings in Asia/Bangkok, calculated with `Date.UTC` and
  `getUTC*`. Local-time `Date` values are never used.
- A `Repository` interface made only of key lookups and prefix scans, with an in-memory
  version and a localStorage version (`cc:card:`, `cc:purchase:`, `cc:payment:`). One
  contract suite tests both.
- Three pages: the dashboard (due next, quick add, cards by location), `/cards` (the
  registry, with archive or delete), and `/card?id=` (statements with Mark paid and Unmark).
- JSON export and import of all data.
- Writes are awaited, never applied ahead of time, and a failure shows a banner with a
  retry.

### Decisions

- Storing a statement per card per month was rejected. It would need a generation job and
  would give two sources of truth.
- localStorage was chosen over IndexedDB. The data is small, and neither Bun nor happy-dom
  provides `indexedDB`.
- Phase 2 was designed as a Cloudflare Worker with KV behind Cloudflare Access. It was
  built on 2026-09-21. Phase 3, staff accounts, is deferred.
