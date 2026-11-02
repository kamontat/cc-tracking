# Redesign phase 6: Settings — design

Last phase of the redesign stack (PRs #29 to #33). Branch `redesign-phase-6` from
`redesign-phase-5`; its PR targets `redesign-phase-5`. After the user accepts it, the whole stack
lands on main at once with one changelog entry.

Sources: `PRD.md` RD-17, RD-18, RD-19 (and DD-51, DD-94, DD-95, DD-115); the roadmap's phase 6
notes (`docs/superpowers/plans/2026-10-30-redesign-roadmap.md`); the approved prototype
(`.playwright-mcp/cc-flows.html` in the main checkout, `vSettings`, `vLocations`, `shPurge`).

## Intent

Settings is the one page the redesign has not touched. It still uses its own boxed look, wastes
desktop width, and restoring from the clipboard takes too many clicks. The user said, of today's
page:

- the design does not go along with the other pages;
- on a desktop it does not use the space well;
- restoring from the clipboard takes too many clicks.

Phase 6 also makes locations real records the user can manage, which lets cards be kept at any
place, and adds deleting old purchases. Then the PRD's acceptance criteria are walked on the
preview.

## Goals

1. Settings looks like the other redesigned pages: the prototype's sections of rows in rounded
   panels (`.set`), small buttons on the right, the shared sheet and sub-header pieces.
2. Desktop (900px and up, as other pages) shows two columns: Display, Locations, Backup on the
   left; Reset, About on the right. Phone shows one column in that order.
3. Restoring pasted text takes as few clicks as the browser allows.
4. Locations can be added, renamed, deleted (only with no cards) and ticked *Takes purchases* at
   `/settings/locations` (RD-17).
5. Old purchases can be deleted by age with a count and a second confirmation, without changing
   any card's owed, credit or room (RD-18, using the existing `planPurge`).
6. The roadmap's phase 6 leftovers are closed.

## Non-goals

- No new storage engine, no sync, no server. Same stack (RD-04).
- Display (language, theme) and About keep their behaviour; they only take the new row look.
- No change to backup version: it stays 3. No version 4.

## Anti-goals

- A restore that writes anything before the reader has answered Merge or Replace on a browser
  that already holds data.
- A purge that moves any card's owed, credit or room.
- Hiding a location the reader can't delete without saying why.

## Page layout (RD-19)

Title *Settings*, then sections, each an `h2` over one `.set` panel of rows. A row is a label with
a muted subline on the left and its control on the right; a row that is wholly one action is a
button.

| Section | Rows |
|---|---|
| Display | *Language* (segmented English / ไทย); *Theme* (segmented Light / Dark / Device). |
| Locations | *Manage locations* › to `/settings/locations`; subline "N places · X, Y take purchases" or "none take purchases". |
| Backup | *Download a copy* [Download] (subline: the filename it will save); *Copy as text* [Copy] (subline: "To paste into another browser"; shows *Copied* after); *Restore a copy* [Restore…] (subline: "From pasted text or a file; asks Merge or Replace"). |
| Reset | *Delete old purchases* [Choose…] opens the purge sheet; *Delete all data* [Delete…] swaps the row for an inline confirmation (as the prototype). |
| About | As shipped in phase 2, in a `.set` panel. |

The prototype's "Last saved 21 Oct" subline on Download is left out: nothing records when a copy
was last downloaded. *(Builder's call; drop if a stored stamp is wanted later.)*

## Restore a copy

*My call, the user was away (proposed with three options, recommended chosen):* *Restore…*
opens a sheet (the shared sheet used by the Cards and Transactions filters).

1. **Start:** a primary **Paste from clipboard** button, a quiet **Choose a file** button, and a
   quiet text link **Paste by hand**. Where the browser has no `navigator.clipboard.readText`,
   the sheet opens straight on the textarea instead and *Paste from clipboard* is not shown.
2. **Paste from clipboard** reads the clipboard and parses it at once. **Choose a file** parses
   the file at once. **Paste by hand** shows a textarea with a *Restore* button.
3. A parse failure shows its error in the sheet and stays on the start (or textarea) step. A
   clipboard read that is refused falls back to the textarea with a one-line hint.
4. **Empty browser:** imports right away (as today), closes the sheet, and the Backup panel
   shows the imported counts.
5. **Browser with data:** the sheet shows "Here" and "In the copy" counts and two choices,
   **Merge** (primary) and **Replace** (danger), each with its one-line hint as today, plus
   *Cancel*. Answering imports, closes the sheet, and shows the counts.

Clipboard restore: Restore…, Paste from clipboard, Merge = 3 clicks (2 on an empty browser),
down from 4 or 5.

## Delete old purchases (RD-18)

A sheet, as the prototype's `shPurge`:

- Chips *6 months*, *1 year* (default), *3 years*, *All*; choosing one recounts.
- A note: "**N purchases** bought before DATE will be deleted." or "Nothing is older than AGE."
  N counts `planPurge(...).purchaseIds`, with `purgeCutoff(age, today)`. When K purchases older
  than the cutoff stay (their statement is not fully paid, or the card's part was dropped to keep
  balances), a second muted line says "K older purchases stay: their statements aren't fully
  paid." K is the purchases dated before the cutoff minus N, counted in the UI; `planPurge`'s API
  does not change (*my call*).
- The explanation line from the prototype (only paid statements; payments that settled them and
  saved lists from the same time go too; owed, credit and room stay; cards stay; download a copy
  first).
- **Delete N purchases…** (danger; disabled as *Nothing to delete* at N = 0) swaps to a second
  ask: "This can't be undone." with *Keep them* and **Yes, delete N**.
- Yes applies the plan through the repository (delete purchases, delete payments by card and id,
  save trimmed payments, delete saved lists, delete frozen statement dates named in the plan),
  closes the sheet and shows "Deleted N purchases older than AGE." in the Reset panel.
- A storage failure mid-way shows the page error banner; what was written stays (as restore,
  not atomic). The applier is new storage-side code, tested on the memory repository: after it
  runs, every card's `cardLedger` owed and credit equal those before.

## Delete all data

Inline, as the prototype: the row swaps to a warning "This deletes N cards and every list,
purchase and payment. Language and theme stay. It can't be undone." with *Keep my data* and
**Delete everything** (danger). Afterwards the default locations are seeded again (see below),
so Home and the Locations page are not empty.

## Locations (RD-17)

### Location records become the truth

Today `settings.purchaseLocations` decides where purchases happen and the location records are
written only by a backup. Phase 6 flips that:

- A startup step in `bootstrap` (beside `migratePayments`) seeds the records once, behind a
  marker key under `cc:migration:` (*my call*): `defaultLocations(settings)`, so today's ticks
  carry over. `clearAll` removes settings and every `cc:migration:` key, so after *Delete all
  data* the next load seeds the three defaults again with Krabi taking purchases
  (`DEFAULT_SETTINGS`). The settings page re-runs the seed itself after *Delete all data*.
- The last location cannot be deleted (*my call*): a card always needs a place, and the edit
  screen requires one.
- A card whose `location` names no stored record (a version 2 file without settings, or a free
  text value) is handled by `migrateLocations` at startup and after a restore: a missing default
  id (`bangkok`, `phichit`, `krabi`) gets its default record back; any other value moves the
  card to the first record and is reported as today (*my call*).
- Everything that read `settings.purchaseLocations` (Home *Ready to use*, the list picker,
  `canUseForPurchases` in `card.ts`, the Cards list, the card page) reads `takesPurchases` from
  the records instead.
- `settings.purchaseLocations` is no longer read or written by the app. A version 2 file's
  `settings` still seeds its locations through `defaultLocations` when imported (DC-05 kept).
  Whether the `Settings` type and `cc-settings` component are deleted outright is the builder's
  call; nothing must keep reading the field.
- Backup v3 export writes the records as stored (no more mixing in settings); import writes them
  and no longer touches settings (DD-94 retires).
- Merge keeps local location records: a file's location whose id is already stored is skipped,
  so an old backup cannot undo a rename or a *Takes purchases* tick. Replace takes the file's
  records. (*My call*, in line with Merge being additive; new DD row and contract test.)

### `Card.location` widens to any location id

- `Card.location: string` (a location record id). `LOCATIONS`, `Location` and `toLocation` stay
  only where a version 2 file or the seed needs the three fixed ids.
- `migrateLocations` keeps its job for cards stored before the closed set (free text) but checks
  against the stored record ids, not `LOCATIONS`.
- Backup v3 parse checks each card's `location` against the file's `locations` ids, and refuses
  the file (as other shape errors, nothing written) when one is missing. Version 2 files keep the
  closed-set check (DC-06).
- The card edit screen's *Kept in*, the Cards filter's *Kept in* and `readCardsView`'s `loc`
  take every record, A to Z by name (DD-115 updated). `ready-filter` and `ready-query` do too.

### Order

*User's answer (2026-11-02):* everywhere locations are listed (Locations page, *Kept in*, the
Cards filter, `readCardsView`'s `loc`, Ready to use filter, the Cards `place` sort) they are
sorted A to Z by the shown name (see Names) in the reader's language. No order field; backup
shape unchanged.

### Names

A record whose name is still its English default (`Bangkok`, `Phichit`, `Krabi` on the ids
`bangkok`, `phichit`, `krabi`) shows the catalog name in the reader's language; any other name
shows as stored. One helper (`locationName(record)`) used everywhere a place name shows,
replacing `locationText`.

### The Locations page

`/settings/locations`, compact sub-header *Locations* with Back to Settings, one narrow column:

- A panel, one block per record, A to Z by name:
  - line 1: **name**, muted "N cards" (archived cards count); *Rename* (quiet); *Delete*
    (danger) only when N = 0.
  - line 2: a checkbox row *Takes purchases · its cards show under Ready to use*.
  - *Rename* swaps line 1 for a name field, *Save* and *Cancel*. An empty or duplicate name
    (case-insensitive, trimmed) is refused with a field message.
  - *Delete* asks once inline ("Delete NAME?" *Delete* / *Cancel*); the storage guard
    `guard.locationInUse` still stands behind it.
- A warning note when no place takes purchases: "No place takes purchases, so Ready to use on
  Home is empty."
- The muted line: "A location with cards can't be deleted. Move its cards first (Cards › a card
  › Edit)."
- *Add a location*: a name field and *Add*. The id comes from `locationId` (DD-51). New
  locations take purchases off.

## Merge and stale converted parts (DD-95)

*My call:* Merge stays purely additive for a version 3 file. Only a file converted from version 2
during the same import clears a card's stored `m:<card>:<period>:` parts before writing its
converted ones. `parseAnyBackup` marks a converted backup (for example an internal
`converted: true` flag not written to export), and `importBackupV3` clears only then. DD-95 is
updated to say so; no help text is needed.

## Leftovers to close (roadmap phase 6 notes)

- Apply the `data-env` tint before first paint, in the head theme script; `chrome.ts` stops
  setting it later.
- The Cards page gets a way to find cards with no limit group so *Ready to use*'s *Assign them*
  lands somewhere useful (builder chooses: a *Not in a group* filter option, or `?group=none`).
- Only archived cards match: show the *No card matches* line above the folded *Archived (N)*.
- The group sheet keeps its *Delete NAME?* state until the delete's result, so a failed delete
  still shows the question and the error.
- *Show older statements* shows only when there is something older.
- Move `cc-card-hero`'s literal `font-weight`, `line-height`, `letter-spacing`, `cc-card-form`'s
  and `cc-pay-form`'s `letter-spacing: 0.06em`, and the filter radio ring's
  `calc(var(--cc-border-width) * 2)` to tokens (UI-01).
- Thai `title.card` differs from `title.cards`.
- Name sort uses `localeCompare` with the current UI locale.
- `?group=new` cannot collide with a group whose id is `new` (use a separate key, e.g.
  `?newGroup=1`, or reserve the id).
- The sticky sub-header's `top` and the app header share one measure (no 1px offset).
- *Due days after close* does not wrap at 390px in the edit screen's segmented control.
- `/pay` picker empty text when only archived cards with nothing owed exist: "No card to pay.
  Archived cards with nothing owed are hidden." *(Proposed earlier, never answered; my call to
  ship it.)*

## Testing

- Test first, per `shipping-a-change`. Domain and storage changes on the memory and local
  repositories (contract suite); components in happy-dom; routes through their render functions.
- Purge applier: owed, credit and room equal before and after on generated data.
- Restore sheet: clipboard path, file path, by-hand path, refusal fallback, empty vs non-empty.
- Backup v3: card with a location missing from the file is refused; Merge of a v3 file deletes
  nothing.
- Screenshots at 1280 and 390, light and dark, English and Thai, next to the prototype, before
  handover (feedback memory).

## Docs

- `PRD.md` and `PRD_TH.md` together: RD-17, RD-18, RD-19 built; DD-94 retired; DD-95, DD-115,
  DC-06 updated; new DD rows for the calls above; FR rows for settings and backup updated.
- Walk the acceptance criteria on the preview and tick what holds; list what doesn't.

## Left to the builder

- Component split (one `cc-settings-*` per section or a route-rendered page), file names, ids of
  the new catalog keys, Thai wording (the user reviews Thai themselves).
- Exact address and sub-header behaviour of `/settings/locations` (follow `sub-header.ts`).
- The no-group filter's shape.
