# cc-tracking — Credit limits and shared limit groups

Date: 2026-09-23
Status: Approved for implementation planning
Follows: `docs/superpowers/specs/2026-09-22-design-system-design.md`

## Problem

The app tracks where a card is, when its statement closes and falls due, and
what has been spent on it. It does not track how much room is left on the card.
That is the question actually asked before a purchase: *I have just paid the
statements — which cards can I spend on right now, and for how much?*

Two facts are missing to answer it. A card has no credit limit stored anywhere,
and some of these cards do not have a limit of their own at all: several cards
draw on one shared pool, so spending on one reduces what is left on the others.

## Goal

Record the credit limit that each card draws on, work out how much of it is
still free, and answer "which cards can I spend on, and what are their closing
and due dates" on the dashboard in one panel.

## Scope

In scope: a `LimitGroup` record with its own storage keys and repository
methods; a `limitGroupId` on `Card`; the computation of outstanding balance and
available credit; a limit-group section on `/cards`; a group selector on the
card form; a limit-group column on the card table; a "can spend now" panel on
the dashboard; the remaining credit shown on the purchase form with a warning
when an amount exceeds it; backup format version 2; the English and Thai
messages for all of it.

Out of scope: partial payments (a payment stays a boolean, with no amount);
interest, fees or minimum payments; per-card limits that differ inside a shared
group; limit history (a group carries one current limit, and editing it does
not preserve the old one); any change to how statements or cycles are computed.

## Decisions

**Available credit counts every unpaid baht.** Available credit is the group's
limit minus every purchase that sits on a statement not yet marked paid —
statements that have closed and are still unpaid, and the open period still
being spent on. This matches how a real card behaves: money spent this cycle
eats the limit immediately, and marking a statement paid returns it. The
alternative — counting only closed unpaid statements — would show a card as
having more room than it does, which is the one direction this feature must
not be wrong in.

Because a payment records no amount, marking a statement paid returns exactly
the sum of its purchases. Paying a different amount in real life is not
representable, which is an accepted limit of the current data model.

**Every card belongs to exactly one limit group.** A group is a separate
record, not a field on the card, and a card that shares its limit with nothing
else is a group of one. One model means one computation: available credit is
always a property of a group, never sometimes of a card and sometimes of a
group.

**This is a breaking change, with no migration.** The project has not shipped,
so backup format version 2 simply rejects version 1 files with the existing
`backup.version` message, and no code is written to convert them. Cards already
in a browser's `localStorage` are the one concession: `limitGroupId` is
optional on the type so those records still read back, but a card without one
is treated as *not yet assigned* everywhere — it is left out of the dashboard
panel, shown as unassigned in the card table, and the card form refuses to save
it until a group is chosen. No startup migration invents a group for it, the
way `migrate-locations.ts` does for locations; the user assigns the handful of
existing cards by hand, once.

**Over-limit purchases are recorded, not blocked.** The app follows what
happened; it does not authorise it. A purchase larger than the remaining credit
saves normally and says so in the confirmation. The stored limit can be stale
or wrong, and a blocked entry would mean a purchase that happened is missing
from the record.

**Groups are managed on `/cards`, not on a page of their own.** They are part
of the card registry and are edited rarely. A section under the card table
avoids a fourth route and a fourth nav entry.

## Data model

```ts
export type LimitGroup = {
  id: string;
  name: string;
  /** Satang, a positive integer, like `Purchase.amount`. */
  limit: number;
};

export type Card = {
  // ...unchanged
  /** Absent only on cards stored before limits existed; the form requires one. */
  limitGroupId?: string;
};
```

A limit is money, so it is stored in satang and goes through the existing
`parseAmount` and `formatAmount`. `parseAmount` already rejects zero and
negative input, which is the right rule for a limit.

## Storage

A new key prefix beside the existing three, following the same percent-encoded
shape so the phase-2 Cloudflare KV layout stays a drop-in:

```
cc:limitgroup:<id>
```

`Repository` gains three methods, implemented in both `InMemoryRepository` and
`LocalStorageRepository` and covered by the shared contract test:

```ts
listLimitGroups(): Promise<LimitGroup[]>;   // sorted by id, like listCards
saveLimitGroup(group: LimitGroup): Promise<void>;
deleteLimitGroup(id: string): Promise<void>;
```

`deleteLimitGroup` does not cascade and does not check for members: the
`/cards` page only offers Delete on a group no card points at. `deleteCard`
keeps its current cascade over purchases and payments and leaves groups alone.

## Backup

`BACKUP_VERSION` becomes `2` and `Backup` gains a `limitGroups: LimitGroup[]`
list, exported after cards. `parseBackup` requires the list to be present and
validates each entry by position, in the style already used for cards: a
missing or empty `id`, a missing or empty `name`, or a `limit` that is not an
integer each throw `backup.limitGroup` naming the index and the problem. A
version 1 file fails the version check that already exists and imports nothing.
`importBackup` writes groups before cards, so a card's `limitGroupId` always
has something to point at.

A backup whose card names a `limitGroupId` that no group in the same file
defines is **not** rejected. Import is additive and a group may already exist
in the target browser; the card table shows the card as unassigned if it turns
out not to.

## Computation

A new module, `src/lib/domain/limit.ts`, owns the arithmetic and produces one
row shape that both the dashboard panel and the purchase form read:

