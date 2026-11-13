import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
import { compareDates, today as todayOf } from "#lib/domain/date"
import { byGroupName } from "#lib/domain/list-view"
import { cardOwnerOf, DEFAULT_OWNERS, type Owner } from "#lib/domain/owner"
import { directed, type SortDir } from "#lib/domain/sort"
import { openPeriod } from "#lib/domain/statement"
import { getLocale } from "#lib/i18n/index"

/** How the Cards page orders its cards, in each section; `card` (by id) is the default. */
export type CardsSort = "card" | "room" | "name" | "close" | "due"

export const CARDS_SORTS: readonly CardsSort[] = ["card", "room", "name", "close", "due"]

/** Each Cards sort's own direction: by id, most room, A to Z, soonest close and due. */
export const CARDS_DIRS: Record<CardsSort, SortDir> = {
	card: "asc",
	room: "desc",
	name: "asc",
	close: "asc",
	due: "asc",
}

/**
 * What narrows any list of cards (Cards, Home's _Owed_ and _Ready to use_, RD-29): the search,
 * the places and the account holders. An empty list means "any".
 */
export type CardFilter = {
	q: string
	locations: string[]
	owners: Owner[]
}

/** What narrows the Cards page: Cards' search, places and holders. */
export type CardsFilter = CardFilter

/** What the Cards page sections its cards by: place (the default), account holder, limit group, or not at all. */
export type CardsGroup = "place" | "holder" | "limit" | "none"

export const CARDS_GROUPS: readonly CardsGroup[] = ["place", "holder", "limit", "none"]

/** A list of cards' view: its filter, its sort (`F`) and which way, and its grouping. */
export type CardListView<F extends string> = CardFilter & { sort: F; dir: SortDir; by: CardsGroup }

export type CardsView = CardsFilter & CardListView<CardsSort>

export const DEFAULT_CARDS_VIEW: CardsView = {
	q: "",
	locations: [],
	owners: [],
	sort: "card",
	dir: "asc",
	by: "place",
}

/**
 * Each group's room, computed once per load with `groupRoom` and keyed by group id. A card
 * whose group is unknown has no entry, and reads as no room.
 */
export type CardsRooms = Map<string, GroupRoom>

/** The share of a group's limit in use from `used + held` (DD-96), rounded, never below 0. */
export function usedPct(room: GroupRoom): number {
	const { limit } = room.group
	if (limit <= 0) return 0
	return Math.max(0, Math.round(((room.used + room.held) / limit) * 100))
}

/** The percentage a row or hero shows; `null` for a card with no group. */
export function cardUsePct(room: GroupRoom | null | undefined): number | null {
	return room ? usedPct(room) : null
}

/** True when the query (trimmed, any case) is in the card's id, name, last 4 or comment. */
function matchesQuery(card: Card, query: string): boolean {
	const q = query.trim().toLowerCase()
	if (q === "") return true
	return [card.id, card.name, card.last4, card.comment ?? ""].some((v) => v.toLowerCase().includes(q))
}

export function matchesCard(card: Card, group: LimitGroup | null, filter: CardFilter): boolean {
	if (filter.locations.length > 0 && !filter.locations.includes(card.location)) return false
	if (filter.owners.length > 0) {
		const owner = cardOwnerOf(card, group)
		if (!owner || !filter.owners.includes(owner)) return false
	}
	return matchesQuery(card, filter.q)
}

/**
 * One section of a list of cards: a place, an account holder, or a limit group. `T` is what the
 * list draws per card (a card, an owed or ready row).
 */
export type CardSection<T> =
	| { key: `place:${string}`; kind: "place"; location: string; cards: T[] }
	| { key: `holder:${string}`; kind: "holder"; owner: Owner; cards: T[] }
	| { key: `limit:${string}`; kind: "limit"; group: LimitGroup; cards: T[] }

export type CardsSection = CardSection<Card>

/** A list of cards, sectioned by its grouping, or flat when it is `none`. */
export type Sectioned<T> = {
	/** The sections in order, empty ones left out; null when the view is not grouped (`none`). */
	sections: CardSection<T>[] | null
	/** Every item in one list; set when the view is not grouped. */
	flat: T[] | null
	/** How many items in all. */
	count: number
}

/** The unarchived matches, sectioned or flat (`count` counts them), then the archived ones. */
export type CardsResults = Sectioned<Card> & {
	/** Archived matches, flat, same sort. */
	archived: Card[]
}

const byId = (a: Card, b: Card): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Dates shown on a Cards tile; preserved ledger dates take precedence over the cycle. */
export function cardOpenDates(card: Card, today: PlainDate, ledger?: CardLedger) {
	const kept = ledger?.statements.find((s) => s.open)
	const period = openPeriod(card, today)
	return {
		closeDate: kept?.closeDate ?? closeDateOf(card.cycle, period),
		dueDate: kept?.dueDate ?? dueDateOf(card.cycle, period),
	}
}

