import type { RangePreset } from "#lib/domain/purchase-range"
import type { ListStatus, PlainDate } from "#lib/domain/types"

import { isValidDate } from "#lib/domain/date"
import {
	DEFAULT_LISTS_FILTER,
	DEFAULT_TX_FILTER,
	type ListsFilter,
	type OwedSort,
	type TxFilter,
	type TxSort,
} from "#lib/domain/transactions"

export type TxView = {
	view: "ledger" | "lists" | "owed"
	filter: TxFilter
	sort: TxSort
	owedSort: OwedSort
	/** The Lists view's own search and filters (`lq`, `status`, `lcard`, `lrange`, `lfrom`, `lto`). */
	lists: ListsFilter
}

export const DEFAULT_TX_VIEW: TxView = {
	view: "ledger",
	filter: DEFAULT_TX_FILTER,
	sort: "new",
	owedSort: "urgency",
	lists: DEFAULT_LISTS_FILTER,
}

/** How many ledger rows show at first, and how many more each *Show more* adds. */
export const LEDGER_PAGE = 50

const VIEWS = ["ledger", "lists", "owed"] as const
const SORTS = ["new", "old", "big", "small"] as const
const OWED_SORTS = ["urgency", "card", "due", "left"] as const
const TYPES = ["purchase", "payment"] as const
const RANGES = ["today", "week", "month", "lastMonth", "custom"] as const
const STATUSES = ["draft", "sent", "saved"] as const

const oneOf = <T extends string>(known: readonly T[], value: string | null, fallback: T): T =>
	known.includes(value as T) ? (value as T) : fallback

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] => known.filter((k) => values.includes(k))

const toDate = (value: string | null): PlainDate | "" => (value !== null && isValidDate(value) ? value : "")

/** The Transactions page's state, read from its query string; unknown values read as defaults. */
export function readTxView(search: string): TxView {
	const p = new URLSearchParams(search)
	return {
		view: oneOf(VIEWS, p.get("view"), DEFAULT_TX_VIEW.view),
		filter: {
			q: p.get("q") ?? "",
			types: manyOf(TYPES, p.getAll("type")),
			cards: [...new Set(p.getAll("card").filter((c) => c !== ""))],
			range: oneOf<RangePreset | "">(["", ...RANGES], p.get("range"), ""),
			from: toDate(p.get("from")),
			to: toDate(p.get("to")),
		},
		sort: oneOf(SORTS, p.get("sort"), DEFAULT_TX_VIEW.sort),
		owedSort: oneOf(OWED_SORTS, p.get("owed"), DEFAULT_TX_VIEW.owedSort),
		lists: {
			q: p.get("lq") ?? "",
			status: manyOf<ListStatus>(STATUSES, p.getAll("status")),
			cards: [...new Set(p.getAll("lcard").filter((c) => c !== ""))],
			range: oneOf<RangePreset | "">(["", ...RANGES], p.get("lrange"), ""),
			from: toDate(p.get("lfrom")),
			to: toDate(p.get("lto")),
		},
	}
}

/** `""` for the defaults, else `?` and the fields that differ, `card`, `type`, `status` and `lcard` repeated. */
export function writeTxView(view: TxView): string {
	const p = new URLSearchParams()
	const { filter } = view
	if (view.view !== DEFAULT_TX_VIEW.view) p.set("view", view.view)
	if (filter.q) p.set("q", filter.q)
	for (const t of filter.types) p.append("type", t)
	for (const c of filter.cards) p.append("card", c)
	if (filter.range) p.set("range", filter.range)
	if (filter.from) p.set("from", filter.from)
	if (filter.to) p.set("to", filter.to)
	if (view.sort !== DEFAULT_TX_VIEW.sort) p.set("sort", view.sort)
	if (view.owedSort !== DEFAULT_TX_VIEW.owedSort) p.set("owed", view.owedSort)
	const { lists } = view
	if (lists.q) p.set("lq", lists.q)
	for (const s of lists.status) p.append("status", s)
	for (const c of lists.cards) p.append("lcard", c)
	if (lists.range) p.set("lrange", lists.range)
	if (lists.from) p.set("lfrom", lists.from)
	if (lists.to) p.set("lto", lists.to)
	const text = p.toString()
	return text ? `?${text}` : ""
}
