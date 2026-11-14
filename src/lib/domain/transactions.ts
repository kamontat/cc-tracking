import type { Card, CardLedger, CardPayment, ListStatus, PlainDate, Purchase, PurchaseList } from "#lib/domain/types"

import { compareDates } from "#lib/domain/date"
import { formatAmount, sumAmounts } from "#lib/domain/money"
import { normaliseRange, presetRange, type RangePreset } from "#lib/domain/purchase-range"
import { directed, type SortDir } from "#lib/domain/sort"

export type TxEntry =
	| { kind: "purchase"; purchase: Purchase; card: Card | undefined }
	| { kind: "payment"; payment: CardPayment; card: Card | undefined }

export const entryDate = (e: TxEntry): PlainDate => (e.kind === "purchase" ? e.purchase.date : e.payment.date)
export const entryAmount = (e: TxEntry): number => (e.kind === "purchase" ? e.purchase.amount : e.payment.amount)
export const entryCardId = (e: TxEntry): string => (e.kind === "purchase" ? e.purchase.cardId : e.payment.cardId)

/** Purchases and paid payments; planned payments have not happened and stay out. */
export function ledgerEntries(cards: Card[], purchases: Purchase[], payments: CardPayment[]): TxEntry[] {
	const byCard = new Map(cards.map((c) => [c.id, c]))
	return [
		...purchases.map(
			(purchase): TxEntry => ({
				kind: "purchase",
				purchase,
				card: byCard.get(purchase.cardId),
			}),
		),
		...payments
			.filter((p) => p.status === "paid")
			.map(
				(payment): TxEntry => ({
					kind: "payment",
					payment,
					card: byCard.get(payment.cardId),
				}),
			),
	]
}

export type TxFilter = {
	q: string
	types: ("purchase" | "payment")[]
	cards: string[]
	range: RangePreset | ""
	from: PlainDate | ""
	to: PlainDate | ""
}

/** What the ledger orders by: the entry's date (grouped by day) or its amount (one flat list). */
export type TxSort = "date" | "amount"

export const TX_SORTS: readonly TxSort[] = ["date", "amount"]

/** Each ledger sort's own direction: newest first, biggest first. */
export const TX_DIRS: Record<TxSort, SortDir> = { date: "desc", amount: "desc" }

export const DEFAULT_TX_FILTER: TxFilter = {
	q: "",
	types: [],
	cards: [],
	range: "",
	from: "",
	to: "",
}

const digits = (s: string): string => s.replace(/\D/g, "")

function matchesQuery(entry: TxEntry, query: string): boolean {
	const q = query.trim().toLowerCase()
	if (q === "") return true
	const text = [
		entryCardId(entry),
		entry.card?.name ?? "",
		entry.card?.last4 ?? "",
		entry.kind === "purchase" ? entry.purchase.note : (entry.payment.note ?? ""),
	]
	if (text.some((t) => t.toLowerCase().includes(q))) return true
	const wanted = digits(q)
	if (wanted === "") return false
	const printed = formatAmount(entryAmount(entry))
	if (printed.toLowerCase().includes(q)) return true
	return /^[\d,.฿\s]+$/.test(q) && digits(printed).includes(wanted)
}

/** The dates a filter's *Date* choice covers: a preset, or from and to; either end may be open (""). */
function dateRange(
	filter: { range: RangePreset | ""; from: PlainDate | ""; to: PlainDate | "" },
	today: PlainDate,
): { from: PlainDate | ""; to: PlainDate | "" } {
	if (filter.range && filter.range !== "custom") return presetRange(filter.range, today)
	if (filter.range === "custom" || filter.from || filter.to) return normaliseRange({ from: filter.from, to: filter.to })
	return { from: "", to: "" }
}

export function filterEntries(entries: TxEntry[], filter: TxFilter, today: PlainDate): TxEntry[] {
	const range = dateRange(filter, today)
	return entries.filter(
		(e) =>
			(filter.types.length === 0 || filter.types.includes(e.kind)) &&
			(filter.cards.length === 0 || filter.cards.includes(entryCardId(e))) &&
			(!range.from || compareDates(entryDate(e), range.from) >= 0) &&
			(!range.to || compareDates(entryDate(e), range.to) <= 0) &&
			matchesQuery(e, filter.q),
	)
}

const idOf = (e: TxEntry): string => (e.kind === "purchase" ? e.purchase.id : e.payment.id)
const addedMillis = (e: TxEntry): number =>
	e.kind === "purchase" && e.purchase.addedAt ? Date.parse(e.purchase.addedAt) || 0 : 0

