# Credit Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the credit limit each card draws on — possibly shared with other cards — work out how much of it is free, and answer "which cards can I spend on right now, and until when" on the dashboard.

**Architecture:** A `LimitGroup` is a stored record of its own (`cc:limitgroup:<id>`); every card points at one through `Card.limitGroupId`. A new pure module, `src/lib/domain/limit.ts`, sums each card's unpaid statements, pools them per group, and produces one `SpendRow` per spendable card that both the dashboard panel and the purchase form read. No component computes money of its own.

**Tech Stack:** Bun, Lit 3.3.3, TypeScript, Biome, happy-dom + `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-23-credit-limits-design.md`

## Global Constraints

- **Money is satang.** A limit is a positive integer in satang, like `Purchase.amount`. Parse user input with `parseAmount` from `#lib/domain/money` (it already rejects zero, negatives and junk) and render with `formatAmount`. Never construct a baht string by hand.
- **No literal values in shadow CSS.** Every rule in a component's `css` block references values only through `var(--cc-*)`. No hex codes, no `px`/`rem` literals for spacing, type size or radius.
- **Button variants are `quiet`, `danger`, or no attribute.** Do not invent a fourth.
- **No selector keys off translated text.** The app ships in English and Thai; use classes or locale-invariant `data-` attributes.
- **Every user-visible string lives in both catalogs.** Add the key to `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts` in the same step; `src/lib/i18n/coverage.test.ts` fails on prose left in a template, and `Catalog` makes a key missing from `th` a type error.
- **Components carry catalog keys in state, not resolved sentences**, so a language switch re-renders text already on screen. Follow the `errorKey` pattern in `cc-card-form`.
- **`#styles/*` maps to `.ts` only.** Route modules import `tokens.css` and `app.css` by relative path.
- **Every task ends green:** `bun test`, `bun run typecheck`, and `bun run check` all pass before the commit. Run `bun run format` before committing.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/domain/types.ts` (modify) | Adds `LimitGroup`; adds `limitGroupId?` to `Card`. |
| `src/lib/domain/limit.ts` (create) | All limit arithmetic: outstanding per card, usage per group, `SpendRow`, unassigned cards. |
| `src/lib/storage/repository.ts` (modify) | Three `LimitGroup` methods on the interface and on `InMemoryRepository`. |
| `src/lib/storage/local.ts` (modify) | The `cc:limitgroup:` key prefix and the same three methods. |
| `src/lib/storage/contract.ts` (modify) | `sampleLimitGroup` plus the contract tests both stores must pass. |
| `src/lib/storage/transfer.ts` (modify) | Backup version 2: export, validate and import `limitGroups`. |
| `src/components/cc-limit-groups.ts` (create) | The limit-group table and its add/edit form, on `/cards`. |
| `src/components/cc-spendable.ts` (create) | The dashboard's "Can spend now" panel. |
| `src/components/cc-card-form.ts` (modify) | The required limit-group selector. |
| `src/components/cc-card-table.ts` (modify) | The limit-group column. |
| `src/components/cc-quick-add.ts` (modify) | Remaining credit under the card selector. |
| `src/routes/cards.ts` (modify) | Loads groups, handles save/delete, computes usage and card counts. |
| `src/routes/index.ts` (modify) | Loads groups and all cards, computes rows, wires the panel and the over-limit confirmation. |
| `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts` (modify) | Every new string, added in the task that renders it. |

---

### Task 1: The limit domain

**Files:**
- Modify: `src/lib/domain/types.ts:15-25`
- Create: `src/lib/domain/limit.ts`
- Test: `src/lib/domain/limit.test.ts`

**Interfaces:**
- Consumes: `buildStatement`, `openPeriod` from `#lib/domain/statement`; `closeDateOf`, `dueDateOf`, `periodOfPurchase` from `#lib/domain/cycle`; `addPeriods`, `comparePeriods` from `#lib/domain/date`; `canPurchase` from `#lib/domain/card`.
- Produces: `LimitGroup`, `Card.limitGroupId`, and from `#lib/domain/limit`: `SpendRow`, `outstandingOf(card, purchases, payments, today): number`, `groupUsage(group, cards, purchases, payments, today): number`, `spendableRows(cards, groups, purchases, payments, today): SpendRow[]`, `unassignedCards(cards, groups): Card[]`.

- [ ] **Step 1: Add the types**

In `src/lib/domain/types.ts`, add `limitGroupId` to `Card` right after `canPurchase`, and the new record below `Card`:

```ts
export type Card = {
	id: string;
	name: string;
	last4: string;
	location: Location;
	cycle: CycleRule;
	comment?: string;
	archived: boolean;
	/** Absent on cards saved before the flag existed; see `canPurchase` in `#lib/domain/card`. */
	canPurchase?: boolean;
	/** Absent only on cards stored before limits existed; the card form requires one. */
	limitGroupId?: string;
};

/** A pool of credit. A card that shares its limit with nothing else still has one of these. */
export type LimitGroup = {
	id: string;
	name: string;
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	limit: number;
};
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/domain/limit.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
	groupUsage,
	outstandingOf,
	spendableRows,
	unassignedCards,
} from "#lib/domain/limit";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";

const TODAY = "2026-09-23";

const card = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	canPurchase: true,
	limitGroupId: "pool",
	...overrides,
});

const group = (overrides: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...overrides,
});

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-09-20",
	amount: 10_000,
	note: "fuel",
	...overrides,
});

const payment = (overrides: Partial<StatementPayment> = {}): StatementPayment => ({
	cardId: "kbank",
	period: "2026-08",
	paidAt: "2026-09-02",
	closeDate: "2026-08-18",
	dueDate: "2026-09-02",
	...overrides,
});

test("a card with nothing spent owes nothing", () => {
	expect(outstandingOf(card(), [], [], TODAY)).toBe(0);
});

test("a purchase in the open period counts against the limit straight away", () => {
	// Closes on the 18th, so 20 Sep belongs to the October statement -- still open.
	expect(outstandingOf(card(), [purchase()], [], TODAY)).toBe(10_000);
});

test("a closed statement that is not paid still counts", () => {
	const old = purchase({ id: "p0", date: "2026-08-10", amount: 25_000 });
	expect(outstandingOf(card(), [old], [], TODAY)).toBe(25_000);
});

test("marking the statement paid returns its credit", () => {
	const old = purchase({ id: "p0", date: "2026-08-10", amount: 25_000 });
	expect(outstandingOf(card(), [old], [payment()], TODAY)).toBe(0);
});

test("another card's purchases are not this card's debt", () => {
	const theirs = purchase({ id: "p9", cardId: "scb", amount: 90_000 });
	expect(outstandingOf(card(), [theirs], [], TODAY)).toBe(0);
});

test("usage pools every card in the group, archived ones included", () => {
	const cards = [
		card(),
		card({ id: "scb", archived: true }),
		card({ id: "ttb", limitGroupId: "other" }),
	];
	const purchases = [
		purchase({ id: "a", cardId: "kbank", amount: 10_000 }),
		purchase({ id: "b", cardId: "scb", amount: 5_000 }),
		purchase({ id: "c", cardId: "ttb", amount: 99_000 }),
	];
	expect(groupUsage(group(), cards, purchases, [], TODAY)).toBe(15_000);
});

test("spending on one card reduces what is available on the card sharing its group", () => {
	const cards = [card(), card({ id: "scb" })];
	const purchases = [purchase({ id: "a", cardId: "kbank", amount: 200_000 })];
	const rows = spendableRows(cards, [group()], purchases, [], TODAY);

	expect(rows.map((row) => row.card.id)).toEqual(["kbank", "scb"]);
	expect(rows.map((row) => row.available)).toEqual([300_000, 300_000]);
	expect(rows.map((row) => row.sharedWith)).toEqual([1, 1]);
});

test("a row carries the open period's close and due dates", () => {
	const [row] = spendableRows([card()], [group()], [], [], TODAY);
	// 23 Sep is past the 18th, so today's purchase lands on the October statement.
	expect(row?.closeDate).toBe("2026-10-18");
	expect(row?.dueDate).toBe("2026-11-02");
});

