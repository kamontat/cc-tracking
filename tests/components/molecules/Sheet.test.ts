import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import Sheet from "#components/molecules/Sheet.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The sheet every page dialog sits in: it opens itself on mount, and Escape, the backdrop and
 * Close only ask the page to close it (and do nothing while held). Ported from the legacy
 * `cc-modal` tests, sheet mode.
 */
type Instance = { leave: (then: () => void) => void }

let mounted: Instance | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const body = createRawSnippet(() => ({ render: () => `<p class="content">body</p>` }))

const show = (props: { heading?: string; held?: boolean } = {}, target: HTMLElement = document.body) => {
	let closed = 0
	mounted = mount(Sheet, {
		target,
		props: {
			heading: props.heading ?? "Make a payment",
			held: props.held ?? false,
			onclose: () => {
				closed += 1
			},
			children: body,
		},
	}) as Instance
	flushSync()
	return { closed: () => closed, instance: mounted }
}

const dialog = () => {
	const found = document.querySelector("dialog")
	if (!found) throw new Error("no dialog")
	return found
}

const close = () => document.querySelector<HTMLButtonElement>('[data-action="close"]')

test("opens itself as a modal dialog headed by its heading, with its content", () => {
	show({ heading: "Add a card" })
	expect(dialog().open).toBe(true)
	const heading = dialog().querySelector("h2")
	expect(heading?.textContent?.trim()).toBe("Add a card")
	expect(heading?.id).toBeTruthy()
	expect(dialog().getAttribute("aria-labelledby")).toBe(heading?.id ?? null)
	expect(dialog().querySelector(".content")?.textContent).toBe("body")
})

test("has a grab handle and a worded, quiet Close that follows the language", () => {
	show()
	expect(dialog().querySelector(".grab")).not.toBeNull()
	expect(close()?.textContent?.trim()).toBe("Close")
	expect(close()?.getAttribute("data-variant")).toBe("quiet")
	setLocale("th")
	flushSync()
	expect(close()?.textContent?.trim()).not.toBe("Close")
})

test("asks to be closed from Close", () => {
	const { closed } = show()
	close()?.click()
	expect(closed()).toBe(1)
})

test("asks to be closed on Escape, rather than closing behind the page's back", () => {
	const { closed } = show()
	const cancel = new Event("cancel", { cancelable: true })
	dialog().dispatchEvent(cancel)
	expect(cancel.defaultPrevented).toBe(true)
	expect(closed()).toBe(1)
})

test("asks to be closed when the backdrop is clicked, but not when its content is", () => {
	const { closed } = show()
	dialog()
		.querySelector(".content")
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
	expect(closed()).toBe(0)
	dialog().dispatchEvent(new MouseEvent("click", { bubbles: true }))
	expect(closed()).toBe(1)
})

test("hands focus back to whatever opened it once it is taken away", () => {
	// The opener sits inside another component's shadow root, as a legacy table's button does.
	const host = document.createElement("div")
	const opener = document.createElement("button")
	host.attachShadow({ mode: "open" }).append(opener)
	document.body.append(host)
	opener.focus()
	const target = document.createElement("div")
	document.body.append(target)

	show({}, target)
	close()?.focus()
	expect(document.activeElement).toBe(close())
	if (mounted) unmount(mounted)
	mounted = undefined

	expect(host.shadowRoot?.activeElement).toBe(opener)
})

// A browser runs the closing slide on the dialog; happy-dom runs none, so these stand one in.
const stallExit = () => {
	let finish!: () => void
	const finished = new Promise<void>((resolve) => {
		finish = resolve
	})
	const target = dialog()
	target.getAnimations = () => (target.hasAttribute("data-closing") ? [{ finished } as unknown as Animation] : [])
	return finish
}

test("marks itself closing and asks to close only once its exit animation ends", async () => {
	const { closed } = show()
	const finish = stallExit()
	close()?.click()
	expect(dialog().hasAttribute("data-closing")).toBe(true)
	expect(closed()).toBe(0)
	// A second request while it is leaving is the same close.
	dialog().dispatchEvent(new Event("cancel", { cancelable: true }))
	finish()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(closed()).toBe(1)
})

test("leave() lets a page close the sheet after its exit animation too", async () => {
	const { instance } = show()
	const finish = stallExit()
	let left = 0
	instance.leave(() => left++)
	expect(left).toBe(0)
	finish()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(left).toBe(1)
})

test("a held sheet ignores every request to close", () => {
	const { closed } = show({ held: true })
	dialog().dispatchEvent(new Event("cancel", { cancelable: true }))
	close()?.click()
	dialog().dispatchEvent(new MouseEvent("click", { bubbles: true }))
	expect(closed()).toBe(0)
	expect(dialog().hasAttribute("data-closing")).toBe(false)
})

test("a held sheet that the browser closes anyway opens again", async () => {
	const { closed } = show({ held: true })
	// A second Escape closes a dialog without a cancel the page could refuse.
	dialog().close()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(dialog().open).toBe(true)
	expect(closed()).toBe(0)
})

test("the closing slide and fade are in its styles, and stand down under reduced motion", async () => {
	const source = await Bun.file("src/components/molecules/Sheet.svelte").text()
	expect(source).toMatch(/dialog\[open\]\[data-closing\]/)
	expect(source).toMatch(/@keyframes sheet-fall/)
	expect(source).toMatch(/@keyframes backdrop-out/)
	expect(source).toMatch(/prefers-reduced-motion[\s\S]*data-closing/)
})

test("a wide sheet is marked, and grows to the wide sheet's token from 900px", async () => {
	mounted = mount(Sheet, {
		target: document.body,
		props: { heading: "Add a card", wide: true, onclose: () => {}, children: body },
	}) as Instance
	flushSync()
	expect(dialog().hasAttribute("data-wide")).toBe(true)
	const source = await Bun.file("src/components/molecules/Sheet.svelte").text()
	expect(source).toMatch(/dialog\[data-wide\] \{[^}]*var\(--cc-sheet-wide-max\)/)
	const tokens = await Bun.file("src/styles/tokens.css").text()
	expect(tokens).toMatch(/--cc-sheet-wide-max: \d+(\.\d+)?rem;/)
})

test("a sheet is not wide unless asked", () => {
	show()
	expect(dialog().hasAttribute("data-wide")).toBe(false)
})
