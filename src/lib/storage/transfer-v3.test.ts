import { describe, expect, test } from "bun:test";
import { MessageError } from "#lib/i18n/error";
import {
	sampleCard,
	sampleCardPayment,
	sampleLimitGroup,
	sampleLocation,
	samplePayment,
	samplePurchase,
	samplePurchaseList,
	sampleStatementDates,
} from "#lib/storage/contract";
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments";
import { InMemoryRepository } from "#lib/storage/repository";
import {
	BACKUP_V3,
	type BackupV3,
	countRecordsV3,
	exportBackupV3,
	importBackupV3,
	parseAnyBackup,
	replaceWithBackupV3,
} from "#lib/storage/transfer-v3";

const NOW = new Date("2026-10-30T00:00:00.000Z");

const captureThrow = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (failure) {
		return failure;
	}
	throw new Error("expected function to throw");
};

const v3 = (patch: Record<string, unknown> = {}): string =>
	JSON.stringify({
		version: 3,
		exportedAt: NOW.toISOString(),
		limitGroups: [sampleLimitGroup()],
		cards: [sampleCard()],
		purchases: [samplePurchase()],
		payments: [sampleCardPayment()],
		statementDates: [sampleStatementDates()],
		lists: [samplePurchaseList()],
		locations: [sampleLocation()],
		...patch,
	});

const v2 = (patch: Record<string, unknown> = {}): string =>
	JSON.stringify({
		version: 2,
		exportedAt: NOW.toISOString(),
		limitGroups: [sampleLimitGroup()],
		cards: [sampleCard()],
		purchases: [samplePurchase()],
		payments: [samplePayment()],
		...patch,
	});

const rejects = (text: string, key: string, index?: number): void => {
	const failure = captureThrow(() => parseAnyBackup(text));
	expect(failure).toBeInstanceOf(MessageError);
	const error = failure as MessageError;
	expect(error.key).toBe(key as never);
	if (index !== undefined)
		expect(Reflect.get(error.params ?? {}, "index")).toBe(index);
};

const cycleCard = (cycle: unknown) =>
	v3({ cards: [sampleCard({ cycle: cycle as never })] });

