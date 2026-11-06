import type { GroupPanel } from "#lib/domain/cards-view"
import type { Owner } from "#lib/domain/owner"
import type { LimitGroup } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import GroupPanels from "#components/organisms/GroupPanels.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The Cards page's *Limit groups*: a heading with the count and Add group, then a panel per
 * group that opens it. Ported from the legacy `cc-group-panels` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const g = (id: string, name: string, owner: Owner): LimitGroup => ({ id, name, limit: 200_000_00, owner })
const panels: GroupPanel[] = [
	{
		group: g("g1", "SCB Business", "KC"),
		room: 61_550_00,
		limit: 200_000_00,
		usedPct: 69,
		cardIds: ["1", "2"],
		full: false,
	},
	{
		group: g("g/2", "UOB", "NT"),
		room: 3_120_00,
		limit: 200_000_00,
		usedPct: 92,
		cardIds: [],
		full: true,
	},
]

const show = (list: GroupPanel[] = panels) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const opened: string[] = []
	let added = 0
	mounted = mount(GroupPanels, {
		target: document.body,
		props: {
			panels: list,
			onopengroup: (id: string) => opened.push(id),
			onaddgroup: () => {
				added += 1
			},
		},
	})
	flushSync()
	return { root: document.body.querySelector(".group-panels") as HTMLElement, opened, added: () => added }
}

const source = () => Bun.file("src/components/organisms/GroupPanels.svelte").text()

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("heading with the count and Add group", () => {
	const { root, added } = show()
	expect(text(root.querySelector("h2"))).toBe("Limit groups")
	expect(text(root.querySelector(".sec-head small"))).toBe("2")
	// One row the page can hide on a phone, with Add group at its end.
	expect(root.querySelector(".sec-head")?.getAttribute("part")).toBe("head")
	expect(root.querySelector(".sec-head > :last-child")?.getAttribute("data-action")).toBe("add-group")
	expect(root.querySelector("[data-action=add-group] svg.icon")).not.toBeNull()
	root.querySelector<HTMLElement>("[data-action=add-group]")?.click()
	expect(added()).toBe(1)
})

test("a panel: name (holder), room of limit, the bar, ids and use", () => {
	const { root } = show()
	const first = root.querySelector('button[data-group="g1"]')
	expect(text(first?.querySelector(".gname"))).toBe("SCB Business (KC)")
	expect(text(first?.querySelector("[data-numeric]"))).toBe("฿61,550.00 of ฿200,000.00")
	expect(first?.querySelector(".usage")).not.toBeNull()
	expect(first?.querySelector<HTMLElement>(".usage > span")?.style.inlineSize).toBe("69%")
	expect(text(first?.querySelector(".gnote"))).toBe("1, 2 · 69% used")
	const full = root.querySelector('button[data-group="g/2"]')
	expect(text(full?.querySelector(".gnote"))).toBe("92% used · getting full")
	expect(full?.querySelector(".usage")?.getAttribute("data-level")).toBe("high")
})

test("the bar takes the tiles' rail colours: grey within, amber from 80%, red past the limit", async () => {
	const over: GroupPanel = {
		group: g("g3", "KTC", "RI"),
		room: -21_065_00,
		limit: 200_000_00,
		usedPct: 111,
		cardIds: ["7"],
		full: true,
	}
	const { root } = show([...panels, over])
	const level = (id: string) => root.querySelector(`button[data-group="${id}"] .usage`)?.getAttribute("data-level")
	expect(level("g1")).toBe("within")
	expect(level("g/2")).toBe("high")
	expect(level("g3")).toBe("over")
	expect(text(root.querySelector('button[data-group="g3"] .gnote'))).toBe("7 · over limit")
	expect(root.querySelector<HTMLElement>('button[data-group="g3"] .usage > span')?.style.inlineSize).toBe("100%")
	const css = await source()
	expect(css).toMatch(/\.usage > span\s*\{[^}]*background: var\(--cc-text-muted\)/)
	expect(css).not.toMatch(/\.usage > span\s*\{[^}]*background: var\(--cc-accent\)/)
})

test("tapping a panel calls onopengroup with its id", () => {
	const { root, opened } = show()
	root.querySelector<HTMLElement>('button[data-group="g/2"]')?.click()
	expect(opened).toEqual(["g/2"])
})

test("no groups names the next step", () => {
	const { root } = show([])
	expect(text(root.querySelector(".empty"))).toBe("No limit groups yet. Add one.")
	expect(text(root.querySelector(".sec-head small"))).toBe("0")
})

test("a panel wears its group's colour; none or a bad one wears none", async () => {
	const withColor = (p: GroupPanel, color: unknown): GroupPanel => ({
		...p,
		group: { ...p.group, color } as LimitGroup,
	})
	const [a, b] = panels as [GroupPanel, GroupPanel]
	const { root } = show([withColor(a, "teal"), withColor(b, "nope"), { ...a }])
	const rows = [...root.querySelectorAll(".gpanel")]
	expect(rows[0]?.getAttribute("data-g")).toBe("teal")
	expect(rows[1]?.hasAttribute("data-g")).toBe(false)
	expect(rows[2]?.hasAttribute("data-g")).toBe(false)
	expect(await source()).toMatch(/\.gpanel\[data-g\][^}]*var\(--g-soft\)/)
})

test("a language switch re-renders in place", () => {
	const { root } = show()
	setLocale("th")
	flushSync()
	expect(text(root.querySelector("h2"))).not.toBe("Limit groups")
	expect(text(root.querySelector('button[data-group="g1"] .gnote'))).not.toMatch(/used/)
})