test("rows come back with the most room first", () => {
	const cards = [card(), card({ id: "scb", limitGroupId: "small" })];
	const groups = [group(), group({ id: "small", name: "SCB", limit: 100_000 })];
	const rows = spendableRows(cards, groups, [], [], TODAY);
	expect(rows.map((row) => row.card.id)).toEqual(["kbank", "scb"]);
});

test("available goes negative when the group is over its limit", () => {
	const purchases = [purchase({ amount: 600_000 })];
	const [row] = spendableRows([card()], [group()], purchases, [], TODAY);
	expect(row?.available).toBe(-100_000);
});

test("archived cards and cards closed to purchases are not rows", () => {
	const cards = [
		card({ id: "archived", archived: true }),
		card({ id: "no-purchases", canPurchase: false }),
	];
	expect(spendableRows(cards, [group()], [], [], TODAY)).toEqual([]);
});

test("a card whose group is missing is not a row", () => {
	const cards = [card({ id: "nogroup", limitGroupId: undefined })];
	expect(spendableRows(cards, [group()], [], [], TODAY)).toEqual([]);
});

test("unassigned names the unarchived cards with no group of their own", () => {
	const cards = [
		card(),
		card({ id: "nogroup", limitGroupId: undefined }),
		card({ id: "ghost", limitGroupId: "deleted" }),
		card({ id: "old", limitGroupId: undefined, archived: true }),
	];
	expect(unassignedCards(cards, [group()]).map((c) => c.id)).toEqual([
		"nogroup",
		"ghost",
	]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/lib/domain/limit.test.ts`
Expected: FAIL — `Cannot find module '#lib/domain/limit'`.

- [ ] **Step 4: Write the module**

Create `src/lib/domain/limit.ts`:

```ts
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addPeriods, comparePeriods } from "#lib/domain/date";
import { buildStatement, openPeriod } from "#lib/domain/statement";
import type {
	Card,
	LimitGroup,
	Period,
	PlainDate,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";

/** One spendable card, with the room left on the pool it draws from. */
export type SpendRow = {
	card: Card;
	group: LimitGroup;
	/** Unpaid total across every card in the group. */
	used: number;
	/** `group.limit - used`. Negative when the group is over its limit. */
	available: number;
	/** The open period's dates: the statement a purchase made today lands on. */
	closeDate: PlainDate;
	dueDate: PlainDate;
	/** How many other cards share this group. 0 means the card has it to itself. */
	sharedWith: number;
};

/**
 * What this card still owes: every purchase on a statement with no payment against it.
 *
 * The open period counts. Money spent this cycle is gone from the limit the moment it is
 * spent, and only comes back when that statement is marked paid -- which is also the only
 * way credit is ever returned, since a payment records no amount of its own.
 */
export function outstandingOf(
	card: Card,
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): number {
	const mine = purchases.filter((purchase) => purchase.cardId === card.id);
	const periods = mine.map((purchase) =>
		periodOfPurchase(card.cycle, purchase.date),
	);
	const open = openPeriod(card, today);
	const sorted = [...periods].sort(comparePeriods);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];

	// Imported data can hold a future-dated purchase the form would refuse, so walk past the
	// open period when one exists rather than silently dropping what it owes.
	let period: Period =
		first && comparePeriods(first, open) < 0 ? first : open;
	const end: Period = last && comparePeriods(last, open) > 0 ? last : open;

	let total = 0;
	while (comparePeriods(period, end) <= 0) {
		const paid = payments.some(
			(payment) => payment.cardId === card.id && payment.period === period,
		);
		if (!paid) total += buildStatement(card, period, mine).total;
		period = addPeriods(period, 1);
	}
	return total;
}

/** What the whole pool owes. Archived cards count: their unpaid balance is still real money. */
export function groupUsage(
	group: LimitGroup,
	cards: Card[],
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): number {
	return cards
		.filter((card) => card.limitGroupId === group.id)
		.reduce(
			(total, card) => total + outstandingOf(card, purchases, payments, today),
			0,
		);
}

/**
 * One row per card a purchase may be entered against, most room first.
 *
 * Dates come from the open period, not from `nextActionable`: the due list answers "what must
 * I pay next", this answers "if I spend today, when does that bill close and fall due". On a
 * card with an overdue statement the two disagree, and both are right for their own question.
 */
export function spendableRows(
	cards: Card[],
	groups: LimitGroup[],
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): SpendRow[] {
	const members = new Map<string, number>();
	for (const card of cards) {
		if (!card.limitGroupId) continue;
		members.set(card.limitGroupId, (members.get(card.limitGroupId) ?? 0) + 1);
	}
	const usage = new Map(
		groups.map((group) => [
			group.id,
			groupUsage(group, cards, purchases, payments, today),
		]),
	);

	return cards
		.filter((card) => !card.archived && canPurchase(card))
		.flatMap((card) => {
			const group = groups.find(({ id }) => id === card.limitGroupId);
			if (!group) return [];
			const used = usage.get(group.id) ?? 0;
			const period = openPeriod(card, today);
			return [
				{
					card,
					group,
					used,
					available: group.limit - used,
					closeDate: closeDateOf(card.cycle, period),
					dueDate: dueDateOf(card.cycle, period),
					sharedWith: (members.get(group.id) ?? 1) - 1,
				},
			];
		})
		.sort(
			(a, b) =>
				b.available - a.available || (a.card.id < b.card.id ? -1 : 1),
		);
}

/** Unarchived cards pointing at no group, or at one that does not exist. */
export function unassignedCards(cards: Card[], groups: LimitGroup[]): Card[] {
	return cards.filter(
		(card) =>
			!card.archived && !groups.some(({ id }) => id === card.limitGroupId),
	);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/lib/domain/limit.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all green. Nothing else reads the new type yet.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/lib/domain/types.ts src/lib/domain/limit.ts src/lib/domain/limit.test.ts
git commit -m "$(cat <<'EOF'
feat: work out what is left on a card's credit limit

A LimitGroup is a pool of credit one or more cards draw on. What a card
owes is every purchase on a statement not yet marked paid, the open
period included, so spending shows up at once and paying returns it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Storing limit groups

**Files:**
- Modify: `src/lib/storage/repository.ts:1-29` (interface), `:34-102` (`InMemoryRepository`)
- Modify: `src/lib/storage/local.ts:1-14` (keys), and the class body
- Test: `src/lib/storage/contract.ts` (shared contract, run by both `local.test.ts` and `memory.test.ts`)

**Interfaces:**
- Consumes: `LimitGroup` from Task 1.
- Produces: `Repository.listLimitGroups(): Promise<LimitGroup[]>` (sorted by id), `Repository.saveLimitGroup(group: LimitGroup): Promise<void>`, `Repository.deleteLimitGroup(id: string): Promise<void>`; `limitGroupKey(id: string): string` from `#lib/storage/local`; `sampleLimitGroup(overrides?: Partial<LimitGroup>): LimitGroup` from `#lib/storage/contract`.

- [ ] **Step 1: Write the failing contract tests**

In `src/lib/storage/contract.ts`, import `LimitGroup` in the existing type import, add the factory beside the others:

```ts
export const sampleLimitGroup = (
	overrides: Partial<LimitGroup> = {},
): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...overrides,
});
```

and add these tests inside `repositoryContract`'s `describe`:

```ts
test("returns no limit groups before anything is saved", async () => {
	expect(await repo.listLimitGroups()).toEqual([]);
});

test("saves and reads a limit group back whole", async () => {
	const group = sampleLimitGroup();
	await repo.saveLimitGroup(group);
	expect(await repo.listLimitGroups()).toEqual([group]);
});

test("saving the same limit group id replaces it", async () => {
	await repo.saveLimitGroup(sampleLimitGroup());
	await repo.saveLimitGroup(sampleLimitGroup({ limit: 750_000 }));
	const groups = await repo.listLimitGroups();
	expect(groups).toHaveLength(1);
	expect(groups[0]?.limit).toBe(750_000);
});

test("lists limit groups sorted by id", async () => {
	await repo.saveLimitGroup(sampleLimitGroup({ id: "scb" }));
	await repo.saveLimitGroup(sampleLimitGroup({ id: "kbank" }));
	expect((await repo.listLimitGroups()).map((g) => g.id)).toEqual([
		"kbank",
		"scb",
	]);
});

test("deletes a limit group, and deleting an absent one is not an error", async () => {
	await repo.saveLimitGroup(sampleLimitGroup());
	await repo.deleteLimitGroup("pool");
	await repo.deleteLimitGroup("pool");
	expect(await repo.listLimitGroups()).toEqual([]);
});

test("deleting a card leaves its limit group alone", async () => {
	await repo.saveLimitGroup(sampleLimitGroup());
	await repo.saveCard(sampleCard({ limitGroupId: "pool" }));
	await repo.deleteCard("kbank");
	expect(await repo.listLimitGroups()).toHaveLength(1);
});

test("returned limit groups are copies, not live references", async () => {
	await repo.saveLimitGroup(sampleLimitGroup());
	const [group] = await repo.listLimitGroups();
	if (group) group.name = "mutated";
	expect((await repo.listLimitGroups())[0]?.name).toBe("KBank account");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/storage`
Expected: FAIL — `repo.listLimitGroups is not a function` (and a typecheck error on the missing methods).

- [ ] **Step 3: Extend the interface and the in-memory store**

In `src/lib/storage/repository.ts`, import `LimitGroup`, add to the interface after the payment methods:

```ts
	listLimitGroups(): Promise<LimitGroup[]>;
	saveLimitGroup(group: LimitGroup): Promise<void>;
	deleteLimitGroup(id: string): Promise<void>;
```

and to `InMemoryRepository`:

```ts
	private limitGroups = new Map<string, LimitGroup>();

	async listLimitGroups(): Promise<LimitGroup[]> {
		return [...this.limitGroups.values()]
			.map(clone)
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async saveLimitGroup(group: LimitGroup): Promise<void> {
		this.limitGroups.set(group.id, clone(group));
	}

	async deleteLimitGroup(id: string): Promise<void> {
		this.limitGroups.delete(id);
	}
```

- [ ] **Step 4: Extend the localStorage store**

In `src/lib/storage/local.ts`, add the prefix and key beside the existing three, and the methods to the class:

```ts
const LIMIT_GROUP = `${PREFIX}limitgroup:`;

export const limitGroupKey = (id: string): string =>
	`${LIMIT_GROUP}${encodeURIComponent(id)}`;
```

```ts
	async listLimitGroups(): Promise<LimitGroup[]> {
		return this.readAll<LimitGroup>(LIMIT_GROUP);
	}

	async saveLimitGroup(group: LimitGroup): Promise<void> {
		this.write(limitGroupKey(group.id), group);
	}

	async deleteLimitGroup(id: string): Promise<void> {
		this.storage.removeItem(limitGroupKey(id));
	}
```

`readAll` already sorts by key, and the key is the percent-encoded id, so the sort order matches `InMemoryRepository`'s. `deleteCard` is left exactly as it is: the cascade covers purchases and payments, never groups.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/lib/storage && bun run typecheck`
Expected: PASS for both stores.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/lib/storage
git commit -m "$(cat <<'EOF'
feat: store limit groups under cc:limitgroup

Same percent-encoded key shape as the other three records, so the
phase-2 KV layout stays a drop-in. Deleting a card does not delete the
group it drew on: other cards may still share it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backup format version 2

**Files:**
- Modify: `src/lib/storage/transfer.ts:8-16` (type), `:77-88` (card validation), `:115-174` (parse and import)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `LimitGroup` (Task 1), `listLimitGroups`/`saveLimitGroup` (Task 2).
- Produces: `BACKUP_VERSION = 2`; `Backup.limitGroups: LimitGroup[]`; message keys `backup.limitGroup`, `backup.problem.badLimit`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/transfer.test.ts` (follow the file's existing helpers for building a backup object):

```ts
test("exports limit groups alongside the cards", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank", limit: 500_000 });
	const backup = await exportBackup(repo);
	expect(backup.version).toBe(2);
	expect(backup.limitGroups).toEqual([
		{ id: "pool", name: "KBank", limit: 500_000 },
	]);
});

test("rejects a version 1 file", () => {
	const text = JSON.stringify({
		version: 1,
		exportedAt: "2026-09-23T00:00:00.000Z",
		cards: [],
		purchases: [],
		payments: [],
	});
	expect(() => parseBackup(text)).toThrow(MessageError);
});

test("rejects a file with no limitGroups list", () => {
	const text = JSON.stringify({
		version: 2,
		exportedAt: "2026-09-23T00:00:00.000Z",
		cards: [],
		purchases: [],
		payments: [],
	});
	expect(() => parseBackup(text)).toThrow(MessageError);
});

test("names the limit group that is wrong, by position", () => {
	const text = JSON.stringify({
		version: 2,
		exportedAt: "2026-09-23T00:00:00.000Z",
		limitGroups: [{ id: "pool", name: "KBank", limit: "lots" }],
		cards: [],
		purchases: [],
		payments: [],
	});
	try {
		parseBackup(text);
		throw new Error("expected parseBackup to throw");
	} catch (failure) {
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.limitGroup");
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badLimit",
		});
	}
});

