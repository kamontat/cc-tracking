import type { GlanceFigure } from "#lib/ui/glance"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import GlancePanel from "#components/molecules/GlancePanel.svelte"

/**
 * The glance panel Cards and Transactions share: one panel, a title, then its figures in a grid
 * split by hairlines, each a label over its figure, with a note or a usage bar under it.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (title: string, figures: GlanceFigure[], testid?: string, aside?: string) => {
	mounted = mount(GlancePanel, { target: document.body, props: { title, figures, testid, aside } })
	flushSync()
	return document.querySelector<HTMLElement>("section.glance")
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("a titled panel of figures: a label, the figure in its tone, and its note", () => {
	const panel = show(
		"October so far",
		[
			{ field: "purchases", label: "Purchases", text: "−฿1,250.00", tone: "out" },
			{ field: "soon", label: "Due in 7 days", text: "฿2,000.00", tone: "warn", note: "1 card" },
		],
		"summary",
	)
	expect(panel?.getAttribute("data-testid")).toBe("summary")
	expect(panel?.getAttribute("aria-labelledby")).toBe(panel?.querySelector("h2")?.id)
	expect(flat(panel?.querySelector("h2"))).toBe("October so far")
	expect(panel?.querySelector(".glance__figures")?.getAttribute("data-count")).toBe("2")
	const soon = panel?.querySelector('[data-field="soon"]')
	expect(flat(soon?.querySelector("dt"))).toBe("Due in 7 days")
	expect(soon?.querySelector("b")?.textContent).toBe("฿2,000.00")
	expect(soon?.querySelector("b")?.getAttribute("data-tone")).toBe("warn")
	expect(soon?.querySelector("b")?.hasAttribute("data-numeric")).toBe(true)
	expect(flat(soon?.querySelector(".glance__note"))).toBe("1 card")
	expect(panel?.querySelector('[data-field="purchases"] .glance__note')).toBeNull()
	expect(panel?.querySelector(".glance__bar")).toBeNull()
	expect(panel?.querySelector(".glance__aside")).toBeNull()
})

test("an aside, when given, ends the title row: the dates the figures cover", () => {
	const panel = show("23 matching entries", [], undefined, "1 Nov – 30 Nov 2026")
	expect(flat(panel?.querySelector(".glance__head h2"))).toBe("23 matching entries")
	expect(flat(panel?.querySelector(".glance__head .glance__aside"))).toBe("1 Nov – 30 Nov 2026")
})

test("a usage bar, its width the share (capped at 100) and its level, named for a screen reader", () => {
	const panel = show("At a glance", [
		{ field: "used", label: "Used of limit", text: "112%", bar: { share: 112, level: "over", label: "112% used" } },
	])
	const bar = panel?.querySelector('[data-field="used"] .glance__bar')
	expect(bar?.getAttribute("data-level")).toBe("over")
	expect(bar?.getAttribute("role")).toBe("img")
	expect(bar?.getAttribute("aria-label")).toBe("112% used")
	expect(bar?.querySelector<HTMLElement>("span")?.style.inlineSize).toBe("100%")
})
