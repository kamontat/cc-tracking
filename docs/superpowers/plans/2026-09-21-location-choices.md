# Location Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Card.location` becomes a closed set of three values — `bangkok`, `phichit`, `krabi` — picked from a dropdown, validated on import, and migrated once for any card that already holds free text.

**Architecture:** A new `src/lib/domain/location.ts` owns the set, the guard that narrows unknown data into it, and the English label for each value. `Card.location` changes from `string` to `Location`, so every consumer either displays a label or fails to compile. Data already on disk is reconciled by a one-time startup migration rather than a read-time coercion, because coercing on read would leave the type asserting something about stored data that is not true.

**Tech Stack:** Bun 1.4.2, TypeScript, Lit 3.3.3, `bun test` with `@happy-dom/global-registrator`.

**Spec:** `docs/superpowers/specs/2026-09-21-location-i18n-cloudflare-design.md`

## Global Constraints

- Bun only. `bun test`, `bun run`, `bun install`, `bunx`. Never npm, node, jest, vitest, or ts-node.
- The three stored values are exactly `"bangkok"`, `"phichit"`, `"krabi"` — lowercase keys, never display labels. `"Krabi"` is not a valid stored value.
- `src/lib/domain/**` imports nothing from `src/lib/storage/**`, and never references `localStorage`, `fetch`, `window`, or `document`.
- Path imports use the existing subpath aliases: `#lib/*` for `./src/lib/*`, `#components/*` for `./src/components/*`.
- Labels in this plan are English only. They become catalog lookups in the i18n plan that follows; do not add Thai here.
- Money is satang integers; dates are `YYYY-MM-DD` strings. Neither is touched by this plan.
- Commit after every task, using Conventional Commit prefixes (`feat:`, `test:`, `fix:`, `refactor:`).
- `bun run typecheck` and `bun test` must both pass at every commit.
- This plan covers **phase A only**. Thai/English translation and the Cloudflare Worker each get their own plan; do not start them here.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/domain/location.ts` | **New.** `LOCATIONS`, the `Location` type, `DEFAULT_LOCATION`, `toLocation` guard, `locationLabel`. |
| `src/lib/domain/location.test.ts` | **New.** Covers the guard and the labels. |
| `src/lib/domain/types.ts` | `Card.location` retyped from `string` to `Location`. |
| `src/lib/storage/migrate-locations.ts` | **New.** One-time rewrite of unrecognised stored locations, plus the notice it leaves behind. |
| `src/lib/storage/migrate-locations.test.ts` | **New.** Migration, idempotence, per-card failure tolerance, notice read-and-clear. |
| `src/lib/storage/transfer.ts` | Backup import rejects a card whose location is not one of the three. |
| `src/lib/storage/contract.ts` | Fixture locations become lowercase keys. |
| `src/components/cc-card-form.ts` | Free-text input plus datalist becomes a `<select>` over `LOCATIONS`. |
| `src/components/cc-card-table.ts` | Displays `locationLabel(card.location)`. |
| `src/components/cc-due-list.ts` | Displays `locationLabel(card.location)`. |
| `src/components/cc-location-groups.ts` | Groups on `Location`; the `"Unknown"` fallback goes away. |
| `src/lib/ui/page.ts` | Runs the migration once before the page renders. |
| `src/routes/cards.ts` | Drops the derived `locations` list; shows the migration notice once. |
| `src/routes/card.ts` | Displays `locationLabel(card.location)`. |

---

### Task 1: The location set

**Files:**
- Create: `src/lib/domain/location.ts`
- Test: `src/lib/domain/location.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LOCATIONS: readonly ["bangkok", "phichit", "krabi"]`
  - `type Location = "bangkok" | "phichit" | "krabi"`
  - `DEFAULT_LOCATION: Location` (the value `"bangkok"`)
  - `toLocation(value: unknown): Location | null`
  - `locationLabel(location: Location): string`

Nothing else in the codebase changes in this task, so it must leave the suite green on its own.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/location.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
	DEFAULT_LOCATION,
	LOCATIONS,
	locationLabel,
	toLocation,
} from "#lib/domain/location";

test("accepts each known location", () => {
	for (const location of LOCATIONS) {
		expect(toLocation(location)).toBe(location);
	}
});

test("rejects anything that is not one of the three", () => {
	// A display label is not a stored value: casing matters.
	expect(toLocation("Krabi")).toBeNull();
	expect(toLocation("chiang-mai")).toBeNull();
	expect(toLocation("")).toBeNull();
	expect(toLocation(null)).toBeNull();
	expect(toLocation(undefined)).toBeNull();
	expect(toLocation(7)).toBeNull();
	expect(toLocation({ location: "krabi" })).toBeNull();
});

test("the default is itself a known location", () => {
	expect(toLocation(DEFAULT_LOCATION)).toBe(DEFAULT_LOCATION);
});

test("labels every location in declaration order", () => {
	expect(LOCATIONS.map(locationLabel)).toEqual(["Bangkok", "Phichit", "Krabi"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/domain/location.test.ts`
