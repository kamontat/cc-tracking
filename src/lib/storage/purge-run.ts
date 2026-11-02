import { compareDates } from "#lib/domain/date";
import {
	type PurgeAge,
	type PurgePlan,
	planPurge,
	purgeCutoff,
} from "#lib/domain/purge";
import type { PlainDate } from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

/**
 * Plan what deleting old purchases would remove (RD-18). `older` counts every purchase dated
 * before `cutoff`, so a screen can say how many of them stay.
 */
export async function previewPurge(
	repo: Repository,
	age: PurgeAge,
	today: PlainDate,
): Promise<{ plan: PurgePlan; older: number; cutoff: PlainDate }> {
	const cutoff = purgeCutoff(age, today);
	const cards = await repo.listCards();
	const perCard = await Promise.all(
		cards.map(async (card) => ({
			purchases: await repo.listPurchases(card.id),
			payments: await repo.listCardPayments(card.id),
			frozen: await repo.listStatementDates(card.id),
		})),
	);
	const purchases = perCard.flatMap((c) => c.purchases);
	const plan = planPurge(
		cards,
		purchases,
		perCard.flatMap((c) => c.payments),
		perCard.flatMap((c) => c.frozen),
		await repo.listPurchaseLists(),
		cutoff,
		today,
	);
	const older = purchases.filter(
		(p) => compareDates(p.date, cutoff) < 0,
	).length;
	return { plan, older, cutoff };
}

/**
 * Write a plan to storage: delete its purchases, payments, saved lists and frozen statement
 * dates, and save the trimmed payments. A failure part-way leaves what was already written.
 */
export async function applyPurge(
	repo: Repository,
	plan: PurgePlan,
): Promise<void> {
	// A purchase knows its card, so the plan's bare ids are found in what is stored.
	const going = new Set(plan.purchaseIds);
	for (const card of await repo.listCards()) {
		for (const p of await repo.listPurchases(card.id)) {
			if (going.has(p.id)) await repo.deletePurchase(card.id, p.id);
		}
	}
	for (const p of plan.paymentIds) await repo.deleteCardPayment(p.cardId, p.id);
	for (const p of plan.trimmed) await repo.saveCardPayment(p);
	for (const id of plan.listIds) await repo.deletePurchaseList(id);
	for (const f of plan.frozenPeriods)
		await repo.deleteStatementDates(f.cardId, f.period);
}
