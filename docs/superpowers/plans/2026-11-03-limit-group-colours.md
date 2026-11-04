# Limit Group Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each limit group stores its own colour from a 12-colour palette, random on creation,
pickable in the group sheet, kept in backups, and shown on tiles, chips, the card hero and the
Cards group panels.

**Architecture:** A domain module owns the palette names and the pick/assign rules (pure, with
injected randomness). Storage gets a once-only startup step and a restore hook that both call the
same assigner. Styling moves from `data-g="1..4"` to `data-g="<name>"`, which sets three local
custom properties (`--g-bg`, `--g-fg`, `--g-soft`) that every coloured element reads.

**Tech Stack:** TypeScript, Lit 3, Bun test (happy-dom), Biome.

**Spec:** `docs/superpowers/specs/2026-11-03-limit-group-colours-design.md`

## Global Constraints

- Branch `redesign/refinement`, worktree `.claude/worktrees/redesign-plan`; each task is a commit
  pushed to PR #35. No new branch, worktree or PR; nothing merges.
- Before each commit: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run build` all pass. `format` rewrites the phase 7 mockup HTML; restore it with
  `git checkout -- docs/superpowers/specs/2026-11-02-redesign-phase-7-card-tile-mockup.html`.
- Shadow CSS references values only through `var(--cc-*)`; values live in `src/styles/tokens.css`.
- No selector keyed off translated text; user text in both `en.ts` and `th.ts`.
- Palette names, in this order: `blue, green, purple, orange, teal, rose, amber, indigo, olive,
  cyan, plum, slate`. The first four keep today's `--cc-group-1..4` values exactly.
- Accent text ≥ 4.5:1 on its background and on its soft tint, light and dark.
- Backup stays version 3; a colour never makes restore refuse a file.

## Review Focus

- More than 12 groups: picking still returns a colour (random among all) — Task 1 test.
- A Merge restore of a pre-colour backup over groups that have colours: each keeps its colour —
  Task 3 test.
- A Replace restore, then a reload: the startup step runs again (markers cleared) and changes
  nothing — Task 3 test.
- A group whose stored `color` is garbage (hand-edited storage): looks neutral, never throws;
  the startup step does not touch it if the marker is set, so `groupColor` must narrow with
  `toGroupColor` — Task 4 test.
- Editing a group's name or limit in the sheet keeps its colour (the sheet must send the colour
  back, not drop it) — Task 6 test.

---

### Task 1: Palette names and the colour rules

**Files:**
- Create: `src/lib/domain/group-color.ts`, `src/lib/domain/group-color.test.ts`
- Modify: `src/lib/domain/types.ts` (`LimitGroup`)

**Interfaces:**
- Produces:
  - `export const GROUP_COLORS = ["blue", …, "slate"] as const;`
  - `export type GroupColor = (typeof GROUP_COLORS)[number];`
  - `export function toGroupColor(value: unknown): GroupColor | null`
  - `export function pickColor(groups: LimitGroup[], random?: () => number): GroupColor` —
    random among colours no group in `groups` uses; among all 12 when none is free.
  - `export function assignColors(groups: LimitGroup[], random?: () => number): LimitGroup[]` —
    takes groups in stored order, returns only the groups that changed, each with a `color`.
    Index 0–3 without a valid colour take `GROUP_COLORS[index]` **unless another group already
    holds that colour**, in which case they pick like everyone else; others without a valid
    colour take `pickColor` over the groups as assigned so far (so two new groups never draw
    the same free colour).
  - `LimitGroup.color?: GroupColor` (doc comment: absent on groups saved before the field
    existed; see `group-color.ts`).

- [ ] **Step 1: Write the failing tests** in `group-color.test.ts`:
  - `toGroupColor("teal")` is `"teal"`; `toGroupColor("Teal")`, `toGroupColor(3)`,
    `toGroupColor(undefined)` are `null`.
  - `pickColor` with groups using every colour but `"cyan"` returns `"cyan"` for any `random`.
  - `pickColor` with 12 groups using all colours returns `GROUP_COLORS[11]` for
    `random = () => 0.999` and `GROUP_COLORS[0]` for `() => 0`.
  - `assignColors` on five colourless groups with `random = () => 0` returns
    `["blue","green","purple","orange","teal"]` as their colours, in order.
  - `assignColors` where group 0 has none and group 3 already holds `"blue"`: group 0 does not
    get `"blue"`.
  - `assignColors` where every group has a valid colour returns `[]`; a group with
    `color: "nope"` is returned with a valid colour.
- [ ] **Step 2: Run** `bun test src/lib/domain/group-color.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** the module and the type field.
- [ ] **Step 4: Run** the test — PASS; `bun run typecheck` clean.
- [ ] **Step 5: Commit** `feat(cards): limit group colour names and rules`.

