# cc-tracking — Owner on the limit group, and a split, collapsible /cards page

Date: 2026-09-24
Status: Approved for implementation planning
Follows: `docs/superpowers/specs/2026-09-23-credit-limits-design.md`

## Problem

Three things about `/cards` no longer fit how the data is actually shaped.

Owner sits on the card. It should not: the person a card belongs to is a
property of the account behind it, and the account is what a limit group
models. Two cards drawing on one KBank account cannot belong to different
people, yet the current model lets them, and asks for the answer again on every
card added.

Limit groups are one component doing two jobs. `cc-limit-groups` renders an add
form and a table, and edits a group inline inside a table row. Cards were split
into `cc-card-form` and `cc-card-table` and edit through the form; the limit
group section never followed, so the same page teaches two different editing
patterns.

The page is long. Four sections stacked full-height means scrolling past an
empty add form to reach the table that is usually the reason for the visit.

## Goal

Move `owner` from `Card` to `LimitGroup`, split the limit group component into
a form and a table matching the card pair, and make all four sections on
`/cards` collapsible.

## Scope

In scope: `LimitGroup.owner`; removal of `Card.owner`; `ownerOf` retargeted at a
group; backup validation for a group's owner; new `cc-limit-group-form` and
`cc-limit-group-table`, replacing `cc-limit-groups`; a group-editing flow on the
`/cards` route matching the card one; a `<details>` wrapper around each of the
four sections; the English and Thai messages for all of it.

Out of scope: any migration of stored data; a bump of the backup version;
per-card owners of any kind; owner as a filter or a grouping anywhere else in
the app; remembering which sections a reader left open.

## Decisions

**A group's owner is optional, and absence reads as the default.** `LimitGroup`
gains `owner?: Owner`. A group written before the field existed carries nothing
and reads as `KC`, the same way `Card.owner` behaved before it. That one choice
removes the need for a migration entirely: nothing has to be rewritten, no
reset notice has to be shown, and a reader who wants a group marked `NT` or
`RI` edits it once.

The cost is stated plainly: every existing group reads as `KC` until a human
says otherwise, and a group that really belongs to someone else is silently
wrong until then. This was chosen over carrying each card's stored owner up to
its group, which would have needed a conflict rule for groups whose cards
disagree — a rule with no right answer for data that should not have been able
to disagree in the first place.

**`Card.owner` leaves the type, not the stored records.** The field is deleted
from the `Card` type and from the card form; nothing reads it afterwards. A card
already in storage keeps the key physically, and an imported backup written
before this change carries it along into storage untouched. Neither is worth a
migration pass: an unread key costs nothing, and rewriting every card to strip
it risks a write failure for no gain.

**The backup version stays at 2.** An absent `owner` on a group means "nothing
to honour", exactly as an absent `settings` block does. Bumping to 3 would
reject every backup file already sitting in someone's downloads folder, for a
field whose absence is a valid state. Validation follows the rule the card's
owner check already set: absent is fine, present-but-unknown is rejected, since
a file claiming an owner the closed set cannot honour would otherwise be
silently rewritten.

**The card table keeps its Owner column, fed through the group.** The column
resolves the card's limit group and prints that group's owner. A card with no
group prints the same `cards.unassigned` fallback its limit group column
already uses — a card with no account behind it has nobody to attribute it to,
and printing the default `KC` there would be an invention.

**Limit groups edit through the form, like cards.** `cc-limit-groups` is
replaced by `cc-limit-group-form` and `cc-limit-group-table`. The table's Edit
button dispatches an event, the route holds the group being edited, and the
form renders it — the exact shape the card pair already has. Inline row editing
goes away with the old component. One editing pattern on the page is worth more
than the shorter path inline editing gave a single section.

**Each component owns its own `<details>`.** Collapsibility lives in the shadow
root of the four components, following `cc-location-groups`, rather than in the
route's light DOM. The section title moves into the component as the
`<summary>`, which suits the two forms in particular: each already knows whether
it is adding or editing, so it can title itself without the route telling it.

