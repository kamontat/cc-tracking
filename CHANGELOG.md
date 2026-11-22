# What's new

What changed in cc-tracking, newest first, and why. Each update says what you will see or do
differently; the last part of each, _Technical_, is for developers. อ่านภาษาไทยได้ที่
[`CHANGELOG_TH.md`](CHANGELOG_TH.md).

## 2026-11-22: Owed names each card's holder and hides open statements by default, and Cards dates follow the bill still to pay, and What's new is written for you, in English and Thai

### BREAKING CHANGES

- _Owed_ now shows bills and planned payments only. To see open statements, pick _Open
  statements_ in _Filter_ > _Shows_. A saved link to _Owed_ opens without them too, unless it
  picked them.

### Features

- _Owed_ hides open statements until you pick them in _Filter_ > _Shows_. Once shown, they
  appear as an _Open statements_ × chip you can remove like any other filter.
- _What's new_ in _Settings_ > _About_ opens this history in Thai when the app is in Thai.

### Improvements

- A row in _Owed_'s day panel names the card with its holder,
  `46) UOB Preferred Platinum · Dad`, so you can tell whose card a bill is on.
- An open statement's row says just _Still open_, and an estimate reads `~฿90,000.00` without
  _so far_.
- A card's `closes … · due …` line on _Cards_ shows the oldest closed statement that still owes
  money, even past its due date, and moves on to the next statement only once that one is paid
  off. _Soonest due_ sorts by that due date, so the bill to pay comes first.
- This history is now written for the people who use the app: each update says what you will
  see or do differently, in the app's own words. Developer detail sits in each update's last
  part, _Technical_.

### Decisions

- _Soonest to close_ keeps sorting by the next close date still ahead, so cards whose bill has
  already closed do not jump to the top of a close-date sort.
- With several unpaid closed statements a card shows the oldest, the bill to pay first.
- Open statements are hidden by default because they are estimates that can still grow; the
  `~` already says so, which is also why _so far_ was dropped.

### Technical

- `/owed` without `f.shows` now means `f.shows=bill&f.shows=plan`; open statements need
  `f.shows=bill&f.shows=plan&f.shows=open`. An address that wrote `f.shows=bill&f.shows=plan`
  now reads as the default and is written as nothing (DD-216).
- The day panel's card title comes from `cardOwnerLine`, the holder by its stored name (DD-215).
- The _Still open_ line (_ยังไม่ปิดรอบ_) and the estimate without _so far_ (_ราว ฿90,000.00_ in
  Thai) are DD-215.
- A Cards tile's dates come from `cardShownDates`, built on `nextBill`, and _Soonest due_ sorts
  by the shown due date (DD-217).
- `CHANGELOG_TH.md` holds every entry of `CHANGELOG.md` in Thai, same dates and sections; each
  file links the other. About's link carries `data-i18n-href="about.changelogUrl"`, which
  `applyCopy` swaps with the locale; the `CHANGELOG_URL` constant is gone (DD-218).
- Every entry was rewritten for users, with code names, query keys, PRD IDs, refactors, tests and
  deploys moved to a new last `### Technical` section. `tests/changelog.test.ts` keeps both
  files' entries and sections in step and rejects a PRD ID or camelCase code name before
  Technical; `project-changelog` describes the voice.

## 2026-11-15: A compact amount entry, easy-to-spot add rows, and one amount field everywhere

### Improvements

- In a card's sheet on the purchase list builder each order is one compact box: `฿ amount` and
  the note side by side, with the order's × at the end once there are two. An amount that is
  not money turns the box red, with its message under it.
- An order no longer has an _Order N_ heading or a visible _Note (optional)_ label: the note
  field shows its label as a hint inside it, and the order's × sits inside the order's box.
- _+ Add order_ is a full-width row right under the orders, and _+ Add a card_ the same row on
  the list: a dashed outline in the accent colour with a plus icon. _+ Add a card_ is as tall
  as a card row, with a plus where the card's chip would be, so it reads as the list's next row.
- Every amount field looks the same: the builder's orders, the reply's real amount, the add
  purchase form and the pay form. The box is as tall as any other field, and its hint no
  longer looks like a typed figure.
- An amount field is as wide as `10,000,000.00` and no wider; the note or date beside it takes
  the rest. In the reply the planned figure sits beside the real one at its own width, and the
  real one keeps its width before the order is answered, so nothing moves.

### Decisions

- Every amount field shares one look, so a change to it reaches every place at once; the user
  asked for every amount field to match.
- 10 million is the widest figure the field is sized for, as the user asked: wide enough for any
  purchase or payment, and it leaves room for the note or date on the same line.

### Technical

- The order box is DD-214. Previously listed as a breaking change: the `.order-head` heading is
  removed, the note's label is its placeholder, and the × (`remove-order`) now sits inside
  `.order-fields`.
- The shared amount field is app.css's `.amount-box` and `.amount-in`, held to it by
  `tests/styles/amount-field.test.ts`, rather than each component's own style.
- The box's height is `--cc-amount-height` and the amount's width `--cc-amount-width`.

## 2026-11-14: Owed becomes a calendar of what to pay each day, restore from a link, Settings panels and a data summary, Cards filters and totals, and a new spender's reply

### BREAKING CHANGES

- Restore no longer reads backups made in data version 1 or 2, and writes nothing from them.
  Restore such a backup in an older version of the app first, then download a fresh copy.
- Payments saved in the app's oldest format are no longer converted when the app opens. A
  browser that has not opened the app since that format was replaced loses those payments;
  payments converted earlier are kept. _Delete all data_ still clears what is left of them.
- The Locations and Owners pages, `/settings/locations` and `/settings/owners`, are gone and
  show a not-found page. Open them from _Settings_ with _Manage locations_ and _Manage owners_,
  and update any bookmarks.
- _Owed_ no longer shows a tile for each card, and a saved link to it with a sort or a filter
  on balances opens the new calendar instead. To see what each card owes, use the _Balance_
  filter on _Cards_.

### Features

- _Manage locations_ and _Manage owners_ open their editor in a panel beside _Settings_ (a
  sheet on a phone), so _Settings_ stays in view. A row's click opens its panel and marks the
  row; the other row swaps it; ×, Escape and Back close it. A change in the panel updates the
  row's summary at once, and a restore or _Delete all data_ refreshes the open panel. Every
  "choose places in Locations" link opens this panel, and a reload or a shared link keeps it
  open.
- _Settings_ has a _Your data_ section at the top of its side column with one row, _Data
  summary_, whose line gives the gist ("4 cards · 66 purchases · 17.5 KB"). It opens a panel
  that sums up what this browser holds: cards (active and archived), limit groups, purchases
  (their total and first to last date), payments (paid and their total, and planned), purchase
  lists by status, locations, owners, and the space the app's data takes. It counts again after
  a restore, a clean-up, a reset or a change in another panel.
- _Settings_ › _About_ ends in _Force refresh_: it fetches the newest version of the app and
  reloads, without touching your saved data. Once pressed, it reads _Refreshing…_ and takes no
  second press until the page reloads.
- _Restore a copy_ can fetch a backup from a link: _From a link_ asks for an address, and the
  copy goes through the same checks and _Merge_ or _Replace_ as a file, named after the link's
  file. A link that is not a web address, cannot be reached (most often a site that does not
  let other sites read it) or answers with an error says why and writes nothing.
- _From a link_ takes GitHub Gist and PasteFox share links as they are, reading the file behind
  them, and names the copy after the gist's file or the paste's code. With no file picked in a
  gist, it reads the gist's first file, and a link typed without `https://` gets it.
- The link step's hint suggests where to keep a copy, as links that open in a new tab: GitHub
  Gist and PasteFox (no account needed).
- On Gist and PasteFox a link that fails names the site and what to check: nothing there
  (deleted or expired), private or behind a password, another error, unreachable, or not a
  backup at all. On other sites an unreachable link also suggests the two.
- _Cards_' _Filter_ has a _Usage_ section: _Used_ (a card with at least one purchase, paid off
  or not) and _Not used_, shown as removable chips. A new _Used_ sort puts the card that owes
  most now, less its own credit, first; ties go by card id.
- _Cards_' _Filter_ has a _Balance_ section: _Owes_, _Overdue_, _Due in 7 days_ (the same rule
  as _Owed_) and _Has credit_, shown as removable chips.
- A totals panel under _Cards_' search and filter row sums the cards on show: _Cards_, _Owed_
  (each card's own, less its credit), _Due in 7 days_ (warning-toned, with how many cards) and
  _Used of limit_ (each limit group once, with the same bar as a card). It follows search and
  filters, not the sort, and when the cards are grouped each group's heading shows the same
  totals on one line.
- _Home_'s _Owed_ tab is a calendar of the money to have ready each day: one month at a time
  with ‹ and ›, each paying day's total in its cell (darker the more it is, with a dot per
  card), a last column with each week's total, and today ringed, red with the late amount while
  anything is late. _By week_ and _By month_ list the same days under each section's total.
- What counts on each day: a closed bill's amount still unpaid on its due date; a planned
  payment on its own date, taken off the card's oldest bill first so nothing counts twice; and
  an open statement as a `~` estimate on its due date that never goes into a total.
- The tab keeps _Cards_' search and _Filter_ (_Range_ of 7, 14, 30 or 60 days or _Everything
  owed_, _Kept in_, _Account holder_, and _Shows_ for bills, planned payments or open
  statements), with no sort or grouping, and a saved link keeps all of it.
- A day, or the late money, opens in a side panel as a list does on _Lists_: its total, what is
  needed in all by then, and each card as an opening row with its billing cycle, _Pay_ and
  _Open card_. _Pay_ opens the card's pay form a step further, so Back and the form's ‹ both
  return to the day.
- The tab's totals sit in the same kind of panel: _To pay_ over the range (its dates at the end
  of the title), _Next_, _Next 7 days_, _Biggest day_ and, while anything is late, a red _Late_
  that opens the late money's panel.
- In the spender's reply, a made order whose real amount differs from the plan offers a quiet
  _Use planned ฿X_ beside the difference, which puts the planned amount back.

### Improvements

- With a panel open beside it, _Settings_ stacks its two columns into one when there is not
  enough room beside the panel.
- A location's _Takes purchases_ tick reads its name alone, without "· its cards show under
  Ready to use".
- A backup from an old version names the versions this app reads: "This backup is version 2,
  but this app reads versions 3–4."
- Restore reads only data versions 3 and 4, so _Merge_ only ever adds to what you have.
- _Delete old purchases_ is now _Clean old data_, and its line names the payments and lists
  that go with the purchases.
- _About_'s _Built_ names the time zone by its offset from GMT, `30 Oct 2026, 14:05 (GMT+7)`,
  instead of the zone's name.
- A form in the side panel (_Edit_, _Make a payment_, _Add purchase_) slides in from the side,
  and ‹ back slides the record in again; a reduced-motion setting turns this off.
- An unfolded statement on a card lists its purchases and payments newest first, as the
  statements themselves are; on one day a purchase still comes before a payment.
- The restore sheet's link and pasted-text steps have _Back_, and their _Restore_ waits until
  an address or some text is there. Each step slides in, and _Back_ slides the step before in
  from the other side; a reduced-motion setting turns this off.
- Every way into a restore, _Back_ and _Restore_ are the same quiet button led by an icon
  (clipboard, file, link, back, restore). _Paste by hand_ stays a text link, with a keyboard
  icon, and _Merge_ stays the main button. The _Settings_ row reads "From pasted text, a file
  or a link".
- _Transactions_' month summary is the same kind of totals panel, and follows search and
  filters: titled _N matching entries_, it sums the matching _Purchases_ and _Payments_ from any
  month and names the dates covered (`1 Oct – 31 Oct 2026`, from the date filter or the
  entries). Its third figure is _Net_ (payments less purchases, signed and coloured) instead of
  _Owed now_, a zero shows plain, and the panel hides only when nothing matches.
- The `N results · ±฿X` line under the summary is gone: the panel's title counts the matches
  and _Net_ is their total.
- On a saved list whose unmade lines went to the next day's draft, each of those lines says
  _Moved_ instead of _Not made_, in the list's panel, its opened row and its table, text and
  image. A saved list that kept them still says _Not made_.
- The saved list's note under its lines (_… moved to a draft for {date}_, _Open it when you're
  ready to send_), which opened the draft, is gone; the panel ends at the saved summary.
- The spender's reply looks like the list builder: a row per card in one panel, each with its
  chip and `id) name`, how far it is answered (_Not answered_, _1 of 2 answered_, _Made_, _Not
  made_, _1 made · 1 not made_), the difference from the plan or _not an amount_ with an amber
  bar, its notes, and the planned sum (muted) until answered, then what was made, or the plan
  struck through when nothing was.
- A reply row opens its card's sheet, narrow and compact, headed by the card with _Card N of
  M_ and ‹ › to the card before or after. Each order is a _Made_ / _Not made_ toggle (a ✓ and a
  ✕, tinted when picked), then _Planned_ beside _Real amount_, the box to type in once made,
  which takes the cursor. Back closes the sheet, as on the builder.
- The reply's side panel works like the builder's: the move checkbox, then _Answer every line
  (N of M)_ until all are answered, then _N made · M not made_, the made total, and _Save N
  purchases_ (_Save reply_ when nothing was made). The save button no longer repeats the
  total, and the hint reads _Open each card to record whether it was made_.

### Bug fixes

- On a phone, opening a form in a card's or a limit's sheet no longer jumps to the full screen
  with no motion: the sheet keeps its height, with the page still showing above it.
- A card's statement heading highlights as a square band to the panel's edges on hover, like
  every other row list, instead of a rounded pill that ran into the panel's border.
- An unfolded statement's _Edit_ and _Delete_ no longer stack on two lines in the side column
  on wide screens: they share a line under the date and amount, and join the row only when the
  panel itself is wide enough.
