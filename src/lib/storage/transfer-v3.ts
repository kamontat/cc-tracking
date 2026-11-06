import type {
	Card,
	CardPayment,
	LimitGroup,
	LocationRecord,
	Purchase,
	PurchaseList,
	StatementDates,
	StatementPayment,
} from "#lib/domain/types"
import type { MessageKey } from "#lib/i18n/catalog"
import type { Repository } from "#lib/storage/repository"

import { toGroupColor } from "#lib/domain/group-color"
import { defaultLocations } from "#lib/domain/locations"
import { toSettings } from "#lib/domain/settings"
import { MessageError } from "#lib/i18n/error"
import { assignGroupColors } from "#lib/storage/assign-group-colors"
import { convertPayments, PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments"
import {
	cardProblem,
	isInteger,
	isList,
	isNonEmptyString,
	isPlainDate,
	isPlainObject,
	limitGroupProblem,
	paymentProblem,
	prop,
	purchaseProblem,
} from "#lib/storage/transfer"

export const BACKUP_V3 = 3

export type BackupV3 = {
	version: 3
	exportedAt: string
	limitGroups: LimitGroup[]
	cards: Card[]
	purchases: Purchase[]
	payments: CardPayment[]
	statementDates: StatementDates[]
	lists: PurchaseList[]
	locations: LocationRecord[]
	/**
	 * Set by `parseAnyBackup` on a file converted from version 2 during this import, never
	 * written by `exportBackupV3`. Only then does an import clear a card's stale converted
	 * payment parts (DD-95).
	 */
	converted?: true
}

export async function exportBackupV3(repo: Repository, now: Date): Promise<BackupV3> {
	const limitGroups = await repo.listLimitGroups()
	const cards = await repo.listCards()
	// Never a file its own parser refuses: with no records stored yet (before the seed ran),
	// the cards still name one of the starting places, so those travel instead.
	const stored = await repo.listLocations()
	const locations = stored.length > 0 ? stored : defaultLocations(await repo.getSettings())
	const purchases: Purchase[] = []
	const payments: CardPayment[] = []
	const statementDates: StatementDates[] = []
	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)))
		payments.push(...(await repo.listCardPayments(card.id)))
		statementDates.push(...(await repo.listStatementDates(card.id)))
	}
	return {
		version: BACKUP_V3,
		exportedAt: now.toISOString(),
		limitGroups,
		cards,
		purchases,
		payments,
		statementDates,
		lists: await repo.listPurchaseLists(),
		locations,
	}
}

/** How many of each record a backup holds, or a repository holds now. */
export type V3Counts = {
	cards: number
	purchases: number
	payments: number
	limitGroups: number
	lists: number
}

export const backupCounts = (backup: BackupV3): V3Counts => ({
	cards: backup.cards.length,
	purchases: backup.purchases.length,
	payments: backup.payments.length,
	limitGroups: backup.limitGroups.length,
	lists: backup.lists.length,
})

export async function countRecordsV3(repo: Repository): Promise<V3Counts> {
	return backupCounts(await exportBackupV3(repo, new Date()))
}

/** A positive whole number of satang (DR-01). */
const isPositiveAmount = (value: unknown): boolean => isInteger(value) && value > 0

const inRange = (value: unknown, low: number, high: number): boolean =>
	isInteger(value) && value >= low && value <= high

/** DR-25 and DR-26, checked once the card's shape is known to be sound. */
function cardRangeProblem(card: Record<string, unknown>): MessageKey | null {
	if (!/^\d{4}$/.test(String(prop(card, "last4")))) return "backup.problem.badLast4"
	const cycle = prop(card, "cycle")
	if (!isPlainObject(cycle)) return null
	if (!inRange(prop(cycle, "closeDay"), 1, 31)) return "backup.problem.badCloseDay"
	if (prop(cycle, "kind") === "fixed") {
		return inRange(prop(cycle, "dueDay"), 1, 31) ? null : "backup.problem.badDueDay"
	}
	return inRange(prop(cycle, "dueOffsetDays"), 1, 60) ? null : "backup.problem.badDueOffset"
}

