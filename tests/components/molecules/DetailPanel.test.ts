import type { Snippet } from "svelte"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import DetailPanel from "#components/molecules/DetailPanel.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The detail panel (RD-23): a column beside the list from 900px, a sheet with a backdrop below.
 * Layout is CSS, so these hold its markup and what each way out calls.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

type Props = {
	title: string
	detail?: string
	lead?: Snippet
	actions?: Snippet
	onback?: () => void
	backLabel?: string
	onclose: () => void
	ontouch?: () => void
	children?: Snippet
}

const raw = (html: string) => createRawSnippet(() => ({ render: () => html }))

const show = (props: Partial<Props> = {}) => {
	const calls: string[] = []
	mounted = mount(DetailPanel, {
		target: document.body,
		props: {
			title: "KBank Visa",
			onclose: () => calls.push("close"),
			children: raw('<div class="body-content"><input name="amount"><select name="pick"></select></div>'),
			...props,
		},
	})
	flushSync()
	return { calls, root: document.body }
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)

test("an aside named by its head: the lead, the title over its detail, the actions and ×", () => {
	show({
		detail: "12.3 · Kept in Krabi",
		lead: raw('<span class="mini">4821</span>'),
		actions: raw('<button type="button" data-action="edit">Edit</button>'),
	})
	const aside = $("aside.detail-panel")
	expect(aside).not.toBeNull()
	const labelledBy = aside?.getAttribute("aria-labelledby") ?? ""
	expect(document.getElementById(labelledBy)?.textContent).toBe("KBank Visa")
	const head = $(".detail-panel__head")
	expect(head?.querySelector(".mini")?.textContent).toBe("4821")
	expect(head?.querySelector(".detail-panel__detail")?.textContent).toBe("12.3 · Kept in Krabi")
	expect(head?.querySelector('[data-action="edit"]')).not.toBeNull()
	const close = head?.querySelector('button[data-action="close-panel"]')
	expect(close?.getAttribute("aria-label")).toBe("Close")
	expect(close?.querySelector("svg")).not.toBeNull()
	expect($(".detail-panel__body .body-content")).not.toBeNull()
})

test("no ‹ without onback; with it, a ‹ before the title that calls it", () => {
	show()
	expect($('[data-action="panel-back"]')).toBeNull()
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	let backs = 0
	show({
		onback: () => {
			backs++
		},
		backLabel: "Back to KBank Visa",
	})
	const back = $('.detail-panel__head [data-action="panel-back"]')
	expect(back?.getAttribute("aria-label")).toBe("Back to KBank Visa")
	back?.click()
	expect(backs).toBe(1)
})

test("×, Escape and the backdrop each ask to close", () => {
	const { calls } = show()
	$('[data-action="close-panel"]')?.click()
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
	$(".detail-panel__backdrop")?.click()
	expect(calls).toEqual(["close", "close", "close"])
})

test("Escape is left to an open sheet or menu over the panel", () => {
	const { calls } = show()
	const dialog = document.createElement("dialog")
	dialog.setAttribute("open", "")
	document.body.append(dialog)
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
	dialog.remove()
	const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	handled.preventDefault()
	document.dispatchEvent(handled)
	expect(calls).toEqual([])
})

test("a swipe down on the head closes it; a short one or a swipe up does not", () => {
	const { calls } = show()
	const head = $(".detail-panel__head")
	const swipe = (from: number, to: number) => {
		head?.dispatchEvent(new PointerEvent("pointerdown", { clientY: from, bubbles: true }))
		head?.dispatchEvent(new PointerEvent("pointerup", { clientY: to, bubbles: true }))
	}
	swipe(100, 120)
	swipe(300, 100)
	expect(calls).toEqual([])
	swipe(100, 260)
	expect(calls).toEqual(["close"])
})

test("typing or picking in the body tells the page a field changed", () => {
	let touched = 0
	show({
		ontouch: () => {
			touched++
		},
	})
	$('input[name="amount"]')?.dispatchEvent(new Event("input", { bubbles: true }))
	$('select[name="pick"]')?.dispatchEvent(new Event("change", { bubbles: true }))
	expect(touched).toBe(2)
})

test("a pressed choice in a form counts as a change too", () => {
	let touched = 0
	show({
		ontouch: () => {
			touched++
		},
		children: raw(
			'<form><button type="button" aria-pressed="false" data-location="krabi">Krabi</button><button type="button" data-action="other">Other</button></form>',
		),
	})
	$('[data-location="krabi"]')?.click()
	$('[data-action="other"]')?.click()
	expect(touched).toBe(1)
})

test("the panel takes focus when it opens", () => {
	show()
	expect(document.activeElement).toBe($("aside.detail-panel"))
})

test("a focused head control that goes (Edit, as its form opens) leaves focus in the panel", () => {
	const values = new SvelteMap<string, unknown>([
		["title", "KBank Visa"],
		["actions", raw('<button type="button" data-action="edit">Edit</button>')],
	])
	mounted = mount(DetailPanel, {
		target: document.body,
		props: {
			get title() {
				return values.get("title") as string
			},
			get actions() {
				return values.get("actions") as Snippet | undefined
			},
			onclose: () => {},
			children: raw("<p>body</p>"),
		},
	})
	flushSync()
	$('[data-action="edit"]')?.focus()
	values.set("title", "Edit card")
	values.delete("actions")
	flushSync()
	expect(document.activeElement).toBe($("aside.detail-panel"))
})

test("the close label follows a language switch", () => {
	show()
	setLocale("th")
	flushSync()
	expect($('[data-action="close-panel"]')?.getAttribute("aria-label")).toBe("ปิด")
})