- _Choose a file_ in the restore sheet is as tall as the buttons beside it.
- Something that is not a backup at all (pasted, a file or a link) now says it is not a
  readable backup, instead of "This backup is version undefined, but this app reads versions
  3–4."
- ‹ on a form opened a step further from another panel (a day's _Pay_) goes back to that panel
  instead of the card's summary.

### Decisions

- The old payment format's conversion went along with version 1 and 2 restore, rather than
  being kept for browsers that never ran it, because the user asked to treat data versions 1
  and 2 as removed.
- Locations and Owners are a panel over _Settings_, as the user asked, so _Settings_ stays in
  view as a card's list does beside its panel. A reload or a shared link keeps the panel open.
  The old pages went without a redirect, as every retired address has.
- Moving the delete note above each list was tried and reverted: the user preferred it under the
  list.
- The data summary counts from the same data _Download a copy_ saves, so its figures match the
  copy. Its storage figure counts only this app's data, so another app on the same site does
  not inflate it.
- The summary first sat on the page as a list, then moved behind a row into a panel, as the user
  asked; like Locations and Owners, Back closes it and a link keeps it open.
- A form keeps the sheet's height and slides in, the user's choice over growing the sheet to
  full height with an animation, or opening a second sheet on top of the first.
- _Force refresh_ clears the app's offline copy before reloading, since a plain reload would be
  answered from that copy, the version already running.
- Restore from a link fetches a backup file from a web address, the user's choice over packing
  the backup into a link to the app. Your browser does the fetch, so only sites that let other
  sites read them work (a raw GitHub or gist link does); share links from Google Drive or
  Dropbox are not turned into direct downloads, and the message suggests downloading the file
  instead.
- PasteFox was added beside GitHub Gist at the user's suggestion, as a place to keep a copy
  with no account.
- A gist link that picks a file finds it by turning the last dash in the link into a dot, the
  rule the user gave. A file name with another dot is not found and says so; the gist's raw
  link still works for it.
- _Used_ sorts by what the card itself owes now, less its credit, rather than its limit group's
  used amount, which every card in the group shares and _Limits_ already sorts by. _Usage_ is two
  chips rather than one _Used only_ toggle, so cards never used can be found too.
- _Transactions_' summary now follows the filters, at the user's request. Its title turns to _N
  matching entries_ and names its dates, so a filtered sum is not read as the month's total.
  _Net_ replaced _Owed now_ there because what each card owes already shows on _Home_'s _Owed_
  and the _Cards_ totals, and _Net_ carries the total the dropped results line showed.
- The totals are one panel split by thin lines rather than four boxes, the user having asked
  for a better design; an odd last figure spans the row on a phone so three amounts are never
  squeezed into thirds.
- The money to prepare is shown by day rather than by card, after three rounds of mockups. The
  calendar was kept as the main view, with week and month lists beside it; a bar chart, a
  separate _Prepare_ tab, sort and grouping, a red late banner, _Copy plan_ and side panels for
  each holder and for a text to send were dropped along the way at the user's request.
- A planned payment counts on its own date, since that is when the money leaves, and it comes
  off the oldest bill so the bill's own due date shows only what the plan leaves.
- Open statements are shown but never totalled, because they can still grow before they close.
- A saved list's moved lines say _Moved_ rather than keeping a note that links to the draft:
  the note's date was the list's day plus one, not the draft's, and it opened nothing once the
  draft was deleted or merged. Keeping the note beside the _Moved_ lines and making a _Moved_
  line open the draft were turned down.
- The reply follows the builder, rows that open a sheet per card, as the user asked, rather
  than a list of cards with every order open at once. Of the sheet changes offered, the user
  chose the card as heading, the toggle and the planned-beside-real figures, and passed on a
  _Next card_ button and a note on what _Not made_ does; they then asked for the sheet narrower
  and shorter.

### Technical

- Restore refuses a version 1 or 2 backup and writes nothing; a fresh download is version 4
  (DD-202).
- Startup no longer converts the old per-statement payments (`cc:payment:<cardId>:<period>`). A
  browser that never opened the app after phase 4 loses them; payments converted earlier (`m:`
  ids) are kept, and a reset still clears the leftover records.
- Removed: `StatementPayment`, `Statement`, `PaymentPart`, the repository's `listPayments`,
  `savePayment` and `deletePayment`, `buildStatement`, `partsOf`, `migratePayments` and
  `convertPayments`. `replaceWithBackupV4` no longer takes a storage argument.
- Message keys removed with the payment conversion: `startup.paymentsFailed`, `backup.payment`,
  `backup.problem.badLocation`, `backup.problem.badPaidAt` and `backup.problem.badParts`.
- Restore reads only versions 3 and 4: the version 2 conversion, its payment and closed-set
  location checks, and the clearing of stale `m:` parts on import are gone, so every Merge is
  purely additive (DD-95 and DD-133 retired).
- `backup.version` now takes `oldest` and `newest` in place of `expected`. The existing key
  gives the message rather than a separate "no longer supported" one, and gives the versions as
  a range, so a later version updates it without new text.
- `/settings/locations` and `/settings/owners` are 404s with no redirect, as RD-29 does for
  every retired address; Locations and Owners open at `/settings?panel=locations` and
  `/settings?panel=owners` (DD-203). `panel=` was the user's choice over `manage=`.
- Removed with the old pages: the static `SubHeader` molecule, the `.page--form` width and the
  message keys `title.locations`, `title.owners` and `locations.takesHint`.
- `DetailPanel`'s `full` prop is now `form`, and the panel no longer carries `data-full`.
- `formatBuiltLocal` takes an offset in minutes east of GMT instead of an IANA zone name,
  `BuiltTime`'s `timeZone` prop is now `offset`, and `viewerTimeZone` is gone (DD-206).
- The data summary is `?panel=data` (RD-31, DD-204). It counts from the backup export
  (`exportBackupV4`), and its storage figure counts only `cc:` keys, two bytes per character as
  browsers keep localStorage. Once Locations and Owners became panels (DD-203) it took the same
  `panel=` key rather than staying out of the address.
- _Force refresh_ is `forceRefresh` in `#lib/offline/register` (DD-206): it unregisters the
  service workers and deletes the offline caches before reloading.
- Settings' stacking is a container query on `.settings-layout`, at less than `40rem` beside
  the panel.
- `bun run mock` writes a version 4 backup holding every state the app can show: bills overdue,
  due soon, partly paid and due later, a card in credit, groups within, high and over their
  limit, every list status and amount warning, late, near and later planned payments, archived,
  supplementary, unused and not-ready cards, and over three years of history that _Clean old
  data_ can trim at every age.
- The mock's dates are built around today (`--today` to pick another day), so the relative
  states hold whenever it runs. Names, card ids, cycles, amounts, history lengths and a varying
  number of extra cards, groups, owners, places, saved lists and plans come from a random seed
  the script prints; `--seed <text>` draws the same file again.
- `tests/scripts/mock-data.test.ts` checks every mock scenario through the domain functions
  across several days and seeds.
- The mock data is a backup file rather than a seed the app loads itself, so it goes through
  the same restore checks as real data and nothing extra ships to production. Its scenarios are
  built per role, with randomness only around them, so no seed can lose one.
- Restore from a link is DD-208. Keys added: `backup.fromLink`, `backup.linkLabel`,
  `backup.linkHint`, `backup.link.notAddress`, `backup.link.unreachable`,
  `backup.link.status`, `backup.linkHint.gist`, `backup.linkHint.pastefox` and
  `backup.link.platform.*`. Only http and https addresses are accepted.
- Gist links: `gist.github.com/<user>/<id>#file-gistfile1-json` is read from
  `gist.githubusercontent.com/<user>/<id>/raw/gistfile1.json`; with no anchor, the gist's first
  file. A name with another dot answers 404.
- PasteFox links: `pastefox.com/<code>` is read from `pastefox.com/api/pastes/<code>/raw`, the
  only PasteFox address other sites may read; its `api.pastefox.com/v1` API allows pastefox.com
  alone.
- Cards' _Usage_ filter is `f.usage` and the _Used_ sort `sort=used` (DD-209). The _Balance_
  filter is `f.states` (DD-210).
- The totals panel is the `GlancePanel` molecule, shared by Cards, Transactions and Owed; a
  glance figure can open something (`GlanceFigure.open`). Its one-panel design and the
  full-width odd figure on a phone are DD-210.
- Transactions' summary following the filters reverses DD-87 (DD-87, DD-210). Message keys
  removed: `tx.summary.owed`, `tx.results.one` and `tx.results.many`. `entriesTotal` is gone,
  `monthSummary` takes only the entries and today and returns
  `{ count, purchases, payments, net }`, and the `.tx-summary` styles are removed from
  `app.css`.
- The Owed calendar is DD-211. Its state is in the address as `f.range`, `f.shows`, `view` and
  `month`; a day opens at `/owed?day=2026-11-18` and the late money at `?day=late`.
- `/owed` ignores the old per-card keys `f.states`, `sort`, `dir` and `by`; a link that used
  them lands on the calendar (DD-211).
- The calendar came from three rounds of mockups,
  `docs/superpowers/specs/2026-11-14-owed-calendar-mockup.html`.
- The per-card Owed code was removed in a follow-up once Cards' balance filter (DD-210) turned
  out not to need it: `OwedList`, `#lib/domain/owed` (`owed.ts`), `#lib/ui/pay-tile`,
  `#lib/ui/pay-tag`, `PayChoice` and `payChoices`, `CardTile`'s `figure` and `action` props,
  the `--cc-tile-act-width` and `--cc-tile-act-height` tokens, and the `urgency` and `left`
  sort fields. Nothing on screen changed.
- Message keys removed with it: `pay.tag.nothing`, `pay.tag.credit`, `pay.owedUnder`,
  `pay.pickName`, `pay.tile.bill`, `owed.filter.title`, `owed.filter.state`, `owed.state.*` and
  the `sort.*.urgency` and `sort.*.left` words.
- The _Moved_ label is `reply.moved` (ย้ายแล้ว), DD-212. Message keys `saved.moved` and
  `saved.openDraft` are removed, with the `.list-moved` and `open-draft` styles.
- The spender's reply is `/transactions/lists/edit` on a waiting list, redrawn as the builder
  is (DD-213). _Use planned ฿X_ is `reply.usePlanned`.
- `Sheet` takes an optional `lead` snippet drawn inside its heading before the words, so a
  sheet can be headed by a card's chip and name.
- _Clean old data_ (ล้างข้อมูลเก่า) is DD-207; the GMT offset on _Built_ is DD-206.
- The sliding form and the sheet keeping its height on a phone are DD-205; a second sheet on
  the first is ruled out by RD-24.
- Statements' newest-first order within an unfolded statement is DD-122.
- The square hover band follows DD-109. The unfolded statement's buttons use a container query
  on the panel instead of a screen-width media query, from 900px.
- _Choose a file_ was a label and took the body's line height.
- The "not a backup" message is for JSON with no `version`.
- New icons: `clipboard`, `file`, `link`, `keyboard` and `restore`.
- `bun run test` prints no warnings. Every Svelte component compiles cleanly: the read-once
  `clock`, `address` and `mode` props are read through `untrack`, `Sheet`'s script-set
  `data-closing` selectors are `:global`, `CardHero`'s unused `.hero p` rule is gone, and
  `DetailPanel`'s swipe moves onto its `listen` attachment.
- The page tests load pages through `import.meta.glob`, and the container renderer comes from
  `@astrojs/svelte/container-renderer` rather than the deprecated root export.
- `tests/components/svelte-warnings.test.ts` compiles every `.svelte` component and fails on
  any warning, so a new one breaks the test run instead of scrolling past in the log.
- An empty `svelte.config.js` keeps Svelte's defaults and stops vite-plugin-svelte noting on
  every run that it found no config (`tests/config/svelte.test.ts` holds it empty).

## 2026-11-13: Tabs and a detail panel, card ids and limit groups checked, and owners managed in Settings

### BREAKING CHANGES

- The old addresses of a card, the card form, the payment page and the purchase list pages no
  longer open (they show page not found), and nothing sends you on. A card now opens in its
  panel on _Cards_, a list in its panel on _Lists_, and a payment starts from _Pay_ on a bill in
  _Owed_ or in a card's panel. Update your bookmarks.

- `/backup` no longer takes you to _Settings_; open `/settings` instead.

- A saved link with filters, a sort or a view picked from before this change opens the page's
  default view, because the address now stores them differently. Set the view up again and
  bookmark it.

- The views moved to their own addresses: _Owed_ is `/owed`, _Lists_ is `/transactions/lists`,
  _Limits_ is `/cards/limits`, and Home's _Ready to use_ is its own tab at `/ready`.

- The floating _+ New_ button and its menu are gone: start a list from _+ Add list_ on the
  _Lists_ tab or a card's _Use on a list_, and a payment from _Pay_ on a bill or in a card's
  panel.

- Restore now refuses a backup, and changes nothing, when a card's id is not in the card id
  format (such as `K1`, `5.` or `1..2`), a card has no limit group, or a card names a limit
  group the file doesn't have. Fix the file (lower-case ids, a group for every card) and
  restore again. Every card in the 2026-11-07 backup passes.

- Every card needs a limit group now: the _Not in a group_ filter and section and the _No
  account holder_ section are gone from _Cards_, and _Ready to use_ no longer counts cards
  without a limit group.

- Backups are now saved in a new format that carries your owners. The app from before this
  change can't restore it, so restore a new backup only into the current app. Older backups
  still restore.

- A new backup is refused, with nothing changed, when a limit group or a supplementary card
  names an owner the file doesn't list.

### Features

- Home, Transactions and Cards have tabs, one view at a time on every screen, each tab with
  its own address: Home _Needs you_ (`/`), _Owed_ (`/owed`) and _Ready to use_ (`/ready`);
  Transactions _Ledger_ (`/transactions`) and _Lists_ (`/transactions/lists`); Cards _Cards_
  (`/cards`) and _Limits_ (`/cards/limits`). The page title sits in the tab bar, before a thin
  divider.

- A detail panel: a card, a limit group or a list opens beside its list on a wide screen
  (900px and up), in a column fixed to the screen that scrolls on its own, and in a sheet that
  slides up on a narrower one. Back, ×, Escape, tapping outside it or swiping down closes it,
  and a card's panel opens over any tab that shows the card.

- The card panel holds everything the card page did, and its forms open in place with ‹ back
  to the card: _Edit_, _Add purchase_, a purchase's _Edit_, _Make a payment_, and _+ Add
  card_'s blank form. A form with changes asks _Discard your changes?_ before ×, Escape,
  tapping outside or opening another record drops it.

- The limit panel shows a group's room, use and cards, each opening its card's panel, and the
  group's form; _Limits_ gains a search, a holder filter and a sort by name, room or use.

- The list panel shows a list's status, date, lines and total with the actions its status
  allows. Building a new list, or editing a draft or a waiting list, has its own page, and
  saving opens the saved list in its panel on _Lists_.

- _Owed_ and _Ready to use_ have the same search, location and holder filters, sort and
  grouping as _Cards_; _Owed_ adds a bill filter (overdue, due soon, no bill yet), and _Pay_
  on a bill opens the card's payment form in its panel with what is left filled in.

- Owners are managed in _Settings_, as locations are: the owners page adds, renames and deletes
  an owner (only one no limit group or supplementary card names, and never the last). The app
  starts with KC, NT and RI.

- Every screen shows an owner by name: tiles, the card and limit panels, _Needs you_ and
  _Upcoming_ rows, group labels, holder sections and filter chips. The group form's _Account
  holder_, the card form's supplementary holder, the _Account holder_ filters and the holder
  sections offer every owner, A to Z by name.

- Each time the app opens and after a restore, every limit group and supplementary card is
  pointed at a saved owner: one with no owner becomes KC's, a starting owner that was deleted
  comes back, and any other unknown owner moves to the first owner A to Z.

- Backups carry your owners. Merging keeps an owner you renamed; restoring into a new browser
  replaces the starting owners with the backup's; _Delete all data_ brings KC, NT and RI back.

### Improvements

- The card form refuses a new card's id that isn't in the card id format, and a limit group is
  required: _Choose a limit group_ is a placeholder that can't be picked, and with no group
  saved the form says to add one first, from _Limits_.

- A card without a limit group is treated as broken data and left out of every list, like a
  card at an unknown place, and nothing on a card or a tile says it has none.

- Each Home tab has the screen to itself, so _Needs you_ and _Ready to use_ show every row with
  no _See more_; _Ready to use_ sorts by most room, longest to close or latest due.

- The _Add a card_ sheet in the list builder is wider on a desktop, with the same search box as
  every list and its five sorts always shown as pills, so picking one never changes its height.

- A card that isn't offered on lists says why, in a note whose _Settings › Locations_ is a
  link, and the panel's head buttons (‹, _Edit_, ⋯, ×) are one size, with no focus ring left on
  ⋯ after a mouse click.

- _Settings_' Locations section is now _Locations and owners_, one list with a row into each
  page; the owners row names every owner A to Z.

- _Delete_ on a location or an owner swaps in place for _Delete_ (asking "Delete NAME?") and
  _Cancel_ on the row's own line, with focus following, as a payment's _Delete_ does; the row
  keeps its name and count.

### Decisions

- One view at a time on every screen: with two columns on a desktop, one address showed two
  different layouts.

- A record opens beside its list, so you keep your place. Forms are not part of the address,
  so a reload or a pasted link shows the record, with its form a tap away. A ledger row still
  opens in place, for now.

- _Owed_ is a Home tab, not a _Cards_ filter: the two differ in which cards they show, their
  order, the main number and the action. It shows only cards that owe, so a card holding only
  credit is not on it.

- The tabs show no counts: counting would need your data, and the tabs are plain links drawn
  before it loads.

- On a wide screen the panel is fixed to the screen rather than scrolling with the page, so a
  tab bar above the list can no longer push it past the bottom.

- The page title sits in the tab bar (one line, one rule), chosen from six mockups.

- The card form checks only a new card's id, since a saved card's id can't be edited. Restore
  checks older backups too, as they bring cards in just the same. The group placeholder stays
  rather than picking the first group, so a new card never lands in a group by accident.

- _Record reply_ keeps its name rather than the design's _Enter reply_, so one action has one
  name.

- Owners keep their starting short ids (KC, NT, RI) and gain a name, so renaming an owner only
  changes what is shown and no saved group or card changes. Rejected: initials as the only key,
  which would rewrite every group and card on a rename.

- An unknown owner is repaired when the app opens rather than shown as another owner on the
  fly, so your saved data and every screen agree. Rejected: showing it as the first owner
  without saving the change.

- Owners need a new backup format rather than an optional extra in the old one, so a file's
  groups and supplementary cards can be checked against its own owners.

### Technical

- Settled and built the same day as PRD RD-22 to RD-29, from
  `docs/superpowers/specs/2026-11-12-tabs-and-panel-design.md` and its mockup, in six pull
  requests (#73 to #78), the last five stacked.
- `/card`, `/card/new`, `/card/edit`, `/pay`, `/list/new`, `/list/draft`, `/list/reply` and
  `/list/view` are gone, each a 404, with no redirect (DD-200).
- New addresses: a card at `/cards?card=<id>`, a limit group at `?limit=`, a list at
  `/transactions/lists?list=<id>`, a new list at `/transactions/lists/new?cards=<id>`, a draft
  or a waiting list at `/transactions/lists/edit?list=<id>` (RD-23, RD-26).
- `/transactions?view=owed` is `/owed`, `/transactions?view=lists` is `/transactions/lists`,
  and `/cards?view=groups` is `/cards/limits` (RD-22, DD-197 to DD-199).
- The `/backup` redirect to `/settings` is gone, and `public/_redirects` with it.
- Address keys changed (RD-29): filters take `f.` (`type` → `f.types`, the ledger's `card` →
  `f.cards`, `range`/`from`/`to` → `f.range`/`f.from`/`f.to`, `status` → `f.statuses`, `loc`
  → `f.locations`, `owner` → `f.owners`).
- The Lists view's `lq`, `lcard`, `lrange`, `lfrom`, `lto` and `lby` are now
  `/transactions/lists`' `q`, `f.cards`, `f.range`, `f.from`, `f.to` and `by`; the builder's
  `card` is `cards`.
- `view`, `id`, `group`, `newGroup`, `ungrouped` and the builder's `add` and `open` are no
  longer read; an old link opens the default view.
- _Owed_'s bill filter is `f.states`; `f.owners` takes any stored owner's id (RD-25).
- The panel is RD-23 and DD-196; forms open in place in the panel (RD-24); the list panel and
  builder addresses are RD-26.
- Restore refuses a card whose id is outside `^[a-z]?[0-9]+(\.[0-9]+)*$`, with no
  `limitGroupId`, or naming a limit group not in the file, and writes nothing (RD-27, RD-28,
  amends DC-06). The card form enforces the same id format and a required group.
- Restore checks version 2 files as well as version 3.
- Owners are stored records `{ id, name }` at `cc:owner:<id>`, seeded once as KC, NT and RI,
  managed at `/settings/owners` (RD-30).
- At every load and after a restore, groups and supplementary cards with no or an unknown
  owner are repaired as described above (DC-18).
- Backups are now written as version 4, with an `owners` list. The app before this change reads
  only versions 2 and 3; versions 2 and 3 still restore (RD-30, DC-05).
- A version 4 backup is refused when a limit group or a supplementary card names an owner not
  in the file's `owners` (`backup.problem.unknownOwner`).
- `#lib/storage/transfer-v3` is now `#lib/storage/transfer-v4`, with exports renamed
  (`exportBackupV4`, `importBackupV4`, `replaceWithBackupV4`, `countRecordsV4`, `BackupV4`,
  `V4Counts`).
- `OWNERS` and `toOwner` are gone from `#lib/domain/owner`: owners are stored records
  (`DEFAULT_OWNERS`, `ownerName`, `sortOwners`).
- Owners keep their seeded ids (`KC`, `NT`, `RI`) and gain a name; an unknown owner is repaired
  at startup; owners need backup version 4 rather than an optional field in version 3 (DD-201).
- Message keys removed include `card.hero.noGroup`, `card.noGroupNote`, `cards.page.noGroup`,
  `cards.filter.ungrouped`, `spendable.unassigned.*`, `spendable.unassignedAction`,
  `group.noHolder`, `cards.view.*`, `tx.view.*`, `common.seeMore`, `common.showLess`,
  `ready.title`, `tx.owed.title` and the `/pay` picker's keys.
- The Locations page's classes are shared as `.records`, `.record-row`, `.record-add`,
  `.record-error` and `.record-warning` (they were `.locations` and `.location-*`).
- The in-place _Delete_ on a location or an owner amends DD-129.
- _Owed_ as a Home tab amends DD-89 (RD-25).
- Ids go in the query, not the path, so every address stays a static page and needs no rewrite
  rule in `_redirects`, local dev or the offline worker; this replaces the record-path plan
  proved in PR #37 (RD-29).
- The tabs are static links that ship no JavaScript, which is why they carry no counts.
- From 900px the panel is fixed rather than sticky: a sticky column's height had to guess what
  sat above the list, and a tab bar there pushed it past the bottom.

## 2026-11-12: Building a purchase list a card at a time, with each card's last 12 statements

### BREAKING CHANGES

- The separate page for picking cards before a new list is gone: a new list opens on the list
  itself, and cards are picked from its _+ Add a card_ sheet. That page's _Kept in_ and
  _Account holder_ filters, its grouping and its ticks went with it, and an old link to it
  opens an empty new list.

### Features

- _+ Add a card_ opens a sheet with every ready card as a tile, its last 12 statement cycles
  drawn under it as small bars with the 12-statement total and the day it was last used, a
  search, and sorts by _Most room_, _Least used_, _Longest unused_, _Longest to close_ and
  _Latest due_.

- A picked card shows its room now, its 12-statement total, the average of its closed
  statements and when it was last used, then a bar per statement (its amount over it, the open
  one faint, the average as a dashed line), then its orders, room after and warnings. _Add &
  pick another_ (or Enter) adds it and goes straight back to the cards.

- An open sheet is kept in the address, on a new list and on a draft, so a reload keeps it
  open, and Back closes it, as on the payment page.

### Improvements

- The list is one row per card: its total or _No amount yet_, how many orders, its warnings or
  room after, and its notes. A row reopens its card in the sheet to change its orders, step to
  the card before or after, or take it off, so cards can be added and amounts changed in any
  order.

- A draft opens on the same list and sheet, and the list page's Back now goes Home.

### Decisions

- Of three mockups, you chose the list first with cards added from a sheet (option C), over
  tiles and the list on one page (A) and a spreadsheet of every card with an amount box (B): it
  keeps a list with several orders per card short on a phone, and puts the most history beside
  the amount being typed.

- A card's use is counted per statement cycle by its own close day, from the ledger, not per
  calendar month (your answer).

- The card picker keeps only search and sorts; the filters and grouping were dropped to keep
  the sheet short (your answer).

- Opening the sheet and pressing Back keeps every amount you typed on the list. Known limit:
  pressing Forward onto a closed sheet and then Back again still reloads the page.

### Technical

- The card picker page is gone: `/list/new` opens the list itself, and its address keys `q`,
  `loc`, `owner`, `sort`, `dir` and `by` are no longer read (DD-195).
- The sheet lives in the address (`add=1` for the cards, `open=<card id>` for one card) on
  both `/list/new` and `/list/draft`, and Back closes it, as on `/pay` (DD-195).
- The sheet, the picked card's history and the one-row-per-card list are DD-195.
- The mockups are `docs/superpowers/specs/2026-11-11-list-builder-mockup.html`.
- Opening the sheet takes the client router's state off the list's own history entry until
  Back returns, so the router leaves that Back alone and the page keeps what was typed;
  without it Astro swapped in a fresh page and lost every unsaved amount. Forward onto a
  closed sheet and Back again still swaps the page.

## 2026-11-11: Grouping every list, and filter sheets with tabs and an order switch

### BREAKING CHANGES

- _Cards_ no longer has a _Place_ sort: place is now a grouping, and the default one. An old
  link sorted by place opens on the new default _Card_ sort, which is the old order inside
  each place.

- Sorting the ledger by amount no longer gives one flat list by itself: it sorts inside each
  day. Choose _Group by_ _None_ for one list by amount.

### Features

- Every list can be grouped, apart from its sort: each filter sheet has a _Group by_ row and
  each page a _Group: X ▾_ chip. _Cards_ groups by _Place_, _Account holder_, _Limit group_ or
  _None_; the new-list card picker by _None_, _Place_ or _Account holder_; the ledger by
  _Day_, _Card_ or _None_; the _Lists_ view by _Status_, _Month_ or _None_. The sort runs
  inside each section, and the choice is kept in the address, so a saved link keeps it.

### Improvements

- Each filter sheet is split by tabs under its heading: _Filter_, _Sort_ and _Group_ (the
  _Lists_ view's sheet has _Filter_ and _Group_). It opens on the tab of the control that
  opened it: the _Filter_ button, the sort chip or the group chip. _Clear all_ and _Show N_
  act on every tab, and choices not yet applied are kept as you switch tabs.

- The sort's direction is a two-part switch at the right of the _Sort_ heading (_↓ Newest_ |
  _↑ Oldest_, _↓ Most_ | _↑ Least_), the field's usual direction first, with the field chips
  under it, replacing the second row of order chips. _Owed on each card_ has the same switch,
  arrows only, in place of its single ↑/↓ button.

### Decisions

- Sections come in a fixed order rather than following the sort: places A to Z, holders KC,
  NT, RI then none, limit groups A to Z then none, ledger cards by id, months newest first.
  Ledger days follow the date sort's direction and run newest first under an amount sort.

- The order switch was picked from four mockups: tap a chip again to flip, a chip per order, a
  switch beside the sort, and a radio list with a switch. Each half of the switch is named by
  its full words (_Newest first_) and its short words are always inside them, so what is seen
  is what a screen reader says.

### Technical

- Place became a grouping (`by=place`, the default); old links with `sort=place` open on the
  _Card_ sort (DD-192).
- An amount sort on the ledger sorts within each day; `by=none` gives one list by amount
  (DD-192).
- The grouping is kept in the address as `by` (`lby` on the Lists view) (DD-192).
- The address key is `by`, not `group`, because `group` already opens a limit group's sheet on
  `/cards`.
- The filter sheet tabs are DD-194; the order switch is DD-193.
- The empty-folder placeholders `src/components/{atoms,molecules,organisms}/.gitkeep` are gone,
  since each folder holds its components; a test now fails on a `.gitkeep` beside other files.

## 2026-11-10: Several orders per card on a purchase list, drafts, merging same-day lists, a searchable Lists view, and sorts that run either way

### BREAKING CHANGES

- A saved link to the ledger sorted oldest first, biggest first or smallest first now opens
  on _Newest first_. Pick the order again and bookmark the view to keep it.

### Features

- A card on a purchase list can carry more than one order. On _Enter amounts_ the card stays
  one panel with an amount and an optional note per order, _+ Add order_ under them, and a
  small × on each order once there are two (named _Remove order N of <card>_). Each order is
  its own line: a row each on the review, the copied text and the image, answered _Made_ or
  _Not made_ on its own and saved as its own purchase. A reopened draft gathers a card's
  orders back into its one panel.

- _Save as draft_ sits on _Enter amounts_, under _Review_, so a list can be kept before it is
  reviewed. In a draft every amount is optional: only text that isn't money stops the save. A
  card with no amount yet opens blank, reads `—` in an opened row and adds nothing to the
  total.

- Lists on the same day with the same status merge: draft with draft, waiting with waiting.
  Saving a draft or marking a list sent on a day that already has one of that kind first asks
  _Merge_ or _Keep separate_, and a draft or waiting row on Home's _Needs you_ and the _Lists_
  view offers _Merge with N other lists_. Every order is kept, a card's orders together, and
  merged waiting lists keep the earliest sent time.

- The _Lists_ view has the ledger's search box and _Filter_ button, with no sort. Search
  matches a line's card id, name, last 4 or note; the _Filter lists_ sheet offers _Status_,
  _Card_ and _Date_, and the filters in use show as chips you can remove.

- The _Card_ section of the ledger's and the _Lists_ view's filter sheets stays short with
  many cards: past eight it adds a _Find a card_ box (id, name or last 4) and shows the first
  eight chips plus any card already picked, then _Show all N cards_ / _Show fewer_. Eight or
  fewer cards look as before.

- Every sort runs either way. The ledger sorts by _Date_ or _Amount_, _Owed_ by _Urgency_,
  _Card_, _Due date_ or _Owed_, _Cards_ by _Place_, _Room_, _Name_, _Close date_ or _Due
  date_, and the new-list card picker by _Room_, _Close date_ or _Due date_, each ascending or
  descending. The filter sheets' _Sort_ section shows the fields, then the picked field's two
  orders in words (_↓ Newest first_, _↑ Oldest first_); _Owed on each card_ has a ↑/↓ button
  beside its sort menu. The direction is kept in the address, so a saved link keeps it.

### Improvements

- Room after, the over-room and shared-limit warnings and the total count a card's orders
  together. Counts read `2 cards · 3 orders` once a card has more than one order, on the total
  and the sub-header, and stay `2 cards` otherwise.

- A card with several orders is named once in Home's list rows, the reply's _Move … to a
  draft_ and the saved list's moved note.

- The _Lists_ view is in sections: _Drafts_, then _Waiting for the spender_, then saved lists
  grouped by their date (`Saved · <date>`), newest first, each a small heading over its own
  row panel like the ledger's days. The status chips moved into the filter sheet.

- The review offers _Mark as sent_ only, and a draft with blank amounts can be backed up and
  restored.

- A draft with no amounts yet totals `฿0.00` with no minus sign on Home and in the _Lists_
  view.

- The update bar reads _New update is available_ with _Reload_, and on a wide screen (900px
  and up) it sits at the right end of the page, under the tabs, instead of centred; on a phone
  it stays centred.

- The _Cards_ sort choices are now pills like the other sheets, and the page's sort chip names
  the order in words (_Sort: Z to A_).

### Bug fixes

- An opened row's buttons wrap within the row: a third button (a list's _Merge_) ran off a
  390px phone and hid _Confirm_.

- An opened row's details have a gap under the head, as below their last line, so the first
  line no longer touches the open head's background (Home, the ledger, _Upcoming_ and
  _Lists_).

