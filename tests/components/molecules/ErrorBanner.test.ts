import { flushSync, mount, unmount } from "svelte"
import { afterEach, describe, expect, test, vi } from "vitest"

import ErrorBanner from "#components/molecules/ErrorBanner.svelte"

/** A page's error, with a way to try again: the legacy cc-error-banner as a Svelte molecule. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (props: { message: string; retryLabel?: string; onretry?: () => void }) => {
	mounted = mount(ErrorBanner, { target: document.body, props })
	flushSync()
	return document.querySelector<HTMLElement>(".error-banner")
}

describe("ErrorBanner", () => {
	test("shows nothing while there is no message", () => {
		expect(show({ message: "", retryLabel: "Reload", onretry: () => {} })).toBeNull()
	})

	test("an alert in the danger tone, with the message and a quiet retry button", () => {
		const banner = show({ message: "Could not save the location.", retryLabel: "Reload", onretry: () => {} })
		expect(banner?.getAttribute("role")).toBe("alert")
		expect(banner?.getAttribute("data-tone")).toBe("danger")
		expect(banner?.querySelector("p")?.textContent).toBe("Could not save the location.")
		const button = banner?.querySelector("button")
		expect(button?.getAttribute("type")).toBe("button")
		expect(button?.getAttribute("data-variant")).toBe("quiet")
		expect(button?.textContent?.trim()).toBe("Reload")
	})

	test("the button asks to try again", () => {
		const onretry = vi.fn()
		show({ message: "Failed", retryLabel: "Reload", onretry })
		document.querySelector<HTMLButtonElement>(".error-banner button")?.click()
		expect(onretry).toHaveBeenCalledTimes(1)
	})

	test("without a retry it only says what went wrong", () => {
		show({ message: "Failed" })
		expect(document.querySelector(".error-banner p")?.textContent).toBe("Failed")
		expect(document.querySelector(".error-banner button")).toBeNull()
	})
})

describe("app.css", () => {
	test("draws the banner as the danger panel the Lit one was", async () => {
		const css = (await Bun.file("src/styles/app.css").text()).replace(/\/\*[\s\S]*?\*\//g, "")
		const rule = css.match(/\n\.error-banner \{([^}]*)\}/)?.[1] ?? ""
		expect(rule).toContain("background: var(--cc-danger-surface)")
		expect(rule).toContain("border-color: var(--cc-danger)")
		expect(rule).toContain("border-left-width: var(--cc-space-1)")
		expect(rule).toContain("border-radius: var(--cc-radius-md)")
	})
})
