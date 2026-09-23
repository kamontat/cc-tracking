# Testing guide — 2026-09-23 credit limits and shared limit groups

Covers commits `212ca09` through `2307ec5`, the credit-limit and shared
limit-group work described in
`docs/superpowers/specs/2026-09-23-credit-limits-design.md`. Run `bun run dev`
and work through this against <http://127.0.0.1:3000/>. Use a browser profile
whose `localStorage` already holds a few cards and purchases, or add them as
you go — either way you will need at least one limit group before a purchase
can be entered, since the card form now requires one.

The automated suite (`bun test`, 350 tests) already covers the arithmetic —
outstanding balances, shared pools, paid statements returning credit,
over-limit and archived-card edge cases — and the component rendering. What
is worth a human's eye is the part it cannot see: how the two new panels
look, and whether cards saved before this feature behaves sanely once it
exists.

## What is new

- **`LimitGroup` records.** A pool of credit with a name and a limit,
  stored under `cc:limitgroup:<id>`, managed from a new section on `/cards`.
- **`Card.limitGroupId`.** Every card now points at one group. The card form
  has a required *Limit group* select; it is disabled with an explanatory
  note when no group exists yet.
- **A "Limit group" column** on the card table, reading the group's name or
  *Not assigned*.
- **The dashboard's *Can spend now* panel (`cc-spendable`).** One row per
  card that can take a purchase, its available amount, and the close and due
  dates of the statement a purchase made today would land on.
- **Remaining credit on the purchase form.** Selecting a card shows
  "Available ฿X of ฿Y"; a purchase that exceeds it still saves, and the
  confirmation adds a sentence naming the group and the amount over.
- **Backup version 2.** Backups now carry `limitGroups`; a version 1 file is
  rejected by the existing version check.

## What changed

- The card form will not save a card without a limit group chosen.
- The card table's columns now include Limit group.
- The dashboard loads groups alongside cards, purchases, and payments, and
  no longer drops archived cards before computing what they owe — an
  archived card's unpaid balance still counts against a shared group even
  though the card itself doesn't appear in the panel.
- `/backup` exports and imports limit groups first, so an imported card's
  group always has something to point at.

## What to test

### 1. A shared limit group, from scratch

- [ ] Open `/cards`. Below the card table, add a limit group — give it a
      name and a limit, for instance 300000 (baht, not satang).
- [ ] It appears in the group table with 0 cards, the full limit shown as
      both Used (zero) and Available.
- [ ] Add a card (or edit an existing one) and point it at that group in the
      *Limit group* select; save.
- [ ] Add a second card pointing at the same group; save. The group table's
      Cards column now reads 2, and the card table's Limit group column
      names the group for both.
- [ ] Try to delete the group. The Delete button is gone — a small note
      instead reads how many cards use it — because a group in use cannot be
      removed. It only reappears once both cards are moved off or removed.

### 2. The dashboard panel treats them as one pool

- [ ] Give both cards the same billing cycle (so their statements close and
      fall due on the same dates) and open `/`.
- [ ] The *Can spend now* panel lists both cards, each with the same
      available amount (the group's limit, since nothing has been spent
      yet) and matching close/due dates for the open period.
- [ ] Each row carries a small note under the card name naming the group and
      "shared with 1 more" (or however many other cards share it).
- [ ] The dates shown are the statement a purchase made *today* would land
      on — not necessarily the same dates *Due next* shows for that card.
      If a statement is currently overdue, deliberately check that the two
      panels disagree: that is correct, not a bug.

### 3. Spending draws down the shared pool

- [ ] From the purchase form, pick one of the two cards. The line under the
      card select reads "Available ฿X of ฿Y", where X starts equal to the
      group's limit.
- [ ] Enter a purchase for more than the available amount and submit. It
      saves — nothing blocks it — and the confirmation names the group and
      says by how much the purchase went over, alongside the usual
      close/due sentence.
- [ ] Back on the dashboard, both cards' available amount has dropped by the
      same purchase, not just the one it was entered against — they draw on
      one pool.
- [ ] Enter a second, smaller purchase against the *other* card. The
      available amount drops further, again for both rows.

### 4. Marking a statement paid returns exactly its total

- [ ] On the due list, mark the statement holding one of the purchases
      above as paid.
- [ ] The *Can spend now* panel's available amount for both cards in the
      group rises by exactly that statement's total — not by the payment
      (there is no amount to record against a payment), and not by
      anything else outstanding.
- [ ] If money is still outstanding on the other card's statement, the
      group is not back to its full limit yet — only fully paid statements
      give credit back.

### 5. Backup round-trips limit groups

- [ ] On `/backup`, export. Open the downloaded file and confirm it has
      `"version": 2` and a `limitGroups` array alongside `cards`,
      `purchases`, and `payments`.
- [ ] Import that same file back. Nothing is lost or duplicated, no error
      banner appears, and the group and card tables on `/cards` look the
      same as before the export.
- [ ] Try importing a version 1 backup file (no `limitGroups`, or
      `"version": 1`). It is rejected with a message naming the version
      mismatch, and nothing is imported.

### 6. Cards from before this feature

- [ ] Find or fake a card with no `limitGroupId` (an old card, or one edited
      directly in a backup file before import). It shows *Not assigned* in
      the card table's Limit group column.
- [ ] It is absent from the dashboard's *Can spend now* panel. A line under
      the panel's table names how many cards have no group yet and links to
      *Cards*.
- [ ] Edit that card, choose a group, and save. It now appears in the panel
      and its unassigned count drops by one.
- [ ] With every card assigned, that line disappears entirely.

### 7. Archived cards still weigh on the group

- [ ] With an unpaid statement on a card, archive it from `/cards`.
- [ ] It disappears from the dashboard entirely, but the group's used and
      available amounts (both on `/cards` and in the dashboard panel, for
      any other card still sharing the group) still reflect its unpaid
      balance.

### 8. Both languages and phone width

- [ ] Switch to ไทย. The *Limit groups* section, the *Can spend now* panel,
      the "Available ฿X of ฿Y" line, the over-limit sentence, and the
      unassigned-cards notice are all translated. Money stays `฿1,234.56`
      in both languages; dates stay a Gregorian year, not 2569.
- [ ] Switch languages while a limit-group form or the purchase form shows
      a validation error: the error re-renders in the new language rather
      than clearing.
- [ ] Narrow the window to about 400px. The limit-group table, the card
      table's new column, and the *Can spend now* table all stay readable —
      stacked or scrollable, not clipped or overlapping.

## Known gaps

- No partial payments: a payment is still a boolean, so paying less than a
  statement's full total is not representable, and marking it paid returns
  the whole amount regardless. Unchanged by design, not a bug to chase.
- No limit history: editing a group's limit does not preserve the old
  value, so there's nothing to check there beyond the new number taking
  effect immediately.
- Import is still not atomic: a failure partway through can leave some
  records written and others not. Unchanged by this work.
