import type { RangePreset } from "#lib/domain/purchase-range"
import type { ListStatus, PlainDate } from "#lib/domain/types"

import { isValidDate } from "#lib/domain/date"
import { readDir, type SortDir } from "#lib/domain/sort"
import {
	DEFAULT_LISTS_FILTER,
	DEFAULT_TX_FILTER,
	LISTS_GROUPS,
	type ListsFilter,
	type ListsGroup,
	OWED_DIRS,
	OWED_SORTS,
	type OwedSort,
	TX_DIRS,
	TX_GROUPS,
	TX_SORTS,
	type TxFilter,
	type TxGroup,
	type TxSort,
} from "#lib/domain/transactions"

/** Transactions' two tabs (RD-22): the ledger, and the purchase lists. */
export const LEDGER_ADDRESS = "/transactions"
export const LISTS_ADDRESS = "/transactions/lists"

/** The Ledger tab's list settings (`?q=&f.types=&f.cards=&f.range=&f.from=&f.to=&sort=&dir=&by=`). */
export type LedgerView = {
	filter: TxFilter
	sort: TxSort
	dir: SortDir
	/** What the ledger sections its rows by (`by`). */
	by: TxGroup
}

export const DEFAULT_LEDGER_VIEW: LedgerView = {
	filter: DEFAULT_TX_FILTER,
	sort: "date",
	dir: TX_DIRS.date,
	by: "day",
}

/** The Lists tab's list settings (`?q=&f.statuses=&f.cards=&f.range=&f.from=&f.to=&by=`). */
export type ListsView = {
	filter: ListsFilter
	/** What the lists are sectioned by (`by`). */
	by: ListsGroup
}

export const DEFAULT_LISTS_VIEW: ListsView = { filter: DEFAULT_LISTS_FILTER, by: "status" }

/**
 * What each card owes, in order (`?sort=&dir=`). Transactions no longer shows it; Home's _Owed_
 * tab (`/owed`) reads it next.
 */
export type OwedView = { sort: OwedSort; dir: SortDir }

export const DEFAULT_OWED_VIEW: OwedView = { sort: "urgency", dir: OWED_DIRS.urgency }

/** How many ledger rows show at first, and how many more each *Show more* adds. */
export const LEDGER_PAGE = 50

const TYPES = ["purchase", "payment"] as const
const RANGES = ["", "today", "week", "month", "lastMonth", "custom"] as const
const STATUSES = ["draft", "sent", "saved"] as const

const oneOf = <T extends string>(known: readonly T[], value: string | null, fallback: T): T =>
	known.includes(value as T) ? (value as T) : fallback

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] => known.filter((k) => values.includes(k))

const toDate = (value: string | null): PlainDate | "" => (value !== null && isValidDate(value) ? value : "")

/** The filters both tabs share, under `f.`: cards picked (each once) and the date. */
const readCardsAndDate = (p: URLSearchParams) => ({
	cards: [...new Set(p.getAll("f.cards").filter((c) => c !== ""))],
	range: oneOf<RangePreset | "">(RANGES, p.get("f.range"), ""),
	from: toDate(p.get("f.from")),
	to: toDate(p.get("f.to")),
})

const writeCardsAndDate = (p: URLSearchParams, filter: Pick<TxFilter, "cards" | "range" | "from" | "to">) => {
	for (const c of filter.cards) p.append("f.cards", c)
	if (filter.range) p.set("f.range", filter.range)
	if (filter.from) p.set("f.from", filter.from)
	if (filter.to) p.set("f.to", filter.to)
}

const query = (p: URLSearchParams) => {
	const text = p.toString()
	return text ? `?${text}` : ""
}

/** The Ledger tab's settings, read from its query; unknown values read as defaults. */
export function readLedgerView(search: string): LedgerView {
	const p = new URLSearchParams(search)
	const sort = oneOf(TX_SORTS, p.get("sort"), DEFAULT_LEDGER_VIEW.sort)
	return {
		filter: { q: p.get("q") ?? "", types: manyOf(TYPES, p.getAll("f.types")), ...readCardsAndDate(p) },
		sort,
		dir: readDir(p.get("dir"), sort, TX_DIRS),
		by: oneOf(TX_GROUPS, p.get("by"), DEFAULT_LEDGER_VIEW.by),
	}
}

/** `""` for the defaults, else `?` and the keys that differ, `f.types` and `f.cards` repeated. */
export function writeLedgerView(view: LedgerView): string {
	const p = new URLSearchParams()
	const { filter } = view
	if (filter.q) p.set("q", filter.q)
	for (const t of filter.types) p.append("f.types", t)
	writeCardsAndDate(p, filter)
	if (view.sort !== DEFAULT_LEDGER_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== TX_DIRS[view.sort]) p.set("dir", view.dir)
	if (view.by !== DEFAULT_LEDGER_VIEW.by) p.set("by", view.by)
	return query(p)
}

/** The Lists tab's settings, read from its query; unknown values read as defaults. */
export function readListsView(search: string): ListsView {
	const p = new URLSearchParams(search)
	return {
		filter: {
			q: p.get("q") ?? "",
			status: manyOf<ListStatus>(STATUSES, p.getAll("f.statuses")),
			...readCardsAndDate(p),
		},
		by: oneOf(LISTS_GROUPS, p.get("by"), DEFAULT_LISTS_VIEW.by),
	}
}

/** `""` for the defaults, else `?` and the keys that differ, `f.statuses` and `f.cards` repeated. */
export function writeListsView(view: ListsView): string {
	const p = new URLSearchParams()
	const { filter } = view
	if (filter.q) p.set("q", filter.q)
	for (const s of filter.status) p.append("f.statuses", s)
	writeCardsAndDate(p, filter)
	if (view.by !== DEFAULT_LISTS_VIEW.by) p.set("by", view.by)
	return query(p)
}

/** What each card owes, in order, read from a query; unknown values read as defaults. */
export function readOwedView(search: string): OwedView {
	const p = new URLSearchParams(search)
	const sort = oneOf(OWED_SORTS, p.get("sort"), DEFAULT_OWED_VIEW.sort)
	return { sort, dir: readDir(p.get("dir"), sort, OWED_DIRS) }
}

/** `""` for the default order, else `?` and the keys that differ. */
export function writeOwedView(view: OwedView): string {
	const p = new URLSearchParams()
	if (view.sort !== DEFAULT_OWED_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== OWED_DIRS[view.sort]) p.set("dir", view.dir)
	return query(p)
}