Expected: FAIL — the module `#lib/domain/location` does not resolve.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/location.ts`:

```ts
/** The three places a company card is physically kept. Stored as these lowercase keys. */
export const LOCATIONS = ["bangkok", "phichit", "krabi"] as const;

export type Location = (typeof LOCATIONS)[number];

export const DEFAULT_LOCATION: Location = "bangkok";

const LABELS: Record<Location, string> = {
	bangkok: "Bangkok",
	phichit: "Phichit",
	krabi: "Krabi",
};

/**
 * Narrows untrusted data to a `Location`, or `null` when it is not one.
 *
 * Takes `unknown` rather than `string` on purpose: its callers are a backup file being
 * imported and cards written before this field was a closed set. Neither is something the
 * type system can vouch for.
 */
export function toLocation(value: unknown): Location | null {
	const known: readonly string[] = LOCATIONS;
	return typeof value === "string" && known.includes(value)
		? (value as Location)
		: null;
}

export function locationLabel(location: Location): string {
	return LABELS[location];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/domain/location.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/location.ts src/lib/domain/location.test.ts
git commit -m "feat: add the closed set of card locations"
```

---

### Task 2: Retype `Card.location` and fix every consumer

**Files:**
- Modify: `src/lib/domain/types.ts:16`
- Modify: `src/lib/storage/contract.ts:10`, `src/lib/storage/contract.ts:64-69`
- Modify: `src/components/cc-card-form.ts` (compile fix only — the `<select>` comes in Task 3)
- Modify: `src/components/cc-card-table.ts:35`
- Modify: `src/components/cc-due-list.ts:57`
- Modify: `src/components/cc-location-groups.ts:11-18,27`
- Modify: `src/routes/card.ts:104`
- Modify: whichever test files the typechecker names

**Interfaces:**
- Consumes: `Location`, `DEFAULT_LOCATION`, `toLocation`, `locationLabel` from Task 1.
- Produces: `Card.location` typed as `Location` throughout. Every later task and both later plans assume this.

This task is one atomic compile unit: the type change and its fallout cannot be split without leaving the repository unbuildable between commits. Let the typechecker drive it.

- [ ] **Step 1: Change the type and let it fail**

In `src/lib/domain/types.ts`, add the import at the top and retype the field:

```ts
import type { Location } from "#lib/domain/location";
```

```ts
export type Card = {
	id: string;
	name: string;
	last4: string;
	location: Location;
	cycle: CycleRule;
	comment?: string;
	archived: boolean;
};
```

`types.ts` stays logic-free: it imports a type, not a value.

- [ ] **Step 2: Run the typechecker to enumerate the fallout**

Run: `bun run typecheck`
Expected: FAIL, with errors of the form `Type 'string' is not assignable to type 'Location'` in the files listed below. Treat the output as the to-do list for Step 3; fix every error it names, not only the ones written here.

- [ ] **Step 3: Fix each consumer**

`src/lib/storage/contract.ts` — the fixture and the assertion that reads it:

```ts
export const sampleCard = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});
```

```ts
		test("saving the same id replaces the card", async () => {
			await repo.saveCard(sampleCard());
			await repo.saveCard(sampleCard({ location: "bangkok" }));
			const cards = await repo.listCards();
			expect(cards).toHaveLength(1);
			expect(cards[0]?.location).toBe("bangkok");
		});