/** Within a day: purchases by `addedAt` latest first (DR-17), then payments by id. */
function withinDay(a: TxEntry, b: TxEntry): number {
	if (a.kind !== b.kind) return a.kind === "purchase" ? -1 : 1
	if (a.kind === "purchase") return addedMillis(b) - addedMillis(a) || (idOf(a) < idOf(b) ? 1 : -1)
	return idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0
}

/**
 * A new array in `sort`, run `dir`. Within a day the order never flips: purchases latest added
 * first, then payments (DR-17); equal amounts go newest first.
 */
export function sortEntries(entries: TxEntry[], sort: TxSort, dir: SortDir = TX_DIRS[sort]): TxEntry[] {
	const byDate = (a: TxEntry, b: TxEntry): number => compareDates(entryDate(a), entryDate(b))
	const newest = (a: TxEntry, b: TxEntry): number => -byDate(a, b) || withinDay(a, b)
	const compare =
		sort === "date"
			? directed(byDate, dir, withinDay)
			: directed((a: TxEntry, b: TxEntry) => entryAmount(a) - entryAmount(b), dir, newest)
	return [...entries].sort(compare)
}

/** What the ledger sections its rows by: the day (the default), the card, or not at all. */
export type TxGroup = "day" | "card" | "none"

export const TX_GROUPS: readonly TxGroup[] = ["day", "card", "none"]

/** One section of the ledger: a day's rows, or one card's. */
export type LedgerSection =
	| { key: `day:${PlainDate}`; kind: "day"; date: PlainDate; entries: TxEntry[] }
	| { key: `card:${string}`; kind: "card"; cardId: string; card: Card | undefined; entries: TxEntry[] }

const cardIdOf = (e: TxEntry): string => (e.kind === "purchase" ? e.purchase.cardId : e.payment.cardId)

/**
 * The sorted `entries` in sections, each keeping the rows' order; null for `none`. Days run in the
 * date sort's direction, and newest first under an amount sort; cards run by id.
 */
export function groupEntries(entries: TxEntry[], by: TxGroup, sort: TxSort, dir: SortDir): LedgerSection[] | null {
	if (by === "none") return null
	if (by === "day") {
		const days = new Map<PlainDate, TxEntry[]>()
		for (const e of entries) days.set(entryDate(e), [...(days.get(entryDate(e)) ?? []), e])
		const newestFirst = sort !== "date" || dir === "desc"
		return [...days.keys()]
			.sort((a, b) => (newestFirst ? compareDates(b, a) : compareDates(a, b)))
			.map((date) => ({ key: `day:${date}` as const, kind: "day" as const, date, entries: days.get(date) ?? [] }))
	}
	const byCard = new Map<string, TxEntry[]>()
	for (const e of entries) byCard.set(cardIdOf(e), [...(byCard.get(cardIdOf(e)) ?? []), e])
	return [...byCard.keys()]
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		.map((cardId) => {
			const rows = byCard.get(cardId) ?? []
			return { key: `card:${cardId}` as const, kind: "card" as const, cardId, card: rows[0]?.card, entries: rows }
		})
}

/** Groups consecutive entries of the same date, keeping the order given. */
export function byDay(entries: TxEntry[]): Extract<LedgerSection, { kind: "day" }>[] {
	const days: Extract<LedgerSection, { kind: "day" }>[] = []
	for (const e of entries) {
		const last = days[days.length - 1]
		if (last && last.date === entryDate(e)) last.entries.push(e)
		else days.push({ key: `day:${entryDate(e)}`, kind: "day", date: entryDate(e), entries: [e] })
	}
	return days
}

/** Payments count plus, purchases minus. */
export function entriesTotal(entries: TxEntry[]): number {
	return sumAmounts(entries.map((e) => (e.kind === "payment" ? 1 : -1) * entryAmount(e)))
}

export function monthSummary(
	entries: TxEntry[],
	ledgers: Map<string, CardLedger>,
	today: PlainDate,
): { purchases: number; payments: number; owed: number } {
	const { from, to } = presetRange("month", today)
	const inMonth = entries.filter((e) => compareDates(entryDate(e), from) >= 0 && compareDates(entryDate(e), to) <= 0)
	const total = (kind: TxEntry["kind"]): number => sumAmounts(inMonth.filter((e) => e.kind === kind).map(entryAmount))
	return {
		purchases: total("purchase"),
		payments: total("payment"),
		owed: sumAmounts([...ledgers.values()].map((l) => l.owed)),
	}
}

/**
 * The summary of a searched or filtered ledger (DD-210): how many entries match, their purchases
 * and payments whatever their month, and what the filtered `cards` owe now (every card when none).
 */
