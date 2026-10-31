import { compareDates } from "#lib/domain/date";
import { formatAmount, sumAmounts } from "#lib/domain/money";
import { type PayChoice, payChoices } from "#lib/domain/pay";
import {
	normaliseRange,
	presetRange,
	type RangePreset,
} from "#lib/domain/purchase-range";
import type {
	Card,
	CardLedger,
	CardPayment,
	ListStatus,
	PlainDate,
	Purchase,
	PurchaseList,
} from "#lib/domain/types";

export type TxEntry =
	| { kind: "purchase"; purchase: Purchase; card: Card | undefined }
	| { kind: "payment"; payment: CardPayment; card: Card | undefined };

export const entryDate = (e: TxEntry): PlainDate =>
	e.kind === "purchase" ? e.purchase.date : e.payment.date;
export const entryAmount = (e: TxEntry): number =>
	e.kind === "purchase" ? e.purchase.amount : e.payment.amount;
export const entryCardId = (e: TxEntry): string =>
	e.kind === "purchase" ? e.purchase.cardId : e.payment.cardId;

/** Purchases and paid payments; planned payments have not happened and stay out. */
export function ledgerEntries(
	cards: Card[],
	purchases: Purchase[],
	payments: CardPayment[],
): TxEntry[] {
	const byCard = new Map(cards.map((c) => [c.id, c]));
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
	];
}

export type TxFilter = {
	q: string;
	types: ("purchase" | "payment")[];
	cards: string[];
	range: RangePreset | "";
	from: PlainDate | "";
	to: PlainDate | "";
};

export type TxSort = "new" | "old" | "big" | "small";

export const DEFAULT_TX_FILTER: TxFilter = {
	q: "",
	types: [],
	cards: [],
	range: "",
	from: "",
	to: "",
};

const digits = (s: string): string => s.replace(/\D/g, "");

function matchesQuery(entry: TxEntry, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") return true;
	const text = [
		entryCardId(entry),
		entry.card?.name ?? "",
		entry.card?.last4 ?? "",
		entry.kind === "purchase" ? entry.purchase.note : "",
	];
	if (text.some((t) => t.toLowerCase().includes(q))) return true;
	const wanted = digits(q);
	if (wanted === "") return false;
	const printed = formatAmount(entryAmount(entry));
	if (printed.toLowerCase().includes(q)) return true;
	return /^[\d,.฿\s]+$/.test(q) && digits(printed).includes(wanted);
}

export function filterEntries(
	entries: TxEntry[],
	filter: TxFilter,
	today: PlainDate,
): TxEntry[] {
	let range: { from: PlainDate | ""; to: PlainDate | "" } = {
		from: "",
		to: "",
	};
	if (filter.range && filter.range !== "custom")
		range = presetRange(filter.range, today);
	else if (filter.range === "custom" || filter.from || filter.to)
		range = normaliseRange({ from: filter.from, to: filter.to });
	return entries.filter(
		(e) =>
			(filter.types.length === 0 || filter.types.includes(e.kind)) &&
			(filter.cards.length === 0 || filter.cards.includes(entryCardId(e))) &&
			(!range.from || compareDates(entryDate(e), range.from) >= 0) &&
			(!range.to || compareDates(entryDate(e), range.to) <= 0) &&
			matchesQuery(e, filter.q),
	);
}

const idOf = (e: TxEntry): string =>
	e.kind === "purchase" ? e.purchase.id : e.payment.id;
const addedMillis = (e: TxEntry): number =>
	e.kind === "purchase" && e.purchase.addedAt
		? Date.parse(e.purchase.addedAt) || 0
		: 0;

/** Within a day: purchases by `addedAt` latest first (DR-17), then payments by id. */
function withinDay(a: TxEntry, b: TxEntry): number {
	if (a.kind !== b.kind) return a.kind === "purchase" ? -1 : 1;
	if (a.kind === "purchase")
		return addedMillis(b) - addedMillis(a) || (idOf(a) < idOf(b) ? 1 : -1);
	return idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0;
}

