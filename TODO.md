# TODO

- Show how much browser storage the app uses. Everything lives in `localStorage` under the
  `cc:` prefix (cards, purchases, card payments, statement dates, limit groups, purchase
  lists, locations), which browsers cap at about 5 MB per origin, and a full store only
  surfaces as a failed save. Add a visual on the settings page: a bar of bytes used against
  that cap, split by kind (cards, purchases, card payments, statement dates, limit groups,
  purchase lists, locations), so the reader sees which data grows and how close they are to
  the limit before a save fails. `cc:settings` is no longer written; a leftover one is small.
