import { beforeEach, describe, expect, test } from "bun:test";
import type { Location } from "#lib/domain/location";
import { DEFAULT_SETTINGS } from "#lib/domain/settings";
import type {
	Card,
	CardPayment,
	LimitGroup,
	LocationRecord,
	Purchase,
	PurchaseList,
	StatementDates,
	StatementPayment,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import type { Repository } from "#lib/storage/repository";

export const sampleCard = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	supplementary: false,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});

export const samplePurchase = (
	overrides: Partial<Purchase> = {},
): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-09-05",
	amount: 10_000,
	note: "fuel",
	...overrides,
});

export const samplePayment = (
	overrides: Partial<StatementPayment> = {},
): StatementPayment => ({
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-10-01",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	...overrides,
});

export const sampleLimitGroup = (
	overrides: Partial<LimitGroup> = {},
): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	owner: "KC",
	...overrides,
});

export const sampleCardPayment = (
	overrides: Partial<CardPayment> = {},
): CardPayment => ({
	id: "cp1",
	cardId: "kbank",
	date: "2026-10-01",
	amount: 5_000,
	status: "paid",
	...overrides,
});

export const sampleStatementDates = (
	overrides: Partial<StatementDates> = {},
): StatementDates => ({
	cardId: "kbank",
	period: "2026-09",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	...overrides,
});

export const samplePurchaseList = (
	overrides: Partial<PurchaseList> = {},
): PurchaseList => ({
	id: "l1",
	date: "2026-10-05",
	status: "draft",
	lines: [{ cardId: "kbank", amount: 10_000 }],
	...overrides,
});

export const sampleLocation = (
	overrides: Partial<LocationRecord> = {},
): LocationRecord => ({
	id: "krabi",
	name: "Krabi",
	takesPurchases: true,
	...overrides,
});

const guardKey = async (action: Promise<unknown>): Promise<string | null> => {
	try {
		await action;
		return null;
	} catch (error) {
		return error instanceof MessageError ? error.key : "other";
	}
};

