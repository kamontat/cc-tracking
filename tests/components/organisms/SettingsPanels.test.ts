import type { Card } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, describe, expect, test } from "vitest"

import SettingsPanels from "#components/organisms/SettingsPanels.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { LocalStorageRepository } from "#lib/storage/local"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { SEED_KEY } from "#lib/storage/seed-locations"
import { exportBackupV4, parseAnyBackup } from "#lib/storage/transfer-v4"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The Settings page's island (RD-19): Display, Locations and Backup in the main column, Reset
 * and About beside them, each a heading over one `.set` panel. Ported from the legacy route's
 * tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const settle = async () => {
	for (let i = 0; i < 20; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const slot = (html: string) => createRawSnippet(() => ({ render: () => html }))

/** The address the last `show` started on, with every move the page made. */
let history = fakeHistory("/settings")

const show = async (repo: Repository = new InMemoryRepository(), storage?: Storage, start = "/settings") => {
	document.body.innerHTML = ""
	history = fakeHistory(start)
	mounted = mount(SettingsPanels, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			address: history.bar,
			display: slot('<div class="set-row" data-row="language"></div>'),
			about: slot('<dl data-slot="about"></dl>'),
			...(storage ? { storage } : {}),
		},
	})
	await settle()
	return document.body
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const banner = (root: HTMLElement) => flat(root.querySelector(".error-banner p"))

const importStatus = (root: HTMLElement) => flat(root.querySelector(".import-status"))

const resetStatus = (root: HTMLElement) => flat(root.querySelector(".reset-status"))

const row = (root: HTMLElement, name: string): HTMLElement => {
	const found = root.querySelector<HTMLElement>(`.set-row[data-row="${name}"]`)
	if (!found) throw new Error(`no ${name} row`)
	return found
}

const press = async (el: HTMLElement) => {
	el.click()
	await settle()
}

/** Swaps in a stub `navigator.clipboard` for the length of `run`. */
const withClipboard = async (
	clipboard: Partial<Pick<Clipboard, "readText" | "writeText">>,
	run: () => Promise<void>,
) => {
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard")
	Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
	try {
		await run()
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original)
		else delete (navigator as { clipboard?: unknown }).clipboard
	}
}

const sampleCard: Card = {
	id: "k1",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
	limitGroupId: "pool",
}

/** A repository holding the three starting location records, as startup seeds them. */
const seeded = async <R extends Repository>(repo: R): Promise<R> => {
	for (const record of defaultLocations(DEFAULT_SETTINGS)) await repo.saveLocation(record)
	return repo
}

/** A card, its group, two purchases and a setting: something for a reset to count and delete. */
const populated = async <R extends Repository>(repo: R): Promise<R> => {
	await seeded(repo)
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 })
	await repo.saveCard({ ...sampleCard, limitGroupId: "pool" })
	await repo.savePurchase({ id: "p1", cardId: "k1", date: "2026-09-05", amount: 100, note: "" })
	await repo.savePurchase({ id: "p2", cardId: "k1", date: "2026-09-06", amount: 100, note: "" })
	await repo.saveSettings({ purchaseLocations: ["bangkok"] })
	return repo
}

/** Two cards, a group, three purchases, a payment and a list: each kind counted apart. */
const fullyPopulated = async <R extends Repository>(repo: R): Promise<R> => {
	await populated(repo)
	await repo.saveCard({ ...sampleCard, id: "s1", name: "SCB", last4: "1111" })
	await repo.savePurchase({ id: "p3", cardId: "s1", date: "2026-09-07", amount: 100, note: "" })
	await repo.saveCardPayment({ id: "pay1", cardId: "k1", date: "2026-09-20", amount: 100, status: "paid" })
	await repo.savePurchaseList({ id: "list1", date: "2026-09-08", status: "draft", lines: [] })
	return repo
}

const sectionsIn = (root: HTMLElement, column: string) =>
	[...root.querySelectorAll(`.settings-grid__${column} > section.set-section`)].map((section) =>
		section.getAttribute("data-section"),
	)