### Task 2: Palette tokens

**Files:**
- Modify: `src/styles/tokens.css` (light `:root`, the dark media block, `[data-theme="dark"]`)
- Test: `src/styles/tokens.test.ts` (create if no tokens test exists; else add to it)

**Interfaces:**
- Produces, for every name `n` in `GROUP_COLORS`, in all three blocks: `--cc-group-n`,
  `--cc-group-n-text`, `--cc-group-n-soft`. `--cc-group-1..4` stay until Task 4 removes them.

- [ ] **Step 1: Write the failing test**: read `tokens.css`; split it into the three blocks; for
  each block and each name assert all three properties are defined; assert light `--cc-group-blue`
  is `#e3e9fb` and `--cc-group-blue-text` is `#3552b8` (and green/purple/orange likewise equal
  today's `-2/-3/-4` values, light and dark).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Add the tokens.** Blue/green/purple/orange copy today's values; `-soft` is lighter
  than the background in light (e.g. halfway to `--cc-surface`) and a touch lifted from
  `--cc-surface` in dark. Pick the eight new hues in the same pastel family; check contrast
  (accent vs background and vs soft ≥ 4.5:1) with a quick script, and note it in a comment.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(styles): twelve limit group colours`.

### Task 3: Stored colours — startup step and restore

**Files:**
- Create: `src/lib/storage/assign-group-colors.ts`, `src/lib/storage/assign-group-colors.test.ts`
- Modify: `src/lib/ui/page.ts` (call it after `migratePayments`, in its own try/catch that logs),
  `src/lib/storage/transfer-v3.ts` (`importBackupV3`), `src/lib/storage/main-data.test.ts`

**Interfaces:**
- Consumes: `assignColors`, `toGroupColor` (Task 1).
- Produces:
  - `export const GROUP_COLORS_MIGRATION_KEY = "cc:migration:group-colors";`
  - `export async function assignGroupColors(repo: Repository, random?: () => number): Promise<number>`
    — lists groups, saves each one `assignColors` returns, returns how many it saved.
  - `export async function migrateGroupColors(repo: Repository, storage: Pick<Storage, "getItem" | "setItem">): Promise<number>`
    — returns 0 when the marker is set; otherwise `assignGroupColors`, then sets the marker.
- `importBackupV3` change: before saving each backup group, if its `color` is not a valid
  `GroupColor`, use the stored group's colour (same id) when it has one, else drop the field;
  after everything is written, `await assignGroupColors(repo)`. `replaceWithBackupV3` gets this
  through `importBackupV3`.

- [ ] **Step 1: Write the failing tests** (`assign-group-colors.test.ts`, with
  `InMemoryRepository` / `memoryStorage` from `#lib/storage/contract`):
  - `migrateGroupColors` on five colourless groups gives the first four blue, green, purple,
    orange and sets the marker; a second run returns 0 and changes nothing.
  - Merge (`importBackupV3`) of a backup whose group `g1` has no colour over a stored `g1` with
    `"teal"` leaves `g1` teal; a backup group with `color: "nope"` likewise keeps the stored
    colour; a backup group new to the device ends with a valid colour.
  - Replace (`replaceWithBackupV3`) of a colourless backup with four groups: they end
    blue, green, purple, orange; then `migrateGroupColors` (marker cleared by `clearAll`) returns 0.
  - A backup group with `color: "rose"` keeps rose on both Merge and Replace.
  - The export (`exportBackupV3` or whatever `transfer-v3.ts` names it) of a stored group with
    `"plum"` writes `color: "plum"`.
  - In `main-data.test.ts`, add `migrateGroupColors` to `open()` and compare groups ignoring
    `color` (strip it), and assert every group now has a valid colour and the first group
    (stored order) is blue.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the module, the `importBackupV3` change and the `page.ts` call.
  Check `limitGroupProblem` (`transfer.ts`) still accepts any `color` (add a test there that
  `{…, color: "nope"}` has no problem).
- [ ] **Step 4: Run** `bun test src/lib/storage` — PASS.
- [ ] **Step 5: Commit** `feat(storage): every limit group keeps a colour, restores included`.

### Task 4: Read the stored colour everywhere

**Files:**
- Modify: `src/lib/ui/card-label.ts` (`groupTone` → `groupColor`), `src/styles/shared.ts`
  (new `groupInk` css; `cardBits` `.mini`), `src/styles/app.css` (`.mini` and a light-DOM copy of
  the per-name rules), `src/components/card-tile.ts` (`tileTone` and `.tile[data-g]`),
  `src/components/cc-card-hero.ts`, every component that styles `[data-g]` in its shadow root
  (add `groupInk` to its `styles`), `src/styles/tokens.css` (drop `--cc-group-1..4`)
- Test: `src/lib/ui/card-label.test.ts`, `src/components/cc-card-hero.test.ts`,
  `src/components/cc-cards-list.test.ts`, `src/components/cc-ready-panel.test.ts`,
  `src/components/ready-test-rows.ts`

**Interfaces:**
- Consumes: `GROUP_COLORS`, `toGroupColor`.
- Produces:
  - `export function groupColor(card: Card | undefined, groups: LimitGroup[]): GroupColor | null`
    — the card's group's `toGroupColor(group.color)`; null for no group, a missing group or a
    bad colour.
  - `data-g="<name>"` on `.mini`, `.tile`, `.hero` (and Task 5's `.gpanel`).
  - `export const groupInk: CSSResult` in `shared.ts`, built from `GROUP_COLORS` with
    `unsafeCSS`: for each name, `[data-g="n"] { --g-bg: var(--cc-group-n); --g-fg: var(--cc-group-n-text); --g-soft: var(--cc-group-n-soft); }`.
  - Coloured elements read only `--g-bg`, `--g-fg`, `--g-soft` (e.g. `.mini[data-g] { color: var(--g-fg); background: var(--g-bg); }`;
    the tile sets `--tile-bg: var(--g-bg); --tile-fg: var(--g-fg)` under `.tile[data-g]`).

- [ ] **Step 1: Write the failing tests:**
  - `groupColor` returns the group's colour; null with no `limitGroupId`, a deleted group, or
    `color: "nope"`.
  - Update fixtures to give groups colours (`testGroup` gets `color: "teal"`; Cards list fixtures
    `g1` `"blue"`, `g2` `"rose"`) and change the `dataset.g` assertions from `"1"`/`"2"` to the
    names; a group with `color: "nope"` gives a tile with no `data-g`.
  - Hero: `data-g` is the group's colour name.
  - A style test: `groupInk.cssText` has a rule for each of the 12 names; `app.css` has
    `[data-g="<name>"]` for each of the 12 names; no stylesheet in `src/` still mentions
    `--cc-group-1` … `--cc-group-4` or `data-g="1"`.
- [ ] **Step 2: Run** the touched tests — FAIL.
- [ ] **Step 3: Implement**; remove `groupTone` and the old tokens.
- [ ] **Step 4: Run** the full suite — PASS. Screenshot Home, `/list/new`, Cards and a card page
  at 390 and 1280, light and dark, with 6 groups: no two of the first six alike.
- [ ] **Step 5: Commit** `feat(cards): tiles, chips and the card header wear the group's own colour`.

### Task 5: Group panels on Cards in the group's soft tint

**Files:**
- Modify: `src/components/cc-group-panels.ts`; Test: `src/components/cc-group-panels.test.ts`

**Interfaces:**
- Consumes: `groupInk`, `toGroupColor`.
- Produces: `.gpanel[data-g]` with `background: var(--g-soft)`, border
  `color-mix(in oklab, var(--g-fg) 18%, transparent)`, `.gname` `color: var(--g-fg)`; hover
  deepens the border (55%), no underline; the bar keeps DD-153's colours.

- [ ] **Step 1: Write the failing test:** a panel for a group with `color: "teal"` has
  `data-g="teal"`; one with no or a bad colour has no `data-g`; the component's styles contain
  `.gpanel[data-g]` with `var(--g-soft)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; screenshot Cards
  1280 light and dark.
- [ ] **Step 5: Commit** `feat(cards): limit group panels in their group's light colour`.

### Task 6: Colour field in the group sheet

**Files:**
- Modify: `src/components/cc-group-sheet.ts`, `src/routes/cards.ts` (pass `.groups`),
  `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`; Test: `src/components/cc-group-sheet.test.ts`,
  `src/routes/cards.test.ts`

**Interfaces:**
- Consumes: `GROUP_COLORS`, `pickColor`, `toGroupColor`, `groupInk`.
- Produces:
  - `@property({ attribute: false }) groups: LimitGroup[] = []` (every stored group; the sheet
    leaves out its own when judging what is free).
  - `@property({ attribute: false }) random: () => number = Math.random` (tests inject).
  - `@state() private color: GroupColor`, filled in `willUpdate` alongside the other fields:
    the group's valid colour, else `pickColor(otherGroups, this.random)`.
  - `save-group`'s `detail` includes `color`.
  - Strings: `limits.color` ("Colour" / "สี"), `limits.color.random` ("Random" / "สุ่ม"), and
    `color.<name>` for each of the 12 names, English and Thai.
  - Markup: `<fieldset class="swatches"><legend>` with one `button[data-color][aria-pressed]`
    per colour (`data-g` on it for its fill, `aria-label` the translated name), and a
    `data-variant="quiet"` `data-action="random-color"` button. (Same pattern as the sheet's
    owner buttons.)

- [ ] **Step 1: Write the failing tests:**
  - A new group's sheet with `groups` using every colour but `"cyan"` has `"cyan"` pressed.
  - An existing group with `"rose"` opens with rose pressed; changing the name and saving emits
    `color: "rose"`.
  - Pressing the teal swatch then saving emits `color: "teal"`.
  - *Random* with `random = () => 0` and other groups using blue picks `"green"`.
  - Each swatch's `aria-label` is the colour name; in Thai, the Thai name.
  - `cards.test.ts`: adding a group through the sheet stores a valid colour.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; screenshot the
  sheet 390 and 1280, light and dark, English and Thai.
- [ ] **Step 5: Commit** `feat(cards): choose a limit group's colour, or roll a random one`.

### Task 7: Docs and hand-over

**Files:** `PRD.md`, `PRD_TH.md`

- [ ] **Step 1:** New DD rows after DD-156 (both files, same ids): the stored colour and palette;
  the startup step and restore rules; the sheet's colour field; the panels' soft tint. Dated
  notes on DD-117, DD-151, UI-14, DC-05, DC-06, DC-07 (and DC-02/DC-03 for the new
  `cc:migration:group-colors` key if those list migration keys). Thai uses สถานที่.
- [ ] **Step 2:** `bun run test`; commit `docs(prd): limit group colours`; push; wait for the
  `deploy` check on PR #35; hand the user the preview URL.
