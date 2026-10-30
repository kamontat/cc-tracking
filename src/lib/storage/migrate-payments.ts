import { compareDates } from "#lib/domain/date";
import { partsOf } from "#lib/domain/payment";
import { buildStatement } from "#lib/domain/statement";
import type {
	Card,
	CardPayment,
	PaymentPart,
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
	newId: () => string,
): { payments: CardPayment[]; dates: StatementDates[] } {
	const payments: CardPayment[] = [];
	const dates: StatementDates[] = [];

	for (const record of old) {
		const card = cards.find((c) => c.id === record.cardId);
		if (!card) continue;

		const { total } = buildStatement(card, record.period, purchases, record);
		for (const part of capParts(partsOf(record, total), total)) {
			payments.push({
				id: newId(),
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
 * Converts every stored statement payment once. Does nothing and returns 0 when any card
 * already has a card payment; otherwise saves the converted records and returns how many
 * payments it wrote. The old `cc:payment:` records stay where they are (DD-14).
 *
 * Dates are saved before payments: they do not count as "already converted", so a write
 * that fails part way through payments is the only way to leave a partial conversion.
 */
export async function migratePayments(
	repo: Repository,
	newId: () => string,
): Promise<number> {
	const cards = await repo.listCards();
	for (const card of cards) {
		if ((await repo.listCardPayments(card.id)).length > 0) return 0;
	}

	const purchases: Purchase[] = [];
	const old: StatementPayment[] = [];
	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		old.push(...(await repo.listPayments(card.id)));
	}

	const { payments, dates } = convertPayments(cards, purchases, old, newId);
	for (const kept of dates) await repo.saveStatementDates(kept);
	for (const payment of payments) await repo.saveCardPayment(payment);
	return payments.length;
}