test("lays the sections out in two columns: display, locations and owners, and backup, then your data, reset and about", async () => {
	const root = await show()

	expect(sectionsIn(root, "main")).toEqual(["display", "locations", "backup"])
	// Locations and owners are one list: a row each, in the same panel.
	expect(
		[...root.querySelectorAll('[data-section="locations"] .set > .set-row')].map((r) => r.getAttribute("data-row")),
	).toEqual(["locations", "owners"])
	expect(sectionsIn(root, "side")).toEqual(["data", "reset", "about"])
	for (const section of root.querySelectorAll("section.set-section")) {
		expect(section.querySelector(":scope > h2")).not.toBeNull()
		expect(section.querySelector(":scope > .set")).not.toBeNull()
	}
	expect(root.querySelector('[data-section="display"] .set [data-row="language"]')).not.toBeNull()
	expect(root.querySelector('[data-section="about"] .set [data-slot="about"]')).not.toBeNull()
})

test("names each section in the chosen language", async () => {
	const root = await show()

	const headings = () => [...root.querySelectorAll("section.set-section > h2")].map((h) => h.textContent?.trim())
	expect(headings()).toEqual(["Display", "Locations and owners", "Backup", "Your data", "Reset", "About"])
	setLocale("th")
	flushSync()
	expect(headings()).not.toContain("Backup")
})

test("the locations row links to the locations panel and sums them up", async () => {
	const root = await show(await seeded(new InMemoryRepository()))

	const locations = row(root, "locations")
	expect(locations.tagName).toBe("A")
	expect(locations.getAttribute("href")).toBe("/settings?panel=locations")
	expect(locations.textContent).toContain("Manage locations")
	expect(flat(locations)).toContain("3 places · Krabi takes purchases")
})

test("the locations row names every place that takes purchases, A to Z, or says none do", async () => {
	const repo = await seeded(new InMemoryRepository())
	await repo.saveLocation({ id: "bangkok", name: "Bangkok", takesPurchases: true })
	expect(flat(row(await show(repo), "locations"))).toContain("3 places · Bangkok, Krabi take purchases")

	await repo.saveLocation({ id: "bangkok", name: "Bangkok", takesPurchases: false })
	await repo.saveLocation({ id: "krabi", name: "Krabi", takesPurchases: false })
	await repo.deleteLocation("phichit")
	unmount(mounted as ReturnType<typeof mount>)
	mounted = undefined
	expect(flat(row(await show(repo), "locations"))).toContain("2 places · none take purchases")
})

test("the locations summary follows a language switch", async () => {
	const root = await show(await seeded(new InMemoryRepository()))
	setLocale("th")
	flushSync()
	expect(flat(row(root, "locations"))).not.toContain("places")
})

test("a store that won't open shows why, with Reload, and nothing it would have read", async () => {
	document.body.innerHTML = ""
	mounted = mount(SettingsPanels, {
		target: document.body,
		props: { open: async () => ({ ok: false as const, message: () => "Storage is off." }) },
	})
	await settle()

	expect(banner(document.body)).toBe("Storage is off.")
	expect(flat(row(document.body, "locations"))).toContain("0 places")
})

test("clicking Download does not raise an error", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(sampleCard)
	const root = await show(repo)

	await press(row(root, "download"))

	expect(banner(root)).toBe("")
})

test("the backup rows: download names the file it saves, copy and restore say what they do", async () => {
	await withClipboard({ writeText: async () => {} }, async () => {
		const root = await show()

		expect(
			[...root.querySelectorAll('[data-section="backup"] .set > .set-row')].map((found) =>
				found.getAttribute("data-row"),
			),
		).toEqual(["download", "copy", "restore"])
		const today = new Date().toISOString().slice(0, 10)
		expect(row(root, "download").textContent).toContain("Download a copy")
		expect(row(root, "download").textContent).toContain(`cc-tracking-${today}.json`)
		expect(row(root, "copy").textContent).toContain("To paste into another browser")
		expect(row(root, "restore").textContent).toContain("Restore a copy")
	})
})

test("the backup section reminds that the data lives only in this browser", async () => {
	const root = await show()

	expect(flat(root.querySelector('[data-section="backup"] > .set-note'))).toBe(
		"Your data lives only in this browser. Download a copy to keep it safe.",
	)
})

