import type {
	Card,
	CardPayment,
	CycleRule,
	LimitGroup,
	LocationRecord,
	OwnerRecord,
	PlainDate,
	Purchase,
	PurchaseList,
	StatementDates,
} from "#lib/domain/types"
import type { BackupV4 } from "#lib/storage/transfer-v4"

import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
import { addDays, addPeriods, today as bangkokToday, compareDates, daysBetween, parseDate } from "#lib/domain/date"
import { roomFor } from "#lib/domain/home"
import { ledgersFor } from "#lib/domain/ledger"
import { openPeriod } from "#lib/domain/statement"
import { BACKUP_V4 } from "#lib/storage/transfer-v4"

/**
 * A version 4 backup that exercises every state the app can show, built around `today` so the
 * relative ones (overdue, due soon, planned, closing today) hold whenever it is generated:
 *
 * - bills overdue, due soon (and partly paid), due later, and cards fully paid
 * - a card in credit, groups within, high (80% on) and over their limit, a group with no cards
 * - a list waiting for the spender holding room; drafts raising every amount warning, one with
 *   a line of no amount yet; saved lists with made, not-made and corrected lines, one moved to a draft
 * - planned payments late, within three days and later; a converted payment naming its period
 * - archived, supplementary, never-used and not-ready cards; offset and fixed cycles, a close
 *   day of 31, a card closing today
 * - over three years of history, with quiet months, a purchase on a close date, a future one,
 *   entry times on recent purchases only, and kept statement dates (some from an older cycle)
 * - locations and owners that nothing uses, a location that takes no purchases, a Thai name
 *
 * The same `today` always gives the same file.
 */