test("imports limit groups before the cards that point at them", async () => {
	const repo = new InMemoryRepository();
	const written: string[] = [];
	const spy = {
		...repo,
		saveLimitGroup: async (group: LimitGroup) => {
			written.push("group");
			return repo.saveLimitGroup(group);
		},
		saveCard: async (card: Card) => {
			written.push("card");
			return repo.saveCard(card);
		},
	} as unknown as Repository;

	await importBackup(spy, {
		version: 2,
		exportedAt: "2026-09-23T00:00:00.000Z",
		limitGroups: [{ id: "pool", name: "KBank", limit: 500_000 }],
		cards: [sampleCard({ limitGroupId: "pool" })],
		purchases: [],
		payments: [],
	});

	expect(written).toEqual(["group", "card"]);
});

test("accepts a card pointing at a group the file does not define", () => {
	const text = JSON.stringify({
		version: 2,
		exportedAt: "2026-09-23T00:00:00.000Z",
		limitGroups: [],
		cards: [sampleCard({ limitGroupId: "elsewhere" })],
		purchases: [],
		payments: [],
	});
	expect(parseBackup(text).cards).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: FAIL — version is 1, `limitGroups` is missing from the export.

- [ ] **Step 3: Change the format**

In `src/lib/storage/transfer.ts`:

```ts
export const BACKUP_VERSION = 2;

export type Backup = {
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	limitGroups: LimitGroup[];
	cards: Card[];
	purchases: Purchase[];
	payments: StatementPayment[];
};
```

`exportBackup` reads `await repo.listLimitGroups()` and returns it in the object. Add the validator beside the others:

```ts
/** `null` when the limit group is well-formed, otherwise which catalog key names what's wrong. */
function limitGroupProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name")))
		return "backup.problem.missingName";
	if (!isInteger(prop(value, "limit"))) return "backup.problem.badLimit";
	return null;
}
```

In `parseBackup`, read `limitGroups` alongside the other three lists, include it in the `isList` guard, and validate it in its own loop **before** the cards loop:

```ts
	for (const [index, group] of limitGroups.entries()) {
		const problem = limitGroupProblem(group);
		if (problem) {
			throw new MessageError("backup.limitGroup", { index: index + 1, problem });
		}
	}
```

In `importBackup`, write groups first:

```ts
	for (const group of backup.limitGroups) await repo.saveLimitGroup(group);
	for (const card of backup.cards) await repo.saveCard(card);
```

A card naming a group the file does not define is deliberately accepted: import is additive, and the group may already exist in the target browser.

- [ ] **Step 4: Add the messages**

`src/lib/i18n/en.ts`, beside the other backup keys:

```ts
	"backup.limitGroup": "That backup's limit group #{index} {problem}.",
	"backup.problem.badLimit": "has a limit that is not a whole number of satang",
```

`src/lib/i18n/th.ts`:

```ts
	"backup.limitGroup": "กลุ่มวงเงินที่ {index} ในไฟล์สำรอง{problem}",
	"backup.problem.badLimit": "มีวงเงินที่ไม่ใช่จำนวนเต็มสตางค์",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test && bun run typecheck && bun run check`
Expected: PASS. `src/routes/backup.test.ts` may hold version-1 fixtures — update each to version 2 with a `limitGroups: []` list.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/lib/storage/transfer.ts src/lib/storage/transfer.test.ts src/routes/backup.test.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat!: backup version 2 carries limit groups

Groups are written before cards, so a card always has its group to point
at. A version 1 file is rejected by the check that already exists;
nothing converts one, the app has not shipped.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The limit-group section component

**Files:**
- Create: `src/components/cc-limit-groups.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/components/cc-limit-groups.test.ts`

**Interfaces:**
- Consumes: `LimitGroup` (Task 1); `base`, `controls`, `dataTable` from `#styles/shared`; `formatAmount`, `parseAmount` from `#lib/domain/money`.
- Produces: the `<cc-limit-groups>` element with properties `groups: LimitGroup[]`, `usage: Record<string, number>`, `counts: Record<string, number>`, and events `save-group` (detail `LimitGroup`) and `remove-group` (detail `string`, the id).

- [ ] **Step 1: Write the failing tests**

Create `src/components/cc-limit-groups.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-limit-groups";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000 },
	{ id: "solo", name: "SCB", limit: 100_000 },
];

const mount = async (overrides: Partial<Record<string, unknown>> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-groups");
	element.groups = groups;
	element.usage = { pool: 200_000, solo: 0 };
	element.counts = { pool: 2, solo: 1 };
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const field = (element: HTMLElement, name: string) => {
	const input = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!input) throw new Error(`no field named ${name}`);
	return input;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const input = field(element, name);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("shows each group with what it has used and what is left", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("฿2,000.00");
	expect(text).toContain("฿3,000.00");
});

test("emits a new group with a generated id", async () => {
	const element = await mount();
	let detail: LimitGroup | undefined;
	element.addEventListener("save-group", (event) => {
		detail = (event as CustomEvent<LimitGroup>).detail;
	});

	fill(element, "groupName", "TTB account");
	fill(element, "groupLimit", "3000");
	submit(element);

	expect(detail?.name).toBe("TTB account");
	expect(detail?.limit).toBe(300_000);
	expect(detail?.id).toBeTruthy();
	expect(detail?.id).not.toBe("pool");
});

test("editing a group keeps its id", async () => {
	const element = await mount();
	let detail: LimitGroup | undefined;
	element.addEventListener("save-group", (event) => {
		detail = (event as CustomEvent<LimitGroup>).detail;
	});

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="edit"][data-id="pool"]')
		?.click();
	await element.updateComplete;

	expect(field(element, "groupName").value).toBe("KBank account");
	fill(element, "groupLimit", "7000");
	submit(element);

	expect(detail).toEqual({ id: "pool", name: "KBank account", limit: 700_000 });
});

test("refuses a group with no name", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save-group", () => {
		emitted = true;
	});

	fill(element, "groupLimit", "3000");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("name");
});

test("refuses a limit that is not an amount", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save-group", () => {
		emitted = true;
	});

	fill(element, "groupName", "TTB");
	fill(element, "groupLimit", "lots");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("limit");
});

test("offers Delete only on a group no card uses", async () => {
	const element = await mount();
	expect(
		element.shadowRoot?.querySelector('[data-action="remove"][data-id="pool"]'),
	).toBeNull();

	const free = await mount({ counts: { pool: 2, solo: 0 } });
	let removed = "";
	free.addEventListener("remove-group", (event) => {
		removed = (event as CustomEvent<string>).detail;
	});
	free.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="remove"][data-id="solo"]')
		?.click();
	expect(removed).toBe("solo");
});

test("says so when there is no group yet", async () => {
	const element = await mount({ groups: [], usage: {}, counts: {} });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No limit group yet");
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	const element = await mount();
	fill(element, "groupLimit", "3000");
	submit(element);
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"Give the limit group a name.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ตั้งชื่อกลุ่มวงเงิน");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/cc-limit-groups.test.ts`
Expected: FAIL — the element is undefined, so `element.shadowRoot` is null.

- [ ] **Step 3: Add the messages**

`src/lib/i18n/en.ts`:

```ts
	"limits.title": "Limit groups",
	"limits.explain":
		"A group is a pool of credit. Cards that share a limit share a group.",
	"limits.empty": "No limit group yet. Add one before adding a card.",
	"limits.column.name": "Name",
	"limits.column.limit": "Limit",
	"limits.column.cards": "Cards",
	"limits.column.used": "Used",
	"limits.column.available": "Available",
	"limits.add": "Add limit group",
	"limits.save": "Save changes",
	"limits.editing": "Editing {name}",
	"limits.name": "Name",
	"limits.namePlaceholder": "KBank account",
	"limits.limit": "Limit (THB)",
	"limits.limitPlaceholder": "300000",
	"limits.inUse": "{count} cards use this group",
	"limits.error.name": "Give the limit group a name.",
	"limits.error.limit": "Enter the limit in baht, like 300000.",
```

`src/lib/i18n/th.ts`:

```ts
	"limits.title": "กลุ่มวงเงิน",
	"limits.explain": "กลุ่มคือวงเงินหนึ่งก้อน บัตรที่ใช้วงเงินร่วมกันอยู่กลุ่มเดียวกัน",
	"limits.empty": "ยังไม่มีกลุ่มวงเงิน สร้างก่อนเพิ่มบัตร",
	"limits.column.name": "ชื่อ",
	"limits.column.limit": "วงเงิน",
	"limits.column.cards": "บัตร",
	"limits.column.used": "ใช้ไป",
	"limits.column.available": "คงเหลือ",
	"limits.add": "เพิ่มกลุ่มวงเงิน",
	"limits.save": "บันทึกการแก้ไข",
	"limits.editing": "กำลังแก้ {name}",
	"limits.name": "ชื่อ",
	"limits.namePlaceholder": "บัญชี KBank",
	"limits.limit": "วงเงิน (บาท)",
	"limits.limitPlaceholder": "300000",
	"limits.inUse": "มีบัตรใช้กลุ่มนี้ {count} ใบ",
	"limits.error.name": "ตั้งชื่อกลุ่มวงเงิน",
	"limits.error.limit": "กรอกวงเงินเป็นบาท เช่น 300000",
```

- [ ] **Step 4: Write the component**

Create `src/components/cc-limit-groups.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmount, parseAmount } from "#lib/domain/money";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-limit-groups")
export class CcLimitGroups extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			form {
				display: flex;
				flex-wrap: wrap;
				align-items: flex-end;
				gap: var(--cc-space-3);
				margin-block-end: var(--cc-space-4);
			}

			.actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			td[data-state="over"] {
				font-weight: 600;
				color: var(--cc-danger);
			}
		`,
	];

	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Satang already spent against each group id, from `groupUsage`. */
	@property({ attribute: false }) usage: Record<string, number> = {};
	/** How many cards point at each group id. */
	@property({ attribute: false }) counts: Record<string, number> = {};

	@state() private editingId: string | null = null;
	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private get editing(): LimitGroup | null {
		return this.groups.find(({ id }) => id === this.editingId) ?? null;
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const name = this.value("groupName");
		if (!name) {
			this.errorKey = "limits.error.name";
			return;
		}
		let limit: number;
		try {
			limit = parseAmount(this.value("groupLimit"));
		} catch {
			this.errorKey = "limits.error.limit";
			return;
		}
		this.errorKey = "";
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: { id: this.editingId ?? crypto.randomUUID(), name, limit },
			}),
		);
		this.editingId = null;
		// Bindings re-evaluate to the same "" they last committed after an add, so Lit's dirty
		// check skips the DOM write and the typed text stays put. A native reset bypasses it,
		// the same trick cc-quick-add uses for its date field.
		this.renderRoot.querySelector("form")?.reset();
	}

	override render() {
		const editing = this.editing;
		return html`
			<h2>${t("limits.title")}</h2>
			<p><small>${t("limits.explain")}</small></p>
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				${editing ? html`<p>${t("limits.editing", { name: editing.name })}</p>` : nothing}
				<label>${t("limits.name")} <input name="groupName" .value=${editing?.name ?? ""}
					placeholder=${t("limits.namePlaceholder")} required /></label>
				<label>${t("limits.limit")} <input name="groupLimit" inputmode="decimal"
					.value=${editing ? String(editing.limit / 100) : ""}
					placeholder=${t("limits.limitPlaceholder")} required /></label>
				<div class="actions" row>
					<button type="submit">${editing ? t("limits.save") : t("limits.add")}</button>
					${
						editing
							? html`<button type="button" data-variant="quiet" @click=${() => {
									this.editingId = null;
									this.errorKey = "";
								}}>${t("common.cancel")}</button>`
							: nothing
					}
				</div>
			</form>
			${this.groups.length === 0 ? html`<p>${t("limits.empty")}</p>` : this.table()}
		`;
	}

	private table() {
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("limits.column.name")}</th>
						<th data-numeric>${t("limits.column.limit")}</th>
						<th data-numeric>${t("limits.column.cards")}</th>
						<th data-numeric>${t("limits.column.used")}</th>
						<th data-numeric>${t("limits.column.available")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.groups.map((group) => {
						const used = this.usage[group.id] ?? 0;
						const available = group.limit - used;
						const count = this.counts[group.id] ?? 0;
						return html`
							<tr>
								<td data-label=${t("limits.column.name")}>${group.name}</td>
								<td data-label=${t("limits.column.limit")} data-numeric>${formatAmount(group.limit)}</td>
								<td data-label=${t("limits.column.cards")} data-numeric>${count}</td>
								<td data-label=${t("limits.column.used")} data-numeric>${formatAmount(used)}</td>
								<td data-label=${t("limits.column.available")} data-numeric
									data-state=${available < 0 ? "over" : "within"}>${formatAmount(available)}</td>
								<td>
									<div class="actions" row>
										<button data-variant="quiet" data-action="edit" data-id=${group.id}
											@click=${() => {
												this.editingId = group.id;
												this.errorKey = "";
											}}>${t("common.edit")}</button>
										${
											count === 0
												? html`<button data-variant="danger" data-action="remove" data-id=${group.id}
													@click=${() =>
														this.dispatchEvent(
															new CustomEvent<string>("remove-group", {
																detail: group.id,
															}),
														)}>${t("common.delete")}</button>`
												: html`<small>${t("limits.inUse", { count })}</small>`
										}
									</div>
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-groups": CcLimitGroups;
	}
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/components/cc-limit-groups.test.ts && bun run typecheck && bun run check`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/components/cc-limit-groups.ts src/components/cc-limit-groups.test.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat: a limit-group table with its own add and edit form

Delete is offered only on a group no card points at, so a card can never
be left pointing at a group that is gone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Limit groups on the card registry page

**Files:**
- Modify: `src/routes/cards.ts:1-116`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/routes/cards.test.ts`

**Interfaces:**
- Consumes: `<cc-limit-groups>` and its two events (Task 4); `groupUsage` (Task 1); `listLimitGroups`/`saveLimitGroup`/`deleteLimitGroup` (Task 2).
- Produces: `/cards` renders `<cc-limit-groups>` below the card table, with usage and card counts computed from stored data.

- [ ] **Step 1: Write the failing tests**

Add to `src/routes/cards.test.ts`:

```ts
test("shows the limit groups with what each has used", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 500_000 });
	await repo.saveCard({ ...card, limitGroupId: "pool" });
	await repo.savePurchase({
		id: "p1",
		cardId: card.id,
		date: today(),
		amount: 120_000,
		note: "fuel",
	});

	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	const section = root.querySelector("cc-limit-groups");
	expect(section?.groups).toHaveLength(1);
	expect(section?.usage).toEqual({ pool: 120_000 });
	expect(section?.counts).toEqual({ pool: 1 });
});

