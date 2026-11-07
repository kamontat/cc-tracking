import type { CardPayment, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, tick, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
import { setLocale } from "#lib/i18n/index"
import { TwoStep } from "#lib/ui/two-step.svelte"

/**
 * The buttons that ask twice before they write (UI-09, DD-110): *Delete* swaps for an asking
 * *Delete* and *Cancel*, *Confirm* for *Save* and *Cancel*; only the second step calls back, and
 * focus follows each swap. Ported from the legacy `useTwoStep` tests in the row components.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const payment: CardPayment = { id: "p1", cardId: "1", date: "2026-11-05", amount: 1_000_00 } as CardPayment
const list = { id: "l1", date: "2026-11-02", status: "sent", lines: [{ cardId: "1", amount: 1 }] } as PurchaseList

const button = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)

const draw = (props: Record<string, unknown>) => {
	const steps = new TwoStep(() => document.body)
	mounted = mount(TwoStepButtons, { target: document.body, props: { steps, ...props } as never })
	flushSync()
	return steps
}

test("a planned payment's Paid calls at once; its Delete asks first, names what goes, and focus follows", async () => {
	const calls: string[] = []
	draw({
		kind: "plan",
		payment,
		card: undefined,
		onpaid: () => calls.push("paid"),
		onremove: () => calls.push("remove"),
	})
	button("mark-paid")?.click()
	expect(calls).toEqual(["paid"])
	button("delete")?.click()
	flushSync()
	await tick()
	expect(calls).toEqual(["paid"])
	expect(button("mark-paid")).toBeNull()
	const ask = button("confirm-delete")
	expect(ask?.getAttribute("aria-label")).toBe("Delete ฿1,000.00 to c-[1]?")
	expect(ask?.closest(".a-swap")?.getAttribute("data-confirming")).toBe("1:p1")
	expect(document.activeElement).toBe(ask)
	button("cancel-delete")?.click()
	flushSync()
	await tick()
	expect(document.activeElement).toBe(button("delete"))
	button("delete")?.click()
	flushSync()
	button("confirm-delete")?.click()
	flushSync()
	expect(calls).toEqual(["paid", "remove"])
})

test("a paid payment offers only Delete", () => {
	draw({ kind: "paid", payment, card: undefined, onremove: () => {} })
	expect(button("mark-paid")).toBeNull()
	expect(button("delete")).not.toBeNull()
})

test("a waiting list's Confirm swaps for Save and Cancel; only Save calls back", async () => {
	let confirmed = 0
	const steps = draw({ kind: "list", list, onconfirm: () => confirmed++ })
	button("confirm-list")?.click()
	flushSync()
	await tick()
	expect(confirmed).toBe(0)
	expect(button("save-list")?.getAttribute("aria-label")).toBe("Save it as made?")
	expect(document.activeElement).toBe(button("save-list"))
	button("cancel-confirm")?.click()
	flushSync()
	expect(button("save-list")).toBeNull()
	button("confirm-list")?.click()
	flushSync()
	button("save-list")?.click()
	flushSync()
	expect(confirmed).toBe(1)
	// A reset (its row closed) ends a half-done swap.
	button("confirm-list")?.click()
	flushSync()
	steps.reset()
	flushSync()
	expect(button("save-list")).toBeNull()
})
