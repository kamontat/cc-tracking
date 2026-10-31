import type { RoomData } from "#lib/domain/home";
import { ledgersFor } from "#lib/domain/ledger";
import type { Settings } from "#lib/domain/settings";
import type { PlainDate, Purchase } from "#lib/domain/types";
import { convertPayments } from "#lib/storage/migrate-payments";
import type { Repository } from "#lib/storage/repository";

export type MoneyData = RoomData & {
	settings: Settings;
	purchases: Purchase[];
};

/**
 * Everything Home and the purchase lists page draw from, with a ledger per card (archived
 * cards included).
 *
 * The stored payments are still the old per-statement records, so they are converted in
 * memory and nothing is written back. Phase 4 replaces the conversion with
 * `listCardPayments` and `listStatementDates` once `migratePayments` runs at startup.
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
			old: await repo.listPayments(c.id),
		})),
	);
	const purchases = perCard.flatMap((p) => p.purchases);
	const old = perCard.flatMap((p) => p.old);
	const { payments, dates } = convertPayments(cards, purchases, old);

	return {
		cards,
		groups,
		settings,
		lists,
		purchases,
		ledgers: ledgersFor(cards, purchases, payments, dates, today),
	};
}
