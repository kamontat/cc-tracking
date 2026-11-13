import type { Card, LocationRecord } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import LocationsEditor from "#components/organisms/LocationsEditor.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * The Locations page's island (RD-17): one block per location, A to Z by shown name, with its
 * card count, Rename, Delete while no card is kept there and it is not the last, and Takes
 * purchases; a warning when nowhere takes purchases; and Add a location. Ported from the legacy
 * route's tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
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

/** Bangkok, Phichit and Krabi, Krabi alone taking purchases and holding cards A, B and archived Z. */
const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	for (const id of ["A", "B"]) await repo.saveCard(card(id))
	await repo.saveCard(card("Z", { archived: true }))
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: record.id === "krabi" })
}

const show = async (repo: Repository) => {
	document.body.innerHTML = ""
	mounted = mount(LocationsEditor, {
		target: document.body,
		props: { open: async () => ({ ok: true as const, repo }) },
	})
	await settle()
	return document.body
}

const setup = async (before?: (repo: Repository) => Promise<void>, locale: "en" | "th" = "en") => {
	setLocale(locale)
	const repo = new InMemoryRepository()
	await seed(repo)
	await before?.(repo)
	return { repo, root: await show(repo) }
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".record-row")]

const row = (root: HTMLElement, id: string) => {
	const found = root.querySelector<HTMLElement>(`.record-row[data-location="${id}"]`)
	if (!found) throw new Error(`no row ${id}`)
	return found
}

const action = <T extends HTMLElement = HTMLButtonElement>(scope: ParentNode, name: string) =>
	scope.querySelector<T>(`[data-action="${name}"]`)

const click = async (scope: ParentNode, name: string) => {
	const target = action(scope, name)
	if (!target) throw new Error(`no ${name}`)
	target.click()
	await settle()
}

const type = (field: HTMLInputElement | null, value: string) => {
	if (!field) throw new Error("no field")
	field.value = value
	field.dispatchEvent(new Event("input", { bubbles: true }))
}

const field = (root: HTMLElement, id: string) => row(root, id).querySelector<HTMLInputElement>(".record-row__field")

const rename = async (root: HTMLElement, id: string, name: string) => {
	await click(row(root, id), "rename")
	type(field(root, id), name)
	await click(row(root, id), "save-name")
}

const add = async (root: HTMLElement, name: string) => {
	const form = action<HTMLFormElement>(root, "add-location")
	type(form?.querySelector("input") ?? null, name)
	form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const stored = async (repo: Repository, id: string) => (await repo.listLocations()).find((record) => record.id === id)

test("one row per location, A to Z by name, each with its card count, archived included", async () => {
	const { root } = await setup()
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["bangkok", "krabi", "phichit"])
	expect(flat(row(root, "krabi"))).toContain("Krabi")
	expect(flat(row(root, "krabi"))).toContain("3 cards")
	expect(flat(row(root, "bangkok"))).toContain("0 cards")
})

test("Delete shows only on a location with no cards", async () => {
	const { root } = await setup()
	expect(action(row(root, "krabi"), "delete")).toBeNull()
	expect(action(row(root, "bangkok"), "delete")).not.toBeNull()
	expect(action(row(root, "phichit"), "delete")).not.toBeNull()
})

test("the last location has no Delete, even with no cards", async () => {
	const { root } = await setup(async (repo) => {
		for (const id of ["A", "B", "Z"]) await repo.deleteCard(id)
		await repo.deleteLocation("bangkok")
		await repo.deleteLocation("phichit")
	})
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["krabi"])
	expect(action(row(root, "krabi"), "delete")).toBeNull()
})