### Decisions

- A list line is still one order, so saved lists, backups and links are unchanged; only the
  amounts step gathers a card's lines into one panel.

- _Lower to_ shows only for a card with one order: with several it is unclear which order to
  lower, so you edit them yourself.

- An order's remove is an × icon rather than a second _Remove_ word, which read as a duplicate
  of the card's own _Remove_ right above it.

- Merging joins only lists of the same status. Saved lists do not merge, since their purchases
  are already tied to the list; waiting lists merge without a resend, since the spender already
  has every line. The merged list is saved before the others are deleted, so a failure
  part-way leaves a line twice rather than losing it.

- The _Lists_ view's search and filters are its own rather than shared with the ledger's, so a
  ledger search does not carry into it. _Merge_ still counts lists the filter hides, since they
  are on that day all the same.

- A card picked past the fold stays shown, and so does one tapped since the sheet opened, so a
  chip never vanishes from under a tap; the fold and the find box are not kept in the address.

- Each sort field keeps its own usual direction (newest, biggest, most room, A to Z, soonest
  due, and so on), so every old link reads as it did. Ties keep their order whichever way a
  sort runs. The old ledger sort choices were dropped rather than carried over, as you chose.

### Technical

- The ledger's `sort` is now `date` or `amount`, with `dir` for the direction; old `sort=new`,
  `old`, `big` or `small` open on _Newest first_ (DD-191).
