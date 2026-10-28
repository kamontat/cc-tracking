# TODO

- Rework the flows (how pages lead into one another, what each page asks of the reader). The
  palette, shape and the "used this cycle" bar in Spendable shipped with the visual redesign;
  the flows were left alone because they need the reader's own walk-throughs to redesign.
- Show how much browser storage the app uses. Everything lives in `localStorage` under the
  `cc:` prefix (cards, purchases, payments, limit groups, settings), which browsers cap at
  about 5 MB per origin, and a full store only surfaces as a failed save. Add a visual on the
  settings page: a bar of bytes used against that cap, split by kind (cards, purchases,
  payments, limit groups, settings), so the reader sees which data grows and how close they
  are to the limit before a save fails.
