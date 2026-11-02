# Redesign phase 7: one card tile, and minor fixes — design

Branch `redesign-phase-7` from `redesign-phase-6` (PR #34); its PR targets `redesign-phase-6`.
The whole stack (#29 to #34 and this phase) still lands on main at once, after the user accepts
this phase.

Mockup the user approved on 2026-11-02 (option B, compact wallet tile):
[`2026-11-02-redesign-phase-7-card-tile-mockup.html`](2026-11-02-redesign-phase-7-card-tile-mockup.html)
(open it in a browser; also published at
https://claude.ai/code/artifact/bcca221d-3237-4597-9780-68e91c597617). Build to it, and check by
screenshot at 390 and 1280, light and dark, English and Thai, before handing over.

## Intent

The user found the card rows on `/list/new` repeated themselves (an *Overdue bill* tag, a percent
and a usage bar for the same thing), and that a clickable card name inside a tickable row invites
mistakes. They asked for one card design shared by every card list, showing only what each page
needs.

## One card tile

Used by Home's *Ready to use*, the new purchase list (`/list/new`) and the Cards page, plus any other
list of cards found while building (search for `cardMini`, `ready-row`, `crow`).

- A rounded tile in its **limit group's colour** (`--cc-group-1..4` background, `-text` for accents).
  The colour says which group the card draws on; cards in one group share it. It never says how
  healthy the card is.
- A **usage rail**: a 4 px line along the tile's bottom edge, the group's used share of its limit.
  Grey (`--cc-text-muted`) under 80%, `--cc-warning` at 80% or more (`HIGH_USAGE`, `WARN_PCT`),
  `--cc-danger` when over the limit (full width). Same rule on every page. The limit group panels
  on Cards use the same rail colours (today their fill is the accent).
- **Line 1:** `id) name` (id muted; name truncates with an ellipsis) and, at the right, a short tag
  that depends on the page (below).
- **Line 2:** the room in a larger figure (as `cards.page` amounts, tabular), and after it the
  limit word from `roomNote` (`#lib/ui/room-note`): *room*, *N% used* (warning colour),
  *over limit* (danger), *credit ฿…*. At the right, a second short fact for the page.
- **Line 3** (list and Cards only): `closes <date> · due <date>`, muted.
- Phone: one column, 8 px gap. Desktop: a grid, `repeat(auto-fill, minmax(255px, 1fr))`.
- About 60 px tall on Home, 76 px on the list and Cards.
- No *Overdue bill* tag on any tile: *Needs you* already says it.
- No *· shared* suffix on tiles: the tile colour already shows which cards share a group.

| Page | Line 1 right | Line 2 | Line 2 right | Line 3 | Tap |
|---|---|---|---|---|---|
| Ready to use | `•••• 4821` (mono, group colour) | room + word; **over the limit: red amount and no word** | `Closes 25 Nov 2026`, or `Due 21 Nov 2026` once closed | — | opens `/card?id=` |
| New purchase list | tick at the far left of line 1; at right the cardholder, or `NT · KC's account` for a Sub card | room + word | — | closes · due | ticks the card; nothing on the tile is a link |
| Cards | `•••• 4821` | room + word | cardholder, `· Sub` for a Sub card | closes · due | opens `/card?id=` |

- A ticked tile on the list gets a 2 px accent outline and a filled tick.
- Over-limit cards stay in *Ready to use* (the user's answer); only the word goes.
- The `/list/new` card-name link added in DD-147 and the row rebuild of DD-150 are replaced: the
  whole tile is the tick target again (a real button or an `aria-pressed` control, no nested
  interactive content). Retire or amend DD-147, DD-150 and DD-145 in the PRD.

## Home on desktop

From 900px Home is two columns, like the prototype's `.homeg` (`1.5fr` and `1fr`): *Ready to use*
on the left, *Needs you* on the right. On a phone *Needs you* stays above *Ready to use*. (Today
Home stacks them at every width.)

## Minor fixes to carry (from the phase 6 rounds)

- Negative amounts use a hyphen (`-฿21,065.00`); decide with the user whether to switch to `−`.
- Delete-all-data and restore count sentences now use singular forms (8f6038a); keep them.
- Acceptance criteria still unticked in `PRD.md`: domain-test expectations changed since main,
  and no test loads data saved by the old version. Settle with the user.

## Docs

- `PRD.md` and `PRD_TH.md` together (new DD rows from DD-151); Thai uses สถานที่ for location.
- `ENDPOINTS.md` only if an address changes (none expected).
- Changelog only when the stack lands.

## Workflow

`shipping-a-change` on this branch (no new worktree: the stack lives in
`.claude/worktrees/redesign-plan`), PR with `--base redesign-phase-6`, preview URL
`https://pr-<n>-cc-tracking.kcinth.workers.dev`. Commits and pushes are signed through 1Password,
which locks often; ask the user to unlock when a commit or push hangs.