/** A card's problem, checking its location against `locationIds` when given (version 3). */
const cardAllProblem =
	(locationIds?: ReadonlySet<string>) =>
	(value: unknown): MessageKey | null => {
		const problem = cardProblem(value, locationIds)
		if (problem) return problem
		return cardRangeProblem(value as Record<string, unknown>)
	}

function purchaseAllProblem(value: unknown): MessageKey | null {
	const problem = purchaseProblem(value)
	if (problem) return problem
	return isPositiveAmount(prop(value as Record<string, unknown>, "amount")) ? null : "backup.problem.badAmountRange"
}

function limitGroupAllProblem(value: unknown): MessageKey | null {
	const problem = limitGroupProblem(value)
	if (problem) return problem
	return isPositiveAmount(prop(value as Record<string, unknown>, "limit")) ? null : "backup.problem.badLimitRange"
}

function cardPaymentProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject"
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId"
	if (!isNonEmptyString(prop(value, "cardId"))) return "backup.problem.missingCardId"
	if (!isPlainDate(prop(value, "date"))) return "backup.problem.badDate"
	if (!isPositiveAmount(prop(value, "amount"))) return "backup.problem.badAmountRange"
	const status = prop(value, "status")
	if (status !== "planned" && status !== "paid") return "backup.problem.badPaymentStatus"
	const period = prop(value, "period")
	if (period !== undefined && !isNonEmptyString(period)) return "backup.problem.missingPeriod"
	const note = prop(value, "note")
	if (note !== undefined && typeof note !== "string") return "backup.problem.badNote"
	return null
}

function statementDatesProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject"
	if (!isNonEmptyString(prop(value, "cardId"))) return "backup.problem.missingCardId"
	if (!isNonEmptyString(prop(value, "period"))) return "backup.problem.missingPeriod"
	if (!isPlainDate(prop(value, "closeDate"))) return "backup.problem.badCloseDate"
	if (!isPlainDate(prop(value, "dueDate"))) return "backup.problem.badDueDate"
	return null
}

function listProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject"
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId"
	if (!isPlainDate(prop(value, "date"))) return "backup.problem.badDate"
	const status = prop(value, "status")
	if (status !== "draft" && status !== "sent" && status !== "saved") return "backup.problem.badListStatus"
	const lines = prop(value, "lines")
	if (!isList(lines)) return "backup.problem.badLines"
	for (const line of lines) {
		if (!isPlainObject(line) || !isNonEmptyString(prop(line, "cardId"))) return "backup.problem.badLines"
		if (!isPositiveAmount(prop(line, "amount"))) return "backup.problem.badLineAmount"
		const made = prop(line, "made")
		if (made !== undefined && typeof made !== "boolean") return "backup.problem.badLineMade"
		const actual = prop(line, "actual")
		if (actual !== undefined && !isPositiveAmount(actual)) return "backup.problem.badLineActual"
		const note = prop(line, "note")
		if (note !== undefined && typeof note !== "string") return "backup.problem.badNote"
	}
	return null
}

function locationProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject"
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId"
	if (!isNonEmptyString(prop(value, "name"))) return "backup.problem.missingName"
	if (typeof prop(value, "takesPurchases") !== "boolean") return "backup.problem.badTakesPurchases"
	return null
}

function check(records: unknown[], key: MessageKey, problemOf: (value: unknown) => MessageKey | null): void {
	for (const [index, record] of records.entries()) {
		const problem = problemOf(record)
		if (problem) throw new MessageError(key, { index: index + 1, problem })
	}
}

/** A record whose note is trimmed, and absent when blank (DC-07), as the app saves it. */
function trimmedNote<T extends { note?: string }>(record: T): T {
	if (record.note === undefined) return record
	const { note, ...rest } = record
	const trimmed = note.trim()
	return (trimmed ? { ...rest, note: trimmed } : rest) as T
}

