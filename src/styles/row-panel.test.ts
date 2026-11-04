import { expect, test } from "bun:test";
import { rowPanel, setRows } from "#styles/shared";

const app = await Bun.file(new URL("./app.css", import.meta.url)).text();

/** The declarations of the first rule whose selector list holds `selector` exactly. */
const rule = (css: string, selector: string): Map<string, string> => {
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = (match[1] ?? "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split(",")
			.map((s) => s.trim());
		if (!selectors.includes(selector)) continue;
		const out = new Map<string, string>();
		for (const line of (match[2] ?? "").split(";")) {
			const at = line.indexOf(":");
			if (at > 0) out.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
		}
		return out;
	}
	throw new Error(`no rule for ${selector}`);
};

const panel = rule(rowPanel.cssText, ".panel");

test(".row-panel carries the shadow panel's ground, border, radius and padding", () => {
	const light = rule(app, ".row-panel");
	for (const prop of ["background", "border", "border-radius", "padding"]) {
		expect(light.get(prop)).toBeDefined();
		expect(light.get(prop)).toBe(panel.get(prop));
	}
	expect(light.get("padding")).toBe("0 var(--cc-space-4)");
});

test(".row-panel's divider matches rowPanel's, and outranks a row's border reset", () => {
	const shadow = rule(rowPanel.cssText, ".panel > * + *").get("border-top");
	expect(rule(app, ".row-panel > * + *").get("border-top")).toBe(shadow);
	expect(rule(app, ".page .row-panel > * + *").get("border-top")).toBe(shadow);
});

test(".set and .saved-lines take the panel from .row-panel", () => {
	for (const name of [".set", ".saved-lines"]) {
		expect(rule(app, name).get("border")).toBe(panel.get("border"));
		expect(rule(app, name).get("padding")).toBe("0 var(--cc-space-4)");
	}
	expect(() => rule(app, ".saved-lines li + li")).toThrow();
});

test("setRows draws the same divider as rowPanel", () => {
	const shadow = rule(rowPanel.cssText, ".panel > * + *").get("border-top");
	expect(rule(setRows.cssText, ".set-row + .set-row").get("border-top")).toBe(
		shadow,
	);
});
