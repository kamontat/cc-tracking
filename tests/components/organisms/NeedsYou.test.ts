import type { NeedsItem } from "#lib/domain/home"
import type { Card, CardPayment, LimitGroup, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import NeedsYou from "#components/organisms/NeedsYou.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * Home's *Needs you*: overdue bills, planned payments, waiting lists and drafts, each a row that
 * opens in place, five shown then *See more*. Ported from the legacy `cc-needs-you` tests,
 * against the same markup.
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

const card: Card = {
	id: "SCB/K",
	name: "SCB K",
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
}

const { limitGroupId: _unused, ...noGroup } = card

const groups: LimitGroup[] = [{ id: "g1", name: "SCB", limit: 1, owner: "RI" }]

const list = (id: string, status: PurchaseList["status"], cards: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status,
	lines: cards.map((cardId) => ({ cardId, amount: 100 })),
})

const items = (): NeedsItem[] => [
	{
		kind: "waiting",
		list: list("w1", "sent", ["A", "B", "C"]),
		total: 39_300_00,
	},
	{
		kind: "overdue",
		card,
		remaining: 41_230_00,
		billed: 41_230_00,
		startDate: "2026-08-19",
		closeDate: "2026-09-30",
		dueDate: "2026-10-15",
		days: 16,
	},
	{
		kind: "draft",
		list: list("d1", "draft", ["KB-S", "KS-K"]),
		total: 5_000_00,
	},
]

interface Shown {
	items?: NeedsItem[]
	cards?: Card[]
	groups?: LimitGroup[]
	today?: string
}

/**
 * Mounts the section; `set` changes props afterwards, as Home would on a reload. The props read
 * through a `SvelteMap`, so a change reaches the mounted component. `calls` records each
 * callback's argument.
 */
const show = async (initial: Shown = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ items: [], cards: [], groups, today: "2026-10-31", ...initial }),
	)
	const calls = {
		marked: [] as CardPayment[],
		deleted: [] as CardPayment[],
		confirmed: [] as PurchaseList[],
		drafts: [] as PurchaseList[],
		merged: [] as PurchaseList[],
	}
	const props: Record<string, unknown> = {
		onmarkpaid: (p: CardPayment) => calls.marked.push(p),
		ondeletepayment: (p: CardPayment) => calls.deleted.push(p),
		onconfirmlist: (l: PurchaseList) => calls.confirmed.push(l),
		ondeletedraft: (l: PurchaseList) => calls.drafts.push(l),
		onmergelists: (l: PurchaseList) => calls.merged.push(l),
	}
	for (const key of ["items", "cards", "groups", "today"])
		Object.defineProperty(props, key, { get: () => values.get(key) })
	mounted = mount(NeedsYou, { target: document.body, props: props as never })
	await settle()
	return {
		root: document.body as ParentNode,
		calls,
		set: async (changes: Shown) => {
			for (const [key, value] of Object.entries(changes)) values.set(key, value)
			await settle()
		},
	}
}

/** Taps a row's head and waits for the repaint. */
const open = async (head: string) => {
	document.body.querySelector<HTMLElement>(head)?.click()
	await settle()
}

/** Clicks an element and waits for the repaint. */
const click = async (el: Element | null | undefined) => {
	;(el as HTMLElement).click()
	await settle()
}

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim()

const planned = (date: string): NeedsItem & { kind: "planned" } => ({
	kind: "planned",
	payment: {
		id: "c1",
		cardId: "SCB/K",
		date,
		amount: 5_000_00,
		status: "planned",
	},
	card,
})

const slots = (row: Element) => ({
	title: text(row, ".a-title"),
	subtitle: text(row, ".a-sub"),
	amount: text(row, ".a-hit .amount"),
})

/** Each matching element's text, in order. */
const parts = (root: ParentNode, selector: string) =>
	[...root.querySelectorAll(selector)].map((e) => e.textContent?.trim())

