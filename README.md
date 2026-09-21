# cc-tracking

Tracks company credit cards: where each card physically is, when its statement
closes and payment is due, and which statement a purchase lands on.

## Running it

```bash
bun install
bun run dev        # http://127.0.0.1:3000
bun run build      # static pages into dist/
bun run preview    # serve the build
bun test           # the whole suite
bun run typecheck  # tsc --noEmit
bun run check      # biome check
```

## Pages

- `/` — statements due next, quick purchase entry, cards grouped by location
- `/cards` — the card registry, and JSON backup export and import. When adding
  or editing a card, you choose its physical location from a dropdown: one of
  Bangkok, Phichit, or Krabi. Cards found to have a free-text location from an
  older backup are automatically reset to Bangkok once at startup; the page then
  names those cards so you can pick the correct location by hand.
- `/card?id=<cardId>` — one card's statements, purchases, and paid state, with
  paging. There is no in-place edit for a purchase: changing one means
  deleting it and adding a new one.

## How statements work

Each card carries a billing cycle rule: either *closes on day N, due M days
later* or *closes on day N, due on day M*. Statements are never stored — they
are computed from that rule, so a period's close date, due date, purchases, and
total are always derived from the card as it is now. Only a paid statement
leaves a record behind, and that record freezes the close and due dates it was
paid against, so editing a cycle rule can never rewrite settled history.

A purchase dated exactly on the close date belongs to that statement, not the
next one.

## Where the data lives

Phase 1 keeps everything in this browser's `localStorage`, under keys shaped
like `cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, and
`cc:payment:<cardId>:<period>`. Those shapes hold as written for an ordinary
card id, date, and uuid; each segment is actually percent-encoded, so a card
id containing `:` or other reserved characters produces a key that looks a
little different from the documented shape, though it still round-trips
correctly. Those are the same shapes the planned Cloudflare KV namespace
uses, so phase 2 swaps the repository implementation and nothing else.

A card's location is stored as one of three lowercase keys: `bangkok`,
`phichit`, or `krabi`. These are the display-neutral keys; when a card is
shown on screen or in the UI, the location goes through a display function
that renders them as "Bangkok", "Phichit", and "Krabi".

Use the Export JSON button on `/cards` as your backup — importing merges a
backup's cards, purchases, and payments back in without deleting anything
already there. A file that is not valid JSON, is missing its expected lists,
has a card/purchase/payment with the wrong shape, or was written by a
different backup version is rejected with a message naming what was wrong,
and nothing is imported. A backup whose card names any location other than
the three known places is rejected by card name (for instance, "Backup's card
#1 has a location that is not bangkok, phichit, or krabi"), and nothing is
imported. Import itself is not atomic, though: it writes cards, then
purchases, then payments one at a time, so a failure partway through (for
instance, storage filling up) can leave some records imported and others not.

## Design and plans

- `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`
- `docs/superpowers/plans/2026-09-21-cc-tracking-phase-1.md`