- The direction is kept in the address as `dir` (`odir` for _Owed_), written only when it
  differs from the field's default (DD-191).
- Several orders per card is RD-09 and DD-186; drafts and merging are RD-09 and DD-187.
- A card with no amount yet is stored as amount `0`, which on a draft means "not set"; only a
  draft may hold it, so totals and the stored shape stay as they were.
- Backup version 3 accepts a line amount of `0` on a draft, and only there (DC-06).
- A list line stays one order, so the stored list, the backup shape and the `?card=` address
  are unchanged.
- Saved lists do not merge because their purchases carry the list's id (DD-66). The merged
  list is written before the others are deleted.
- The _Lists_ view's address keys are its own: `lq`, `status`, `lcard`, `lrange`, `lfrom`,
  `lto` (DD-189). Its sections are DD-188 and DD-189.
- The card section's fold is DD-190.
- The update bar's Thai is _มีอัพเดตใหม่_ with _โหลดข้อมูล_ (DD-181, FR-38).
- The four filter sheets (Cards, the ledger, _Lists_, the new-list picker) share one
  `FilterSheet` organism and its sections `FilterChips`, `DateRangeChoices` and `CardChoices`,
  with the chip look once in `app.css` (`.filter-group`). A new filter section is built from
  these rather than copied from another sheet (DD-190).
- The sort words are one shared set (`sort.field.*`, `sort.order.*`, `#lib/ui/sort-label`),
  replacing each page's own keys and `cards-sort.ts`.
- Biome no longer checks `.opencode/`, as it already skipped `.claude/`: formatting rewrote the
  playwright-cli skill's front matter (its `allowed-tools` globs) and failed `bun run check`.
- The search, sort direction and group-by work is split into three pull requests, the shared
  filter sheet first.

## 2026-11-08: Cards sorts by upcoming dates, the list image keeps its amounts on iPad, and offline pages load reliably

### Features

- _Cards_ offers _Soonest due_, ordering by the full due dates shown on the tiles. The choice
  survives reloads and shared links, in English and Thai.

### Bug fixes

- _Cards_' _Soonest to close_ sorts by the upcoming closing date, not the day number: a card
  closing this month comes before one closing early next month. Both date sorts follow the
  dates shown on the tiles, including dates kept from the ledger and days moved back to fit a
  short month; ties go by card id, and archived cards use the same order in their own section.

- The saved purchase list image shows its amounts in full on iPad. Safari there drew the
  amount column (its header, every amount and the total) starting at the right margin instead
  of ending at it, so the amounts ran off the picture.

- Offline, a page could fail to load its scripts when the server's answer depended on where
  the request came from: the page didn't work offline, and after an update an old page asked
  for files that were gone. The live site doesn't answer that way today; this keeps offline
  use working if it ever does.

### Decisions

- _Cards_ sorts by the dates shown for the open period, not by the oldest unpaid bill. Existing
  links to the close sort get the corrected order.

### Technical

- _Soonest due_ is `sort=due`; the close sort keeps `sort=close` (DD-115, DD-116).
- The iPad image fix places right-aligned text by its measured width rather than by the
  canvas's `textAlign`.
- The offline worker finds a cached file even when the server sent a `Vary` header. A page
  loads its scripts with an `Origin` header the worker's own fetch lacked, so a
  `Vary: Origin` answer (which `astro preview` gives) made every script miss the cache: offline
  the page's island never ran, and after a deploy the old version's pages asked for files that
  were gone. Production sends no `Vary` today (DD-181).
- The worker matches with `ignoreVary`, since each cached file is the build's one copy at its
  address. Stripping `Vary` when storing was the other option; ignoring it on lookup keeps the
  stored responses as the server sent them.

## 2026-11-07: The app works offline, with an update bar, and every page rebuilt

### Features

- The app works offline. After one visit every page is saved in the browser, so every page
  opens and works with no signal; your data was already in the browser.

- After an update is published, the new version downloads in the background, and a bar under
  the header says _A new version is available._ with _Reload_. Nothing changes until you tap
  it; then the new version takes over, the old saved copy is dropped and the page reloads.

### Improvements

- Every page was rebuilt: the card page, the card form, _Make a payment_, Transactions, the
  purchase list pages and Home. They look and work as before, with the same addresses.

- On a phone, a card's filter chip on Transactions shows its short name again.

### Bug fixes

- On a phone in Thai, a long over-the-room warning no longer widens an amount card past the
  screen's edge: the card's one column now shrinks to the card.

- In the new payment form, a reload after a failed save no longer empties the amount and note
  you typed: a field refills only when its value really changes, as before.

### Decisions

- Offline saves every file on the first visit, not only pages already opened, and serves from
  the saved copy first. Loading from the network first was rejected: slower on a weak signal,
  and offline only for pages already visited.

- A new version waits for your tap rather than reloading straight away, which could lose a form
  being filled in, or switching quietly on the next open, which shows the update late.

### Technical

- `src/legacy/`, the `#legacy/*` alias, the `lit` dependency and `#lib/ui/spa` (`onPage`,
  `pageSignal`) are gone, and AppLayout takes no `route`: a page is `AppLayout` with a Svelte
  island in its `main` slot, which cleans up in `onMount` (DD-185).
- Offline (DD-181): a service worker (`dist/sw.js`, written after `astro build` by
  `scripts/service-worker.ts`) caches every page, script and style on install.
- The version is a hash of the built files, not the commit, so any changed build is a new
  version and an unchanged rebuild is not. About 60 lines of worker code, so no Workbox.
- The card page is converted (DD-179): the `CardPage` island draws the sub-header with _Edit_
  and the _More_ menu, the hero and stats, the actions, the statements and the purchase sheet.
  _New card_ and _Edit card_ are one `CardEditPage` island over the `CardForm`, whose checks
  live in `#lib/ui/card-form`. The card stays `?id=` in the address.
- A card's name in its text forms (`cardTitle`, `cardLine`, `cardName`, …) lives in
  `#lib/ui/card-label`; the Lit pages' `card-label` re-exports it, so islands and Lit pages
  share one copy. `SubHeaderBar` is the sub-header for a title built from the reader's data.
- Make a payment is converted (DD-180): the `PayPage` island draws the card picker and, at
  `?card=`, the payment form in a sheet. Back, _Change_, the save that lands on Transactions
  and _Try again_ after a failed save work as before. A pay tile's content comes from
  `#lib/ui/pay-tile` and is drawn by the shared card tile; the Lit pay tile stayed for Home's
  _Owed_ list.
- Transactions is converted (DD-182): the `TransactionsPage` island draws the view switch, the
  search, filter and sort, the month summary, the ledger with _Upcoming_, the Lists view, the
  owed list beside them from 900px and the filter sheet. The address, the 50-row pages, the
  two-step _Delete_ and _Confirm_ and focus after a row goes work as before.
- The row that opens in place is in Svelte: `ActionRow` with `CycleLine` for the billing cycle
  and `TwoStepButtons`, kept by the rune state `OpenRows` and `TwoStep`. Their words are pure
  in `#lib/ui/row-text`, `#lib/ui/cycle-line` and `#lib/ui/ledger-drawer`. The Lit row stayed
  for Home's _Needs you_ until Home converted.
- The short card name on Transactions' filter chips: `FilterControls` chips take a `short`
  form, as the Lit page had.
- The purchase list pages are converted (DD-183): `/list/new` is the card picker or, at
  `?card=`, the amounts; `/list/draft` reopens a draft in the same steps; `/list/reply` and
  `/list/view` draw the reply and the saved list. The addresses, the replace after a write, the
  retry that adds nothing twice and every word work as before.