const copyLabel = (root: HTMLElement) => flat(row(root, "copy").querySelector(".set-row__action"))

test("copy to clipboard writes the backup as compact JSON, and says so", async () => {
	const repo = await populated(new InMemoryRepository())
	let written = ""
	await withClipboard(
		{
			writeText: async (text) => {
				written = text
			},
		},
		async () => {
			const root = await show(repo)
			await press(row(root, "copy"))

			expect(banner(root)).toBe("")
			const copied = parseAnyBackup(written)
			expect(copied.cards).toEqual(await repo.listCards())
			expect(copied.purchases).toHaveLength(2)
			// Compact, not pretty-printed: pasted text is carried around, not read.
			expect(written).toBe(JSON.stringify(JSON.parse(written)))
			expect(copyLabel(root)).toBe("Copied")
		},
	)
})

test("a clipboard the browser will not write leaves a message", async () => {
	await withClipboard({ writeText: () => Promise.reject(new Error("denied")) }, async () => {
		const root = await show()
		await press(row(root, "copy"))

		expect(banner(root)).toContain("Could not copy the text.")
		expect(copyLabel(root)).toBe("Copy")
	})
})

test("copy to clipboard is not offered where the browser cannot write to it", async () => {
	await withClipboard({}, async () => {
		expect((await show()).querySelector('[data-row="copy"]')).toBeNull()
	})
})

const click = async (root: HTMLElement, action: string) => {
	if (action === "reset") return press(row(root, "delete-all"))
	const button = root.querySelector<HTMLButtonElement>(`[data-section="reset"] [data-action="${action}"]`)
	if (!button) throw new Error(`no ${action} button`)
	return press(button)
}

const resetText = (root: HTMLElement) => flat(root.querySelector('[data-section="reset"]'))

test("the reset rows: clean old data, then delete all data", async () => {
	const root = await show()

	expect(
		[...root.querySelectorAll('[data-section="reset"] .set > .set-row')].map((found) => found.getAttribute("data-row")),
	).toEqual(["purge", "delete-all"])
	expect(row(root, "purge").textContent).toContain("Clean old data")
	expect(row(root, "purge").textContent).toContain(
		"Free space by removing old purchases, payments and lists on paid statements",
	)
	expect(row(root, "delete-all").textContent).toContain("Delete all data")
})

test("asks before resetting, counting each kind of record it would delete", async () => {
	const repo = await fullyPopulated(new InMemoryRepository())
	const root = await show(repo)

	expect(root.querySelector('[data-section="reset"] [data-action="delete-everything"]')).toBeNull()
	await click(root, "reset")

	expect(resetText(root)).toContain(
		"This deletes 2 cards, 3 purchases, 1 payment, 1 limit group, 1 list. Language and theme stay. It can't be undone.",
	)
	expect(root.querySelector('[data-row="delete-all"]')).toBeNull()
	expect(await repo.listCards()).toHaveLength(2)
})

test("backing out of a reset deletes nothing", async () => {
	const repo = await populated(new InMemoryRepository())
	const root = await show(repo)

	await click(root, "reset")
	await click(root, "keep-data")

	expect(root.querySelector('[data-row="delete-all"]')).not.toBeNull()
	expect(await repo.listCards()).toHaveLength(1)
	expect(await repo.listPurchases("k1")).toHaveLength(2)
})

test("confirming a reset deletes every record and setting, and says so", async () => {
	const repo = await populated(new InMemoryRepository())
	const root = await show(repo)

	await click(root, "reset")
	await click(root, "delete-everything")

	expect(await repo.listCards()).toEqual([])
	expect(await repo.listPurchases("k1")).toEqual([])
	expect(await repo.listLimitGroups()).toEqual([])
	expect(await repo.getSettings()).toEqual({ purchaseLocations: ["krabi"] })
	expect(resetStatus(root)).toBe("All data deleted.")
	// The starting places come back, so Home and the Locations page are not empty.
	expect(await repo.listLocations()).toEqual([
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "krabi", name: "Krabi", takesPurchases: true },
		{ id: "phichit", name: "Phichit", takesPurchases: false },
	])
	expect(root.querySelector('[data-row="delete-all"]')).not.toBeNull()
	expect(flat(row(root, "locations"))).toContain("3 places")
	// And the starting owners, so a new limit group has someone to belong to.
	expect((await repo.listOwners()).map((owner) => owner.id)).toEqual(["KC", "NT", "RI"])
	expect(flat(row(root, "owners"))).toContain("KC, NT, RI")
})

