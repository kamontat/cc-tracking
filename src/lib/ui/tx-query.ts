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

export type TxView = {
	view: "ledger" | "lists" | "owed"
	filter: TxFilter
	sort: TxSort
	dir: SortDir
	/** What the ledger sections its rows by (`by`). */
	by: TxGroup
	owedSort: OwedSort
	/** *Owed*'s own direction (`odir`), apart from the ledger's. */
	owedDir: SortDir
	/** What the Lists view sections its lists by (`lby`), apart from the ledger's. */
	listsBy: ListsGroup
	/** The Lists view's own search and filters (`lq`, `status`, `lcard`, `lrange`, `lfrom`, `lto`). */
	lists: ListsFilter
}

export const DEFAULT_TX_VIEW: TxView = {
	view: "ledger",
	filter: DEFAULT_TX_FILTER,
	sort: "date",
	dir: TX_DIRS.date,
	by: "day",
	owedSort: "urgency",
	owedDir: OWED_DIRS.urgency,
	listsBy: "status",
	lists: DEFAULT_LISTS_FILTER,
}

/** How many ledger rows show at first, and how many more each *Show more* adds. */
export const LEDGER_PAGE = 50

const VIEWS = ["ledger", "lists", "owed"] as const
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
	const sort = oneOf(TX_SORTS, p.get("sort"), DEFAULT_TX_VIEW.sort)
	const owedSort = oneOf(OWED_SORTS, p.get("owed"), DEFAULT_TX_VIEW.owedSort)
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
		sort,
		dir: readDir(p.get("dir"), sort, TX_DIRS),
		by: oneOf(TX_GROUPS, p.get("by"), DEFAULT_TX_VIEW.by),
		owedSort,
		owedDir: readDir(p.get("odir"), owedSort, OWED_DIRS),
		listsBy: oneOf(LISTS_GROUPS, p.get("lby"), DEFAULT_TX_VIEW.listsBy),
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
	if (view.dir !== TX_DIRS[view.sort]) p.set("dir", view.dir)
	if (view.by !== DEFAULT_TX_VIEW.by) p.set("by", view.by)
	if (view.owedSort !== DEFAULT_TX_VIEW.owedSort) p.set("owed", view.owedSort)
	if (view.owedDir !== OWED_DIRS[view.owedSort]) p.set("odir", view.owedDir)
	if (view.listsBy !== DEFAULT_TX_VIEW.listsBy) p.set("lby", view.listsBy)
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