/**
 * Reads a version 2 or version 3 file as version 3, rejecting the whole file before
 * anything is written when any record breaks a shape or range rule (RD-06). A version 2
 * file's payments convert to card payments, its locations come from its settings (none when
 * it has no settings, so stored locations are left alone, DC-05), it has no lists, and it is
 * marked `converted`. A version 3 file's cards must each name one of its own locations; a
 * version 2 file's cards keep the closed set (DC-06).
 */
export function parseAnyBackup(text: string): BackupV3 {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch (cause) {
		const failure = new MessageError("backup.unreadable")
		failure.cause = cause
		throw failure
	}
	if (!isPlainObject(value)) throw new MessageError("backup.unreadable")

	const version = prop(value, "version")
	if (version !== 2 && version !== BACKUP_V3) {
		throw new MessageError("backup.version", {
			found: JSON.stringify(version),
			expected: BACKUP_V3,
		})
	}

	const limitGroups = prop(value, "limitGroups")
	const cards = prop(value, "cards")
	const purchases = prop(value, "purchases")
	const payments = prop(value, "payments")
	if (!isList(limitGroups) || !isList(cards) || !isList(purchases) || !isList(payments)) {
		throw new MessageError("backup.unreadable")
	}
	const stamp = prop(value, "exportedAt")
	const exportedAt = isNonEmptyString(stamp) ? stamp : new Date(0).toISOString()

	check(limitGroups, "backup.limitGroup", limitGroupAllProblem)

	if (version === 2) {
		check(cards, "backup.card", cardAllProblem())
		check(purchases, "backup.purchase", purchaseAllProblem)
		check(payments, "backup.payment", paymentProblem)
		// A file without settings leaves stored settings alone (DC-05), so it brings no
		// locations either: only a file that carries settings may say where purchases happen.
		const settings = prop(value, "settings")
		const locations = isPlainObject(settings) ? defaultLocations(toSettings(settings)) : []
		const converted = convertPayments(cards as Card[], purchases as Purchase[], payments as StatementPayment[])
		return {
			version: BACKUP_V3,
			exportedAt,
			limitGroups: limitGroups as LimitGroup[],
			cards: cards as Card[],
			purchases: purchases as Purchase[],
			payments: converted.payments,
			statementDates: converted.dates,
			lists: [],
			locations,
			converted: true,
		}
	}

	const statementDates = prop(value, "statementDates")
	const lists = prop(value, "lists")
	const locations = prop(value, "locations")
	if (!isList(statementDates) || !isList(lists) || !isList(locations)) {
		throw new MessageError("backup.unreadable")
	}
	// Locations first: each card must name one of the file's own locations.
	check(locations, "backup.location", locationProblem)
	const locationIds = new Set((locations as LocationRecord[]).map((location) => location.id))
	check(cards, "backup.card", cardAllProblem(locationIds))
	check(purchases, "backup.purchase", purchaseAllProblem)
	check(payments, "backup.cardPayment", cardPaymentProblem)
	check(statementDates, "backup.statementDates", statementDatesProblem)
	check(lists, "backup.list", listProblem)

	return {
		version: BACKUP_V3,
		exportedAt,
		limitGroups: limitGroups as LimitGroup[],
		cards: cards as Card[],
		purchases: purchases as Purchase[],
		payments: (payments as CardPayment[]).map(trimmedNote),
		statementDates: statementDates as StatementDates[],
		lists: (lists as PurchaseList[]).map((list) => ({
			...list,
			lines: list.lines.map(trimmedNote),
		})),
		locations: locations as LocationRecord[],
	}
}

/**
 * True when every stored location is one of the three starting places, under its id and its
 * English starting name (ticks aside): what a new or reset browser holds once seeded, before
 * the reader renamed a place or added one. An empty list counts too.
 */
export function onlySeededDefaults(records: LocationRecord[]): boolean {
	const defaults = defaultLocations({ purchaseLocations: [] })
	return records.every((record) => defaults.some((seed) => seed.id === record.id && seed.name === record.name))
}

