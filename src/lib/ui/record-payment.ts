import type { CardPayment, PlainDate } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"
import type { MoneyData } from "#lib/ui/money-data"

import { cardLedger, newlyFrozen } from "#lib/domain/ledger"

/**
 * Saves a payment, then keeps the dates of every statement it fully pays (DD-49, DD-167).
 * The ledger after includes the payment, replacing any stored one with the same id, so
 * marking a planned payment paid freezes the same way a new paid payment does. A planned
 * payment pays nothing, so it freezes nothing.
 */
export async function savePayment(
	repo: Repository,
	data: MoneyData,
	payment: CardPayment,
	today: PlainDate,
): Promise<void> {
	await repo.saveCardPayment(payment)

	const card = data.cards.find((c) => c.id === payment.cardId)
	if (!card) return
	const payments = [...data.payments.filter((p) => !(p.cardId === card.id && p.id === payment.id)), payment]
	const before = cardLedger(card, data.purchases, data.payments, data.dates, today)
	const after = cardLedger(card, data.purchases, payments, data.dates, today)
	for (const kept of newlyFrozen(card, before, after)) {
		await repo.saveStatementDates(kept)
	}
}

export function deletePayment(repo: Repository, payment: CardPayment): Promise<void> {
	return repo.deleteCardPayment(payment.cardId, payment.id)
}
