import type { LimitGroup } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { MessageError } from "#lib/i18n/error"
import {
	sampleCard,
	sampleCardPayment,
	sampleLimitGroup,
	sampleLocation,
	sampleOwner,
	samplePayment,
	samplePurchase,
	samplePurchaseList,
	sampleStatementDates,
} from "#lib/storage/contract"
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { seedOwners } from "#lib/storage/seed-owners"
import {
	BACKUP_V4,
	type BackupV4,
	countRecordsV4,
	exportBackupV4,
	importBackupV4,
	onlySeededDefaults,
	onlySeededOwners,
	parseAnyBackup,
	replaceWithBackupV4,
} from "#lib/storage/transfer-v4"

/** A limit group saved before the owner field existed. */
const ownerless = (): LimitGroup => {
	const { owner: _, ...group } = sampleLimitGroup()
	return group
}

const NOW = new Date("2026-10-30T00:00:00.000Z")

const captureThrow = (fn: () => unknown): unknown => {
	try {
		fn()
	} catch (failure) {
		return failure
	}
	throw new Error("expected function to throw")
}

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
	})

const v2 = (patch: Record<string, unknown> = {}): string =>
	JSON.stringify({
		version: 2,
		exportedAt: NOW.toISOString(),
		limitGroups: [sampleLimitGroup()],
		cards: [sampleCard()],
		purchases: [samplePurchase()],
		payments: [samplePayment()],
		...patch,
	})

const v4 = (patch: Record<string, unknown> = {}): string =>
	JSON.stringify({ ...JSON.parse(v3()), version: 4, owners: [sampleOwner()], ...patch })

const rejects = (text: string, key: string, index?: number): void => {
	const failure = captureThrow(() => parseAnyBackup(text))
	expect(failure).toBeInstanceOf(MessageError)
	const error = failure as MessageError
	expect(error.key).toBe(key as never)
	if (index !== undefined) expect(Reflect.get(error.params ?? {}, "index")).toBe(index)
}

const cycleCard = (cycle: unknown) => v3({ cards: [sampleCard({ cycle: cycle as never })] })

