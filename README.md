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

- `/` — statements due next, quick purchase entry, cards grouped by location.
  The purchase form offers only the cards that may take one; see *Which cards
  can take a purchase* below.
- `/cards` — the card registry. When adding or editing a card, you choose its
  physical location from a dropdown: one of Bangkok, Phichit, or Krabi. Cards
  already stored in this browser from before the locations were fixed are reset
  to Bangkok once at startup; the page then names those cards, once, with a
  Dismiss button, so you can pick the correct location by hand.
- `/backup` — JSON backup export and import.
- `/card?id=<cardId>` — one card's statements, purchases, and paid state, with
  paging. A month with no purchases in it starts collapsed, so a long run of
  unused months stays one line each. There is no in-place edit for a purchase:
  changing one means deleting it and adding a new one.

## Which cards can take a purchase

Each card carries its own answer, ticked on the card form as *Can be used for
new purchases*. Only those cards appear in the dashboard's purchase form; every
card still appears everywhere else, including the due list.

A card saved before this flag existed has no answer stored, and falls back to
where it is kept: Krabi yes, anywhere else no. That reproduces the rule that was
in force before — purchases were only ever entered against the Krabi cards —
without rewriting a single stored card. Editing and saving any card writes an
explicit answer for it, and the fallback then no longer applies to it.

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

Use the Export JSON button on `/backup` as your backup — importing merges a
backup's cards, purchases, and payments back in without deleting anything
already there. A file that is not valid JSON, is missing its expected lists,
has a card/purchase/payment with the wrong shape, or was written by a
different backup version is rejected with a message naming what was wrong,
and nothing is imported. A backup whose card names any location other than
the three known places is rejected by its position in the file — for instance,
a card might be rejected with
`That backup's card #1 has a location that is not bangkok, phichit, or krabi.`
— and nothing is imported. Import itself is not atomic, though: it writes
cards, then purchases, then payments one at a time, so a failure partway
through (for instance, storage filling up) can leave some records imported
and others not.

## Language

The interface is available in English and Thai. The picker sits in the nav on every
page; switching it re-renders the current page in place — no reload, and nothing typed
into an open form is lost. The choice is remembered in this browser's `localStorage`
under `cc:lang`, so it survives a reload and future visits. A first visit with nothing
saved yet defaults to Thai, unless the browser's own language list asks for English —
these are Thai company cards in baht on Asia/Bangkok dates, so Thai is the more likely
daily language and English is opted into, not the other way around.

Dates render as `dd MMM yyyy` — a zero-padded day and a Gregorian year — in both
languages, for example `05 Sep 2026` and `05 ก.ย. 2026`. This is deliberately not
`Intl`: a Thai locale (`th-TH`) would default to Buddhist Era years, printing `2569`
where a bank statement says `2026`, and these dates are reconciled against exactly
those statements. Money is likewise never translated or reformatted per locale;
`฿1,234.56` reads the same in either language.

Text a user typed in — a card's name, its comment, a purchase's note — is never
translated. Only the application's own wording comes from the catalog.

One consequence of avoiding `Intl` is worth knowing: the location groups on the
dashboard sort by plain UTF-16 code-unit order, not Thai collation, and the two can
disagree. A Thai dictionary treats a leading vowel like เ as following the consonant
it is pronounced with, not preceding it, so `เกา` ("to scratch") collates as if it
were spelled starting with ก and sorts *before* `ขาว` ("white") — confirmed with
`Intl.Collator("th")`. Plain code-unit order gets this backwards: เ's code point
(`U+0E40`) is higher than every consonant's, so `เกา` sorts *after* `ขาว` instead.
As it happens, the app's three actual locations — Bangkok, Phichit, and Krabi — land
in the same order under both code-unit comparison and real Thai collation, so this
gap is latent rather than visible in the UI today; it would only surface if a location
were added whose name has this shape. This is a known, deliberate trade-off rather
than a bug: fixing it needs `Intl.Collator`, and using any `Intl` API on `th-TH` risks
pulling in the same Buddhist-era year handling the date rendering above exists to
avoid.

## Design and plans

- `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`
- `docs/superpowers/plans/2026-09-21-cc-tracking-phase-1.md`
