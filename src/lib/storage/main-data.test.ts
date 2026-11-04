import { expect, test } from "bun:test";
import { toGroupColor } from "#lib/domain/group-color";
import { cardLedger } from "#lib/domain/ledger";
import type { Card, LimitGroup, Purchase } from "#lib/domain/types";
import { migrateGroupColors } from "#lib/storage/assign-group-colors";
import { memoryStorage } from "#lib/storage/contract";
import { LocalStorageRepository } from "#lib/storage/local";
import { migrateLocations } from "#lib/storage/migrate-locations";
import { migratePayments } from "#lib/storage/migrate-payments";
import { seedLocations } from "#lib/storage/seed-locations";
import fixture from "./fixtures/main-4876074.json";

/*
 * Data saved by the current version (main, 4876074) must load unchanged (PRD acceptance). The
 * fixture is localStorage exactly as main's LocalStorageRepository wrote it, with what main read
 * back: cards, groups, purchases and every statement's dates and amounts. Here it is opened the
 * way a page opens storage (`bootstrap`: seed and migrate locations, then migrate payments).
 */
/** JSON widens the owner and the cycle kind to strings; the file holds what main saved. */
const expected = fixture.expected as unknown as {
	cards: Card[];
	groups: LimitGroup[];
	purchases: Purchase[];
	statements: typeof fixture.expected.statements;
};

const open = async () => {
	const storage = memoryStorage();
	for (const [key, value] of Object.entries(fixture.storage))
		storage.setItem(key, value);
	const repo = new LocalStorageRepository(storage);
	await seedLocations(repo, storage);
	await migrateLocations(repo, storage);
	await migratePayments(repo, storage);
	await migrateGroupColors(repo, storage);
	return repo;
};

test("cards, limit groups and purchases saved by main read back unchanged", async () => {
	const repo = await open();
	expect(await repo.listCards()).toEqual(expected.cards);
	// Main stored no colour; the startup step adds one to each group, the first blue.
	const groups = await repo.listLimitGroups();
	expect(groups.every((g) => toGroupColor(g.color) !== null)).toBe(true);
	expect(groups[0]?.color).toBe("blue");
	expect(groups.map(({ color, ...rest }) => rest)).toEqual(expected.groups);
	const cards = await repo.listCards();
	const purchases = (
		await Promise.all(cards.map((c) => repo.listPurchases(c.id)))
	).flat();
	expect(purchases).toEqual(expected.purchases);
});

test("every statement main showed keeps its dates, total, paid and left amounts", async () => {
	const repo = await open();
	const seen = [];
	for (const card of await repo.listCards()) {
		const ledger = cardLedger(
			card,
			await repo.listPurchases(card.id),
			await repo.listCardPayments(card.id),
			await repo.listStatementDates(card.id),
			fixture.today,
		);
		for (const s of ledger.statements) {
			if (s.total === 0 && s.paidAmount === 0) continue;
			seen.push({
				cardId: s.cardId,
				period: s.period,
				closeDate: s.closeDate,
				dueDate: s.dueDate,
				total: s.total,
				paidAmount: s.paidAmount,
				remaining: s.remaining,
			});
		}
	}
	const byCardThenPeriod = (
		a: { cardId: string; period: string },
		b: { cardId: string; period: string },
	) => a.cardId.localeCompare(b.cardId) || a.period.localeCompare(b.period);
	expect(seen.sort(byCardThenPeriod)).toEqual(
		[...expected.statements].sort(byCardThenPeriod),
	);
});

test("the places main let take purchases still take them", async () => {
	const repo = await open();
	const takes = (await repo.listLocations())
		.filter((l) => l.takesPurchases)
		.map((l) => l.id)
		.sort();
	expect(takes).toEqual(["bangkok", "krabi"]);
});