- The list's table and image text (`list-share`) moved back to `#lib/ui`, and a list's `id` is
  read by `listId` in `#lib/ui/list-address`.
- Home is converted (DD-184): the `HomePage` island draws _Needs you_ (the opening row, five
  then _See more_) and _Ready to use_ (the four cards with the most room, then _See more_), side
  by side from 900px. The writes, their errors, focus after a row goes and the clock past
  midnight work as before. No page loads Lit any more.
- app.css places Home's two panels by their wrappers (`.home-needs`, `.home-ready`), not by the
  Lit element names.
- Lit is removed (DD-185): the Lit code, its tests and its decorator settings go. The tests of
  today's pages, tokens and headers that sat under `tests/legacy/` move beside the code they
  check, and `AGENTS.md`, the project skills and the README describe the Astro and Svelte code
  as it is.
- The payment form's refill fix matches the Lit form's behaviour.
- The card page and the two card form pages convert together (DD-179): they share the form and
  the card's title, while the statements, the purchase sheet and the _More_ menu belong to no
  other page. Converting `/card` alone and leaving the form in Lit was rejected.
- The opening row is built once for Transactions and Home rather than per page, since both draw
  the same row; Home takes it as is (DD-182).
- An opened row's sentence is a list of pieces (words, a strong amount, a red late phrase), not
  markup in a string, so a card name or note can never inject markup through `{@html}`.
- Lit comes out as soon as no page loads it: dead code and a dependency nothing uses cost a
  reader more than they save. `onPage` goes too, since an island cleans up in `onMount`
  (DD-185).
- Home converts last, because _Needs you_ needed the opening row built for Transactions; Lit
  comes out in a change of its own, so that one is only Home (DD-184).
- The four list pages convert together: new and draft share the entry steps, and all four
  share the view of a list that is elsewhere. Converting one page at a time would have kept the
  entry steps in both Lit and Svelte (DD-183).

## 2026-11-06: Faster page changes, with a header and tab bar that hold still

### BREAKING CHANGES

- _+ New_'s menu no longer moves the keyboard focus to its first action when it opens, and
  the arrow keys no longer move between its actions; press Tab to reach them.

### Improvements

- Moving between pages no longer reloads the whole page: the next page swaps in, for links
  and Back/Forward alike. The header and the tab bar hold still, the date stays, and the
  theme, colour and language never flash.
- Pages change in about 0.3 to 0.4 seconds instead of 2 to 3 seconds with two years of
  purchases. The app's files are kept in the browser instead of being checked with the
  server one by one on every page, and links load ahead as they come into view.
- A Thai reader no longer sees English for a moment while a page loads: the page starts in
  the right language (the one you picked, else your browser's, else Thai).
- Settings, Settings > _Locations_ and Cards were rebuilt and look and work as before. The age
  choices in _Delete old purchases_ now line up with the note under them, and the choices in
  Cards' filter line up with their headings.

### Bug fixes

- Back no longer lands on a page you weren't on after using Cards, Pay or Transactions, which
  update the address as you change the view.
- _+ New_ and, on a phone, the bottom tab bar no longer flash when you change pages.
- An English reader no longer sees Thai in Settings and _Locations_ before they finish loading.

### Decisions

- Slow page changes were fixed at their cause rather than hidden behind a loading indicator:
  measured, the wait was the network, not work on your data. With the files kept in the
  browser, no indicator is needed.
- The language stays a setting rather than part of the address (such as `/th/...`), which
  would fight your language choice with a redirect on every load.
- The pages are rebuilt one at a time, starting with the smallest, Settings > _Locations_.
  Rebuilding everything at once was turned down as weeks of work with nothing to show for it.
- Each rebuilt page keeps its look and is checked against screenshots of the live app, rather
  than being redesigned along the way.

### Technical

- Built with Astro. `@kctools/bun-server`, `scripts/build.ts` and the `src/routes/*.html`
  pages are gone. Pages are `src/pages/<path>.astro` over `src/layouts/BaseLayout.astro`,
  built by `astro build`; the dev server is `bun run dev` on port 4321.
- Tests run on Vitest (`bun run test`), not `bun test`; `bun:test` imports no longer work.
  `bun run typecheck` is gone: `bun run check` runs `astro check` and then Biome.
- Tests live in `tests/`, mirroring `src/`; a `*.test.ts` under `src/` or `scripts/` no longer
  runs.
- The build stamps are `PUBLIC_COMMIT_SHA`, `PUBLIC_BUILT_AT`, `PUBLIC_PR_NUMBER`,
  `PUBLIC_ENVIRONMENT` and `PUBLIC_BRANCH`, no longer `BUN_PUBLIC_*`.
- Google Tag Manager follows the template and loads only on production: the container id is
  set only by the production deploy, so pull request previews and local builds send no data
  and stop counting visits. The `<noscript>` iframe is gone. Keeping the inline snippet on
  every build was the alternative.
- Google Tag Manager now sees only the first page of a visit. Counting every page needs a
  History Change trigger in the container.
- The skills are `project-shipping`, `project-landing` and `project-changelog`; the old
  `shipping-a-change`, `landing-a-change` and `changelog` names are gone. New skills from the
  template, adapted to cc-tracking: `project-components`, `project-layouts`, `project-pages`,
  `project-scripts` and `project-deploy`.
- Everything Lit is in `src/legacy/`, imported as `#legacy/*`: the components (was
  `src/components/*.ts`), the route modules (was `src/routes/`), and `lib/ui/{chrome,shell,
  page,icons,card-label,list-share,sub-header}.ts`, `lib/i18n/controller.ts` and
  `styles/shared.ts`. Imports of the old paths, and the `#styles/*` alias, no longer resolve.
- `tests/legacy/boundary.test.ts` keeps the legacy fenced: no `lit` import outside
  `src/legacy/`, and nothing outside it imports `#legacy/*` except a page's route script, so
  each conversion can delete its legacy file without breaking new code.
- `src/components/` has the atomic tiers `atoms/`, `molecules/` and `organisms/`;
  `tests/components/atomic.test.ts` fails on a component outside a tier or importing one it
  may not, and `#components/*` imports `.astro` files as written.
- Pages render `AppLayout` (with a `tab` and, where needed, `fab={false}`), not `BaseLayout`,
  which now writes only the document. The legacy `shell.ts` and `cc-fab-menu` are gone,
  `chrome.ts` no longer draws the header or tab bar, and the `data-pay-page`,
  `data-list-page` and `data-form-page` attributes are gone.
- The _+ New_ menu's focus and arrow-key change is DD-104.
- A legacy route module no longer starts on import: it exports `start()`, and its page
  registers it with `onPage("<route>", start)` and names the route on `AppLayout`. Every page's
  language listener and `popstate` handler takes `{ signal: pageSignal() }`.
- `#lib/ui/spa`: `onPage` starts a page's route on every visit, and `pageSignal()` lets what
  a page set up go when the reader leaves; `subscribe` takes a `signal`.
- Navigation is Astro's `<ClientRouter />` with view transitions (DD-174), not a single-page
  app: every address stays a static page, so nothing about addresses or the deploy changes.
  The language stays a reader setting (DD-171) rather than Astro's i18n routing.
- The header and the bottom tab bar are static Astro, built once rather than drawn by script
  on every load (DD-173): `AppLayout` with the `SiteHeader` and `TabBar` organisms, the `Tabs`
  and `FabMenu` molecules and the `Icon` atom. Each page names its own tab.
- The shell has two browser parts (DD-173): the date as the `HeaderDate` Svelte island, and
  _+ New_'s menu as an HTML popover rather than an island, so a two-link menu ships no
  JavaScript. A closed popover `div` hides itself, since the reset's `div { display: flex }`
  outranks the browser's own hiding and left the closed menu catching taps.
- Svelte islands (`@astrojs/svelte`, Svelte 5) render what the browser has to.
  `tests/container.ts` renders islands in tests, and happy-dom tests mount them with Svelte's
  client build.
- Static first, Svelte islands for what the browser renders (DD-172): a component is static
  `.astro` unless it is built from the reader's data or reacts to input, and then it is a
  small Svelte island, never a raw `<script>` building markup. Lit for the client parts and
  hand-written DOM updates were the alternatives.
- The components stay Lit for now (DD-170). All data lives in the browser, so nothing renders
  at build time; the move to Astro components comes page by page.
- The Lit code waits in one `src/legacy/` folder rather than being sorted into the atomic
  tiers as Lit files, so `src/components/` only ever holds converted Astro and the legacy
  folder only shrinks.
- Static `.astro` copy is translated (DD-171): an element written as
  `<span data-i18n="nav.cards">Cards</span>` is put in the reader's language by `startCopy`
  (`#lib/i18n/copy`), which every page runs and which follows a later change of language. A
  key either catalog lacks fails `tests/lib/i18n/markup-keys.test.ts`. `aria-label` is
  translated the same way through `data-i18n-aria-label`. Per-locale pages (`/th/...`) were
  rejected.
- The page's language is set on `<html lang>` before first paint, by the same rule as the app,
  and a Thai page keeps its `data-i18n` copy hidden until it is translated. Every page ships
  `<html lang="en">` until `chrome.ts` sets the reader's locale.
- English seen as Thai: the build wrote every island in Thai, the fallback for a reader with
  no language, while the static copy beside it was English. The build now writes English, and
  a Thai page hides an island (`astro-island[ssr]`) until it runs in Thai (DD-171).
- The thirteen copied HTML shells are one `BaseLayout` carrying the noindex meta, the theme
  boot, the global CSS and the shell slots; each page passes only its title and width, and
  imports its route module. `tests/pages/pages.test.ts` renders every page to keep that true.
- A page may reach `BaseLayout` through another layout, and every layout must wrap it, ready
  for an app-shell layout. `<div row>` and `<div block>` type-check in `.astro` markup.
- Biome extends `@kcconfigs/biome/configs/astro` (4.2.2), which lints and formats `.astro`
  files as well. The whole repo follows its base formatting: no semicolons, 120-column lines,
  padded Markdown tables; `tests/config/biome.test.ts` checks the `.astro` rules.
- `biome.json` allows files up to 2 MiB: `PRD_TH.md`'s padded tables had passed 1 MiB, and
  Biome had quietly stopped checking it.
- Dependencies match the template: Astro 7.4.5, Vitest 5.1.0, Biome 2.6.5, Wrangler 4.158.0.
  TypeScript stays on 6.0.3: `@astrojs/check` and `@kcconfigs/tsconfig` do not accept 7 yet.
- Landing runs `bun install` on `main` after a merge: a stale root install broke every
  worktree's build and tests with `Tsconfig not found astro/tsconfigs/strictest`.
- The hard-coded English check and the old statement payment check scan the legacy and every
  Astro UI folder, and fail when they find nothing, so an emptied folder can't pass them
  silently.
- Settings > Locations is the first page converted (DD-175): a static `SubHeader` and the
  `LocationsEditor` Svelte island replace its legacy Lit route. Each conversion keeps the
  legacy markup.
- Settings is converted (DD-176): the `SettingsPanels` island draws its sections, with
  Display (`DisplaySettings`, an island) and About (static, apart from the `BuiltTime` island)
  passed in as slots. _Restore a copy_ and _Delete old purchases_ are Svelte sheets over a new
  `Sheet` molecule. One island for the sections that share state (a restore re-reads the
  Locations summary and clears the reset message); rejected: an island per section with a
  shared store, and keeping the Lit sheets inside it.
- Cards is converted (DD-177): the `CardsPage` island draws the heading, the search, filter
  and sort, the card tiles and the limit groups, with the filter and a group in Svelte sheets.
  It is one island down to its heading, whose add button follows the switch. The view and an
  open group stay in the address as before (DD-102), through a new `AddressBar` seam.
  `SvgIcon` is the icon atom for islands, and `ErrorBanner`'s Retry is optional for a sheet.
  The card tile, the filter controls and the filter sheet's frame are ported, but their Lit
  versions stay until Home, Pay and Transactions convert.
- `openRepository` (`#lib/ui/startup`) opens the store and runs the startup migrations for
  islands and legacy pages alike; `AppLayout`'s `titleKey` translates the page title with the
  build's mark; `ErrorBanner` and `SubHeader` are shared molecules for the pages still to come.
- Faster page changes (DD-178): the hashed build files under `/_astro/` are cached for a year
  as `immutable`, and links are prefetched as they come into view. Pages keep a
  revalidate-every-time cache, since an old cached page would ask for hashed files a new
  deploy no longer has.
- Back landing on the wrong page: Cards, Pay and Transactions rewrote the address with
  `history.replaceState(null, …)`, which wiped the router's history state. They keep
  `history.state` now, guarded by `tests/legacy/routes/spa-ready.test.ts`.
- The flashing _+ New_ and tab bar: the hold-still marker sat on their `#tabbar` slot, which
  has no height because both are `position: fixed`, so they faded out with the page; the bar
  and _+ New_ now carry it themselves.

## 2026-11-04: The redesign ships, and pages stay out of search engines

### BREAKING CHANGES

- Backups have a new format. Download and copy write only the new format, so a version of the
  app from before the redesign can't restore them; keep an old download if you may need to go
  back. A backup made before the redesign still restores, converted as it comes in; anything
  older is refused.
- Restore is stricter. A file is refused, naming the record and the problem, when an amount or
  limit is not above zero, a card's last four digits are not four digits, a billing cycle day
  is out of range, a status or the _Takes purchases_ setting has an unknown value, or a card
  names a location the file does not hold. Nothing is saved when any record is bad.
- Your data is converted once, the first time the app opens after the update:
  - Payments move from statements to cards. Every statement keeps the amount it had left, but
    an old overpayment is capped at the statement's total, so a statement that showed 1,500
    paid on 1,000 now shows 1,000 paid. If the conversion fails, the page shows an error with
    _Reload_ instead of numbers, and reloading tries again.
  - Purchase places become locations you can edit. A card kept at a place that has no
    location is moved, with a one-time notice.
  - Every limit group gets its own colour: the first four keep the colour they showed, the
    rest get a random unused one.
- Payments belong to a card, not a statement. Money pays the oldest statement first and any
  extra stays as credit, so an overpaid card now shows credit and more room than its limit.
  _Mark paid_ and _Unmark_ are gone from the card page: pay from `/pay`, and delete a wrong
  payment from Transactions.
- A statement keeps its close and due dates only once it is fully paid. One that still owes
  money, part paid included, follows the card's current cycle, so its dates can move after
  you edit the cycle; dates saved earlier for such a statement are ignored.
- Old pages and addresses are retired, with no redirects:
  - the dashboard at `/` is now Home, and the card registry at `/cards` is now the Cards page
  - saved `/cards` links that opened a card to edit, or a filter or sort of the groups, no
    longer open what they did; a card is edited from its own page
  - `/backup` still takes you to Settings
- Removed: the page footer (now Settings › About), the dashboard's purchase form, _This
  sitting_ and _Start new batch_, _Can spend now_, the dashboard's _Due next_ and _Purchases
  by date_ (now in Transactions), the card page's Add purchase dialog, the registry's card and
  group tables and dialogs, the payment dialog, and Settings' _Purchases_ section and
  side-by-side backup boxes.
- Things to re-learn:
  - Purchases are planned as lists: pick cards with _+ New › New purchase list_, enter
    amounts, send the list, then record the spender's reply. A single purchase is added from
    the card page's _Add purchase_.
  - Tapping a row in _Needs you_, _Upcoming_, the ledger or _Lists_ opens it in place instead
    of going to another page; the page it led to is a button inside (_Open card_, _Open
    list_, _Pay_, _Record reply_).
  - Places that take purchases are ticked per location at Settings › _Locations_.
  - Archive and Delete for a card are in the card page's More menu (`⋯`), not the edit form.
  - Restoring opens a sheet that reads the clipboard first.
  - A ledger row no longer says _Purchase_ or _Payment_: the sign (− or +) says it, backed by
    red or green.

### Features

- Four pages, Home, Transactions, Cards and Settings: a bottom bar on a phone, tabs on the
  right of the header from 900px, and a floating _+ New_ menu with _New purchase list_ and
  _Make a payment_ on every page but the list, form and payment pages. Sub-pages share a slim
  header with a back arrow.
- Purchase lists: the new-list picker `/list/new` (search, _Kept in_ and _Account holder_
  filters, three sorts), entering amounts with a note per line, a review table copied as plain
  lines or saved as an image for the chat, _Mark sent_, and the spender's reply (_Made_ or
  _Not made_ with the real amount), which saves the purchases and can move not-made lines to
  the next day's draft. Each state has its own page: `/list/new`, `/list/draft`,
  `/list/reply`, `/list/view`. A waiting list holds its amounts against its group's room.