test("Delete swaps in place for Delete and Cancel on the row's line, focus following; Cancel keeps it, Delete removes it", async () => {
	const { repo, root } = await setup()
	await click(row(root, "bangkok"), "delete")
	const line = row(root, "bangkok").querySelector(".record-row__line")
	// The name and its count stay; the row's buttons are now the asking pair, and nothing else.
	expect(flat(line?.querySelector(".record-row__text"))).toContain("Bangkok")
	expect([...(line?.querySelectorAll("button") ?? [])].map((b) => b.getAttribute("data-action"))).toEqual([
		"confirm-delete",
		"cancel-delete",
	])
	expect(root.querySelector(".set-ask")).toBeNull()
	const confirm = action(row(root, "bangkok"), "confirm-delete")
	expect(confirm?.getAttribute("data-variant")).toBe("danger")
	expect(confirm?.getAttribute("aria-label")).toBe("Delete Bangkok?")
	expect(document.activeElement).toBe(confirm)
	expect(await stored(repo, "bangkok")).toBeDefined()

	await click(row(root, "bangkok"), "cancel-delete")
	expect(action(row(root, "bangkok"), "confirm-delete")).toBeNull()
	expect(document.activeElement).toBe(action(row(root, "bangkok"), "delete"))
	expect(await stored(repo, "bangkok")).toBeDefined()

	await click(row(root, "bangkok"), "delete")
	await click(row(root, "bangkok"), "confirm-delete")
	expect(await stored(repo, "bangkok")).toBeUndefined()
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["krabi", "phichit"])
})

test("the tick is labelled Takes purchases alone, with no hint after it", async () => {
	const { root } = await setup()
	const label = row(root, "krabi").querySelector(".record-row__takes")
	expect(flat(label)).toBe("Takes purchases")
	expect(label?.querySelector("small")).toBeNull()
})

test("ticking Takes purchases saves it; with none ticked the warning shows", async () => {
	const { repo, root } = await setup()
	const box = (id: string) => action<HTMLInputElement>(row(root, id), "takes-purchases")
	expect(box("krabi")?.checked).toBe(true)
	expect(box("bangkok")?.checked).toBe(false)
	expect(root.querySelector(".record-warning")).toBeNull()

	const krabi = box("krabi")
	if (!krabi) throw new Error("no box")
	krabi.checked = false
	krabi.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
	expect((await stored(repo, "krabi"))?.takesPurchases).toBe(false)
	expect(flat(root.querySelector(".record-warning"))).toBe(
		"No place takes purchases, so Ready to use on Home is empty.",
	)

	const bangkok = box("bangkok")
	if (!bangkok) throw new Error("no box")
	bangkok.checked = true
	bangkok.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
	expect((await stored(repo, "bangkok"))?.takesPurchases).toBe(true)
	expect(root.querySelector(".record-warning")).toBeNull()
})

test("rename keeps the id and saves the new name", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "  Ao Nang ")
	expect(await stored(repo, "krabi")).toEqual({ id: "krabi", name: "Ao Nang", takesPurchases: true })
	expect(field(root, "krabi")).toBeNull()
	expect(flat(row(root, "krabi"))).toContain("Ao Nang")
	// Re-sorted by the new name: Ao Nang comes first.
	expect(rows(root)[0]?.getAttribute("data-location")).toBe("krabi")
})

test("Cancel leaves the name as it was", async () => {
	const { repo, root } = await setup()
	await click(row(root, "krabi"), "rename")
	type(field(root, "krabi"), "Elsewhere")
	await click(row(root, "krabi"), "cancel-name")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(field(root, "krabi")).toBeNull()
})

test("rename to nothing or to another location's name is refused, with a field message", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "   ")
	expect(flat(row(root, "krabi"))).toContain("Give the location a name.")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")

	type(field(root, "krabi"), " bangKOK ")
	await click(row(root, "krabi"), "save-name")
	expect(flat(row(root, "krabi"))).toContain("There is already a location called bangKOK.")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(field(root, "krabi")?.getAttribute("aria-invalid")).toBe("true")
})

test("Thai: saving a default's name unchanged keeps its stored English name", async () => {
	const { repo, root } = await setup(undefined, "th")
	await rename(root, "krabi", "กระบี่")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(field(root, "krabi")).toBeNull()
})

test("renaming to its own name in another case is allowed", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "KRABI")
	expect((await stored(repo, "krabi"))?.name).toBe("KRABI")
})

test("add Chiang Mai: id chiang-mai, not taking purchases", async () => {
	const { repo, root } = await setup()
	await add(root, " Chiang Mai ")
	expect(await stored(repo, "chiang-mai")).toEqual({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false })
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["bangkok", "chiang-mai", "krabi", "phichit"])
	expect(action<HTMLFormElement>(root, "add-location")?.querySelector("input")?.value).toBe("")
})

