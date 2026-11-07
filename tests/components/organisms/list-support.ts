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
	const { bar, replaced } = fakeBar(search)
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
	return { root: document.body, repo, visited, replaced }
}

/** An address bar on `search` that records each replace (the whole address given). */
export const fakeBar = (search: string) => {
	let query = search
	const replaced: string[] = []
	const bar: AddressBar = {
		search: () => query,
		push: () => {},
		replace: (url) => {
			replaced.push(url)
			const at = url.indexOf("?")
			query = at === -1 ? "" : url.slice(at)
		},
		onPop: () => () => {},
		length: () => 1,
		back: () => {},
	}
	return { bar, replaced }
}

export const click = async (root: ParentNode, action: string) => {
	const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`)
	if (!button) throw new Error(`no ${action}`)
	button.click()
	await settle()
}

export const stored = (repo: Repository): Promise<PurchaseList[]> => repo.listPurchaseLists()

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