- Warnings while entering amounts, none blocking: over the room (with _Lower to_, and room a
  waiting list holds or a planned payment would make), a shared limit, an overdue bill, the
  close date, and a date that has passed (with _Change to today_).
- Home: _Needs you_, money at risk first (overdue bills, late plans, waiting lists, plans in
  the next three days, drafts), beside _Ready to use_ from 900px, which shows the four cards
  with the most room and opens the rest in place.
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
  groups_ switch on a phone) whose sheet adds and edits a group and is kept in the address.
- One wallet tile for every list of cards (_Ready to use_, the new-list picker, Cards, the
  payment picker and _Owed on each card_), in its limit group's colour, with a rail for the
  group's used share: grey, amber from 80%, red past the limit.
- Each limit group keeps one of twelve colours, chosen in the group sheet from swatches or
  with _Random_; tiles, chips, the card's header and the group panels wear it.
- The card page: room, owed, next bill and credit up front, _Use on a list_, _Add purchase_
  and _Make a payment_, and statements that unfold to their purchases (with _Edit_ and a
  two-step _Delete_) and the payment parts that settled them. Cards are added and edited on a
  full screen, in four sections.
- _Locations_ at `/settings/locations`: add, rename, delete one no card uses (never the last),
  and tick _Takes purchases_. Default names show in your language, and every list of places
  sorts A to Z.
- Settings › Reset › _Delete old purchases_: older than 6 months, 1 year, 3 years or all, with
  a count, a line for what stays and a second ask. Only purchases on fully paid statements go,
  with the payments that settled them, so no owed, credit or room figure moves.
- Settings › _About_ lists the environment, build time, source and commit. Builds other than
  production tint the header and bar, mark the app name and tab title (`(dev)`, `(local)`,
  `(pr-<n>)`, `(preview)`), and set the tint before the page first shows.
- No page shows up in search engines.

### Improvements

- A calm new look: sage neutrals, a green accent, rounded panels and generous spacing in both
  themes, with amber and rose for warnings, always with words. Light-theme text colours were
  darkened where the prototype's were too faint to read comfortably.
- One rule for naming a card everywhere, and a card's own page and edit form title it
  `name · holder (last4)`.
- Every list looks one of two ways: rows in one panel with a line between them, or a panel
  per item.
- Negative amounts read with the minus sign, `−฿21,065.00`, as signed amounts do.
- Sheets and the _+ New_ menu animate out as well as in, and not at all when your device asks
  for reduced motion.
- Keyboard: when an action takes an open row away, focus moves to the next row, the previous
  one, or the nearest heading; the group sheet's holder and colour choices move with the arrow
  keys.

### Bug fixes

- A page no longer flashes the wrong theme on load: the saved theme is applied before the
  page first shows.
- A part-paid statement no longer keeps due dates from an old cycle: Kbank Passion's October
  statement read _due 04 Nov_ after its cycle changed to due 15 days after the 25th (09 Nov).

### Decisions

- Every old statement keeps the amount it had left: a converted payment pays its own statement
  first, with overpayments capped. Rejected: feeding old payments into the oldest-first pool,
  and turning old overpayments into credit.
- A failed payment conversion stops the page with a reload button, since numbers from half
  converted data would be wrong. A failed group colour step doesn't, because a colour is only
  looks.
- Backups changed format at the same time as the payment conversion, because a backup in the
  old format would bring back payments the app no longer reads. Rejected: keeping the old
  format with extra optional fields.
- _Merge_ of a new-format backup only adds, and keeps your locations as they are, so an old
  backup can't undo a rename or a _Takes purchases_ tick. Rejected: warning that _Merge_ can
  delete; overwriting locations as other records are.
- Locations are set up once from your old places and become the one list of where purchases
  happen. A card at an unknown place is repaired rather than the backup refused, and the last
  location can't be deleted, since a card always needs one.
- `/pay` is a page with the payment sheet over it, and every way to pay links to it. Rejected:
  the form inline on each page; one payment sheet built into every page.
- Each list state has its own address, so a link says what it opens. Rejected: one `/list`
  page that picks by status; a page per step.
- The copied list is plain lines and the image a table always drawn on white, because a chat
  breaks any text table and other people see paper, not your dark mode. Rejected:
  tab-separated text; a `|` table; an image that follows the theme.
