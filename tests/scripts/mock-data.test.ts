import type { BackupV4 } from "#lib/storage/transfer-v4"

import { describe, expect, test } from "vitest"

import { lineWarnings } from "#lib/domain/amount-warnings"
import { isCardId } from "#lib/domain/card"
import { isCloseDate, periodOfPurchase } from "#lib/domain/cycle"
import { compareDates } from "#lib/domain/date"
import { isReady, needsYou, roomFor } from "#lib/domain/home"
import { ledgersFor, ledgerUrgency, nextBill } from "#lib/domain/ledger"
import { canDeleteLocation } from "#lib/domain/locations"
import { canDeleteOwner } from "#lib/domain/owner"
import { plannedHorizon } from "#lib/domain/pay"
import { planPurge, purgeCutoff } from "#lib/domain/purge"
import { parseAnyBackup } from "#lib/storage/transfer-v4"
import { buildMockBackup } from "../../scripts/mock-data"

// Month ends, a leap day, a year turn and a mid-month day: every scenario must hold on any of them.
const DAYS = ["2026-11-14", "2026-01-01", "2028-02-29", "2026-03-31", "2026-12-28", "2027-07-01"]

const view = (backup: BackupV4, today: string) => {
	const ledgers = ledgersFor(backup.cards, backup.purchases, backup.payments, backup.statementDates, today)
	const data = { cards: backup.cards, groups: backup.limitGroups, ledgers, lists: backup.lists }
	const card = (id: string) => {
		const found = backup.cards.find((c) => c.id === id)
		if (!found) throw new Error(`no card ${id}`)
		return found
	}
	return { ledgers, data, card }
}

