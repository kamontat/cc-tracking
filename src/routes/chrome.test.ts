import { expect, test } from "bun:test";
import { Glob } from "bun";

/** Build details live in Settings > About, so no page carries a footer of its own. */
test("no route page carries a footer", async () => {
	const offenders: string[] = [];

	for await (const path of new Glob("src/routes/**/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		if (source.includes("<cc-site-footer")) offenders.push(path);
	}

	expect(offenders).toEqual([]);
});

/** The shell renders into these three slots, so every route page must carry all of them. */
test("every route page carries the shell slots", async () => {
	const problems: string[] = [];

	for await (const path of new Glob("src/routes/**/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		for (const id of ["site-header", "page", "tabbar"]) {
			if (!source.includes(`id="${id}"`)) problems.push(`${path}: no #${id}`);
		}
		if (source.includes("site-header__nav")) {
			problems.push(`${path}: old site-header__nav`);
		}
	}

	expect(problems).toEqual([]);
});

/** Language and theme are picked on the settings page, not in every page's header. */
test("no route page carries a language picker in its header", async () => {
	const offenders: string[] = [];

	for await (const path of new Glob("src/routes/**/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		if (source.includes("<cc-lang-switch>")) offenders.push(path);
	}

	expect(offenders).toEqual([]);
});

/**
 * The dark palette is written twice in tokens.css -- once for a device in dark mode with no
 * explicit pick, once for an explicit dark pick -- because CSS cannot share one declaration
 * block between a media query and a plain selector. This keeps the two copies identical.
 */
const tokens = await Bun.file("src/styles/tokens.css").text();

const blockAfter = (marker: string): string => {
	const at = tokens.indexOf(marker);
	if (at < 0) throw new Error(`no ${marker} in tokens.css`);
	const start = tokens.indexOf("{", at);
	let depth = 0;
	for (let index = start; index < tokens.length; index++) {
		if (tokens[index] === "{") depth++;
		if (tokens[index] === "}" && --depth === 0) {
			return tokens.slice(start + 1, index);
		}
	}
	throw new Error(`unclosed block after ${marker}`);
};

const declarations = (block: string) =>
	block
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split(";")
		.map((line) => line.trim())
		.filter(Boolean);

const names = (block: string) =>
	declarations(block).map((line) => line.slice(0, line.indexOf(":")).trim());

test("both dark palettes in the tokens declare the same values", () => {
	const system = declarations(blockAfter(':root:not([data-theme="light"])'));
	const picked = declarations(blockAfter(':root[data-theme="dark"]'));

	expect(system.length).toBeGreaterThan(0);
	expect(picked).toEqual(system);
});

test("every build but production has a tint", () => {
	for (const env of ["development", "local", "preview"]) {
		const found = names(blockAfter(`:root[data-env="${env}"]`));
		expect(found).toContain("--cc-env");
	}
});

test("group pastels exist in both themes", () => {
	const wanted = [1, 2, 3, 4].flatMap((n) => [
		`--cc-group-${n}`,
		`--cc-group-${n}-text`,
	]);
	for (const block of [
		blockAfter(":root {"),
		blockAfter(':root[data-theme="dark"]'),
	]) {
		expect(names(block)).toEqual(expect.arrayContaining(wanted));
	}
});

test("dark palettes only override tokens the light palette defines", () => {
	const light = names(blockAfter(":root {"));
	for (const name of names(blockAfter(':root[data-theme="dark"]'))) {
		if (name === "color-scheme") continue;
		expect(light).toContain(name);
	}
});

test("leading leaves room for Thai", () => {
	const light = declarations(blockAfter(":root {"));
	const value = (name: string) =>
		light
			.find((line) => line.startsWith(`${name}:`))
			?.split(":")[1]
			?.trim() ?? "";
	expect(Number.parseFloat(value("--cc-leading"))).toBeGreaterThanOrEqual(1.65);
	expect(value("--cc-font-sans")).toContain('"Noto Sans Thai"');
});

test("the page ends with room for the floating + New button, on a phone and from 900px", async () => {
	const css = await Bun.file("src/styles/app.css").text();
	const rule = (from: number) => {
		const block = css.slice(css.indexOf("\n.page {", from));
		return block.slice(0, block.indexOf("}"));
	};
	const phone = rule(0);
	for (const token of [
		"--cc-tabbar-height",
		"--cc-bar-height",
		"safe-area-inset-bottom",
	])
		expect(phone).toContain(token);
	const wide = css.slice(css.indexOf("From 900px the bar is gone"));
	const wideRule = wide.slice(0, wide.indexOf("}\n}"));
	for (const token of ["--cc-bar-height", "safe-area-inset-bottom"])
		expect(wideRule).toContain(token);
});
