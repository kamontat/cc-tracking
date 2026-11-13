import type { Card, LimitGroup } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwnersEditor from "#components/organisms/OwnersEditor.svelte"
import { DEFAULT_OWNERS } from "#lib/domain/owner"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * The Owners page's island (RD-30): one block per owner, A to Z by name, with how many limit
 * groups and supplementary cards it holds, Rename, Delete while nothing names it and it is not
 * the last, and Add an owner.
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

const group = (id: string, owner: string): LimitGroup => ({ id, name: `${id} pool`, limit: 100_000_00, owner })

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

/** KC, NT and RI; KC holds two groups, NT holds an archived supplementary card on KC's account. */
const seed = async (repo: Repository) => {
	for (const owner of DEFAULT_OWNERS) await repo.saveOwner({ ...owner })
	await repo.saveLimitGroup(group("g1", "KC"))
	await repo.saveLimitGroup(group("g2", "KC"))
	await repo.saveCard(card("1", { supplementary: true, owner: "NT", archived: true }))
	// A stale owner on a card that is not supplementary holds nothing.
	await repo.saveCard(card("2", { owner: "RI" }))
}

const show = async (repo: Repository) => {
	document.body.innerHTML = ""
	mounted = mount(OwnersEditor, {
		target: document.body,
		props: { open: async () => ({ ok: true as const, repo }) },
	})
	await settle()
	return document.body
}

const setup = async (before?: (repo: Repository) => Promise<void>) => {
	const repo = new InMemoryRepository()
	await seed(repo)
	await before?.(repo)
	return { repo, root: await show(repo) }
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const ids = (root: HTMLElement) =>
	[...root.querySelectorAll<HTMLElement>(".record-row")].map((r) => r.getAttribute("data-owner"))

const row = (root: HTMLElement, id: string) => {
	const found = root.querySelector<HTMLElement>(`.record-row[data-owner="${id}"]`)
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
	const form = action<HTMLFormElement>(root, "add-owner")
	type(form?.querySelector("input") ?? null, name)
	form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const stored = async (repo: Repository, id: string) => (await repo.listOwners()).find((record) => record.id === id)

test("one row per owner, A to Z by name, each with what it holds", async () => {
	const { root } = await setup()
	expect(ids(root)).toEqual(["KC", "NT", "RI"])
	expect(flat(row(root, "KC"))).toContain("2 limit groups")
	expect(flat(row(root, "NT"))).toContain("0 limit groups · 1 supplementary card")
	expect(flat(row(root, "RI"))).toContain("0 limit groups")
	expect(flat(row(root, "RI"))).not.toContain("supplementary")
})

test("Delete shows only on an owner nothing names", async () => {
	const { root } = await setup()
	expect(action(row(root, "KC"), "delete")).toBeNull()
	expect(action(row(root, "NT"), "delete")).toBeNull()
	expect(action(row(root, "RI"), "delete")).not.toBeNull()
})

test("the last owner has no Delete", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "KC", name: "KC" })
	const root = await show(repo)
	expect(ids(root)).toEqual(["KC"])
	expect(action(row(root, "KC"), "delete")).toBeNull()
})

test("Delete asks once inline; Cancel keeps it, Delete removes it", async () => {
	const { repo, root } = await setup()
	await click(row(root, "RI"), "delete")
	expect(flat(row(root, "RI"))).toContain("Delete RI?")
	await click(row(root, "RI"), "cancel-delete")
	expect(await stored(repo, "RI")).toBeDefined()

	await click(row(root, "RI"), "delete")
	await click(row(root, "RI"), "confirm-delete")
	expect(await stored(repo, "RI")).toBeUndefined()
	expect(ids(root)).toEqual(["KC", "NT"])
})

test("rename keeps the id, saves the new name and re-sorts", async () => {
	const { repo, root } = await setup()
	await rename(root, "KC", "Tan")
	expect(await stored(repo, "KC")).toEqual({ id: "KC", name: "Tan" })
	expect(ids(root)).toEqual(["NT", "RI", "KC"])
	expect(field(root, "KC")).toBeNull()
})

test("Cancel leaves the name as it was", async () => {
	const { repo, root } = await setup()
	await click(row(root, "KC"), "rename")
	type(field(root, "KC"), "Tan")
	await click(row(root, "KC"), "cancel-name")
	expect(await stored(repo, "KC")).toEqual({ id: "KC", name: "KC" })
	expect(flat(row(root, "KC"))).toContain("KC")
})

test("rename to nothing or to another owner's name is refused, with a field message", async () => {
	const { repo, root } = await setup()
	await rename(root, "KC", "  ")
	expect(flat(row(root, "KC"))).toContain("Give the owner a name.")
	expect(field(root, "KC")?.getAttribute("aria-invalid")).toBe("true")
	type(field(root, "KC"), "nt")
	await click(row(root, "KC"), "save-name")
	expect(flat(row(root, "KC"))).toContain("There is already an owner called nt.")
	expect(await stored(repo, "KC")).toEqual({ id: "KC", name: "KC" })
	// Its own name in another case is fine.
	type(field(root, "KC"), "kc")
	await click(row(root, "KC"), "save-name")
	expect(await stored(repo, "KC")).toEqual({ id: "KC", name: "kc" })
})

test("add Pim: id pim, listed A to Z; an empty or taken name is refused", async () => {
	const { repo, root } = await setup()
	await add(root, "Pim")
	expect(await stored(repo, "pim")).toEqual({ id: "pim", name: "Pim" })
	expect(ids(root)).toEqual(["KC", "NT", "pim", "RI"])
	expect(action<HTMLFormElement>(root, "add-owner")?.querySelector("input")?.value).toBe("")

	await add(root, "")
	expect(flat(action(root, "add-owner"))).toContain("Give the owner a name.")
	await add(root, " ri ")
	expect(flat(action(root, "add-owner"))).toContain("There is already an owner called ri.")
	expect(await repo.listOwners()).toHaveLength(4)
})

test("Thai: the page reads in Thai, and a Thai-only name gets id owner", async () => {
	setLocale("th")
	const { repo, root } = await setup()
	expect(flat(row(root, "KC"))).toContain("กลุ่มวงเงิน")
	await add(root, "พิม")
	expect(await stored(repo, "owner")).toEqual({ id: "owner", name: "พิม" })
})

class FailingRepo extends InMemoryRepository {
	fail = false
	override async saveOwner(...args: Parameters<InMemoryRepository["saveOwner"]>) {
		if (this.fail) throw new Error("disk full")
		return super.saveOwner(...args)
	}
	override async deleteOwner(id: string) {
		if (this.fail) throw new Error("disk full")
		return super.deleteOwner(id)
	}
}

test("a failed add keeps the typed name; a failed rename keeps the field; a failed delete keeps the question", async () => {
	const repo = new FailingRepo()
	await seed(repo)
	repo.fail = true
	const root = await show(repo)

	await add(root, "Pim")
	expect(action<HTMLFormElement>(root, "add-owner")?.querySelector("input")?.value).toBe("Pim")
	expect(flat(root.querySelector(".error-banner"))).toContain("Could not save the owner.")

	await rename(root, "KC", "Tan")
	expect(field(root, "KC")?.value).toBe("Tan")

	await click(row(root, "KC"), "cancel-name")
	await click(row(root, "RI"), "delete")
	await click(row(root, "RI"), "confirm-delete")
	expect(action(row(root, "RI"), "confirm-delete")).not.toBeNull()
})

test("a store the browser refuses shows why, with Reload, and no rows", async () => {
	document.body.innerHTML = ""
	mounted = mount(OwnersEditor, {
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