```

`src/components/cc-card-form.ts` — a minimal narrowing so the file compiles. Add to the imports:

```ts
import { DEFAULT_LOCATION, toLocation } from "#lib/domain/location";
```

and in `onSubmit`, where the card literal is built:

```ts
			location: toLocation(this.value("location")) ?? DEFAULT_LOCATION,
```

`src/components/cc-card-table.ts` — add the import and render the label:

```ts
import { locationLabel } from "#lib/domain/location";
```

```ts
								<td>${locationLabel(card.location)}</td>
```

`src/components/cc-due-list.ts` — the same two edits, on the `<td>` that currently reads `${card.location}`.

`src/routes/card.ts` — add the same import, and change the summary line:

```ts
							<p>${locationLabel(card.location)} — ${describeCycle(card.cycle)}${card.comment ? ` — ${card.comment}` : ""}</p>
```

`src/components/cc-location-groups.ts` — the `"Unknown"` fallback is now unreachable by the type, so it goes. Group on the key, sort on the label:

```ts
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DueRow } from "#components/cc-due-list";
import { displayDate } from "#lib/domain/date";
import { locationLabel } from "#lib/domain/location";
import type { Location } from "#lib/domain/location";

@customElement("cc-location-groups")
export class CcLocationGroups extends LitElement {
	@property({ attribute: false }) rows: DueRow[] = [];

