import { compareDates } from "#lib/domain/date";
import { partsOf } from "#lib/domain/payment";
import { buildStatement } from "#lib/domain/statement";
import type {
	Card,
	CardPayment,
	PaymentPart,
	Period,
	Purchase,
	StatementDates,
	StatementPayment,
} from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

/**
 * `parts` trimmed so they sum to at most `total`. The old model accepted money paid beyond
 * a statement's total but carried it nowhere, so converting it as paid would invent credit
 * or settle other statements. The excess comes off the latest parts first, and a part left
 * at zero is dropped.
 */
function capParts(parts: PaymentPart[], total: number): PaymentPart[] {
	const byDate = parts
		.map((part, index) => ({ part, index }))
		.sort(
			(a, b) => compareDates(a.part.paidAt, b.part.paidAt) || a.index - b.index,
		)
		.map(({ part }) => part);

	let room = Math.max(0, total);
	const kept: PaymentPart[] = [];
	for (const part of byDate) {
		const amount = Math.min(part.amount, room);
		room -= amount;
		if (amount > 0) kept.push({ paidAt: part.paidAt, amount });
	}
	return kept;
}

/** Where `migratePayments` records that it finished, so it never runs again. */
export const PAYMENTS_MIGRATION_KEY = "cc:migration:payments";

/**
 * The id a converted part gets: its card, its record's period and its position after capping.
 * Naming the card keeps converted ids unique across cards, not only within one, so code that
 * holds a bare id cannot mix up two cards' payments for the same period. The same record
 * always converts to the same ids, so a rerun after a failed write overwrites rather than
 * duplicates.
 */
export const convertedId = (
	cardId: string,
	period: Period,
	index: number,
): string => `m:${cardId}:${period}:${index}`;

/**
 * Turns old per-statement records into card payments and kept statement dates.
 *
 * Each part of a record becomes one paid payment naming the record's period, so the
 * ledger applies it to that statement first. A record without parts paid the statement's
 * current total, as `partsOf` reads it. Each record keeps its frozen close and due dates.
 * A record whose card is not in `cards` is skipped: its total cannot be worked out.
 */
export function convertPayments(
	cards: Card[],
	purchases: Purchase[],
	old: StatementPayment[],
): { payments: CardPayment[]; dates: StatementDates[] } {
	const payments: CardPayment[] = [];
	const dates: StatementDates[] = [];

	for (const record of old) {
		const card = cards.find((c) => c.id === record.cardId);
		if (!card) continue;

		const { total } = buildStatement(card, record.period, purchases, record);
		for (const [index, part] of capParts(
			partsOf(record, total),
			total,
		).entries()) {
			payments.push({
				id: convertedId(record.cardId, record.period, index),
				cardId: record.cardId,
				date: part.paidAt,
				amount: part.amount,
				status: "paid",
				period: record.period,
			});
		}
		dates.push({
			cardId: record.cardId,
			period: record.period,
			closeDate: record.closeDate,
			dueDate: record.dueDate,
		});
	}

	return { payments, dates };
}

/**
 * Converts every stored statement payment once, and returns how many payments it wrote.
 *
 * Finishing writes `PAYMENTS_MIGRATION_KEY`; while it is present this returns 0 without
 * reading anything. The marker, not the presence of card payments, says "converted": a user
 * who deletes every card payment must not see the old records come back, and someone whose
 * old records give no payments must not convert again on every load.
 *
 * The marker is written only after every write succeeded. A write that throws leaves it
 * unset and the error propagates; the next run converts again, and because converted ids are
 * deterministic it overwrites what the failed run saved instead of duplicating it. The old
 * `cc:payment:` records stay where they are (DD-14). `clearAll` removes the marker together
 * with those records, so a reset leaves nothing to convert.
 */
export async function migratePayments(
	repo: Repository,
	storage: Storage,
): Promise<number> {
	if (storage.getItem(PAYMENTS_MIGRATION_KEY) !== null) return 0;

	const cards = await repo.listCards();
	const purchases: Purchase[] = [];
	const old: StatementPayment[] = [];
	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		old.push(...(await repo.listPayments(card.id)));
	}

	const { payments, dates } = convertPayments(cards, purchases, old);
	for (const kept of dates) await repo.saveStatementDates(kept);
	for (const payment of payments) await repo.saveCardPayment(payment);

	storage.setItem(PAYMENTS_MIGRATION_KEY, "done");
	return payments.length;
}