/** Runs the behaviour every Repository implementation must have. */
export function repositoryContract(
	name: string,
	create: () => Repository,
): void {
	describe(`${name} repository contract`, () => {
		let repo: Repository;

		beforeEach(() => {
			repo = create();
		});

		test("returns nothing before anything is saved", async () => {
			expect(await repo.listCards()).toEqual([]);
			expect(await repo.getCard("kbank")).toBeNull();
			expect(await repo.listPurchases("kbank")).toEqual([]);
			expect(await repo.listPayments("kbank")).toEqual([]);
		});

		test("saves and reads a card back whole", async () => {
			const card = sampleCard({ comment: "company car fuel" });
			await repo.saveCard(card);
			expect(await repo.getCard("kbank")).toEqual(card);
			expect(await repo.listCards()).toEqual([card]);
		});

		test("saving the same id replaces the card", async () => {
			await repo.saveCard(sampleCard());
			await repo.saveCard(sampleCard({ location: "bangkok" }));
			const cards = await repo.listCards();
			expect(cards).toHaveLength(1);
			expect(cards[0]?.location).toBe("bangkok");
		});

		test("stores both cycle rule kinds", async () => {
			await repo.saveCard(
				sampleCard({
					id: "scb",
					cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
				}),
			);
			expect((await repo.getCard("scb"))?.cycle).toEqual({
				kind: "fixed",
				closeDay: 18,
				dueDay: 5,
			});
		});

		test("deletes a card", async () => {
			await repo.saveCard(sampleCard());
			await repo.deleteCard("kbank");
			expect(await repo.getCard("kbank")).toBeNull();
		});

		test("deleting a card removes its payments once its purchases are gone", async () => {
			// Save first card with purchase and payment
			await repo.saveCard(sampleCard({ id: "kbank" }));
			await repo.savePurchase(samplePurchase({ id: "p1", cardId: "kbank" }));
			await repo.savePayment(
				samplePayment({ cardId: "kbank", period: "2026-09" }),
			);

			// Save second card with purchase and payment
			await repo.saveCard(sampleCard({ id: "scb" }));
			await repo.savePurchase(samplePurchase({ id: "p2", cardId: "scb" }));
			await repo.savePayment(
				samplePayment({ cardId: "scb", period: "2026-09" }),
			);

			// A card with purchases cannot be deleted (RD-07); remove them first
			await repo.deletePurchase("kbank", "p1");
			await repo.deleteCard("kbank");

			// Verify first card's records are gone
			expect(await repo.getCard("kbank")).toBeNull();
			expect(await repo.listPayments("kbank")).toEqual([]);

			// Verify second card's records remain untouched
			expect(await repo.listPurchases("scb")).toHaveLength(1);
			expect((await repo.listPurchases("scb"))[0]?.id).toBe("p2");
			expect(await repo.listPayments("scb")).toHaveLength(1);
		});

		test("cascade delete does not affect cards whose id is a prefix", async () => {
			// Create cards abc and abc:def to test prefix collision vulnerability
			await repo.saveCard(sampleCard({ id: "abc" }));
			await repo.savePurchase(samplePurchase({ id: "p1", cardId: "abc" }));
			await repo.savePayment(
				samplePayment({ cardId: "abc", period: "2026-09" }),
			);

			await repo.saveCard(sampleCard({ id: "abc:def" }));
			await repo.savePurchase(samplePurchase({ id: "p2", cardId: "abc:def" }));
			await repo.savePayment(
				samplePayment({ cardId: "abc:def", period: "2026-09" }),
			);

			// Delete the shorter-id card (purchases first, RD-07)
			await repo.deletePurchase("abc", "p1");
			await repo.deleteCard("abc");

			// Verify abc's records are gone
			expect(await repo.getCard("abc")).toBeNull();
			expect(await repo.listPayments("abc")).toEqual([]);

			// Verify abc:def's records are intact
			expect(await repo.listPurchases("abc:def")).toHaveLength(1);
			expect((await repo.listPurchases("abc:def"))[0]?.id).toBe("p2");
			expect(await repo.listPayments("abc:def")).toHaveLength(1);
		});

		test("lists cards sorted by id in ascending order", async () => {
			await repo.saveCard(sampleCard({ id: "scb" }));
			await repo.saveCard(sampleCard());
			const cards = await repo.listCards();
			expect(cards).toHaveLength(2);
			expect(cards[0]?.id).toBe("kbank");
			expect(cards[1]?.id).toBe("scb");
		});

		test("lists purchases of one card only, sorted by date", async () => {
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-20" }));
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
			await repo.savePurchase(
				samplePurchase({ id: "p3", cardId: "scb", date: "2026-09-06" }),
			);

			expect((await repo.listPurchases("kbank")).map((p) => p.id)).toEqual([
				"p1",
				"p2",
			]);
		});

		test("limits purchases to a date range, inclusive at both ends", async () => {
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-08-31" }));
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-01" }));
			await repo.savePurchase(samplePurchase({ id: "p3", date: "2026-09-30" }));
			await repo.savePurchase(samplePurchase({ id: "p4", date: "2026-10-01" }));

			const inRange = await repo.listPurchases(
				"kbank",
				"2026-09-01",
				"2026-09-30",
			);
			expect(inRange.map((p) => p.id)).toEqual(["p2", "p3"]);
		});

		test("saving the same purchase id replaces it", async () => {
			await repo.savePurchase(samplePurchase({ amount: 10_000 }));
			await repo.savePurchase(samplePurchase({ amount: 25_000 }));
			const purchases = await repo.listPurchases("kbank");
			expect(purchases).toHaveLength(1);
			expect(purchases[0]?.amount).toBe(25_000);
		});

		test("saves and lists purchases independently per card", async () => {
			await repo.savePurchase(samplePurchase({ id: "p1", cardId: "kbank" }));
			await repo.savePurchase(
				samplePurchase({ id: "p1", cardId: "scb", date: "2026-09-09" }),
			);

			const kbankPurchases = await repo.listPurchases("kbank");
			const scbPurchases = await repo.listPurchases("scb");

			expect(kbankPurchases).toHaveLength(1);
			expect(kbankPurchases[0]?.date).toBe("2026-09-05");

			expect(scbPurchases).toHaveLength(1);
			expect(scbPurchases[0]?.date).toBe("2026-09-09");
		});

		test("deletes a purchase", async () => {
			await repo.savePurchase(samplePurchase());
			await repo.deletePurchase("kbank", "p1");
			expect(await repo.listPurchases("kbank")).toEqual([]);
		});

		test("saves, lists, and deletes payments per card", async () => {
			await repo.savePayment(samplePayment({ period: "2026-09" }));
			await repo.savePayment(samplePayment({ period: "2026-08" }));
			await repo.savePayment(
				samplePayment({ cardId: "scb", period: "2026-09" }),
			);

			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual([
				"2026-08",
				"2026-09",
			]);

			await repo.deletePayment("kbank", "2026-08");
			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual([
				"2026-09",
			]);
		});

		test("deleting something absent is not an error", async () => {
			await repo.deleteCard("nope");
			await repo.deletePurchase("nope", "nope");
			await repo.deletePayment("nope", "2026-01");
		});

		test("returned objects are copies, not live references", async () => {
			await repo.saveCard(sampleCard());
			const card = await repo.getCard("kbank");
			if (card) card.name = "mutated";
			expect((await repo.getCard("kbank"))?.name).toBe("KBank Visa");
		});

		test("saving a purchase with the same id but different date replaces it, not appends", async () => {
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
			// Save the same purchase id with a different date WITHOUT deleting first.
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-25" }));

			const purchases = await repo.listPurchases("kbank");
			expect(purchases).toHaveLength(1);
			expect(purchases[0]?.date).toBe("2026-09-25");
		});

		test("returns no limit groups before anything is saved", async () => {
			expect(await repo.listLimitGroups()).toEqual([]);
		});

		test("saves and reads a limit group back whole", async () => {
			const group = sampleLimitGroup();
			await repo.saveLimitGroup(group);
			expect(await repo.listLimitGroups()).toEqual([group]);
		});

		test("saving the same limit group id replaces it", async () => {
			await repo.saveLimitGroup(sampleLimitGroup());
			await repo.saveLimitGroup(sampleLimitGroup({ limit: 750_000 }));
			const groups = await repo.listLimitGroups();
			expect(groups).toHaveLength(1);
			expect(groups[0]?.limit).toBe(750_000);
		});

		test("lists limit groups sorted by id", async () => {
			await repo.saveLimitGroup(sampleLimitGroup({ id: "scb" }));
			await repo.saveLimitGroup(sampleLimitGroup({ id: "kbank" }));
			expect((await repo.listLimitGroups()).map((g) => g.id)).toEqual([
				"kbank",
				"scb",
			]);
		});

		test("deletes a limit group, and deleting an absent one is not an error", async () => {
			await repo.saveLimitGroup(sampleLimitGroup());
			await repo.deleteLimitGroup("pool");
			await repo.deleteLimitGroup("pool");
			expect(await repo.listLimitGroups()).toEqual([]);
		});

		test("deleting a card leaves its limit group alone", async () => {
			await repo.saveLimitGroup(sampleLimitGroup());
			await repo.saveCard(sampleCard({ limitGroupId: "pool" }));
			await repo.deleteCard("kbank");
			expect(await repo.listLimitGroups()).toHaveLength(1);
		});

		test("returned limit groups are copies, not live references", async () => {
			await repo.saveLimitGroup(sampleLimitGroup());
			const [group] = await repo.listLimitGroups();
			if (group) group.name = "mutated";
			expect((await repo.listLimitGroups())[0]?.name).toBe("KBank account");
		});

		test("reads the default settings before anything is saved", async () => {
			expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
		});

		test("saves and reads settings back whole", async () => {
			const settings = {
				purchaseLocations: ["bangkok", "krabi"] as Location[],
			};
			await repo.saveSettings(settings);
			expect(await repo.getSettings()).toEqual(settings);
		});

		test("saving settings replaces them rather than merging", async () => {
			await repo.saveSettings({ purchaseLocations: ["bangkok"] });
			await repo.saveSettings({ purchaseLocations: ["phichit"] });
			expect(await repo.getSettings()).toEqual({
				purchaseLocations: ["phichit"],
			});
		});

		test("an empty list of purchase locations survives a round trip", async () => {
			await repo.saveSettings({ purchaseLocations: [] });
			expect(await repo.getSettings()).toEqual({ purchaseLocations: [] });
		});

		test("the default settings handed out are a copy, not the shared constant", async () => {
			const settings = await repo.getSettings();
			settings.purchaseLocations.push("bangkok");
			expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
			expect(DEFAULT_SETTINGS.purchaseLocations).toEqual(["krabi"]);
		});

		test("returned settings are copies, not live references", async () => {
			await repo.saveSettings({ purchaseLocations: ["krabi"] });
			const settings = await repo.getSettings();
			settings.purchaseLocations.push("bangkok");
			expect(await repo.getSettings()).toEqual({
				purchaseLocations: ["krabi"],
			});
		});

		test("clearing forgets every record and setting", async () => {
			await repo.saveCard(sampleCard());
			await repo.savePurchase(samplePurchase());
			await repo.savePayment(samplePayment());
			await repo.saveLimitGroup(sampleLimitGroup());
			await repo.saveSettings({ purchaseLocations: [] });

			await repo.clearAll();

			expect(await repo.listCards()).toEqual([]);
			expect(await repo.listPurchases("kbank")).toEqual([]);
			expect(await repo.listPayments("kbank")).toEqual([]);
			expect(await repo.listLimitGroups()).toEqual([]);
			expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
		});

		test("stays usable after it is cleared", async () => {
			await repo.saveCard(sampleCard());
			await repo.clearAll();
			await repo.saveCard(sampleCard({ id: "scb" }));
			expect((await repo.listCards()).map((card) => card.id)).toEqual(["scb"]);
		});

		test("keeps a purchase's entry time, through an edit too", async () => {
			const entered = samplePurchase({ addedAt: "2026-10-27T03:00:00.000Z" });
			await repo.savePurchase(entered);
			expect(await repo.listPurchases("kbank")).toEqual([entered]);

			const edited = { ...entered, date: "2026-09-07", amount: 20_000 };
			await repo.savePurchase(edited);
			expect(await repo.listPurchases("kbank")).toEqual([edited]);
		});

		test("card payments: save, replace, list one card only by date then id, delete", async () => {
			await repo.saveCardPayment(
				sampleCardPayment({ id: "b", date: "2026-10-02" }),
			);
			await repo.saveCardPayment(
				sampleCardPayment({ id: "c", date: "2026-10-01" }),
			);
			await repo.saveCardPayment(
				sampleCardPayment({ id: "a", date: "2026-10-02" }),
			);
			await repo.saveCardPayment(sampleCardPayment({ id: "z", cardId: "scb" }));
			expect((await repo.listCardPayments("kbank")).map((p) => p.id)).toEqual([
				"c",
				"a",
				"b",
			]);
			const edited = sampleCardPayment({
				id: "a",
				date: "2026-10-02",
				amount: 9,
				period: "2026-09",
			});
			await repo.saveCardPayment(edited);
			expect((await repo.listCardPayments("kbank"))[1]).toEqual(edited);
			await repo.deleteCardPayment("kbank", "a");
			expect((await repo.listCardPayments("kbank")).map((p) => p.id)).toEqual([
				"c",
				"b",
			]);
			expect(await repo.listCardPayments("scb")).toHaveLength(1);
		});

		test("statement dates: save, list by period, delete", async () => {
			await repo.saveStatementDates(
				sampleStatementDates({ period: "2026-10" }),
			);
			await repo.saveStatementDates(
				sampleStatementDates({ period: "2026-09" }),
			);
			await repo.saveStatementDates(sampleStatementDates({ cardId: "scb" }));
			const dates = await repo.listStatementDates("kbank");
			expect(dates.map((d) => d.period)).toEqual(["2026-09", "2026-10"]);
			await repo.deleteStatementDates("kbank", "2026-09");
			expect(
				(await repo.listStatementDates("kbank")).map((d) => d.period),
			).toEqual(["2026-10"]);
			expect(await repo.listStatementDates("scb")).toHaveLength(1);
		});

		test("purchase lists: save, replace, list by date then id, delete", async () => {
			await repo.savePurchaseList(
				samplePurchaseList({ id: "b", date: "2026-10-06" }),
			);
			await repo.savePurchaseList(
				samplePurchaseList({ id: "c", date: "2026-10-05" }),
			);
			await repo.savePurchaseList(
				samplePurchaseList({ id: "a", date: "2026-10-06" }),
			);
			expect((await repo.listPurchaseLists()).map((l) => l.id)).toEqual([
				"c",
				"a",
				"b",
			]);
			const edited = samplePurchaseList({
				id: "a",
				date: "2026-10-06",
				status: "sent",
				sentAt: "2026-10-06T01:00:00.000Z",
			});
			await repo.savePurchaseList(edited);
			expect((await repo.listPurchaseLists())[1]).toEqual(edited);
			await repo.deletePurchaseList("a");
			expect((await repo.listPurchaseLists()).map((l) => l.id)).toEqual([
				"c",
				"b",
			]);
		});

		test("locations: save, replace, list by id, delete", async () => {
			await repo.saveLocation(sampleLocation({ id: "phuket", name: "Phuket" }));
			await repo.saveLocation(sampleLocation());
			expect((await repo.listLocations()).map((l) => l.id)).toEqual([
				"krabi",
				"phuket",
			]);
			const renamed = sampleLocation({
				name: "Krabi town",
				takesPurchases: false,
			});
			await repo.saveLocation(renamed);
			expect((await repo.listLocations())[0]).toEqual(renamed);
			await repo.deleteLocation("phuket");
			expect(await repo.listLocations()).toEqual([renamed]);
		});

		test("deleting a card removes its card payments and statement dates", async () => {
			await repo.saveCard(sampleCard({ id: "kbank" }));
			await repo.saveCard(sampleCard({ id: "scb" }));
			await repo.saveCardPayment(sampleCardPayment({ cardId: "kbank" }));
			await repo.saveStatementDates(sampleStatementDates({ cardId: "kbank" }));
			await repo.saveCardPayment(sampleCardPayment({ cardId: "scb" }));
			await repo.saveStatementDates(sampleStatementDates({ cardId: "scb" }));
			await repo.deleteCard("kbank");
			expect(await repo.listCardPayments("kbank")).toEqual([]);
			expect(await repo.listStatementDates("kbank")).toEqual([]);
			expect(await repo.listCardPayments("scb")).toHaveLength(1);
			expect(await repo.listStatementDates("scb")).toHaveLength(1);
		});

		test("cascade does not touch the new records of a card whose id is a prefix", async () => {
			await repo.saveCard(sampleCard({ id: "abc" }));
			await repo.saveCard(sampleCard({ id: "abc:def" }));
			await repo.saveCardPayment(sampleCardPayment({ cardId: "abc" }));
			await repo.saveStatementDates(sampleStatementDates({ cardId: "abc" }));
			await repo.saveCardPayment(
				sampleCardPayment({ id: "cp2", cardId: "abc:def" }),
			);
			await repo.saveStatementDates(
				sampleStatementDates({ cardId: "abc:def" }),
			);
			await repo.deleteCard("abc");
			expect(await repo.listCardPayments("abc")).toEqual([]);
			expect(await repo.listStatementDates("abc")).toEqual([]);
			expect(await repo.listCardPayments("abc:def")).toHaveLength(1);
			expect(await repo.listStatementDates("abc:def")).toHaveLength(1);
		});

		test("a card id containing ':' does not collide with another card's records", async () => {
			await repo.saveCard(sampleCard({ id: "a:b" }));
			await repo.saveCard(sampleCard({ id: "a" }));
			await repo.savePurchase(samplePurchase({ id: "c", cardId: "a:b" }));
			await repo.savePurchase(samplePurchase({ id: "b:c", cardId: "a" }));
			await repo.saveCardPayment(sampleCardPayment({ id: "c", cardId: "a:b" }));
			await repo.saveCardPayment(sampleCardPayment({ id: "b:c", cardId: "a" }));
			await repo.saveStatementDates(
				sampleStatementDates({ cardId: "a:b", period: "x" }),
			);
			await repo.saveStatementDates(
				sampleStatementDates({ cardId: "a", period: "b:x" }),
			);
			await repo.savePayment(samplePayment({ cardId: "a:b", period: "x" }));
			await repo.savePayment(samplePayment({ cardId: "a", period: "b:x" }));
			expect((await repo.listPurchases("a:b")).map((p) => p.id)).toEqual(["c"]);
			expect((await repo.listPurchases("a")).map((p) => p.id)).toEqual(["b:c"]);
			expect((await repo.listCardPayments("a:b")).map((p) => p.id)).toEqual([
				"c",
			]);
			expect((await repo.listCardPayments("a")).map((p) => p.id)).toEqual([
				"b:c",
			]);
			expect(
				(await repo.listStatementDates("a:b")).map((d) => d.period),
			).toEqual(["x"]);
			expect((await repo.listStatementDates("a")).map((d) => d.period)).toEqual(
				["b:x"],
			);
			expect((await repo.listPayments("a:b")).map((p) => p.period)).toEqual([
				"x",
			]);
			expect((await repo.listPayments("a")).map((p) => p.period)).toEqual([
				"b:x",
			]);
		});

		test("clearAll removes the new records", async () => {
			await repo.saveCardPayment(sampleCardPayment());
			await repo.saveStatementDates(sampleStatementDates());
			await repo.savePurchaseList(samplePurchaseList());
			await repo.saveLocation(sampleLocation());
			await repo.clearAll();
			expect(await repo.listCardPayments("kbank")).toEqual([]);
			expect(await repo.listStatementDates("kbank")).toEqual([]);
			expect(await repo.listPurchaseLists()).toEqual([]);
			expect(await repo.listLocations()).toEqual([]);
		});

		test("refuses to delete a card that has purchases", async () => {
			await repo.saveCard(sampleCard());
			await repo.savePurchase(samplePurchase());
			expect(await guardKey(repo.deleteCard("kbank"))).toBe(
				"guard.cardHasPurchases",
			);
			expect(await repo.getCard("kbank")).not.toBeNull();
			expect(await repo.listPurchases("kbank")).toHaveLength(1);
		});

		test("refuses to delete a limit group a card uses", async () => {
			await repo.saveLimitGroup(sampleLimitGroup());
			await repo.saveCard(sampleCard({ limitGroupId: "pool" }));
			expect(await guardKey(repo.deleteLimitGroup("pool"))).toBe(
				"guard.groupInUse",
			);
			expect(await repo.listLimitGroups()).toHaveLength(1);
			await repo.saveCard(sampleCard());
			await repo.deleteLimitGroup("pool");
			expect(await repo.listLimitGroups()).toEqual([]);
		});

		test("refuses to delete a location a card is kept in", async () => {
			await repo.saveLocation(sampleLocation());
			await repo.saveCard(sampleCard({ location: "krabi" }));
			expect(await guardKey(repo.deleteLocation("krabi"))).toBe(
				"guard.locationInUse",
			);
			expect(await repo.listLocations()).toHaveLength(1);
		});

		test("a location can be deleted once no card is kept there", async () => {
			await repo.saveLocation(sampleLocation());
			await repo.saveCard(sampleCard({ location: "krabi" }));
			await repo.saveCard(sampleCard({ location: "bangkok" }));
			await repo.deleteLocation("krabi");
			expect(await repo.listLocations()).toEqual([]);
		});
	});
}
