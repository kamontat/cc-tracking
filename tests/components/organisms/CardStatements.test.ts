import type { LedgerStatement, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import CardStatements from "#components/organisms/CardStatements.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * A card's statements, newest first, each unfolding to its purchases and payments, with Edit and
 * a two-step Delete on a purchase. Ported from the legacy `cc-card-statements` tests, against the
 * same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes Svelte's updates and anything they await. */
const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const TODAY = "2026-10-30"

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kb",
	date: "2026-10-02",
	amount: 1_200_00,
	note: "fuel",
	...overrides,
})

const statement = (overrides: Partial<LedgerStatement> = {}): LedgerStatement => ({
	cardId: "kb",
	period: "2026-11",
	closeDate: "2026-11-10",
	dueDate: "2026-12-05",
	purchases: [],
	total: 0,
	paidAmount: 0,
	payments: [],
	remaining: 0,
	paid: false,
	open: true,
	...overrides,
})

const current = statement({
	purchases: [purchase({ id: "c1", date: "2026-10-20", note: "rice" })],
	total: 500_00,
	remaining: 500_00,
})
const dueSoon = statement({
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	open: false,
	purchases: [purchase(), purchase({ id: "p2", date: "2026-09-20", note: "", amount: 300_00 })],
	total: 1_500_00,
	paidAmount: 500_00,
	remaining: 1_000_00,
})
const quietA = statement({
	period: "2026-09",
	closeDate: "2026-09-10",
	dueDate: "2026-10-05",
	open: false,
	paid: true,
})
const quietB = statement({
	period: "2026-08",
	closeDate: "2026-08-10",
	dueDate: "2026-09-04",
	open: false,
	paid: true,
})
const paid = statement({
	period: "2026-07",
	closeDate: "2026-07-10",
	dueDate: "2026-08-04",
	open: false,
	purchases: [purchase({ id: "p3", date: "2026-07-01" })],
	total: 1_200_00,
	paidAmount: 1_200_00,
	remaining: 0,
	paid: true,
})

interface Shown {
	statements?: LedgerStatement[]
	today?: string
}

/**
 * Mounts the statements; `set` changes a prop afterwards, as the page would on a reload. The
 * props read through a `SvelteMap`, so a change reaches the mounted component.
 */
const show = async (initial: Shown = {}) => {
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ statements: [current, dueSoon, quietA, quietB, paid], today: TODAY, ...initial }),
	)
	const edited: string[] = []
	const deleted: string[] = []
	mounted = mount(CardStatements, {
		target: document.body,
		props: {
			get statements() {
				return values.get("statements") as LedgerStatement[]
			},
			get today() {
				return values.get("today") as string
			},
			oneditpurchase: ({ purchase }: { purchase: Purchase }) => edited.push(purchase.id),
			ondeletepurchase: ({ purchase }: { purchase: Purchase }) => deleted.push(purchase.id),
		},
	})
	await settle()
	return {
		root: document.body,
		edited,
		deleted,
		set: async (changes: Shown) => {
			for (const [key, value] of Object.entries(changes)) values.set(key, value)
			await settle()
		},
	}
}

const text = (el: Node | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const rows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("[data-period]")]
const row = (root: ParentNode, period: string) => root.querySelector<HTMLElement>(`[data-period="${period}"]`)

const unfold = async (root: ParentNode, period: string) => {
	row(root, period)?.querySelector<HTMLButtonElement>("button.head")?.click()
	await settle()
}

const press = async (root: ParentNode, id: string, action: string) => {
	root.querySelector<HTMLButtonElement>(`[data-purchase="${id}"] [data-action="${action}"]`)?.click()
	await settle()
}

