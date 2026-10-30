import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Every page sets the saved theme before the first paint, or a reader who picked dark sees a
 * light flash while the bundle loads. The script is inline for that reason, and it must agree
 * with `getTheme()` and `applyTheme()` in `src/lib/ui/theme.ts` on every input.
 */
const pages = [...new Glob("*.html").scanSync(import.meta.dir)].sort();

const read = (page: string) => Bun.file(`${import.meta.dir}/${page}`).text();

const BOOT = /<script data-theme-boot>([\s\S]*?)<\/script>/g;

const bootsOf = (html: string) =>
	[...html.matchAll(BOOT)].map((m) => m[1] ?? "");

const run = (text: string, getItem: () => string | null) => {
	const root = document.createElement("html");
	const storage = { getItem };
	new Function("localStorage", "document", text)(storage, {
		documentElement: root,
	});
	return root.getAttribute("data-theme");
};

const bootText = async () => {
	const [first] = bootsOf(await read(pages[0] as string));
	return first as string;
};

test("every page carries the same theme script", async () => {
	expect(pages.length).toBeGreaterThan(0);
	const texts = new Set<string>();
	for (const page of pages) {
		const boots = bootsOf(await read(page));
		expect(boots, page).toHaveLength(1);
		texts.add(boots[0] as string);
	}
	expect(texts.size).toBe(1);
});

test("the script runs before anything paints", async () => {
	for (const page of pages) {
		const html = await read(page);
		const at = html.indexOf("<script data-theme-boot>");
		expect(at, page).toBeGreaterThan(-1);
		expect(at, page).toBeLessThan(html.indexOf("<link"));
		expect(at, page).toBeLessThan(html.indexOf('<script type="module"'));
	}
});

test("a saved dark theme is set before paint", async () => {
	expect(run(await bootText(), () => "dark")).toBe("dark");
});

test("a saved light theme is set before paint", async () => {
	expect(run(await bootText(), () => "light")).toBe("light");
});

test("system and unknown values leave the device in charge", async () => {
	const text = await bootText();
	for (const saved of ["system", "sepia", null]) {
		expect(
			run(text, () => saved),
			String(saved),
		).toBeNull();
	}
});

test("blocked storage fails safe", async () => {
	const text = await bootText();
	expect(
		run(text, () => {
			throw new Error("SecurityError");
		}),
	).toBeNull();
});