describe("backup version 3", () => {
	test("round trip keeps every record", async () => {
		const repo = new InMemoryRepository()
		await importBackupV4(repo, parseAnyBackup(v3()))
		const out = await exportBackupV4(repo, NOW)
		expect(out.version).toBe(BACKUP_V4)
		expect(out.exportedAt).toBe(NOW.toISOString())
		expect(out.limitGroups).toEqual([sampleLimitGroup({ color: "blue" })])
		expect(out.cards).toEqual([sampleCard()])
		expect(out.purchases).toEqual([samplePurchase()])
		expect(out.payments).toEqual([sampleCardPayment()])
		expect(out.statementDates).toEqual([sampleStatementDates()])
		expect(out.lists).toEqual([samplePurchaseList()])
		expect(out.locations).toEqual([sampleLocation()])

		const again = new InMemoryRepository()
		await importBackupV4(again, parseAnyBackup(JSON.stringify(out)))
		expect(await exportBackupV4(again, NOW)).toEqual(out)
	})

	test("a payment's note survives export and import; a payment without one stays without", async () => {
		const noted = sampleCardPayment({ id: "n1", note: "From savings" })
		const plain = sampleCardPayment({ id: "n2" })
		const repo = new InMemoryRepository()
		await importBackupV4(repo, parseAnyBackup(v3({ payments: [noted, plain] })))
		const out = await exportBackupV4(repo, NOW)
		const byId = new Map(out.payments.map((p) => [p.id, p]))
		expect(byId.get("n1")?.note).toBe("From savings")
		expect(byId.get("n2")).toBeDefined()
		expect(byId.get("n2")).not.toHaveProperty("note")
		const again = new InMemoryRepository()
		await importBackupV4(again, parseAnyBackup(JSON.stringify(out)))
		expect(await exportBackupV4(again, NOW)).toEqual(out)
	})

	test("notes are trimmed on import, and a blank note is dropped (DC-07)", () => {
		const parsed = parseAnyBackup(
			v3({
				payments: [
					sampleCardPayment({ id: "n1", note: "  From savings  " }),
					sampleCardPayment({ id: "n2", note: "   " }),
				],
				lists: [
					samplePurchaseList({
						lines: [
							{ cardId: "k1", amount: 100, note: " gas " },
							{ cardId: "k1", amount: 200, note: "  " },
						],
					}),
				],
			}),
		)
		const [noted, blank] = parsed.payments
		expect(noted?.note).toBe("From savings")
		expect(blank && "note" in blank).toBe(false)
		const [gas, empty] = parsed.lists[0]?.lines ?? []
		expect(gas?.note).toBe("gas")
		expect(empty && "note" in empty).toBe(false)
	})

	test("a version 2 file converts", () => {
		const parsed: BackupV4 = parseAnyBackup(v2())
		expect(parsed.version).toBe(4)
		expect(parsed.lists).toEqual([])
		expect(parsed.payments.length).toBe(1)
		expect(parsed.payments[0]?.status).toBe("paid")
		expect(parsed.payments[0]?.id).toBe("m:k1:2026-09:0")
		expect(parsed.statementDates).toEqual([
			{
				cardId: "k1",
				period: "2026-09",
				closeDate: "2026-09-18",
				dueDate: "2026-10-03",
			},
		])
		// No settings: stored locations are left alone (DC-05).
		expect(parsed.locations).toEqual([])
	})

	test("restoring a version 2 file without settings keeps stored locations", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLocation(sampleLocation({ id: "krabi", takesPurchases: false }))
		await repo.saveLocation(sampleLocation({ id: "bangkok", takesPurchases: true }))
		const before = await repo.listLocations()
		await importBackupV4(repo, parseAnyBackup(v2()))
		expect(await repo.listLocations()).toEqual(before)
	})

	test("a version 2 file with settings takes its locations from them", () => {
		const parsed = parseAnyBackup(v2({ settings: { purchaseLocations: ["bangkok", "phichit"] } }))
		expect(parsed.locations.map((l) => l.takesPurchases)).toEqual([true, true, false])
	})

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
		)
		expect(parsed.payments.map((p) => p.amount)).toEqual([4_000, 6_000])
	})

	test("export writes the location records as stored, renames and ticks included", async () => {
		const repo = new InMemoryRepository()
		await repo.saveSettings({ purchaseLocations: ["bangkok"] })
		await repo.saveLocation(sampleLocation({ id: "krabi", name: "Ao Nang", takesPurchases: true }))
		await repo.saveLocation(sampleLocation({ id: "bangkok", name: "Bangkok", takesPurchases: false }))
		const out = await exportBackupV4(repo, NOW)
		expect(out.locations).toEqual(await repo.listLocations())
		expect(out.locations.find((l) => l.id === "krabi")).toEqual({
			id: "krabi",
			name: "Ao Nang",
			takesPurchases: true,
		})
		expect("converted" in out).toBe(false)
	})

	test("export writes the starting locations, ticked from the settings, while none are stored", async () => {
		const repo = new InMemoryRepository()
		await repo.saveSettings({ purchaseLocations: ["bangkok"] })
		expect((await exportBackupV4(repo, NOW)).locations).toEqual([
			{ id: "bangkok", name: "Bangkok", takesPurchases: true },
			{ id: "phichit", name: "Phichit", takesPurchases: false },
			{ id: "krabi", name: "Krabi", takesPurchases: false },
		])
	})

	test("a copy of cards with no location records stored still reads back", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLimitGroup(sampleLimitGroup())
		await repo.saveCard(sampleCard({ location: "krabi" }))
		const text = JSON.stringify(await exportBackupV4(repo, NOW))
		expect(parseAnyBackup(text).cards).toEqual(await repo.listCards())
	})

	test("merge keeps a stored location over the file's record with the same id", async () => {
		const repo = new InMemoryRepository()
		const stored = sampleLocation({
			id: "krabi",
			name: "Ao Nang",
			takesPurchases: true,
		})
		await repo.saveLocation(stored)
		await importBackupV4(
			repo,
			parseAnyBackup(
				v3({
					locations: [
						sampleLocation({
							id: "krabi",
							name: "Krabi",
							takesPurchases: false,
						}),
					],
				}),
			),
		)
		expect(await repo.listLocations()).toEqual([stored])
	})

	test("only the untouched starting places count as seeded defaults", () => {
		const bangkok = sampleLocation({ id: "bangkok", name: "Bangkok" })
		expect(onlySeededDefaults([])).toBe(true)
		expect(
			onlySeededDefaults([
				bangkok,
				sampleLocation({
					id: "phichit",
					name: "Phichit",
					takesPurchases: false,
				}),
				sampleLocation(),
			]),
		).toBe(true)
		// A rename, or a place of the reader's own, is not a seed any more.
		expect(onlySeededDefaults([bangkok, sampleLocation({ name: "Ao Nang" })])).toBe(false)
		expect(onlySeededDefaults([bangkok, sampleLocation({ id: "chiang-mai" })])).toBe(false)
	})

	test("over only seeded defaults, the file's locations win and an unused default it lacks goes", async () => {
		const repo = new InMemoryRepository()
		await seedLocations(repo, { getItem: () => null, setItem: () => {} })
		const fromFile = [
			sampleLocation({ id: "krabi", name: "Ao Nang", takesPurchases: false }),
			sampleLocation({ id: "phichit", name: "Phichit", takesPurchases: true }),
			sampleLocation({ id: "chiang-mai", name: "Chiang Mai" }),
		]
		await importBackupV4(repo, parseAnyBackup(v3({ locations: fromFile })), {
			overSeeded: true,
		})
		const stored = await repo.listLocations()
		expect(stored.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
			fromFile.toSorted((a, b) => a.id.localeCompare(b.id)),
		)
	})

	test("over only seeded defaults, a default a restored card uses stays", async () => {
		const repo = new InMemoryRepository()
		await seedLocations(repo, { getItem: () => null, setItem: () => {} })
		// A version 2 file with settings brings all three; this one only two, and a card at Bangkok.
		const backup = parseAnyBackup(
			v3({
				cards: [sampleCard({ location: "krabi" })],
				locations: [sampleLocation({ name: "Ao Nang" })],
			}),
		)
		backup.cards.push(sampleCard({ id: "scb", location: "bangkok" }))
		await importBackupV4(repo, backup, { overSeeded: true })
		expect((await repo.listLocations()).map((r) => [r.id, r.name])).toEqual(
			expect.arrayContaining([
				["krabi", "Ao Nang"],
				["bangkok", "Bangkok"],
			]),
		)
		expect((await repo.listLocations()).map((r) => r.id)).not.toContain("phichit")
	})

	test("over a renamed location, overSeeded keeps merge's keep-local rule", async () => {
		const repo = new InMemoryRepository()
		const stored = sampleLocation({ name: "Ao Nang" })
		await repo.saveLocation(stored)
		await importBackupV4(repo, parseAnyBackup(v3({ locations: [sampleLocation({ takesPurchases: false })] })), {
			overSeeded: true,
		})
		expect(await repo.listLocations()).toEqual([stored])
	})

	test("over only seeded defaults, a file with no locations leaves them alone", async () => {
		const repo = new InMemoryRepository()
		await seedLocations(repo, { getItem: () => null, setItem: () => {} })
		await importBackupV4(repo, parseAnyBackup(v2({ cards: [], purchases: [], payments: [] })), {
			overSeeded: true,
		})
		expect(await repo.listLocations()).toHaveLength(3)
	})

	test("merge adds a location only the file has", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLocation(sampleLocation())
		const phuket = sampleLocation({
			id: "phuket",
			name: "Phuket",
			takesPurchases: false,
		})
		await importBackupV4(repo, parseAnyBackup(v3({ locations: [sampleLocation(), phuket] })))
		expect(await repo.listLocations()).toEqual([sampleLocation(), phuket])
	})

	test("replace takes the file's location records", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLocation(sampleLocation({ id: "krabi", name: "Ao Nang", takesPurchases: true }))
		const fromFile = sampleLocation({
			id: "krabi",
			name: "Krabi",
			takesPurchases: false,
		})
		await replaceWithBackupV4(repo, parseAnyBackup(v3({ locations: [fromFile] })), { setItem: () => {} })
		expect(await repo.listLocations()).toEqual([fromFile])
	})

	test("importing a file leaves settings alone", async () => {
		const repo = new InMemoryRepository()
		await repo.saveSettings({ purchaseLocations: ["bangkok"] })
		await importBackupV4(
			repo,
			parseAnyBackup(
				v3({
					locations: [
						sampleLocation({ id: "krabi", takesPurchases: true }),
						sampleLocation({ id: "phichit", takesPurchases: true }),
					],
				}),
			),
		)
		await importBackupV4(repo, parseAnyBackup(v2({ settings: { purchaseLocations: ["phichit"] } })))
		expect(await repo.getSettings()).toEqual({
			purchaseLocations: ["bangkok"],
		})
	})

	test("a version 2 file with settings brings its locations as records", async () => {
		const repo = new InMemoryRepository()
		await importBackupV4(repo, parseAnyBackup(v2({ settings: { purchaseLocations: ["phichit"] } })))
		expect((await repo.listLocations()).map((l) => [l.id, l.takesPurchases])).toEqual([
			["bangkok", false],
			["krabi", false],
			["phichit", true],
		])
	})

	test("a version 2 file is marked converted; a version 3 file is not", () => {
		expect(parseAnyBackup(v2()).converted).toBe(true)
		expect(parseAnyBackup(v3()).converted).toBeUndefined()
	})

	test("merging a version 3 file keeps a card's local converted parts (DD-95)", async () => {
		const repo = new InMemoryRepository()
		await repo.saveCard(sampleCard())
		await repo.saveCardPayment(sampleCardPayment({ id: "m:k1:2026-09:1", period: "2026-09" }))
		await importBackupV4(
			repo,
			parseAnyBackup(
				v3({
					payments: [sampleCardPayment({ id: "m:k1:2026-09:0", period: "2026-09" })],
				}),
			),
		)
		const ids = (await repo.listCardPayments("k1")).map((p) => p.id).sort()
		expect(ids).toEqual(["m:k1:2026-09:0", "m:k1:2026-09:1"])
	})

	test("a version 3 card at a location the file does not carry is refused", async () => {
		const text = v3({ cards: [sampleCard({ location: "nowhere" })] })
		rejects(text, "backup.card", 1)
		const error = captureThrow(() => parseAnyBackup(text)) as MessageError
		expect(Reflect.get(error.params ?? {}, "problem")).toBe("backup.problem.unknownLocation")
	})

	const problemOf = (text: string): unknown =>
		Reflect.get((captureThrow(() => parseAnyBackup(text)) as MessageError).params ?? {}, "problem")

	test.each(["5.", ".5", "1..2", "K1", "kbank"])("a card id %j outside the card id form is refused (RD-28)", (id) => {
		for (const text of [v3({ cards: [sampleCard({ id })] }), v2({ cards: [sampleCard({ id })] })]) {
			rejects(text, "backup.card", 1)
			expect(problemOf(text)).toBe("backup.problem.badCardId")
		}
	})

	test("a card with no limit group is refused, and nothing is written (RD-27)", async () => {
		const { limitGroupId: _, ...loose } = sampleCard()
		for (const text of [v3({ cards: [sampleCard({ id: "2" }), loose] }), v2({ cards: [loose] })]) {
			rejects(text, "backup.card", text.includes('"version":3') ? 2 : 1)
			expect(problemOf(text)).toBe("backup.problem.missingLimitGroup")
		}
	})

	test("a card naming a limit group not in the file is refused (RD-27)", () => {
		for (const text of [
			v3({ cards: [sampleCard({ limitGroupId: "gone" })] }),
			v2({ cards: [sampleCard({ limitGroupId: "gone" })] }),
		]) {
			rejects(text, "backup.card", 1)
			expect(problemOf(text)).toBe("backup.problem.unknownLimitGroup")
		}
	})

	test("a version 3 card may sit at any location the file carries", () => {
		const parsed = parseAnyBackup(
			v3({
				cards: [sampleCard({ location: "chiang-mai" })],
				locations: [sampleLocation({ id: "chiang-mai", name: "Chiang Mai" })],
			}),
		)
		expect(parsed.cards[0]?.location).toBe("chiang-mai")
	})

	test("a version 2 card keeps the closed set of locations (DC-06)", () => {
		const text = v2({ cards: [sampleCard({ location: "chiang-mai" })] })
		rejects(text, "backup.card", 1)
		const error = captureThrow(() => parseAnyBackup(text)) as MessageError
		expect(Reflect.get(error.params ?? {}, "problem")).toBe("backup.problem.badLocation")
	})

	test("restoring a version 2 file over converted data leaves no stale m: parts", async () => {
		const repo = new InMemoryRepository()
		await repo.saveCard(sampleCard())
		for (const index of [0, 1, 2])
			await repo.saveCardPayment(
				sampleCardPayment({
					id: `m:k1:2026-09:${index}`,
					period: "2026-09",
				}),
			)
		await repo.saveCardPayment(sampleCardPayment({ id: "keep" }))
		await importBackupV4(repo, parseAnyBackup(v2()))
		const ids = (await repo.listCardPayments("k1")).map((p) => p.id).sort()
		expect(ids).toEqual(["keep", "m:k1:2026-09:0"])
	})

	test("replace sets the payments marker so startup does not convert again", async () => {
		const repo = new InMemoryRepository()
		await repo.saveCard(sampleCard({ id: "old" }))
		const items = new Map<string, string>()
		await replaceWithBackupV4(repo, parseAnyBackup(v3()), {
			setItem: (key, value) => void items.set(key, value),
		})
		expect(items.get(PAYMENTS_MIGRATION_KEY)).toBe("done")
		expect((await repo.listCards()).map((c) => c.id)).toEqual(["k1"])
	})

	test("counts include lists", async () => {
		const repo = new InMemoryRepository()
		await importBackupV4(repo, parseAnyBackup(v3()))
		expect(await countRecordsV4(repo)).toEqual({
			cards: 1,
			purchases: 1,
			payments: 1,
			limitGroups: 1,
			lists: 1,
		})
	})

	test("a version 1 file is rejected", () => {
		rejects(JSON.stringify({ version: 1 }), "backup.version")
		rejects(v3({ version: 5 }), "backup.version")
	})

	test("an unreadable file is rejected", () => {
		rejects("not json", "backup.unreadable")
		rejects(v3({ locations: undefined }), "backup.unreadable")
	})

	const bad: [string, string, string][] = [
		["a zero purchase", v3({ purchases: [samplePurchase({ amount: 0 })] }), "backup.purchase"],
		["a negative purchase", v3({ purchases: [samplePurchase({ amount: -5 })] }), "backup.purchase"],
		["a zero limit", v3({ limitGroups: [sampleLimitGroup({ limit: 0 })] }), "backup.limitGroup"],
		["a zero payment amount", v3({ payments: [sampleCardPayment({ amount: 0 })] }), "backup.cardPayment"],
		["a fractional payment amount", v3({ payments: [sampleCardPayment({ amount: 1.5 })] }), "backup.cardPayment"],
		["a bad payment status", v3({ payments: [sampleCardPayment({ status: "late" as never })] }), "backup.cardPayment"],
		[
			"a payment note that is not text",
			v3({ payments: [sampleCardPayment({ note: 12 as never })] }),
			"backup.cardPayment",
		],
		["a three digit last4", v3({ cards: [sampleCard({ last4: "123" })] }), "backup.card"],
		["a letter in last4", v3({ cards: [sampleCard({ last4: "12a4" })] }), "backup.card"],
		["close day 0", cycleCard({ kind: "offset", closeDay: 0, dueOffsetDays: 15 }), "backup.card"],
		["close day 32", cycleCard({ kind: "fixed", closeDay: 32, dueDay: 5 }), "backup.card"],
		["due day 0", cycleCard({ kind: "fixed", closeDay: 5, dueDay: 0 }), "backup.card"],
		["days until due 61", cycleCard({ kind: "offset", closeDay: 5, dueOffsetDays: 61 }), "backup.card"],
		["days until due 0", cycleCard({ kind: "offset", closeDay: 5, dueOffsetDays: 0 }), "backup.card"],
		[
			"a zero line on a list waiting for the spender",
			v3({
				lists: [
					samplePurchaseList({
						status: "sent",
						sentAt: "2026-10-05T01:00:00.000Z",
						lines: [{ cardId: "k1", amount: 0 }],
					}),
				],
			}),
			"backup.list",
		],
		["a bad list status", v3({ lists: [samplePurchaseList({ status: "done" as never })] }), "backup.list"],
		["a bad location record", v3({ locations: [{ id: "x", name: "X" }] }), "backup.location"],
		[
			"bad statement dates",
			v3({ statementDates: [sampleStatementDates({ dueDate: "nope" })] }),
			"backup.statementDates",
		],
		["a v2 zero purchase", v2({ purchases: [samplePurchase({ amount: 0 })] }), "backup.purchase"],
		["a v2 bad last4", v2({ cards: [sampleCard({ last4: "12" })] }), "backup.card"],
	]
	for (const [name, text, key] of bad) {
		test(`rejects ${name}, naming the record`, () => {
			rejects(text, key, 1)
		})
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
	]
	for (const [name, patch, problem] of badLines) {
		test(`rejects a list line with ${name}, naming the problem`, () => {
			const text = v3({
				lists: [
					samplePurchaseList({
						lines: [{ cardId: "k1", amount: 1_000, ...patch } as never],
					}),
				],
			})
			rejects(text, "backup.list", 1)
			const error = captureThrow(() => parseAnyBackup(text)) as MessageError
			expect(Reflect.get(error.params ?? {}, "problem")).toBe(problem)
		})
	}

	test("accepts list lines with a positive actual and a boolean made", () => {
		const lines = [
			{ cardId: "k1", amount: 1_000, made: true, actual: 900 },
			{ cardId: "k1", amount: 2_000, made: false, note: "next week" },
			{ cardId: "k1", amount: 3_000, note: "" },
		]
		const parsed = parseAnyBackup(v3({ lists: [samplePurchaseList({ lines })] }))
		// A blank note is accepted, then dropped (DC-07).
		expect(parsed.lists[0]?.lines).toEqual([...lines.slice(0, 2), { cardId: "k1", amount: 3_000 }])
	})

	test("accepts a draft line with no amount yet (0) and nothing below it", () => {
		const lines = [{ cardId: "k1", amount: 0 }]
		expect(parseAnyBackup(v3({ lists: [samplePurchaseList({ lines })] })).lists[0]?.lines).toEqual(lines)
		rejects(v3({ lists: [samplePurchaseList({ lines: [{ cardId: "k1", amount: -1 }] })] }), "backup.list", 1)
	})

	test("the rejection names which record is wrong", () => {
		rejects(
			v3({
				purchases: [samplePurchase(), samplePurchase({ id: "p2", amount: 0 })],
			}),
			"backup.purchase",
			2,
		)
	})

	test("nothing is written when a later record is bad", async () => {
		const repo = new InMemoryRepository()
		const text = v3({
			lists: [samplePurchaseList({ status: "done" as never })],
		})
		expect(() => importBackupV4(repo, parseAnyBackup(text))).toThrow(MessageError)
		const out = await exportBackupV4(repo, NOW)
		expect(out.cards).toEqual([])
		expect(await repo.listLocations()).toEqual([])
		expect(out.limitGroups).toEqual([])
	})
})

