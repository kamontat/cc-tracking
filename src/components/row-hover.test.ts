import { expect, test } from "bun:test";
import "#components/cc-needs-you";
import "#components/cc-pay-picker";
import "#components/cc-tx-ledger";
import "#components/cc-owed-list";
import "#components/cc-list-index";
import "#components/cc-ready-picker";
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
		"cc-ready-picker",
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

test("the action row stacks its figure and button under the text below 900px", () => {
	const text = stylesOf("cc-tx-ledger");
	expect(text).toMatch(
		/@media \(max-width: 899\.98px\)\s*\{[^@]*\.a-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
	);
	expect(text).toMatch(
		/@media \(max-width: 899\.98px\)\s*\{[^@]*\.crow\[data-kind\]\s*\{/,
	);
});