const shownDetails = (root: ParentNode) => root.querySelector<HTMLElement>(".a-details:not([hidden])")

const overdue = (days: number, more: Partial<NeedsItem & { kind: "overdue" }> = {}): NeedsItem => ({
	kind: "overdue",
	card,
	remaining: 100,
	billed: 100,
	startDate: "2026-08-19",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	days,
	...more,
})

test("every row head is one button that opens it in place, no link", async () => {
	const { root } = await show({ items: [...items(), planned("2026-11-02")] })
	const heads = [...root.querySelectorAll("[data-item]")]
	expect(heads.map((e) => e.getAttribute("data-item"))).toEqual(["waiting", "overdue", "draft", "planned"])
	for (const head of heads) {
		expect(head.localName).toBe("button")
		expect(head.getAttribute("aria-expanded")).toBe("false")
		expect(head.querySelector("a, button")).toBeNull()
		const details = document.getElementById(head.getAttribute("aria-controls") ?? "")
		expect(details?.hidden).toBe(true)
	}
	expect(root.querySelector("a.a-hit")).toBeNull()
})

test("rows keep their ids and details ids", async () => {
	const { root } = await show({ items: [...items(), planned("2026-11-02")] })
	expect([...root.querySelectorAll("[data-row]")].map((e) => e.getAttribute("data-row"))).toEqual([
		"list:w1",
		"due:SCB/K",
		"list:d1",
		"plan:SCB/K:c1",
	])
	expect(root.querySelector('[data-item="overdue"]')?.getAttribute("aria-controls")).toBe("cc-needs-you-due:SCB/K")
	expect(root.querySelector("#needs-list.row-panel")).not.toBeNull()
})

test("each kind fills the row's title and subtitle, with the amount on the right and no badge or button", async () => {
	const { root } = await show({
		items: [...items(), planned("2026-11-02")],
		cards: [
			{ ...card, id: "KB-S", name: "KBank S" },
			{ ...noGroup, id: "KS-K", name: "KBank K" },
		],
	})
	const [waiting, over, draft, plan] = [...root.querySelectorAll(".a-row")] as Element[]
	expect(slots(waiting as Element)).toEqual({
		title: "Waiting on list for 30 Oct 2026",
		subtitle: "c-[A], c-[B], c-[C]",
		amount: "−฿3.00",
	})
	expect(slots(over as Element)).toEqual({
		title: "Overdue: SCB K (RI)",
		subtitle: "for 16 days",
		amount: "฿41,230.00",
	})
	expect(slots(draft as Element)).toEqual({
		title: "Draft list for 30 Oct 2026",
		subtitle: "KBank S (RI), KBank K",
		amount: "−฿2.00",
	})
	expect(slots(plan as Element)).toEqual({
		title: "Planned: pay SCB K (RI)",
		subtitle: "02 Nov 2026 · in 2 days",
		amount: "+฿5,000.00",
	})
	expect(root.querySelector(".a-hit button, .a-hit a")).toBeNull()
	// The icon says the kind; no card chip besides (DD-106).
	for (const row of root.querySelectorAll("[data-item]")) {
		expect(row.querySelector(".a-ic .icon")).not.toBeNull()
		expect(row.querySelector(".mini")).toBeNull()
	}
	expect(root.querySelector('.a-ic[data-kind="draft"]')?.innerHTML).toBeTruthy()
})

test("more than three cards read as a count", async () => {
	const { root } = await show({
		items: [{ kind: "waiting", list: list("w1", "sent", ["A", "B", "C", "D"]), total: 400 }],
	})
	expect(text(root, ".a-sub")).toBe("4 cards")
})

test("the heading counts", async () => {
	expect(text((await show({ items: items().slice(0, 1) })).root, "h1")).toBe("1 thing needs you")
	const { root } = await show({ items: items() })
	expect(text(root, "h1")).toBe("3 things need you")
	expect(root.querySelector("h1")?.getAttribute("data-refocus")).toBe("needs")
	expect(root.querySelector("h1")?.getAttribute("tabindex")).toBe("-1")
})