test("saves a new limit group", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root.querySelector("cc-limit-groups")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "pool", name: "KBank account", limit: 500_000 },
		}),
	);
	await settle();

	expect(await repo.listLimitGroups()).toEqual([
		{ id: "pool", name: "KBank account", limit: 500_000 },
	]);
});

test("deletes a limit group", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 500_000 });
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root.querySelector("cc-limit-groups")?.dispatchEvent(
		new CustomEvent("remove-group", { detail: "pool" }),
	);
	await settle();

	expect(await repo.listLimitGroups()).toEqual([]);
});

test("says so when a limit group cannot be saved", async () => {
	class Rejecting extends InMemoryRepository {
		override saveLimitGroup(): Promise<void> {
			return Promise.reject(new Error("disk is full"));
		}
	}
	const root = mount();
	renderCardsPage(new Rejecting(), root);
	await settle();

	root.querySelector("cc-limit-groups")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "pool", name: "KBank account", limit: 500_000 },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/routes/cards.test.ts`
Expected: FAIL — `root.querySelector("cc-limit-groups")` is null.

- [ ] **Step 3: Wire the page**

In `src/routes/cards.ts`: import the component (`import "#components/cc-limit-groups";`), `groupUsage` from `#lib/domain/limit`, `today` from `#lib/domain/date`, and `LimitGroup` from `#lib/domain/types`. Add the state and handlers:

```ts
	let groups: LimitGroup[] = [];
	const now = today();
```

In `fetch`, after the cards are read:

```ts
			groups = await repo.listLimitGroups();
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
```

with `let purchases: Purchase[] = []` and `let payments: StatementPayment[] = []` declared beside `cards`. The existing per-card purchase count is then `purchases.filter((p) => p.cardId === card.id).length`, computed in the same pass, so the page does not read purchases twice:

```ts
			counts = Object.fromEntries(
				cards.map((card) => [
					card.id,
					purchases.filter((purchase) => purchase.cardId === card.id).length,
				]),
			);
```

Handlers:

```ts
	const onSaveGroup = (event: CustomEvent<LimitGroup>) =>
		state.guard(() => repo.saveLimitGroup(event.detail), "cards.error.saveGroup");

	const onRemoveGroup = (event: CustomEvent<string>) =>
		state.guard(
			() => repo.deleteLimitGroup(event.detail),
			"cards.error.deleteGroup",
		);
```

Derived values for the section:

```ts
	const usage = (): Record<string, number> =>
		Object.fromEntries(
			groups.map((group) => [
				group.id,
				groupUsage(group, cards, purchases, payments, now),
			]),
		);

	const groupCounts = (): Record<string, number> =>
		Object.fromEntries(
			groups.map((group) => [
				group.id,
				cards.filter((card) => card.limitGroupId === group.id).length,
			]),
		);
```

And in `paint`, below the card table article:

```ts
					<article>
						<cc-limit-groups
							.groups=${groups}
							.usage=${usage()}
							.counts=${groupCounts()}
							@save-group=${onSaveGroup}
							@remove-group=${onRemoveGroup}
						></cc-limit-groups>
					</article>
```

- [ ] **Step 4: Add the messages**

`src/lib/i18n/en.ts`:

```ts
	"cards.error.saveGroup": "Could not save that limit group.",
	"cards.error.deleteGroup": "Could not delete that limit group.",
```

`src/lib/i18n/th.ts`:

```ts
	"cards.error.saveGroup": "บันทึกกลุ่มวงเงินไม่สำเร็จ",
	"cards.error.deleteGroup": "ลบกลุ่มวงเงินไม่สำเร็จ",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/routes/cards.test.ts && bun test && bun run typecheck && bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/routes/cards.ts src/routes/cards.test.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat: manage limit groups on the card registry page

The registry now reads purchases and payments once, and uses them for
both the per-card purchase count and each group's usage.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Choosing a card's limit group

**Files:**
- Modify: `src/components/cc-card-form.ts:48-77`, `:87-132`, `:179-251`
- Modify: `src/components/cc-card-table.ts:46-118`
- Modify: `src/routes/cards.ts` (pass `groups` to both)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/components/cc-card-form.test.ts`, `src/components/cc-card-table.test.ts`

**Interfaces:**
- Consumes: `LimitGroup` (Task 1); `groups` loaded by the page (Task 5).
- Produces: `<cc-card-form>.groups: LimitGroup[]`, whose `save` event detail now carries `limitGroupId`; `<cc-card-table>.groups: LimitGroup[]`.

- [ ] **Step 1: Write the failing tests**

In `src/components/cc-card-form.test.ts`, widen the existing `mount` helper to take the groups, and add the fixture and a filler for the always-required fields:

```ts
const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000 },
];

const mount = async (card: Card | null = null, limitGroups = groups) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-form");
	element.card = card;
	element.groups = limitGroups;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

/** Every field a valid offset-rule card needs, except the limit group. */
const fillCard = (element: HTMLElement) => {
	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "location", "krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
};
```

`fill` already works on a `<select>` — the existing location tests use it — so no second helper is needed. Then add:

```ts
test("refuses to save a card with no limit group", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save", () => {
		emitted = true;
	});

	fillCard(element);
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("limit group");
});

test("carries the chosen limit group in the saved card", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fillCard(element);
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved?.limitGroupId).toBe("pool");
});

test("opens an existing card on its stored group", async () => {
	const card: Card = {
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
		limitGroupId: "pool",
	};
	const element = await mount(card);
	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="limitGroupId"]')
			?.value,
	).toBe("pool");
});

test("disables the selector and says where to go when no group exists", async () => {
	const element = await mount(null, []);
	const field = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="limitGroupId"]',
	);
	expect(field?.disabled).toBe(true);
	expect(element.shadowRoot?.textContent).toContain("Add a limit group");
});
```

In `src/components/cc-card-table.test.ts`, widen its `mount` the same way and add the test:

```ts
const mount = async (
	cards: Card[],
	purchaseCounts: Record<string, number> = {},
	groups: LimitGroup[] = [],
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-table");
	element.cards = cards;
	element.purchaseCounts = purchaseCounts;
	element.groups = groups;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("names the limit group each card draws on", async () => {
	const element = await mount(
		[{ ...card, limitGroupId: "pool" }, { ...card, id: "scb" }],
		{},
		[{ id: "pool", name: "KBank account", limit: 500_000 }],
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("Not assigned");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/cc-card-form.test.ts src/components/cc-card-table.test.ts`
Expected: FAIL — there is no `limitGroupId` field and no group column.

- [ ] **Step 3: Add the messages**

`src/lib/i18n/en.ts`:

```ts
	"form.limitGroup": "Limit group",
	"form.limitGroupNone": "Choose a limit group",
	"form.limitGroupEmpty": "Add a limit group in the section below first.",
	"form.error.limitGroup": "Choose the limit group this card draws on.",
	"cards.column.limitGroup": "Limit group",
	"cards.unassigned": "Not assigned",
```

`src/lib/i18n/th.ts`:

```ts
	"form.limitGroup": "กลุ่มวงเงิน",
	"form.limitGroupNone": "เลือกกลุ่มวงเงิน",
	"form.limitGroupEmpty": "สร้างกลุ่มวงเงินในส่วนด้านล่างก่อน",
	"form.error.limitGroup": "เลือกกลุ่มวงเงินที่บัตรใบนี้ใช้",
	"cards.column.limitGroup": "กลุ่มวงเงิน",
	"cards.unassigned": "ยังไม่ผูกกลุ่ม",
```

- [ ] **Step 4: Extend the card form**

In `src/components/cc-card-form.ts`, add the property:

```ts
	@property({ attribute: false }) groups: LimitGroup[] = [];
```

In `updated`, set the select the same way the location select is set — a `<select>` bound by property needs an explicit write when the edit target changes:

```ts
		const limitGroup = this.renderRoot.querySelector<HTMLSelectElement>(
			'[name="limitGroupId"]',
		);
		if (limitGroup) limitGroup.value = this.card?.limitGroupId ?? "";
```

In `onSubmit`, validate before building the card:

```ts
		const limitGroupId = this.value("limitGroupId");
		if (!limitGroupId) return this.fail("form.error.limitGroup");
```

and include `limitGroupId` in the `Card` literal. In the create-reset block, reset the select to `""`:

```ts
		const limitGroupSelect =
			form?.querySelector<HTMLSelectElement>('[name="limitGroupId"]');
		if (limitGroupSelect) limitGroupSelect.value = "";
```

Render it after the location field:

```ts
				<label>
					${t("form.limitGroup")}
					<select name="limitGroupId" required ?disabled=${this.groups.length === 0}>
						<option value="">${t("form.limitGroupNone")}</option>
						${this.groups.map(
							(group) => html`<option value=${group.id}>${group.name}</option>`,
						)}
					</select>
					${this.groups.length === 0 ? html`<small>${t("form.limitGroupEmpty")}</small>` : nothing}
				</label>
```

- [ ] **Step 5: Extend the card table**

In `src/components/cc-card-table.ts`, add `@property({ attribute: false }) groups: LimitGroup[] = [];`, a `<th>${t("cards.column.limitGroup")}</th>` after the location column, and the cell:

```ts
									<td data-field="limit-group" data-label=${t("cards.column.limitGroup")}>
										${
											this.groups.find(({ id }) => id === card.limitGroupId)?.name ??
											t("cards.unassigned")
										}
									</td>
```

- [ ] **Step 6: Pass the groups from the page**

In `src/routes/cards.ts`, add `.groups=${groups}` to both `<cc-card-form>` and `<cc-card-table>`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test && bun run typecheck && bun run check`
Expected: PASS. Every existing card-form test that saves a card now has to select a group: add `fill(element, "limitGroupId", "pool");` beside the other `fill` calls, and add `limitGroupId: "pool"` to each `toEqual` expectation of a saved card.

- [ ] **Step 8: Commit**

```bash
bun run format
git add src/components/cc-card-form.ts src/components/cc-card-form.test.ts src/components/cc-card-table.ts src/components/cc-card-table.test.ts src/routes/cards.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat: every card names the limit group it draws on

The selector is required, so a card saved from now on always has one. A
card stored before limits existed reads back as unassigned until it is
edited once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The "Can spend now" panel

**Files:**
- Create: `src/components/cc-spendable.ts`
- Modify: `src/routes/index.ts:23-123`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/components/cc-spendable.test.ts`, `src/routes/index.test.ts`

**Interfaces:**
- Consumes: `SpendRow`, `spendableRows`, `unassignedCards` (Task 1); `displayDate` from `#lib/domain/date`; `formatAmount` from `#lib/domain/money`.
- Produces: `<cc-spendable>` with properties `rows: SpendRow[]` and `unassigned: number`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/cc-spendable.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-spendable";
import type { SpendRow } from "#lib/domain/limit";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card = (id: string): Card => ({
	id,
	name: `${id} card`,
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	canPurchase: true,
	limitGroupId: "pool",
});

const row = (overrides: Partial<SpendRow> = {}): SpendRow => ({
	card: card("kbank"),
	group: { id: "pool", name: "KBank account", limit: 500_000 },
	used: 200_000,
	available: 300_000,
	closeDate: "2026-10-18",
	dueDate: "2026-11-02",
	sharedWith: 0,
	...overrides,
});

const mount = async (overrides: Record<string, unknown> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-spendable");
	element.rows = [row()];
	element.unassigned = 0;
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows what is left, the limit it comes from, and both dates", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("฿3,000.00");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("18 Oct 2026");
	expect(text).toContain("02 Nov 2026");
});