test("each statement reads Mon YYYY with its tag, its dates and what is left", async () => {
	const { root } = await show()
	expect(rows(root).map((r) => r.getAttribute("data-period"))).toEqual(["2026-11", "2026-10", "2026-07"])
	const cur = row(root, "2026-11")
	expect(text(cur?.querySelector(".name"))).toBe("Nov 2026")
	expect(text(cur?.querySelector(".tag"))).toBe("Current")
	expect(cur?.querySelector(".tag")?.getAttribute("data-tone")).toBe("ok")
	expect(text(cur?.querySelector(".sub"))).toBe("closes 10 Nov 2026 · due 05 Dec 2026")
	expect(text(cur?.querySelector(".left"))).toBe("฿500.00")
	expect(cur?.querySelector(".left")?.hasAttribute("data-numeric")).toBe(true)

	const soon = row(root, "2026-10")
	expect(text(soon?.querySelector(".tag"))).toBe("Due in 5 days")
	expect(soon?.querySelector(".tag")?.getAttribute("data-urgency")).toBe("soon")
	expect(text(soon?.querySelector(".left"))).toBe("฿1,000.00")
	expect(text(soon?.querySelector(".paid-part"))).toBe("Paid ฿500.00")

	const done = row(root, "2026-07")
	expect(text(done?.querySelector(".tag"))).toBe("Paid")
	expect(text(done?.querySelector(".sub"))).toBe("paid in full")
	expect(text(done?.querySelector(".left"))).toBe("฿0.00")
	expect(done?.querySelector(".left")?.hasAttribute("data-zero")).toBe(true)
	expect(soon?.querySelector(".left")?.hasAttribute("data-zero")).toBe(false)
})

test("an overdue statement says by how many days; a later one names its due date", async () => {
	let { root } = await show({ today: "2026-11-07" })
	let tag = row(root, "2026-10")?.querySelector(".tag")
	expect(text(tag)).toBe("Overdue 3 days")
	expect(tag?.getAttribute("data-urgency")).toBe("overdue")
	unmount(mounted as ReturnType<typeof mount>)
	;({ root } = await show({ today: "2026-10-12" }))
	tag = row(root, "2026-10")?.querySelector(".tag")
	expect(text(tag)).toBe("Due 04 Nov 2026")
})

test("quiet months fold into one line", async () => {
	const { root } = await show()
	expect([...root.querySelectorAll(".quiet")].map(text)).toEqual(["Aug 2026 – Sep 2026 · no purchases"])
})

test("a statement with purchases is a button that unfolds them", async () => {
	const { root } = await show()
	const head = row(root, "2026-10")?.querySelector<HTMLButtonElement>("button.head")
	expect(head?.getAttribute("type")).toBe("button")
	expect(head?.getAttribute("aria-expanded")).toBe("false")
	expect(root.querySelector('[data-purchase="p1"]')).toBeNull()
	head?.click()
	await settle()
	expect(head?.getAttribute("aria-expanded")).toBe("true")
	const line = root.querySelector('[data-purchase="p1"]')
	expect(text(line?.querySelector(".pdate"))).toBe("02 Oct 2026")
	expect(text(line?.querySelector(".pnote"))).toBe("fuel")
	expect(text(line?.querySelector(".pamount"))).toBe("฿1,200.00")
	expect(head?.getAttribute("aria-controls")).toBe(row(root, "2026-10")?.querySelector(".purchases")?.id)
	head?.click()
	await settle()
	expect(root.querySelector('[data-purchase="p1"]')).toBeNull()
})

test("a folded statement points at no list, since none is rendered", async () => {
	const { root } = await show()
	const head = row(root, "2026-10")?.querySelector("button.head")
	expect(head?.hasAttribute("aria-controls")).toBe(false)
})

test("the head holds nothing interactive", async () => {
	const { root } = await show()
	await unfold(root, "2026-10")
	for (const head of root.querySelectorAll("button.head")) {
		expect(head.querySelector("button, a, input, select, textarea")).toBeNull()
	}
})

test("once a confirmed delete's row is gone, focus moves to the statement's button", async () => {
	const { root, set } = await show()
	await unfold(root, "2026-10")
	const line = () => root.querySelector('[data-purchase="p1"]')
	await press(root, "p1", "delete-purchase")
	await press(root, "p1", "confirm-delete")
	await set({ statements: [current, { ...dueSoon, purchases: dueSoon.purchases.slice(1) }, quietA, quietB, paid] })
	expect(line()).toBeNull()
	expect(document.activeElement).toBe(row(root, "2026-10")?.querySelector("button.head") ?? null)
})

test("a confirmed delete that empties its statement moves focus to another statement's button", async () => {
	const lone = statement({ ...paid, purchases: [purchase({ id: "p3", date: "2026-07-01" })] })
	const { root, set } = await show({ statements: [current, lone] })
	await unfold(root, "2026-07")
	await press(root, "p3", "delete-purchase")
	await press(root, "p3", "confirm-delete")
	await set({ statements: [current, { ...lone, purchases: [] }] })
	expect(root.querySelector('[data-purchase="p3"]')).toBeNull()
	expect(document.activeElement).toBe(root.querySelector("button.head"))
})

