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
| 3. Home and purchase lists | Home (*Needs you*, *Ready to use*), entering amounts with warnings, review with copy text and save image, the spender's reply, saved list. Removes the dashboard's purchase form, *This sitting* and the batch start. | RD-09, RD-10, RD-15 | written after phase 2 |
| 4. Transactions and payments | The Transactions ledger with search, filter and sort; *Upcoming*; the payment form with the card picker; planned payments. Runs the payment conversion at startup and switches download and restore to backup version 3. Removes *Due next*, *Purchases by date*, the old payment dialog and the placeholder Transactions page. | RD-11 to RD-14 | written after phase 3 |
| 5. Cards | Cards page with grouping, search, filter and sort; card page; full edit screen; limit groups. Removes the registry dialogs and the `/cards` query view. | RD-16 | written after phase 4 |
| 6. Settings | Display, Locations (`/settings/locations`) with `Card.location` widened to any location id and backup version 3 checking each card's location, Backup (download, copy as text, restore a copy, all version 3 from phase 4), Reset (delete old purchases, delete all data); About already shipped in phase 2. Then the PRD's acceptance criteria are walked on the preview. | RD-17, RD-18, RD-19 | written after phase 5 |

Each phase updates `PRD.md` and `PRD_TH.md` for what it ships (the overridden rows are updated
or retired) and adds a dated changelog entry when it lands.

## Notes for later phases

Left by the final review of phase 1. Phase 2 is the look and the shell only, so most of them
moved to the phase that builds what needs them.

### Phase 2

- Guard `titleMark("preview", "")`: a preview build without a PR number must not mark the
  title `(pr-)`. (Taken by the phase 2 plan.)

### Phase 3

- `saveReply` does not refuse a list that is already saved; the caller must.
- `heldBy` must be given sent lists only.
- Default location records are stored with English names. While a record still has its
  default name, show the catalog name in the reader's language (Thai or English), or seed the
  records in the reader's language. Applies wherever a location name first shows (Home's
  *Ready to use*), and again in phase 6.

### Phase 4

- Run `migratePayments(repo, localStorage)` at startup and handle a rejection (a failed write
  leaves the marker unset, so the page must say so and the next load retries).
- Switch download and restore to `transfer-v3` at the same time. The old `transfer.ts` writes
  `cc:payment:` records, which never convert once `cc:migration:payments` is set.
- Restoring a version 2 file over already-converted data can leave extra converted parts (a
  record that now converts to fewer parts leaves the old higher-index ones behind). Before
  writing, delete each card's converted payments for every period the file holds.

### Phase 5

- Before group colour chips ship with Cards, darken the light `--cc-group-4-text` (4.21:1 on
  `--cc-group-4`) so it passes AA.
- The `data-env` tint is applied after first paint; it could be folded into the head theme
  script later.

### Phase 6

- Widen `Card.location` to any location id, and make backup version 3 check each card's
  location against the file's location ids (RD-17).