test("a quiet day is all caught up", async () => {
	const { root } = await show({ items: [] })
	expect(text(root, "h1")).toBe("All caught up")
	expect(root.querySelector("h1")?.getAttribute("data-refocus")).toBe("needs")
	expect(root.querySelector("[data-item]")).toBeNull()
	expect(root.querySelector('p.note[data-tone="ok"]')).not.toBeNull()
})

test("reads in Thai", async () => {
	setLocale("th")
	const { root } = await show({ items: items() })
	expect(text(root, "h1")).toBe("มี 3 เรื่องรอคุณ")
	expect(text(root, '[data-item="waiting"] .a-title')).toBe("รอคำตอบใบรายการซื้อวันที่ 30 ต.ค. 2026")
	expect(root.querySelector(".a-badge, .tag")).toBeNull()
	expect(text(root, '[data-item="overdue"] .a-title')).toBe("เลยกำหนด: SCB K (RI)")
	expect(text(root, '[data-item="overdue"] .a-sub')).toBe("เป็นเวลา 16 วัน")
})

test("a language switch repaints the rows", async () => {
	const { root } = await show({ items: items() })
	setLocale("th")
	await settle()
	expect(text(root, "h1")).toBe("มี 3 เรื่องรอคุณ")
	expect(text(root, '[data-item="overdue"] .a-title')).toBe("เลยกำหนด: SCB K (RI)")
})

test("the overdue amount carries the danger tone, with its words", async () => {
	const { root } = await show({ items: [overdue(1, { closeDate: "2026-10-15", dueDate: "2026-10-30" })] })
	const amount = root.querySelector('[data-item="overdue"]')?.closest(".a-row")?.querySelector(".amount")
	expect(amount?.classList.contains("danger")).toBe(true)
	expect(text(root, '[data-item="overdue"] .a-title')).toContain("Overdue")
})

test("one day overdue reads in the singular", async () => {
	const { root } = await show({ items: [overdue(1, { closeDate: "2026-10-15", dueDate: "2026-10-30" })] })
	expect(text(root, '[data-item="overdue"] .a-title')).toBe("Overdue: SCB K (RI)")
	expect(text(root, '[data-item="overdue"] .a-sub')).toBe("for 1 day")
})

test("a list id is encoded in its opened row's link", async () => {
	const { root } = await show({
		items: [
			{ kind: "waiting", list: list("w 1/2", "sent", ["A"]), total: 100 },
			{ kind: "draft", list: list("d&1", "draft", ["A"]), total: 100 },
		],
	})
	await open('[data-item="waiting"]')
	await open('[data-item="draft"]')
	expect(
		[...root.querySelectorAll(".a-details:not([hidden]) a[data-action]")].map((e) => e.getAttribute("href")),
	).toEqual(["/list/draft?id=d%261"])
	await open('[data-item="waiting"]')
	expect(root.querySelector(".a-details:not([hidden]) a[data-action=record-reply]")?.getAttribute("href")).toBe(
		"/list/reply?id=w%201%2F2",
	)
})

test("a planned payment says how far off it is after its date, and a past plan how long ago", async () => {
	const row = async (date: string) => {
		const { root } = await show({ items: [planned(date)] })
		return [text(root, ".a-title"), text(root, ".a-sub")]
	}
	expect(await row("2026-10-31")).toEqual(["Planned: pay SCB K (RI)", "31 Oct 2026 · today"])
	expect((await row("2026-11-01"))[1]).toBe("01 Nov 2026 · tomorrow")
	expect((await row("2026-11-03"))[1]).toBe("03 Nov 2026 · in 3 days")
	expect((await row("2026-10-30"))[1]).toBe("30 Oct 2026 · 1 day ago")
	expect((await row("2026-10-28"))[1]).toBe("28 Oct 2026 · 3 days ago")
	setLocale("th")
	expect((await row("2026-10-30"))[0]).toBe("วางแผนไว้: ชำระ SCB K (RI)")
})