test("marks a shared group and says how many other cards hold it", async () => {
	const element = await mount({ rows: [row({ sharedWith: 2 })] });
	const shared = element.shadowRoot?.querySelector('[data-shared="true"]');
	expect(shared).not.toBeNull();
	expect(element.shadowRoot?.textContent).toContain("KBank account");
	expect(element.shadowRoot?.textContent).toContain("2");
});

test("marks a row that is over its limit", async () => {
	const element = await mount({ rows: [row({ available: -50_000 })] });
	const cell = element.shadowRoot?.querySelector('[data-state="over"]');
	expect(cell?.textContent).toContain("-฿500.00");
});

test("counts the cards with no limit group and points at the registry", async () => {
	const element = await mount({ unassigned: 2 });
	const notice = element.shadowRoot?.querySelector('[data-testid="unassigned"]');
	expect(notice?.textContent).toContain("2");
	expect(notice?.querySelector("a")?.getAttribute("href")).toBe("/cards");
});

test("says so when no card can take a purchase", async () => {
	const element = await mount({ rows: [] });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No card here can take");
});

test("renders in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Can spend now");
	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("รูดได้ตอนนี้");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/components/cc-spendable.test.ts`
Expected: FAIL — `Cannot find module '#components/cc-spendable'`.

- [ ] **Step 3: Add the messages**

`src/lib/i18n/en.ts`:

```ts
	"spendable.title": "Can spend now",
	"spendable.column.card": "Card",
	"spendable.column.available": "Available",
	"spendable.column.closes": "Closes",
	"spendable.column.due": "Due",
	"spendable.of": "of {limit}",
	"spendable.shared": "{name}, shared with {count} more",
	"spendable.empty": "No card here can take a purchase.",
	"spendable.unassigned": "{count} cards have no limit group yet.",
	"spendable.unassignedAction": "Assign them",