**Tables open, forms closed, not remembered.** A table's `<details open>` is a
static attribute rather than a Lit binding, so a re-render can never reopen a
section the reader just closed. A form's open state is component state: forced
open when an edit target arrives, synced back from the element's own `toggle`
event so a manual close sticks. Nothing is persisted; a reload starts from the
defaults again.

## Model

```ts
export type LimitGroup = {
  id: string;
  name: string;
  /** Satang. Always a positive integer, like `Purchase.amount`. */
  limit: number;
  /** Absent on groups saved before the field existed; see `ownerOf`. */
  owner?: Owner;
};
```

`Card` loses its `owner` field. `#lib/domain/owner` keeps `OWNERS`,
`DEFAULT_OWNER` and `toOwner` unchanged; `ownerOf` takes a `LimitGroup` instead
of a `Card` and keeps its tolerant fallback, since a group from an imported
backup can carry anything.

## Components

**`cc-limit-group-form`** — property `group: LimitGroup | null`. Fields: name,
limit in baht, owner. Submitting dispatches `save-group` carrying
`{ id, name, limit, owner }`, where `id` is the edited group's or a fresh
`crypto.randomUUID()`. A Cancel button dispatches `cancel`. After a create the
form clears through a native `form.reset()`, the trick `cc-card-form` and
`cc-quick-add` already use to get past Lit's dirty check. Validation errors are
held as catalog keys, not resolved sentences, so a language switch re-renders
the error in the new language.

**`cc-limit-group-table`** — properties `groups`, `usage`, `counts`. Columns:
name, owner, limit, cards, used, available, actions. Edit dispatches
`edit-group`, Delete dispatches `remove-group`, and Delete stays suppressed in
favour of the `limits.inUse` count while cards point at the group. An empty list
renders `limits.empty`.

**`cc-limit-groups`** is deleted, with its test file.

**`cc-card-form`** loses the owner select, its `form.error.owner` branch and the
owner half of its post-create reset.

**`cc-card-table`**'s owner cell resolves the card's group and prints
`ownerOf(group)`, or `cards.unassigned` when the card has no group.

## Route

`routes/cards.ts` tracks `editingGroup: LimitGroup | null` beside the existing
`editing`. `edit-group` sets it and repaints; a successful `save-group` clears
it; the form's `cancel` clears it. The page renders four sections in order: card
form, card table, limit group form, limit group table. The route's own `<h2>`
above the card form goes away, since the form now titles itself.

## Messages

Added: `limits.owner`, `limits.column.owner`, `limits.error.owner`,
`limits.edit`, `cards.list`. Removed: `form.owner`, `form.error.owner`.
`cards.column.owner` stays — the card table still has the column. Thai mirrors
every addition; `coverage.test.ts` enforces the parity.

No CSS selector anywhere keys off translated text: the interface ships in
English and Thai, so tests and styles target `data-field`, `data-action` and
classes instead.

## Testing

Test-driven, one behaviour at a time.

- `ownerOf` returns a group's owner, and `KC` for a group carrying nothing or
  carrying something the closed set does not recognise.
- `cc-limit-group-form`: refuses an empty name, refuses an unparseable limit,
  dispatches `save-group` with the owner chosen, mints an id when creating and
  keeps the id when editing, clears after a create, opens itself when a group
  arrives to edit, and stays closed after a manual close.
- `cc-limit-group-table`: renders a row per group with the owner cell,
  dispatches `edit-group` and `remove-group`, suppresses Delete while cards use
  the group, and renders the empty state.
- `cc-card-form`: no owner control is rendered, and a saved card carries no
  owner.
- `cc-card-table`: the owner cell prints the group's owner, and the unassigned
  fallback when the card has no group.
- `routes/cards`: clicking Edit on a group feeds it to the form, and saving
  clears the editing state.
- `transfer`: a group with an unknown owner is rejected; a group with no owner
  is accepted; a card carrying a stale owner still imports.
- The i18n coverage test keeps English and Thai in step.
