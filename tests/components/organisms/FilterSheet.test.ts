import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import FilterSheet from "#components/organisms/FilterSheet.svelte"

/**
 * The frame every filter sheet shares: the sheet and its heading, the page's sections, then
 * *Clear all* and the apply button, which waits for the sheet to slide away.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (shown = 5, label = "Show 5 results") => {
	const calls: string[] = []
	mounted = mount(FilterSheet, {
		target: document.body,
		props: {
			heading: "Filter and sort",
			shown,
			label,
			onclear: () => calls.push("clear"),
			onapply: () => calls.push("apply"),
			onclose: () => calls.push("close"),
			children: createRawSnippet(() => ({ render: () => "<fieldset><legend>Card</legend></fieldset>" })),
		},
	})
	flushSync()
	const root = document.body
	return {
		root,
		calls,
		click: (selector: string) => {
			root.querySelector<HTMLElement>(selector)?.click()
			flushSync()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("draws the heading, the sections and the footer", () => {
	const { root } = show()
	expect(text(root.querySelector("dialog h2"))).toBe("Filter and sort")
	expect(text(root.querySelector("dialog legend"))).toBe("Card")
	const clear = root.querySelector(".filter-footer [data-action=clear]")
	expect(clear?.getAttribute("data-variant")).toBe("quiet")
	expect(text(clear)).toBe("Clear all")
	expect(text(root.querySelector(".filter-footer [data-action=apply]"))).toBe("Show 5 results")
})

test("Clear all asks the page and keeps the sheet open", () => {
	const { root, click, calls } = show()
	click("[data-action=clear]")
	expect(calls).toEqual(["clear"])
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
})

test("nothing to show disables the apply button", () => {
	const { root } = show(0, "Nothing matches")
	expect((root.querySelector("[data-action=apply]") as HTMLButtonElement).disabled).toBe(true)
})

test("apply waits for the sheet to slide away", async () => {
	const { root, click, calls } = show()
	let finish!: () => void
	const finished = new Promise<void>((resolve) => {
		finish = resolve
	})
	const dialog = root.querySelector("dialog") as HTMLDialogElement
	dialog.getAnimations = () => (dialog.hasAttribute("data-closing") ? [{ finished } as unknown as Animation] : [])
	click("[data-action=apply]")
	expect(calls).toEqual([])
	finish()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(calls).toEqual(["apply"])
})
