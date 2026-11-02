import type { RoomData } from "#lib/domain/home";
import { ledgersFor } from "#lib/domain/ledger";
import type { Settings } from "#lib/domain/settings";
import type {
	CardPayment,
	PlainDate,
	Purchase,
	StatementDates,
} from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

export type MoneyData = RoomData & {
	settings: Settings;
	purchases: Purchase[];
	payments: CardPayment[];
	dates: StatementDates[];
};

/**
 * Everything Home and the purchase lists page draw from, with a ledger per card (archived
 * cards included).
 *
 * Payments and kept statement dates come from storage; `migratePayments` has converted the
 * old per-statement records by the time any page asks.
 */
export async function loadMoneyData(
	repo: Repository,
	today: PlainDate,
): Promise<MoneyData> {
	const [cards, groups, settings, lists] = await Promise.all([
		repo.listCards(),
		repo.listLimitGroups(),
		repo.getSettings(),
		repo.listPurchaseLists(),
	]);
	const perCard = await Promise.all(
		cards.map(async (c) => ({
			purchases: await repo.listPurchases(c.id),
			payments: await repo.listCardPayments(c.id),
			dates: await repo.listStatementDates(c.id),
		})),
	);
	const purchases = perCard.flatMap((p) => p.purchases);
	const payments = perCard.flatMap((p) => p.payments);
	const dates = perCard.flatMap((p) => p.dates);

	return {
		cards,
		groups,
		settings,
		lists,
		purchases,
		payments,
		dates,
		ledgers: ledgersFor(cards, purchases, payments, dates, today),
	};
}