	private grouped(): [Location, DueRow[]][] {
		const groups = new Map<Location, DueRow[]>();
		for (const row of this.rows) {
			const location = row.card.location;
			groups.set(location, [...(groups.get(location) ?? []), row]);
		}
		return [...groups.entries()].sort(([a], [b]) =>
			locationLabel(a) < locationLabel(b) ? -1 : 1,
		);
	}
```

and in `render`, the heading:

```ts
							<h3>${locationLabel(location)} (${rows.length})</h3>
```

Test files that build a `Card` with a location string — `src/components/cc-card-form.test.ts`, `src/components/cc-due-list.test.ts`, `src/components/cc-location-groups.test.ts`, `src/routes/*.test.ts`, `src/lib/storage/*.test.ts` — change the value to the matching lowercase key (`"Krabi"` becomes `"krabi"`) and any assertion that reads it back. In `cc-card-form.test.ts`, the `fill(element, "location", "Krabi")` calls become `fill(element, "location", "krabi")` and the expected card's location becomes `"krabi"`.

- [ ] **Step 4: Verify both gates**

Run: `bun run typecheck`
Expected: PASS, no output.

Run: `bun test`
Expected: PASS, the whole suite.

If a test now fails on a displayed value — a table cell asserting `"Krabi"` — that is correct and expected: the cell renders the label, so the assertion stays `"Krabi"` while the stored value becomes `"krabi"`. Read each failure before changing it.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: type card location as a closed set"
```

---

### Task 3: Pick a location from a dropdown

**Files:**
- Modify: `src/components/cc-card-form.ts`
- Modify: `src/routes/cards.ts:112` (drops the `.locations` binding)
- Test: `src/components/cc-card-form.test.ts`

**Interfaces:**
- Consumes: `LOCATIONS`, `DEFAULT_LOCATION`, `locationLabel`, `toLocation` from Task 1.
- Produces: `cc-card-form` no longer has a `locations` property. Nothing may pass one after this task.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/cc-card-form.test.ts`:

```ts
test("offers exactly the three locations, labelled", async () => {
	const element = await mount();
	const options = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="location"] option',
		) ?? []),
	];

	expect(options.map((option) => option.value)).toEqual([
		"bangkok",
		"phichit",
		"krabi",
	]);
	expect(options.map((option) => option.textContent?.trim())).toEqual([
		"Bangkok",
		"Phichit",
		"Krabi",
	]);
});

test("defaults a new card to Bangkok without the user touching the field", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved?.location).toBe("bangkok");
});

test("shows the edited card's own location when editing", async () => {
	const element = await mount({
		id: "scb",
		name: "SCB",
		last4: "1234",
		location: "phichit",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
	});

	const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="location"]',
	);
	expect(select?.value).toBe("phichit");
});
```

The existing `fill(element, "location", "krabi")` calls from Task 2 keep working: `fill` assigns `.value`, and a `<select>` accepts an option's value the same way.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: FAIL — the query for `[name="location"] option` returns nothing, because the field is still an `<input>` with a sibling `<datalist>`.

- [ ] **Step 3: Replace the field**

In `src/components/cc-card-form.ts`, widen the imports:

```ts
import {
	DEFAULT_LOCATION,
	LOCATIONS,
	locationLabel,
	toLocation,
} from "#lib/domain/location";
```

Delete the `locations` property declaration:

```ts
	@property({ attribute: false }) locations: string[] = [];
```

Replace the location `<label>` and its `<datalist>` in `render` with:

```ts
				<label>
					Location
					<select name="location" required>
						${LOCATIONS.map(
							(value) =>
								html`<option value=${value}>${locationLabel(value)}</option>`,
						)}
					</select>
				</label>
```

Reject an unreadable value rather than silently defaulting it — in `onSubmit`, alongside the other guards:

```ts
		const location = toLocation(this.value("location"));
		if (!location) return this.fail("Choose where the card is kept.");
```

and use it in the card literal, replacing the `?? DEFAULT_LOCATION` fallback added in Task 2:

```ts
			location,
```

A `<select>` selects its first option by default, so a user who never touches the field submits `"bangkok"` — which is `DEFAULT_LOCATION`, and why `bangkok` is listed first.

Set the selection when the edited card changes. Lit binds an option's `selected` as `defaultSelected`, which a later re-render will not reliably reapply, so drive it from the lifecycle instead — the same reason the existing code reaches into the DOM after `form.reset()`:

```ts
	override updated(changed: Map<string, unknown>) {
		// Only when the edit target changes: doing this on every update would fight the user's
		// own selection, which re-renders on any @state change.
		if (!changed.has("card")) return;
		const select = this.renderRoot.querySelector<HTMLSelectElement>(
			'[name="location"]',
		);
		if (select) select.value = this.card?.location ?? DEFAULT_LOCATION;
	}
```

In the post-create reset block, put the dropdown back with the other fields:

```ts
			const locationSelect = form?.querySelector<HTMLSelectElement>(
				'[name="location"]',
			);
			if (locationSelect) locationSelect.value = DEFAULT_LOCATION;
```

- [ ] **Step 4: Drop the now-dead derived list**

In `src/routes/cards.ts`, remove the binding from the `cc-card-form` element:

```ts
					<cc-card-form
						.card=${editing}
						@save=${onSave}
						@cancel=${() => {
							editing = null;
							paint();
						}}
					></cc-card-form>
```

The set is fixed in code now, so deriving it from existing cards is not just unnecessary — it would reintroduce the typo-created fourth location this task exists to prevent.

- [ ] **Step 5: Run the gates**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: PASS, including the three new tests.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/cc-card-form.ts src/components/cc-card-form.test.ts src/routes/cards.ts
git commit -m "feat: pick a card location from the three known places"
```

---

### Task 4: Reject an unknown location on import

**Files:**
- Modify: `src/lib/storage/transfer.ts:78-86`
- Test: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `toLocation`, `LOCATIONS` from Task 1.
- Produces: no new exports. `parseBackup` throws on a card whose location is not one of the three.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/storage/transfer.test.ts`:

```ts
test("rejects a backup whose card has an unknown location", () => {
	const backup = {
		version: 1,
		exportedAt: "2026-09-21T00:00:00.000Z",
		cards: [
			{
				id: "kbank",
				name: "KBank Visa",
				last4: "4821",
				location: "Chiang Mai",
				cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
				archived: false,
			},
		],
		purchases: [],
		payments: [],
	};

	expect(() => parseBackup(JSON.stringify(backup))).toThrow(
		"That backup's card #1 has a location that is not bangkok, phichit, or krabi.",
	);
});

test("accepts a backup whose card location is a known key", () => {
	const backup = {
		version: 1,
		exportedAt: "2026-09-21T00:00:00.000Z",
		cards: [
			{
				id: "kbank",
				name: "KBank Visa",
				last4: "4821",
				location: "phichit",
				cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
				archived: false,
			},
		],
		purchases: [],
		payments: [],
	};

	expect(parseBackup(JSON.stringify(backup)).cards[0]?.location).toBe("phichit");
});
```

Match the import style already at the top of that file; `parseBackup` is imported there already.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: FAIL — the unknown-location backup parses cleanly, because `cardProblem` only checks that `location` is a non-empty string.

- [ ] **Step 3: Tighten the check**

In `src/lib/storage/transfer.ts`, add the import:

```ts
import { toLocation } from "#lib/domain/location";
```

and in `cardProblem`, replace the location line:

```ts
	if (toLocation(prop(value, "location")) === null)
		return "has a location that is not bangkok, phichit, or krabi";
```

This keeps the file's existing contract: a problem is a sentence fragment naming what is wrong, and `parseBackup` writes nothing when any record has one.

- [ ] **Step 4: Run the gates**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/transfer.ts src/lib/storage/transfer.test.ts
git commit -m "feat: reject a backup card whose location is not one of the three"
```

---

### Task 5: The one-time migration

**Files:**
- Create: `src/lib/storage/migrate-locations.ts`
- Test: `src/lib/storage/migrate-locations.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_LOCATION`, `toLocation` from Task 1; `Repository` from `#lib/storage/repository`.
- Produces:
  - `MIGRATION_KEY: string` (the value `"cc:migration:location"`)
  - `migrateLocations(repo: Repository, storage: Storage): Promise<string[]>` — returns the names of the cards it reset
  - `takeResetNotice(storage: Storage): string[]` — reads those names and clears them

This module is pure logic over the two injected dependencies, so it is fully testable without a page. Task 6 wires it up.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/migrate-locations.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Card } from "#lib/domain/types";
import {
	MIGRATION_KEY,
	migrateLocations,
	takeResetNotice,
} from "#lib/storage/migrate-locations";
import { InMemoryRepository } from "#lib/storage/repository";
import { sampleCard } from "#lib/storage/contract";

/** A card as it may exist on disk from before `location` was a closed set. */
const legacyCard = (location: string, overrides: Partial<Card> = {}): Card =>
	({ ...sampleCard(overrides), location }) as unknown as Card;

const freshStorage = (): Storage => {
	globalThis.localStorage.clear();
	return globalThis.localStorage;
};

test("rewrites an unrecognised location to the default and names the card", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(legacyCard("Chiang Mai", { id: "kbank", name: "KBank Visa" }));
	const storage = freshStorage();

	expect(await migrateLocations(repo, storage)).toEqual(["KBank Visa"]);
	expect((await repo.getCard("kbank"))?.location).toBe("bangkok");
});

