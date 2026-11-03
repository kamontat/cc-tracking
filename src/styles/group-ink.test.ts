import { expect, test } from "bun:test";
import { GROUP_COLORS } from "#lib/domain/group-color";
import { groupInk } from "#styles/shared";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

test("groupInk has a rule for each of the twelve colours", () => {
	for (const name of GROUP_COLORS) {
		expect(groupInk.cssText).toContain(`[data-g="${name}"]`);
		expect(groupInk.cssText).toContain(`--g-bg: var(--cc-group-${name})`);
		expect(groupInk.cssText).toContain(`--g-fg: var(--cc-group-${name}-text)`);
		expect(groupInk.cssText).toContain(
			`--g-soft: var(--cc-group-${name}-soft)`,
		);
	}
});

test("app.css carries the same rules for the light-DOM pages", async () => {
	const app = await read("./app.css");
	for (const name of GROUP_COLORS) {
		expect(app).toContain(`[data-g="${name}"]`);
	}
});

test("no stylesheet still names the four old group colours or a numbered data-g", async () => {
	const glob = new Bun.Glob("**/*.{ts,css}");
	const root = new URL("../", import.meta.url).pathname;
	for await (const file of glob.scan(root)) {
		if (file.endsWith(".test.ts")) continue;
		const body = await Bun.file(`${root}${file}`).text();
		expect(body, file).not.toMatch(/--cc-group-[1-4]\b/);
		expect(body, file).not.toMatch(/data-g="[1-4]"/);
	}
});
