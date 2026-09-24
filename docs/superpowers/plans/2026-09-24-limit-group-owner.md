# Limit group owner, split form and table, collapsible sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `owner` from `Card` to `LimitGroup`, replace `cc-limit-groups` with a form/table pair matching the card pair, and make all four `/cards` sections collapsible.

**Architecture:** `LimitGroup.owner` is optional, so absence reads as `KC` and no stored data is migrated. `ownerOf` retargets from `Card` to `LimitGroup`; the card table resolves a card's group to print its owner. The limit group component splits into `cc-limit-group-form` (add and edit, dispatching `save-group`/`cancel`) and `cc-limit-group-table` (dispatching `edit-group`/`remove-group`), with the route holding the group being edited. Each of the four components wraps itself in a `<details>` inside its own shadow root.

**Tech Stack:** Bun, TypeScript, Lit 3 web components, happy-dom for tests, `bun test`, Biome.

**Spec:** `docs/superpowers/specs/2026-09-24-limit-group-owner-design.md`

## Global Constraints

- Bun for everything: `bun test`, `bun run <script>`, `bunx`. Never npm/npx/node/jest/vitest.
- Design tokens live once in `src/styles/tokens.css`. Shadow CSS references them only through `var(--cc-*)` — never a literal hex, `rem`, `px`, or colour name.
- Buttons take `data-variant="quiet"` or `data-variant="danger"`; no attribute means the primary variant. No fourth variant.
- Never key a CSS selector or a test selector off translated text. Use classes, `data-field`, `data-action`, `data-id`.
- `#styles/*` maps to `.ts` only. Route modules import `tokens.css` and `app.css` by relative path.
- Every user-visible string goes in both `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts`. `MessageKey` derives from the English catalog, so a missing Thai key is a type error and `coverage.test.ts` fails on hard-coded English prose in a component or route.
- `BACKUP_VERSION` stays `2`. Do not bump it.
- Errors held in component state are catalog keys (`MessageKey | ""`), never resolved sentences, so a locale switch re-renders them.
- Run `bun test` before every commit. Run `bunx biome check --write src` before every commit.

## Review Focus

- A card whose `limitGroupId` names a group that is gone (deleted, or never imported): the owner cell must print the unassigned fallback, not `KC`. Test added in Task 1.
- A group whose `owner` came from an edited backup and is not in `OWNERS`: `ownerOf` falls back to `KC` rather than printing the junk. Test added in Task 1.
- A reader who closes a table, then anything repaints the page: the section must stay closed. Test added in Tasks 4 and 6.
- A locale switch while a limit group form is showing a validation error: the error must re-render in the new language. Test added in Task 3.
- Clicking Edit on one group and then another before saving: the form must show the second group's name and limit, not the first's. Test added in Task 3.

---

### Task 1: Owner becomes a property of the limit group

`LimitGroup` gains an optional `owner`, `ownerOf` retargets from a card to a group, the card table resolves a card's group to name its owner, and the backup validates a group's owner. `Card.owner` still exists after this task; Task 2 removes it.

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/domain/owner.ts`
- Modify: `src/lib/domain/owner.test.ts`
- Modify: `src/components/cc-card-table.ts`
- Modify: `src/components/cc-card-table.test.ts`
- Modify: `src/lib/storage/transfer.ts`
- Modify: `src/lib/storage/transfer.test.ts`
- Modify: `src/lib/storage/contract.ts`

**Interfaces:**
- Consumes: `OWNERS`, `DEFAULT_OWNER`, `toOwner` from `#lib/domain/owner` (unchanged).
- Produces: `LimitGroup = { id: string; name: string; limit: number; owner?: Owner }`; `ownerOf(group: LimitGroup): Owner`; `sampleLimitGroup()` fixture now carries `owner: "KC"`.

- [ ] **Step 1: Write the failing domain test**

Replace the `ownerOf` block at the bottom of `src/lib/domain/owner.test.ts` (the `card(...)` helper and its three `ownerOf` tests) with:

```ts
const group = (overrides: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...overrides,
});

test("names the owner a group carries", () => {
	expect(ownerOf(group({ owner: "RI" }))).toBe("RI");
});

test("reads a group saved before the owner field existed as the default", () => {
	expect(ownerOf(group())).toBe(DEFAULT_OWNER);
});

test("reads an owner outside the closed set as the default", () => {
	expect(ownerOf(group({ owner: "ZZ" as never }))).toBe(DEFAULT_OWNER);
});
```