```

`src/lib/i18n/th.ts`:

```ts
	"spendable.title": "รูดได้ตอนนี้",
	"spendable.column.card": "บัตร",
	"spendable.column.available": "คงเหลือ",
	"spendable.column.closes": "ปิดรอบ",
	"spendable.column.due": "ครบกำหนด",
	"spendable.of": "จาก {limit}",
	"spendable.shared": "{name} ใช้ร่วมกับอีก {count} ใบ",
	"spendable.empty": "ไม่มีบัตรที่รูดได้",
	"spendable.unassigned": "มีบัตร {count} ใบยังไม่ผูกกลุ่มวงเงิน",
	"spendable.unassignedAction": "ไปผูกกลุ่ม",
```

- [ ] **Step 4: Write the component**

Create `src/components/cc-spendable.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import type { SpendRow } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { base, dataTable } from "#styles/shared";

@customElement("cc-spendable")
export class CcSpendable extends LitElement {
	static override styles = [
		base,
		dataTable,
		css`
			.card-name {
				display: block;
				font-weight: 600;
			}

			.group {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.limit {
				display: block;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			td[data-state="over"] {
				font-weight: 600;
				color: var(--cc-danger);
			}

			[data-testid="unassigned"] {
				margin-block-start: var(--cc-space-3);
				font-size: var(--cc-text-sm);
			}
		`,
	];