/** The sort's key, ascending; `cardsResults` runs it in the view's direction, ties by id. */
function sortKey(
	sort: CardsSort,
	rooms: CardsRooms,
	today: PlainDate,
	ledgers: ReadonlyMap<string, CardLedger>,
): (a: Card, b: Card) => number {
	const roomOf = (c: Card): number => (c.limitGroupId ? rooms.get(c.limitGroupId)?.room : undefined) ?? 0
	switch (sort) {
		case "room":
			return (a, b) => roomOf(a) - roomOf(b)
		case "name":
			return (a, b) => a.name.localeCompare(b.name, getLocale())
		case "close":
		case "due": {
			const field = sort === "close" ? "closeDate" : "dueDate"
			return (a, b) =>
				compareDates(
					cardOpenDates(a, today, ledgers.get(a.id))[field],
					cardOpenDates(b, today, ledgers.get(b.id))[field],
				)
		}
		default:
			return () => 0
	}
}

/** The stored group a card draws on, or null for none or one that no longer exists. */
const groupIn = (groupById: ReadonlyMap<string, LimitGroup>, card: Card): LimitGroup | null =>
	card.limitGroupId ? (groupById.get(card.limitGroupId) ?? null) : null

/**
 * `items` (already in order; `cardOf` reads each one's card) in sections by `by`, each section
 * keeping that order: places in `locationOrder` (a card kept elsewhere is left out), holders in
 * `ownerOrder` (the stored owners A to Z by name; the starting three when not given) then any
 * other holder by id, limit groups A to Z (`byGroupName`); or flat for `none`.
 */
export function sectionCards<T>(
	by: CardsGroup,
	items: T[],
	cardOf: (item: T) => Card,
	groups: LimitGroup[],
	locationOrder: readonly string[],
	ownerOrder: readonly Owner[] = DEFAULT_OWNERS.map((owner) => owner.id),
): Sectioned<T> {
	if (by === "none") return { sections: null, flat: items, count: items.length }
	const groupById = new Map(groups.map((g) => [g.id, g]))
	const groupOf = (item: T) => groupIn(groupById, cardOf(item))
	let sections: CardSection<T>[]
	if (by === "place") {
		sections = locationOrder.map((location) => ({
			key: `place:${location}` as const,
			kind: "place" as const,
			location,
			cards: items.filter((item) => cardOf(item).location === location),
		}))
	} else if (by === "holder") {
		const holderOf = (item: T) => cardOwnerOf(cardOf(item), groupOf(item))
		const others = items.map(holderOf).filter((owner): owner is Owner => owner !== null && !ownerOrder.includes(owner))
		sections = [...ownerOrder, ...new Set(others.toSorted())].map((owner) => ({
			key: `holder:${owner}` as const,
			kind: "holder" as const,
			owner,
			cards: items.filter((item) => holderOf(item) === owner),
		}))
	} else {
		sections = [...groups].sort(byGroupName).map((group) => ({
			key: `limit:${group.id}` as const,
			kind: "limit" as const,
			group,
			cards: items.filter((item) => groupOf(item)?.id === group.id),
		}))
	}
	sections = sections.filter((s) => s.cards.length > 0)
	return { sections, flat: null, count: sections.reduce((n, s) => n + s.cards.length, 0) }
}

/**
 * The `items` whose card matches `filter` (Cards' search, places and holders), in their order. A
 * card in no stored limit group is invalid data (RD-27): left out, like one kept at no stored place.
 */
export function filterCards<T>(items: T[], cardOf: (item: T) => Card, groups: LimitGroup[], filter: CardFilter): T[] {
	const groupById = new Map(groups.map((g) => [g.id, g]))
	return items.filter((item) => {
		const group = groupIn(groupById, cardOf(item))
		return group !== null && matchesCard(cardOf(item), group, filter)
	})
}

export function cardsResults(
	cards: Card[],
	groups: LimitGroup[],
	rooms: CardsRooms,
	view: CardsView,
	locationOrder: readonly string[],
	today: PlainDate = todayOf(new Date()),
	ledgers: ReadonlyMap<string, CardLedger> = new Map(),
	ownerOrder?: readonly Owner[],
): CardsResults {
	// A card in no stored group is invalid data (RD-27): left out, like one kept at no stored place.
	const matches = filterCards(cards, (c) => c, groups, view)
	const compare = directed(sortKey(view.sort, rooms, today, ledgers), view.dir, byId)
	const archived = matches.filter((c) => c.archived).sort(compare)
	const live = matches.filter((c) => !c.archived).sort(compare)
	return { ...sectionCards(view.by, live, (c) => c, groups, locationOrder, ownerOrder), archived }
}

export type GroupPanel = {
	group: LimitGroup
	room: number
	limit: number
	usedPct: number
	cardIds: string[]
	full: boolean
}

/** One panel per group, A to Z by name (`byGroupName`), with its cards' ids (archived included) by id. */
export function groupPanels(groups: LimitGroup[], cards: Card[], rooms: CardsRooms): GroupPanel[] {
	return [...groups].sort(byGroupName).map((group) => {
		const r = rooms.get(group.id)
		const pct = r ? usedPct(r) : 0
		return {
			group,
			room: r ? r.room : group.limit,
			limit: group.limit,
			usedPct: pct,
			cardIds: cards
				.filter((c) => c.limitGroupId === group.id)
				.map((c) => c.id)
				.sort(),
			full: pct >= 80,
		}
	})
}