Change the file's type import to `import type { LimitGroup } from "#lib/domain/types";` (drop the `Card` import if nothing else in the file uses it).

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/domain/owner.test.ts`
Expected: FAIL — `ownerOf` still expects a `Card`, and `LimitGroup` has no `owner`.

- [ ] **Step 3: Add the field and retarget `ownerOf`**

In `src/lib/domain/types.ts`, add to `LimitGroup`:

```ts
export type LimitGroup = {
	id: string;
	name: string;
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	limit: number;
	/** Absent on groups saved before the field existed; see `ownerOf` in `#lib/domain/owner`. */
	owner?: Owner;
};
```

`types.ts` already imports `Owner`, so no import change is needed.

In `src/lib/domain/owner.ts`, replace the `Card` import and `ownerOf`:

```ts
import type { LimitGroup } from "#lib/domain/types";
```

```ts
/**
 * Whose account this pool of credit belongs to.
 *
 * `LimitGroup.owner` is typed as `Owner`, so the guard here looks like dead code. It is not:
 * groups written before the field existed carry nothing at all, and an imported backup can
 * carry anything. Both read as the default rather than blanking the column.
 */
export function ownerOf(group: LimitGroup): Owner {
	return toOwner(group.owner) ?? DEFAULT_OWNER;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/domain/owner.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing card table test**

In `src/components/cc-card-table.test.ts`, replace the test named `"names whose card each one is, falling back to KC when nothing is stored"` with:

```ts
test("names whose card each one is through the group it draws on", async () => {
	const element = await mount(
		[
			{ ...card, id: "kbank", limitGroupId: "pool" },
			{ ...card, id: "scb", limitGroupId: "solo" },
			{ ...card, id: "ttb", limitGroupId: "gone" },
			{ ...card, id: "uob" },
		],
		{},
		[
			{ id: "pool", name: "KBank account", limit: 500_000, owner: "RI" },
			{ id: "solo", name: "SCB", limit: 100_000 },
		],
	);
	const cells = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(
			'td[data-field="owner"]',
		) ?? []),
	];

	expect(cells).toHaveLength(4);
	expect(cells[0]?.textContent?.trim()).toBe("RI");
	// A group carrying no owner reads as the default.
	expect(cells[1]?.textContent?.trim()).toBe("KC");
	// A group that is gone, and a card with no group at all, have nobody to attribute to.
	expect(cells[2]?.textContent?.trim()).toBe("Not assigned");
	expect(cells[3]?.textContent?.trim()).toBe("Not assigned");
});
```

Add `setLocale("en");` as the first line of the `mount` helper in that file if it is not already there, so this test does not depend on the locale a previous test left set.

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun test src/components/cc-card-table.test.ts`
Expected: FAIL — the owner cell still prints `ownerOf(card)`.

- [ ] **Step 7: Read the owner through the group**

In `src/components/cc-card-table.ts`, inside the `this.cards.map((card) => {` callback, add above the `return html`:

```ts
const group = this.groups.find(({ id }) => id === card.limitGroupId);
```

Replace the owner cell with:

```ts
<td data-field="owner" data-label=${t("cards.column.owner")}>${
	group ? ownerOf(group) : t("cards.unassigned")
}</td>
```

Replace the limit group cell's lookup with the same `group` constant:

```ts
<td data-field="limit-group" data-label=${t("cards.column.limitGroup")}>
	${group?.name ?? t("cards.unassigned")}
</td>
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `bun test src/components/cc-card-table.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing backup test**

In `src/lib/storage/transfer.test.ts`, add these three inside the existing `describe("owner in a backup", ...)` block, below the two card tests already there:

```ts
	test("keeps a known owner on a limit group", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000, owner: "NT" }],
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).limitGroups[0]?.owner).toBe("NT");
	});

	test("accepts a limit group saved before the owner field existed", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000 }],
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).limitGroups[0]?.owner).toBeUndefined();
	});

	test("rejects a limit group whose owner is outside the closed set", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000, owner: "ZZ" }],
			cards: [],
			purchases: [],
			payments: [],
		});
		const failure = captureThrow(() => parseBackup(text));
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		});
	});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: FAIL — the third test throws nothing, because `limitGroupProblem` does not look at `owner`.

- [ ] **Step 11: Validate a group's owner**

In `src/lib/storage/transfer.ts`, extend `limitGroupProblem`:

```ts
function limitGroupProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name")))
		return "backup.problem.missingName";
	if (!isInteger(prop(value, "limit"))) return "backup.problem.badLimit";
	// Absent is fine -- groups written before the field existed read as the default owner.
	// A value that is present but unknown is not: that is a file claiming something the
	// closed set cannot honour, and silently rewriting it would lose whose account it is.
	const owner = prop(value, "owner");
	if (owner !== undefined && toOwner(owner) === null)
		return "backup.problem.badOwner";
	return null;
}
```

Leave `cardProblem` alone — Task 2 removes its owner check.

- [ ] **Step 12: Give the fixture an owner**

In `src/lib/storage/contract.ts`, add `owner: "KC",` to `sampleLimitGroup` after `limit`.

- [ ] **Step 13: Run the whole suite**

Run: `bun test`
Expected: PASS, 0 failures. If a contract test compares a saved group with `toEqual`, the added fixture field flows through both sides and still matches.

- [ ] **Step 14: Format and commit**