test("the Owners row links to the owners panel and names every owner A to Z", async () => {
	const repo = await populated(new InMemoryRepository())
	await repo.saveOwner({ id: "pim", name: "Pim" })
	await repo.saveOwner({ id: "KC", name: "Kamontat" })
	const root = await show(repo)
	const owners = row(root, "owners") as HTMLAnchorElement
	expect(owners.getAttribute("href")).toBe("/settings?panel=owners")
	expect(flat(owners)).toContain("Manage owners")
	expect(flat(owners)).toContain("Kamontat, Pim")
})

test("a reset keeps the reader's language", async () => {
	setLocale("th")
	const repo = await populated(new LocalStorageRepository(localStorage))
	const root = await show(repo)

	await click(root, "reset")
	await click(root, "delete-everything")

	expect(await repo.listCards()).toEqual([])
	expect(localStorage.getItem("cc:lang")).toBe("th")
	expect((await repo.listLocations()).map((record) => record.id)).toEqual(["bangkok", "krabi", "phichit"])
})

test("a failed reset says so and keeps the data", async () => {
	class RejectingClear extends InMemoryRepository {
		override clearAll(): Promise<void> {
			return Promise.reject(new Error("disk is locked"))
		}
	}
	const repo = await populated(new RejectingClear())
	const root = await show(repo)

	await click(root, "reset")
	await click(root, "delete-everything")

	expect(banner(root)).toContain("disk is locked")
	expect(resetStatus(root)).toBe("")
	expect(await repo.listCards()).toHaveLength(1)
})

test("the reset question follows a language switch", async () => {
	const root = await show(await fullyPopulated(new InMemoryRepository()))

	await click(root, "reset")
	setLocale("th")
	flushSync()

	expect(resetText(root)).not.toContain("This deletes")
	expect(resetText(root)).toContain(
		"จะลบบัตร 2 ใบ, รายการซื้อ 3 รายการ, การชำระ 1 รายการ, กลุ่มวงเงิน 1 กลุ่ม, ใบรายการซื้อ 1 ใบ ภาษาและธีมยังคงเดิม ย้อนกลับไม่ได้",
	)
	expect(root.querySelector('[data-section="reset"] [data-action="delete-everything"]')).not.toBeNull()
})

test("Delete all uses the storage the page is given", async () => {
	const storage = memoryStorage()
	storage.setItem(SEED_KEY, "done")
	const root = await show(await populated(new InMemoryRepository()), storage)

	await click(root, "reset")
	await click(root, "delete-everything")

	// The marker was cleared and set again in the page's storage, never in the shared one.
	expect(storage.getItem(SEED_KEY)).toBe("done")
	expect(globalThis.localStorage.getItem(SEED_KEY)).toBeNull()
})

/** The sheet showing now, by the step or body only it draws; null when none is open. */
const restoreSheet = (root: HTMLElement) => root.querySelector("dialog [data-step]")?.closest("dialog") ?? null

const purgeSheet = (root: HTMLElement) => root.querySelector("dialog [data-age]")?.closest("dialog") ?? null

/** Lets a sheet's exit play out; `afterExit` waits on the animation or a timer. */
const exit = async () => {
	await new Promise((resolve) => setTimeout(resolve, 400))
	await settle()
}

/** Presses `action` in the open restore sheet, opening it from the Restore row first. */
const inRestore = async (root: HTMLElement, action: string) => {
	if (!restoreSheet(root)) await press(row(root, "restore"))
	const button = restoreSheet(root)?.querySelector<HTMLElement>(`[data-action="${action}"]`)
	if (!button) throw new Error(`no ${action} in the restore sheet`)
	await press(button)
}