describe("backup version 4", () => {
	const kc = sampleOwner()
	const pim = sampleOwner({ id: "pim", name: "Pim" })
	const problemOf = (text: string): unknown =>
		Reflect.get((captureThrow(() => parseAnyBackup(text)) as MessageError).params ?? {}, "problem")

	test("export writes version 4 with the owner records as stored", async () => {
		const repo = new InMemoryRepository()
		await repo.saveOwner({ id: "KC", name: "Kamontat" })
		await repo.saveOwner(pim)
		const out = await exportBackupV4(repo, NOW)
		expect(out.version).toBe(4)
		expect(out.owners).toEqual([{ id: "KC", name: "Kamontat" }, pim])
	})

	test("export writes the starting owners while none are stored", async () => {
		expect((await exportBackupV4(new InMemoryRepository(), NOW)).owners).toEqual([
			{ id: "KC", name: "KC" },
			{ id: "NT", name: "NT" },
			{ id: "RI", name: "RI" },
		])
	})

	test("round trip keeps the owners, and a group and a supplementary card of a new owner", async () => {
		const text = v4({
			owners: [kc, pim],
			limitGroups: [sampleLimitGroup({ owner: "pim" })],
			cards: [sampleCard({ supplementary: true, owner: "KC" })],
		})
		const repo = new InMemoryRepository()
		await importBackupV4(repo, parseAnyBackup(text))
		const out = await exportBackupV4(repo, NOW)
		expect(out.owners).toEqual([kc, pim])
		expect(out.limitGroups[0]?.owner).toBe("pim")
		const again = new InMemoryRepository()
		await importBackupV4(again, parseAnyBackup(JSON.stringify(out)))
		expect(await exportBackupV4(again, NOW)).toEqual(out)
	})

	test("a version 2 or 3 file carries the starting owners", () => {
		const starting = [
			{ id: "KC", name: "KC" },
			{ id: "NT", name: "NT" },
			{ id: "RI", name: "RI" },
		]
		expect(parseAnyBackup(v3()).owners).toEqual(starting)
		expect(parseAnyBackup(v2()).owners).toEqual(starting)
	})

	test("a version 3 file keeps the closed set of owners (DC-06)", () => {
		const text = v3({ limitGroups: [sampleLimitGroup({ owner: "pim" })] })
		rejects(text, "backup.limitGroup", 1)
		expect(problemOf(text)).toBe("backup.problem.badOwner")
	})

	test("a version 4 file needs its owners", () => {
		rejects(v4({ owners: undefined }), "backup.unreadable")
		rejects(v4({ owners: [{ id: "x" }] }), "backup.owner", 1)
		rejects(v4({ owners: [{ name: "X" }] }), "backup.owner", 1)
	})

	test("a version 4 group must name one of the file's owners", () => {
		const text = v4({ limitGroups: [sampleLimitGroup({ owner: "NT" })] })
		rejects(text, "backup.limitGroup", 1)
		expect(problemOf(text)).toBe("backup.problem.unknownOwner")
		// Absent is a group from before the field: it reads as KC.
		expect(parseAnyBackup(v4({ limitGroups: [ownerless()] })).limitGroups).toHaveLength(1)
	})

	test("a version 4 supplementary card must name one of the file's owners; a stale owner elsewhere is ignored", () => {
		const text = v4({ cards: [sampleCard({ supplementary: true, owner: "NT" })] })
		rejects(text, "backup.card", 1)
		expect(problemOf(text)).toBe("backup.problem.unknownOwner")
		expect(parseAnyBackup(v4({ cards: [sampleCard({ owner: "NT" })] })).cards).toHaveLength(1)
	})

	test("merge keeps a stored owner over the file's record with the same id, and adds the rest", async () => {
		const repo = new InMemoryRepository()
		await repo.saveOwner({ id: "KC", name: "Kamontat" })
		await importBackupV4(repo, parseAnyBackup(v4({ owners: [kc, pim] })))
		expect(await repo.listOwners()).toEqual([{ id: "KC", name: "Kamontat" }, pim])
	})

	test("only the untouched starting owners count as seeded", () => {
		expect(onlySeededOwners([])).toBe(true)
		expect(onlySeededOwners([kc, sampleOwner({ id: "RI", name: "RI" })])).toBe(true)
		expect(onlySeededOwners([{ id: "KC", name: "Kamontat" }])).toBe(false)
		expect(onlySeededOwners([kc, pim])).toBe(false)
	})

	test("over only seeded owners, the file's owners win and an unused starting owner it lacks goes", async () => {
		const repo = new InMemoryRepository()
		await seedOwners(repo, { getItem: () => null, setItem: () => {} })
		await importBackupV4(repo, parseAnyBackup(v4({ owners: [{ id: "KC", name: "Kamontat" }, pim] })), {
			overSeeded: true,
		})
		expect(await repo.listOwners()).toEqual([{ id: "KC", name: "Kamontat" }, pim])
	})

	test("replace takes the file's owners", async () => {
		const repo = new InMemoryRepository()
		await repo.saveOwner({ id: "KC", name: "Kamontat" })
		await repo.saveOwner(sampleOwner({ id: "zed", name: "Zed" }))
		await replaceWithBackupV4(repo, parseAnyBackup(v4({ owners: [kc, pim] })), { setItem: () => {} })
		expect(await repo.listOwners()).toEqual([kc, pim])
	})

	test("replace with a version 3 file gives the starting owners", async () => {
		const repo = new InMemoryRepository()
		await repo.saveOwner(pim)
		await replaceWithBackupV4(repo, parseAnyBackup(v3()), { setItem: () => {} })
		expect((await repo.listOwners()).map((o) => o.id)).toEqual(["KC", "NT", "RI"])
	})
})
