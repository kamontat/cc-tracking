import type { MoreItem } from "#lib/ui/more-menu"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test, vi } from "vitest"

import MoreMenu from "#components/molecules/MoreMenu.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * A *More* (`⋯`) button over a small list of buttons; an item with `ask` asks twice. Ported from
 * the legacy `cc-more-menu` tests, against the same markup, with callbacks for its event.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const show = (items?: MoreItem[], initial: { busy?: boolean } = {}) => {
	document.body.innerHTML = "<button id='outside'>page</button><div id='host'></div>"
	const picked: string[] = []
	const run: string[] = []
	const ITEMS: MoreItem[] = items ?? [
		{ action: "archive", label: "Archive card", onselect: () => run.push("archive") },
		{
			action: "delete",
			label: "Delete card",
			variant: "danger",
			ask: "Delete KBank?",
			onselect: () => run.push("delete"),
		},
	]
	const values = new SvelteMap<string, unknown>(Object.entries(initial))
	mounted = mount(MoreMenu, {
		target: document.querySelector("#host") as HTMLElement,
		props: {
			items: ITEMS,
			get busy() {
				return values.get("busy") as boolean | undefined
			},
			onselect: (action: string) => picked.push(action),
		},
	})
	flushSync()
	const toggle = document.querySelector<HTMLButtonElement>("button.more")
	if (!toggle) throw new Error("no More button")
	const set = (key: string, value: unknown) => {
		values.set(key, value)
		flushSync()
	}
	return { toggle, picked, run, set }
}

const list = () => document.querySelector<HTMLElement>(".more-menu")

const button = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)

const click = (el: HTMLElement | null | undefined) => {
	el?.click()
	flushSync()
}

test("a closed ⋯ button named More that controls a hidden list", () => {
	const { toggle } = show()
	expect(toggle.textContent?.trim()).toBe("⋯")
	expect(toggle.getAttribute("type")).toBe("button")
	expect(toggle.getAttribute("aria-label")).toBe("More")
	expect(toggle.getAttribute("aria-expanded")).toBe("false")
	expect(toggle.getAttribute("data-variant")).toBe("quiet")
	expect(list()?.id).toBeTruthy()
	expect(toggle.getAttribute("aria-controls")).toBe(list()?.id ?? "")
	expect(list()?.hidden).toBe(true)
})

test("the list is a named group", () => {
	show()
	expect(list()?.tagName).toBe("FIELDSET")
	expect(list()?.getAttribute("aria-label")).toBe("More")
})

test("⋯ opens the list of buttons and focuses the first", () => {
	const { toggle } = show()
	click(toggle)
	expect(toggle.getAttribute("aria-expanded")).toBe("true")
	expect(list()?.hidden).toBe(false)
	const buttons = [...(list()?.querySelectorAll("button") ?? [])]
	expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Archive card", "Delete card"])
	expect(buttons.map((b) => b.getAttribute("data-variant"))).toEqual(["quiet", "danger"])
	expect(document.activeElement).toBe(buttons[0] ?? null)
})

test("⋯ again closes it", () => {
	const { toggle } = show()
	click(toggle)
	click(toggle)
	expect(list()?.hidden).toBe(true)
	expect(toggle.getAttribute("aria-expanded")).toBe("false")
})

test("a plain item says which, closes, and hands focus back to ⋯", () => {
	const { toggle, picked, run } = show()
	click(toggle)
	click(button("archive"))
	expect(picked).toEqual(["archive"])
	expect(run).toEqual(["archive"])
	expect(list()?.hidden).toBe(true)
	expect(document.activeElement).toBe(toggle)
})

test("Escape closes it and hands focus back to ⋯", () => {
	const { toggle } = show()
	click(toggle)
	const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	button("archive")?.dispatchEvent(key)
	flushSync()
	expect(key.defaultPrevented).toBe(true)
	expect(list()?.hidden).toBe(true)
	expect(toggle.getAttribute("aria-expanded")).toBe("false")
	expect(document.activeElement).toBe(toggle)
})