/** Opens the restore sheet and picks `text` as its file. */
const chooseFile = async (root: HTMLElement, text: string, name = "backup.json") => {
	if (!restoreSheet(root)) await press(row(root, "restore"))
	const input = restoreSheet(root)?.querySelector<HTMLInputElement>('[data-action="choose-file"]')
	if (!input) throw new Error("no file input")
	Object.defineProperty(input, "files", {
		configurable: true,
		value: [new File([text], name, { type: "application/json" })],
	})
	input.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
	await exit()
}

const oneCardBackup = async () => {
	const source = await seeded(new InMemoryRepository())
	await source.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 })
	await source.saveCard(sampleCard)
	await source.savePurchase({ id: "p1", cardId: "k1", date: "2026-09-05", amount: 10_000, note: "fuel" })
	return JSON.stringify(await exportBackupV4(source, new Date()))
}

test("the Restore row opens the restore sheet, and closing it forgets its steps", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const root = await show()
		expect(restoreSheet(root)).toBeNull()
		expect(row(root, "restore").getAttribute("aria-expanded")).toBe("false")

		await inRestore(root, "paste-by-hand")
		expect(row(root, "restore").getAttribute("aria-expanded")).toBe("true")
		const area = restoreSheet(root)?.querySelector("textarea") as HTMLTextAreaElement
		area.value = "half typed"
		area.dispatchEvent(new Event("input", { bubbles: true }))
		await inRestore(root, "close")
		await exit()
		expect(restoreSheet(root)).toBeNull()

		await press(row(root, "restore"))
		expect(restoreSheet(root)?.querySelector("[data-step]")?.getAttribute("data-step")).toBe("start")
		expect(restoreSheet(root)?.querySelector("textarea")).toBeNull()
	})
})

test("a restored file is named and counted under the panel, in the reader's language", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const root = await show()
		expect(row(root, "locations").textContent).toContain("0 places")

		await chooseFile(root, await oneCardBackup(), "cc-tracking-2026-09-21.json")

		expect(restoreSheet(root)).toBeNull()
		expect(importStatus(root)).toBe(
			"Restored cc-tracking-2026-09-21.json: 1 card, 1 purchase, 0 payments, 1 limit group, 0 lists.",
		)
		expect(root.querySelector(".import-status")?.getAttribute("role")).toBe("status")
		// The page reads the locations again: the copy brought its records.
		expect(row(root, "locations").textContent).toContain("3 places")

		const english = importStatus(root)
		setLocale("th")
		flushSync()
		expect(importStatus(root)).toContain("cc-tracking-2026-09-21.json")
		expect(importStatus(root)).not.toBe(english)
	})
})

test("restoring from the clipboard over data here takes Restore, Paste from clipboard, Merge", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated(new InMemoryRepository())
		const root = await show(repo)

		await inRestore(root, "paste-clipboard")
		await inRestore(root, "merge-import")
		await exit()

		expect(restoreSheet(root)).toBeNull()
		expect(banner(root)).toBe("")
		expect(importStatus(root)).toBe("Restored pasted text: 1 card, 1 purchase, 0 payments, 1 limit group, 0 lists.")
		// Merged: the purchase this browser held and the copy's own both stay.
		expect(await repo.listPurchases("k1")).toHaveLength(2)
		expect(await repo.listLimitGroups()).toHaveLength(1)
	})
})

test.each([1, 2])("a version %i file is refused as unsupported, and nothing is written", async (version) => {
	const repo = new InMemoryRepository()
	const root = await show(repo)
	await chooseFile(
		root,
		JSON.stringify({
			version,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank account", limit: 1 }],
			cards: [sampleCard],
			purchases: [{ id: "p1", cardId: "k1", date: "2026-09-05", amount: 10_000, note: "fuel" }],
			payments: [
				{ cardId: "k1", period: "2026-09", paidAt: "2026-10-01", closeDate: "2026-09-18", dueDate: "2026-10-03" },
			],
			settings: { purchaseLocations: ["bangkok"] },
		}),
		"old.json",
	)

	expect(flat(restoreSheet(root)?.querySelector('[role="alert"]'))).toContain(
		`This backup is version ${version}, but this app reads versions 3–4.`,
	)
	expect(await repo.listCards()).toEqual([])
	expect(await repo.listCardPayments("k1")).toEqual([])
})