test("leaves a card that already holds a known location alone", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard({ id: "scb", location: "phichit" }));
	const storage = freshStorage();

	expect(await migrateLocations(repo, storage)).toEqual([]);
	expect((await repo.getCard("scb"))?.location).toBe("phichit");
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();
});

test("is idempotent: a second run finds nothing", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(legacyCard("office", { id: "kbank", name: "KBank Visa" }));
	const storage = freshStorage();

	await migrateLocations(repo, storage);
	storage.removeItem(MIGRATION_KEY);

	expect(await migrateLocations(repo, storage)).toEqual([]);
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();
});

test("one unwritable card does not stop the others", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(legacyCard("office", { id: "a", name: "Card A" }));
	await repo.saveCard(legacyCard("home", { id: "b", name: "Card B" }));
	const storage = freshStorage();

	const saveCard = repo.saveCard.bind(repo);
	repo.saveCard = async (card: Card) => {
		if (card.id === "a") throw new Error("storage full");
		await saveCard(card);
	};

	expect(await migrateLocations(repo, storage)).toEqual(["Card B"]);
	expect((await repo.getCard("b"))?.location).toBe("bangkok");
});

test("the notice is readable once and then gone", () => {
	const storage = freshStorage();
	storage.setItem(MIGRATION_KEY, JSON.stringify(["Card A", "Card B"]));

	expect(takeResetNotice(storage)).toEqual(["Card A", "Card B"]);
	expect(takeResetNotice(storage)).toEqual([]);
});

