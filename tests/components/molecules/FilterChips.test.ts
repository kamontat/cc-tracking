import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import FilterChips from "#components/molecules/FilterChips.svelte"

/** One section of a filter sheet: a legend over a wrapping row of pill chips that toggle. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const options = [
	{ value: "purchase", label: "Purchases" },
	{ value: "payment", label: "Payments" },
]

test("a chip per option, carrying its value and whether it is picked", () => {
	const toggled: string[] = []
	mounted = mount(FilterChips, {
		target: document.body,
		props: { legend: "Show", name: "type", options, selected: ["payment"], ontoggle: (v: string) => toggled.push(v) },
	})
	flushSync()
	const root = document.body
	expect(root.querySelector("fieldset.filter-group > legend")?.textContent).toBe("Show")
	const chips = [...root.querySelectorAll<HTMLButtonElement>(".filter-chips button")]
	expect(chips.map((c) => c.getAttribute("data-type"))).toEqual(["purchase", "payment"])
	expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true"])
	expect(chips.map((c) => c.textContent?.trim())).toEqual(["Purchases", "Payments"])
	expect(chips[0]?.getAttribute("type")).toBe("button")
	expect(chips[0]?.getAttribute("data-variant")).toBe("quiet")
	chips[0]?.click()
	expect(toggled).toEqual(["purchase"])
})

test("extra chips follow the options in the same row", () => {
	mounted = mount(FilterChips, {
		target: document.body,
		props: {
			legend: "Account holder",
			name: "owner",
			options: [{ value: "KC", label: "KC" }],
			selected: [],
			ontoggle: () => {},
			children: createRawSnippet(() => ({ render: () => "<button data-ungrouped>Not in a group</button>" })),
		},
	})
	flushSync()
	expect(document.body.querySelector(".filter-chips > [data-ungrouped]")).not.toBeNull()
})
