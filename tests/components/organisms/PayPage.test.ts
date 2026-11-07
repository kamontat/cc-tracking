import type { Card, CardPayment } from "#lib/domain/types"
import type { AddressBar } from "#lib/ui/address-bar"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import PayPage from "#components/organisms/PayPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { DEFAULT_TX_FILTER, filterEntries, ledgerEntries } from "#lib/domain/transactions"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { exportBackupV3, importBackupV3, parseAnyBackup } from "#lib/storage/transfer-v3"

/**
 * The payment page's island (DD-76). Ported from the legacy route's tests; where those read a
 * child element's properties, these read what the child draws, and drive the real picker, form
 * and sheet.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

/** Flushes the page's awaited reads and writes and Svelte's updates. */
const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

/** Lets a sheet's exit play out; `afterExit` waits on the animation or a timer. */
const exit = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	await settle()
}

const CLOCK = () => new Date("2026-10-31T03:00:00Z")

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

/** An address bar that records what the page did to it, and can play Back and Forward. */
const fakeBar = (start: string) => {
	const entries = [start]
	let at = 0
	const calls: string[] = []
	let pop = () => {}
	const bar: AddressBar = {
		search: () => {
			const entry = entries[at] ?? ""
			const q = entry.indexOf("?")
			return q === -1 ? "" : entry.slice(q)
		},
		push: (url) => {
			calls.push(`push ${url}`)
			entries.splice(at + 1, entries.length, url)
			at++
		},
		replace: (url) => {
			calls.push(`replace ${url}`)
			entries[at] = url
		},
		onPop: (listener) => {
			pop = listener
			return () => {
				pop = () => {}
			}
		},
		length: () => entries.length,
		back: () => {
			calls.push("back")
			at = Math.max(0, at - 1)
			pop()
		},
	}
	const forward = () => {
		at = Math.min(entries.length - 1, at + 1)
		pop()
	}
	return { bar, calls, entries, forward, now: () => entries[at] }
}

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `${id} card`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

/** Group g1 of ฿100,000 holding cards A and B, and an archived Z; only Krabi takes purchases. */
const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B"))
	await repo.saveCard(card("Z", { archived: true }))
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: record.id === "krabi" })
}

const withStatement = async (repo: Repository) => {
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-09-10", amount: 10_000_00, note: "fuel" })
}

const setup = async (
	start: string,
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	await seed(repo)
	await before?.(repo)
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const address = fakeBar(start)
	const visited: string[] = []
	let ids = 0
	mounted = mount(PayPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			clock: CLOCK,
			address: address.bar,
			navigate: (url: string) => visited.push(url),
			newId: () => `pay${++ids}`,
		},
	})
	await settle()
	return { repo, address, visited }
}

const sheet = () => $("dialog [name=amount]")?.closest("dialog") ?? null

const pickerRows = () => [...document.querySelectorAll<HTMLButtonElement>("button[data-card]")]

const pick = async (index: number) => {
	pickerRows()[index]?.click()
	await settle()
}

