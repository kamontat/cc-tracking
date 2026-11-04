# TODO

- Show how much browser storage the app uses. Everything lives in `localStorage` under the
  `cc:` prefix (cards, purchases, card payments, statement dates, limit groups, purchase
  lists, locations), which browsers cap at about 5 MB per origin, and a full store only
  surfaces as a failed save. Add a visual on the settings page: a bar of bytes used against
  that cap, split by kind (cards, purchases, card payments, statement dates, limit groups,
  purchase lists, locations), so the reader sees which data grows and how close they are to
  the limit before a save fails. `cc:settings` is no longer written; a leftover one is small.
- Move the addresses to record paths with ids in the path, so an address says what it opens
  and the same record keeps one address. Nothing is built yet; PR #37 is the proof of
  concept (`/poc/items/<id>`, preview `https://pr-37-cc-tracking.kcinth.workers.dev/poc/items`).

  Decided:
  - Records own their paths: `/cards/*`, `/payments/*`, `/purchases/*`. Ids go in the path,
    served by `public/_redirects` 200 rewrites (fixed paths above `:id` rules; the first
    match wins). PR #37 showed this works on Workers, encoded ids (`x%2Fy%23z`) included.
  - Every page needs `<base href="/">`: built pages load `../chunk-*.js`, which under
    `/cards/<id>` would hit the `:id` rule and get HTML back, breaking the page silently.
  - Sheets have their own paths. Opening one is `pushState` with the sheet sliding up over a
    page that is drawn once and never redrawn; Back slides it down. A reload or a pasted
    address opens the sheet at once, as `/pay?card=` does today.
  - No redirects for old addresses, and the `/backup` redirect goes (DC-17 retires).
  - Keys: `owed` becomes `owedSort`, `loc` becomes `location`, `view` goes (phone views
    become paths), `id` and `group`/`newGroup` move into the path. Filters, search and sort
    stay in the query.

  Draft:

  | Address | Was | Tab |
  | ------- | --- | --- |
  | `/` | `/` | Home |
  | `/transactions` | `/transactions` | Transactions |
  | `/transactions/owed` | `/transactions?view=owed` | Transactions |
  | `/transactions/lists` | `/transactions?view=lists` | Transactions |
  | `/payments/new` | `/pay` | Transactions |
  | `/purchases/new?type=list` | `/list/new` | Home |
  | `/purchases/<id>` | `/list/draft`, `/list/reply`, `/list/view` | Home |
  | `/cards` | `/cards` | Cards |
  | `/cards/groups` | `/cards?view=groups` | Cards |
  | `/cards/groups/<id>`, `/cards/groups/new` (sheets) | `/cards?group=`, `?newGroup=1` | Cards |
  | `/cards/new` | `/card/new` | Cards |
  | `/cards/<id>` | `/card?id=` | Cards |
  | `/cards/<id>/edit` | `/card/edit?id=` | Cards |
  | `/cards/<id>/purchase` (sheet) | not in the address | Cards |
  | `/settings`, `/settings/locations` | same | Settings |

  `/purchases/<id>` keeps one address while a list goes from draft to sent to saved; the
  page picks its step by status.

  Open, to settle before building:
  1. `type=single`: build a single-purchase page now, or only reserve the key, keeping the
     single purchase as the `/cards/<id>/purchase` sheet (suggested).
  2. Tabs: `/purchases/*` on Home and `/payments/*` on Transactions?
  3. The lists overview: `/transactions/lists`, or `/purchases?type=list`?
  4. The payment sheet: `/payments/<cardId>` over the picker (suggested), or
     `/cards/<id>/pay` over the card page. `?amount=` stays a query either way.
  5. Trailing slash: `/cards/abc/` is a 404 on Workers; add `/:id/` rules or never write one.
  6. Local dev: `@kctools/bun-server` (dev and preview) ignores `_redirects`, so the deeper
     paths 404 locally. Teach it `_redirects`, or develop with `wrangler dev`.
  7. Close PR #37 or keep it as a reference until the real change lands.

  Then update `ENDPOINTS.md`, `PRD.md` and `PRD_TH.md` together, and build it test-first.