describe("backup version 3", () => {
	test("round trip keeps every record", async () => {
		const repo = new InMemoryRepository();
		await importBackupV3(repo, parseAnyBackup(v3()));
		const out = await exportBackupV3(repo, NOW);
		expect(out.version).toBe(BACKUP_V3);
		expect(out.exportedAt).toBe(NOW.toISOString());
		expect(out.limitGroups).toEqual([sampleLimitGroup()]);
		expect(out.cards).toEqual([sampleCard()]);
		expect(out.purchases).toEqual([samplePurchase()]);
		expect(out.payments).toEqual([sampleCardPayment()]);
		expect(out.statementDates).toEqual([sampleStatementDates()]);
		expect(out.lists).toEqual([samplePurchaseList()]);
		expect(out.locations).toEqual([sampleLocation()]);

		const again = new InMemoryRepository();
		await importBackupV3(again, parseAnyBackup(JSON.stringify(out)));
		expect(await exportBackupV3(again, NOW)).toEqual(out);
	});

	test("a payment's note survives export and import; a payment without one stays without", async () => {
		const noted = sampleCardPayment({ id: "n1", note: "From savings" });
		const plain = sampleCardPayment({ id: "n2" });
		const repo = new InMemoryRepository();
		await importBackupV3(
			repo,
			parseAnyBackup(v3({ payments: [noted, plain] })),
		);
		const out = await exportBackupV3(repo, NOW);
		const byId = new Map(out.payments.map((p) => [p.id, p]));
		expect(byId.get("n1")?.note).toBe("From savings");
		expect(byId.get("n2") && "note" in byId.get("n2")!).toBe(false);
		const again = new InMemoryRepository();
		await importBackupV3(again, parseAnyBackup(JSON.stringify(out)));
		expect(await exportBackupV3(again, NOW)).toEqual(out);
	});

	test("a version 2 file converts", () => {
		const parsed: BackupV3 = parseAnyBackup(v2());
		expect(parsed.version).toBe(3);
		expect(parsed.lists).toEqual([]);
		expect(parsed.payments.length).toBe(1);
		expect(parsed.payments[0]?.status).toBe("paid");
		expect(parsed.payments[0]?.id).toBe("m:kbank:2026-09:0");
		expect(parsed.statementDates).toEqual([
			{
				cardId: "kbank",
				period: "2026-09",
				closeDate: "2026-09-18",
				dueDate: "2026-10-03",
			},
		]);
		// No settings: stored locations are left alone (DC-05).
		expect(parsed.locations).toEqual([]);
	});

	test("restoring a version 2 file without settings keeps stored locations", async () => {
		const repo = new InMemoryRepository();
		await repo.saveLocation(
			sampleLocation({ id: "krabi", takesPurchases: false }),
		);
		await repo.saveLocation(
			sampleLocation({ id: "bangkok", takesPurchases: true }),
		);
		const before = await repo.listLocations();
		await importBackupV3(repo, parseAnyBackup(v2()));
		expect(await repo.listLocations()).toEqual(before);
	});

	test("a version 2 file with settings takes its locations from them", () => {
		const parsed = parseAnyBackup(
			v2({ settings: { purchaseLocations: ["bangkok", "phichit"] } }),
		);
		expect(parsed.locations.map((l) => l.takesPurchases)).toEqual([
			true,
			true,
			false,
		]);
	});

	test("a version 2 file converts payments with parts", () => {
		const parsed = parseAnyBackup(
			v2({
				payments: [
					samplePayment({
						parts: [
							{ paidAt: "2026-10-01", amount: 4_000 },
							{ paidAt: "2026-10-02", amount: 6_000 },
						],
					}),
				],
			}),
		);
		expect(parsed.payments.map((p) => p.amount)).toEqual([4_000, 6_000]);
	});

	test("export reads default locations from settings while none are stored", async () => {
		const repo = new InMemoryRepository();
		await repo.saveSettings({ purchaseLocations: ["bangkok"] });
		const out = await exportBackupV3(repo, NOW);
		expect(out.locations.map((l) => [l.id, l.takesPurchases])).toEqual([
			["bangkok", true],
			["phichit", false],
			["krabi", false],
		]);
	});

	test("export takes takesPurchases from settings, not stale stored records", async () => {
		const repo = new InMemoryRepository();
		await repo.saveLocation(
			sampleLocation({ id: "krabi", takesPurchases: true }),
		);
		await repo.saveLocation(
			sampleLocation({ id: "bangkok", takesPurchases: false }),
		);
		await repo.saveSettings({ purchaseLocations: ["bangkok"] });
		const out = await exportBackupV3(repo, NOW);
		expect(out.locations.map((l) => [l.id, l.takesPurchases]).sort()).toEqual([
			["bangkok", true],
			["krabi", false],
		]);
	});

	test("a file whose places take no purchases restores an empty list", async () => {
		const repo = new InMemoryRepository();
		await repo.saveSettings({ purchaseLocations: ["bangkok"] });
		await importBackupV3(
			repo,
			parseAnyBackup(
				v3({
					locations: [
						sampleLocation({ id: "krabi", takesPurchases: false }),
						sampleLocation({ id: "chiang-mai", takesPurchases: true }),
					],
				}),
			),
		);
		expect((await repo.getSettings()).purchaseLocations).toEqual([]);
		const out = await exportBackupV3(repo, NOW);
		expect(out.locations.every((l) => !l.takesPurchases)).toBe(true);
		const again = new InMemoryRepository();
		await importBackupV3(again, parseAnyBackup(JSON.stringify(out)));
		expect((await again.getSettings()).purchaseLocations).toEqual([]);
	});

	test("a version 2 file with settings sets the purchase places on restore", async () => {
		const repo = new InMemoryRepository();
		await importBackupV3(
			repo,
			parseAnyBackup(v2({ settings: { purchaseLocations: ["phichit"] } })),
		);
		expect((await repo.getSettings()).purchaseLocations).toEqual(["phichit"]);
	});

	test("purchase places skip locations that are unknown or take no purchases", async () => {
		const repo = new InMemoryRepository();
		await importBackupV3(
			repo,
			parseAnyBackup(
				v3({
					locations: [
						sampleLocation({ id: "krabi", takesPurchases: false }),
						sampleLocation({ id: "bangkok", takesPurchases: true }),
						sampleLocation({ id: "chiang-mai", takesPurchases: true }),
					],
				}),
			),
		);
		expect((await repo.getSettings()).purchaseLocations).toEqual(["bangkok"]);
	});

	test("restoring a version 2 file over converted data leaves no stale m: parts", async () => {
		const repo = new InMemoryRepository();
		await repo.saveCard(sampleCard());
		for (const index of [0, 1, 2])
			await repo.saveCardPayment(
				sampleCardPayment({
					id: `m:kbank:2026-09:${index}`,
					period: "2026-09",
				}),
			);
		await repo.saveCardPayment(sampleCardPayment({ id: "keep" }));
		await importBackupV3(repo, parseAnyBackup(v2()));
		const ids = (await repo.listCardPayments("kbank")).map((p) => p.id).sort();
		expect(ids).toEqual(["keep", "m:kbank:2026-09:0"]);
	});

	test("replace sets the payments marker so startup does not convert again", async () => {
		const repo = new InMemoryRepository();
		await repo.saveCard(sampleCard({ id: "old" }));
		const items = new Map<string, string>();
		await replaceWithBackupV3(repo, parseAnyBackup(v3()), {
			setItem: (key, value) => void items.set(key, value),
		});
		expect(items.get(PAYMENTS_MIGRATION_KEY)).toBe("done");
		expect((await repo.listCards()).map((c) => c.id)).toEqual(["kbank"]);
	});

	test("counts include lists", async () => {
		const repo = new InMemoryRepository();
		await importBackupV3(repo, parseAnyBackup(v3()));
		expect(await countRecordsV3(repo)).toEqual({
			cards: 1,
			purchases: 1,
			payments: 1,
			limitGroups: 1,
			lists: 1,
		});
	});

	test("a version 1 file is rejected", () => {
		rejects(JSON.stringify({ version: 1 }), "backup.version");
		rejects(v3({ version: 4 }), "backup.version");
	});

	test("an unreadable file is rejected", () => {
		rejects("not json", "backup.unreadable");
		rejects(v3({ locations: undefined }), "backup.unreadable");
	});

	const bad: [string, string, string][] = [
		[
			"a zero purchase",
			v3({ purchases: [samplePurchase({ amount: 0 })] }),
			"backup.purchase",
		],
		[
			"a negative purchase",
			v3({ purchases: [samplePurchase({ amount: -5 })] }),
			"backup.purchase",
		],
		[
			"a zero limit",
			v3({ limitGroups: [sampleLimitGroup({ limit: 0 })] }),
			"backup.limitGroup",
		],
		[
			"a zero payment amount",
			v3({ payments: [sampleCardPayment({ amount: 0 })] }),
			"backup.cardPayment",
		],
		[
			"a fractional payment amount",
			v3({ payments: [sampleCardPayment({ amount: 1.5 })] }),
			"backup.cardPayment",
		],
		[
			"a bad payment status",
			v3({ payments: [sampleCardPayment({ status: "late" as never })] }),
			"backup.cardPayment",
		],
		[
			"a payment note that is not text",
			v3({ payments: [sampleCardPayment({ note: 12 as never })] }),
			"backup.cardPayment",
		],
		[
			"a three digit last4",
			v3({ cards: [sampleCard({ last4: "123" })] }),
			"backup.card",
		],
		[
			"a letter in last4",
			v3({ cards: [sampleCard({ last4: "12a4" })] }),
			"backup.card",
		],
		[
			"close day 0",
			cycleCard({ kind: "offset", closeDay: 0, dueOffsetDays: 15 }),
			"backup.card",
		],
		[
			"close day 32",
			cycleCard({ kind: "fixed", closeDay: 32, dueDay: 5 }),
			"backup.card",
		],
		[
			"due day 0",
			cycleCard({ kind: "fixed", closeDay: 5, dueDay: 0 }),
			"backup.card",
		],
		[
			"days until due 61",
			cycleCard({ kind: "offset", closeDay: 5, dueOffsetDays: 61 }),
			"backup.card",
		],
		[
			"days until due 0",
			cycleCard({ kind: "offset", closeDay: 5, dueOffsetDays: 0 }),
			"backup.card",
		],
		[
			"a zero list line",
			v3({
				lists: [
					samplePurchaseList({ lines: [{ cardId: "kbank", amount: 0 }] }),
				],
			}),
			"backup.list",
		],
		[
			"a bad list status",
			v3({ lists: [samplePurchaseList({ status: "done" as never })] }),
			"backup.list",
		],
		[
			"a bad location record",
			v3({ locations: [{ id: "x", name: "X" }] }),
			"backup.location",
		],
		[
			"bad statement dates",
			v3({ statementDates: [sampleStatementDates({ dueDate: "nope" })] }),
			"backup.statementDates",
		],
		[
			"a v2 zero purchase",
			v2({ purchases: [samplePurchase({ amount: 0 })] }),
			"backup.purchase",
		],
		[
			"a v2 bad last4",
			v2({ cards: [sampleCard({ last4: "12" })] }),
			"backup.card",
		],
	];
	for (const [name, text, key] of bad) {
		test(`rejects ${name}, naming the record`, () => {
			rejects(text, key, 1);
		});
	}

	const badLines: [string, Record<string, unknown>, string][] = [
		["a zero actual", { actual: 0 }, "backup.problem.badLineActual"],
		["a negative actual", { actual: -100 }, "backup.problem.badLineActual"],
		["a fractional actual", { actual: 1.5 }, "backup.problem.badLineActual"],
		["a text actual", { actual: "100" }, "backup.problem.badLineActual"],
		["a text made", { made: "yes" }, "backup.problem.badLineMade"],
		["a numeric made", { made: 1 }, "backup.problem.badLineMade"],
		["a numeric note", { note: 5 }, "backup.problem.badNote"],
		["a null note", { note: null }, "backup.problem.badNote"],
	];
	for (const [name, patch, problem] of badLines) {
		test(`rejects a list line with ${name}, naming the problem`, () => {
			const text = v3({
				lists: [
					samplePurchaseList({
						lines: [{ cardId: "kbank", amount: 1_000, ...patch } as never],
					}),
				],
			});
			rejects(text, "backup.list", 1);
			const error = captureThrow(() => parseAnyBackup(text)) as MessageError;
			expect(Reflect.get(error.params ?? {}, "problem")).toBe(problem);
		});
	}

	test("accepts list lines with a positive actual and a boolean made", () => {
		const lines = [
			{ cardId: "kbank", amount: 1_000, made: true, actual: 900 },
			{ cardId: "kbank", amount: 2_000, made: false, note: "next week" },
			{ cardId: "kbank", amount: 3_000, note: "" },
		];
		const parsed = parseAnyBackup(
			v3({ lists: [samplePurchaseList({ lines })] }),
		);
		expect(parsed.lists[0]?.lines).toEqual(lines);
	});

	test("the rejection names which record is wrong", () => {
		rejects(
			v3({
				purchases: [samplePurchase(), samplePurchase({ id: "p2", amount: 0 })],
			}),
			"backup.purchase",
			2,
		);
	});

	test("nothing is written when a later record is bad", async () => {
		const repo = new InMemoryRepository();
		const text = v3({
			lists: [samplePurchaseList({ status: "done" as never })],
		});
		expect(() => importBackupV3(repo, parseAnyBackup(text))).toThrow(
			MessageError,
		);
		const out = await exportBackupV3(repo, NOW);
		expect(out.cards).toEqual([]);
		expect(await repo.listLocations()).toEqual([]);
		expect(out.limitGroups).toEqual([]);
	});
});