const many = (count: number): NeedsItem[] =>
	Array.from({ length: count }, (_, i) => ({
		kind: "waiting" as const,
		list: list(`w${i}`, "sent", ["A"]),
		total: 100,
	}))

const shown = (root: ParentNode) => [...root.querySelectorAll("[data-row]")].map((e) => e.getAttribute("data-row"))

test("five or fewer things show in full, with no See more", async () => {
	const { root } = await show({ items: many(5) })
	expect(shown(root)).toHaveLength(5)
	expect(root.querySelector('[data-action="more"]')).toBeNull()
})

test("more than five show the first five and See more expands the rest in place, in order", async () => {
	const { root } = await show({ items: many(8) })
	expect(text(root, "h1")).toBe("8 things need you")
	expect(shown(root)).toEqual([0, 1, 2, 3, 4].map((i) => `list:w${i}`))
	const more = root.querySelector<HTMLButtonElement>('[data-action="more"]')
	expect(more?.getAttribute("type")).toBe("button")
	expect(more?.getAttribute("data-variant")).toBe("quiet")
	expect(more?.getAttribute("aria-controls")).toBe("needs-list")
	expect(more?.getAttribute("aria-expanded")).toBe("false")
	expect(more?.classList.contains("more")).toBe(true)
	expect(more?.textContent?.trim()).toBe("See more (3)")
	await click(more)
	expect(shown(root)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => `list:w${i}`))
	const less = root.querySelector<HTMLButtonElement>('[data-action="more"]')
	expect(less?.getAttribute("aria-expanded")).toBe("true")
	expect(less?.textContent?.trim()).toBe("Show less")
	await click(less)
	expect(shown(root)).toHaveLength(5)
})

test("See more reads in Thai", async () => {
	setLocale("th")
	const { root } = await show({ items: many(7) })
	expect(text(root, '[data-action="more"]')).toBe("ดูเพิ่ม (2)")
})

test("opening one row closes the other; a second tap closes it", async () => {
	const { root } = await show({ items: items() })
	await open('[data-item="waiting"]')
	expect(root.querySelector('[data-item="waiting"]')?.getAttribute("aria-expanded")).toBe("true")
	await open('[data-item="overdue"]')
	expect([...root.querySelectorAll("[data-item]")].map((e) => e.getAttribute("aria-expanded"))).toEqual([
		"false",
		"true",
		"false",
	])
	expect(root.querySelectorAll(".a-details:not([hidden])")).toHaveLength(1)
	await open('[data-item="overdue"]')
	expect(root.querySelector(".a-details:not([hidden])")).toBeNull()
})