test("a delete that fails leaves focus where it was", async () => {
	const { root, set } = await show()
	await unfold(root, "2026-10")
	const line = () => root.querySelector('[data-purchase="p1"]')
	await press(root, "p1", "delete-purchase")
	await press(root, "p1", "confirm-delete")
	const before = document.activeElement
	await set({ statements: [current, dueSoon, quietA, quietB, paid] })
	expect(line()).not.toBeNull()
	expect(document.activeElement).toBe(before)
})

test("a statement with nothing on it is not a button", async () => {
	const { root } = await show({ statements: [statement()] })
	expect(row(root, "2026-11")?.querySelector("button")).toBeNull()
	expect(row(root, "2026-11")?.querySelector("div.head")).not.toBeNull()
})

test("Edit asks the page to edit that purchase", async () => {
	const { root, edited } = await show()
	await unfold(root, "2026-10")
	const edit = root.querySelector('[data-purchase="p2"] [data-action="edit-purchase"]')
	expect(edit?.getAttribute("aria-label")).toBe("Edit the ฿300.00 purchase of 20 Sep 2026")
	await press(root, "p2", "edit-purchase")
	expect(edited).toEqual(["p2"])
})

test("Delete swaps to Delete ฿X? with Delete and Keep, and focus follows the swap", async () => {
	const { root, deleted } = await show()
	await unfold(root, "2026-10")
	const line = () => root.querySelector('[data-purchase="p1"]')
	await press(root, "p1", "delete-purchase")
	expect(text(line()?.querySelector(".ask"))).toBe("Delete ฿1,200.00?")
	const confirm = line()?.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
	expect(confirm?.getAttribute("data-variant")).toBe("danger")
	expect(document.activeElement).toBe(confirm ?? null)
	expect(deleted).toEqual([])

	await press(root, "p1", "keep")
	expect(line()?.querySelector(".ask")).toBeNull()
	expect(document.activeElement).toBe(line()?.querySelector('[data-action="delete-purchase"]') ?? null)

	await press(root, "p1", "delete-purchase")
	await press(root, "p1", "confirm-delete")
	expect(deleted).toEqual(["p1"])
})

test("folding a statement drops its half-done delete", async () => {
	const { root } = await show()
	await unfold(root, "2026-10")
	await press(root, "p1", "delete-purchase")
	await unfold(root, "2026-10")
	await unfold(root, "2026-10")
	expect(root.querySelector('[data-purchase="p1"] .ask')).toBeNull()
	expect(root.querySelector('[data-purchase="p1"] [data-action="delete-purchase"]')).not.toBeNull()
})

test("no statements says where purchases come from", async () => {
	const { root } = await show({ statements: [] })
	expect(text(root)).toBe("No statements yet. Purchases come from purchase lists on Home.")
	expect(root.querySelector("p.empty")).not.toBeNull()
})

test("a language switch re-renders in place", async () => {
	const { root } = await show()
	const before = row(root, "2026-11")
	setLocale("th")
	flushSync()
	expect(row(root, "2026-11")).toBe(before)
	expect(text(row(root, "2026-11")?.querySelector(".tag"))).toBe("รอบปัจจุบัน")
	expect(text(row(root, "2026-11")?.querySelector(".name"))).toBe("พ.ย. 2026")
})

const payment = (id: string, date: string, amount: number): LedgerStatement["payments"][number]["payment"] => ({
	id,
	cardId: "kb",
	date,
	amount,
	status: "paid",
})

const withPayments = statement({
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	open: false,
	purchases: [
		purchase({ id: "p2", date: "2026-09-20", note: "rice", amount: 300_00 }),
		purchase({ id: "p1", date: "2026-10-02", amount: 1_200_00 }),
	],
	total: 1_500_00,
	paidAmount: 700_00,
	payments: [
		{ payment: payment("y1", "2026-09-25", 500_00), amount: 500_00 },
		{ payment: payment("y2", "2026-10-20", 900_00), amount: 200_00 },
	],
	remaining: 800_00,
})

const lines = (root: ParentNode, period: string) => [
	...(row(root, period)?.querySelectorAll<HTMLElement>(".purchases > li") ?? []),
]

