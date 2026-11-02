import type { DraftLine } from "#lib/domain/amount-warnings";
import { parseAmount } from "#lib/domain/money";
import type { GroupRoom } from "#lib/domain/room";
import type {
	Card,
	CardLedger,
	ListLine,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";

/** 0 for blank text, satang for an amount, null for text that is not money. */
export function lineAmount(text: string): number | null {
	if (text.trim() === "") return 0;
	try {
		return parseAmount(text);
	} catch {
		return null;
	}
}

/** One DraftLine per card that has a room and a ledger, in card order; planned is []. */
export function draftLines(
	cards: Card[],
	amounts: Record<string, number>,
	rooms: Map<string, GroupRoom>,
	ledgers: Map<string, CardLedger>,
): DraftLine[] {
	const lines: DraftLine[] = [];
	for (const card of cards) {
		const room = rooms.get(card.id);
		const ledger = ledgers.get(card.id);
		if (!room || !ledger) continue;
		lines.push({
			card,
			amount: amounts[card.id] ?? 0,
			room,
			ledger,
			planned: [],
		});
	}
	return lines;
}

/** The line's group room less every amount on the list in that group. */
export function roomAfter(line: DraftLine, lines: DraftLine[]): number {
	let total = 0;
	for (const l of lines) {
		if (l.room.group.id === line.room.group.id) total += l.amount;
	}
	return line.room.room - total;
}

/** Lines with an amount above zero, in card order. */
export function listLines(
	cardIds: string[],
	amounts: Record<string, number>,
): ListLine[] {
	const lines: ListLine[] = [];
	for (const cardId of cardIds) {
		const amount = amounts[cardId] ?? 0;
		if (amount > 0) lines.push({ cardId, amount });
	}
	return lines;
}

export function composeList(input: {
	id: string;
	date: PlainDate;
	lines: ListLine[];
	send: boolean;
	now: string;
}): PurchaseList {
	const base = { id: input.id, date: input.date, lines: input.lines };
	return input.send
		? { ...base, status: "sent", sentAt: input.now }
		: { ...base, status: "draft" };
}

/** `${prefix}-0`, `${prefix}-1`, … one per call. */
export function sequentialIds(prefix: string): () => string {
	let n = 0;
	return () => `${prefix}-${n++}`;
}