test("an opened overdue bill draws its billing cycle in red to today, says what is left, and offers Pay the amount and Open card", async () => {
	const { root } = await show({ items: [overdue(28, { remaining: 41_230_00, billed: 50_000_00 })] })
	await open('[data-item="overdue"]')
	const details = shownDetails(root) as HTMLElement
	const line = details.querySelector<HTMLElement>(".a-cycle")
	expect(line?.getAttribute("role")).toBe("img")
	expect(line?.getAttribute("aria-label")).toBe("Closed 18 Sep, due 3 Oct (28 days late), today 31 Oct")
	expect(
		[...(line?.querySelectorAll<HTMLElement>(".a-mk") ?? [])].map((m) => [
			m.dataset["mark"],
			m.textContent?.trim(),
			m.hasAttribute("data-late"),
		]),
	).toEqual([
		["closed", "Closed 18 Sep", false],
		["due", "Due 3 Oct", true],
		["now", "Today", false],
	])
	// The line runs from the statement's start to a few days past today, so today sits inside.
	const now = line?.querySelector<HTMLElement>('.a-mk[data-mark="now"]')
	const fill = line?.querySelector<HTMLElement>(".a-fill")
	expect(fill?.hasAttribute("data-late")).toBe(true)
	expect(fill?.style.getPropertyValue("inline-size")).toBe(now?.style.getPropertyValue("inset-inline-start") as string)
	expect(text(details, ".a-say")).toBe("฿41,230.00 left of ฿50,000.00 billed, 28 days late")
	expect(parts(details, ".a-say .a-money")).toEqual(["฿41,230.00", "฿50,000.00"])
	const links = [...details.querySelectorAll(".a-btns > *")]
	expect(links.map((e) => [e.localName, e.className, e.getAttribute("data-variant")])).toEqual([
		["a", "btn", null],
		["a", "btn", "quiet"],
	])
	expect(links.map((e) => e.textContent?.trim())).toEqual(["Pay ฿41,230.00", "Open card"])
	expect(links.map((e) => e.getAttribute("data-action"))).toEqual(["pay", "open-card"])
	expect(links[0]?.getAttribute("href")).toBe("/pay?card=SCB%2FK&amount=4123000")
	expect(links[1]?.getAttribute("href")).toBe("/card?id=SCB%2FK")
	// One wrapper of buttons, not one inside another.
	expect(details.querySelector(".a-btns .a-btns")).toBeNull()
})

test("a bill one day late says so in the singular", async () => {
	const { root } = await show({
		items: [overdue(1, { startDate: "2026-09-19", closeDate: "2026-10-18", dueDate: "2026-10-30" })],
	})
	await open('[data-item="overdue"]')
	expect(text(shownDetails(root) as HTMLElement, ".a-say")).toBe("฿1.00 left of ฿1.00 billed, 1 day late")
})

test("an opened planned payment shows its note; Paid calls onmarkpaid", async () => {
	const item = planned("2026-11-02")
	item.payment.note = "rent"
	const { root, calls } = await show({ items: [item] })
	await open('[data-item="planned"]')
	const details = shownDetails(root) as HTMLElement
	expect(text(details, ".a-say")).toBe("Planned for 2 Nov. rent")
	expect(details.querySelector(".a-cycle, .a-parts")).toBeNull()
	const buttons = [...details.querySelectorAll(".a-btns button")]
	expect(buttons.map((b) => [b.getAttribute("data-action"), b.getAttribute("data-variant")])).toEqual([
		["mark-paid", "quiet"],
		["delete", "danger"],
	])
	await click(buttons[0])
	expect(calls.marked).toEqual([item.payment])
})

test("a planned payment's Delete asks first: Delete and Cancel, and only the second Delete calls back", async () => {
	const item = planned("2026-11-02")
	const { root, calls } = await show({ items: [item] })
	await open('[data-item="planned"]')
	await click(root.querySelector("[data-action=delete]"))
	expect(calls.deleted).toEqual([])
	const asked = [...(shownDetails(root) as HTMLElement).querySelectorAll(".a-btns button")]
	expect(asked.map((b) => b.getAttribute("data-action"))).toEqual(["confirm-delete", "cancel-delete"])
	expect(document.activeElement?.getAttribute("data-action")).toBe("confirm-delete")
	expect(asked[0]?.getAttribute("aria-label")).toBe("Delete ฿5,000.00 to SCB K?")
	await click(asked[1])
	expect(calls.deleted).toEqual([])
	expect(document.activeElement?.getAttribute("data-action")).toBe("delete")
	await click(root.querySelector("[data-action=delete]"))
	await click(root.querySelector("[data-action=confirm-delete]"))
	expect(calls.deleted).toEqual([item.payment])
})

