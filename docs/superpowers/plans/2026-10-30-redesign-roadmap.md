# Redesign roadmap

The redesign in [`PRD.md`](../../../PRD.md) (decided changes RD-03 to RD-21) is too big for one
plan. It ships in six phases, each its own plan, branch and pull request. The pull requests
stack, each on the branch before it, and merge to main once, at the end; so a phase only has to
leave its preview usable for testing, and no old page needs an adapter to keep working. Each
plan is written when the phase before it is done, so it can build on the real code rather than
on guesses.

| Phase | Ships | Decided changes | Plan |
|---|---|---|---|
| 1. Rules and storage | New domain rules and storage for card payments, frozen statement dates, purchase lists, locations and old-purchase deletion; backup version 3; delete guards in storage; build stamps for environment and branch. All additive: the current pages keep using the old code. | RD-06, RD-07, RD-10 (rules), RD-11, RD-12, RD-17 (rules), RD-18 (rules), RD-20 (stamps) | [phase 1](2026-10-30-redesign-phase-1-rules-and-storage.md) |
| 2. Shell and look | New tokens and look in both themes; page shell (header with the boxed mark, phone bottom bar with +, desktop tabs with a Payment button, build tint and badge, tab title); a placeholder Transactions page that + and Payment open until phase 4; theme before first paint; the footer dropped for About in Settings. Existing panels restyle through the tokens; their layouts don't change. | RD-03, RD-05, RD-08, RD-20, RD-21 | [phase 2](2026-10-30-redesign-phase-2-shell-and-look.md) |
| 3. Home and purchase lists | Home (*Needs you*, *Ready to use*), entering amounts with warnings, review with copy text and save image, the spender's reply, saved list. Removes the dashboard's purchase form, *This sitting* and the batch start. | RD-09, RD-10, RD-15 | [phase 3](2026-10-31-redesign-phase-3-home-and-lists.md) |
| 4. Transactions and payments | The Transactions ledger with search, filter and sort; *Upcoming*; the payment form with the card picker; planned payments. Runs the payment conversion at startup and switches download and restore to backup version 3. Rebuilds *Due next* and *Purchases by date* in Transactions: phase 3 already took them off Home, and their components and most of `purchase-range.ts` are gone or test-only. Removes the old payment dialog and the placeholder Transactions page. | RD-11 to RD-14 | [phase 4](2026-10-31-redesign-phase-4-transactions-and-payments.md) |
| 5. Cards | Cards page with grouping, search, filter and sort; card page; full edit screen; limit groups. Removes the registry dialogs and the `/cards` query view. | RD-16 | [phase 5](2026-10-31-redesign-phase-5-cards.md) |
| 6. Settings | Display, Locations (`/settings/locations`) with `Card.location` widened to any location id and backup version 3 checking each card's location, Backup (download, copy as text, restore a copy, all version 3 from phase 4), Reset (delete old purchases, delete all data); About already shipped in phase 2. Then the PRD's acceptance criteria are walked on the preview. | RD-17, RD-18, RD-19 | written after phase 5 |

Each phase updates `PRD.md` and `PRD_TH.md` for what it ships (the overridden rows are updated
or retired) and adds a dated changelog entry when it lands.

## Notes for later phases

Left by the final review of phase 1, then of phase 3. Phase 2 is the look and the shell only,
so most of them moved to the phase that builds what needs them.

### Phase 2

- Guard `titleMark("preview", "")`: a preview build without a PR number must not mark the
  title `(pr-)`. (Taken by the phase 2 plan.)

### Phase 3

- `saveReply` does not refuse a list that is already saved; the caller must. (Taken: `/list`
  re-reads the list and refuses one already saved.)
