import { isValidDate } from "#lib/domain/date";
import type { RangePreset } from "#lib/domain/purchase-range";
import {
	DEFAULT_TX_FILTER,
	type OwedSort,
	type TxFilter,
	type TxSort,
} from "#lib/domain/transactions";
import type { ListStatus, PlainDate } from "#lib/domain/types";

export type TxView = {
	view: "ledger" | "lists" | "owed";
	filter: TxFilter;
	sort: TxSort;
	owedSort: OwedSort;
	status: ListStatus[];
};

export const DEFAULT_TX_VIEW: TxView = {
	view: "ledger",
	filter: DEFAULT_TX_FILTER,
	sort: "new",
	owedSort: "urgency",
	status: [],
};

const VIEWS = ["ledger", "lists", "owed"] as const;
const SORTS = ["new", "old", "big", "small"] as const;
const OWED_SORTS = ["urgency", "card", "due", "left"] as const;
const TYPES = ["purchase", "payment"] as const;
const RANGES = ["today", "week", "month", "lastMonth", "custom"] as const;
const STATUSES = ["draft", "sent", "saved"] as const;

const oneOf = <T extends string>(
	known: readonly T[],
	value: string | null,
	fallback: T,
): T => (known.includes(value as T) ? (value as T) : fallback);

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] =>
	known.filter((k) => values.includes(k));

const toDate = (value: string | null): PlainDate | "" =>
	value !== null && isValidDate(value) ? value : "";

/** The Transactions page's state, read from its query string; unknown values read as defaults. */
export function readTxView(search: string): TxView {
	const p = new URLSearchParams(search);
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
		status: manyOf(STATUSES, p.getAll("status")),
	};
}

/** `""` for the defaults, else `?` and the fields that differ, `card`, `type` and `status` repeated. */
export function writeTxView(view: TxView): string {
	const p = new URLSearchParams();
	const { filter } = view;
	if (view.view !== DEFAULT_TX_VIEW.view) p.set("view", view.view);
	if (filter.q) p.set("q", filter.q);
	for (const t of filter.types) p.append("type", t);
	for (const c of filter.cards) p.append("card", c);
	if (filter.range) p.set("range", filter.range);
	if (filter.from) p.set("from", filter.from);
	if (filter.to) p.set("to", filter.to);
	if (view.sort !== DEFAULT_TX_VIEW.sort) p.set("sort", view.sort);
	if (view.owedSort !== DEFAULT_TX_VIEW.owedSort) p.set("owed", view.owedSort);
	for (const s of view.status) p.append("status", s);
	const text = p.toString();
	return text ? `?${text}` : "";
}