test("an opened waiting list shows each line and when it was sent; Confirm asks Save before it calls back", async () => {
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: [
			{ cardId: "SCB/K", amount: 1_000_00 },
			{ cardId: "X", amount: 250_00 },
		],
	}
	const { root, calls } = await show({ items: [{ kind: "waiting", list: sent, total: 1_250_00 }], cards: [card] })
	await open('[data-item="waiting"]')
	const details = shownDetails(root) as HTMLElement
	expect(parts(details, ".a-part > *")).toEqual(["SCB/K) SCB K (1111)", "฿1,000.00", "X) —", "฿250.00"])
	expect(details.querySelector(".a-total")).toBeNull()
	expect(text(details, ".a-say")).toBe("Sent 30 Oct. Confirm saves every line as made.")
	const first = [...details.querySelectorAll(".a-btns > *")]
	expect(first.map((e) => e.getAttribute("data-action"))).toEqual(["record-reply", "confirm-list"])
	expect(first[0]?.localName).toBe("a")
	expect(first[0]?.className).toBe("btn")
	expect(first[0]?.textContent?.trim()).toBe("Record reply")
	await click(first[1])
	expect(calls.confirmed).toEqual([])
	expect(root.querySelector("[data-confirming] [data-action=save-list]")).not.toBeNull()
	await click(root.querySelector("[data-action=save-list]"))
	expect(calls.confirmed).toEqual([sent])
})

test("an opened draft offers Continue and a one-step Delete", async () => {
	const draft = list("d1", "draft", ["A"])
	const { root, calls } = await show({ items: [{ kind: "draft", list: draft, total: 100 }] })
	await open('[data-item="draft"]')
	const details = shownDetails(root) as HTMLElement
	expect(parts(details, ".a-part > *")).toEqual(["A) —", "฿1.00"])
	expect(text(details, ".a-say")).toBe("Not sent yet.")
	const [go, del] = [...details.querySelectorAll(".a-btns > *")]
	expect(go?.localName).toBe("a")
	expect(go?.className).toBe("btn")
	expect(go?.getAttribute("data-action")).toBe("continue")
	expect(go?.getAttribute("href")).toBe("/list/draft?id=d1")
	expect(go?.textContent?.trim()).toBe("Continue")
	expect(del?.localName).toBe("button")
	expect(del?.getAttribute("type")).toBe("button")
	expect(del?.getAttribute("data-action")).toBe("delete-draft")
	expect(del?.getAttribute("data-variant")).toBe("danger")
	expect(del?.textContent?.trim()).toBe("Delete")
	await click(del)
	expect(calls.drafts).toEqual([draft])
})

test("the open row and a half-done swap survive a repaint; a row that goes is forgotten", async () => {
	const item = planned("2026-11-02")
	const { root, set } = await show({ items: [...items(), item] })
	await open('[data-item="planned"]')
	await click(root.querySelector("[data-action=delete]"))
	await set({ items: [...items(), item] })
	expect(root.querySelector('[data-item="planned"]')?.getAttribute("aria-expanded")).toBe("true")
	expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull()
	await set({ items: items() })
	await set({ items: [...items(), item] })
	expect(root.querySelector('[data-item="planned"]')?.getAttribute("aria-expanded")).toBe("false")
})

test("opened rows read in Thai", async () => {
	setLocale("th")
	const { root } = await show({ items: [overdue(28), { kind: "draft", list: list("d1", "draft", ["A"]), total: 100 }] })
	await open('[data-item="overdue"]')
	const due = shownDetails(root) as HTMLElement
	expect(parts(due, ".a-btns > *")).toEqual(["ชำระ ฿1.00", "เปิดบัตร"])
	expect(text(due, ".a-say")).toBe("เหลือ ฿1.00 จากยอด ฿1.00 เลยกำหนดมา 28 วัน")
	expect(parts(due, ".a-mk")).toEqual(["สรุปยอดแล้ว 18 ก.ย.", "ครบกำหนด 3 ต.ค.", "วันนี้"])
	await open('[data-item="draft"]')
	expect(text(shownDetails(root) as HTMLElement, ".a-say")).toBe("ยังไม่ได้ส่ง")
})

