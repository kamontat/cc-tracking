import type { Component } from "svelte"
import type { Card, PurchaseList } from "#lib/domain/types"
import type { AddressBar } from "#lib/ui/address-bar"

import { flushSync, mount, unmount } from "svelte"

import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * Shared by the list pages' island tests (ported from the legacy `routes/list/test-support`):
 * a seeded repository, the page mounted with a fixed clock, and helpers that read what it draws.
 */

let mounted: ReturnType<typeof mount> | undefined

/** Unmounts the page a test mounted; call it from `afterEach`. */
export const cleanup = () => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
}

/** Flushes the page's awaited reads and writes and Svelte's updates. */
export const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

export const CLOCK = () => new Date("2026-10-31T03:00:00Z")

export const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `${id} card`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

/** Stores the three default location records, with only the `ticked` ones taking purchases. */
export const saveLocations = async (repo: Repository, ticked: string[]) => {
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: ticked.includes(record.id) })
}

export const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B"))
	await repo.saveCard(card("Z", { archived: true }))
	await saveLocations(repo, ["krabi"])
}

export type PageSetup = {
	search: string
	before?: (repo: Repository) => Promise<void>
	repo?: Repository
	/** Props beyond `open`, `clock`, `search` and `navigate`. */
	props?: Record<string, unknown>
}

/**
 * Seeds a repository (or the one given), runs `before`, then mounts `page` with a fixed clock,
 * the given query and a navigate that records where it went.
 */
export const setupPage = async (page: Component<never>, { search, before, repo: given, props = {} }: PageSetup) => {
	cleanup()
	const repo = given ?? new InMemoryRepository()
	await seed(repo)
	await before?.(repo)
	const visited: string[] = []
	const { bar, replaced, now, entries, popOptions, pushOptions } = fakeBar(search)
	mounted = mount(page, {
		target: document.body,
		props: {
			open: async () => ({ ok: true, repo }),
			clock: CLOCK,
			address: bar,
			navigate: (url: string) => {
				visited.push(url)
			},
			...props,
		} as never,
	})
	await settle()
	return { root: document.body, repo, visited, replaced, now, entries, popOptions, pushOptions, back: () => bar.back() }
}

/**
 * An address bar on `search` that records each replace (the whole address given) and keeps a
 * history it can step Back through, telling the page as the browser's `popstate` would.
 */
export const fakeBar = (search: string) => {
	const entries = [search]
	let at = 0
	const replaced: string[] = []
	let pop = () => {}
	const popOptions: ({ ownPage?: boolean } | undefined)[] = []
	const pushOptions: ({ ownPage?: boolean } | undefined)[] = []
	const bar: AddressBar = {
		search: () => {
			const entry = entries[at] ?? ""
			const q = entry.indexOf("?")
			return q === -1 ? "" : entry.slice(q)
		},
		push: (url, options) => {
			pushOptions.push(options)
			entries.splice(at + 1, entries.length, url)
			at++
		},
		replace: (url) => {
			replaced.push(url)
			entries[at] = url
		},
		onPop: (listener, options) => {
			popOptions.push(options)
			pop = listener
			return () => {
				pop = () => {}
			}
		},
		length: () => entries.length,
		back: () => {
			at = Math.max(0, at - 1)
			pop()
		},
	}
	return { bar, replaced, entries, popOptions, pushOptions, now: () => entries[at] ?? "" }
}

export const click = async (root: ParentNode, action: string) => {
	const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`)
	if (!button) throw new Error(`no ${action}`)
	button.click()
	await settle()
}

export const stored = (repo: Repository): Promise<PurchaseList[]> => repo.listPurchaseLists()

/** The open add-a-card sheet's card, or null. */
export const cardSheet = (cardId: string) =>
	document.querySelector<HTMLElement>(`dialog .card-step[data-card="${cardId}"]`)

/** Opens a card's sheet from its row on the list, as a tap does, unless it is open already. */
export const openCard = async (cardId: string) => {
	if (!cardSheet(cardId)) {
		const row = document.querySelector<HTMLElement>(`.lines > .line[data-card="${cardId}"]`)
		if (!row) throw new Error(`${cardId} is not on the list`)
		row.click()
		await settle()
	}
	const sheet = cardSheet(cardId)
	if (!sheet) throw new Error(`no sheet for ${cardId}`)
	return sheet
}

/** Closes the open card's sheet with *Done*, as the reader would before Review. */
export const closeCard = async () => {
	const done = document.querySelector<HTMLElement>('dialog [data-action="done"]')
	if (!done) return
	done.click()
	await settle()
}

/** The values of a card's fields (`amount` or `note`), one per order, read from its sheet. */
export const fieldsOf = async (cardId: string, field: string) =>
	[...(await openCard(cardId)).querySelectorAll<HTMLInputElement>(`[data-field="${field}"]`)].map((i) => i.value)

/** Types into a card's field in its sheet (the first order, or `order`), then closes the sheet. */
export const typeField = async (cardId: string, field: string, text: string, order = 0) => {
	const input = (await openCard(cardId)).querySelectorAll<HTMLInputElement>(`[data-field="${field}"]`)[order]
	if (!input) throw new Error(`no ${field} ${order} for ${cardId}`)
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
	await closeCard()
}

export const bannerText = (root: ParentNode) => flatText(root.querySelector(".error-banner p"))

export const flatText = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

/** The heading's own text, without the detail under it. */
export const titleOf = (h1: Element | null) => {
	const copy = h1?.cloneNode(true) as Element | undefined
	copy?.querySelector("small")?.remove()
	return flatText(copy)
}

export const draft = (id: string, cardIds: string[], extra: Partial<PurchaseList> = {}): PurchaseList => ({
	id,
	date: "2026-11-02",
	status: "draft",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100 })),
	...extra,
})

export const sent = (id: string, cardIds: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T03:00:00.000Z",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100 })),
})

export const saved = (id: string, cardIds: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status: "saved",
	sentAt: "2026-10-30T03:00:00.000Z",
	savedAt: "2026-10-30T09:00:00.000Z",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100, made: true })),
})

/** Where the page's "this list is elsewhere" view leads, or null when it is not shown. */
export const elsewhereLink = (root: ParentNode) =>
	root.querySelector('[data-action="open-list"]')?.getAttribute("href") ?? null
