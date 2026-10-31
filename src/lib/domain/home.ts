import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf } from "#lib/domain/cycle";
import { compareDates, daysBetween } from "#lib/domain/date";
import { ledgerUrgency, nextBill } from "#lib/domain/ledger";
import { listTotal } from "#lib/domain/purchase-list";
import { type GroupRoom, groupRoom } from "#lib/domain/room";
import type { Settings } from "#lib/domain/settings";
import { openPeriod } from "#lib/domain/statement";
import type {
	Card,
	CardLedger,
	LimitGroup,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";

export type RoomData = {
	cards: Card[];
	groups: LimitGroup[];
	ledgers: Map<string, CardLedger>;
	lists: PurchaseList[];
};

const byId = (a: { id: string }, b: { id: string }): number =>
	a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Unarchived, kept where purchases are entered, and in a group that exists. */
export function isReady(
	card: Card,
	groups: LimitGroup[],
	settings: Settings,
): boolean {
	return (
		!card.archived &&
		canPurchase(card, settings) &&
		groups.some((g) => g.id === card.limitGroupId)
	);
}

/** The card's group room, counting sent lists only; null when the group is missing. */
export function roomFor(
	card: Card,
	data: RoomData,
	exceptListId?: string,
): GroupRoom | null {
	const group = data.groups.find((g) => g.id === card.limitGroupId);
	if (!group) return null;
	return groupRoom(
		group,
		data.cards,
		data.ledgers,
		data.lists,
		card.id,
		exceptListId,
	);
}

export type ReadyRow = {
	card: Card;
	room: GroupRoom;
	closeDate: PlainDate;
	dueDate: PlainDate;
	overdue: boolean;
};

export type ReadySort = "room" | "close" | "due";
export const READY_SORTS: readonly ReadySort[] = ["room", "close", "due"];

export function readyRows(
	data: RoomData,
	settings: Settings,
	today: PlainDate,
): ReadyRow[] {
	const rows: ReadyRow[] = [];
	for (const card of data.cards) {
		if (!isReady(card, data.groups, settings)) continue;
		const room = roomFor(card, data);
		if (!room) continue;
		const period = openPeriod(card, today);
		const ledger = data.ledgers.get(card.id);
		const bill = ledger ? nextBill(ledger, today) : null;
		rows.push({
			card,
			room,
			closeDate: closeDateOf(card.cycle, period),
			dueDate: dueDateOf(card.cycle, period),
			overdue: bill !== null && ledgerUrgency(bill, today) === "overdue",
		});
	}
	return rows;
}

/** A new array: most room, longest to close, or latest due first; ties by card id. */
export function sortReady(rows: ReadyRow[], sort: ReadySort): ReadyRow[] {
	const key = (a: ReadyRow, b: ReadyRow): number => {
		if (sort === "room") return b.room.room - a.room.room;
		if (sort === "close") return compareDates(b.closeDate, a.closeDate);
		return compareDates(b.dueDate, a.dueDate);
	};
	return [...rows].sort((a, b) => key(a, b) || byId(a.card, b.card));
}

export type NeedsItem =
	| { kind: "waiting"; list: PurchaseList; total: number }
	| {
			kind: "overdue";
			card: Card;
			remaining: number;
			dueDate: PlainDate;
			days: number;
	  }
	| { kind: "draft"; list: PurchaseList; total: number };

const byDateThenId = (a: PurchaseList, b: PurchaseList): number =>
	compareDates(a.date, b.date) || byId(a, b);

export function needsYou(data: RoomData, today: PlainDate): NeedsItem[] {
	const ofStatus = (status: PurchaseList["status"]) =>
		data.lists.filter((l) => l.status === status).sort(byDateThenId);

	const overdue: Extract<NeedsItem, { kind: "overdue" }>[] = [];
	for (const card of data.cards) {
		if (card.archived) continue;
		const ledger = data.ledgers.get(card.id);
		const bill = ledger ? nextBill(ledger, today) : null;
		if (!bill || ledgerUrgency(bill, today) !== "overdue") continue;
		overdue.push({
			kind: "overdue",
			card,
			remaining: bill.remaining,
			dueDate: bill.dueDate,
			days: daysBetween(bill.dueDate, today),
		});
	}
	overdue.sort((a, b) => b.days - a.days || byId(a.card, b.card));

	return [
		...ofStatus("sent").map(
			(list): NeedsItem => ({ kind: "waiting", list, total: listTotal(list) }),
		),
		...overdue,
		...ofStatus("draft").map(
			(list): NeedsItem => ({ kind: "draft", list, total: listTotal(list) }),
		),
	];
}