export function matchSummary(
	entries: TxEntry[],
	ledgers: Map<string, CardLedger>,
	cards: readonly string[],
): { count: number; purchases: number; payments: number; owed: number } {
	const total = (kind: TxEntry["kind"]): number => sumAmounts(entries.filter((e) => e.kind === kind).map(entryAmount))
	const owing = [...ledgers].filter(([id]) => cards.length === 0 || cards.includes(id))
	return {
		count: entries.length,
		purchases: total("purchase"),
		payments: total("payment"),
		owed: sumAmounts(owing.map(([, l]) => l.owed)),
	}
}

/** A purchase made from a list is `<listId>-<n>`; null when the id has no such tail. */
export function listIdOf(purchaseId: string): string | null {
	const match = /^(.+)-\d+$/.exec(purchaseId)
	return match?.[1] ?? null
}

export type ListFilter = ListStatus[]

/** The Lists view's search and filters (DD-189), kept apart from the ledger's. */
export type ListsFilter = {
	q: string
	status: ListStatus[]
	cards: string[]
	range: RangePreset | ""
	from: PlainDate | ""
	to: PlainDate | ""
}

export const DEFAULT_LISTS_FILTER: ListsFilter = { q: "", status: [], cards: [], range: "", from: "", to: "" }

/**
 * The lists `filter` keeps: in a status ticked, with a card picked on any line, dated in the
 * range, and matching the search on a line's card id, name or last 4, or its note. Order is kept.
 */
export function filterLists(
	lists: PurchaseList[],
	filter: ListsFilter,
	cards: Card[],
	today: PlainDate,
): PurchaseList[] {
	const range = dateRange(filter, today)
	const q = filter.q.trim().toLowerCase()
	const byId = new Map(cards.map((card) => [card.id, card]))
	const matches = (list: PurchaseList) =>
		q === "" ||
		list.lines.some((line) => {
			const card = byId.get(line.cardId)
			return [line.cardId, card?.name ?? "", card?.last4 ?? "", line.note ?? ""].some((t) =>
				t.toLowerCase().includes(q),
			)
		})
	return lists.filter(
		(list) =>
			(filter.status.length === 0 || filter.status.includes(list.status)) &&
			(filter.cards.length === 0 || list.lines.some((line) => filter.cards.includes(line.cardId))) &&
			(!range.from || compareDates(list.date, range.from) >= 0) &&
			(!range.to || compareDates(list.date, range.to) <= 0) &&
			matches(list),
	)
}

/** Newest date first; no status ticked means every list. */
export function listRows(lists: PurchaseList[], filter: ListFilter): PurchaseList[] {
	return lists
		.filter((l) => filter.length === 0 || filter.includes(l.status))
		.sort((a, b) => compareDates(b.date, a.date) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

/** What the Lists view sections its lists by: status (the default), month, or not at all. */
export type ListsGroup = "status" | "month" | "none"

export const LISTS_GROUPS: readonly ListsGroup[] = ["status", "month", "none"]

/**
 * One section of the Lists view: every draft, every waiting list, the saved lists of one date,
 * the lists of one month (`YYYY-MM`), or every list.
 */
export type ListGroup =
	| { key: "draft" | "sent"; status: "draft" | "sent"; lists: PurchaseList[] }
	| { key: `saved:${PlainDate}`; status: "saved"; date: PlainDate; lists: PurchaseList[] }
	| { key: `month:${string}`; month: string; lists: PurchaseList[] }
	| { key: "all"; lists: PurchaseList[] }

/**
 * The Lists view's sections (DD-188): drafts, then lists waiting for the spender, then saved
 * lists grouped by their date, newest date first; each in `listRows` order. Groups the filter
 * leaves empty are left out.
 */
export function listGroups(lists: PurchaseList[], filter: ListFilter, by: ListsGroup = "status"): ListGroup[] {
	const rows = listRows(lists, filter)
	if (by === "none") return rows.length > 0 ? [{ key: "all", lists: rows }] : []
	if (by === "month") {
		const months: Extract<ListGroup, { month: string }>[] = []
		for (const list of rows) {
			const month = list.date.slice(0, 7)
			const last = months.at(-1)
			if (last?.month === month) last.lists.push(list)
			else months.push({ key: `month:${month}`, month, lists: [list] })
		}
		return months
	}
	const groups: ListGroup[] = []
	for (const status of ["draft", "sent"] as const) {
		const of = rows.filter((l) => l.status === status)
		if (of.length > 0) groups.push({ key: status, status, lists: of })
	}
	for (const list of rows) {
		if (list.status !== "saved") continue
		const last = groups.at(-1)
		if (last && "date" in last && last.date === list.date) last.lists.push(list)
		else groups.push({ key: `saved:${list.date}`, status: "saved", date: list.date, lists: [list] })
	}
	return groups
}
