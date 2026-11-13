import { describe, expect, test } from "vitest"

import { MessageError } from "#lib/i18n/error"
import { sampleCard, sampleLimitGroup, sampleLocation, samplePurchase } from "#lib/storage/contract"
import { InMemoryRepository } from "#lib/storage/repository"
import { limitGroupProblem } from "#lib/storage/transfer"
import { exportBackupV4, importBackupV4 as importBackup, parseAnyBackup as parseBackup } from "#lib/storage/transfer-v4"

/** A version 3 file's contents, the oldest shape the validators here still read. */
const v3 = (patch: Record<string, unknown> = {}): string =>
	JSON.stringify({
		version: 3,
		exportedAt: "2026-09-21T00:00:00.000Z",
		limitGroups: [],
		cards: [],
		purchases: [],
		payments: [],
		statementDates: [],
		lists: [],
		locations: [sampleLocation()],
		...patch,
	})

/** Runs `fn`, expecting it to throw, and returns what it threw. */
function captureThrow(fn: () => unknown): unknown {
	try {
		fn()
	} catch (failure) {
		return failure
	}
	throw new Error("expected function to throw")
}

const populated = async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup(sampleLimitGroup())
	await repo.saveLocation(sampleLocation())
	await repo.saveLocation(sampleLocation({ id: "phichit", name: "Phichit" }))
	await repo.saveCard(sampleCard())
	await repo.saveCard(sampleCard({ id: "s1", name: "SCB Mastercard", location: "phichit" }))
	await repo.savePurchase(samplePurchase({ id: "p1" }))
	await repo.savePurchase(samplePurchase({ id: "p2", cardId: "s1", date: "2026-09-09" }))
	return repo
}

describe("parseBackup", () => {
	test("accepts a backup this app wrote", async () => {
		const text = JSON.stringify(await exportBackupV4(await populated(), new Date()))
		expect(parseBackup(text).cards).toHaveLength(2)
	})

	test("rejects malformed JSON", () => {
		const failure = captureThrow(() => parseBackup("{nope"))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.unreadable")
	})

	test("rejects a future backup version", () => {
		const failure = captureThrow(() => parseBackup(v3({ version: 5 })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.version")
		expect((failure as MessageError).params).toEqual({
			found: "5",
			oldest: 3,
			newest: 4,
		})
	})

	test.each([1, 2])("rejects a version %i file as unsupported, however well formed", (version) => {
		const failure = captureThrow(() =>
			parseBackup(
				JSON.stringify({
					version,
					exportedAt: "2026-09-21T00:00:00.000Z",
					limitGroups: [],
					cards: [],
					purchases: [],
					payments: [],
					settings: { purchaseLocations: ["krabi"] },
				}),
			),
		)
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.version")
		expect((failure as MessageError).params).toEqual({
			found: String(version),
			oldest: 3,
			newest: 4,
		})
	})

	test("rejects JSON missing the expected lists", () => {
		const failure = captureThrow(() => parseBackup(JSON.stringify({ version: 3 })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.unreadable")
	})

	test("rejects a card that is missing its required fields", () => {
		const failure = captureThrow(() => parseBackup(v3({ cards: [{}] })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.card")
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.missingId",
		})
	})

	test("names which card is wrong, by key", () => {
		const failure = captureThrow(() => parseBackup(v3({ cards: [{ id: "1", name: "KBank Visa", last4: "4821" }] })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.card")
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.unknownLocation",
		})
	})

	test("rejects a purchase with a non-integer amount", () => {
		const failure = captureThrow(() =>
			parseBackup(
				v3({
					purchases: [{ id: "p1", cardId: "1", date: "2026-09-05", amount: 100.5, note: "" }],
				}),
			),
		)
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.purchase")
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badAmount",
		})
	})

	test("rejects a string version, even one that looks like the right number", () => {
		const failure = captureThrow(() => parseBackup(v3({ version: "3" })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).key).toBe("backup.version")
		expect((failure as MessageError).params).toEqual({
			found: '"3"',
			oldest: 3,
			newest: 4,
		})
	})

	test("a valid backup still round-trips", async () => {
		const backup = await exportBackupV4(await populated(), new Date())
		const parsed = parseBackup(JSON.stringify(backup))

		expect(parsed.cards.map((c) => c.id)).toEqual(["k1", "s1"])
		expect(parsed.purchases.map((p) => p.id)).toEqual(["p1", "p2"])
	})
})

describe("owner in a version 3 backup", () => {
	const withGroup = (group: Record<string, unknown>) =>
		v3({ limitGroups: [{ id: "pool", name: "KBank", limit: 500_000, ...group }] })

	test("keeps a known owner on a limit group", () => {
		expect(parseBackup(withGroup({ owner: "NT" })).limitGroups[0]?.owner).toBe("NT")
	})

	test("accepts a limit group saved before the owner field existed", () => {
		expect(parseBackup(withGroup({})).limitGroups[0]?.owner).toBeUndefined()
	})

	test("rejects a limit group whose owner is outside the closed set", () => {
		const failure = captureThrow(() => parseBackup(withGroup({ owner: "ZZ" })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		})
	})

	const withCard = (card: Record<string, unknown>) =>
		v3({
			limitGroups: [sampleLimitGroup()],
			cards: [
				{
					id: "2",
					name: "Card A",
					last4: "2222",
					location: "krabi",
					cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
					archived: false,
					limitGroupId: "pool",
					...card,
				},
			],
		})

	test("keeps the holder of a supplementary card", () => {
		expect(parseBackup(withCard({ supplementary: true, owner: "NT" })).cards[0]?.owner).toBe("NT")
	})

	test("accepts a card saved before cards had an owner", () => {
		expect(parseBackup(withCard({})).cards[0]?.owner).toBeUndefined()
	})

	test("rejects a card whose owner is outside the closed set", () => {
		const failure = captureThrow(() => parseBackup(withCard({ supplementary: true, owner: "ZZ" })))
		expect(failure).toBeInstanceOf(MessageError)
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		})
	})
})

describe("entry time in a backup", () => {
	const withPurchase = (purchase: Record<string, unknown>) =>
		v3({
			purchases: [{ id: "p1", cardId: "1", date: "2026-10-20", amount: 100, note: "", ...purchase }],
		})

	test("imports a purchase with addedAt and keeps it", async () => {
		const repo = new InMemoryRepository()
		await importBackup(repo, parseBackup(withPurchase({ addedAt: "2026-10-27T03:15:00.000Z" })))
		const [stored] = await repo.listPurchases("1")
		expect(stored?.addedAt).toBe("2026-10-27T03:15:00.000Z")
	})

	test("imports a purchase without addedAt", () => {
		expect(parseBackup(withPurchase({})).purchases[0]?.addedAt).toBeUndefined()
	})

	test("rejects a purchase whose addedAt is not an ISO instant", () => {
		for (const addedAt of [123, "yesterday"]) {
			const failure = captureThrow(() => parseBackup(withPurchase({ addedAt })))
			expect(failure).toBeInstanceOf(MessageError)
			expect((failure as MessageError).params).toEqual({
				index: 1,
				problem: "backup.problem.badAddedAt",
			})
		}
	})
})

describe("colour in a backup", () => {
	test("a limit group with any colour passes the shape check", () => {
		const group = { id: "g", name: "Pool", limit: 100 }
		expect(limitGroupProblem({ ...group, color: "nope" })).toBeNull()
		expect(limitGroupProblem({ ...group, color: "rose" })).toBeNull()
	})
})
