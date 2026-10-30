import { closeDateOf, isCloseDate } from "#lib/domain/cycle";
import { compareDates, periodOf } from "#lib/domain/date";
import { ledgerUrgency, nextBill } from "#lib/domain/ledger";
import type { GroupRoom } from "#lib/domain/room";
import type {
	Card,
	CardLedger,
	CardPayment,
	PlainDate,
} from "#lib/domain/types";

export type AmountWarning =
	| {
			kind: "over-room";
			over: number;
			room: number;
			held: number;
			plannedBefore: number;
	  }
	| { kind: "shared-limit"; cardIds: string[]; over: number }
	| { kind: "overdue-bill"; remaining: number; dueDate: PlainDate }
	| { kind: "close-date"; closeDate: PlainDate };

export type DraftLine = {
	card: Card;
	amount: number;
	room: GroupRoom;
	ledger: CardLedger;
	planned: CardPayment[];
};

/** Whether `date` is before today. A future date is never warned about. */
export function datePassed(date: PlainDate, today: PlainDate): boolean {
	return compareDates(date, today) < 0;
}

/** Warnings for one line of a draft list; they inform, they never block saving. */
export function lineWarnings(
	line: DraftLine,
	lines: DraftLine[],
	date: PlainDate,
	today: PlainDate,
): AmountWarning[] {
	const out: AmountWarning[] = [];

	const sharing = lines.filter(
		(l) => l.amount > 0 && l.room.group.id === line.room.group.id,
	);
	const sum = sharing.reduce((n, l) => n + l.amount, 0);

	if (line.amount > 0 && sharing.length >= 2 && sum > line.room.room) {
		out.push({
			kind: "shared-limit",
			cardIds: sharing.map((l) => l.card.id).sort(),
			over: sum - line.room.room,
		});
	} else if (line.amount > 0 && line.amount > line.room.room) {
		out.push({
			kind: "over-room",
			over: line.amount - line.room.room,
			room: line.room.room,
			held: line.room.held,
			plannedBefore: line.planned
				.filter((p) => compareDates(p.date, date) <= 0)
				.reduce((n, p) => n + p.amount, 0),
		});
	}

	const bill = nextBill(line.ledger);
	if (bill && ledgerUrgency(bill, today) === "overdue") {
		out.push({
			kind: "overdue-bill",
			remaining: bill.remaining,
			dueDate: bill.dueDate,
		});
	}

	if (isCloseDate(line.card.cycle, date)) {
		out.push({
			kind: "close-date",
			closeDate: closeDateOf(line.card.cycle, periodOf(date)),
		});
	}

	return out;
}