const fill = async (name: string, value: string) => {
	const input = $<HTMLInputElement>(`dialog [name="${name}"]`)
	if (!input) throw new Error(`no ${name}`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const submitEvent = () => $("dialog form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

const submit = async () => {
	submitEvent()
	await settle()
}

const amountValue = () => $<HTMLInputElement>('dialog [name="amount"]')?.value

const submitText = () => text($('dialog button[type="submit"]'))

const close = async () => {
	$<HTMLButtonElement>("dialog [data-action=close]")?.click()
	await exit()
}

const pageBanner = () => [...document.querySelectorAll(".error-banner")].find((b) => !b.closest("dialog")) ?? null

test("/pay is the card picker under a sub-header, with no sheet", async () => {
	await setup("/pay")
	expect(text($(".sub-header h1"))).toBe("Make a payment")
	expect(pickerRows().map((r) => r.dataset["card"])).toEqual(["A", "B"])
	expect(sheet()).toBeNull()
})

test("the picker's tiles get each group's room, so a tile's rail shows its used share", async () => {
	await setup("/pay", withStatement)
	const [first, second] = pickerRows()
	expect(first?.classList.contains("tile")).toBe(true)
	expect(first?.querySelector(".rail")?.getAttribute("aria-label")).toBe("10% of the limit used")
	expect(text(first?.querySelector(".facts"))).toMatch(/^Bill closed 25 Sep 2026 · ฿10,000.00 left$/)
	// B has no bill: its last line says when the open statement closes and is due.
	expect(text(second?.querySelector(".facts"))).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
})

test("/pay?card= opens the sheet over the picker, the amount prefilled from the address", async () => {
	await setup("/pay?card=A&amount=12050", withStatement)
	expect(pickerRows()).toHaveLength(2)
	expect(text(sheet()?.querySelector("h2"))).toBe("Make a payment")
	expect(amountValue()).toBe("120.50")
	expect(submitText()).toBe("Record ฿120.50 to A card")
})

test("without an amount the sheet starts at the next bill, or empty with none", async () => {
	await setup("/pay?card=A", withStatement)
	expect(amountValue()).toBe("10000")
	await setup("/pay?card=B", withStatement)
	expect(amountValue()).toBe("")
	expect(submitText()).toBe("Enter an amount")
})

test("picking a card pushes its address and opens its sheet; Back closes it", async () => {
	const { address } = await setup("/pay", withStatement)
	await pick(0)
	expect(address.calls).toEqual(["push /pay?card=A"])
	expect(submitText()).toContain("A card")
	// The browser's Back pops the entry the pick pushed, and the sheet goes with it.
	address.bar.back()
	await settle()
	expect(sheet()).toBeNull()
	expect(pickerRows()).toHaveLength(2)
})

test("Close, Escape and Change take the card out of the address and leave the picker", async () => {
	const { address } = await setup("/pay?card=A&amount=500", withStatement)
	await close()
	expect(sheet()).toBeNull()
	expect(address.calls).toEqual(["replace /pay"])
	expect(address.now()).toBe("/pay")

	await pick(1)
	sheet()?.dispatchEvent(new Event("cancel", { cancelable: true }))
	await exit()
	expect(sheet()).toBeNull()
	expect(address.now()).toBe("/pay")

	await pick(0)
	$<HTMLButtonElement>('dialog [data-action="change"]')?.click()
	await exit()
	expect(sheet()).toBeNull()
	// The sheets after the first came from picks, so closing them steps back over the pick.
	expect(address.calls.slice(-1)).toEqual(["back"])
	expect(address.now()).toBe("/pay")
})

test("closing a sheet the page pushed steps back, so the picker is in history once", async () => {
	const { address } = await setup("/pay", withStatement)
	await pick(0)
	await close()
	expect(address.calls).toEqual(["push /pay?card=A", "back"])
	expect(sheet()).toBeNull()
	expect(address.now()).toBe("/pay")
	// Forward onto the pushed entry reopens it, and closing it steps back again.
	address.forward()
	await settle()
	expect(submitText()).toContain("A card")
	await close()
	expect(address.calls).toEqual(["push /pay?card=A", "back", "back"])
	expect(address.entries).toEqual(["/pay", "/pay?card=A"])
	expect(address.now()).toBe("/pay")
	expect(sheet()).toBeNull()
})

test("closing a sheet opened from a link at ?card= rewrites the address", async () => {
	const { address } = await setup("/pay?card=A", withStatement)
	await close()
	expect(address.calls).toEqual(["replace /pay"])
	expect(address.entries).toEqual(["/pay"])
	expect(sheet()).toBeNull()
})

test("an unknown card says so above the picker and opens no sheet", async () => {
	await setup("/pay?card=nope")
	expect(text($("[data-missing]"))).toBe("That card isn't here any more.")
	expect(sheet()).toBeNull()
	expect(pickerRows()).toHaveLength(2)
})

test("the back control steps back when there is a page behind, else goes to Transactions", async () => {
	const { address, visited } = await setup("/pay")
	$<HTMLButtonElement>('.sub-header [data-action="back"]')?.click()
	await settle()
	expect(visited).toEqual(["/transactions"])
	await pick(0)
	await close()
	address.bar.push("/pay?x=1")
	$<HTMLButtonElement>('.sub-header [data-action="back"]')?.click()
	await settle()
	expect(address.calls.at(-1)).toBe("back")
})

test("a paid payment is stored with its note, the settled statement's dates kept, then Transactions replaces the page", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement)
	await fill("amount", "10000")
	await fill("note", "  From savings  ")
	expect(submitText()).toBe("Record ฿10,000.00 to A card")
	await submit()
	expect((await repo.listStatementDates("A")).map((d) => d.period)).toEqual(["2026-09"])
	const stored = await repo.listCardPayments("A")
	expect(stored).toHaveLength(1)
	expect(stored[0]).toMatchObject({
		cardId: "A",
		amount: 10_000_00,
		date: "2026-10-31",
		status: "paid",
		note: "From savings",
	} satisfies Partial<CardPayment>)
	expect(visited).toEqual(["/transactions"])
})

test("a blank note stores no note", async () => {
	const { repo } = await setup("/pay?card=A", withStatement)
	await fill("amount", "100")
	await fill("note", "   ")
	await submit()
	const [payment] = await repo.listCardPayments("A")
	expect(payment && "note" in payment).toBe(false)
})

test("a later date stores a planned payment and freezes nothing", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement)
	await fill("amount", "100")
	await fill("date", "2026-11-05")
	expect(submitText()).toBe("Plan ฿100.00 to A card on 05 Nov 2026")
	await submit()
	expect(await repo.listStatementDates("A")).toEqual([])
	const [payment] = await repo.listCardPayments("A")
	expect(payment).toMatchObject({ status: "planned", date: "2026-11-05" })
	expect(visited).toEqual(["/transactions"])
})

