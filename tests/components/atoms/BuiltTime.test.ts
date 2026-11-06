import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import BuiltTime from "#components/atoms/BuiltTime.svelte"
import { setLocale } from "#lib/i18n/index"

/** When the page was built, in the viewer's own zone and language, following a switch. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (builtAt: string) => {
	mounted = mount(BuiltTime, { target: document.body, props: { builtAt, timeZone: "Asia/Bangkok" } })
	flushSync()
	return document.body.textContent?.trim()
}

test("shows the build time in the viewer's zone", () => {
	expect(show("2026-10-30T07:05:00Z")).toBe("30 Oct 2026, 14:05 (Asia/Bangkok)")
})

test("follows a language switch", () => {
	show("2026-10-30T07:05:00Z")
	setLocale("th")
	flushSync()
	expect(document.body.textContent).not.toContain("Oct")
	expect(document.body.textContent).toContain("Asia/Bangkok")
})

test("an unreadable stamp shows nothing, never Invalid or NaN", () => {
	expect(show("not a date")).toBe("")
})
