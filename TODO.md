# TODO

- Show how much browser storage the app uses. Everything lives in `localStorage` under the
  `cc:` prefix (cards, purchases, card payments, statement dates, limit groups, purchase
  lists, locations), which browsers cap at about 5 MB per origin, and a full store only
  surfaces as a failed save. Add a visual on the settings page: a bar of bytes used against
  that cap, split by kind (cards, purchases, card payments, statement dates, limit groups,
  purchase lists, locations), so the reader sees which data grows and how close they are to
  the limit before a save fails. `cc:settings` is no longer written; a leftover one is small.
- Build the tabs and detail panel (PRD RD-22 to RD-29, settled 2026-11-13). The spec, with every
  address and query key, is `docs/superpowers/specs/2026-11-12-tabs-and-panel-design.md`, and its
  mockup is `2026-11-12-tabs-and-panel-mockup.html` beside it. It replaces the record-path plan
  (ids in the path, PR #37's proof of concept): ids now go in the query, so no rewrite rules are
  needed. Six pull requests, each test-first, each updating `ENDPOINTS.md`, `PRD.md` and
  `PRD_TH.md` as it ships:
  1. The card id format and a required limit group (RD-27, RD-28): the card form and restore.
  2. The panel molecule and the card panel on `/cards` (RD-23, RD-24).
  3. Tabs and addresses for Cards: `/cards`, `/cards/limits` (RD-22, RD-29).
  4. Transactions and the purchase list pages: `/transactions`, `/transactions/lists`,
     `/transactions/lists/new`, `/transactions/lists/edit` (RD-22, RD-26).
  5. Home's tabs, `/owed` and `/ready` among them, and its panel (RD-22, RD-25).
  6. Retire `/card`, `/card/new`, `/card/edit`, `/pay`, `/list/*`, the floating _+ New_ and the
     `/backup` redirect.
