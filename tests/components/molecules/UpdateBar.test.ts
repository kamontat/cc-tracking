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
	expect(bar()?.querySelector("p")?.textContent).toBe("New update is available")
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
	expect(bar()?.querySelector("p")?.textContent).toBe("มีอัพเดตใหม่")
	expect(bar()?.querySelector("button")?.textContent?.trim()).toBe("โหลดข้อมูล")
	setLocale("en")
	flushSync()
	expect(bar()?.querySelector("button")?.textContent?.trim()).toBe("Reload")
})

// From 900px the bar sits at the right end of the page's width, under the tabs; below it, centred.
test("on a desktop the bar is aligned to the right of the page, not centred", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	expect(css).toMatch(/\.update-bar \{[^}]*margin-inline: auto;/)
	expect(css).toMatch(
		/@media \(min-width: 900px\) \{\s*\.update-bar \{[^}]*inset-inline: auto max\(var\(--cc-space-4\), calc\(\(100% - var\(--cc-page-width\)\) \/ 2 \+ var\(--cc-space-4\)\)\);[^}]*margin-inline: 0;/,
	)
})
