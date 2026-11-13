import type { Card, LimitGroup } from "#lib/domain/types"
import type { PayDetail, PayFigures } from "#lib/ui/pay-form"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import PayForm from "#components/organisms/PayForm.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The payment sheet's second step, for one card. Ported from the legacy `cc-pay-form` tests,
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
	for (let i = 0; i < 3; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const card: Card = {
	id: "A",
	name: "Alpha",
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
}

const usual: PayFigures = { owed: 500_00, credit: 0, nextBill: 300_00, overdue: false }

/** Mounts the form; `set` changes a prop afterwards, as the page would. */
const show = async (figures: PayFigures = usual, amount = "", extra: Record<string, unknown> = {}) => {
	if (mounted) unmount(mounted)
	setLocale("en")
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ card, groups: [], figures, today: "2026-10-31", amount, error: "", busy: false, ...extra }),
	)
	const sent: PayDetail[] = []
	mounted = mount(PayForm, {
		target: document.body,
		props: {
			get card() {
				return (values.get("card") as Card | null) ?? null
			},
			get groups() {
				return values.get("groups") as LimitGroup[]
			},
			get figures() {
				return values.get("figures") as PayFigures
			},
			get today() {
				return values.get("today") as string
			},
			get amount() {
				return values.get("amount") as string
			},
			get error() {
				return values.get("error") as string
			},
			get busy() {
				return values.get("busy") as boolean
			},
			get startDate() {
				return (values.get("startDate") as string | undefined) ?? ""
			},
			get startNote() {
				return (values.get("startNote") as string | undefined) ?? ""
			},
			onpay: (detail: PayDetail) => sent.push(detail),
		},
	})
	await settle()
	return {
		sent,
		set: async (next: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(next)) values.set(key, value)
			await settle()
		},
	}
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const type = async (name: string, value: string) => {
	const input = q<HTMLInputElement>(`[name="${name}"]`)
	if (!input) throw new Error(`no ${name}`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}
const submitButton = () => q<HTMLButtonElement>('button[type="submit"]')
const submitText = () => flat(submitButton())
const submit = async () => {
	q("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}
const click = async (selector: string) => {
	q(selector)?.click()
	await settle()
}

test("shows the card in the panel form and its figures, with no Change: the card picker retired", async () => {
	await show()
	expect(flat(q(".paycard b"))).toBe("A) Alpha")
	expect(flat(q(".paycard .mini[data-big]"))).toBe("1234")
	expect(flat(q('[data-stat="owed"]'))).toBe("Owed ฿500.00")
	expect(flat(q('[data-stat="bill"]'))).toBe("Next bill ฿300.00")
	expect(flat(q('[data-stat="credit"]'))).toBe("Credit ฿0.00")
	expect(q('[data-stat="bill"] b')?.hasAttribute("data-overdue")).toBe(false)
	expect(q('[data-action="change"]')).toBeNull()
	expect(flat(q(".hint"))).toBe("Any day of the month. A later date saves it as a plan.")
})

test("the card chip wears its group's colour", async () => {
	await show(usual, "", {
		card: { ...card, limitGroupId: "g1" },
		groups: [{ id: "g1", name: "KBank", limit: 100_000_00, color: "teal" }],
	})
	expect(q(".paycard .mini")?.getAttribute("data-g")).toBe("teal")
})

test("renders nothing without a card", async () => {
	await show(usual, "", { card: null })
	expect(q(".paycard")).toBeNull()
	expect(q("form")).toBeNull()
})

test("an overdue bill is marked, and no bill reads as a dash", async () => {
	await show({ owed: 500_00, credit: 0, nextBill: 300_00, overdue: true })
	expect(q('[data-stat="bill"] b')?.hasAttribute("data-overdue")).toBe(true)
	await show({ owed: 0, credit: 20_00, nextBill: 0, overdue: false })
	expect(flat(q('[data-stat="bill"]'))).toBe("Next bill —")
	expect(q(".chips")).toBeNull()
})

test("the button asks for an amount until there is one", async () => {
	await show()
	expect(submitText()).toBe("Enter an amount")
	expect(submitButton()?.disabled).toBe(true)
	await type("amount", "abc")
	expect(submitButton()?.disabled).toBe(true)
	await type("amount", "120.5")
	expect(submitText()).toBe("Record ฿120.50 to Alpha")
	expect(submitButton()?.disabled).toBe(false)
})

test("a later date plans the payment", async () => {
	await show(usual, "100")
	await type("date", "2026-11-05")
	expect(submitText()).toBe("Plan ฿100.00 to Alpha on 05 Nov 2026")
	expect(flat(q('[data-note="plan"]'))).toBe(
		"Planned for 05 Nov 2026. It shows under Upcoming and counts once you mark it paid.",
	)
	await type("date", "2026-02-31")
	expect(submitText()).toBe("Enter an amount")
	expect(submitButton()?.disabled).toBe(true)
})

test("chips fill the amount; the owed chip only shows when it differs", async () => {
	await show()
	expect(flat(q('[data-chip="bill"]'))).toBe("Next bill · ฿300.00")
	expect(flat(q('[data-chip="owed"]'))).toBe("Everything owed · ฿500.00")
	const pressed = (chip: string) => q(`[data-chip="${chip}"]`)?.getAttribute("aria-pressed")
	expect([pressed("bill"), pressed("owed")]).toEqual(["false", "false"])
	await click('[data-chip="owed"]')
	expect(q<HTMLInputElement>('[name="amount"]')?.value).toBe("500")
	expect([pressed("bill"), pressed("owed")]).toEqual(["false", "true"])
	await click('[data-chip="bill"]')
	expect(q<HTMLInputElement>('[name="amount"]')?.value).toBe("300")
	expect([pressed("bill"), pressed("owed")]).toEqual(["true", "false"])

	await show({ owed: 300_00, credit: 0, nextBill: 300_00, overdue: true })
	expect(flat(q('[data-chip="bill"]'))).toBe("Overdue bill · ฿300.00")
	expect(q('[data-chip="owed"]')).toBeNull()
})

test("the extra note shows only above what is owed", async () => {
	await show(usual, "500")
	expect(q('[data-note="extra"]')).toBeNull()
	await type("amount", "650")
	expect(flat(q('[data-note="extra"]'))).toBe(
		"฿150.00 more than owed. It stays on Alpha as credit for its next purchases.",
	)
})

test("submitting sends the amount and date, and shows an error without losing typing", async () => {
	const { sent, set } = await show(usual, "120.50")
	await submit()
	expect(sent).toEqual([{ amount: 12050, date: "2026-10-31" }])
	await set({ error: "Could not save the payment." })
	expect(flat(q(".error-banner"))).toBe("Could not save the payment.")
	expect(q(".error-banner button")).toBeNull()
	expect(q<HTMLInputElement>('[name="amount"]')?.value).toBe("120.50")
})

test("a typed note goes with the payment, trimmed", async () => {
	const { sent } = await show(usual, "100")
	await type("note", "  from savings ")
	await submit()
	expect(sent).toEqual([{ amount: 100_00, date: "2026-10-31", note: "from savings" }])
})

test("a busy form waits: the button is disabled and a submit sends nothing", async () => {
	const { sent } = await show(usual, "100", { busy: true })
	expect(submitButton()?.disabled).toBe(true)
	await submit()
	expect(sent).toEqual([])
})

test("a reopened sheet starts on what was typed before", async () => {
	await show(usual, "100", { startDate: "2026-11-02", startNote: "again" })
	expect(q<HTMLInputElement>('[name="date"]')?.value).toBe("2026-11-02")
	expect(q<HTMLInputElement>('[name="note"]')?.value).toBe("again")
})

test("a new amount from the page replaces what was typed", async () => {
	const { set } = await show(usual, "100")
	await type("amount", "250")
	await set({ amount: "300" })
	expect(q<HTMLInputElement>('[name="amount"]')?.value).toBe("300")
})

// The page hands its values again after every reload, a failed save's included.
test("the same values handed again keep what was typed", async () => {
	const { set } = await show(usual, "", { startNote: "" })
	await type("amount", "250")
	await type("note", "typed")
	await set({ amount: "", startNote: "", figures: { ...usual }, error: "Could not save." })
	expect(q<HTMLInputElement>('[name="amount"]')?.value).toBe("250")
	expect(q<HTMLInputElement>('[name="note"]')?.value).toBe("typed")
})

test("submitting a zero amount sends nothing, as the disabled button says", async () => {
	const { sent } = await show(usual, "0")
	expect(submitButton()?.disabled).toBe(true)
	await submit()
	expect(sent).toEqual([])
})

test("the text follows a language switch", async () => {
	await show()
	const before = submitText()
	setLocale("th")
	await settle()
	expect(submitText()).not.toBe(before)
})

test("a figure may wrap only after the baht sign or a comma, never inside a group of digits", async () => {
	await show({ owed: 143_903_96, credit: 0, nextBill: 0, overdue: false })
	const owed = q('[data-stat="owed"] b')
	expect(flat(owed)).toBe("฿143,903.96")
	// Each <wbr> follows the sign or a comma.
	expect(owed?.innerHTML.replace(/<!--[^>]*-->/g, "")).toBe("฿<wbr>143,<wbr>903.96")
	const style = (await Bun.file("src/components/organisms/PayForm.svelte").text()).split("<style>")[1] ?? ""
	expect(style).not.toContain("overflow-wrap: anywhere")
	expect(style).toMatch(/\.stat b \{[^}]*overflow-wrap: normal/)
})

test("in the card panel: Cancel with oncancel", async () => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	let cancelled = 0
	mounted = mount(PayForm, {
		target: document.body,
		props: {
			card,
			figures: usual,
			today: "2026-10-31",
			onpay: () => {},
			oncancel: () => {
				cancelled++
			},
		},
	})
	await settle()
	const cancel = q('button[data-action="cancel"]')
	expect(cancel?.getAttribute("data-variant")).toBe("quiet")
	await click('button[data-action="cancel"]')
	expect(cancelled).toBe(1)
})

test("no Cancel without oncancel", async () => {
	await show()
	expect(q('[data-action="cancel"]')).toBeNull()
})
