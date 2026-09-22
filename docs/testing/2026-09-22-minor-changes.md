# Testing guide — 2026-09-22 minor changes

Covers commit `6f2e662`, "say which cards can be spent on, and give backup its
own tab". Run `bun run dev` and work through this against
<http://127.0.0.1:3000/>. Use a browser profile whose `localStorage` already
holds a few cards and purchases, or add them as you go.

The automated suite (`bun test`, 287 tests) already covers the logic. What is
worth a human's eye is the part it cannot see: how the pages look, and whether
data written before this change still behaves.

## What is new

- **A per-card purchase flag.** `Card.canPurchase`, ticked on the card form as
  *Can be used for new purchases*.
- **A `/backup` page**, third in the nav, holding Export JSON and Import JSON.
- **A Purchases column** in the card registry, showing `Allowed` or `—`.

## What changed

- The dashboard's purchase form lists only the cards that may take a purchase.
- Cards are named by id and name in the purchase form, the due list, and the
  location groups. The last four digits no longer appear in those three places;
  the registry table and the card page still show them.
- The card page heading reads `Name  id · ••••1234`.
- Overdue rows and statement panels are tinted, their due date takes the danger
  colour, and their badge is filled. *Due soon* is unchanged.
- Backup left the registry page; the card form there is now full width.
- On the card page, a statement month with no purchases starts collapsed.
  A month with purchases starts open.

## What to test

### 1. Existing data still behaves (do this first, before editing any card)

This is the one that matters most: the flag did not exist when your cards were
saved, so each falls back to where it is kept.

- [ ] Open the dashboard. The purchase form's dropdown lists **only** cards kept
      at Krabi.
- [ ] Every card, Krabi or not, still appears in *Due next* and in *Cards by
      location*.
- [ ] Open `/cards`. The Purchases column reads `Allowed` for the Krabi cards
      and `—` for the rest.
- [ ] Add a purchase from the dashboard. It saves, and the confirmation names
      the statement it landed on.

### 2. The flag, once you set it by hand

- [ ] Edit a Bangkok or Phichit card, tick *Can be used for new purchases*, and
      save. It now appears in the dashboard's dropdown, and its Purchases column
      reads `Allowed`.
- [ ] Edit a Krabi card, untick the box, and save. It disappears from the
      dropdown and its column reads `—`, even though it is still kept at Krabi.
      (Saving writes an explicit answer, which from then on overrides the
      location fallback.)
- [ ] Add a new card and set its location to Krabi. The box ticks itself.
      Change the location to Bangkok before saving: the box unticks.
- [ ] Add another new card, tick the box by hand, then change the location.
      Your tick survives — the location stops steering it once you have touched
      it.
- [ ] Turn every card off. The dashboard replaces the purchase form with a
      message pointing at the Cards page; there is no empty dropdown.

### 3. How cards are named

- [ ] Purchase form options read `id — Name`.
- [ ] Due list shows the name as a link with the id in mono underneath.
- [ ] *Cards by location* shows name then id.
- [ ] Card page heading shows name, id, and `••••` last four.
- [ ] A card whose id contains a space or a non-ASCII character still links to
      the right card page from all three places.

### 4. Overdue is easy to spot

- [ ] With an overdue statement in the list, the dashboard row is tinted, its
      due date is red and bold, and the "N days overdue" badge is solid.
- [ ] A statement due within seven days keeps the quieter amber treatment, and
      the two do not read as the same state.
- [ ] Same check on the card page: the overdue month's panel is tinted and
      outlined.
- [ ] Switch the OS to dark mode and repeat both. Text stays readable on every
      tinted surface, badge included.
- [ ] Narrow the window below 640px. The due table stacks, and the tint still
      covers the whole stacked row.

### 5. Backup on its own tab

- [ ] The nav shows Dashboard, Cards, Backup, and the current page is
      underlined — including on `/backup`.
- [ ] `/cards` offers no export button and no file picker.
- [ ] Export JSON downloads `cc-tracking-YYYY-MM-DD.json`.
- [ ] Import that file back. Nothing is lost or duplicated, and no error banner
      appears.
- [ ] Import a file that is not JSON. The banner names the problem and nothing
      is imported.
- [ ] Export a backup, edit one card's `canPurchase` to `false` in the file,
      import it, and confirm the registry column follows.
- [ ] Import a backup exported **before** this change (no `canPurchase` field at
      all). It is accepted, and those cards fall back to their location.

### 6. Collapsing statement months

- [ ] Open a card with several empty months. Each empty month is one line:
      period, close and due dates, total.
- [ ] A month with purchases is open, showing its table.
- [ ] Click an empty month open. Its Mark paid button is inside, and works.
- [ ] Mark a month paid. The paid date shows on the collapsed line too.
- [ ] Press *Show older statements* and confirm the twelve new months arrive
      collapsed unless they hold purchases.

### 7. Both languages

- [ ] Switch to ไทย. The new nav item, the Purchases column, the checkbox label,
      and the "no card can take a purchase" message are all translated.
- [ ] Switch while the purchase form shows a validation error: the error
      re-renders in the new language rather than clearing.
- [ ] Dates still read `05 ก.ย. 2026` — a Gregorian year, not 2569.

## Known gaps

- The overdue styling has no automated test; it is CSS, checked by eye.
- Import is still not atomic: a failure partway through can leave some records
  written and others not. Unchanged by this work.
