import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardEditPage from "#components/organisms/CardEditPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * `/card/new` and `/card/edit?id=<id>`: the card form under the compact sub-header. Ported from
 * the legacy route's tests; where those read the form element's properties, these read what it
 * draws.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes the page's awaited reads and writes and Svelte's updates. */
const settle = async (rounds = 10) => {
	for (let i = 0; i < rounds; i++) {
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

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B"))
	await repo.saveCard(card("Z", { archived: true }))
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: record.id === "krabi" })
}

const setup = async (
	mode: "new" | "edit",
	search: string,
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en")
	await seed(repo)
	await before?.(repo)
	document.body.innerHTML = ""
	const visited: string[] = []
	mounted = mount(CardEditPage, {
		target: document.body,
		props: {
			mode,
			open: async () => ({ ok: true as const, repo }),
			search: () => search,
			navigate: (url: string) => {
				visited.push(url)
			},
		},
	})
	await settle()
	return { repo, visited }
}

/** A repository whose card writes fail, for the keep-what-was-typed path. */
class FailingRepo extends InMemoryRepository {
	fail = false
	override async saveCard(value: Card) {
		if (this.fail) throw new Error("disk full")
		return super.saveCard(value)
	}
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const form = () => $("form.card-form")

/** The page's own banner, not the form's. */
const pageBanner = () => [...document.body.querySelectorAll(".error-banner")].find((el) => !el.closest("form"))

const bannerText = () => flat(pageBanner())

const formError = () => flat(form()?.querySelector(".error-banner"))

const fill = async (name: string, value: string) => {
	const field = $<HTMLInputElement | HTMLSelectElement>(`form [name="${name}"]`)
	if (!field) throw new Error(`no field ${name}`)
	field.value = value
	field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
	await settle(1)
}

const submit = async () => {
	form()?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const fillNew = async (id: string) => {
	await fill("id", id)
	await fill("name", "New Visa")
	await fill("last4", "9999")
	await fill("closeDay", "10")
	await fill("dueOffsetDays", "20")
	await fill("limitGroupId", "g1")
}

test("/card/new: a compact sub-header to Cards, New card with no subtitle, over an empty form", async () => {
	await setup("new", "")
	expect(flat($(".sub-header__title"))).toBe("New card")
	expect($(".sub-header__detail")).toBeNull()
	expect($('.sub-header [data-action="back"]')?.getAttribute("href")).toBe("/cards")
	expect($<HTMLInputElement>('form [name="name"]')?.value).toBe("")
	expect($<HTMLInputElement>('form [name="id"]')?.disabled).toBe(false)
	const groups = [...document.body.querySelectorAll<HTMLOptionElement>('[name="limitGroupId"] option')]
	expect(groups.map((option) => option.value)).toEqual(["", "g1"])
})

test("/card/new: a save stores the card and replaces the address with its page", async () => {
	const { repo, visited } = await setup("new", "")
	await fillNew("k1.2")
	await submit()
	expect((await repo.getCard("k1.2"))?.name).toBe("New Visa")
	expect(visited).toEqual(["/card?id=k1.2"])
})

test("/card/new: Kept in offers a stored custom location, and the card is saved there", async () => {
	const { repo } = await setup("new", "", async (r) => {
		await r.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false })
	})
	await fillNew("1")
	$<HTMLButtonElement>('[data-location="chiang-mai"]')?.click()
	await settle(1)
	await submit()
	expect((await repo.getCard("1"))?.location).toBe("chiang-mai")
})

test("/card/new: an id already stored is refused, the typing kept", async () => {
	const { repo, visited } = await setup("new", "", (r) => r.saveCard(card("5")))
	await fillNew("5")
	await submit()
	expect(visited).toEqual([])
	expect((await repo.getCard("5"))?.name).toBe("5 card")
	expect(formError()).toContain('A card with id "5" already exists.')
	expect($<HTMLInputElement>('form [name="name"]')?.value).toBe("New Visa")
})

