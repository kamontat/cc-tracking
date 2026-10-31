import { expect, test } from "bun:test";
import "#components/cc-needs-you";
import "#components/cc-pay-picker";
import "#components/cc-tx-ledger";
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
	const rules = hoverRules(rowPanel.cssText).filter(({ selector }) =>
		selector?.includes(".crow"),
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