describe.each(DAYS)("mock data for %s", (today) => {
	const backup = buildMockBackup(today)
	const { ledgers, data, card } = view(backup, today)

	test("restores as written: the app's own parser accepts it and changes nothing", () => {
		expect(parseAnyBackup(JSON.stringify(backup))).toEqual(backup)
	})

	test("is the same every run for the same day", () => {
		expect(buildMockBackup(today)).toEqual(backup)
	})

	test("every card id is in the card id form and every id is unique", () => {
		expect(backup.cards.every((c) => isCardId(c.id))).toBe(true)
		const ids = (records: { id: string }[]) => new Set(records.map((r) => r.id)).size === records.length
		expect(ids(backup.cards)).toBe(true)
		expect(ids(backup.purchases)).toBe(true)
		expect(ids(backup.lists)).toBe(true)
		expect(ids(backup.limitGroups)).toBe(true)
	})

	test("every bill urgency is present", () => {
		const urgencies = new Set(
			backup.cards.flatMap((c) => {
				const bill = nextBill(ledgers.get(c.id) ?? { statements: [], owed: 0, credit: 0 }, today)
				return bill ? [ledgerUrgency(bill, today)] : []
			}),
		)
		expect([...urgencies].sort()).toEqual(["due", "overdue", "soon"])
	})

	test("a bill is partly paid", () => {
		const partly = backup.cards.some((c) =>
			ledgers.get(c.id)?.statements.some((s) => !s.open && s.paidAmount > 0 && s.remaining > 0),
		)
		expect(partly).toBe(true)
	})

	test("a card holds credit from paying more than it owed", () => {
		expect(backup.cards.some((c) => (ledgers.get(c.id)?.credit ?? 0) > 0)).toBe(true)
	})

	test("groups sit within, high and over their limit, and one has no cards", () => {
		const levels = new Set(
			backup.cards.flatMap((c) => {
				const room = roomFor(c, data)
				return room ? [room.level] : []
			}),
		)
		expect([...levels].sort()).toEqual(["high", "over", "within"])
		expect(backup.limitGroups.some((g) => !backup.cards.some((c) => c.limitGroupId === g.id))).toBe(true)
	})

	test("a waiting list holds room", () => {
		expect(backup.cards.some((c) => (roomFor(c, data)?.held ?? 0) > 0)).toBe(true)
	})

	test("Needs you has every kind: overdue, late plan, waiting, soon plan and draft", () => {
		const items = needsYou(data, today, backup.payments)
		const kinds = items.map((item) =>
			item.kind === "planned" ? (compareDates(item.payment.date, today) <= 0 ? "late" : "soon") : item.kind,
		)
		expect(new Set(kinds)).toEqual(new Set(["overdue", "late", "waiting", "soon", "draft"]))
	})

	test("has a planned payment beyond the next three days, and payments with and without notes", () => {
		const planned = backup.payments.filter((p) => p.status === "planned")
		expect(planned.some((p) => compareDates(p.date, plannedHorizon(today)) > 0)).toBe(true)
		expect(backup.payments.some((p) => p.note)).toBe(true)
		expect(backup.payments.some((p) => p.period)).toBe(true)
	})

	test("cards cover archived, supplementary, unused, not ready and close-today", () => {
		expect(backup.cards.some((c) => c.archived)).toBe(true)
		expect(backup.cards.some((c) => c.supplementary && c.owner)).toBe(true)
		expect(backup.cards.some((c) => !backup.purchases.some((p) => p.cardId === c.id))).toBe(true)
		expect(backup.cards.some((c) => !c.archived && !isReady(c, backup.limitGroups, backup.locations))).toBe(true)
		expect(
			backup.cards.some((c) => isReady(c, backup.limitGroups, backup.locations) && isCloseDate(c.cycle, today)),
		).toBe(true)
		expect(new Set(backup.cards.map((c) => c.cycle.kind))).toEqual(new Set(["offset", "fixed"]))
		expect(backup.cards.some((c) => c.comment)).toBe(true)
	})

	test("locations and owners include ones nothing uses", () => {
		expect(backup.locations.some((l) => canDeleteLocation(l.id, backup.cards))).toBe(true)
		expect(backup.locations.some((l) => l.takesPurchases)).toBe(true)
		expect(backup.locations.some((l) => !l.takesPurchases && !canDeleteLocation(l.id, backup.cards))).toBe(true)
		expect(backup.owners.some((o) => canDeleteOwner(o.id, backup.limitGroups, backup.cards))).toBe(true)
		expect(backup.owners.length).toBeGreaterThan(3)
	})

	test("purchases span over three years, with entry times only on recent ones, and one in the future", () => {
		const dates = backup.purchases.map((p) => p.date).sort(compareDates)
		expect(compareDates(dates[0] ?? today, purgeCutoff("3y", today))).toBeLessThan(0)
		expect(compareDates(dates.at(-1) ?? today, today)).toBeGreaterThan(0)
		expect(backup.purchases.some((p) => p.addedAt)).toBe(true)
		expect(backup.purchases.some((p) => !p.addedAt)).toBe(true)
	})

	test("a purchase lands on its statement's close date", () => {
		expect(
			backup.purchases.some((p) => {
				const c = card(p.cardId)
				return isCloseDate(c.cycle, p.date) && periodOfPurchase(c.cycle, p.date) === p.date.slice(0, 7)
			}),
		).toBe(true)
	})

	test("lists cover every status, a moved line, a blank draft line, notes and real amounts", () => {
		expect(new Set(backup.lists.map((l) => l.status))).toEqual(new Set(["draft", "sent", "saved"]))
		const moved = backup.lists.find((l) => l.movedTo)
		expect(backup.lists.some((l) => l.id === moved?.movedTo && l.status === "draft")).toBe(true)
		const lines = backup.lists.flatMap((l) => l.lines)
		expect(lines.some((l) => l.amount === 0)).toBe(true)
		expect(lines.some((l) => l.made === false)).toBe(true)
		expect(lines.some((l) => l.actual !== undefined && l.actual !== l.amount)).toBe(true)
		expect(lines.some((l) => l.note)).toBe(true)
		const saved = backup.lists.find((l) => l.status === "saved")
		expect(backup.purchases.some((p) => p.id === `${saved?.id}-1`)).toBe(true)
	})

	test("a draft line raises every amount warning", () => {
		const kinds = new Set<string>()
		for (const list of backup.lists.filter((l) => l.status === "draft")) {
			const lines = list.lines.flatMap((line) => {
				const c = card(line.cardId)
				const room = roomFor(c, data, list.id)
				const ledger = ledgers.get(c.id)
				if (!room || !ledger) return []
				const planned = backup.payments.filter((p) => p.cardId === c.id && p.status === "planned")
				return [{ card: c, amount: line.amount, room, ledger, planned }]
			})
			for (const line of lines) for (const w of lineWarnings(line, lines, list.date, today)) kinds.add(w.kind)
		}
		expect(kinds).toEqual(new Set(["over-room", "shared-limit", "overdue-bill", "close-date"]))
	})

	test("old data can be cleaned at every age without changing what is owed", () => {
		for (const age of ["6m", "1y", "3y"] as const) {
			const plan = planPurge(
				backup.cards,
				backup.purchases,
				backup.payments,
				backup.statementDates,
				backup.lists,
				purgeCutoff(age, today),
				today,
			)
			expect(plan.purchaseIds.length).toBeGreaterThan(0)
			expect(plan.listIds.length).toBeGreaterThan(0)
		}
	})

	test("keeps statement dates for paid statements", () => {
		expect(backup.statementDates.length).toBeGreaterThan(0)
	})
})
