import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import DateRangeChoices from "#components/molecules/DateRangeChoices.svelte"
import { setLocale } from "#lib/i18n/index"

/** The *Date* section: the range presets as chips, and from and to for a custom range. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

type Range = { range: "" | "today" | "week" | "month" | "lastMonth" | "custom"; from: string; to: string }

const show = (value: Range) => {
	const changes: Partial<Range>[] = []
	mounted = mount(DateRangeChoices, {
		target: document.body,
		props: { ...value, onchange: (patch: Partial<Range>) => changes.push(patch) },
	})
	flushSync()
	return { root: document.body, changes }
}

test("five presets under Date, the picked one pressed", () => {
	const { root } = show({ range: "week", from: "", to: "" })
	expect(root.querySelector("fieldset.filter-group > legend")?.textContent).toBe("Date")
	const chips = [...root.querySelectorAll("[data-range]")]
	expect(chips.map((c) => c.getAttribute("data-range"))).toEqual(["today", "week", "month", "lastMonth", "custom"])
	expect(root.querySelector("[data-range=week]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("input[name=from]")).toBeNull()
})

test("a preset clears from and to; the picked one taps off", () => {
	const { root, changes } = show({ range: "week", from: "", to: "" })
	root.querySelector<HTMLElement>("[data-range=month]")?.click()
	root.querySelector<HTMLElement>("[data-range=week]")?.click()
	root.querySelector<HTMLElement>("[data-range=custom]")?.click()
	expect(changes).toEqual([{ range: "month", from: "", to: "" }, { range: "", from: "", to: "" }, { range: "custom" }])
})

test("custom shows from and to, and typing hands each back", () => {
	const { root, changes } = show({ range: "custom", from: "2026-10-01", to: "" })
	const from = root.querySelector<HTMLInputElement>(".filter-dates input[name=from]")
	expect(from?.value).toBe("2026-10-01")
	const to = root.querySelector<HTMLInputElement>("input[name=to]") as HTMLInputElement
	to.value = "2026-10-31"
	to.dispatchEvent(new Event("input", { bubbles: true }))
	expect(changes).toEqual([{ to: "2026-10-31" }])
})