- _Delete draft_ and _Cancel list_ act at once, since both only remove a list nothing was
  bought from (the user's call). A payment's _Delete_ and a list's _Confirm_ stay two-step
  everywhere they appear.
- Statement dates freeze when a statement is fully paid, not at the first payment: settled
  history must not move, but a statement that still owes money is not settled. Rejected:
  rewriting kept dates on a cycle edit; letting you edit one statement's dates.
- One wallet tile for every list of cards, its colour the group it draws on and never its
  health. Rejected: a row design per page; a taller wallet card; a card link inside a tickable
  row.
- Group colours come from a fixed set of twelve, kept with the group, so text stays readable
  in both themes and adding or deleting a group never recolours another. Rejected: a colour
  from the group's place in the order; a free colour picker; a colour per card.
- A tapped row opens in place, and one row opens at a time. Rejected: a row that both opens
  another page and unfolds; many rows open; the open row kept in the address.
- The opened row shows a billing cycle line and one sentence (option B of three mockups),
  since where the money sits in the cycle is what only this app knows. Rejected: label and
  value pairs in a box; one line of facts with text actions.
- A purchase can again be added without a list, only from the card page, after the user found
  some purchases are recorded that way. Rejected: a purchase form on Transactions; a separate
  `/purchase` page (built, then removed).
- Old addresses don't redirect, and the Cards address changes as you type without filling
  Back. Rejected: keeping the old links working.
- Restore is a sheet, clipboard first: three clicks with data, two on an empty browser, down
  from four or five. Rejected: the side-by-side boxes; a paste box always open.

### Technical

- Built in six phases on stacked pull requests (#29 to #34), squashed into one branch, then a
  refinement round (#35), and merged to main once, so production only sees the finished app.
- Backups are version 3: `{ version: 3, exportedAt, limitGroups, cards, purchases, payments,
  statementDates, lists, locations }`, with card payments in `payments` and each group's
  `color`. Download and copy write only version 3. A version 2 file still restores, converted
  on the way in (payments with their `parts` become card payments, its `settings` give the
  locations); version 1 and any other version are rejected.
- Backup moved to version 3, and download and restore switched with the startup conversion,
  because the old export wrote `cc:payment:` records that never convert once the marker is
  set. Rejected: staying at version 2 with optional fields.
- Restore checks: an amount or limit above zero, `last4` four digits, a cycle day in range, a
  status or `takesPurchases` one of its values, and (version 3) every card's location in the
  file.
- Startup migrations run once, and the old records stay on disk unread.
- Per-statement `cc:payment:` records become card payments (`cc:cardpayment:<cardId>:<id>`,
  ids `m:<cardId>:<period>:<index>`), marked done by `cc:migration:payments`. Ids repeat on a
  rerun. Rejected: deciding "already converted" by whether any card payment exists.
- Purchase places become location records (`cc:location:<id>`), seeded once from
  `settings.purchaseLocations` and marked by `cc:migration:location-records`. The app no
  longer writes `cc:settings`. Rejected: keeping `settings.purchaseLocations` beside them;
  seeding whenever none is stored.
- Every limit group gets a stored colour (`cc:migration:group-colors`); a failure of this step
  is only logged.
- `cc:batch-start` and the `cc:panel:` keys `cards`, `cards-archived` and `limit-groups` are
  no longer read; the Cards page's archived fold uses `cc:panel:cards-archive`.
- A statement's stored dates from before full payment are ignored rather than migrated.
- Storage refuses to delete a card that has purchases or is on a draft or waiting list, a
  limit group a card uses, or a location a card is kept at (`guard.cardOnList`,
  `guard.locationInUse`), not just the interface hiding the buttons.
- Retired addresses, with no redirects (question 15): the `/cards` query keys `edit`, `group`
  as a filter, `dir`, `gq`, `gowner`, `gsort` and `gdir`, and the `/cards?edit=<id>` deep
  link, are no longer read; a card is edited at `/card/edit?id=<id>`. The new Cards address is
  replaced rather than pushed.
- Cards are added at `/card/new` and edited at `/card/edit?id=`. A limit group's sheet opens
  at `?group=<id>` or `?newGroup=1`.
- Removed components: `cc-quick-add` (the card page's Add purchase dialog) and
  `cc-payment-form` (the payment dialog).
- 148 message keys are gone, among them every `footer.`, `dashboard.`, `due.`, `range.`,
  `sitting.` and `payment.` key, with the components that used them (`cc-site-footer`,
  `cc-due-list`, `cc-purchase-range`, `cc-sitting-list`, `cc-spendable`, `cc-card-table`,
  `cc-limit-group-table`, `cc-limit-group-form`, `cc-statement-list`, `cc-card-summary`,
  `cc-settings`).
- A card's _panel_, _line_ and _name_ forms come from `card-label.ts`.
- Row lists and card lists are each drawn from one shared style (UI-22).
- Light-theme text colours were darkened where the prototype's fell short of AA contrast.
- The group sheet's holder and colour choices are radio groups.
- The saved theme and the build tint are applied before the first paint.
- No search indexing (DD-169): every page carries
  `<meta name="robots" content="noindex, nofollow">`, and `public/_headers` sends
  `X-Robots-Tag: noindex, nofollow` on every response, scripts and favicon included.
- No `robots.txt`: a crawler barred by `Disallow: /` never reads a page's `noindex`, so it
  could still list a bare address linked from elsewhere; the meta and the header let it read
  the page and leave it out. The `pr-*` previews show Cloudflare's own `noindex` header in
  place of ours, so the header is checked with `wrangler dev` (DD-169).
- `/pay`'s rejected "one payment sheet built into every page" was one sheet mounted on every
  page and opened by an event.
- The opened row's head is one button with nothing inside.

## 2026-10-30: Redesign decided from a clickable prototype

### Decisions

- The redesign is decided from a clickable prototype and built next. It follows how the app
  is really used, as the user corrected it: purchases are planned as dated lists that the
  spender confirms, and payments are made on any day, often to make room.
- What the redesign will bring:
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
  - deleting old purchases, at 6 months, 1 year, 3 years or all
  - a Settings layout with an About section
  - non-production builds tinted, badged and marked in the tab title
  - a calm look for ten-minute visits
- What will change for you when it ships:
  - backups move to a new format, and an older backup still restores, converted on the way
    in
  - payments move from statements to cards, keeping every total
  - old page addresses and `/cards` links stop working, with no redirects
  - the page footer goes, replaced by About in Settings
- Purchase lists replace entering receipts. Buying starts with choosing cards and amounts,
  not with receipts after the fact.
- Going over a card's room offers one action, _Lower to_ the room. _Pay first_ and moving the
  extra onto another card were tried in the prototype and dropped as too complicated.
- Transactions is one ledger rather than separate list and payment tabs. The + opens the
  payment form, so a separate _+ Plan_ button was dropped.
- Deleting old purchases removes only what is fully paid, with its payments and lists, so no
  card's balance moves.
- Locations become editable.
- Also settled: a purchase outside a list isn't needed, a card's credit is used up by its
  next purchases, and the Thai words stay as written.

### Technical

- `PRD.md` and `PRD_TH.md` record how the app is really used, and say how often each task
  happens.
- The PRD adds decided changes RD-08 to RD-21, each naming the rows it overrides.
- Decisions DD-39 to DD-46, a new goal G8, new risks, glossary terms in both languages, and a
  link to the prototype.
- Every open question is answered. Question 3 (pages) settles on the four pages. The new
  questions 12 to 18 cover the footer, a purchase outside a list, the backup version (moves
  to 3; version 2 still restores), old links, credit, the ages for deleting old purchases,
  and the Thai words.
- Purchase lists: RD-09 replaces RD-01 and RD-02.
- Editable locations reverse DD-11 and an out-of-scope item, and need a stored list and a
  migration.

## 2026-10-30: Plans written down for the redesign

### Technical

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
- The README matches the app again. It describes purchase places in Settings (rather than a
  checkbox on each card), editing purchases in place, saving and restoring a copy with Merge
  or Replace, Reset, partial payments, language and theme in Settings, adding and editing in
  dialogs on the registry, and the storage keys. It links the PRD.
- A PRD rather than a plain feature list: the PRD carries the redesign's problem, goals and
  open questions, and keeps the rules, contracts and decisions, because a feature list would
  let a rewrite quietly change the numbers or break saved data and backups.
- PRD IDs are stable. New items go at the end of their list, and a replaced item is marked,
  not deleted, so links from other documents and pull requests keep pointing at the right
  thing.
- Decided with the user for the redesign: entering receipts gets its own screen; a recent
  entries list, newest added first, replaces _This sitting_; a new visual direction on the
  same stack (Bun, TypeScript, Lit); no theme flash on load; restore checks ranges; delete
  guards move into storage.
- The page structure is left to clickable mockups of three layouts: task tabs, a hub with
  sheets, and card-centric.
- Facts that design specs from September held, and the changelog dropped, were recovered from
  the specs removed in `ec4a13f` and checked against the code before they went in.

## 2026-10-28: Pay a statement in parts

### Features

- A statement can be paid in parts. _Mark paid_, on the card page and in the dashboard's due
  list, opens a dialog for the amount and the date paid. It starts at what is left and today,
  so paying in full is still one click.
- On the card page each payment is a row in the statement's table, under its purchases and in
  the same columns, shown as an amount off the total with its own _Unmark_. A _Left to pay_ row
  closes the table, and what is left sits under the month's total on its summary line.

### Improvements

- The due list's _Total_ column and its sort, the card page's _Next due_ tile, _Owed on this
  card_ and limit group usage all count only what is left on a partly paid statement, so each
  payment gives back its own share of the credit.
- The Thai label for _Unmark_ is now ยกเลิกชำระ.

### Decisions

- The first payment fixes the statement's close and due dates; later payments keep them.
- A statement marked paid before this shows as one payment of the whole total on the day it
  was marked, so nothing needs redoing.

### Technical

- `StatementPayment` gains an optional `parts` list of `{ paidAt, amount }`, oldest first, and
  `Statement` gains `paidAmount` and `remaining`. A statement counts as paid once its parts add
  up to its total.
- Backup import checks `parts`: a non-empty list of valid dates and positive whole-satang
  amounts.
- Parts live inside the one payment record per card and period, under the same
  `cc:payment:<card>:<period>` key, rather than as separate records with their own ids. That
  keeps the storage layout and the backup's `payments` list unchanged, and a record saved
  before parts existed reads as one payment of the whole total on its `paidAt`, so no
  migration is needed.
- `TODO.md` plans a settings-page bar showing how much of the browser's `localStorage` (about
  5 MB per site) the app's `cc:` data uses, split by cards, purchases, payments, limit groups
  and settings, so a full store shows up before a save fails.

## 2026-10-27: Friendlier look and limit usage bars, and language and theme in Settings

### BREAKING CHANGES

- The language picker is no longer in the page header; change the language from the new
  _Display_ panel on the settings page.
- If you never picked a language and your browser lists Thai before English, the app now
  opens in Thai rather than English. Pick English on the settings page to keep it.

### Features

- _Can spend now_ shows a bar under each card's available amount, with "N% of the limit used"
  in words beside it. The bar turns amber from 80% and red once the group is over its limit.
- A _Display_ panel at the top of the settings page holds the language picker and a new theme
  picker: Match device, Light or Dark. The theme is saved in this browser and applies on every
  page.

### Improvements

- Warm paper neutrals and a teal accent replace the cool grey and blue, in light and dark.
  Corners and shadows are softer, and panels get more room on wider screens.
- The header has a small accent mark before the app name, and the menu links are pill tabs
  with the current page filled.

### Bug fixes

- _Purchases by date_'s tiles wrap on a phone instead of cutting off a six-figure total.
- With no saved language, the app follows the first of your browser's languages it speaks, in
  the browser's own order, and falls back to Thai. Before, any English entry in the list won.

### Decisions

- Language and theme are saved in this browser only, so they apply before any data loads and
  are not carried in a backup.
- A saved theme that differs from the device's can flash briefly while a page loads; accepted
  for now.
- Teal, because it stays clearly apart from the danger red and warning amber that sit beside
  it in the due list and the usage bars.
- The bar measures everything still unpaid against the limit, the figure _Can spend now_
  already uses, so it says "of the limit used" rather than "used this cycle".
- How the pages flow was left alone for now: redesigning it needs walk-throughs with the
  people who use it.

### Technical

- The `cc-lang-switch` element is removed.
- New `--cc-radius-pill`, `--cc-accent-surface` and `--cc-panel-padding` tokens; panels get
  more padding from 640px.
- The theme is stored under `cc:theme` and stamped on `<html data-theme>`.
- Language and theme stay in local storage, not the repository.
- `tokens.css` writes the dark palette twice, for a dark device and for an explicit Dark pick,
  because CSS cannot share one block between a media query and a selector. A test fails if the
  two copies drift apart.
- The theme is applied from the page script rather than an inline `<head>` script, which is
  why a saved theme can flash on load.
- The flows stay in `TODO.md`.

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
- Each purchase now remembers when it was first entered, from the dashboard or the card page;
  an edit keeps the original time.

### Improvements

- On a computer the dashboard is two columns: the form and _This sitting_ on the narrower
  left, _Purchases by date_, _Due next_ and _Spendable_ on the right. On a phone they stack in
  that order.
- A failed add shows its error beside the form, with your typing left in place to retry.
- The dashboard checks the clock each minute, so a tab left open past midnight moves its
  default date and presets to the new day, without touching a date you picked.

### Decisions

- Built for one person working through a pile of receipts who gets distracted mid-pile: the
  sitting list is how they find their place, so it must outlive reloads and only clears on
  purpose.
- The range filters on the purchase date, not the entry time: it answers "what was bought
  then", and archiving a card later must not change that answer.
- Purchases saved before entry times existed are not given one and never appear in _This
  sitting_; guessing an entry time would put them in the wrong batch.
- Where the current batch starts belongs to this browser's work in progress, not your
  records, so it is not part of a backup.
- A friendlier visual redesign, including a "used this cycle" bar in _Spendable_, was mocked
  up and deliberately put off for later.

### Technical

- Purchases record `addedAt`. Backup import accepts it and rejects a malformed one with
  `backup.problem.badAddedAt`.
- `Repository.getBatchStart` and `saveBatchStart`, stored under `cc:batch-start`; `clearAll`
  forgets it. The batch start stays out of backups.
- New `purchase-range.ts` helpers, `cc-sitting-list`, `cc-purchase-range`, and an `inline`
  mode with a `cleared` counter on `cc-quick-add`.
- `TODO.md` records the deferred UX/UI and colour redesign.

## 2026-10-17: Clearer names for card and limit group owners

### Improvements

- The person on a card -- the card list's filter and row, and the card page -- is labelled
  _Cardholder_ (`หน้าบัตร` in Thai) instead of _Owner_ (`เจ้าของ`).
- A limit group's owner -- the limit group table's column and the limit group form's field --
  is labelled _Account holder_ (`เจ้าของบัตร` in Thai), and its missing-owner error reads
  "Choose the account holder for this limit group."

### Decisions

- English uses "Cardholder" for the card, because it names whoever is printed on the card
  face, and "Account holder" for the group, because a limit group stands for a bank account.
  Both used to read "Owner", which didn't tell them apart.

## 2026-10-12: Edit purchases, with warnings for close-date and future-date purchases

### Features

- Each purchase on the card page's statement list has an _Edit_ button. It opens the purchase
  dialog, titled "Edit purchase", with the date, amount and note filled in; the card stays
  fixed, and saving updates the same purchase. Purchases on archived cards can be edited too,
  since that corrects history rather than adding to it.
- The purchase form warns, in amber, when the date is the selected card's statement close
  date: the bank may post such a purchase on this statement or the next one. The warning
  follows the date and card as they change and never blocks the save.
- The purchase form no longer refuses a date after today: it warns in amber and saves the
  purchase anyway.
- The card page marks the current statement -- the earliest one not yet closed, where a
  purchase made today lands -- with a _Current_ badge and an accent line on its left.

### Improvements

- When a purchase is dated past today, the card page counts its statements back from that
  purchase, so a purchase dated beyond the open period still has a statement to edit or delete
  it from.
- Statement table rows are centred vertically, with _Edit_ and _Delete_ held together on one
  line, so the date, note and amount line up with the buttons.

### Decisions

- Both date checks warn rather than refuse. A purchase on the close date is valid, only its
  statement is uncertain; a future date can be a booking or an instalment entered ahead.
- An edited purchase shows no "over the limit" note: the remaining credit already counts its
  old amount, so weighing the new amount against it would count the purchase twice.

### Technical

- The message key `quickAdd.error.futureDate` is removed.
- `isCloseDate` in `cycle.ts`; `cc-quick-add` takes a `purchase` to edit and adds its `id` to
  the `add` event; `cc-statement-list` emits `edit-purchase`. Saving an edit writes over the
  same purchase id.
- Messages added: `dashboard.editPurchase`, `quickAdd.save`, `quickAdd.closeDateWarning`,
  `quickAdd.futureDateWarning`, `card.error.editPurchase`, `statements.current`.
- Dependencies are up to date: `@kcstyles/reset.css` 2.0.0, `@kcconfigs/biome` 3.0.0,
  `@kcconfigs/tsconfig` 2.0.0 and `@happy-dom/global-registrator` 21.0.1 move a major version;
  `@kctools/bun-server` 0.4.0, `typescript-language-server` 6.0.2 and `wrangler` 4.149.0 are
  minor or patch bumps. No code changes were needed, and the existing tests pass unchanged.

## 2026-10-04: Copy and paste backups, Merge or Replace on restore, and sortable dashboard panels

### Features

- A backup can be copied as text: _Copy text_ puts the backup on the clipboard, compact so it
  takes less space, and confirms in its own status line.
- A backup can be restored from pasted text: _Paste text…_ opens a text box with _Restore_,
  _Paste from clipboard_ and _Cancel_.
- Restoring into a browser that already holds cards, purchases, payments or limit groups now
  asks first. It shows what is in this browser next to what is in the copy, then offers
  _Merge_ (add the copy to what is here, as before) or _Replace_ (delete everything, settings
  too, then restore). An empty browser restores straight away.
- The dashboard's _Can spend now_ and _Due next_ panels sort from their column headings, and
  from a sort chip on a phone, the same way the cards page does. _Can spend now_ sorts by
  card, available, closes or due; _Due next_ by card, where, closes, due or total.
- A preview copy of the app adds `(pr-<n>)` to the page title and the app name in the header,
  so it can't be mistaken for the real one. The real app shows no suffix.

### Improvements

- The Backup panel is split into two outlined halves, _Save a copy_ (_Download file_,
  _Copy text_) and _Restore a copy_ (_Choose file…_, _Paste text…_), side by side on wider
  screens and stacked on a phone. Restore runs one step at a time inside its own half, and
  cancelling a pasted restore returns to the text so it can be fixed.
- One word, _restore_, runs from the button to the confirmation ("Restored …") and the error
  ("Could not restore that copy."). The error for an unreadable copy no longer says "file".
- The file picker looks like a quiet button instead of the browser's default control.
- _Merge_ in the restore question is the filled primary button. As a quiet button its sunken
  grey matched the counts panel above it, so it read as a panel, not a button.
- Both dashboard panels start soonest close date first. Before, _Can spend now_ listed the
  most room first and _Due next_ the soonest due date.

### Bug fixes

- The text box for a pasted backup now uses its intended fixed-width text size.

### Decisions

- _Merge_ or _Replace_ is asked only when records exist. Settings alone don't count, so a
  fresh browser never sees the question.
- Each answer is a full button that states its consequence, and _Replace_ is the red danger
  button, so nobody wipes their data without reading what the button does.
- The copy and paste-from-clipboard buttons are hidden where the browser can't use the
  clipboard, rather than shown and failing.
- Restoring straight from the real app into a preview copy was left out; copy and paste
  covers it for now.
- The dashboard panels have no saved order, so a third click on a heading returns to closes
  first instead of to "Saved order", and their sort chip has no "Saved order" option.
- The dashboard panel sort resets on reload; unlike the cards page's view, it is not kept in
  the address.
- The `(pr-<n>)` marker is not translated; it reads the same in English and Thai.

### Technical

- _Copy text_ writes the backup's JSON compact rather than indented like the downloaded file.
- `countRecords` and `replaceWithBackup` in `transfer.ts`; the reset question reuses
  `countRecords`.
- Messages added: `backup.save.title`, `backup.save.hint`, `backup.restore.title`,
  `backup.restore.hint`, `backup.copy`, `backup.copied`, `backup.paste`, `backup.pasteLabel`,
  `backup.fromClipboard`, `backup.importText`, `backup.question.file`,
  `backup.question.pasted`, `backup.here`, `backup.incoming`, `backup.counts`,
  `backup.merge`, `backup.mergeHint`, `backup.replace`, `backup.replaceHint`,
  `backup.importedText`, `backup.error.clipboard`, `backup.error.copy`.
- `backup.unreadable` no longer says "file".
- `applySpendView`, `applyDueView` and `nextPanelSort` in `list-view.ts`; `sortChip` takes an
  optional fallback view and `sortHeader` an optional next-sort function.
- The panel sort is kept on the component only, not written to the query string like the
  cards page's view.
- The deploy preview workflow passes the pull request number as `BUN_PUBLIC_PR_NUMBER`.
- `BUN_PUBLIC_PR_NUMBER` is always stamped at build time, empty outside previews. The bundler
  only inlines variables that exist, and an unset one would stay a `process.env` read that
  throws in the browser and blanks the footer's commit and build time.
- The clipboard buttons are hidden where `navigator.clipboard` lacks `writeText` or
  `readText`.
- Importing straight from another deploy's origin (a preview pulling from production) would
  need a confirmed popup-and-`postMessage` bridge on production, because storage is per origin
  and an iframe gets partitioned storage.
- The pasted-backup text area's monospace size had lost to `.page textarea` on specificity
  over `.backup__text`.
- The two backup halves sit side by side from 640px.
- Upgraded `@kcstyles/reset.css` 1.0.13, `@kctools/bun-server` 0.3.4, `@biomejs/biome`
  2.5.15, `typescript-language-server` 6.0.1 and `wrangler` 4.147.0.

## 2026-09-30: Changelog link in the site footer

### Features

- The footer has a _Changelog_ link, between the repository and the version. It always opens
  the latest entries, even from an older version of the app.

### Improvements

- The footer's repository and changelog links open in a new tab.

### Technical

- `cc-site-footer` links `CHANGELOG.md` on the `main` branch rather than the built commit.
- Messages added: `footer.changelog`.

## 2026-09-24: Owner set on the limit group, and a cards page that folds into sections

### BREAKING CHANGES

- A card no longer has its own owner; the owner is set on its limit group. Existing groups
  show `KC` until you edit them and pick the right owner.
- The card form no longer asks for an owner, and limit groups can no longer be edited inline
  in their table: use the limit group form's _Edit_.

### Features

- The limit group form has an owner field. The owner belongs to the account behind a card,
  and a limit group stands for that account, so two cards on one account always show the same
  owner.

### Improvements

- Limit groups have a form and a table, matching the card form and table: _Edit_ on a group
  opens the form, the same way as for a card.
- The card table keeps its _Owner_ column, which now reads the owner from the card's group. A
  card with no group shows as unassigned rather than a made-up `KC`.
- All four sections on the cards page (card form, card table, limit group form, limit group
  table) fold. Tables start open and stay closed once you close them; forms start closed and
  open when you edit something.

### Decisions

- A group without an owner reads as `KC`, so nothing has to be redone first. Copying each
  card's owner up to its group was rejected because it would need a rule for cards that
  disagree.
- Backups keep the same format: a group with no owner is accepted, and an owner outside the
  known list is rejected.

### Technical

- `Card.owner` is gone; the owner now lives on `LimitGroup` as `owner?: Owner`. Code that read
  a card's owner must go through its group.
- `ownerOf` now takes a `LimitGroup` instead of a `Card`, and still falls back to `KC` when the
  owner is missing or not recognised.
- `cc-limit-groups` no longer exists. Use `cc-limit-group-form` and `cc-limit-group-table`,
  and listen for `edit-group`. Inline row editing was removed.
- `cc-card-form` no longer has an owner select.
- Messages removed: `form.owner`, `form.error.owner`. Messages added: `limits.owner`,
  `limits.column.owner`, `limits.error.owner`, `limits.edit`, `cards.list`.
- Edit dispatches `edit-group`, and the route keeps `editingGroup` next to `editing`, so the
  page has one editing pattern.
- A card with no group shows `cards.unassigned`.
- Each `/cards` component owns a `<details>`, and its title moved into the `<summary>`. Tables
  start open through a static attribute, so a re-render never reopens a section the reader
  closed. Forms follow their own `toggle` event.
- `Card.owner` was removed from the type but not from stored records. Unread keys cost
  nothing, and rewriting every card to strip them risks write failures for no benefit.
- No migration. The backup version stays at 2.

## 2026-09-23: Credit limits and shared limit groups

### BREAKING CHANGES

- Backups made before this change no longer restore.
- Every card must belong to a limit group. Cards saved before this change have none and show
  as unassigned until you assign each one on the cards page.

### Features

- Limit groups: a name and a credit limit, shared by the cards that draw on the same account.
  A card that shares with no other card is a group of its own.
- A **Can spend now** panel on the dashboard lists each card's available credit out of its
  limit, plus the open period's close and due dates, most room first. It marks shared groups
  ("shared with N cards"), flags cards over the limit, shows how many cards have no group,
  and has an empty state.
- The purchase form shows "Available ฿X of ฿Y" for the selected card. A purchase over that
  amount still saves, and the confirmation says by how much it went over.
- The cards page has a limit group section, the card form a required limit group choice, and
  the card table a _Limit group_ column.
- Backups include limit groups.

### Decisions

- **Every unpaid baht counts against the limit**, the open period included. Counting only
  closed statements would show more room than the card really has. Because a payment records
  no amount, marking a statement paid gives back exactly that statement's total. Archived
  cards count toward what is used but are not listed.
- **Every card belongs to exactly one group**, so the sum is always done per group.
- **No conversion of old data.** Old backups are rejected, and a card with no group shows as
  unassigned until someone assigns it.
- **Over-limit purchases are recorded, not blocked.** The app records what happened, and the
  saved limit may be out of date.
- Groups are managed on the cards page rather than on a page of their own.
- A card in a backup whose limit group is not in the file is still restored: restoring only
  adds data, and the group may already exist in this browser.
- The panel's close and due dates are for the open period: it answers "if I spend today, when
  is that due?", while the due list answers "what do I pay next?".

### Technical

- Version 1 backups are rejected. Only backup format version 2 imports, with a `limitGroups`
  list; groups are imported before cards.
- `LimitGroup { id, name, limit }`, with `limit` stored in satang. It is saved under
  `cc:limitgroup:<id>` and handled by `listLimitGroups`, `saveLimitGroup` and
  `deleteLimitGroup`, which are covered by the storage contract suite.
- `Card.limitGroupId`. It is optional only so that cards stored before this change still
  load.
- `src/lib/domain/limit.ts` with `outstandingOf`, `spendableRows` and `unassignedCards`.
  Available credit is the group's limit minus every purchase on an unpaid statement,
  including the open period. Archived cards count toward `used` but are not listed.
- The panel is `cc-spendable`; over-limit rows get `data-state="over"`. `cc-quick-add` shows
  the available amount.
- A backup card whose `limitGroupId` matches no group in the file is still imported.
- The close and due dates come from `openPeriod`, not from `nextActionable`.
- Groups live on `/cards` rather than on a fourth route.

## 2026-09-22: One consistent look across the app

### Improvements

- A sticky header, and content up to a comfortable width. On a wide screen the dashboard has
  two columns, with the quick-add form staying beside the due list; on narrower screens
  quick-add comes first. Tables turn into stacked rows on a phone.
- The urgency colour on a due row now comes with a text badge, so urgency doesn't depend on
  colour alone.
- Line spacing leaves room for Thai vowel and tone marks, so they don't get cut off.

### Bug fixes

- Six of the eight parts of the app had no styling. Every part is now styled.

### Technical

- `@picocss/pico` was removed in favour of `@kcstyles/reset.css@1.0.12`. Anything that relied
  on Pico's classes or document styles no longer gets them.
- Button variants moved from classes to an attribute: `class="secondary"` became
  `data-variant="quiet"` and `class="secondary outline"` became `data-variant="danger"`. With
  no attribute, a button is the primary variant.
- Shadow CSS may use values only through `var(--cc-*)`. Literal hex, rem or colour values are
  not allowed.
- New `src/styles/tokens.css` for `:root` custom properties and dark mode,
  `src/styles/app.css` for the light-DOM page shell, and `src/styles/shared.ts` for the shared
  Lit modules `base`, `controls`, `panel` and `dataTable`. Custom properties are inherited
  across shadow boundaries, so each value is defined once and each rule is written for both
  the light DOM and shadow roots.
- Token groups: type, space, shape, surface, text, accent, status, urgency and focus.
  `--cc-font-sans` lists Thai faces as well as the system Latin fonts, and `--cc-leading` is
  `1.65` so Thai vowel and tone marks don't get clipped.
- The `base` shadow reset copies the reset's `div` convention (`div` is a column flex
  container, with `<div row>` and `<div block>` as the alternatives).
- Layout sizes: content up to `72rem`, two dashboard columns at `≥960px`, tables stacked below
  `640px` using `data-label`.
- The unstyled components were because Pico's document styles never reached inside shadow
  roots. Styles now come from `@kcstyles/reset.css` and shared shadow modules.
- Pushing one shared `CSSStyleSheet` into every shadow root was rejected, and so was rendering
  components into the light DOM.
- There is no `<cc-nav>` component and no web fonts. The nav element ids are unchanged, so
  `chrome.ts` still works.
- Appearance is checked with Playwright screenshots at `390px` and `1280px`, in English and
  Thai, in light and dark mode. happy-dom doesn't compute styles.

## 2026-09-21: Fixed location choices, English and Thai, and a hosted version

### BREAKING CHANGES

- Locations are now a fixed list: Bangkok, Phichit and Krabi. A card saved with any other
  location is set to Bangkok when the app opens; edit it to pick the right place.
- The card form picks the location from a list, so a new location can no longer be typed in.
- A backup with a card in an unknown location no longer restores.

### Features

- The cards page shows a notice, which can be dismissed, naming the cards whose location was
  set to Bangkok.
- The app is in English and Thai. Switching language changes the page in place, without
  reloading it.
- The first time, the app picks English if the browser's language is English, otherwise Thai;
  after that it keeps your choice.
- Error messages are shown in your language.
- Dates read like `21 ก.ย. 2026`, with Christian-era years in both languages, never the
  Buddhist Era, so they match bank statements.
- The app can also run as a hosted version that keeps its data on a server, behind a sign-in.

### Decisions

- Reloading the page on a language switch was rejected because it would throw away a
  half-filled form.

### Technical

- Phase A: `LOCATIONS = ["bangkok", "phichit", "krabi"]`, with `DEFAULT_LOCATION = "bangkok"`
  and `toLocation` in `src/lib/domain/location.ts`. The lowercase key is stored and the label
  is looked up by language.
- Phase A: the card form uses a `<select>` instead of a free-text datalist; backup import
  rejects a card with an unknown location.
- Phase A: `migrateLocations` runs once at startup. It resets unrecognised values to
  `bangkok`, records which cards were reset in `cc:migration:location`, and `/cards` shows the
  notice. Running it twice changes nothing, and a failure on one card does not stop the page
  from loading.
- Phase B: a hand-written catalog in `src/lib/i18n/` (`en.ts`, which defines the keys, and
  `th.ts`, which must satisfy `Catalog`), a `LocaleController` for Lit, and a
  `cc-lang-switch` control.
- Phase B: language choice uses the saved `cc:lang` value first, then English if
  `navigator.language` starts with `en`, otherwise Thai.
- Phase B: errors carry a `{ key, params }` pair, not an English sentence, and are translated
  where the banner is rendered.
- Phase B: dates are `dd MMM yyyy` with a zero-padded day. `Intl` is not used for dates.
- Phase B: `@lit/localize` was rejected because it needs an extraction CLI and XLIFF files,
  which is a lot for two locales.
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

## 2026-09-15: First version, tracking cards in this browser

### Features

- A list of cards (id, name, last 4 digits, location, billing cycle rule, comment, archived),
  their purchases, and which statements are paid.
- Statements are worked out from the purchases. A paid statement keeps the close and due
  dates it had when it was paid, so editing a card's cycle rule later doesn't change history
  that is already paid.
- Two billing cycle rules: the due date is the close date plus a number of days, or the due
  date is a fixed day of the month. With a fixed day, a due day not later than the close day
  falls in the next month. Days past the end of a month move to its last day. A statement
  covers the day after the previous close up to and including this close.
- Dates follow Bangkok time.
- Three pages: the dashboard (due next, quick add, cards by location), the cards page (the
  list, with archive or delete), and a card's page (statements with _Mark paid_ and
  _Unmark_).
- Download and restore all your data as a backup file.
- Every save finishes before the page shows it; a failed save shows a banner with a retry.

### Technical

- Purchases are stored in satang. A `StatementPayment` stores the close and due dates as they
  were when the statement was paid. Statements are derived when read, not stored.
- Cycle rules are `offset` and `fixed`. A statement period is `(previousClose, thisClose]`.
- Dates are plain `YYYY-MM-DD` strings in Asia/Bangkok, calculated with `Date.UTC` and
  `getUTC*`. Local-time `Date` values are never used.
- A `Repository` interface made only of key lookups and prefix scans, with an in-memory
  version and a localStorage version (`cc:card:`, `cc:purchase:`, `cc:payment:`). One contract
  suite tests both.
- Pages are the dashboard, `/cards` and `/card?id=`. The backup is JSON export and import.
- Writes are awaited, never applied ahead of time.
- Storing a statement per card per month was rejected. It would need a generation job and
  would give two sources of truth.
- localStorage was chosen over IndexedDB. The data is small, and neither Bun nor happy-dom
  provides `indexedDB`.
- Phase 2 was designed as a Cloudflare Worker with KV behind Cloudflare Access. It was built
  on 2026-09-21. Phase 3, staff accounts, is deferred.