test("two quick submits save one payment", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement)
	await fill("amount", "100")
	submitEvent()
	submitEvent()
	await settle()
	expect(await repo.listCardPayments("A")).toHaveLength(1)
	expect(visited).toEqual(["/transactions"])
})

test("a failed save keeps the sheet and the typing, says why, and frees the button", async () => {
	const { repo, visited } = await setup("/pay?card=A", async (r) => {
		r.saveCardPayment = () => Promise.reject(new Error("disk full"))
	})
	await fill("amount", "100")
	await fill("note", "From savings")
	await submit()
	expect(sheet()).not.toBeNull()
	expect(visited).toEqual([])
	expect(amountValue()).toBe("100")
	expect($<HTMLInputElement>('dialog [name="note"]')?.value).toBe("From savings")
	expect(text($("dialog .error-banner"))).toContain("Could not save the payment.")
	expect($<HTMLButtonElement>('dialog button[type="submit"]')?.disabled).toBe(false)
	expect(text(pageBanner())).toBe("")
	expect(await repo.listCardPayments("A")).toHaveLength(0)
})

test("a read failure shows on the page", async () => {
	await setup("/pay", async (r) => {
		r.listCards = () => Promise.reject(new Error("boom"))
	})
	expect(text(pageBanner())).toContain("Could not read your cards.")
})