export function sortEntries(entries: TxEntry[], sort: TxSort): TxEntry[] {
	const newest = (a: TxEntry, b: TxEntry): number =>
		compareDates(entryDate(b), entryDate(a)) || withinDay(a, b);
	const compare = {
		new: newest,
		old: (a: TxEntry, b: TxEntry) =>
			compareDates(entryDate(a), entryDate(b)) || withinDay(a, b),
		big: (a: TxEntry, b: TxEntry) =>
			entryAmount(b) - entryAmount(a) || newest(a, b),
		small: (a: TxEntry, b: TxEntry) =>
			entryAmount(a) - entryAmount(b) || newest(a, b),
	}[sort];
	return [...entries].sort(compare);
}

/** Groups consecutive entries of the same date, keeping the order given. */
export function byDay(
	entries: TxEntry[],
): { date: PlainDate; entries: TxEntry[] }[] {
	const days: { date: PlainDate; entries: TxEntry[] }[] = [];
	for (const e of entries) {
		const last = days[days.length - 1];
		if (last && last.date === entryDate(e)) last.entries.push(e);
		else days.push({ date: entryDate(e), entries: [e] });
	}
	return days;
}

/** Payments count plus, purchases minus. */
export function entriesTotal(entries: TxEntry[]): number {
	return sumAmounts(
		entries.map((e) => (e.kind === "payment" ? 1 : -1) * entryAmount(e)),
	);
}

export function monthSummary(
	entries: TxEntry[],
	ledgers: Map<string, CardLedger>,
	today: PlainDate,
): { purchases: number; payments: number; owed: number } {
	const { from, to } = presetRange("month", today);
	const inMonth = entries.filter(
		(e) =>
			compareDates(entryDate(e), from) >= 0 &&
			compareDates(entryDate(e), to) <= 0,
	);
	const total = (kind: TxEntry["kind"]): number =>
		sumAmounts(inMonth.filter((e) => e.kind === kind).map(entryAmount));
	return {
		purchases: total("purchase"),
		payments: total("payment"),
		owed: sumAmounts([...ledgers.values()].map((l) => l.owed)),
	};
}

export type OwedRow = PayChoice;
export type OwedSort = "urgency" | "card" | "due" | "left";

/** Every card that owes money or holds credit; archived ones only while they owe. */
export function owedRows(
	cards: Card[],
	ledgers: Map<string, CardLedger>,
	today: PlainDate,
	sort: OwedSort,
): OwedRow[] {
	const rows = payChoices(cards, ledgers, today).filter(
		(r) => r.owed > 0 || r.credit > 0,
	);
	const byId = (a: OwedRow, b: OwedRow): number =>
		a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0;
	switch (sort) {
		case "urgency":
			return rows;
		case "card":
			return rows.sort(byId);
		case "left":
			return rows.sort((a, b) => b.owed - a.owed || byId(a, b));
		case "due":
			return rows.sort((a, b) => {
				if (!a.bill || !b.bill) return a.bill ? -1 : b.bill ? 1 : byId(a, b);
				return compareDates(a.bill.dueDate, b.bill.dueDate) || byId(a, b);
			});
	}
}

/** A purchase made from a list is `<listId>-<n>`; null when the id has no such tail. */
export function listIdOf(purchaseId: string): string | null {
	const match = /^(.+)-\d+$/.exec(purchaseId);
	return match?.[1] ?? null;
}

export type ListFilter = ListStatus[];

/** Newest date first; no status ticked means every list. */
export function listRows(
	lists: PurchaseList[],
	filter: ListFilter,
): PurchaseList[] {
	return lists
		.filter((l) => filter.length === 0 || filter.includes(l.status))
		.sort(
			(a, b) =>
				compareDates(b.date, a.date) ||
				(a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
		);
}
