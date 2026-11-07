import { expect, test } from "vitest"

/**
 * Every page (through BaseLayout) sets the saved theme before the first paint, or a reader who picked dark sees a
 * light flash while the bundle loads. The script is inline for that reason, and it must agree
 * with `getTheme()` and `applyTheme()` in `src/lib/ui/theme.ts` on every input.
 */
const LAYOUT = "src/layouts/BaseLayout.astro"

const BOOT = /<script is:inline data-astro-rerun data-theme-boot>([\s\S]*?)<\/script>/g

const bootsOf = (html: string) => [...html.matchAll(BOOT)].map((m) => m[1] ?? "")

const run = (text: string, getItem: () => string | null) => {
	const root = document.createElement("html")
	const storage = { getItem }
	new Function("localStorage", "document", text)(storage, {
		documentElement: root,
	})
	return root.getAttribute("data-theme")
}

const bootText = async () => {
	const [first] = bootsOf(await Bun.file(LAYOUT).text())
	return first as string
}

// Every page renders through BaseLayout; tests/pages/pages.test.ts checks the script is
// there once, ahead of the first stylesheet.
test("the layout carries one theme script", async () => {
	expect(bootsOf(await Bun.file(LAYOUT).text())).toHaveLength(1)
})

test("a saved dark theme is set before paint", async () => {
	expect(run(await bootText(), () => "dark")).toBe("dark")
})

test("a saved light theme is set before paint", async () => {
	expect(run(await bootText(), () => "light")).toBe("light")
})

test("system and unknown values leave the device in charge", async () => {
	const text = await bootText()
	for (const saved of ["system", "sepia", null]) {
		expect(
			run(text, () => saved),
			String(saved),
		).toBeNull()
	}
})

test("blocked storage fails safe", async () => {
	const text = await bootText()
	expect(
		run(text, () => {
			throw new Error("SecurityError")
		}),
	).toBeNull()
})

const runEnv = (text: string, hostname: string) => {
	const root = document.createElement("html")
	new Function("localStorage", "document", "location", text)(
		{ getItem: () => null },
		{ documentElement: root },
		{ hostname },
	)
	return root.getAttribute("data-env")
}

test("the layout tints the build before paint", async () => {
	expect(await bootText()).toContain("data-env")
})

test("the hostname picks the tint", async () => {
	const text = await bootText()
	expect(runEnv(text, "localhost")).toBe("local")
	expect(runEnv(text, "127.0.0.1")).toBe("local")
	expect(runEnv(text, "pr-12-cc-tracking.kcinth.workers.dev")).toBe("preview")
	expect(runEnv(text, "cc-tracking.kcinth.workers.dev")).toBe("production")
	expect(runEnv(text, "example.com")).toBe("production")
})

test("a failing location never breaks the page", async () => {
	const root = document.createElement("html")
	const text = await bootText()
	expect(() =>
		new Function("localStorage", "document", "location", text)(
			{ getItem: () => "dark" },
			{ documentElement: root },
			undefined,
		),
	).not.toThrow()
	expect(root.getAttribute("data-theme")).toBe("dark")
})
