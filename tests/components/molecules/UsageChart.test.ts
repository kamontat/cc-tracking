import type { CardUsage } from "#lib/domain/usage"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import UsageChart from "#components/molecules/UsageChart.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The new-list sheet's view of a card's use (DD-195): the room now, the 12-statement total, the
 * average of the closed statements and when it was last used, then a bar per statement with
 * its amount over it and its month under it, and the average as a dashed line.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const usage = (totals: number[], lastUsed: string | null = "2026-11-03"): CardUsage => {
	const periods = ["2025-12", "2026-01", "2026-02", "2026-10", "2026-11"]
	return {
		statements: totals.map((total, i) => ({
			period: periods[i] ?? "2026-11",
			closeDate: `${periods[i] ?? "2026-11"}-25`,
			total,
			open: i === totals.length - 1,
		})),
		total: totals.reduce((a, b) => a + b, 0),
		average: 3_000_00,
		lastUsed,
	}
}

const show = (props: Record<string, unknown>) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(UsageChart, { target: document.body, props: props as never })
	flushSync()
	return document.body.querySelector(".usage") as HTMLElement
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("the figures: room now, the 12-statement total, the average and when last used", () => {
	const root = show({ usage: usage([0, 4_000_00, 8_000_00, 0, 1_000_00]), room: 48_200_00, tone: "teal" })
	const stats = [...root.querySelectorAll(".stats > div")].map(text)
	expect(stats).toEqual([
		"Room now ฿48,200.00",
		"12 statements ฿13,000.00",
		"Average a statement ฿3,000.00",
		"Last used 03 Nov 2026",
	])
	expect(root.getAttribute("data-g")).toBe("teal")
})

test("without a room the figure is left out, and a card never used says so", () => {
	const root = show({ usage: usage([0, 0], null) })
	const stats = [...root.querySelectorAll(".stats > div")].map(text)
	expect(stats[0]).toBe("12 statements ฿0.00")
	expect(stats.at(-1)).toBe("Last used Not in 12 statements")
})

test("a bar per statement, tallest at the top, its amount over it and its month under it", () => {
	const root = show({ usage: usage([0, 4_000_00, 8_000_00, 0, 1_000_00]) })
	const bars = [...root.querySelectorAll(".chart li")]
	expect(bars).toHaveLength(5)
	expect(bars.map((b) => text(b.querySelector(".v")))).toEqual(["–", "4K", "8K", "–", "1K"])
	expect(bars.map((b) => (b.querySelector("i") as HTMLElement).style.blockSize)).toEqual([
		"",
		"50%",
		"100%",
		"",
		"12.5%",
	])
	// The year shows under the first bar and under each January.
	expect(bars.map((b) => text(b.querySelector(".m")))).toEqual(["Dec 25", "Jan 26", "Feb", "Oct", "Nov"])
	expect(bars.at(-1)?.hasAttribute("data-open")).toBe(true)
})

test("each bar is named in words for a screen reader, the open one as so far", () => {
	const root = show({ usage: usage([0, 4_000_00, 1_000_00]) })
	const names = [...root.querySelectorAll(".chart li")].map((b) => b.getAttribute("aria-label"))
	expect(names).toEqual([
		"Statement closing 25 Dec: ฿0.00",
		"Statement closing 25 Jan: ฿4,000.00",
		"Statement closing 25 Feb, still open: ฿1,000.00 so far",
	])
	expect(root.querySelector(".chart")?.getAttribute("aria-label")).toBe("Last 12 statements")
})

test("the average of the closed statements is a dashed line at its height", () => {
	const root = show({ usage: usage([0, 4_000_00, 8_000_00, 0, 1_000_00]) })
	const lines = [...root.querySelectorAll<HTMLElement>(".chart .avg")]
	expect(lines).toHaveLength(5)
	expect(lines.every((l) => l.style.insetBlockEnd === "37.5%")).toBe(true)
	expect(show({ usage: { ...usage([0, 0]), average: 0 } }).querySelector(".avg")).toBeNull()
})

test("reads in Thai", () => {
	setLocale("th")
	const root = show({ usage: usage([0, 4_000_00]), room: 1_00 })
	expect(text(root.querySelector(".stats > div"))).toBe("วงเงินเหลือตอนนี้ ฿1.00")
	expect(text(root.querySelector(".chart li .m"))).toBe("ธ.ค. 25")
})
