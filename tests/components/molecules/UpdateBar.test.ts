import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test, vi } from "vitest"

import UpdateBar from "#components/molecules/UpdateBar.svelte"
import { setLocale } from "#lib/i18n/index"

/** The bar that offers a downloaded new version of the site (PRD DD-181). */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const show = () => {
	let offer: (apply: () => void) => void = () => {}
	mounted = mount(UpdateBar, {
		target: document.body,
		props: {
			watch: (onUpdate: (apply: () => void) => void) => {
				offer = onUpdate
			},
		},
	})
	flushSync()
	return (apply: () => void) => {
		offer(apply)
		flushSync()
	}
}

const bar = () => document.querySelector<HTMLElement>(".update-bar")

test("shows nothing until a new version is ready", () => {
	setLocale("en")
	show()
	expect(bar()).toBeNull()
})

test("says a new version is ready, with a button to reload into it", () => {
	setLocale("en")
	const offer = show()
	const apply = vi.fn()
	offer(apply)
	expect(bar()?.getAttribute("role")).toBe("status")
	expect(bar()?.querySelector("p")?.textContent).toBe("A new version is available.")
	const button = bar()?.querySelector("button")
	expect(button?.getAttribute("type")).toBe("button")
	expect(button?.hasAttribute("data-variant")).toBe(false)
	expect(button?.textContent?.trim()).toBe("Reload")
	button?.click()
	expect(apply).toHaveBeenCalledTimes(1)
})

test("speaks the reader's language, and follows a switch", () => {
	setLocale("th")
	const offer = show()
	offer(() => {})
	expect(bar()?.querySelector("button")?.textContent?.trim()).toBe("โหลดใหม่")
	setLocale("en")
	flushSync()
	expect(bar()?.querySelector("button")?.textContent?.trim()).toBe("Reload")
})