	@property({ attribute: false }) rows: SpendRow[] = [];
	/** How many unarchived cards point at no limit group. */
	@property({ type: Number }) unassigned = 0;

	constructor() {
		super();
		new LocaleController(this);
	}

	private notice() {
		if (this.unassigned === 0) return nothing;
		return html`
			<p data-testid="unassigned">
				${t("spendable.unassigned", { count: this.unassigned })}
				<a href="/cards">${t("spendable.unassignedAction")}</a>
			</p>
		`;
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<p>${t("spendable.empty")}</p>${this.notice()}`;
		}
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("spendable.column.card")}</th>
						<th data-numeric>${t("spendable.column.available")}</th>
						<th>${t("spendable.column.closes")}</th>
						<th>${t("spendable.column.due")}</th>
					</tr>
				</thead>
				<tbody>
					${this.rows.map(
						(row) => html`
							<tr data-shared=${row.sharedWith > 0 ? "true" : "false"}>
								<td data-label=${t("spendable.column.card")}>
									<a class="card-name" href=${`/card?id=${encodeURIComponent(row.card.id)}`}>${row.card.name}</a>
									${
										row.sharedWith > 0
											? html`<small class="group">${t("spendable.shared", {
													name: row.group.name,
													count: row.sharedWith,
												})}</small>`
											: nothing
									}
								</td>
								<td data-label=${t("spendable.column.available")} data-numeric
									data-state=${row.available < 0 ? "over" : "within"}>
									${formatAmount(row.available)}
									<small class="limit">${t("spendable.of", { limit: formatAmount(row.group.limit) })}</small>
								</td>
								<td class="date" data-label=${t("spendable.column.closes")}>${displayDate(row.closeDate, getLocale())}</td>
								<td class="date" data-label=${t("spendable.column.due")}>${displayDate(row.dueDate, getLocale())}</td>
							</tr>
						`,
					)}
				</tbody>
			</table>
			${this.notice()}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-spendable": CcSpendable;
	}
}
```

- [ ] **Step 5: Write the failing route test**

Add to `src/routes/index.test.ts`:

```ts
test("the panel lists spendable cards and counts those with no group", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 500_000 });
	await repo.saveCard({ ...quickAddCard, limitGroupId: "pool" });
	await repo.saveCard({ ...quickAddCard, id: "nogroup", limitGroupId: undefined });

	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const panel = root.querySelector("cc-spendable");
	expect(panel?.rows.map((row) => row.card.id)).toEqual([quickAddCard.id]);
	expect(panel?.unassigned).toBe(1);
});

test("an archived card's unpaid balance still holds down the group it shares", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 500_000 });
	await repo.saveCard({ ...quickAddCard, limitGroupId: "pool" });
	await repo.saveCard({
		...quickAddCard,
		id: "retired",
		archived: true,
		limitGroupId: "pool",
	});
	await repo.savePurchase({
		id: "p1",
		cardId: "retired",
		date: today(),
		amount: 150_000,
		note: "old",
	});

	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const panel = root.querySelector("cc-spendable");
	expect(panel?.rows).toHaveLength(1);
	expect(panel?.rows[0]?.available).toBe(350_000);
});
```

- [ ] **Step 6: Wire the dashboard**

In `src/routes/index.ts`: import `#components/cc-spendable`, `spendableRows` and `unassignedCards` from `#lib/domain/limit`, and `LimitGroup` from `#lib/domain/types`.

The archived filter moves out of `fetch` — the panel needs archived cards' purchases to price a shared pool correctly:

```ts
		fetch: async () => {
			cards = await repo.listCards();
			groups = await repo.listLimitGroups();
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
		},
```

and every place that displays cards filters for itself:

```ts
	/** Cards the page shows. Archived ones are still loaded: they weigh on a shared limit. */
	const visible = (): Card[] => cards.filter((card) => !card.archived);

	const rows = (): DueRow[] =>
		visible().map((card) => ({
			card,
			statement: nextActionable(card, purchases, payments, now),
		}));
```

`<cc-quick-add>` takes `.cards=${visible().filter(canPurchase)}`. Add the panel as its own article above the split, and pass it the rows:

```ts
					<article>
						<h2>${t("spendable.title")}</h2>
						<cc-spendable
							.rows=${spendableRows(cards, groups, purchases, payments, now)}
							.unassigned=${unassignedCards(cards, groups).length}
						></cc-spendable>
					</article>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test && bun run typecheck && bun run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
bun run format
git add src/components/cc-spendable.ts src/components/cc-spendable.test.ts src/routes/index.ts src/routes/index.test.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat: say which cards can be spent on, and for how much

The panel answers the question asked right after paying a statement: how
much room is left, and when does a purchase made today close and fall
due. The dashboard now loads archived cards too -- their unpaid balance
still weighs on a shared limit -- and filters them out at the point of
display instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Remaining credit on the purchase form

**Files:**
- Modify: `src/components/cc-quick-add.ts:45-131`
- Modify: `src/routes/index.ts` (the confirmation sentence)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Test: `src/components/cc-quick-add.test.ts`, `src/routes/index.test.ts`

**Interfaces:**
- Consumes: `SpendRow` (Task 1), the rows already computed by the dashboard (Task 7).
- Produces: `<cc-quick-add>.rows: SpendRow[]`; the dashboard's confirmation gains an over-limit sentence.

- [ ] **Step 1: Write the failing tests**

In `src/components/cc-quick-add.test.ts`, add the fixtures beside the existing `cards` array:

```ts
const otherCard: Card = {
	id: "scb",
	name: "SCB Mastercard",
	last4: "9002",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	canPurchase: true,
	limitGroupId: "solo",
};

const spendRow: SpendRow = {
	card: cards[0] as Card,
	group: { id: "pool", name: "KBank account", limit: 500_000 },
	used: 200_000,
	available: 300_000,
	closeDate: "2026-10-18",
	dueDate: "2026-11-02",
	sharedWith: 0,
};

const otherRow: SpendRow = {
	...spendRow,
	card: otherCard,
	group: { id: "solo", name: "SCB", limit: 100_000 },
	used: 0,
	available: 100_000,
};
```

and the tests:

```ts
test("shows what is left on the selected card", async () => {
	const element = await mount();
	element.rows = [spendRow];
	await element.updateComplete;
	const note = element.shadowRoot?.querySelector('[data-testid="available"]');
	expect(note?.textContent).toContain("฿3,000.00");
	expect(note?.textContent).toContain("฿5,000.00");
});

test("follows the selection to another card's remaining credit", async () => {
	const element = await mount();
	element.cards = [cards[0] as Card, otherCard];
	element.rows = [spendRow, otherRow];
	await element.updateComplete;

	const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="cardId"]',
	);
	if (!select) throw new Error("no card select");
	select.value = "scb";
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector('[data-testid="available"]')?.textContent,
	).toContain("฿1,000.00");
});