test("a corrupt notice reads as no notice", () => {
	const storage = freshStorage();
	storage.setItem(MIGRATION_KEY, "{not json");

	expect(takeResetNotice(storage)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/storage/migrate-locations.test.ts`
Expected: FAIL — the module `#lib/storage/migrate-locations` does not resolve.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/migrate-locations.ts`:

```ts
import { DEFAULT_LOCATION, toLocation } from "#lib/domain/location";
import type { Repository } from "#lib/storage/repository";

export const MIGRATION_KEY = "cc:migration:location";

/**
 * Rewrites any stored location the closed set does not recognise, once.
 *
 * `Card.location` is typed as `Location`, so the guard below looks like dead code. It is
 * not: cards written before the field became a closed set still hold free text, and this
 * is the one place that reads them honestly rather than trusting the type. Coercing on
 * every read instead would leave the type asserting something about stored data that is
 * not true, and would re-fix the same cards forever.
 *
 * Returns the names of the cards it reset, and records them under `MIGRATION_KEY` so the
 * cards page can say which ones need a human to pick the right location.
 */
export async function migrateLocations(
	repo: Repository,
	storage: Storage,
): Promise<string[]> {
	const reset: string[] = [];

	for (const card of await repo.listCards()) {
		if (toLocation(card.location) !== null) continue;
		try {
			await repo.saveCard({ ...card, location: DEFAULT_LOCATION });
			reset.push(card.name);
		} catch (failure) {
			// One card that will not write must not hold back the rest, nor the page behind it.
			console.error(failure);
		}
	}

	if (reset.length > 0) {
		try {
			storage.setItem(MIGRATION_KEY, JSON.stringify(reset));
		} catch (failure) {
			console.error(failure);
		}
	}

	return reset;
}

/** Reads the names `migrateLocations` recorded and clears them, so the notice shows once. */
export function takeResetNotice(storage: Storage): string[] {
	let raw: string | null;
	try {
		raw = storage.getItem(MIGRATION_KEY);
		storage.removeItem(MIGRATION_KEY);
	} catch (failure) {
		console.error(failure);
		return [];
	}
	if (raw === null) return [];

	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value)
			? value.filter((name): name is string => typeof name === "string")
			: [];
	} catch {
		return [];
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/storage/migrate-locations.test.ts`
Expected: PASS, 6 tests.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/migrate-locations.ts src/lib/storage/migrate-locations.test.ts
git commit -m "feat: migrate unrecognised card locations once at startup"
```

---

### Task 6: Run the migration, and say what it changed

**Files:**
- Modify: `src/lib/ui/page.ts`
- Modify: `src/routes/cards.ts`
- Test: `src/routes/cards.test.ts`

**Interfaces:**
- Consumes: `migrateLocations`, `takeResetNotice` from Task 5.
- Produces: `renderCardsPage(repo: Repository, root: HTMLElement, storage?: Storage)` — the third parameter defaults to `globalThis.localStorage` and exists so tests can inject their own.

- [ ] **Step 1: Write the failing test**

Append to `src/routes/cards.test.ts`:

```ts
import { MIGRATION_KEY } from "#lib/storage/migrate-locations";

test("names the cards whose location was reset, once", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	const storage = globalThis.localStorage;
	storage.clear();
	storage.setItem(MIGRATION_KEY, JSON.stringify(["KBank Visa", "SCB"]));

	renderCardsPage(repo, root, storage);
	await settle();

	const notice = root.querySelector('[data-testid="location-reset"]');
	expect(notice?.textContent).toContain("KBank Visa");
	expect(notice?.textContent).toContain("SCB");
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();

	// A second render of a fresh page must not repeat it.
	const second = mount();
	renderCardsPage(repo, second, storage);
	await settle();
	expect(second.querySelector('[data-testid="location-reset"]')).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/cards.test.ts`
Expected: FAIL — `renderCardsPage` takes two parameters and renders no such notice.

- [ ] **Step 3: Show the notice on the cards page**

In `src/routes/cards.ts`, add the import:

```ts
import { takeResetNotice } from "#lib/storage/migrate-locations";
```

widen the signature and read the notice once, before the state machine is built:

```ts
export function renderCardsPage(
	repo: Repository,
	root: HTMLElement,
	storage: Storage = globalThis.localStorage,
): void {
	let cards: Card[] = [];
	let counts: Record<string, number> = {};
	let editing: Card | null = null;
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = takeResetNotice(storage);
```

and render it above the form in `paint`:

```ts
				${
					resetNames.length > 0
						? html`
							<article data-testid="location-reset">
								<p>
									These cards were kept somewhere this app no longer recognises, so their
									location was set to Bangkok: <strong>${resetNames.join(", ")}</strong>.
									Edit each one to pick the right place.
								</p>
								<button class="secondary" type="button" @click=${() => {
									resetNames = [];
									paint();
								}}>Dismiss</button>
							</article>
						`
						: nothing
				}
```

Add `nothing` to the existing `lit` import:

```ts
import { html, nothing, render } from "lit";
```

- [ ] **Step 4: Run the migration before the page renders**

In `src/lib/ui/page.ts`, replace the body of `bootstrap`:

```ts
import "#components/cc-error-banner";
import { createRepository, StorageUnavailableError } from "#lib/storage/index";
import { migrateLocations } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";

/**
 * Creates the repository once per page, reconciles any stored location the closed set no
 * longer recognises, and hands the repository to the page's renderer. A browser that
 * refuses storage gets the banner instead of a half-working page.
 */
export function bootstrap(render: (repo: Repository) => void): void {
	let repo: Repository;
	try {
		repo = createRepository();
	} catch (error) {
		console.error(error);
		const banner = document.createElement("cc-error-banner");
		banner.message =
			error instanceof StorageUnavailableError
				? error.message
				: "Something went wrong starting the page.";
		banner.retryLabel = "Reload";
		banner.addEventListener("retry", () => location.reload());
		const target = document.querySelector("main") ?? document.body;
		target.prepend(banner);
		return;
	}

	// The page renders whether or not the migration succeeded. A location that could not be
	// rewritten is a cosmetic problem; refusing to render would turn it into an outage.
	void migrateLocations(repo, globalThis.localStorage)
		.catch((failure: unknown) => {
			console.error(failure);
		})
		.then(() => {
			render(repo);
		});
}
```

The existing test in `src/lib/ui/page.test.ts` covers the storage-unavailable path, which still returns before any migration runs, so it keeps passing unchanged.

- [ ] **Step 5: Run the gates**

Run: `bun test src/routes/cards.test.ts`
Expected: PASS, including the new notice test.

Run: `bun run typecheck && bun test && bun run check`
Expected: PASS on all three.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/page.ts src/routes/cards.ts src/routes/cards.test.ts
git commit -m "feat: run the location migration at startup and report what it reset"
```

---

### Task 7: Update the documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Describe the closed set**

In `README.md`, under the section describing cards, state that a card's location is one of three fixed places — Bangkok, Phichit, Krabi — stored as the lowercase keys `bangkok`, `phichit`, `krabi`; that a backup naming any other location is rejected on import; and that cards stored under an older free-text location are reset to Bangkok once at startup, with the cards page naming them.

- [ ] **Step 2: Verify the whole suite one more time**

Run: `bun run typecheck && bun test && bun run check`
Expected: PASS on all three.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the three card locations"
```

---

## Done when

- A card's location can only be Bangkok, Phichit, or Krabi, chosen from a dropdown.
- Stored values are the lowercase keys; every display goes through `locationLabel`.
- A backup with any other location is rejected by name, and nothing is imported.
- A card left over from the free-text era is reset to Bangkok once, and the cards page says which ones.
- `bun run typecheck`, `bun test`, and `bun run check` all pass.
