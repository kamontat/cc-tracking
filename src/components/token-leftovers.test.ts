import { expect, test } from "bun:test";
import "#components/cc-card-hero";
import "#components/cc-card-form";
import "#components/cc-pay-form";
import "#components/cc-cards-filter";

/** UI-01: component CSS takes its values from tokens.css, not from literals. */
const tags = ["cc-card-hero", "cc-card-form", "cc-pay-form", "cc-cards-filter"];

const cssOf = (tag: string) =>
	String((customElements.get(tag) as unknown as { styles: unknown[] }).styles);

test("no component css carries a literal em or a border-width multiple", () => {
	for (const tag of tags) {
		const css = cssOf(tag);
		expect(css, tag).not.toMatch(/\d(?:\.\d+)?em\b/);
		expect(css, tag).not.toContain("calc(var(--cc-border-width) *");
	}
});

test("the header height and the sub-header offset share one derivation", async () => {
	const tokens = await Bun.file(
		`${import.meta.dir}/../styles/tokens.css`,
	).text();
	expect(tokens).not.toMatch(/--cc-header-height:\s*3\.25rem/);
	expect(tokens).toMatch(/--cc-header-height:\s*calc\(/);
});
