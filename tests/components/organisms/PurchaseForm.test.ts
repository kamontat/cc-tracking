import type { Card, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import PurchaseForm from "#components/organisms/PurchaseForm.svelte"

/**
 * The purchase form on its own, as the card panel shows it in place of the card (RD-24): no
 * sheet around it, and a _Cancel_ back to the card. The fields are `PurchaseSheet`'s, tested there.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const card: Card = {
	id: "5",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
}

const show = (props: { purchase?: Purchase | null; oncancel?: () => void } = {}) => {
	const saved: Purchase[] = []
	mounted = mount(PurchaseForm, {
		target: document.body,
		props: {
			card,
			groups: [],
			purchase: null,
			today: "2026-10-30",
			error: "",
			busy: false,
			onsave: (purchase: Purchase) => saved.push(purchase),
			...props,
		},
	})
	flushSync()
	return saved
}

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

test("a form with no sheet around it, saving a new purchase on the card", () => {
	const saved = show()
	expect($("dialog")).toBeNull()
	const amount = $<HTMLInputElement>('input[name="amount"]')
	if (!amount) throw new Error("no amount")
	amount.value = "120"
	amount.dispatchEvent(new Event("input", { bubbles: true }))
	flushSync()
	$("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	expect(saved).toHaveLength(1)
	expect(saved[0]).toMatchObject({ cardId: "5", amount: 120_00, date: "2026-10-30" })
})

test("Cancel shows only with oncancel, and calls it", () => {
	show()
	expect($('[data-action="cancel"]')).toBeNull()
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	let cancelled = 0
	show({
		oncancel: () => {
			cancelled++
		},
	})
	const cancel = $('button[data-action="cancel"]')
	expect(cancel?.getAttribute("data-variant")).toBe("quiet")
	expect(cancel?.getAttribute("type")).toBe("button")
	cancel?.click()
	expect(cancelled).toBe(1)
})

test("the look is drawn with the cc tokens only", async () => {
	const source = await Bun.file("src/components/organisms/PurchaseForm.svelte").text()
	const style = source.slice(source.indexOf("<style>"))
	expect(style).toContain(".warning")
	expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|\d(px|rem)\b/i)
})