test("a restore clears an earlier reset message", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const root = await show(await populated(new InMemoryRepository()))
		await click(root, "reset")
		await click(root, "delete-everything")
		expect(resetStatus(root)).toBe("All data deleted.")

		await chooseFile(root, await oneCardBackup())
		expect(resetStatus(root)).toBe("")
	})
})

/**
 * Purchases a and b (2025-01) sit on a statement a payment settles, so a year's purge takes
 * them; c's statement is unpaid, so it stays.
 */
const purgeable = async () => {
	const repo = await seeded(new InMemoryRepository())
	await repo.saveCard(sampleCard)
	for (const [id, date] of [
		["a", "2025-01-05"],
		["b", "2025-01-06"],
		["c", "2025-03-05"],
	] as const)
		await repo.savePurchase({ id, cardId: "k1", date, amount: id === "c" ? 50 : 100, note: "" })
	await repo.saveCardPayment({ id: "pay1", cardId: "k1", date: "2025-02-10", amount: 200, status: "paid" })
	return repo
}

const dataPanel = (root: HTMLElement) => root.querySelector<HTMLElement>(".detail-panel")

/** Opens the data panel from its row in the Your data section. */
const openData = async (root: HTMLElement) => {
	if (!dataPanel(root)) await press(row(root, "data"))
}

/** A data row's label, the detail under it, and its figure, joined by `|`. */
const dataRow = (root: HTMLElement, name: string) => {
	const found = dataPanel(root)?.querySelector(`[data-row="${name}"]`)
	return [".set-row__label", ".set-row__sub", ".set-row__value"]
		.map((part) => flat(found?.querySelector(part)))
		.join(" | ")
}

test("Your data is one row, with the gist, that opens the data panel beside Settings (?panel=data)", async () => {
	const root = await show(await fullyPopulated(new InMemoryRepository()))

	const rows = [...root.querySelectorAll('[data-section="data"] .set > .set-row')]
	expect(rows.map((found) => found.getAttribute("data-row"))).toEqual(["data"])
	const link = row(root, "data")
	expect(link.getAttribute("href")).toBe("/settings?panel=data")
	expect(flat(link.querySelector(".set-row__sub"))).toMatch(/^2 cards · 3 purchases · \d/)
	expect(link.hasAttribute("aria-current")).toBe(false)
	expect(dataPanel(root)).toBeNull()

	await press(link)

	expect(history.calls).toEqual(["push /settings?panel=data"])
	expect(link.getAttribute("aria-current")).toBe("true")
	expect(flat(dataPanel(root)?.querySelector("h2"))).toBe("Your data")
	expect(flat(dataPanel(root)?.querySelector(".detail-panel__detail"))).toBe("In this browser only")
	expect(root.querySelector(".panel-layout")?.hasAttribute("data-panel")).toBe(true)

	// Another row swaps its panel in place.
	await press(row(root, "locations"))
	expect(history.calls).toEqual(["push /settings?panel=data", "replace /settings?panel=locations"])
	expect(link.hasAttribute("aria-current")).toBe(false)
})

test("× steps back over the data panel, Back closes it, and a pasted address opens it", async () => {
	const root = await show()

	await openData(root)
	await press(dataPanel(root)?.querySelector<HTMLElement>('[data-action="close-panel"]') as HTMLElement)
	expect(history.now()).toBe("/settings")
	expect(dataPanel(root)).toBeNull()

	await press(row(root, "data"))
	history.userBack()
	await settle()
	expect(dataPanel(root)).toBeNull()

	const pasted = await show(new InMemoryRepository(), undefined, "/settings?panel=data")
	expect(flat(dataPanel(pasted)?.querySelector("h2"))).toBe("Your data")
})

test("the data panel sums up what this browser holds, a row per kind", async () => {
	const root = await show(await fullyPopulated(new InMemoryRepository()))
	await openData(root)

	expect(
		[...(dataPanel(root)?.querySelectorAll(".set > .set-row") ?? [])].map((found) => found.getAttribute("data-row")),
	).toEqual(["cards", "limit-groups", "purchases", "payments", "lists", "locations", "owners", "storage"])
	expect(dataRow(root, "cards")).toBe("Cards | 2 active · 0 archived | 2")
	expect(dataRow(root, "purchases")).toBe("Purchases | ฿3.00 · 05 Sep 2026 to 07 Sep 2026 | 3")
	expect(dataRow(root, "lists")).toBe("Purchase lists | 1 draft · 0 waiting · 0 saved | 1")
	expect(dataRow(root, "locations")).toBe("Locations |  | 3")
	// The panel reads; only its head has buttons.
	expect(dataPanel(root)?.querySelector(".detail-panel__body button, .detail-panel__body a")).toBeNull()
})

