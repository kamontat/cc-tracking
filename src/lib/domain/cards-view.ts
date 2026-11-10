import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
import { compareDates, today as todayOf } from "#lib/domain/date"
import { byGroupName } from "#lib/domain/list-view"
import { cardOwnerOf, OWNERS, type Owner } from "#lib/domain/owner"
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

/** What narrows the Cards page. An empty list means "any". */
export type CardsFilter = {
	q: string
	locations: string[]
	owners: Owner[]
	/** Only cards in no stored limit group (none set, or one that no longer exists). */
	ungrouped: boolean
}

/** What the Cards page sections its cards by: place (the default), account holder, limit group, or not at all. */
export type CardsGroup = "place" | "holder" | "limit" | "none"

export const CARDS_GROUPS: readonly CardsGroup[] = ["place", "holder", "limit", "none"]

export type CardsView = CardsFilter & { sort: CardsSort; dir: SortDir; by: CardsGroup }

export const DEFAULT_CARDS_VIEW: CardsView = {
	q: "",
	locations: [],
	owners: [],
	ungrouped: false,
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

export function matchesCard(card: Card, group: LimitGroup | null, filter: CardsFilter): boolean {
	if (filter.locations.length > 0 && !filter.locations.includes(card.location)) return false
	if (filter.ungrouped && group !== null) return false
	if (filter.owners.length > 0) {
		const owner = cardOwnerOf(card, group)
		if (!owner || !filter.owners.includes(owner)) return false
	}
	return matchesQuery(card, filter.q)
}

/** One section of the Cards results: a place, an account holder (none: no holder), or a limit group (none: in no stored group). */
export type CardsSection =
	| { key: `place:${string}`; kind: "place"; location: string; cards: Card[] }
	| { key: `holder:${string}`; kind: "holder"; owner: Owner | null; cards: Card[] }
	| { key: `limit:${string}`; kind: "limit"; group: LimitGroup | null; cards: Card[] }

export type CardsResults = {
	/** The sections in order, empty ones left out; null when the view is not grouped (`none`). */
	sections: CardsSection[] | null
	/** Every unarchived match in one list; set when the view is not grouped. */
	flat: Card[] | null
	/** Archived matches, flat, same sort. */
	archived: Card[]
	/** Unarchived matches. */
	count: number
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

/**
 * The live cards in sections: places in `locationOrder` (a card kept elsewhere is left out, as
 * before), holders in `OWNERS` order then none, limit groups A to Z (`byGroupName`) then none.
 */
function sectionsOf(
	by: Exclude<CardsGroup, "none">,
	live: Card[],
	groupById: Map<string, LimitGroup>,
	locationOrder: readonly string[],
	groups: LimitGroup[],
): CardsSection[] {
	const groupOf = (c: Card): LimitGroup | null => (c.limitGroupId ? (groupById.get(c.limitGroupId) ?? null) : null)
	let sections: CardsSection[]
	if (by === "place") {
		sections = locationOrder.map((location) => ({
			key: `place:${location}` as const,
			kind: "place" as const,
			location,
			cards: live.filter((c) => c.location === location),
		}))
	} else if (by === "holder") {
		sections = [...OWNERS, null].map((owner) => ({
			key: `holder:${owner ?? "none"}` as const,
			kind: "holder" as const,
			owner,
			cards: live.filter((c) => cardOwnerOf(c, groupOf(c)) === owner),
		}))
	} else {
		sections = [...[...groups].sort(byGroupName), null].map((group) => ({
			key: `limit:${group?.id ?? "none"}` as const,
			kind: "limit" as const,
			group,
			cards: live.filter((c) => (groupOf(c)?.id ?? null) === (group?.id ?? null)),
		}))
	}
	return sections.filter((s) => s.cards.length > 0)
}

export function cardsResults(
	cards: Card[],
	groups: LimitGroup[],
	rooms: CardsRooms,
	view: CardsView,
	locationOrder: readonly string[],
	today: PlainDate = todayOf(new Date()),
	ledgers: ReadonlyMap<string, CardLedger> = new Map(),
): CardsResults {
	const groupById = new Map(groups.map((g) => [g.id, g]))
	const matches = cards.filter((c) =>
		matchesCard(c, c.limitGroupId ? (groupById.get(c.limitGroupId) ?? null) : null, view),
	)
	const live = matches.filter((c) => !c.archived)
	const compare = directed(sortKey(view.sort, rooms, today, ledgers), view.dir, byId)
	const archived = matches.filter((c) => c.archived).sort(compare)
	if (view.by !== "none") {
		const sections = sectionsOf(view.by, live.sort(compare), groupById, locationOrder, groups)
		return {
			sections,
			flat: null,
			archived,
			count: sections.reduce((n, s) => n + s.cards.length, 0),
		}
	}
	return {
		sections: null,
		flat: live.sort(compare),
		archived,
		count: live.length,
	}
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
