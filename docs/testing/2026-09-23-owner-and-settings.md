# Testing guide — 2026-09-23 owner, settings, and relative dates

Run `bun run dev` and work through this against <http://127.0.0.1:3000/>. Use a
browser profile whose `localStorage` already holds cards saved before this
change, because half of what is worth checking is how that older data reads now.

The automated suite (`bun test`, 425 tests) covers the logic. What needs a
human's eye is the layout, the Thai copy, and the migration behaviour.

## What is new

- **A `/settings` page**, third in the nav, holding a *Purchases* section with
  one checkbox per location.
- **Two card fields**: *Owner* (KC, NT, or RI) and *Supplementary card*
  (บัตรเสริม).
- **Relative dates** under the Closes and Due columns of *Can spend now*.

## What changed

- **The per-card purchase flag is gone.** Whether a card can take a new purchase
  now comes from where it is kept, and the answer lives once in Settings rather
  than once per card. The *Can be used for new purchases* checkbox has left the
  card form, and the *Purchases* column has left the card registry.
- **Stored per-card flags are ignored, not migrated.** Settings start with Krabi
  ticked and Bangkok and Phichit unticked. A card that had been explicitly
  turned on or off before is now governed by its location like every other one.
- The card id field's placeholder reads `0001` instead of `kbank-visa`.
- A backup file carries the settings alongside everything else. The format is
  still version 2: older files import as before, and leave the stored settings
  alone.

## What to test

### 1. Existing data still behaves (do this first, before editing anything)

- [ ] Open the dashboard. The purchase form's dropdown lists **only** cards kept
      at Krabi — including any Bangkok or Phichit card you had previously ticked
      by hand, which should now be absent.
- [ ] Every card, Krabi or not, still appears in *Due next* and in *Cards by
      location*.
- [ ] Open `/cards`. Every row's Owner column reads `KC`, and no row carries a
      *Supplementary card* badge. There is no Purchases column.
- [ ] Add a purchase from the dashboard. It saves, and the confirmation names
      the statement it landed on.

### 2. Settings

- [ ] Open `/settings` from the nav. The nav link is marked as the current page.
      Krabi is ticked; Bangkok and Phichit are not.
- [ ] Tick Bangkok. Go to the dashboard: the Bangkok cards now appear in the
      purchase dropdown and in *Can spend now*.
- [ ] Untick every box. The page warns that nothing takes new purchases. The
      dashboard's purchase form says no card can take one and points at
      Settings.
- [ ] Reload after each change. The choice survives.

### 3. Owner and บัตรเสริม

- [ ] Add a card without touching Owner. It saves as `KC`.
- [ ] Add a card with Owner set to `RI` and *Supplementary card* ticked. The
      registry shows `RI` in the Owner column and a badge beside the name.
- [ ] Edit that card. Both fields open on what you saved, and saving without
      touching them leaves them as they were.
- [ ] Add a card, then add a second one straight after: the Owner select is back
      on `KC` and the box is unticked, with none of the first card's text left
      behind.

### 4. Relative dates

- [ ] On the dashboard, each row of *Can spend now* shows the date and, beneath
      it, how far off it is — `in 12 days`, `today`, or `5 days ago`. A close
      date already past reads `N days ago`, never `overdue`.
- [ ] Compare against *Due next*, whose badge still says `due today` and
      `N days overdue`. The two treatments are deliberately different.

### 5. Both languages

- [ ] Switch to ไทย. The Settings page, the nav link (ตั้งค่า), the Owner label
      (เจ้าของ), the บัตรเสริม checkbox, and the relative dates
      (อีก N วัน / วันนี้ / N วันก่อน) all read in Thai.
- [ ] The three owner codes stay as `KC`, `NT`, `RI` in both languages.

### 6. Backup

- [ ] Export a backup with a non-default Settings choice. The JSON has a
      `settings` key, and `version` is still `2`.
- [ ] Import it into a fresh profile: the settings, owners, and บัตรเสริม flags
      all come back.
- [ ] Import an older backup file, written before this change. It imports
      without complaint, and the settings already stored are left as they were.

### 7. Layout

- [ ] Narrow the window below 640px. The card registry's stacked rows label the
      Owner cell, and the *Can spend now* dates keep their badge beneath them.
- [ ] Check the Settings page at both widths.