test("the storage row counts this browser's own keys", async () => {
	const storage = memoryStorage()
	storage.setItem("cc:card:k1", "x".repeat(1020))
	const root = await show(new InMemoryRepository(), storage)
	await openData(root)

	expect(dataRow(root, "storage")).toBe("Storage used |  | 2.0 KB")
	expect(flat(dataPanel(root)?.querySelector(".detail-panel__detail"))).toBe("In this browser only")
})

test("the data panel follows a language switch", async () => {
	const root = await show(await fullyPopulated(new InMemoryRepository()))
	await openData(root)

	setLocale("th")
	flushSync()
	expect(dataRow(root, "cards")).not.toContain("Cards")
	expect(flat(row(root, "data"))).not.toContain("cards")
})

test("the data panel counts again after a reset", async () => {
	const root = await show(await fullyPopulated(new InMemoryRepository()))
	await openData(root)

	await click(root, "reset")
	await click(root, "delete-everything")

	expect(dataRow(root, "cards")).toBe("Cards | None yet | 0")
	expect(dataRow(root, "owners")).toBe("Owners |  | 3")
	expect(flat(row(root, "data").querySelector(".set-row__sub"))).toMatch(/^0 cards · 0 purchases/)
})

test("the Clean old data row opens the purge sheet, and closing takes it away", async () => {
	const root = await show()
	expect(purgeSheet(root)).toBeNull()
	expect(row(root, "purge").getAttribute("aria-expanded")).toBe("false")

	await press(row(root, "purge"))
	expect(purgeSheet(root)).not.toBeNull()
	expect(row(root, "purge").getAttribute("aria-expanded")).toBe("true")

	await press(purgeSheet(root)?.querySelector<HTMLElement>('[data-action="close"]') as HTMLElement)
	await exit()
	expect(purgeSheet(root)).toBeNull()
})

test("a purge reports what it deleted in the Reset panel, in the reader's language", async () => {
	const repo = await purgeable()
	const root = await show(repo)
	await press(row(root, "purge"))
	await press(purgeSheet(root)?.querySelector<HTMLElement>('[data-action="ask"]') as HTMLElement)
	await press(purgeSheet(root)?.querySelector<HTMLElement>('[data-action="yes"]') as HTMLElement)
	await exit()

	expect(purgeSheet(root)).toBeNull()
	expect(resetStatus(root)).toBe("Deleted 2 purchases older than 1 year.")
	expect((await repo.listPurchases("k1")).map((purchase) => purchase.id)).toEqual(["c"])
	// The data panel counts again, too.
	await openData(root)
	expect(dataRow(root, "purchases")).toMatch(/\| 1$/)
	setLocale("th")
	flushSync()
	expect(resetStatus(root)).toContain("2")
	expect(resetStatus(root)).not.toContain("Deleted")
})