- `heldBy` must be given sent lists only. (Taken: `roomFor` passes sent lists only.)
- Default location records are stored with English names. While a record still has its
  default name, show the catalog name in the reader's language (Thai or English), or seed the
  records in the reader's language. Applies wherever a location name first shows (Home's
  *Ready to use*), and again in phase 6. (Taken for phase 3: Home names places through the
  catalog's location keys, not the records; still due in phase 6, when the records are read.)

### Phase 4

- Run `migratePayments(repo, localStorage)` at startup and handle a rejection (a failed write
  leaves the marker unset, so the page must say so and the next load retries).
  (Taken: `bootstrap` runs it and a rejection renders an error banner with a reload button, DD-80.)
- Switch download and restore to `transfer-v3` at the same time. The old `transfer.ts` writes
  `cc:payment:` records, which never convert once `cc:migration:payments` is set.
  (Taken: download, copy and restore use `transfer-v3`; `transfer.ts` keeps only what v3 imports from it, DD-93.)
- Restoring a version 2 file over already-converted data can leave extra converted parts (a
  record that now converts to fewer parts leaves the old higher-index ones behind). Before
  writing, delete each card's converted payments for every period the file holds.
  (Taken: import deletes the card's stored `m:<card>:<period>:` payments before writing a converted one, DD-95.)
- Swap `convertPayments` in `loadMoneyData` for the stored card payments once the migration
  runs at startup.
  (Taken: `loadMoneyData` reads stored card payments and statement dates.)
- Planned payments join *Needs you* and the over-room explanation on enter amounts.
  (Taken: DD-84.)
- A purchase links back to its list by dropping the last `-<n>` of its id (`<list id>-<n>`).
  (Taken: `listIdOf`, checked against stored lists, DD-91.)
- Opening a saved list uses `shareTable` with the list's status, so its table and copied text
  show what was bought (DD-65).
  (Taken: the Lists view shows a saved list's made total through `shareTable`, DD-90.)
- Lists view in Transactions: each list row opens its page by status through
  `listPageAddress` (`#lib/ui/list-address`): a draft `/list/draft?id=`, a waiting list
  `/list/reply?id=`, a saved one `/list/view?id=` (DD-75).
  (Taken: DD-90.)
- Move the action-bar CSS (`app.css`, `cc-list-amounts`, `cc-list-reply`) into `shared.ts`.
  (Taken: the styles are in `shared.ts`.)
- The range helpers in `purchase-range.ts` are test-only now; use them for *Purchases by date*
  or delete them.
  (Taken: `presetRange` and `normaliseRange` serve the ledger; `purchasesInRange` and `rangeSummary` are deleted.)

### Phase 5

- Before group colour chips ship with Cards, darken the light `--cc-group-4-text` (4.21:1 on
  `--cc-group-4`) so it passes AA.
  (Taken: `#b1532f` to `#a74e2c`, 4.63:1, DD-120.)
- The `data-env` tint is applied after first paint; it could be folded into the head theme
  script later.
  (Not taken: still set by `chrome.ts` after first paint; moved to phase 6.)
- Refuse deleting a card that is on a list waiting for the spender or on a draft.
  (Taken: `deleteCard` throws `guard.cardOnList`, tested in the contract suite, DD-119.)
- Don't remove the `quickAdd.*`, `spendable.*` and `backup.copy*` catalog keys the list pages
  still use (or give those pages keys of their own first).
  (Taken: only keys grep showed unused were removed; the purchase sheet reuses `quickAdd.*`.)
- The card page's statement list is read-only (no per-statement *Mark paid*) until the new card
  page; a payment is made at `/pay?card=<id>` (DD-78).
  (Taken: the new card page has *Make a payment* to `/pay?card=…&amount=<next bill>`, DD-118.)
- `SpendRow` is hand-built in `card.ts`; it can go when `cc-quick-add` goes.
  (Taken: both are gone.)
- `cards.ts` recomputes each group's room on every paint; compute it once per load.
  (Taken: DD-117.)
- The card page's Add purchase dialog goes with the old card page (DD-67).
  (Taken: DD-111.)

### Phase 6

- Move purchase places from `settings.purchaseLocations` to the location records, and change
  export and import with it. Until then settings is the truth: export takes `takesPurchases`
  from settings and import writes settings from the file's locations (DD-94).
- A Merge of a version 3 file deletes extra local `m:` payment parts for a period the file
  holds (DD-95); tell the reader in the Merge help, or make Merge skip it.
- Widen `Card.location` to any location id, and make backup version 3 check each card's
  location against the file's location ids (RD-17).
- Once `Card.location` widens, let the Cards filter offer custom locations and
  `readCardsView` (`cards-query.ts`) keep them in `loc`; today both take only the three fixed
  places (DD-115). The edit screen's *Kept in* control also lists only `LOCATIONS`.
- Apply the `data-env` tint before first paint (fold it into the head theme script); today
  `chrome.ts` sets it after.
- The Cards page has no "not assigned" filter, yet *Ready to use*'s *Assign them* links there
  (US-06). Add a way to find cards with no limit group, or point the link elsewhere.
- Small leftovers from phase 5, each still true at its last commit:
  - Only archived cards match: the folded *Archived (N)* shows with no *No card matches* line
    (`cc-cards-list`).
  - The group sheet drops its *Delete NAME?* swap before a delete's result, so a failed delete
    shows the plain *Delete group* again (`cc-group-sheet`).
  - *Show older statements* shows even when there is nothing older (`card.ts`).
  - `cc-card-hero` has literal `font-weight`, `line-height` and `letter-spacing` values
    (UI-01: move them to tokens).
  - The cards filter's radio ring uses `calc(var(--cc-border-width) * 2)`; a token would
    be cleaner.
  - Thai `title.cards` and `title.card` are both "บัตร — cc-tracking".
  - The back header uses the large page heading; the prototype has a compact sub-header.
    (Taken for the card page and the edit page in the 2026-11-01 feedback round, DD-124; the
    other sub-pages are listed below.)
  - The name sort uses `localeCompare` with no locale, so order can differ by browser.
  - A group whose id is `new` would collide with the blank-sheet address `?group=new` (ids are
    UUIDs, so only a restored or hand-made id could).
- Small leftovers from the phase 5 feedback round (2026-11-01), each checked open at its last
  commit:
  - The other sub-pages still use the big back header (`backHeader`): `/pay`, the
    new-list picker and the list pages (enter amounts, draft, reply, saved list). Move them to
    the compact sub-header (`subHeader`, DD-124).
  - The sticky sub-header's `top` uses `--cc-header-height` (3.25rem, 52px) while the app header
    measures 51px, so the bar sits 1px under the header (the header paints over it, so no gap
    shows). Tie the two to one measure.
  - `cc-card-form`'s section heading has a literal `letter-spacing: 0.06em` (as `cc-pay-form`'s
    `.stat small`); move it to a token (UI-01).
  - At 390px *Due days after close* wraps to two lines in the edit page's segmented control.
