import type { ReadyData } from "#lib/domain/home"
import type { CardPayment, OwnerRecord, PlainDate, Purchase, StatementDates } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { ledgersFor } from "#lib/domain/ledger"
import { DEFAULT_OWNERS } from "#lib/domain/owner"

export type MoneyData = ReadyData & {
	purchases: Purchase[]
	payments: CardPayment[]
	dates: StatementDates[]
	/**
	 * As stored, or the starting three while none is (before the seed ran), as export writes them;
	 * a screen sorts them (`sortOwners`) and names a holder by them (`ownerName`).
	 */
	owners: OwnerRecord[]
}

/**
 * Everything Home and the purchase lists page draw from, with a ledger per card (archived
 * cards included).
 *
 * Payments and kept statement dates come from storage; `migratePayments` has converted the
 * old per-statement records by the time any page asks.
 */
export async function loadMoneyData(repo: Repository, today: PlainDate): Promise<MoneyData> {
	const [cards, groups, locations, lists, stored] = await Promise.all([
		repo.listCards(),
		repo.listLimitGroups(),
		repo.listLocations(),
		repo.listPurchaseLists(),
		repo.listOwners(),
	])
	const perCard = await Promise.all(
		cards.map(async (c) => ({
			purchases: await repo.listPurchases(c.id),
			payments: await repo.listCardPayments(c.id),
			dates: await repo.listStatementDates(c.id),
		})),
	)
	const purchases = perCard.flatMap((p) => p.purchases)
	const payments = perCard.flatMap((p) => p.payments)
	const dates = perCard.flatMap((p) => p.dates)

	return {
		cards,
		groups,
		// As stored: each screen sorts them by shown name as it draws, in the language then.
		locations,
		lists,
		owners: stored.length > 0 ? stored : DEFAULT_OWNERS.map((owner) => ({ ...owner })),
		purchases,
		payments,
		dates,
		ledgers: ledgersFor(cards, purchases, payments, dates, today),
	}
}