test("a payment's note goes from the sheet to the ledger's search and through a backup", async () => {
	const { repo } = await setup("/pay?card=A", withStatement)
	await fill("amount", "100")
	await fill("note", "From savings")
	await submit()

	const search = async (from: Repository) =>
		filterEntries(
			ledgerEntries(await from.listCards(), [], await from.listCardPayments("A")),
			{ ...DEFAULT_TX_FILTER, q: "savings" },
			"2026-10-31",
		).map((entry) => (entry.kind === "payment" ? entry.payment.note : undefined))
	expect(await search(repo)).toEqual(["From savings"])

	const restored = new InMemoryRepository()
	await importBackupV3(restored, parseAnyBackup(JSON.stringify(await exportBackupV3(repo, new Date()))))
	expect(await search(restored)).toEqual(["From savings"])
})

test("while a save is in flight the sheet is held, so Escape cannot slide it away", async () => {
	let release!: () => void
	const { address } = await setup("/pay?card=A", async (r) => {
		const save = r.saveCardPayment.bind(r)
		r.saveCardPayment = (payment) =>
			new Promise((resolve) => {
				release = () => resolve(save(payment))
			})
	})
	await fill("amount", "100")
	submitEvent()
	await settle(5)
	sheet()?.dispatchEvent(new Event("cancel", { cancelable: true }))
	await exit()
	expect(sheet()).not.toBeNull()
	expect(address.bar.search()).toContain("card=A")
	release()
	await settle()
})

/** A repository whose payment save waits for `settle(ok)`: true saves, false fails. */
const heldSave = () => {
	const held: { settle: (ok: boolean) => void } = { settle: () => {} }
	const before = async (repo: Repository) => {
		const save = repo.saveCardPayment.bind(repo)
		repo.saveCardPayment = (payment) =>
			new Promise((resolve, reject) => {
				held.settle = (ok) => (ok ? resolve(save(payment)) : reject(new Error("disk full")))
			})
	}
	return { held, before }
}

test("Back during a save that then fails says why on the page, and Try again reopens the sheet with the typing", async () => {
	const { held, before } = heldSave()
	const { address, visited } = await setup("/pay", async (repo) => {
		await withStatement(repo)
		await before(repo)
	})
	await pick(0)
	await fill("amount", "100")
	await fill("note", "From savings")
	submitEvent()
	await settle(5)
	// The browser's Back while the save is held: the address drops the card.
	address.bar.back()
	await settle()
	expect(address.now()).toBe("/pay")
	held.settle(false)
	await settle()
	expect(visited).toEqual([])
	expect(sheet()).toBeNull()
	const shown = pageBanner()
	expect(text(shown)).toContain("Could not save the payment.")
	expect(text(shown)).toContain("disk full")
	const retry = shown?.querySelector<HTMLButtonElement>("button")
	expect(text(retry)).toBe("Try again")
	retry?.click()
	await settle()
	expect(address.calls.slice(-1)).toEqual(["push /pay?card=A"])
	expect(submitText()).toContain("A card")
	expect(amountValue()).toBe("100")
	expect($<HTMLInputElement>('dialog [name="note"]')?.value).toBe("From savings")
	expect(text(pageBanner())).toBe("")
	// Closing the reopened sheet steps back over the entry Try again pushed.
	await close()
	expect(address.calls.slice(-1)).toEqual(["back"])
	expect(address.now()).toBe("/pay")
})

test("Back during a save that then succeeds leaves for Transactions once, with no extra history step", async () => {
	const { held, before } = heldSave()
	const { address, visited } = await setup("/pay", async (repo) => {
		await withStatement(repo)
		await before(repo)
	})
	await pick(0)
	await fill("amount", "100")
	submitEvent()
	await settle(5)
	address.bar.back()
	await settle()
	held.settle(true)
	await settle()
	expect(visited).toEqual(["/transactions"])
	expect(address.calls).toEqual(["push /pay?card=A", "back"])
})

test("a store that won't open shows why, with Reload, and no picker", async () => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(PayPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: false as const, message: () => "Storage is off." }),
			address: fakeBar("/pay").bar,
		},
	})
	await settle()
	expect(text(pageBanner())).toContain("Storage is off.")
	expect(pickerRows()).toEqual([])
})