test("/card/edit: the title keeps the stored card's name while the form is typed in", async () => {
	await setup("edit", "?id=A")
	await fill("name", "Renamed")
	await settle()
	expect(flat($(".sub-header__title"))).toBe("A card · KC (1234)")
})

test("/card/edit: the stored card in the form under a sub-header to its page", async () => {
	await setup("edit", "?id=A", (r) => r.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00, owner: "RI" }))
	expect(flat($(".sub-header__title"))).toBe("A card · RI (1234)")
	expect(flat($(".sub-header__detail"))).toBe("Card id can't change")
	expect($('.sub-header [data-action="back"]')?.getAttribute("href")).toBe("/card?id=A")
	expect($<HTMLInputElement>('form [name="id"]')?.value).toBe("A")
	expect($<HTMLInputElement>('form [name="name"]')?.value).toBe("A card")
})

test("/card/edit: a save writes the changes and goes to the card's page", async () => {
	const { repo, visited } = await setup("edit", "?id=A")
	await fill("name", "Renamed")
	await submit()
	expect((await repo.getCard("A"))?.name).toBe("Renamed")
	expect(visited).toEqual(["/card?id=A"])
})

test("/card/edit: a failed save keeps the form, what was typed, and says why", async () => {
	const repo = new FailingRepo()
	const { visited } = await setup("edit", "?id=A", undefined, repo)
	await fill("name", "Renamed")
	repo.fail = true
	await submit()
	expect(visited).toEqual([])
	expect(formError()).toContain("Could not save the card.")
	expect(formError()).toContain("disk full")
	expect($<HTMLInputElement>('form [name="name"]')?.value).toBe("Renamed")
	// The reason sits in the form, not twice over in the page's banner too.
	expect(bannerText()).toBe("")
})

test("/card/edit: a failed save never puts its reason in the page banner, not even for a moment", async () => {
	const repo = new FailingRepo()
	await setup("edit", "?id=A", undefined, repo)
	const seen: string[] = []
	const observer = new MutationObserver(() => {
		const text = bannerText()
		if (text) seen.push(text)
	})
	observer.observe(document.body, { childList: true, subtree: true, characterData: true })
	await fill("name", "Renamed")
	repo.fail = true
	form()?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	for (let i = 0; i < 10; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
		const text = bannerText()
		if (text) seen.push(text)
	}
	observer.disconnect()
	expect(seen).toEqual([])
	expect(formError()).toContain("disk full")
})

test("/card/edit: no Archive or Delete on the edit page -- the card page's More menu has them", async () => {
	await setup("edit", "?id=A")
	expect($('[data-action="archive"]')).toBeNull()
	expect($('[data-action="delete-card"]')).toBeNull()
	expect($(".more-menu, [data-action='more']")).toBeNull()
})

test("/card/edit: an unknown id says so, with no form", async () => {
	await setup("edit", "?id=nope")
	expect(form()).toBeNull()
	expect(bannerText()).toContain("No card with the id nope.")
	expect($('.sub-header [data-action="back"]')?.getAttribute("href")).toBe("/cards")
})

test("/card/edit with no id says no card was chosen", async () => {
	await setup("edit", "")
	expect(form()).toBeNull()
	expect(bannerText()).toContain("No card was selected.")
})

test("re-renders its header in place on a language switch", async () => {
	await setup("new", "")
	setLocale("th")
	await settle()
	expect(flat($(".sub-header__title"))).toBe("บัตรใหม่")
	setLocale("en")
	await settle()
	expect(flat($(".sub-header__title"))).toBe("New card")
})

test("a store that won't open says why, with Reload, and nothing else", async () => {
	document.body.innerHTML = ""
	mounted = mount(CardEditPage, {
		target: document.body,
		props: {
			mode: "new",
			open: async () => ({ ok: false as const, message: () => "The store is broken." }),
			search: () => "",
			navigate: () => {},
		},
	})
	await settle()
	expect(bannerText()).toContain("The store is broken.")
	expect(pageBanner()?.querySelector("button")).not.toBeNull()
	expect(form()).toBeNull()
})
