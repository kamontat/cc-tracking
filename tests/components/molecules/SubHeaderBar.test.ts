import type { Snippet } from "svelte"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
import { setLocale } from "#lib/i18n/index"

/** A sub page's heading for an island: the legacy `subHeader`'s markup, ported. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = (props: { title: string; detail?: string; back: string | (() => void); actions?: Snippet }) => {
	mounted = mount(SubHeaderBar, { target: document.body, props })
	flushSync()
	return document.body
}

test("a slim bar: a back link, the title over a muted subtitle", () => {
	const bar = show({ title: "Title", detail: "More", back: "/x" }).querySelector(".sub-header")
	const link = bar?.querySelector(':scope > a[data-action="back"]')
	expect(link?.getAttribute("href")).toBe("/x")
	expect(link?.getAttribute("aria-label")).toBe("Back")
	expect(link?.querySelector("svg")).not.toBeNull()
	expect(bar?.querySelector("h1 .sub-header__title")?.textContent).toBe("Title")
	expect(bar?.querySelector("h1 small")?.textContent).toBe("More")
	expect(bar?.querySelector(".sub-header__actions")).toBeNull()
})

test("no subtitle line without a detail", () => {
	expect(show({ title: "Title", back: "/" }).querySelector(".sub-header h1 small")).toBeNull()
})

test("actions sit at the bar's end, outside the heading", () => {
	const root = show({
		title: "Title",
		back: "/",
		actions: createRawSnippet(() => ({ render: () => '<a data-action="edit" href="/e">Edit</a>' })),
	})
	expect(root.querySelector('.sub-header > .sub-header__actions a[data-action="edit"]')).not.toBeNull()
	expect(root.querySelector(".sub-header h1")?.textContent).not.toContain("Edit")
})

test("the back label is translated, and follows a switch", () => {
	const root = show({ title: "Title", back: "/" })
	setLocale("th")
	flushSync()
	expect(root.querySelector('[data-action="back"]')?.getAttribute("aria-label")).toBe("กลับ")
})

test("a function back is a quiet button that calls it", () => {
	let calls = 0
	const root = show({
		title: "Title",
		back: () => {
			calls++
		},
	})
	const button = root.querySelector<HTMLButtonElement>('.sub-header > button[data-action="back"]')
	expect(button?.getAttribute("type")).toBe("button")
	expect(button?.getAttribute("data-variant")).toBe("quiet")
	expect(button?.getAttribute("aria-label")).toBe("Back")
	expect(button?.querySelector("svg")).not.toBeNull()
	button?.click()
	expect(calls).toBe(1)
})
