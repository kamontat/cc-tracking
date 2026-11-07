import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CycleLine from "#components/atoms/CycleLine.svelte"
import { setLocale } from "#lib/i18n/index"

/** A statement's billing cycle line, drawn from `cycleModel` and fitted once laid out (DD-165). */
let mounted: ReturnType<typeof mount> | undefined
const realObserver = globalThis.ResizeObserver

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	globalThis.ResizeObserver = realObserver
	setLocale("en")
})

const INPUT = {
	start: "2026-10-26",
	end: "2026-12-15",
	marks: [
		{ kind: "buy" as const, date: "2026-10-29" },
		{ kind: "due" as const, date: "2026-12-15" },
		{ kind: "now" as const, date: "2026-11-03" },
	],
	fillTo: "2026-11-03",
}

test("one image to a screen reader, with each marker placed by inline style", () => {
	mounted = mount(CycleLine, { target: document.body, props: { input: INPUT } })
	flushSync()
	const line = document.querySelector<HTMLElement>(".a-cycle")
	expect(line?.getAttribute("role")).toBe("img")
	expect(line?.getAttribute("aria-label")).toBe("Bought 29 Oct, due 15 Dec, today 3 Nov")
	const marks = [...document.querySelectorAll<HTMLElement>(".a-mk")]
	expect(marks.map((m) => [m.dataset["mark"], m.style.getPropertyValue("inset-inline-start"), m.textContent])).toEqual([
		["buy", "6%", "Bought 29 Oct"],
		["now", "16%", "Today"],
		["due", "100%", "Due 15 Dec"],
	])
	expect(marks.every((m) => m.getAttribute("aria-hidden") === "true")).toBe(true)
	expect(document.querySelector<HTMLElement>(".a-fill")?.style.getPropertyValue("inline-size")).toBe("16%")
	expect(document.querySelector(".a-fill")?.hasAttribute("data-late")).toBe(false)
	expect(document.querySelector('[data-mark="due"]')?.getAttribute("data-edge")).toBe("end")
})

test("a late line marks its fill and due marker late", () => {
	mounted = mount(CycleLine, { target: document.body, props: { input: { ...INPUT, late: true } } })
	flushSync()
	expect(document.querySelector(".a-fill")?.hasAttribute("data-late")).toBe(true)
	expect(document.querySelector('[data-mark="due"]')?.hasAttribute("data-late")).toBe(true)
	expect(document.querySelector('[data-mark="buy"]')?.hasAttribute("data-late")).toBe(false)
})

test("it refits on resize and lets go when it leaves", () => {
	const observed: Element[] = []
	let callback: ResizeObserverCallback = () => {}
	let disconnected = 0
	globalThis.ResizeObserver = class {
		constructor(cb: ResizeObserverCallback) {
			callback = cb
		}
		observe(el: Element) {
			observed.push(el)
		}
		unobserve() {}
		disconnect() {
			disconnected += 1
		}
	} as unknown as typeof ResizeObserver
	mounted = mount(CycleLine, { target: document.body, props: { input: INPUT } })
	flushSync()
	const line = document.querySelector(".a-cycle") as HTMLElement
	expect(observed).toEqual([line])
	const labels = [...line.querySelectorAll<HTMLElement>(".a-lbl")]
	for (const label of labels) label.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100 }) as DOMRect
	callback([{ target: line } as unknown as ResizeObserverEntry], {} as ResizeObserver)
	expect(line.querySelector('[data-mark="buy"]')?.hasAttribute("data-quiet")).toBe(true)
	expect(line.querySelector('[data-mark="due"]')?.hasAttribute("data-quiet")).toBe(false)
	unmount(mounted)
	mounted = undefined
	expect(disconnected).toBe(1)
})
