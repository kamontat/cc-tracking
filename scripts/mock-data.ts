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
import { GROUP_COLORS } from "#lib/domain/group-color"
import { roomFor } from "#lib/domain/home"
import { ledgersFor } from "#lib/domain/ledger"
import { locationId } from "#lib/domain/locations"
import { ownerId } from "#lib/domain/owner"
import { openPeriod } from "#lib/domain/statement"
import { BACKUP_V4 } from "#lib/storage/transfer-v4"

const BANKS: Record<string, readonly string[]> = {
	KBank: ["Visa Platinum", "THE WISDOM", "Shopee Platinum", "Mastercard Titanium"],
	SCB: ["M Visa", "Prestige", "Up2Me", "First"],
	UOB: ["Preferred Platinum", "Yolo", "PRVI Miles", "One"],
	Krungsri: ["Now", "Platinum", "Central The 1", "HomePro"],
	KTC: ["Titanium", "X Visa Signature", "Proud", "Forever"],
	TTB: ["So Fast", "Reserve", "So Chill"],
	Citi: ["Premier Miles", "Cash Back", "Rewards"],
	BBL: ["Visa Signature", "Infinite", "Platinum"],
	Aeon: ["Royal Orchid Plus", "Wellness", "Gold"],
	CardX: ["Life", "Reserve", "Hybrid"],
}
const OWNER_NAMES = ["Mom", "Dad", "สมศรี", "Tee", "Ploy", "Aunt Noi", "สมชาย", "Bank"]
const PLACE_NAMES = ["Chiang Mai", "Hat Yai", "Khon Kaen", "Phuket", "Head office", "บ้านแม่"]
const NOTES = [
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
	"ค่าน้ำประปา",
	"HomePro: paint and brushes",
	"Hotel deposit",
	"Office supplies: printer toner, A4 paper and a note long enough to wrap on a phone",
]
const PAYMENT_NOTES = ["From KBank savings", "โอนจากบัญชีออมทรัพย์", "Payday", "Mobile banking"]

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
 * Those scenarios always hold. Around them `seed` draws the rest: banks, names, ids and last 4,
 * cycles, how far back each card goes, amounts and notes, and a varying number of extra cards,
 * groups, owners, places, saved lists and plans. The same `today` and `seed` give the same file;
 * with no seed, the day is the seed.
 */