export function buildMockBackup(today: PlainDate): BackupV4 {
	const random = seeded(today)
	const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
	const between = (low: number, high: number): number => low + Math.floor(random() * (high - low + 1))
	const baht = (low: number, high: number): number => between(low * 100, high * 100)
	const uuid = (): string => {
		const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("")
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
	}
	const instant = (date: PlainDate): string =>
		`${date}T${String(between(1, 10)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}:00.000Z`

	const owners: OwnerRecord[] = [
		{ id: "KC", name: "KC" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
		{ id: "mom", name: "Mom" },
		{ id: "owner", name: "สมศรี" },
		{ id: "tee", name: "Tee" },
	]

	const locations: LocationRecord[] = [
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "phichit", name: "Phichit", takesPurchases: false },
		{ id: "krabi", name: "Krabi", takesPurchases: true },
		{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: true },
		{ id: "hat-yai", name: "Hat Yai", takesPurchases: true },
	]

	// Limits are set once the ledgers are known, so each group lands where it is meant to.
	const limitGroups: LimitGroup[] = [
		{ id: "kbank", name: "KBank account", limit: 1, owner: "KC", color: "blue" },
		{ id: "scb", name: "SCB account", limit: 1, owner: "NT", color: "green" },
		{ id: "uob", name: "UOB account", limit: 1, owner: "RI", color: "rose" },
		{ id: "krungsri", name: "Krungsri account", limit: 8_000_000, owner: "mom", color: "purple" },
		{ id: "spare", name: "Spare pool", limit: 5_000_000, owner: "KC" },
		{ id: "ktc", name: "KTC บัญชีใหม่", limit: 2_000_000, owner: "owner", color: "amber" },
	]

	// An offset cycle whose latest statement closed `daysAgo` days ago (a few more when that lands
	// past the 28th, so every month has the close day) and is due `dueIn` days after it closed.
	const closedAgo = (daysAgo: number, dueOffsetDays: number): CycleRule => {
		let back = daysAgo
		while (parseDate(addDays(today, -back)).day > 28) back++
		return { kind: "offset", closeDay: parseDate(addDays(today, -back)).day, dueOffsetDays }
	}

	const card = (fields: Omit<Card, "archived" | "supplementary"> & Partial<Card>): Card => ({
		archived: false,
		supplementary: false,
		...fields,
	})
	const cards: Card[] = [
		card({
			id: "1",
			name: "KBank Visa Platinum",
			last4: "4821",
			location: "krabi",
			cycle: { kind: "fixed", closeDay: 20, dueDay: 5 },
			limitGroupId: "kbank",
			comment: "Company fuel and supplies",
		}),
		card({
			id: "1.1",
			name: "KBank Visa (supplementary)",
			last4: "4839",
			location: "krabi",
			supplementary: true,
			owner: "NT",
			cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 20 },
			limitGroupId: "kbank",
		}),
		card({
			id: "1.2",
			name: "KBank Mastercard (old)",
			last4: "1107",
			location: "bangkok",
			archived: true,
			cycle: { kind: "fixed", closeDay: 25, dueDay: 28 },
			limitGroupId: "kbank",
			comment: "Replaced by the Platinum card",
		}),
		card({
			id: "2",
			name: "SCB M Visa",
			last4: "6610",
			location: "krabi",
			cycle: closedAgo(20, 10),
			limitGroupId: "scb",
		}),
		card({
			id: "2.1",
			name: "SCB Prestige",
			last4: "6634",
			location: "chiang-mai",
			cycle: { kind: "offset", closeDay: parseDate(today).day, dueOffsetDays: 15 },
			limitGroupId: "scb",
		}),
		card({
			id: "3",
			name: "UOB Preferred Platinum",
			last4: "3092",
			location: "krabi",
			cycle: closedAgo(10, 14),
			limitGroupId: "uob",
		}),
		card({
			id: "3.1",
			name: "UOB Yolo",
			last4: "3115",
			location: "krabi",
			cycle: closedAgo(3, 25),
			limitGroupId: "uob",
		}),
		card({
			id: "4",
			name: "Krungsri Now",
			last4: "7731",
			location: "chiang-mai",
			cycle: { kind: "offset", closeDay: 31, dueOffsetDays: 20 },
			limitGroupId: "krungsri",
		}),
		card({
			id: "4.1",
			name: "Krungsri Now (บัตรเสริม)",
			last4: "7748",
			location: "phichit",
			supplementary: true,
			owner: "RI",
			cycle: { kind: "offset", closeDay: 31, dueOffsetDays: 20 },
			limitGroupId: "krungsri",
		}),
		card({
			id: "k7",
			name: "KTC Titanium",
			last4: "0005",
			location: "phichit",
			cycle: { kind: "fixed", closeDay: 1, dueDay: 15 },
			limitGroupId: "ktc",
			comment: "New, not used yet",
		}),
	]
	const byId = (id: string): Card => cards.find((c) => c.id === id) as Card

	const notes = [
		"fuel",
		"ค่าน้ำมัน",
		"Makro supplies",
		"Lazada order",
		"ค่าอาหาร",
		"",
		"Big C",
		"7-Eleven",
		"Grab",
		"Shopee",
		"ค่าไฟ",
		"Office supplies: printer toner, A4 paper and a note long enough to wrap on a phone",
	]
	const recent = addDays(today, -20)
	const purchases: Purchase[] = []
	const purchase = (cardId: string, date: PlainDate, amount: number, note = pick(notes), id = uuid()): void => {
		const addedAt =
			compareDates(date, recent) < 0 ? {} : { addedAt: instant(compareDates(date, today) > 0 ? today : date) }
		purchases.push({ id, cardId, date, amount, note, ...addedAt })
	}

	type Ending = "paid" | "unpaid" | "partial"
	type History = { from: number; to?: number; every?: number; ending?: Ending; perMonth?: [number, number] }
	const histories: Record<string, History> = {
		"1": { from: 40, perMonth: [2, 6] },
		"1.1": { from: 18, every: 3 },
		"1.2": { from: 48, to: 14 },
		"2": { from: 14, ending: "unpaid" },
		"2.1": { from: 8 },
		"3": { from: 12, ending: "partial" },
		"3.1": { from: 6, ending: "unpaid" },
		"4": { from: 10 },
		"4.1": { from: 9, to: 4 },
	}

	// Each statement's purchases, newest period last, so payments can follow them.
	for (const [cardId, history] of Object.entries(histories)) {
		const c = byId(cardId)
		const open = openPeriod(c, today)
		const [low, high] = history.perMonth ?? [1, 4]
		for (let back = history.from; back >= (history.to ?? 0); back--) {
			if (back % (history.every ?? 1) !== 0) continue
			const period = addPeriods(open, -back)
			const start = addDays(closeDateOf(c.cycle, addPeriods(period, -1)), 1)
			const end = back === 0 ? today : closeDateOf(c.cycle, period)
			const span = Math.max(0, daysBetween(start, end))
			for (let n = between(low, high); n > 0; n--) purchase(cardId, addDays(start, between(0, span)), baht(80, 9_000))
		}
	}
	// On a close date, which belongs to the statement it closes, and one dated ahead of today.
	const kbank = byId("1")
	purchase("1", closeDateOf(kbank.cycle, addPeriods(openPeriod(kbank, today), -5)), 4_550_00, "Paid on the close date")
	purchase("1", addDays(today, 6), 1_250_00, "Booked ahead: hotel deposit")

	// Saved lists: their made lines are the purchases `<list id>-<n>` on the list's date.
	const lists: PurchaseList[] = []
	const savedList = (date: PlainDate, lines: PurchaseList["lines"], movedTo?: string): PurchaseList => {
		const id = uuid()
		let n = 0
		for (const line of lines) {
			if (!line.made) continue
			n++
			purchase(line.cardId, date, line.actual ?? line.amount, line.note ?? "", `${id}-${n}`)
		}
		const list: PurchaseList = {
			id,
			date,
			status: "saved",
			lines,
			sentAt: instant(date),
			savedAt: `${date}T11:30:00.000Z`,
		}
		if (movedTo) list.movedTo = movedTo
		lists.push(list)
		return list
	}
	savedList(addDays(today, -1_160), [
		{ cardId: "1", amount: 3_200_00, made: true, note: "Fuel for the truck" },
		{ cardId: "1", amount: 850_00, made: true },
	])
	savedList(addDays(today, -425), [
		{ cardId: "1", amount: 12_000_00, made: true, actual: 11_640_50, note: "Makro monthly stock" },
		{ cardId: "2", amount: 2_400_00, made: true },
	])
	const nextDraftId = uuid()
	savedList(
		addDays(today, -6),
		[
			{ cardId: "1", amount: 5_000_00, made: true, actual: 4_870_25, note: "ค่าวัสดุก่อสร้าง" },
			{ cardId: "2.1", amount: 1_500_00, made: true },
			{ cardId: "3.1", amount: 2_000_00, made: false, note: "Shop was closed" },
		],
		nextDraftId,
	)

	// Payments: every closed statement paid in full near its due date, except each card's ending.
	const payments: CardPayment[] = []
	const ledgerOf = (cardId: string) => ledgersFor([byId(cardId)], purchases, payments, [], today).get(cardId)
	const paymentNotes = ["From KBank savings", "โอนจากบัญชีออมทรัพย์", undefined, undefined, undefined]
	for (const [cardId, history] of Object.entries(histories)) {
		const c = byId(cardId)
		const statements = (ledgerOf(cardId)?.statements ?? []).filter(
			(s) => !s.open && compareDates(s.closeDate, today) < 0,
		)
		const latest = statements[0]?.period
		for (const s of [...statements].reverse()) {
			if (s.total === 0) continue
			const ending = s.period === latest && history.to === undefined ? (history.ending ?? "paid") : "paid"
			if (ending === "unpaid") continue
			const due = dueDateOf(c.cycle, s.period)
			let date = addDays(due, -between(0, 5))
			if (compareDates(date, s.closeDate) <= 0) date = addDays(s.closeDate, 1)
			if (compareDates(date, today) > 0) date = today
			const amount = ending === "partial" ? Math.round(s.total * 0.4) : s.total
			const note = ending === "partial" ? "Part now, the rest on payday" : pick(paymentNotes)
			payments.push({ id: uuid(), cardId, date, amount, status: "paid", ...(note ? { note } : {}) })
		}
	}
	// One record converted from the old per-statement model names the statement it paid.
	const converted = payments.find((p) => p.cardId === "1")
	if (converted) {
		const ledger = ledgerOf("1")
		const paid = ledger?.statements.findLast((s) => s.payments.some((part) => part.payment.id === converted.id))
		if (paid) converted.period = paid.period
	}
	// More than it owes: the rest stays on the card as credit.
	payments.push({ id: uuid(), cardId: "4", date: addDays(today, -3), amount: 50_000_00, status: "paid", note: "Bonus" })
	// Plans: late (still not marked paid), within the next three days, and later.
	payments.push(
		{ id: uuid(), cardId: "3", date: addDays(today, -1), amount: 3_000_00, status: "planned" },
		{ id: uuid(), cardId: "3.1", date: addDays(today, 2), amount: 1_500_00, status: "planned", note: "Payday" },
		{ id: uuid(), cardId: "2", date: addDays(today, 20), amount: 10_000_00, status: "planned" },
	)

	const ledgers = ledgersFor(cards, purchases, payments, [], today)

	// Kept dates for each fully paid statement; KBank's oldest from before its cycle changed.
	const oldCycle: CycleRule = { kind: "fixed", closeDay: 15, dueDay: 1 }
	const cutover = addPeriods(openPeriod(kbank, today), -30)
	const statementDates: StatementDates[] = []
	for (const c of cards) {
		for (const s of ledgers.get(c.id)?.statements ?? []) {
			if (!s.paid || s.open) continue
			const rule = c.id === "1" && s.period < cutover ? oldCycle : c.cycle
			statementDates.push({
				cardId: c.id,
				period: s.period,
				closeDate: closeDateOf(rule, s.period),
				dueDate: dueDateOf(rule, s.period),
			})
		}
	}
	// Kept while the statement still owed money (before DD-167); the ledger ignores it.
	const partly = ledgers.get("3")?.statements.find((s) => !s.open && s.remaining > 0 && s.paidAmount > 0)
	if (partly) {
		statementDates.push({
			cardId: "3",
			period: partly.period,
			closeDate: partly.closeDate,
			dueDate: addDays(partly.dueDate, -2),
		})
	}

	// Limits: KBank well within, SCB about 85% used, UOB over.
	const used = (groupId: string): number =>
		cards
			.filter((c) => c.limitGroupId === groupId)
			.reduce((sum, c) => sum + (ledgers.get(c.id)?.owed ?? 0) - (ledgers.get(c.id)?.credit ?? 0), 0)
	const roundUp = (satang: number): number => Math.ceil(satang / 100_000) * 100_000
	const setLimit = (id: string, limit: number): void => {
		const group = limitGroups.find((g) => g.id === id)
		if (group) group.limit = limit
	}
	setLimit("kbank", Math.max(30_000_000, roundUp(used("kbank") * 3)))
	setLimit("scb", Math.ceil(used("scb") / 0.85 / 100) * 100)
	setLimit("uob", Math.max(100, Math.floor((used("uob") * 0.9) / 100) * 100))

	// Waiting for the spender: holds room on KBank and UOB until it is saved.
	const sentAt = instant(today)
	lists.push({
		id: uuid(),
		date: today,
		status: "sent",
		sentAt,
		lines: [
			{ cardId: "1", amount: 7_500_00, note: "Cement, 20 bags" },
			{ cardId: "1.1", amount: 1_200_00 },
			{ cardId: "3", amount: 900_00, note: "ค่ายา" },
		],
	})

	// The draft the not-made line moved to, and one raising every warning: over the room (KBank),
	// a shared limit (both UOB cards), an overdue bill (SCB M) and today's close date (SCB Prestige).
	lists.push({
		id: nextDraftId,
		date: addDays(today, 1),
		status: "draft",
		lines: [{ cardId: "3.1", amount: 2_000_00 }],
	})
	const draftId = uuid()
	const data = { cards, groups: limitGroups, ledgers, lists }
	const kbankRoom = roomFor(kbank, data, draftId)?.room ?? 0
	lists.push({
		id: draftId,
		date: today,
		status: "draft",
		lines: [
			{ cardId: "1", amount: Math.max(kbankRoom, 0) + 5_000_00, note: "New generator" },
			{ cardId: "3", amount: 1_800_00 },
			{ cardId: "3.1", amount: 2_600_00 },
			{ cardId: "2", amount: 450_00 },
			{ cardId: "2.1", amount: 3_300_00, note: "ค่าอาหารทีมงาน" },
			{ cardId: "4", amount: 0 },
		],
	})

	const byDate = (a: { date: PlainDate }, b: { date: PlainDate }): number => compareDates(a.date, b.date)
	return {
		version: BACKUP_V4,
		exportedAt: `${today}T05:00:00.000Z`,
		limitGroups,
		cards,
		purchases: purchases.sort(byDate),
		payments: payments.sort(byDate),
		statementDates,
		lists: lists.sort(byDate),
		locations,
		owners,
	}
}

/** mulberry32, seeded from the text, so a day always draws the same numbers. */
function seeded(text: string): () => number {
	let state = [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261)
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
	}
}

if (import.meta.main) {
	const arg = (name: string): string | undefined => {
		const index = process.argv.indexOf(`--${name}`)
		return index >= 0 ? process.argv[index + 1] : undefined
	}
	const day = arg("today") ?? bangkokToday()
	const out = arg("out") ?? `cc-tracking-mock-${day}.json`
	const backup = buildMockBackup(day)
	await Bun.write(out, `${JSON.stringify(backup, null, "\t")}\n`)
	console.log(
		`${out}: ${backup.cards.length} cards, ${backup.purchases.length} purchases, ${backup.payments.length} payments, ${backup.lists.length} lists (today ${day})`,
	)
}