```bash
bunx biome check --write src
bun test
git add src/lib/domain/types.ts src/lib/domain/owner.ts src/lib/domain/owner.test.ts src/components/cc-card-table.ts src/components/cc-card-table.test.ts src/lib/storage/transfer.ts src/lib/storage/transfer.test.ts src/lib/storage/contract.ts
git commit -m "feat(limits): give a limit group an owner, and read a card's owner through it"
```

---

### Task 2: `Card.owner` leaves the model

The field is deleted from the type, the card form loses its owner control, the backup stops validating it, and every fixture drops it.

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/components/cc-card-form.ts`
- Modify: `src/components/cc-card-form.test.ts`
- Modify: `src/lib/storage/transfer.ts`
- Modify: `src/lib/storage/transfer.test.ts`
- Modify: `src/lib/storage/contract.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`
- Modify: `src/components/cc-card-table.test.ts`, `src/lib/domain/card.test.ts`, `src/lib/domain/limit.test.ts`, `src/routes/index.test.ts`

**Interfaces:**
- Consumes: `ownerOf(group)` from Task 1.
- Produces: `Card` with no `owner` field; catalog with no `form.owner` and no `form.error.owner`.

- [ ] **Step 1: Write the failing card form tests**

In `src/components/cc-card-form.test.ts`, delete these tests outright:
`"offers exactly the three owners, by their initials in both languages"`,
`"carries the chosen owner in the saved card"`,
`"shows the edited card's own owner"`,
`"shows a card stored before the owner field existed as belonging to KC"`.
In `"clears the owner and the supplementary box after a create"`, delete the owner `fill` and the owner assertion, and rename it to `"clears the supplementary box after a create"`.

Then add:

```ts
test("no longer asks whose card it is -- that answer lives on the limit group", async () => {
	const element = await mount();
	expect(element.shadowRoot?.querySelector('[name="owner"]')).toBeNull();
});

test("saves a card with no owner field at all", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fill(element, "id", "0001");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved).not.toBeUndefined();
	expect(saved && "owner" in saved).toBe(false);
});
```

Use the file's own `mount`, `fill` and `submit` helpers and its own field names — read the top of the file first and match them; the field list above is what the form requires today. Remove `owner: "KC"` and `owner: "NT"` from the `Card` fixtures at lines ~167, ~309, ~498 and ~555.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: FAIL — the form still renders `[name="owner"]` and puts `owner` on the saved card.

- [ ] **Step 3: Remove the field from the model and the form**

In `src/lib/domain/types.ts`, delete from `Card`:

```ts
	/** Absent on cards saved before the field existed; see `ownerOf` in `#lib/domain/owner`. */
	owner?: Owner;
```

If `Owner` is now unused in that file, delete its import too.

In `src/components/cc-card-form.ts`:
- Drop `DEFAULT_OWNER`, `OWNERS`, `ownerOf` and `toOwner` from the `#lib/domain/owner` import; if nothing remains, delete the import line.
- In `updated()`, delete the two lines that look up `[name="owner"]` and set its value.
- In `onSubmit()`, delete the `const owner = toOwner(this.value("owner"));` line and its `if (!owner) return this.fail("form.error.owner");` guard, and delete `owner,` from the `card` object literal.
- In the post-create reset block, delete the `ownerSelect` lookup and assignment.
- In `render()`, delete the whole owner `<label>` block.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: PASS

- [ ] **Step 5: Stop validating a card's owner, and drop the messages**

In `src/lib/storage/transfer.ts`, delete from `cardProblem` the three-line comment and the two `owner` lines, so it ends with `return cycleProblem(prop(value, "cycle"));`. Leave the `toOwner` import — `limitGroupProblem` uses it now.

In `src/lib/storage/transfer.test.ts`, delete the test that imports a card with `owner: "RI"` and the one that rejects `owner: "ZZ"` on a card (lines ~358 and ~370). The group equivalents added in Task 1 cover this behaviour now.

In `src/lib/i18n/en.ts` delete `"form.owner"` and `"form.error.owner"`; delete the same two keys from `src/lib/i18n/th.ts`. Keep `"cards.column.owner"` and `"backup.problem.badOwner"` — both are still used.

- [ ] **Step 6: Drop `owner` from every remaining fixture**

Remove the `owner: "KC"` line from `sampleCard` in `src/lib/storage/contract.ts`, from the `card` fixture in `src/components/cc-card-table.test.ts`, and from the card fixtures in `src/lib/domain/card.test.ts`, `src/lib/domain/limit.test.ts` (lines ~23, ~194, ~211, ~221) and `src/routes/index.test.ts` (lines ~27, ~67).

- [ ] **Step 7: Run the whole suite and the type check**

Run: `bun test`
Expected: PASS, 0 failures.

Run: `bunx tsc --noEmit`
Expected: no errors. Any remaining error naming `owner` is a fixture or a call site missed above — fix it and re-run.

