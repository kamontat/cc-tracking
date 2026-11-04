# Limit group colours — design

Work happens on `redesign/refinement` (PR #35, base `redesign/implement`), as phase 7 does: every
change is a commit pushed to #35, following `shipping-a-change` except no new worktree, branch or
PR. Preview: `https://pr-35-cc-tracking.kcinth.workers.dev`. Nothing merges until the user
approves.

## Intent

Phase 7 colours every card tile by its limit group (DD-151), and the user likes it. Today the
colour is the group's place in the stored order, four colours round (`groupTone` in
`src/lib/ui/card-label.ts`, `(index % 4) + 1`). So with more than four groups, the fifth looks like
the first and a tile seems to belong to the wrong group, and adding or deleting a group can
recolour others. The user wants each group to have its own colour, kept with the group: random
when made, changeable by hand, saved in the backup, and shown on the Cards page's group panels too.

## Goals

- A limit group has a stored colour that never changes unless the user changes it.
- A new group gets a random colour that no other group uses yet; once every colour is taken,
  colours may repeat (still random).
- The group sheet lets the user pick the colour from a set of swatches, or press *Random*.
- The colour travels in the backup and comes back on restore.
- Every place that shows a group colour today reads the stored colour instead of the order.
- The Cards page's limit group panels take their group's colour, in a lighter tint than the tiles.

## Non-goals

- No free colour picker (any hex). The user left the choice to the builder; a fixed palette keeps
  text readable in light and dark and keeps every value in `tokens.css` (AGENTS.md).
- No colour per card; a card shows its group's colour.
- No colour in the card form's *Limit group* select.
- No change to the backup version (stays 3).

## Anti-goals

- A colour that makes text unreadable in either theme.
- Groups the user already knows changing colour on the first load after this ships.
- A restore refusing a backup because of a colour.

## Decided

### Palette (builder's call, confirmed by the user's "up to you")

Twelve named colours. Each has four tokens in `src/styles/tokens.css`, light and both dark blocks
(the media query and `[data-theme="dark"]`), as `--cc-group-1..4` do today:

- `--cc-group-<name>`: the tile's background (today's `--cc-group-N`);
- `--cc-group-<name>-text`: the accent (today's `--cc-group-N-text`): the tile's corner and
  border, the chip's digits;
- `--cc-group-<name>-soft`: a lighter tint for the group panels on Cards (new).

Names, in this order (the order is the stored-name list and the swatch order):
`blue, green, purple, orange, teal, rose, amber, indigo, olive, cyan, plum, slate`.

The first four are today's four colours with today's values (`--cc-group-1` is blue,
`-2` green, `-3` purple, `-4` orange), so nothing already on screen changes. The other eight are
new; the builder picks values in the same pastel family, with the accent at least 4.5:1 against
the background and the soft tint, in light and dark (the bar that `tokens.css` comments already
use). `--cc-group-1..4` go away once nothing reads them.

### Data

- `LimitGroup.color?: GroupColor`, where `GroupColor` is the union of the twelve names
  (`src/lib/domain/types.ts`; the names and a `toGroupColor(unknown)` narrowing helper live in a
  new domain module, like `owner.ts`). Optional so a record written before it reads.
- Stored inside the group record (`cc:limitgroup:<id>`); no new key.
- PRD DC-05 and DC-07 gain the field; DC-06 says how restore treats it (below).

### Picking a colour

A pure domain function picks a random colour not in use by the other stored groups, and any
colour at random once all twelve are used. Randomness is injected (a `random: () => number`
parameter defaulting to `Math.random`) so tests are deterministic.

### Existing data: a one-time step

A startup step beside `seedLocations`, `migrateLocations` and `migratePayments` in
`src/lib/ui/page.ts`, recorded under a `cc:migration:` key so it runs once, gives every group
with no colour a colour:

- groups in stored order (DC-14) at index 0 to 3 that have no colour take the colour they show
  today (`blue, green, purple, orange` for index 0, 1, 2, 3), so nothing visible changes;
- every other group without a colour takes a random unused colour.

It is safe to run twice; a failure is logged and the page still renders (a colour is cosmetic,
unlike payments).

### Backup and restore

- Export writes each group as stored, `color` included.
- Restore accepts a group with no `color`, or with a `color` that is not one of the twelve names:
  it is not a problem (`limitGroupProblem` does not reject it). Unlike an unknown `owner` (which
  is refused, since it would lose whose account it is), a colour is cosmetic.
- *Builder's call, from the anti-goal (known groups keep their colour):*
  - **Merge** (`importBackupV3` writes each backup group over the stored one with the same id): a
    backup group with no colour, or an unknown one, keeps the colour already stored for that id.
    A group new to this device has none yet.
  - Then, for **Merge and Replace** alike, every group still without a colour gets one by the
    one-time step's rule: stored-order index 0 to 3 take `blue, green, purple, orange` (the
    colours that file's groups showed in the old app), the rest a random unused colour.
  - One assigning function serves the startup step and restore. Restore runs it itself before it
    finishes, so it does not depend on the startup step (whose `cc:migration:` marker
    `clearAll` removes on Replace); running the step again afterwards changes nothing, since every
    group then has a colour.
  - PRD DC-06 says this.

### Where the colour shows

Everything that reads `groupTone` or styles `[data-g="1".."4"]` today switches to the stored
colour: the card tiles (`card-tile.ts`'s `tileTone`, used by `cc-cards-list.ts`,
`cc-ready-panel.ts` and `cc-ready-picker.ts`), the last-4 chip `.mini` (shared.ts `cardBits`, app.css),
and the card page header (`cc-card-hero.ts`). A card with no group, or a group with no colour
(should not happen after the step), keeps today's neutral look. Stay off translated text in
selectors: key styles off a locale-invariant attribute such as `data-g="teal"`.

### Group panels on Cards

`cc-group-panels.ts`: a panel's background is the group's `-soft` tint and its border a mix of the
accent (as the tiles' border is), the group name in the accent colour. The usage bar keeps
DD-153's grey, amber and red. Hover deepens the border as the tiles do (DD-105: never an
underline).

### Group sheet

`cc-group-sheet.ts` (new and edit): a *Colour* field under the existing fields: the twelve swatches
as a radio group (a `fieldset` with a legend, one control per colour, named by the colour's
translated name for screen readers, e.g. "Teal" / Thai name), the current one marked, and a quiet
*Random* button that picks a colour not used by the other groups. A new group's sheet opens with a
random unused colour already chosen. Saving writes the colour with the rest of the group. English
and Thai strings in `en.ts` and `th.ts`.

## Left to the builder

- The eight new colour values (within the contrast rule above).
- The swatch control's markup and look (radio inputs styled as swatches, or `button[aria-pressed]`
  in a `role="radiogroup"`), keyboard behaviour following the platform's radio pattern.
- Thai colour names (the user reviews Thai wording).
- Test coverage beyond: the picker's randomness rule, the one-time step (index 0-3 mapping, safe to
  run twice), restore with missing and unknown colours, the sheet's swatches and *Random*, the
  tile, chip, hero and panel reading the stored colour.

## Docs

- `PRD.md` and `PRD_TH.md` together: new DD rows after the last one in use; amend DD-117 (panels),
  DD-151 (tile colour source), UI-14 (chip colour), DC-05, DC-06, DC-07.
- `ENDPOINTS.md` only if an address changes (none expected).
- Changelog only when the stack lands.
