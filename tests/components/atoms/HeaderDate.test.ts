import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import HeaderDate from "#components/atoms/HeaderDate.svelte"
import { headerDate } from "#lib/domain/date"
import { setLocale } from "#lib/i18n/index"

/** In the browser the island fills in today, in the reader's language, and follows a switch. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (props: { clock: () => Date }) => {
	mounted = mount(HeaderDate, { target: document.body, props })
	flushSync()
	return {
		short: () => document.querySelector(".site-header__date-short")?.textContent,
		long: () => document.querySelector(".site-header__date-long")?.textContent,
	}
}

const clock = () => new Date(2026, 9, 30, 9, 0)

test("shows today in both forms, in the reader's language", () => {
	setLocale("th")
	const date = show({ clock })
	expect(date.short()).toBe(headerDate("2026-10-30", "th", false))
	expect(date.long()).toBe(headerDate("2026-10-30", "th", true))
	expect(date.short()).toBe("ศ., 30 ต.ค.")
})

test("follows a change of language", () => {
	setLocale("th")
	const date = show({ clock })
	setLocale("en")
	flushSync()
	expect(date.long()).toBe(headerDate("2026-10-30", "en", true))
})
