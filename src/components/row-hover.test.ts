import { expect, test } from "bun:test";
import "#components/cc-needs-you";
import "#components/cc-pay-picker";
import "#components/cc-tx-ledger";
import "#components/cc-owed-list";
import "#components/cc-list-index";
import "#components/cc-ready-picker";
import "#components/cc-ready-panel";
import "#components/cc-cards-list";
import { rowPanel } from "#styles/shared";

// DD-105: a row that is a link or a button shows a quiet ground on hover, never an underline,
// and keeps its focus ring (UI-16).
const stylesOf = (tag: string) => {
	const element = customElements.get(tag) as unknown as {
		elementStyles: { cssText: string }[];
	};
	return element.elementStyles.map((s) => s.cssText).join("\n");
};

const hoverRules = (text: string) =>
	[...text.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)].map(
		([, selector, body]) => ({ selector: selector?.trim(), body: body ?? "" }),
	);

test("the row panel's rows hover with a ground and keep a focus ring", () => {
	const rules = hoverRules(rowPanel.cssText).filter(
		({ selector }) => selector?.includes(".crow") && !selector.includes(".tag"),
	);
	expect(rules.length).toBeGreaterThan(0);
	for (const { body } of rules) {
		expect(body).not.toContain("underline");
		expect(body).toContain("background: var(--cc-surface-sunken)");
	}
	expect(rowPanel.cssText).toMatch(
		/\.crow:any-link:focus-visible\s*\{\s*box-shadow: var\(--cc-focus-ring\)/,
	);
});

test("Needs you, the payment picker and the ledger never underline a row on hover", () => {
	for (const tag of ["cc-needs-you", "cc-pay-picker", "cc-tx-ledger"]) {
		const rows = hoverRules(stylesOf(tag)).filter(
			({ selector }) =>
				selector?.includes(".item") ||
				selector?.includes("button[data-card]") ||
				selector?.includes(".hit") ||
				selector?.includes(".a-hit"),
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const { body } of rows) {
			expect(body).not.toContain("text-decoration: underline");
		}
		expect(
			rows.some(({ body }) => body.includes("var(--cc-surface-sunken)")),
		).toBe(true);
	}
});

// An opening row's head is a `button.a-hit` (Needs you, the ledger): it hovers with the ground
// out to the panel's edges, never an underline, and keeps its focus ring.
test("an opening row's button head hovers with a ground and keeps a focus ring", () => {
	for (const tag of ["cc-needs-you", "cc-tx-ledger"]) {
		const text = stylesOf(tag);
		const heads = hoverRules(text).filter(
			({ selector }) =>
				selector?.includes("button") && selector.includes(".a-hit"),
		);
		expect(heads.length).toBeGreaterThan(0);
		for (const { body } of heads) expect(body).not.toContain("underline");
		expect(
			heads.some(
				({ selector, body }) =>
					selector?.includes(".a-row:has(") &&
					body.includes("background: var(--cc-surface-sunken)") &&
					BLEED.test(body),
			),
		).toBe(true);
		expect(text).toMatch(
			/button\.a-hit:focus-visible[^{]*\{\s*box-shadow: var\(--cc-focus-ring\)/,
		);
	}
});

// DD-109: the hovered ground reaches the panel's inner edges (the panel's side padding,
// `--cc-space-4`), the panel clips it at its rounded corners, and a neutral badge or icon
// tile, whose fill is the hover ground, turns to the surface so it stays visible.
const BLEED =
	/calc\(var\(--cc-space-4\) \* -1\) 0 0 var\(--cc-surface-sunken\),\s*var\(--cc-space-4\) 0 0 var\(--cc-surface-sunken\)/;

test("every row list's hover reaches the panel's edges and keeps its badge", () => {
	for (const tag of [
		"cc-needs-you",
		"cc-pay-picker",
		"cc-tx-ledger",
		"cc-owed-list",
		"cc-list-index",
	]) {
		const text = stylesOf(tag);
		const grounds = hoverRules(text).filter(({ body }) =>
			body.includes("background: var(--cc-surface-sunken)"),
		);
		expect(grounds.length).toBeGreaterThan(0);
		for (const { body } of grounds) expect(body).toMatch(BLEED);
		expect(text).toMatch(/overflow: clip/);
		expect(
			hoverRules(text).some(
				({ selector, body }) =>
					selector?.includes(".tag") &&
					body.includes("background: var(--cc-surface)"),
			),
		).toBe(true);
	}
});

// DD-151: a card tile hovers by deepening its edge in its own colour, never an underline, and
// keeps its focus ring.
test("card tiles hover without an underline and keep a focus ring", () => {
	for (const tag of ["cc-ready-panel", "cc-ready-picker", "cc-cards-list"]) {
		const text = stylesOf(tag);
		const rules = hoverRules(text).filter(({ selector }) =>
			selector?.includes(".tile"),
		);
		expect(rules.length).toBeGreaterThan(0);
		for (const { body } of rules) {
			expect(body).toContain("text-decoration: none");
			expect(body).toContain("border-color");
		}
		expect(text).toMatch(
			/\.tile:focus-visible\s*\{[^}]*box-shadow: var\(--cc-focus-ring\)/,
		);
	}
});

test("the ledger's rows are the opening row: they stack below 900px, with no row of their own", () => {
	const text = stylesOf("cc-tx-ledger");
	// The row is one column at every width: the head button is its only child.
	expect(text).toMatch(
		/\.a-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
	);
	expect(text).not.toContain(".a-right");
	expect(text).toMatch(
		/@media \(max-width: 899\.98px\)\s*\{[^@]*\.a-details \.a-btns\s*\{[^}]*flex-direction: column/,
	);
	expect(text).not.toMatch(/\.crow\[data-kind\]/);
	expect(text).not.toContain(".pay-right");
	// The details line up with the text past the card chip: the chip's width and the gap.
	expect(text).toMatch(
		/\.a-wrap\s*\{[^}]*--a-lead-inline: calc\(var\(--cc-space-5\) \+ var\(--cc-space-3\) \+ var\(--cc-space-3\)\)/,
	);
});

// Every row kind keeps its dividing line: the divider rule comes after `.crow`'s `border: 0`
// reset and out-ranks it and a picker's `button[data-card]` reset (computed styles are out of
// happy-dom's reach, so this reads the CSS text).
test("a row panel's divider follows the row resets and out-ranks them", () => {
	const text = rowPanel.cssText;
	const divider = ".panel > * + :is(.crow, button, a, div, section, article) {";
	expect(text).toContain(divider);
	expect(text.indexOf(divider)).toBeGreaterThan(text.indexOf(".crow {"));
	// (0,2,0): the panel class plus the `:is()` of a class, above `.crow` (0,1,0) and
	// `button[data-card]` (0,1,1).
	const after = text.slice(text.indexOf(divider));
	expect(after).toMatch(
		/^[^}]*border-top: var\(--cc-border-width\) solid var\(--cc-border\)/,
	);
	const picker = stylesOf("cc-pay-picker");
	expect(picker).not.toMatch(/button\[data-card\] \+/);
});