/** How `importBackupV3` treats the stored locations. */
export type ImportOptions = {
	/**
	 * Restoring into a browser with nothing in it yet: when the stored locations are only
	 * untouched starting places (`onlySeededDefaults`), the file's locations are written over
	 * them, and a starting place the file lacks that no card uses goes. A file with no locations
	 * (a version 2 file without settings) leaves them alone. Over any other stored location the
	 * keep-local rule holds as without this option.
	 */
	overSeeded?: boolean
}

/**
 * Additive: writes every record over whatever shares its key, except locations: a file's
 * location whose id is already stored is skipped, so an old backup cannot undo a rename or a
 * *Takes purchases* tick (see `ImportOptions.overSeeded` for the one exception). Settings are
 * never touched. Otherwise the one deletion is a converted version 2 file's stale parts
 * (DD-95): before writing an `m:` payment with a period, the card's stored
 * `m:<card>:<period>:` payments go, so a record that now converts to fewer parts leaves none
 * behind. A version 3 file deletes nothing else.
 */
export async function importBackupV3(repo: Repository, backup: BackupV3, options: ImportOptions = {}): Promise<void> {
	// A file's colour wins when it is a valid one; otherwise the stored group keeps its own,
	// and a group new to the device gets one below. A colour never makes a restore refuse.
	const storedGroups = new Map((await repo.listLimitGroups()).map((group) => [group.id, group]))
	for (const { color, ...group } of backup.limitGroups) {
		const kept = toGroupColor(color) ?? storedGroups.get(group.id)?.color
		await repo.saveLimitGroup(kept ? { ...group, color: kept } : group)
	}
	const stored = await repo.listLocations()
	const overwrite = options.overSeeded === true && backup.locations.length > 0 && onlySeededDefaults(stored)
	const storedLocations = new Set(stored.map((location) => location.id))
	for (const location of backup.locations) {
		if (overwrite || !storedLocations.has(location.id)) await repo.saveLocation(location)
	}
	for (const card of backup.cards) await repo.saveCard(card)
	for (const purchase of backup.purchases) await repo.savePurchase(purchase)
	const cleared = new Set<string>()
	for (const payment of backup.payments) {
		if (backup.converted && payment.id.startsWith("m:") && payment.period) {
			const prefix = `m:${payment.cardId}:${payment.period}:`
			if (!cleared.has(prefix)) {
				cleared.add(prefix)
				for (const stored of await repo.listCardPayments(payment.cardId)) {
					if (stored.id.startsWith(prefix)) await repo.deleteCardPayment(payment.cardId, stored.id)
				}
			}
		}
		await repo.saveCardPayment(payment)
	}
	for (const dates of backup.statementDates) await repo.saveStatementDates(dates)
	for (const list of backup.lists) await repo.savePurchaseList(list)
	if (overwrite) {
		// The starting places the file does without go too, unless a card still sits there.
		const kept = new Set(backup.locations.map((location) => location.id))
		const cards = await repo.listCards()
		for (const seed of stored) {
			if (kept.has(seed.id)) continue
			if (cards.some((card) => card.location === seed.id)) continue
			await repo.deleteLocation(seed.id)
		}
	}
	// The data has landed; a colour that cannot be stored must not report the restore as failed.
	try {
		await assignGroupColors(repo)
	} catch (failure) {
		console.error(failure)
	}
}

/**
 * Destructive: forgets everything stored, then writes the backup, so the file's location
 * records are the ones kept. The payments marker is
 * set again afterwards, so the startup conversion does not run over the restored data. Every
 * group leaves with a colour (`importBackupV3` assigns them), so the colours marker is not
 * needed and `clearAll` having removed it is harmless.
 */
export async function replaceWithBackupV3(
	repo: Repository,
	backup: BackupV3,
	storage: Pick<Storage, "setItem">,
): Promise<void> {
	await repo.clearAll()
	await importBackupV3(repo, backup)
	storage.setItem(PAYMENTS_MIGRATION_KEY, "done")
}
