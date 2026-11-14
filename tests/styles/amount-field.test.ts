import { expect, test } from "vitest"

/**
 * Every amount field is the one look (DD-214): `฿` then the figure, large and bold, in a sunken
 * box that draws the focus. The look is app.css's `.amount-box` and `.amount-in`, never a local
 * copy, so changing it changes every place at once.
 */
const root = `${import.meta.dirname}/../..`
const read = (path: string) => Bun.file(`${root}/${path}`).text()

/** The components with an amount field, and the attribute that picks it out. */
const FIELDS: Record<string, string> = {
	"src/components/organisms/ListAmounts.svelte": 'data-field="amount"',
	"src/components/organisms/ListReply.svelte": 'data-field="actual"',
	"src/components/organisms/PurchaseForm.svelte": 'name="amount"',
	"src/components/organisms/PayForm.svelte": 'name="amount"',
}

test("app.css holds the amount field's look: the box and the baht-then-figure line", async () => {
	const app = await read("src/styles/app.css")
	expect(app).toMatch(/\.amount-box\s*\{[^}]*background: var\(--cc-surface-sunken\)/)
	expect(app).toMatch(/\.amount-box[^{]*:has\(input:focus-visible\)\s*\{[^}]*box-shadow: var\(--cc-focus-ring\)/)
	expect(app).toMatch(/\.amount-box\[data-bad\]\s*\{[^}]*var\(--cc-danger\)/)
	expect(app).toMatch(/\.amount-in input\s*\{[^}]*font-size: var\(--cc-text-xl\)/)
})

for (const [path, field] of Object.entries(FIELDS)) {
	test(`${path.split("/").at(-1)}: its amount sits in .amount-in inside an .amount-box, with no local look`, async () => {
		const source = await read(path)
		// The markup only: the script may name the field in a query.
		const markup = source.slice(source.indexOf("</script>"))
		const at = markup.indexOf(field)
		expect(at).toBeGreaterThan(-1)
		// From the field's box down to it, nothing closes but the baht sign.
		const before = markup.slice(0, at)
		const box = before.lastIndexOf("amount-box")
		const line = before.lastIndexOf("amount-in")
		expect(box).toBeGreaterThan(-1)
		expect(line).toBeGreaterThanOrEqual(box)
		expect(before.slice(line)).toContain('<span aria-hidden="true">฿</span>')
		const between = before.slice(box).replace('<span aria-hidden="true">฿</span>', "")
		expect(between.match(/<\/(label|span|div)>/g) ?? []).toEqual([])
		// No local copy of the figure's size or the box's ground.
		const style = source.slice(source.indexOf("<style>"))
		expect(style).not.toMatch(/\.amount-(box|in)\b/)
		expect(style).not.toContain(".real-input")
		expect(style).not.toContain(".bigin")
	})
}