test("an unfolded statement lists its payment parts among its purchases, by date", async () => {
	const { root } = await show({ statements: [withPayments] })
	await unfold(root, "2026-10")
	expect(
		lines(root, "2026-10").map((li) => li.getAttribute("data-purchase") ?? li.getAttribute("data-payment")),
	).toEqual(["p2", "y1", "p1", "y2"])

	const whole = root.querySelector<HTMLElement>('[data-payment="y1"]')
	expect(whole?.classList.contains("payment")).toBe(true)
	expect(text(whole?.querySelector(".pdate"))).toBe("25 Sep 2026")
	expect(text(whole?.querySelector(".pnote"))).toBe("Payment")
	expect(text(whole?.querySelector(".pamount"))).toBe("+฿500.00")
	expect(whole?.querySelector(".pamount")?.hasAttribute("data-numeric")).toBe(true)
	expect(whole?.querySelector(".ppart")).toBeNull()

	const split = root.querySelector<HTMLElement>('[data-payment="y2"]')
	expect(text(split?.querySelector(".pamount"))).toBe("+฿200.00")
	expect(text(split?.querySelector(".ppart"))).toBe("(part of ฿900.00)")
})

test("a payment part has no Edit or Delete", async () => {
	const { root } = await show({ statements: [withPayments] })
	await unfold(root, "2026-10")
	for (const id of ["y1", "y2"]) {
		const line = root.querySelector(`[data-payment="${id}"]`)
		expect(line).not.toBeNull()
		expect(line?.querySelector("button")).toBeNull()
	}
})

test("two parts of one payment on one statement read as one line", async () => {
	const y = payment("y1", "2026-09-25", 1_000_00)
	const { root } = await show({
		statements: [
			statement({
				...withPayments,
				payments: [
					{ payment: y, amount: 300_00 },
					{ payment: y, amount: 400_00 },
				],
			}),
		],
	})
	await unfold(root, "2026-10")
	const found = root.querySelectorAll('[data-payment="y1"]')
	expect(found.length).toBe(1)
	expect(text(found[0]?.querySelector(".pamount"))).toBe("+฿700.00")
	expect(text(found[0]?.querySelector(".ppart"))).toBe("(part of ฿1,000.00)")
})

test("a statement with payments and no purchases still unfolds", async () => {
	const { root } = await show({
		statements: [
			statement({
				...withPayments,
				purchases: [],
				payments: [{ payment: payment("y1", "2026-09-25", 500_00), amount: 500_00 }],
			}),
		],
	})
	const head = row(root, "2026-10")?.querySelector<HTMLButtonElement>("button.head")
	expect(head).not.toBeNull()
	head?.click()
	await settle()
	expect(root.querySelector('[data-payment="y1"]')).not.toBeNull()
})

test("a payment reads in Thai", async () => {
	setLocale("th")
	const { root } = await show({ statements: [withPayments] })
	await unfold(root, "2026-10")
	const split = root.querySelector<HTMLElement>('[data-payment="y2"]')
	expect(text(split?.querySelector(".pnote"))).toBe("การชำระ (ส่วนหนึ่งของ ฿900.00)")
})

const style = async () =>
	(await Bun.file("src/components/organisms/CardStatements.svelte").text()).split("<style>")[1] ?? ""

test("the look takes every value from the tokens", async () => {
	const css = await style()
	expect(css).not.toBe("")
	// Media and container queries can't read a custom property, so a breakpoint is the one literal allowed.
	const rules = css.replace(/@(?:media|container)[^{]*/g, "")
	expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
	expect(rules).not.toMatch(/\d(?:\.\d+)?(?:px|rem|em)\b/)
	expect(rules).not.toContain("calc(var(--cc-border-width) *")
})

// The panel's own width decides, not the screen's: from 900px it sits in the narrow side column,
// where one line has no room for the date, note, amount and both buttons.
test("a narrow panel gives the buttons their own line; a wide one keeps them on the row", async () => {
	const css = await style()
	expect(css).not.toContain("@media (max-width: 639px)")
	expect(css).toMatch(/\.panel\s*{[^}]*container: statements \/ inline-size;/)
	expect(css).toMatch(/\.purchases\s*{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto;/)
	expect(css).toMatch(/\.pactions\s*{[^}]*grid-column: 1 \/ -1;/)
	expect(css).toMatch(
		/@container statements \(min-width: [\d.]+rem\)\s*{[^}]*\.purchases\s*{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto auto;/,
	)
	expect(css).toMatch(/@container statements \(min-width: [\d.]+rem\)[\s\S]*\.pactions\s*{[^}]*grid-column: auto;/)
})
