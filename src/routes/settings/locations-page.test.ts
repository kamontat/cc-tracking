import type { LocationRecord } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { bannerText, flatText, mount, seed, settle } from "../list/test-support"
import { renderLocationsPage } from "./locations-page"

/** Seeds Bangkok, Phichit and Krabi (Krabi ticked, with cards A, B and archived Z), runs
 * `before`, then renders the page in `locale`. */
const setup = async (before?: (repo: Repository) => Promise<void>, locale: "en" | "th" = "en") => {
	setLocale(locale)
	const repo = new InMemoryRepository()
	await seed(repo)
	await before?.(repo)
	const root = mount()
	renderLocationsPage(repo, root)
	await settle(5)
	return { repo, root }
}

afterEach(() => setLocale("en"))

const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".location-row")]

const row = (root: HTMLElement, id: string) => {
	const found = root.querySelector<HTMLElement>(`.location-row[data-location="${id}"]`)
	if (!found) throw new Error(`no row ${id}`)
	return found
}

const action = <T extends HTMLElement = HTMLButtonElement>(scope: ParentNode, name: string) =>
	scope.querySelector<T>(`[data-action="${name}"]`)

const click = async (scope: ParentNode, name: string) => {
	const target = action(scope, name)
	if (!target) throw new Error(`no ${name}`)
	target.click()
	await settle(5)
}

const type = (field: HTMLInputElement | null, value: string) => {
	if (!field) throw new Error("no field")
	field.value = value
	field.dispatchEvent(new Event("input"))
}

/** Opens *Rename* on `id`, types `name`, presses *Save*. */
const rename = async (root: HTMLElement, id: string, name: string) => {
	await click(row(root, id), "rename")
	type(row(root, id).querySelector<HTMLInputElement>(".location-row__field"), name)
	await click(row(root, id), "save-name")
}

/** Types `name` into *Add a location* and submits it. */
const add = async (root: HTMLElement, name: string) => {
	const form = action<HTMLFormElement>(root, "add-location")
	type(form?.querySelector("input") ?? null, name)
	form?.dispatchEvent(new Event("submit", { cancelable: true }))
	await settle(5)
}

const stored = async (repo: Repository, id: string) => (await repo.listLocations()).find((record) => record.id === id)

test("a compact sub-header, Locations, back to Settings", async () => {
	const { root } = await setup()
	expect(flatText(root.querySelector(".sub-header__title"))).toBe("Locations")
	expect(root.querySelector<HTMLAnchorElement>('[data-action="back"]')?.getAttribute("href")).toBe("/settings")
})

test("one row per location, A to Z by name, each with its card count, archived included", async () => {
	const { root } = await setup()
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["bangkok", "krabi", "phichit"])
	expect(flatText(row(root, "krabi"))).toContain("Krabi")
	expect(flatText(row(root, "krabi"))).toContain("3 cards")
	expect(flatText(row(root, "bangkok"))).toContain("0 cards")
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

test("Delete asks once inline; Cancel keeps it, Delete removes it", async () => {
	const { repo, root } = await setup()
	await click(row(root, "bangkok"), "delete")
	expect(flatText(row(root, "bangkok"))).toContain("Delete Bangkok?")
	expect(await stored(repo, "bangkok")).toBeDefined()

	await click(row(root, "bangkok"), "cancel-delete")
	expect(action(row(root, "bangkok"), "confirm-delete")).toBeNull()
	expect(await stored(repo, "bangkok")).toBeDefined()

	await click(row(root, "bangkok"), "delete")
	await click(row(root, "bangkok"), "confirm-delete")
	expect(await stored(repo, "bangkok")).toBeUndefined()
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["krabi", "phichit"])
})

test("ticking Takes purchases saves it; with none ticked the warning shows", async () => {
	const { repo, root } = await setup()
	const box = (id: string) => action<HTMLInputElement>(row(root, id), "takes-purchases")
	expect(box("krabi")?.checked).toBe(true)
	expect(box("bangkok")?.checked).toBe(false)
	expect(root.querySelector(".location-warning")).toBeNull()

	const krabi = box("krabi")
	if (!krabi) throw new Error("no box")
	krabi.checked = false
	krabi.dispatchEvent(new Event("change"))
	await settle(5)
	expect((await stored(repo, "krabi"))?.takesPurchases).toBe(false)
	expect(flatText(root.querySelector(".location-warning"))).toBe(
		"No place takes purchases, so Ready to use on Home is empty.",
	)

	const bangkok = box("bangkok")
	if (!bangkok) throw new Error("no box")
	bangkok.checked = true
	bangkok.dispatchEvent(new Event("change"))
	await settle(5)
	expect((await stored(repo, "bangkok"))?.takesPurchases).toBe(true)
	expect(root.querySelector(".location-warning")).toBeNull()
})

test("rename keeps the id and saves the new name", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "  Ao Nang ")
	expect(await stored(repo, "krabi")).toEqual({
		id: "krabi",
		name: "Ao Nang",
		takesPurchases: true,
	})
	expect(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field")).toBeNull()
	expect(flatText(row(root, "krabi"))).toContain("Ao Nang")
	// Re-sorted by the new name: Ao Nang comes first.
	expect(rows(root)[0]?.getAttribute("data-location")).toBe("krabi")
})

