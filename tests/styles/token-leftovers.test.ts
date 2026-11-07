import { expect, test } from "vitest"

/** UI-01: component CSS takes its values from tokens.css, not from literals. */

// The Svelte components converted from the Lit ones this used to check take the same rule.
test.each([
	"src/components/organisms/CardsFilter.svelte",
	"src/components/organisms/CardForm.svelte",
	"src/components/organisms/CardHero.svelte",
	"src/components/organisms/PayForm.svelte",
])("%s carries no literal em or border-width multiple", async (path) => {
	const css = (await Bun.file(path).text()).split("<style>")[1] ?? ""
	expect(css).not.toMatch(/\d(?:\.\d+)?em\b/)
	expect(css).not.toContain("calc(var(--cc-border-width) *")
})

test("the header height and the sub-header offset share one derivation", async () => {
	const tokens = await Bun.file("src/styles/tokens.css").text()
	expect(tokens).not.toMatch(/--cc-header-height:\s*3\.25rem/)
	expect(tokens).toMatch(/--cc-header-height:\s*calc\(/)
})