describe("the locations and owners panels (RD-17, RD-30)", () => {
	const panelTitle = (root: HTMLElement) => flat(root.querySelector(".detail-panel h2"))

	test("a row opens its panel beside Settings, pushing ?panel=, and marks the row", async () => {
		const repo = await seeded(new InMemoryRepository())
		await repo.saveOwner({ id: "KC", name: "KC" })
		const root = await show(repo)
		expect(root.querySelector(".detail-panel")).toBeNull()
		expect(root.querySelector(".panel-layout")?.hasAttribute("data-panel")).toBe(false)
		// The container Settings' columns measure, so an open panel can stack them.
		expect(root.querySelector(".panel-layout")?.classList.contains("settings-layout")).toBe(true)

		await press(row(root, "locations"))
		expect(history.calls).toEqual(["push /settings?panel=locations"])
		expect(panelTitle(root)).toBe("Locations")
		expect(root.querySelectorAll(".detail-panel .record-row[data-location]")).toHaveLength(3)
		expect(root.querySelector(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
		expect(row(root, "locations").getAttribute("aria-current")).toBe("true")
		expect(row(root, "owners").hasAttribute("aria-current")).toBe(false)

		// The other row swaps the panel in place.
		await press(row(root, "owners"))
		expect(history.calls).toEqual(["push /settings?panel=locations", "replace /settings?panel=owners"])
		expect(panelTitle(root)).toBe("Owners")
		expect(root.querySelector(".detail-panel .record-row[data-owner]")).not.toBeNull()
	})

	test("× steps back over the panel, and Back closes it", async () => {
		const root = await show(await seeded(new InMemoryRepository()))
		await press(row(root, "owners"))
		await press(root.querySelector<HTMLElement>('[data-action="close-panel"]') as HTMLElement)
		expect(history.now()).toBe("/settings")
		expect(root.querySelector(".detail-panel")).toBeNull()

		await press(row(root, "locations"))
		history.userBack()
		await settle()
		expect(root.querySelector(".detail-panel")).toBeNull()
	})

	test("a pasted address opens its panel; an unknown panel opens nothing and drops the key", async () => {
		const root = await show(await seeded(new InMemoryRepository()), undefined, "/settings?panel=owners")
		expect(panelTitle(root)).toBe("Owners")

		const other = await show(await seeded(new InMemoryRepository()), undefined, "/settings?panel=cards")
		expect(other.querySelector(".detail-panel")).toBeNull()
		expect(history.now()).toBe("/settings")
	})

	test("a change in the panel updates its row's summary at once", async () => {
		const repo = await seeded(new InMemoryRepository())
		const root = await show(repo, undefined, "/settings?panel=locations")
		const bangkok = root.querySelector<HTMLInputElement>(
			'.record-row[data-location="bangkok"] [data-action="takes-purchases"]',
		)
		bangkok?.click()
		await settle()
		expect(flat(row(root, "locations"))).toContain("Bangkok, Krabi take purchases")
	})

	test("a reset reads the open panel again", async () => {
		const repo = await populated(new InMemoryRepository())
		await repo.saveOwner({ id: "pim", name: "Pim" })
		const root = await show(repo, undefined, "/settings?panel=owners")
		expect(root.querySelector('.detail-panel .record-row[data-owner="pim"]')).not.toBeNull()

		await click(root, "reset")
		await click(root, "delete-everything")
		expect(root.querySelector('.detail-panel .record-row[data-owner="pim"]')).toBeNull()
		expect(root.querySelectorAll(".detail-panel .record-row[data-owner]")).toHaveLength(3)
	})
})

test("About ends in a Force refresh row that fetches the newest version and reloads", async () => {
	let refreshes = 0
	document.body.innerHTML = ""
	history = fakeHistory("/settings")
	mounted = mount(SettingsPanels, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo: new InMemoryRepository() }),
			address: history.bar,
			about: slot('<dl data-slot="about"></dl>'),
			refresh: () => {
				refreshes += 1
			},
		},
	})
	await settle()
	const root = document.body
	const panelRows = [...root.querySelectorAll('[data-section="about"] .set > *')]
	expect(panelRows.at(-1)?.getAttribute("data-row")).toBe("refresh")
	expect(flat(row(root, "refresh"))).toContain("Force refresh")
	expect(flat(row(root, "refresh"))).toContain("Get the newest version and reload. Your data stays.")
	expect(row(root, "refresh").tagName).toBe("BUTTON")
	await press(row(root, "refresh"))
	expect(refreshes).toBe(1)
	// The reload takes a moment: the row says it is working and takes no second press.
	expect(row(root, "refresh").getAttribute("aria-busy")).toBe("true")
	expect((row(root, "refresh") as HTMLButtonElement).disabled).toBe(true)
	expect(flat(row(root, "refresh").querySelector(".set-row__action"))).toBe("Refreshing…")
	await press(row(root, "refresh"))
	expect(refreshes).toBe(1)
	setLocale("th")
	await settle()
	expect(flat(row(root, "refresh"))).not.toContain("Force refresh")
})