test("Cancel leaves the name as it was", async () => {
	const { repo, root } = await setup()
	await click(row(root, "krabi"), "rename")
	type(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field"), "Elsewhere")
	await click(row(root, "krabi"), "cancel-name")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field")).toBeNull()
})

test("rename to nothing or to another location's name is refused, with a field message", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "   ")
	expect(flatText(row(root, "krabi"))).toContain("Give the location a name.")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")

	type(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field"), " bangKOK ")
	await click(row(root, "krabi"), "save-name")
	expect(flatText(row(root, "krabi"))).toContain("There is already a location called bangKOK.")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field")?.getAttribute("aria-invalid")).toBe(
		"true",
	)
})

test("Thai: saving a default's name unchanged keeps its stored English name", async () => {
	const { repo, root } = await setup(undefined, "th")
	await rename(root, "krabi", "กระบี่")
	expect((await stored(repo, "krabi"))?.name).toBe("Krabi")
	expect(row(root, "krabi").querySelector(".location-row__field")).toBeNull()
})

test("renaming to its own name in another case is allowed", async () => {
	const { repo, root } = await setup()
	await rename(root, "krabi", "KRABI")
	expect((await stored(repo, "krabi"))?.name).toBe("KRABI")
})

test("add Chiang Mai: id chiang-mai, not taking purchases", async () => {
	const { repo, root } = await setup()
	await add(root, " Chiang Mai ")
	expect(await stored(repo, "chiang-mai")).toEqual({
		id: "chiang-mai",
		name: "Chiang Mai",
		takesPurchases: false,
	})
	expect(rows(root).map((r) => r.getAttribute("data-location"))).toEqual(["bangkok", "chiang-mai", "krabi", "phichit"])
	expect(action<HTMLFormElement>(root, "add-location")?.querySelector("input")?.value).toBe("")
})

test("add refuses an empty name and a name already used", async () => {
	const { repo, root } = await setup()
	await add(root, "  ")
	expect(flatText(action(root, "add-location"))).toContain("Give the location a name.")
	await add(root, "krabi")
	expect(flatText(action(root, "add-location"))).toContain("There is already a location called krabi.")
	expect((await repo.listLocations()).length).toBe(3)
})

test("Thai: เชียงใหม่ gets id location, the same name again is refused, another Thai name gets location-2", async () => {
	const { repo, root } = await setup(undefined, "th")
	await add(root, "เชียงใหม่")
	expect(await stored(repo, "location")).toEqual({
		id: "location",
		name: "เชียงใหม่",
		takesPurchases: false,
	})
	await add(root, " เชียงใหม่ ")
	expect((await repo.listLocations()).length).toBe(4)
	expect(action(root, "add-location")?.querySelector(".location-error")).not.toBeNull()

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
	expect(flatText(row(en.root, "bangkok"))).toContain("BKK")
	const th = await setup(before, "th")
	expect(flatText(row(th.root, "bangkok"))).toContain("BKK")
	expect(flatText(row(th.root, "krabi"))).toContain("กระบี่")
	setLocale("en")
})

test("English: a default's Thai name counts as taken too", async () => {
	const { repo, root } = await setup()
	await add(root, "กระบี่")
	expect((await repo.listLocations()).length).toBe(3)
	expect(flatText(action(root, "add-location"))).toContain("There is already a location called กระบี่.")
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

const setupFailing = async () => {
	setLocale("en")
	const repo = new FailingRepo()
	await seed(repo)
	repo.fail = true
	const root = mount()
	renderLocationsPage(repo, root)
	await settle(5)
	return { repo, root }
}

test("a failed add keeps the typed name; a failed rename keeps the field; a failed delete keeps the question", async () => {
	const { root } = await setupFailing()
	await add(root, "Chiang Mai")
	expect(action<HTMLFormElement>(root, "add-location")?.querySelector("input")?.value).toBe("Chiang Mai")
	expect(bannerText(root)).toContain("Could not save the location.")

	await rename(root, "krabi", "Ao Nang")
	expect(row(root, "krabi").querySelector<HTMLInputElement>(".location-row__field")?.value).toBe("Ao Nang")

	await click(row(root, "krabi"), "cancel-name")
	await click(row(root, "bangkok"), "delete")
	await click(row(root, "bangkok"), "confirm-delete")
	expect(action(row(root, "bangkok"), "confirm-delete")).not.toBeNull()
})

test("a place's line lays out as a row: the reset makes every div a column otherwise", async () => {
	const css = (await Bun.file(`${import.meta.dirname}/../../styles/app.css`).text()).replace(/\/\*[\s\S]*?\*\//g, "")
	const rule = /\.location-row__line,\s*\.location-add__control\s*\{([^}]*)\}/.exec(css)?.[1]
	expect(rule).toMatch(/display:\s*flex/)
	expect(rule).toMatch(/flex-direction:\s*row/)
})