```ts
export type SpendRow = {
  card: Card;
  group: LimitGroup;
  /** Unpaid total across every card in the group. */
  used: number;
  /** `group.limit - used`. Negative when the group is over its limit. */
  available: number;
  /** The open period's dates — the statement a purchase made today lands on. */
  closeDate: PlainDate;
  dueDate: PlainDate;
  /** How many other cards share this group. 0 means the card has it to itself. */
  sharedWith: number;
};

export function outstandingOf(
  card: Card,
  purchases: Purchase[],
  payments: StatementPayment[],
  today: PlainDate,
): number;

export function spendableRows(
  cards: Card[],
  groups: LimitGroup[],
  purchases: Purchase[],
  payments: StatementPayment[],
  today: PlainDate,
): SpendRow[];

/** Cards pointing at no group, or at one that does not exist. */
export function unassignedCards(cards: Card[], groups: LimitGroup[]): Card[];
```

`outstandingOf` walks the same periods `nextActionable` does — from the earliest
period any purchase of that card falls in, through the open period — and sums
the totals of the statements with no payment against them. A card whose
purchases are all paid contributes zero.

`used` sums `outstandingOf` over **every** card in the group, archived cards
included: an archived card's unpaid balance is still real money against the
shared pool. Archived cards do not themselves appear in the dashboard panel,
which lists only cards that are unarchived and pass `canPurchase`.

`closeDate` and `dueDate` come from `openPeriod` plus `closeDateOf`/`dueDateOf`
— deliberately not from `nextActionable`, which answers a different question.
The due list asks *what must I pay next*; this panel asks *if I spend today,
when does that bill close and fall due*. On a card with an overdue statement
the two disagree, and both answers are correct for their own question.

`spendableRows` returns one row per unarchived card that passes `canPurchase`
and has a group, sorted by `available` descending and then by card id. Cards
with no `limitGroupId`, or with one no group matches, are omitted; `unassignedCards` names them for the
line under the table.

This needs every card, archived ones included, and their purchases and
payments. The dashboard currently drops archived cards at fetch time, so it
never loads their purchases; that filter moves out of `fetch` and into the
places that display cards, and `spendableRows` receives the full list.

## Interface

**Dashboard — `cc-spendable` (new).** A panel titled "Can spend now", beside
the due list. One table row per card: card name and id, `available` of `limit`,
the open period's close date, and its due date. Sorted by available credit,
most room first. A row whose group holds more than one card carries the group
name and a "shared with N cards" note; a row negative on `available` gets
`data-state="over"` and the danger colour. When cards exist that have no group
yet, a line under the table says how many and links to `/cards`. When no card
can take a purchase at all, the panel says so rather than rendering an empty
table.

**Dashboard — `cc-quick-add` (changed).** Under the card selector, the selected
card's remaining credit: "Available ฿X of ฿Y", updated on change of selection.
On submit, when the amount exceeds that card's `available`, the purchase is
still dispatched and the confirmation adds a sentence naming the group and the
amount over. The existing close/due confirmation is unchanged.

**Registry — `cc-limit-groups` (new).** A section below the card table: one row
per group with its name, limit, number of cards, amount used and amount
remaining, plus Edit and Delete. Delete is offered only on a group no card
points at. An inline form above the table adds a group and edits the one being
edited, with the same name/limit fields either way. Errors follow the existing
form pattern: a catalog key held in state, resolved in `render`.

**Registry — `cc-card-form` (changed).** A required `<select>` of limit groups,
fed by a new `groups` property. A card being created defaults to no selection
and cannot be saved without one; a card being edited opens on its stored group,
or on no selection if it has none. When no group exists yet, the select renders
disabled with a message pointing at the section below.

**Registry — `cc-card-table` (changed).** A "Limit group" column showing the
group's name, or the unassigned marker for a card with no group.

**Routes.** `index.ts` loads groups alongside cards, purchases and payments,
computes `spendableRows` once per paint, and passes it to both the panel and
the purchase form. `cards.ts` loads groups, handles `save-group` and
`remove-group`, tracks which group is being edited the same way it tracks the
card being edited, and passes the groups to the form, the table and the new
section.

**Styling.** All new rules use `var(--cc-*)` tokens only; over-limit uses the
existing danger tokens. The shared-group marker and the over-limit state are
keyed off classes and `data-` attributes, never off translated text.

**Messages.** Every new string is added to both `en.ts` and `th.ts`; the
coverage test already fails on a key present in one and missing from the other.
Money keeps rendering through `formatAmount` in both languages.

## Testing

- `limit.test.ts`: outstanding across paid, unpaid and open periods; a group of
  one; a shared group where one card's spending reduces another's available
  credit; marking a statement paid returning the credit; a negative
  `available`; archived cards counted in `used` but absent from the rows; a
  card with no group omitted.
- `cc-limit-groups.test.ts`: rendering, add, edit, the delete button's absence
  on a group in use, and the validation errors.
- `cc-spendable.test.ts`: ordering, the shared marker, the over-limit state,
  the unassigned-cards line, and the empty state.
- Updates to `cc-card-form`, `cc-card-table`, `cc-quick-add`, `index`, `cards`,
  `backup`, the storage contract and `transfer` tests for the changed shapes.

## Consequences

Anyone holding a version 1 backup file cannot import it; they re-enter their
cards. Cards already in a browser show as unassigned until edited once. A
shared group's available credit is only as accurate as the payments recorded
against every card in it — one card left unmarked understates the room on all
of them.