- [ ] **Step 8: Format and commit**

```bash
bunx biome check --write src
bun test
git add src
git commit -m "refactor(cards): take owner off the card now that the limit group carries it"
```

---

### Task 3: `cc-limit-group-form`

A new component that adds and edits a limit group, collapsed by default and opening itself when a group arrives to edit.

**Files:**
- Create: `src/components/cc-limit-group-form.ts`
- Create: `src/components/cc-limit-group-form.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `LimitGroup` (with `owner?: Owner`) from Task 1; `parseAmount`, `formatAmountInput` from `#lib/domain/money`; `OWNERS`, `DEFAULT_OWNER`, `toOwner` from `#lib/domain/owner`.
- Produces: element `cc-limit-group-form`, class `CcLimitGroupForm`, property `group: LimitGroup | null`, events `save-group` (detail `LimitGroup`) and `cancel` (no detail).

- [ ] **Step 1: Add the messages**

In `src/lib/i18n/en.ts`, beside the other `limits.*` keys:

```ts
	"limits.edit": "Edit {name}",
	"limits.owner": "Owner",
	"limits.error.owner": "Choose who this limit group belongs to.",
```

In `src/lib/i18n/th.ts`, in the matching place:

```ts
	"limits.edit": "แก้ไข {name}",
	"limits.owner": "เจ้าของ",
	"limits.error.owner": "เลือกเจ้าของกลุ่มวงเงิน",
```

- [ ] **Step 2: Write the failing test file**

Create `src/components/cc-limit-group-form.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { CcLimitGroupForm } from "#components/cc-limit-group-form";
import "#components/cc-limit-group-form";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const mount = async (group: LimitGroup | null = null) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-group-form");
	element.group = group;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const field = (element: CcLimitGroupForm, name: string) => {
	const input = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!input) throw new Error(`no field named ${name}`);
	return input;
};

const fill = (element: CcLimitGroupForm, name: string, value: string) => {
	const input = field(element, name);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: CcLimitGroupForm) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

const details = (element: CcLimitGroupForm) =>
	element.shadowRoot?.querySelector<HTMLDetailsElement>("details");

const saved = (element: CcLimitGroupForm) => {
	const seen: LimitGroup[] = [];
	element.addEventListener("save-group", (event) => {
		seen.push((event as CustomEvent<LimitGroup>).detail);
	});
	return seen;
};

test("mints an id for a group being created", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "name", "TTB account");
	fill(element, "limit", "3000");
	submit(element);

	expect(seen[0]?.name).toBe("TTB account");
	expect(seen[0]?.limit).toBe(300_000);
	expect(seen[0]?.owner).toBe("KC");
	expect(seen[0]?.id).toBeTruthy();
});

test("keeps the id and carries the chosen owner when editing", async () => {
	const element = await mount({ id: "pool", name: "KBank account", limit: 500_000 });
	const seen = saved(element);

	expect(field(element, "name").value).toBe("KBank account");
	expect(field(element, "limit").value).toBe("5000");
	fill(element, "owner", "RI");
	submit(element);

	expect(seen[0]).toEqual({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
		owner: "RI",
	});
});

test("shows the owner the edited group already has", async () => {
	const element = await mount({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
		owner: "NT",
	});
	expect(field(element, "owner").value).toBe("NT");
});

test("moves to the second group when one edit follows another", async () => {
	const element = await mount({ id: "pool", name: "KBank account", limit: 500_000 });
	element.group = { id: "solo", name: "SCB", limit: 100_000, owner: "RI" };
	await element.updateComplete;

	expect(field(element, "name").value).toBe("SCB");
	expect(field(element, "limit").value).toBe("1000");
	expect(field(element, "owner").value).toBe("RI");
});

test("refuses a group with no name, and saves nothing", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "limit", "3000");
	submit(element);
	await element.updateComplete;

	expect(seen).toHaveLength(0);
	expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
		"name",
	);
});

test("refuses a limit that is not an amount, and saves nothing", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "name", "TTB");
	fill(element, "limit", "lots");
	submit(element);
	await element.updateComplete;

	expect(seen).toHaveLength(0);
	expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
		"limit",
	);
});

test("clears itself after a create so the next group starts empty", async () => {
	const element = await mount();
	fill(element, "name", "TTB account");
	fill(element, "limit", "3000");
	fill(element, "owner", "RI");
	submit(element);
	await element.updateComplete;

	expect(field(element, "name").value).toBe("");
	expect(field(element, "limit").value).toBe("");
	expect(field(element, "owner").value).toBe("KC");
});

test("asks to be closed away again", async () => {
	const element = await mount();
	const cancelled: Event[] = [];
	element.addEventListener("cancel", (event) => cancelled.push(event));

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="cancel"]')
		?.click();

	expect(cancelled).toHaveLength(1);
});

test("starts closed, and opens itself when a group arrives to edit", async () => {
	const element = await mount();
	expect(details(element)?.open).toBe(false);

	element.group = { id: "pool", name: "KBank account", limit: 500_000 };
	await element.updateComplete;

	expect(details(element)?.open).toBe(true);
});

test("stays closed once the reader closes it", async () => {
	const element = await mount({ id: "pool", name: "KBank account", limit: 500_000 });
	const section = details(element);
	if (!section) throw new Error("no details element");

	section.open = false;
	section.dispatchEvent(new Event("toggle"));
	await element.updateComplete;

	// A repaint that changes nothing about the group must not reopen it.
	element.requestUpdate();
	await element.updateComplete;
	expect(details(element)?.open).toBe(false);
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	const element = await mount();
	fill(element, "limit", "3000");
	submit(element);
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("Give the limit group a name.");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ตั้งชื่อกลุ่มวงเงิน");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/components/cc-limit-group-form.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the component**

Create `src/components/cc-limit-group-form.ts`:

```ts
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmountInput, parseAmount } from "#lib/domain/money";
import { DEFAULT_OWNER, OWNERS, toOwner } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

