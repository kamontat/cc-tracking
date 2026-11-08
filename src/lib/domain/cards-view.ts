import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
import { compareDates, today as todayOf } from "#lib/domain/date"
import { byGroupName } from "#lib/domain/list-view"
import { cardOwnerOf, type Owner } from "#lib/domain/owner"
import { openPeriod } from "#lib/domain/statement"
import { getLocale } from "#lib/i18n/index"

/** How the Cards page orders its results; `place` is the default, grouped by location. */
export type CardsSort = "place" | "room" | "name" | "close"

export const CARDS_SORTS: readonly CardsSort[] = ["place", "room", "name", "close"]

/** What narrows the Cards page. An empty list means "any". */
export type CardsFilter = {
	q: string
	locations: string[]
	owners: Owner[]
	/** Only cards in no stored limit group (none set, or one that no longer exists). */
	ungrouped: boolean
}

export type CardsView = CardsFilter & { sort: CardsSort }

export const DEFAULT_CARDS_VIEW: CardsView = {
	q: "",
	locations: [],
	owners: [],
	ungrouped: false,
	sort: "place",
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

export type CardsResults = {
	/** Per location in order, empty ones left out; set only for the `place` sort. */
	sections: { location: string; cards: Card[] }[] | null
	/** Every unarchived match in one list; set for any other sort. */
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

function comparer(
	sort: CardsSort,
	rooms: CardsRooms,
	today: PlainDate,
	ledgers: ReadonlyMap<string, CardLedger>,
): (a: Card, b: Card) => number {
	const roomOf = (c: Card): number => (c.limitGroupId ? rooms.get(c.limitGroupId)?.room : undefined) ?? 0
	switch (sort) {
		case "room":
			return (a, b) => roomOf(b) - roomOf(a) || byId(a, b)
		case "name":
			return (a, b) => a.name.localeCompare(b.name, getLocale()) || byId(a, b)
		case "close":
			return (a, b) =>
				compareDates(
					cardOpenDates(a, today, ledgers.get(a.id)).closeDate,
					cardOpenDates(b, today, ledgers.get(b.id)).closeDate,
				) || byId(a, b)
		default:
			return byId
	}
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
	const compare = comparer(view.sort, rooms, today, ledgers)
	const archived = matches.filter((c) => c.archived).sort(compare)
	if (view.sort === "place") {
		const sections = locationOrder
			.map((location) => ({
				location,
				cards: live.filter((c) => c.location === location).sort(byId),
			}))
			.filter((s) => s.cards.length > 0)
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