export function buildMockBackup(today: PlainDate, seed: string = today): BackupV4 {
	const random = seeded(`${seed}/${today}`)
	const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
	const between = (low: number, high: number): number => low + Math.floor(random() * (high - low + 1))
	const chance = (odds: number): boolean => random() < odds
	const shuffle = <T>(items: readonly T[]): T[] =>
		items
			.map((item) => ({ item, key: random() }))
			.sort((a, b) => a.key - b.key)
			.map(({ item }) => item)
	const baht = (low: number, high: number): number => between(low * 100, high * 100)
	const uuid = (): string => {
		const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("")
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
	}
	const instant = (date: PlainDate): string =>
		`${date}T${String(between(1, 10)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}:00.000Z`

	// Owners: the starting three, some extras, and a last one nothing names.
	const owners: OwnerRecord[] = [
		{ id: "KC", name: "KC" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
	]
	for (const name of shuffle(OWNER_NAMES).slice(0, between(2, 5))) owners.push({ id: ownerId(name, owners), name })
	const unusedOwner = owners.at(-1)?.id
	const usable = owners.filter((o) => o.id !== unusedOwner).map((o) => o.id)
	const someOwner = (not?: string): string => pick(usable.filter((id) => id !== not))

	// Places: the starting three (only Krabi takes purchases), extras, and a last one with no cards.
	const locations: LocationRecord[] = [
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "phichit", name: "Phichit", takesPurchases: false },
		{ id: "krabi", name: "Krabi", takesPurchases: true },
	]
	for (const name of shuffle(PLACE_NAMES).slice(0, between(2, 4))) {
		locations.push({ id: locationId(name, locations), name, takesPurchases: chance(0.6) })
	}
	const emptyPlace = locations.at(-1)?.id
	const places = locations.filter((l) => l.id !== emptyPlace)
	const readyPlace = (): string => pick(places.filter((l) => l.takesPurchases)).id
	const idlePlace = (): string => pick(places.filter((l) => !l.takesPurchases)).id

	// Groups, each a bank of its own. Limits are set once the ledgers are known, so each lands
	// where it is meant to; the spare one has no colour, as a group saved before colours had.
	const banks = shuffle(Object.keys(BANKS))
	const colors = shuffle(GROUP_COLORS)
	const limitGroups: LimitGroup[] = []
	const bankOf = new Map<string, string>()
	const group = (owner: string, withColor = true): LimitGroup => {
		const bank = banks[limitGroups.length % banks.length] ?? "KBank"
		const name = pick([`${bank} account`, `${bank} pool`, `บัญชี ${bank}`])
		const record: LimitGroup = { id: uuid(), name, limit: 1, owner }
		if (withColor) record.color = colors[limitGroups.length % colors.length] ?? "blue"
		limitGroups.push(record)
		bankOf.set(record.id, bank)
		return record
	}
	const within = group(someOwner())
	const high = group(someOwner())
	const over = group(someOwner())
	const credit = group(someOwner())
	const spare = group(someOwner(), false)
	const fresh = group(someOwner())
	const extraGroups = Array.from({ length: between(0, 2) }, () => group(someOwner()))

	// Card ids in the card id form: a number, sometimes after a letter, and `<parent>.<n>` for a
	// card on the same account.
	const takenIds = new Set<string>()
	const cardId = (parent?: string): string => {
		for (;;) {
			const id = parent
				? `${parent}.${between(1, 9)}`
				: `${chance(0.25) ? pick(["k", "s", "u", "b"]) : ""}${between(1, 60)}`
			if (!takenIds.has(id)) {
				takenIds.add(id)
				return id
			}
		}
	}
	const last4 = (): string => String(between(0, 9_999)).padStart(4, "0")

	// An offset cycle whose latest statement closed about `daysAgo` days ago (a few more when that
	// lands past the 28th, so every month has the close day), due `dueFromToday` days from today.
	const closedAgo = (daysAgo: number, dueFromToday: number): CycleRule => {
		let back = daysAgo
		while (parseDate(addDays(today, -back)).day > 28) back++
		return { kind: "offset", closeDay: parseDate(addDays(today, -back)).day, dueOffsetDays: back + dueFromToday }
	}
	const anyCycle = (): CycleRule =>
		chance(0.5)
			? { kind: "offset", closeDay: between(1, 31), dueOffsetDays: between(10, 30) }
			: { kind: "fixed", closeDay: between(1, 31), dueDay: between(1, 31) }

	type Ending = "paid" | "unpaid" | "partial"
	type History = { from: number; to?: number; every?: number; ending?: Ending; perMonth?: [number, number] }
	const cards: Card[] = []
	const histories = new Map<string, History>()
	const card = (
		owner: LimitGroup,
		fields: Pick<Card, "location" | "cycle"> & Partial<Card>,
		history?: History,
		parent?: Card,
	): Card => {
		const bank = bankOf.get(owner.id) ?? "KBank"
		const supplementary = fields.supplementary ?? false
		const made: Card = {
			id: cardId(parent?.id),
			name: `${bank} ${pick(BANKS[bank] ?? ["Card"])}${supplementary ? pick([" (supplementary)", " (บัตรเสริม)"]) : ""}`,
			last4: last4(),
			supplementary,
			archived: false,
			limitGroupId: owner.id,
			...fields,
		}
		cards.push(made)
		if (history) histories.set(made.id, history)
		return made
	}

	const main = card(
		within,
		{
			location: readyPlace(),
			cycle: { kind: "fixed", closeDay: between(15, 28), dueDay: between(1, 10) },
			comment: pick(["Company fuel and supplies", "ใช้ซื้อของเข้าร้าน", "Main card"]),
		},
		{ from: between(40, 52), perMonth: [2, 6] },
	)
	const supplementary = card(
		within,
		{
			location: readyPlace(),
			supplementary: true,
			owner: someOwner(within.owner),
			cycle: { kind: "offset", closeDay: between(1, 28), dueOffsetDays: between(15, 25) },
		},
		{ from: between(12, 24), every: between(2, 3) },
		main,
	)
	const closeDay = between(5, 20)
	card(
		within,
		{
			location: idlePlace(),
			archived: true,
			cycle: { kind: "fixed", closeDay, dueDay: closeDay + between(3, 8) },
			comment: "Replaced by the new card",
		},
		{ from: between(40, 60), to: between(10, 20) },
		main,
	)
	const overdue = card(
		high,
		{ location: readyPlace(), cycle: closedAgo(between(15, 22), -between(3, 10)) },
		{ from: between(6, 18), ending: "unpaid" },
	)
	const closing = card(
		high,
		{
			location: readyPlace(),
			cycle: { kind: "offset", closeDay: parseDate(today).day, dueOffsetDays: between(10, 25) },
		},
		{ from: between(4, 12) },
	)
	const soon = card(
		over,
		{ location: readyPlace(), cycle: closedAgo(between(5, 12), between(1, 6)) },
		{ from: between(6, 14), ending: "partial" },
	)
	const later = card(
		over,
		{ location: readyPlace(), cycle: closedAgo(between(2, 6), between(10, 25)) },
		{ from: between(3, 8), ending: "unpaid" },
	)
	const inCredit = card(
		credit,
		{ location: readyPlace(), cycle: { kind: "offset", closeDay: 31, dueOffsetDays: between(15, 25) } },
		{ from: between(6, 12) },
	)
	card(
		credit,
		{ location: idlePlace(), supplementary: true, owner: someOwner(credit.owner), cycle: inCredit.cycle },
		{ from: between(6, 12), to: between(2, 4) },
		inCredit,
	)
	const unused = card(fresh, { location: pick(places).id, cycle: anyCycle(), comment: "New, not used yet" })

	// Extra cards, every bill paid, anywhere but the spare group and the empty place.
	const homes = [within, high, over, credit, ...extraGroups]
	for (let n = between(0, 6); n > 0; n--) {
		const archived = chance(0.2)
		const from = between(3, 30)
		card(
			pick(homes),
			{ location: pick(places).id, archived, cycle: anyCycle() },
			{ from, ...(archived ? { to: between(1, Math.min(from, 10)) } : {}), perMonth: [0, 4] },
		)
	}

	const recent = addDays(today, -20)
	const purchases: Purchase[] = []
	const purchase = (cardId: string, date: PlainDate, amount: number, note = pick(NOTES), id = uuid()): void => {
		const addedAt =
			compareDates(date, recent) < 0 ? {} : { addedAt: instant(compareDates(date, today) > 0 ? today : date) }
		purchases.push({ id, cardId, date, amount, note, ...addedAt })
	}

	// Each statement's purchases; a skipped month is a quiet one.
	const firstDay = new Map<string, PlainDate>()
	for (const [id, history] of histories) {
		const c = cards.find((x) => x.id === id) as Card
		const open = openPeriod(c, today)
		const [low, high] = history.perMonth ?? [1, 4]
		firstDay.set(id, addDays(closeDateOf(c.cycle, addPeriods(open, -history.from - 1)), 1))
		for (let back = history.from; back >= (history.to ?? 0); back--) {
			if (back % (history.every ?? 1) !== 0) continue
			const period = addPeriods(open, -back)
			const start = addDays(closeDateOf(c.cycle, addPeriods(period, -1)), 1)
			const end = back === 0 ? today : closeDateOf(c.cycle, period)
			const span = Math.max(0, daysBetween(start, end))
			for (let n = between(low, high); n > 0; n--) purchase(id, addDays(start, between(0, span)), baht(80, 9_000))
		}
	}
	// One on a close date, which belongs to the statement it closes, and one dated ahead of today.
	purchase(main.id, closeDateOf(main.cycle, addPeriods(openPeriod(main, today), -between(2, 10))), baht(500, 6_000))
	purchase(main.id, addDays(today, between(2, 10)), baht(500, 3_000), "Booked ahead: hotel deposit")

	// Saved lists: their made lines are the purchases `<list id>-<n>` on the list's date.
	const lists: PurchaseList[] = []
	const savedList = (date: PlainDate, lines: PurchaseList["lines"], movedTo?: string): void => {
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
	}
	const line = (cardId: string, made: boolean): PurchaseList["lines"][number] => {
		const amount = baht(200, 15_000)
		return {
			cardId,
			amount,
			made,
			...(made && chance(0.3) ? { actual: amount + baht(-150, 150) || amount + 100 } : {}),
			...(chance(0.5) ? { note: pick(NOTES.filter(Boolean)) } : {}),
		}
	}
	// One older than three years and one a little over a year back, both on the main card.
	savedList(addDays(today, -1_160), [line(main.id, true), line(main.id, true)])
	savedList(addDays(today, -between(380, 500)), [line(main.id, true), line(overdue.id, true)])
	// Random ones, on ready cards that already had history on that day.
	const spenders = cards.filter((c) => histories.get(c.id)?.to === undefined && c !== unused && !c.archived)
	for (let n = between(2, 6); n > 0; n--) {
		const date = addDays(today, -between(30, 900))
		const able = spenders.filter((c) => compareDates(firstDay.get(c.id) ?? today, date) <= 0)
		if (able.length === 0) continue
		savedList(
			date,
			shuffle(able)
				.slice(0, between(1, 4))
				.map((c) => line(c.id, chance(0.85))),
		)
	}
	// Last week's, with a corrected line, and a not-made line moved to a draft.
	const nextDraftId = uuid()
	const moved = line(later.id, false)
	savedList(
		addDays(today, -6),
		[{ ...line(main.id, true), actual: baht(1_000, 9_000) }, line(closing.id, true), moved],
		nextDraftId,
	)

	// Payments: every closed statement paid in full near its due date, except each card's ending.
	const payments: CardPayment[] = []
	const ledgerOf = (c: Card) => ledgersFor([c], purchases, payments, [], today).get(c.id)
	for (const c of cards) {
		const history = histories.get(c.id)
		if (!history) continue
		const statements = (ledgerOf(c)?.statements ?? []).filter((s) => !s.open && compareDates(s.closeDate, today) < 0)
		const latest = statements[0]?.period
		for (const s of [...statements].reverse()) {
			if (s.total === 0) continue
			const ending = s.period === latest && history.to === undefined ? (history.ending ?? "paid") : "paid"
			if (ending === "unpaid") continue
			let date = addDays(dueDateOf(c.cycle, s.period), -between(0, 5))
			if (compareDates(date, s.closeDate) <= 0) date = addDays(s.closeDate, 1)
			if (compareDates(date, today) > 0) date = today
			const partial = ending === "partial"
			const amount = partial ? Math.max(100, Math.round(s.total * (between(20, 70) / 100))) : s.total
			const note = partial ? "Part now, the rest on payday" : chance(0.2) ? pick(PAYMENT_NOTES) : undefined
			payments.push({ id: uuid(), cardId: c.id, date, amount, status: "paid", ...(note ? { note } : {}) })
		}
	}
	// One record converted from the old per-statement model names the statement it paid.
	const converted = payments.find((p) => p.cardId === main.id)
	if (converted) {
		const paid = ledgerOf(main)?.statements.findLast((s) => s.payments.some((part) => part.payment.id === converted.id))
		if (paid) converted.period = paid.period
	}
	// More than it owes: the rest stays on the card as credit.
	payments.push({
		id: uuid(),
		cardId: inCredit.id,
		date: addDays(today, -between(1, 5)),
		amount: (ledgerOf(inCredit)?.owed ?? 0) + baht(5_000, 40_000),
		status: "paid",
		note: "Bonus",
	})
	// Plans: late (still not marked paid), within the next three days, and later.
	payments.push(
		{ id: uuid(), cardId: soon.id, date: addDays(today, -between(1, 3)), amount: baht(500, 5_000), status: "planned" },
		{ id: uuid(), cardId: later.id, date: addDays(today, between(1, 3)), amount: baht(500, 3_000), status: "planned" },
		{
			id: uuid(),
			cardId: overdue.id,
			date: addDays(today, between(10, 40)),
			amount: baht(2_000, 15_000),
			status: "planned",
		},
	)
	for (let n = between(0, 3); n > 0; n--) {
		const note = chance(0.5) ? { note: pick(PAYMENT_NOTES) } : {}
		const date = addDays(today, between(5, 60))
		payments.push({
			id: uuid(),
			cardId: pick(spenders).id,
			date,
			amount: baht(500, 20_000),
			status: "planned",
			...note,
		})
	}

	const ledgers = ledgersFor(cards, purchases, payments, [], today)

	// Kept dates for each fully paid statement; the main card's oldest from before its cycle changed.
	const oldCycle: CycleRule = { kind: "fixed", closeDay: between(1, 14), dueDay: between(15, 28) }
	const cutover = addPeriods(openPeriod(main, today), -between(20, 34))
	const statementDates: StatementDates[] = []
	for (const c of cards) {
		for (const s of ledgers.get(c.id)?.statements ?? []) {
			if (!s.paid || s.open) continue
			const rule = c === main && s.period < cutover ? oldCycle : c.cycle
			statementDates.push({
				cardId: c.id,
				period: s.period,
				closeDate: closeDateOf(rule, s.period),
				dueDate: dueDateOf(rule, s.period),
			})
		}
	}
	// Kept while the statement still owed money (before DD-167); the ledger ignores it.
	const partly = ledgers.get(soon.id)?.statements.find((s) => !s.open && s.remaining > 0 && s.paidAmount > 0)
	if (partly) {
		statementDates.push({
			cardId: soon.id,
			period: partly.period,
			closeDate: partly.closeDate,
			dueDate: partly.dueDate,
		})
	}

	// Limits: the high group 80-95% used, the over group past it, the rest well within.
	const used = (g: LimitGroup): number =>
		cards
			.filter((c) => c.limitGroupId === g.id)
			.reduce((sum, c) => sum + (ledgers.get(c.id)?.owed ?? 0) - (ledgers.get(c.id)?.credit ?? 0), 0)
	const roundUp = (satang: number): number => Math.ceil(satang / 100_000) * 100_000
	for (const g of [within, credit, spare, fresh, ...extraGroups]) {
		g.limit = Math.max(baht(20_000, 300_000), roundUp(Math.max(used(g), 0) * between(3, 5)))
	}
	// Rounded down, so the share never slips under 80%.
	high.limit = Math.floor(used(high) / (between(80, 95) / 100) / 100) * 100
	over.limit = Math.max(100, Math.floor((used(over) * (between(60, 95) / 100)) / 100) * 100)

	// Waiting for the spender: holds room on the main account and the over group.
	lists.push({
		id: uuid(),
		date: today,
		status: "sent",
		sentAt: instant(today),
		lines: [line(main.id, false), line(supplementary.id, false), line(soon.id, false)].map(
			({ made: _, ...waiting }) => waiting,
		),
	})

	// The draft the not-made line moved to, and one raising every warning: over the room (main),
	// a shared limit (both cards of the over group), an overdue bill and today's close date.
	lists.push({
		id: nextDraftId,
		date: addDays(today, 1),
		status: "draft",
		lines: [{ cardId: later.id, amount: moved.amount }],
	})
	const draftId = uuid()
	const room = roomFor(main, { cards, groups: limitGroups, ledgers, lists }, draftId)?.room ?? 0
	lists.push({
		id: draftId,
		date: today,
		status: "draft",
		lines: [
			{ cardId: main.id, amount: Math.max(room, 0) + baht(1_000, 20_000), note: "New generator" },
			{ cardId: soon.id, amount: baht(500, 5_000) },
			{ cardId: later.id, amount: baht(500, 5_000) },
			{ cardId: overdue.id, amount: baht(100, 2_000) },
			{ cardId: closing.id, amount: baht(500, 5_000), note: "ค่าอาหารทีมงาน" },
			{ cardId: inCredit.id, amount: 0 },
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

/** mulberry32, seeded from the text, so a seed always draws the same numbers. */
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
	const seed = arg("seed") ?? crypto.randomUUID().slice(0, 8)
	const out = arg("out") ?? `cc-tracking-mock-${day}-${seed}.json`
	const backup = buildMockBackup(day, seed)
	await Bun.write(out, `${JSON.stringify(backup, null, "\t")}\n`)
	console.log(
		`${out}: ${backup.cards.length} cards, ${backup.purchases.length} purchases, ${backup.payments.length} payments, ${backup.lists.length} lists (today ${day}, seed ${seed}; --seed ${seed} draws it again)`,
	)
}