@customElement("cc-limit-group-form")
export class CcLimitGroupForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}

			form {
				display: flex;
				flex-wrap: wrap;
				align-items: flex-end;
				gap: var(--cc-space-3);
			}

			p[role="alert"] {
				flex-basis: 100%;
			}

			.form-actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) group: LimitGroup | null = null;

	// The reader's own answer to "is this section open", not a mirror of `group`: it is forced
	// open when an edit target arrives and otherwise follows the element's own toggle event, so
	// a section closed by hand stays closed through every later repaint.
	@state() private open = false;
	// Carries the catalog key, not a resolved sentence, so a language switch while an error is
	// on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("group") && this.group) this.open = true;
	}

	override updated(changed: Map<string, unknown>) {
		// A <select> takes its value from the element, not from an `<option>` binding, and only
		// when the edit target changes -- doing it on every update would fight the reader's own
		// choice, which re-renders on any @state change.
		if (!changed.has("group")) return;
		const owner =
			this.renderRoot.querySelector<HTMLSelectElement>('[name="owner"]');
		if (owner) owner.value = this.group?.owner ?? DEFAULT_OWNER;
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const name = this.value("name");
		if (!name) return this.fail("limits.error.name");

		let limit: number;
		try {
			limit = parseAmount(this.value("limit"));
		} catch {
			return this.fail("limits.error.limit");
		}

		const owner = toOwner(this.value("owner"));
		if (!owner) return this.fail("limits.error.owner");

		this.errorKey = "";
		const wasCreate = this.group === null;
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: { id: this.group?.id ?? crypto.randomUUID(), name, limit, owner },
			}),
		);

		if (wasCreate) {
			// Bindings re-evaluate to the same "" they last committed after a create, so Lit's
			// dirty check skips the DOM write and the typed text stays put. A native reset
			// bypasses it, the same trick cc-card-form and cc-quick-add use.
			const form = this.renderRoot.querySelector("form");
			form?.reset();
			const owned = form?.querySelector<HTMLSelectElement>('[name="owner"]');
			if (owned) owned.value = DEFAULT_OWNER;
		}
	}

	override render() {
		const group = this.group;
		return html`
			<details ?open=${this.open} @toggle=${(event: Event) => {
				this.open = (event.target as HTMLDetailsElement).open;
			}}>
				<summary>${group ? t("limits.edit", { name: group.name }) : t("limits.add")}</summary>
				<form @submit=${this.onSubmit}>
					${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
					<label>${t("limits.name")} <input name="name" .value=${group?.name ?? ""}
						placeholder=${t("limits.namePlaceholder")} required /></label>
					<label>${t("limits.limit")} <input name="limit" inputmode="decimal"
						.value=${group ? formatAmountInput(group.limit) : ""}
						placeholder=${t("limits.limitPlaceholder")} required /></label>
					<label>
						${t("limits.owner")}
						<select name="owner" required>
							${OWNERS.map((value) => html`<option value=${value}>${value}</option>`)}
						</select>
					</label>
					<div class="form-actions" row>
						<button type="submit" data-action="save">${group ? t("limits.save") : t("limits.add")}</button>
						<button type="button" data-variant="quiet" data-action="cancel"
							@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
					</div>
				</form>
			</details>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-group-form": CcLimitGroupForm;
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-limit-group-form.test.ts`
Expected: PASS

If `details(element)?.open` reads `undefined` rather than `false` on a fresh mount, happy-dom is not reflecting the absent attribute onto the property; assert against `section.hasAttribute("open")` in all three collapse tests instead and keep the rest of the test bodies as written.

- [ ] **Step 6: Format and commit**

```bash
bunx biome check --write src
bun test
git add src/components/cc-limit-group-form.ts src/components/cc-limit-group-form.test.ts src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "feat(limits): add a limit group form that both adds and edits"
```

---

### Task 4: `cc-limit-group-table`

A new component that lists the groups with their owner, and asks the page to edit or delete one.

**Files:**
- Create: `src/components/cc-limit-group-table.ts`
- Create: `src/components/cc-limit-group-table.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `ownerOf(group)` from Task 1; `formatAmount` from `#lib/domain/money`.
- Produces: element `cc-limit-group-table`, class `CcLimitGroupTable`, properties `groups: LimitGroup[]`, `usage: Record<string, number>`, `counts: Record<string, number>`, events `edit-group` (detail: group id) and `remove-group` (detail: group id).

- [ ] **Step 1: Add the message**

In `src/lib/i18n/en.ts`, beside the other `limits.column.*` keys: `"limits.column.owner": "Owner",`
In `src/lib/i18n/th.ts`, in the matching place: `"limits.column.owner": "เจ้าของ",`

- [ ] **Step 2: Write the failing test file**

Create `src/components/cc-limit-group-table.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { CcLimitGroupTable } from "#components/cc-limit-group-table";
import "#components/cc-limit-group-table";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000, owner: "RI" },
	{ id: "solo", name: "SCB", limit: 100_000 },
];

const mount = async (overrides: Partial<Record<string, unknown>> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-group-table");
	element.groups = groups;
	element.usage = { pool: 200_000, solo: 0 };
	element.counts = { pool: 2, solo: 0 };
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows each group with what it has used and what is left", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("฿2,000.00");
	expect(text).toContain("฿3,000.00");
});

test("names the owner of each group, falling back to KC", async () => {
	const element = await mount();
	const cells = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(
			'td[data-field="owner"]',
		) ?? []),
	];
	expect(cells).toHaveLength(2);
	expect(cells[0]?.textContent?.trim()).toBe("RI");
	expect(cells[1]?.textContent?.trim()).toBe("KC");
});

test("asks the page to edit the group whose button was pressed", async () => {
	const element = await mount();
	let edited = "";
	element.addEventListener("edit-group", (event) => {
		edited = (event as CustomEvent<string>).detail;
	});

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="edit"][data-id="solo"]')
		?.click();

	expect(edited).toBe("solo");
});

test("offers Delete only on a group no card uses", async () => {
	const element = await mount();
	expect(
		element.shadowRoot?.querySelector('[data-action="remove"][data-id="pool"]'),
	).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("2 cards use this group");

	let removed = "";
	element.addEventListener("remove-group", (event) => {
		removed = (event as CustomEvent<string>).detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="remove"][data-id="solo"]')
		?.click();
	expect(removed).toBe("solo");
});

test("marks a group that is over its limit", async () => {
	const element = await mount({ usage: { pool: 600_000, solo: 0 } });
	const cell = element.shadowRoot?.querySelector('td[data-state="over"]');
	expect(cell?.textContent).toContain("-");
});

test("says so when there is no group yet", async () => {
	const element = await mount({ groups: [], usage: {}, counts: {} });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No limit group yet");
});

test("starts open, and stays closed once the reader closes it", async () => {
	const element = await mount();
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	if (!section) throw new Error("no details element");
	expect(section.open).toBe(true);

	section.open = false;
	element.usage = { pool: 300_000, solo: 0 };
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(false);
});

test("renders its headings in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Limit groups");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("กลุ่มวงเงิน");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/components/cc-limit-group-table.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the component**

Create `src/components/cc-limit-group-table.ts`:

```ts
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { formatAmount } from "#lib/domain/money";
import { ownerOf } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-limit-group-table")
export class CcLimitGroupTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
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

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: "edit-group" | "remove-group", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	override render() {
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed.
		return html`
			<details open>
				<summary>${t("limits.title")}</summary>
				<p><small>${t("limits.explain")}</small></p>
				${this.groups.length === 0 ? html`<p>${t("limits.empty")}</p>` : this.table()}
			</details>
		`;
	}

	private table() {
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("limits.column.name")}</th>
						<th>${t("limits.column.owner")}</th>
						<th data-numeric>${t("limits.column.limit")}</th>
						<th data-numeric>${t("limits.column.cards")}</th>
						<th data-numeric>${t("limits.column.used")}</th>
						<th data-numeric>${t("limits.column.available")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.groups.map((group) => this.row(group))}
				</tbody>
			</table>
		`;
	}

	private row(group: LimitGroup) {
		const used = this.usage[group.id] ?? 0;
		const available = group.limit - used;
		const count = this.counts[group.id] ?? 0;
		return html`
			<tr>
				<td data-label=${t("limits.column.name")}>${group.name}</td>
				<td data-field="owner" data-label=${t("limits.column.owner")}>${ownerOf(group)}</td>
				<td data-label=${t("limits.column.limit")} data-numeric>${formatAmount(group.limit)}</td>
				<td data-label=${t("limits.column.cards")} data-numeric>${count}</td>
				<td data-label=${t("limits.column.used")} data-numeric>${formatAmount(used)}</td>
				<td data-label=${t("limits.column.available")} data-numeric
					data-state=${available < 0 ? "over" : "within"}>${formatAmount(available)}</td>
				<td>
					<div class="actions" row>
						<button type="button" data-variant="quiet" data-action="edit" data-id=${group.id}
							@click=${() => this.emit("edit-group", group.id)}>${t("common.edit")}</button>
						${
							count === 0
								? html`<button type="button" data-variant="danger" data-action="remove" data-id=${group.id}
									@click=${() => this.emit("remove-group", group.id)}>${t("common.delete")}</button>`
								: html`<small>${t("limits.inUse", { count })}</small>`
						}
					</div>
				</td>
			</tr>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-group-table": CcLimitGroupTable;
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-limit-group-table.test.ts`
Expected: PASS

- [ ] **Step 6: Format and commit**

```bash
bunx biome check --write src
bun test
git add src/components/cc-limit-group-table.ts src/components/cc-limit-group-table.test.ts src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "feat(limits): add a limit group table that names each group's owner"
```

---

### Task 5: The /cards route uses the new pair

The route holds the group being edited, wires the two new components, and `cc-limit-groups` is deleted.

**Files:**
- Modify: `src/routes/cards.ts`
- Modify: `src/routes/cards.test.ts`
- Delete: `src/components/cc-limit-groups.ts`
- Delete: `src/components/cc-limit-groups.test.ts`

**Interfaces:**
- Consumes: `cc-limit-group-form` (property `group`, events `save-group`, `cancel`) and `cc-limit-group-table` (properties `groups`, `usage`, `counts`, events `edit-group`, `remove-group`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing route tests**

In `src/routes/cards.test.ts`, replace every `root.querySelector("cc-limit-groups")` with the right one of the two new elements: the tests that dispatch `save-group` use `cc-limit-group-form`, and the ones that dispatch `remove-group` or read `.groups` use `cc-limit-group-table`. Add `owner: "KC"` to the `LimitGroup` literals those tests compare against with `toEqual`, or drop the field from the dispatched detail — keep both sides of each assertion in step.

Then add:

```ts
test("feeds the group being edited to the form, and lets go once it is saved", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("cc-limit-group-table")
		?.dispatchEvent(new CustomEvent("edit-group", { detail: "pool" }));
	await settle();

	expect(root.querySelector("cc-limit-group-form")?.group?.id).toBe("pool");

	root.querySelector("cc-limit-group-form")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "pool", name: "KBank account", limit: 700_000, owner: "NT" },
		}),
	);
	await settle();

	expect(root.querySelector("cc-limit-group-form")?.group).toBeNull();
	expect(await repo.listLimitGroups()).toEqual([
		{ id: "pool", name: "KBank account", limit: 700_000, owner: "NT" },
	]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/cards.test.ts`
Expected: FAIL — the route still renders `cc-limit-groups`.

- [ ] **Step 3: Rewire the route**

In `src/routes/cards.ts`:

Replace the `#components/cc-limit-groups` import with both new ones, keeping the import block sorted:

```ts
import "#components/cc-limit-group-form";
import "#components/cc-limit-group-table";
```

Add beside `let editing: Card | null = null;`:

```ts
let editingGroup: LimitGroup | null = null;
```

Replace `onSaveGroup`, and add `onEditGroup`:

```ts
	const onSaveGroup = (event: CustomEvent<LimitGroup>) =>
		state.guard(async () => {
			await repo.saveLimitGroup(event.detail);
			editingGroup = null;
		}, "cards.error.saveGroup");

	const onEditGroup = (event: CustomEvent<string>) => {
		editingGroup = groups.find((group) => group.id === event.detail) ?? null;
		paint();
	};
```

Replace the single `<article>` holding `cc-limit-groups` with two:

```ts
				<article>
					<cc-limit-group-form
						.group=${editingGroup}
						@save-group=${onSaveGroup}
						@cancel=${() => {
							editingGroup = null;
							paint();
						}}
					></cc-limit-group-form>
				</article>
				<article>
					<cc-limit-group-table
						.groups=${groups}
						.usage=${usage()}
						.counts=${groupCounts()}
						@edit-group=${onEditGroup}
						@remove-group=${onRemoveGroup}
					></cc-limit-group-table>
				</article>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/routes/cards.test.ts`
Expected: PASS

- [ ] **Step 5: Delete the old component**

```bash
git rm src/components/cc-limit-groups.ts src/components/cc-limit-groups.test.ts
```

Then check nothing still names it:

Run: `grep -rn "cc-limit-groups" src docs`
Expected: no hits in `src`. Hits in `docs/superpowers/` are historical records of earlier work and stay as they are.

- [ ] **Step 6: Run the whole suite**

Run: `bun test`
Expected: PASS, 0 failures.

- [ ] **Step 7: Format and commit**

```bash
bunx biome check --write src
bun test
git add src
git commit -m "refactor(limits): edit a group through the form, like a card"
```

---

### Task 6: The card form and card table collapse too

The last two sections get the same treatment, and the route's own heading above the card form goes away.

**Files:**
- Modify: `src/components/cc-card-form.ts`
- Modify: `src/components/cc-card-form.test.ts`
- Modify: `src/components/cc-card-table.ts`
- Modify: `src/components/cc-card-table.test.ts`
- Modify: `src/routes/cards.ts`
- Modify: `src/routes/cards.test.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: the `<details>` pattern from Tasks 3 and 4.
- Produces: no new events or properties; `cc-card-form` titles itself, so the route no longer renders an `<h2>` above it.

- [ ] **Step 1: Add the message**

In `src/lib/i18n/en.ts`, beside `"cards.title"`: `"cards.list": "Card list",`
In `src/lib/i18n/th.ts`, in the matching place: `"cards.list": "รายการบัตร",`

- [ ] **Step 2: Write the failing tests**

In `src/components/cc-card-form.test.ts`, add:

```ts
test("starts closed and titles itself, opening when a card arrives to edit", async () => {
	const element = await mount();
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	expect(section?.open).toBe(false);
	expect(element.shadowRoot?.querySelector("summary")?.textContent).toContain(
		"Add a card",
	);

	element.card = {
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	};
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(true);
	expect(element.shadowRoot?.querySelector("summary")?.textContent).toContain(
		"KBank Visa",
	);
});
```

In `src/components/cc-card-table.test.ts`, add:

```ts
test("starts open, and stays closed once the reader closes it", async () => {
	const element = await mount([card]);
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	if (!section) throw new Error("no details element");
	expect(section.open).toBe(true);

	section.open = false;
	element.purchaseCounts = { kbank: 4 };
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/components/cc-card-form.test.ts src/components/cc-card-table.test.ts`
Expected: FAIL — neither component renders a `<details>`.

- [ ] **Step 4: Wrap the card form**

In `src/components/cc-card-form.ts`, add to its `css` block:

```css
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}
```

Add beside the other `@state` fields:

```ts
	// The reader's own answer to "is this section open": forced open when an edit target
	// arrives, and otherwise following the element's own toggle event, so a section closed by
	// hand stays closed through every later repaint.
	@state() private open = false;
```

In `willUpdate`, inside the existing `if (changed.has("card")) {` branch, add `if (this.card) this.open = true;` before its `return`.

In `render()`, wrap the existing `<form>` (unchanged inside) in:

```ts
			<details ?open=${this.open} @toggle=${(event: Event) => {
				this.open = (event.target as HTMLDetailsElement).open;
			}}>
				<summary>${card ? t("cards.edit", { name: card.name }) : t("cards.add")}</summary>
				<!-- the existing <form> goes here, untouched -->
			</details>
```

- [ ] **Step 5: Wrap the card table**

In `src/components/cc-card-table.ts`, add the same `details` and `summary` rules to its `css` block, then replace the top of `render()`:

```ts
	override render() {
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed.
		return html`
			<details open>
				<summary>${t("cards.list")}</summary>
				${this.cards.length === 0 ? html`<p>${t("cards.empty")}</p>` : this.table()}
			</details>
		`;
	}

	private table() {
		return html`
			<table>
```

…moving the existing `<table>` markup into `table()` unchanged, ending with `</table>`, and deleting the old early `if (this.cards.length === 0)` return.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/components/cc-card-form.test.ts src/components/cc-card-table.test.ts`
Expected: PASS

- [ ] **Step 7: Drop the route's heading**

In `src/routes/cards.ts`, delete this line from the card form's `<article>`:

```ts
					<h2>${editing ? t("cards.edit", { name: editing.name }) : t("cards.add")}</h2>
```

If a test in `src/routes/cards.test.ts` asserts on that `<h2>`, point it at the form's own summary instead: `root.querySelector("cc-card-form")?.shadowRoot?.querySelector("summary")?.textContent`.

- [ ] **Step 8: Run the whole suite**

Run: `bun test`
Expected: PASS, 0 failures.

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Format and commit**

```bash
bunx biome check --write src
bun test
git add src
git commit -m "feat(cards): let every section on the registry page collapse"
```

---

### Task 7: See it working

**Files:** none changed unless a defect turns up.

- [ ] **Step 1: Run the app**

Run: `bun run dev` (check `package.json` for the real script name first) and open `/cards`.

- [ ] **Step 2: Walk the flow**

Add a limit group with owner `NT`. Confirm it appears in the table with `NT` in the Owner column. Add a card pointing at it and confirm the card table's Owner column reads `NT`. Edit the group's owner to `RI`, save, and confirm both tables follow. Collapse each of the four sections and confirm that adding a card does not reopen the ones you closed. Switch to Thai and confirm every heading, column and error is translated.

- [ ] **Step 3: Report**

Report what you saw. Any defect becomes a fix with its own failing test first, in the task that owns the code.