test("a half-done swap ends when its row closes, when another opens, or when its row goes", async () => {
	const item = planned("2026-11-02")
	const { root, set } = await show({ items: [...items(), item] })
	const ask = async () => {
		await click(root.querySelector(".a-details:not([hidden]) [data-action=delete]"))
		expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull()
	}
	await open('[data-item="planned"]')
	await ask()
	await open('[data-item="planned"]')
	await open('[data-item="planned"]')
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull()
	await ask()
	await open('[data-item="overdue"]')
	await open('[data-item="planned"]')
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull()
	await ask()
	await set({ items: items() })
	await set({ items: [...items(), item] })
	await open('[data-item="planned"]')
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull()
})

test("a Needs you plan says its note once, in its details", async () => {
	const item = planned("2026-11-02")
	const noted = { ...item, payment: { ...item.payment, note: "Salary day" } }
	const { root } = await show({ items: [noted] })
	await open('[data-item="planned"]')
	const row = root.querySelector("[data-row]")?.textContent ?? ""
	expect(row.split("Salary day").length - 1).toBe(1)
	expect(root.querySelector(".a-details:not([hidden]) .a-say")?.textContent).toContain("Salary day")
})

test("an opened overdue bill's line is fitted by measuring its labels", async () => {
	const real = HTMLElement.prototype.getBoundingClientRect
	// Every label laid out on top of the others: only Due keeps its words.
	HTMLElement.prototype.getBoundingClientRect = function () {
		return this.classList.contains("a-lbl") ? ({ left: 0, right: 100, width: 100 } as DOMRect) : real.call(this)
	}
	try {
		const { root } = await show({ items: [overdue(28)] })
		await open('[data-item="overdue"]')
		expect(
			[...(shownDetails(root)?.querySelectorAll<HTMLElement>(".a-mk") ?? [])].map((m) => [
				m.dataset["mark"],
				m.hasAttribute("data-quiet"),
			]),
		).toEqual([
			["closed", true],
			["due", false],
			["now", false],
		])
	} finally {
		HTMLElement.prototype.getBoundingClientRect = real
	}
})

test("a draft or waiting list with another of its status that day offers Merge, which calls back", async () => {
	const d1 = list("d1", "draft", ["A"])
	const d2 = list("d2", "draft", ["B"])
	const w1 = { ...list("w1", "sent", ["A"]), sentAt: "2026-10-30T01:00:00.000Z" }
	const { root, calls } = await show({
		items: [
			{ kind: "waiting", list: w1, total: 100 },
			{ kind: "draft", list: d1, total: 100 },
			{ kind: "draft", list: d2, total: 100 },
		],
	})
	await open('[data-row="list:d1"] .a-hit')
	const details = shownDetails(root) as HTMLElement
	expect([...details.querySelectorAll(".a-btns > *")].map((b) => b.getAttribute("data-action"))).toEqual([
		"continue",
		"merge",
		"delete-draft",
	])
	const merge = details.querySelector('[data-action="merge"]')
	expect(merge?.getAttribute("data-variant")).toBe("quiet")
	expect(merge?.textContent?.trim()).toBe("Merge with 1 other list")
	await click(merge)
	expect(calls.merged).toEqual([d1])
	// The one waiting list has no other waiting list that day, so it offers no Merge.
	await open('[data-row="list:w1"] .a-hit')
	expect(shownDetails(root)?.querySelector('[data-action="merge"]')).toBeNull()
})

test("a draft with no amounts yet totals ฿0.00 with no sign", async () => {
	const blank = { ...list("d1", "draft", ["A"]), lines: [{ cardId: "A", amount: 0 }] }
	const { root } = await show({ items: [{ kind: "draft", list: blank, total: 0 }] })
	expect(text(root, '[data-row="list:d1"] .a-hit .amount')).toBe("฿0.00")
})
