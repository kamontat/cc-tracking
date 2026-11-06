import { expect, test } from "vitest"

/**
 * + New's menu is an HTML popover (PRD DD-173). The browser hides it while closed and draws it
 * in the top layer when open, so these hold app.css to that: no display of its own while
 * closed, a place against the viewport above the button, and the + turned while open.
 */
const css = async () => (await Bun.file("src/styles/app.css").text()).replace(/\/\*[\s\S]*?\*\//g, "")

/** The body of the first rule whose whole selector is exactly `selector`. */
const rule = (text: string, selector: string) => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

test("the closed menu is hidden outright, over the reset's flex on every div", async () => {
	// The browser hides a closed popover with its own rule, but @kcstyles/reset.css's
	// `div { display: flex }` is an author rule and outranks it: without this the closed menu
	// sits there, transparent, catching taps above the button.
	const text = await css()
	expect(rule(text, ".fab-menu__list") ?? "").not.toMatch(/(^|[;\s])display:/)
	expect(rule(text, ".fab-menu__list:not(:popover-open)")).toMatch(/display:\s*none/)
})

test("the open menu is a column of its two actions", async () => {
	expect(rule(await css(), ".fab-menu__list:popover-open")).toMatch(/display:\s*flex/)
})

test("the open menu is placed against the viewport, over the button, not centred", async () => {
	const base = rule(await css(), ".fab-menu__list") ?? ""
	expect(base).toMatch(/position:\s*fixed/)
	expect(base).toMatch(/inset:\s*auto/)
	expect(base).toMatch(/margin:\s*0/)
	expect(base).toMatch(/right:\s*var\(--fab-right\)/)
	expect(base).toMatch(/bottom:\s*calc\(var\(--fab-bottom\) \+ var\(--cc-bar-height\) \+ var\(--cc-space-2\)\)/)
})

test("the + turns to a × while the menu is open", async () => {
	expect(rule(await css(), ".fab-menu:has(.fab-menu__list:popover-open) .fab__plus")).toMatch(
		/transform:\s*rotate\(45deg\)/,
	)
})

test("none of the scripted menu's states are left", async () => {
	const text = await css()
	expect(text).not.toMatch(/\.fab-menu__list\[hidden\]|data-state="closing"|\.fab\[aria-expanded/)
	expect(text).not.toMatch(/data-(pay|list|form)-page/)
})