test("add refuses an empty name and a name already used", async () => {
	const { repo, root } = await setup()
	await add(root, "  ")
	expect(flat(action(root, "add-location"))).toContain("Give the location a name.")
	await add(root, "krabi")
	expect(flat(action(root, "add-location"))).toContain("There is already a location called krabi.")
	expect((await repo.listLocations()).length).toBe(3)
})

test("Thai: เชียงใหม่ gets id location, the same name again is refused, another Thai name gets location-2", async () => {
	const { repo, root } = await setup(undefined, "th")
	await add(root, "เชียงใหม่")
	expect(await stored(repo, "location")).toEqual({ id: "location", name: "เชียงใหม่", takesPurchases: false })
	await add(root, " เชียงใหม่ ")
	expect((await repo.listLocations()).length).toBe(4)
	expect(action(root, "add-location")?.querySelector(".record-error")).not.toBeNull()

	await add(root, "ลำปาง")
	expect((await stored(repo, "location-2"))?.name).toBe("ลำปาง")
})

test("Thai: a default's Thai name counts as taken", async () => {
	const { repo, root } = await setup(undefined, "th")
	await add(root, "กระบี่")
	expect((await repo.listLocations()).length).toBe(3)
})

test("a default shows in the reader's language; a renamed one shows its stored name in both", async () => {
	const before = async (repo: Repository) => {
		const records: LocationRecord[] = await repo.listLocations()
		const bangkok = records.find((r) => r.id === "bangkok")
		if (bangkok) await repo.saveLocation({ ...bangkok, name: "BKK" })
	}
	const en = await setup(before, "en")
	expect(flat(row(en.root, "bangkok"))).toContain("BKK")
	if (mounted) unmount(mounted)
	const th = await setup(before, "th")
	expect(flat(row(th.root, "bangkok"))).toContain("BKK")
	expect(flat(row(th.root, "krabi"))).toContain("กระบี่")
})

test("English: a default's Thai name counts as taken too", async () => {
	const { repo, root } = await setup()
	await add(root, "กระบี่")
	expect((await repo.listLocations()).length).toBe(3)
	expect(flat(action(root, "add-location"))).toContain("There is already a location called กระบี่.")
})

test("a language switch re-draws the rows in the new language", async () => {
	const { root } = await setup()
	expect(flat(row(root, "krabi"))).toContain("Krabi")
	setLocale("th")
	await settle()
	expect(flat(row(root, "krabi"))).toContain("กระบี่")
	expect(flat(action(root, "add-location"))).toContain("เพิ่มสถานที่")
})

/** A repository whose location writes fail while `fail` is set. */
class FailingRepo extends InMemoryRepository {
	fail = false
	override async saveLocation(value: LocationRecord) {
		if (this.fail) throw new Error("disk full")
		return super.saveLocation(value)
	}
	override async deleteLocation(id: string) {
		if (this.fail) throw new Error("disk full")
		return super.deleteLocation(id)
	}
}

test("a failed add keeps the typed name; a failed rename keeps the field; a failed delete keeps the question", async () => {
	setLocale("en")
	const repo = new FailingRepo()
	await seed(repo)
	repo.fail = true
	const root = await show(repo)

	await add(root, "Chiang Mai")
	expect(action<HTMLFormElement>(root, "add-location")?.querySelector("input")?.value).toBe("Chiang Mai")
	expect(flat(root.querySelector(".error-banner"))).toContain("Could not save the location.")

	await rename(root, "krabi", "Ao Nang")
	expect(field(root, "krabi")?.value).toBe("Ao Nang")

	await click(row(root, "krabi"), "cancel-name")
	await click(row(root, "bangkok"), "delete")
	await click(row(root, "bangkok"), "confirm-delete")
	expect(action(row(root, "bangkok"), "confirm-delete")).not.toBeNull()
})

test("a store the browser refuses shows why, with Reload, and no rows", async () => {
	setLocale("en")
	document.body.innerHTML = ""
	mounted = mount(LocationsEditor, {
		target: document.body,
		props: {
			open: async () => ({ ok: false as const, message: () => "This browser is not letting the page store data." }),
		},
	})
	await settle()
	expect(flat(document.querySelector(".error-banner p"))).toBe("This browser is not letting the page store data.")
	expect(flat(document.querySelector(".error-banner button"))).toBe("Reload")
	expect(document.querySelector(".record-row")).toBeNull()
})