test("says nothing about credit when the card has no limit group", async () => {
	const element = await mount();
	element.rows = [];
	await element.updateComplete;
	expect(
		element.shadowRoot?.querySelector('[data-testid="available"]'),
	).toBeNull();
});
```

Add to `src/routes/index.test.ts`:

```ts
test("confirms a purchase that goes over the limit, and still saves it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 50_000 });
	await repo.saveCard({ ...quickAddCard, limitGroupId: "pool" });

	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	root.querySelector("cc-quick-add")?.dispatchEvent(
		new CustomEvent("add", {
			detail: {
				cardId: quickAddCard.id,
				date: today(),
				amount: 80_000,
				note: "laptop",
			},
		}),
	);
	await settle();

	expect(await repo.listPurchases(quickAddCard.id)).toHaveLength(1);
	const answer = root.querySelector("cc-quick-add")?.answer ?? "";
	expect(answer).toContain("฿300.00");
	expect(answer).toContain("KBank account");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/cc-quick-add.test.ts src/routes/index.test.ts`
Expected: FAIL — no `rows` property, no over-limit sentence.

- [ ] **Step 3: Add the messages**

`src/lib/i18n/en.ts`:

```ts
	"quickAdd.available": "Available {available} of {limit}",
	"dashboard.answerOver": "That is {over} over the {name} limit.",
```

`src/lib/i18n/th.ts`:

```ts
	"quickAdd.available": "คงเหลือ {available} จาก {limit}",
	"dashboard.answerOver": "ยอดนี้เกินวงเงิน {name} อยู่ {over}",
```

- [ ] **Step 4: Show the remaining credit in the form**

In `src/components/cc-quick-add.ts`, add the property and the selection state:

```ts
	/** Rows for the cards above, from `spendableRows`. A card with no row shows no credit. */
	@property({ attribute: false }) rows: SpendRow[] = [];

	@state() private selectedId = "";
```

```ts
	private get selected(): SpendRow | null {
		const id = this.selectedId || this.cards[0]?.id;
		return this.rows.find((row) => row.card.id === id) ?? null;
	}
```

Render, under the card `<label>`:

```ts
					${
						this.selected
							? html`<p data-testid="available"><small>${t("quickAdd.available", {
									available: formatAmount(this.selected.available),
									limit: formatAmount(this.selected.group.limit),
								})}</small></p>`
							: nothing
					}
```

and bind the select: `@change=${(event: Event) => { this.selectedId = (event.target as HTMLSelectElement).value; }}`.

`onSubmit` already calls `form.reset()`, which puts the select back on its first option, so clear the tracked selection there too — otherwise the note keeps describing the card that was just used rather than the one now selected:

```ts
		this.selectedId = "";
```

Import `SpendRow` from `#lib/domain/limit` and `formatAmount` from `#lib/domain/money`.

- [ ] **Step 5: Add the over-limit sentence on the dashboard**

In `src/routes/index.ts`, widen the confirmation state and set it in `onAdd` from the row as it stood *before* the purchase was saved:

```ts
	let confirmedPurchase: {
		card: Card;
		period: string;
		over: number;
		groupName: string;
	} | null = null;
```

```ts
			const row = spendableRows(cards, groups, purchases, payments, now).find(
				(candidate) => candidate.card.id === cardId,
			);
			await repo.savePurchase({ /* unchanged */ });
			const period = periodOfPurchase(card.cycle, date);
			confirmedPurchase = {
				card,
				period,
				over: row ? Math.max(0, amount - row.available) : 0,
				groupName: row?.group.name ?? "",
			};
```

and in `paint`, append the second sentence when there is one:

```ts
		const over =
			confirmedPurchase && confirmedPurchase.over > 0
				? ` ${t("dashboard.answerOver", {
						over: formatAmount(confirmedPurchase.over),
						name: confirmedPurchase.groupName,
					})}`
				: "";
		const answer = confirmedPurchase ? `${t("dashboard.answer", { close, due })}${over}` : "";
```

Pass the rows to the form: `.rows=${spendableRows(cards, groups, purchases, payments, now)}`. Import `formatAmount` from `#lib/domain/money`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test && bun run typecheck && bun run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/components/cc-quick-add.ts src/components/cc-quick-add.test.ts src/routes/index.ts src/routes/index.test.ts src/lib/i18n
git commit -m "$(cat <<'EOF'
feat: show the room left while entering a purchase

An amount over the remaining credit is still recorded -- the app follows
what happened rather than authorising it -- and the confirmation says by
how much, and on which limit group.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation and a look at the real thing

**Files:**
- Modify: `README.md`
- Create: `docs/testing/2026-09-23-credit-limits.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Document the feature in the README**

Add a section after *Which cards can take a purchase*, written in the README's voice:

- A limit group is a pool of credit; every card points at one, and cards that share a limit share a group.
- Available credit is the group's limit less every purchase on a statement not yet marked paid, the open period included; marking a statement paid returns exactly its total.
- Archived cards still weigh on the group they share.
- The dashboard's *Can spend now* panel lists only cards that can take a purchase, with the close and due dates of the statement a purchase made today would land on — deliberately not the same dates as *Due next*, which answers what must be paid.
- A card stored before this feature has no group and shows as unassigned until edited.
- Backups are now version 2 and carry `limitGroups`; a version 1 file is rejected.

Also update the *Where the data lives* section to name the `cc:limitgroup:<id>` key.

- [ ] **Step 2: Run the app and look at all three pages**

```bash
bun run dev
```

Check by eye, in both languages and at phone width (about 400px):
1. `/cards`: add a limit group, add two cards pointing at it, confirm the table shows 2 cards and the pooled usage.
2. `/`: the panel lists both cards with the same available amount, the shared marker, and matching close/due dates.
3. Enter a purchase over the limit: it saves, the confirmation names the overage, the panel drops both cards' available amount together.
4. Mark the statement paid on the due list: the credit comes back.
5. `/backup`: export, then import the file back — it round-trips.

- [ ] **Step 3: Write the testing guide**

Create `docs/testing/2026-09-23-credit-limits.md` following the shape of `docs/testing/2026-09-22-minor-changes.md`: what changed, how to try each piece by hand, and what to expect.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/testing/2026-09-23-credit-limits.md
git commit -m "$(cat <<'EOF'
docs: how credit limits and shared groups work

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