test("opened by a pointer, focus moves without the keyboard's ring; opened by a key, with it", () => {
	const { toggle } = show()
	const focus = vi.spyOn(HTMLElement.prototype, "focus")
	const pressEscape = () => {
		button("archive")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
		flushSync()
	}
	const open = (detail: number) => {
		toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }))
		flushSync()
	}
	try {
		open(1)
		expect(focus.mock.lastCall?.[0]).toEqual({ focusVisible: false })
		pressEscape()
		expect(document.activeElement).toBe(toggle)
		expect(focus.mock.lastCall?.[0]).toEqual({ focusVisible: false })
		open(0)
		expect(focus.mock.lastCall?.[0]).toEqual({ focusVisible: true })
		pressEscape()
		expect(focus.mock.lastCall?.[0]).toEqual({ focusVisible: true })
	} finally {
		focus.mockRestore()
	}
})

test("Escape on a closed menu is left to the page", () => {
	const { toggle } = show()
	const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	toggle.dispatchEvent(key)
	expect(key.defaultPrevented).toBe(false)
})

test("a click outside closes it, leaving focus to what was clicked; a click inside does not", () => {
	const { toggle } = show()
	click(toggle)
	click(list())
	expect(list()?.hidden).toBe(false)
	const outside = document.querySelector<HTMLButtonElement>("#outside")
	outside?.focus()
	click(outside)
	expect(list()?.hidden).toBe(true)
	expect(toggle.getAttribute("aria-expanded")).toBe("false")
	expect(document.activeElement).not.toBe(toggle)
	expect(document.activeElement).toBe(outside)
})

test("an item with a question asks twice: Delete and Keep, focus following", () => {
	const { toggle, picked, run } = show()
	click(toggle)
	click(button("delete"))
	expect(picked).toEqual([])
	expect(list()?.hidden).toBe(false)
	expect(document.querySelector(".ask")?.textContent).toBe("Delete KBank?")
	expect(button("archive")).toBeNull()
	const confirm = button("confirm")
	expect(confirm?.textContent?.trim()).toBe("Delete")
	expect(confirm?.getAttribute("data-variant")).toBe("danger")
	expect(document.activeElement).toBe(confirm)

	click(button("keep"))
	expect(document.querySelector(".ask")).toBeNull()
	expect(list()?.hidden).toBe(false)
	expect(document.activeElement).toBe(button("delete"))
	expect(picked).toEqual([])

	click(button("delete"))
	click(button("confirm"))
	expect(picked).toEqual(["delete"])
	expect(run).toEqual(["delete"])
	expect(list()?.hidden).toBe(true)
})

test("closing forgets a pending question", () => {
	const { toggle } = show()
	click(toggle)
	click(button("delete"))
	click(toggle)
	click(toggle)
	expect(document.querySelector(".ask")).toBeNull()
	expect(button("delete")).not.toBeNull()
})

test("busy greys every item and Delete, but not Keep", () => {
	const { toggle, set } = show(undefined, { busy: true })
	click(toggle)
	expect(button("archive")?.disabled).toBe(true)
	expect(button("delete")?.disabled).toBe(true)
	set("busy", false)
	click(button("delete"))
	set("busy", true)
	expect(button("confirm")?.disabled).toBe(true)
	expect(button("keep")?.disabled).toBe(false)
})

test("a language switch re-renders in place", () => {
	const { toggle } = show()
	setLocale("th")
	flushSync()
	expect(toggle.getAttribute("aria-label")).toBe("เพิ่มเติม")
})

test("its look is its own scoped style, through tokens only", async () => {
	const style = (await Bun.file("src/components/molecules/MoreMenu.svelte").text()).split("<style>")[1] ?? ""
	expect(style).toMatch(/\.more-menu\s*\{/)
	expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
	expect(style).not.toMatch(/\d(px|rem)\b/)
})
