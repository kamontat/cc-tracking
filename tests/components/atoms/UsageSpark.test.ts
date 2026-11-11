import type { CardUsage } from "#lib/domain/usage"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import UsageSpark from "#components/atoms/UsageSpark.svelte"

/** A card's last 12 statements as small bars, on a scale shared by every card in the picker. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const usage = (totals: number[]): CardUsage => ({
	statements: totals.map((total, i) => ({
		period: `2026-${String(i + 1).padStart(2, "0")}`,
		closeDate: `2026-${String(i + 1).padStart(2, "0")}-25`,
		total,
		open: i === totals.length - 1,
	})),
	total: totals.reduce((a, b) => a + b, 0),
	average: 0,
	lastUsed: null,
})

const show = (props: Record<string, unknown>) => {
	mounted = mount(UsageSpark, { target: document.body, props: props as never })
	flushSync()
	return document.body.querySelector(".spark") as HTMLElement
}

test("one bar per statement, oldest first, each as tall as its share of the shared top", () => {
	const spark = show({ usage: usage([0, 50_00, 100_00, 25_00]), max: 200_00, tone: "blue" })
	const bars = [...spark.querySelectorAll("i")]
	expect(bars).toHaveLength(4)
	expect(bars.map((b) => b.style.blockSize)).toEqual(["", "25%", "50%", "12.5%"])
	expect(spark.getAttribute("data-g")).toBe("blue")
})

test("a statement with nothing spent and the open one are marked, and the bars are hidden from screen readers", () => {
	const spark = show({ usage: usage([0, 10_00, 20_00]), max: 20_00 })
	const bars = [...spark.querySelectorAll("i")]
	expect(bars.map((b) => b.hasAttribute("data-zero"))).toEqual([true, false, false])
	expect(bars.map((b) => b.hasAttribute("data-open"))).toEqual([false, false, true])
	expect(spark.getAttribute("aria-hidden")).toBe("true")
	expect(spark.hasAttribute("data-g")).toBe(false)
})

test("with nothing spent anywhere every bar is flat", () => {
	const spark = show({ usage: usage([0, 0]), max: 0 })
	expect([...spark.querySelectorAll("i")].every((b) => b.hasAttribute("data-zero"))).toBe(true)
})
