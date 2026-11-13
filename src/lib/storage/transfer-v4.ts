import type {
	Card,
	CardPayment,
	LimitGroup,
	LocationRecord,
	OwnerRecord,
	Purchase,
	PurchaseList,
	StatementDates,
} from "#lib/domain/types"
import type { MessageKey } from "#lib/i18n/catalog"
import type { Repository } from "#lib/storage/repository"

import { isCardId } from "#lib/domain/card"
import { toGroupColor } from "#lib/domain/group-color"
import { defaultLocations } from "#lib/domain/locations"
import { canDeleteOwner, DEFAULT_OWNERS } from "#lib/domain/owner"
import { MessageError } from "#lib/i18n/error"
import { assignGroupColors } from "#lib/storage/assign-group-colors"
import {
	cardProblem,
	isInteger,
	isList,
	isNonEmptyString,
	isPlainDate,
	isPlainObject,
	limitGroupProblem,
	prop,
	purchaseProblem,
} from "#lib/storage/transfer"

export const BACKUP_V4 = 4
/** The oldest version restore still reads (DD-202). */
const BACKUP_OLDEST = 3

/** The starting owners, fresh each time, so a caller's edit can't reach the constant. */
const startingOwners = (): OwnerRecord[] => DEFAULT_OWNERS.map((owner) => ({ ...owner }))

export type BackupV4 = {
	version: 4
	exportedAt: string
	limitGroups: LimitGroup[]
	cards: Card[]
	purchases: Purchase[]
	payments: CardPayment[]
	statementDates: StatementDates[]
	lists: PurchaseList[]
	locations: LocationRecord[]
	/** Version 4 on (RD-30); a version 3 file carries the starting three, its closed set. */
	owners: OwnerRecord[]
}

export async function exportBackupV4(repo: Repository, now: Date): Promise<BackupV4> {
	const limitGroups = await repo.listLimitGroups()
	const cards = await repo.listCards()
	// Never a file its own parser refuses: with no records stored yet (before the seed ran),
	// the cards still name one of the starting places, so those travel instead.
	const stored = await repo.listLocations()
	const locations = stored.length > 0 ? stored : defaultLocations(await repo.getSettings())
	const owners = await repo.listOwners()
	const purchases: Purchase[] = []
	const payments: CardPayment[] = []
	const statementDates: StatementDates[] = []
	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)))
		payments.push(...(await repo.listCardPayments(card.id)))
		statementDates.push(...(await repo.listStatementDates(card.id)))
	}
	return {
		version: BACKUP_V4,
		exportedAt: now.toISOString(),
		limitGroups,
		cards,
		purchases,
		payments,
		statementDates,
		lists: await repo.listPurchaseLists(),
		locations,
		owners: owners.length > 0 ? owners : startingOwners(),
	}
}

/** How many of each record a backup holds, or a repository holds now. */
export type V4Counts = {
	cards: number
	purchases: number
	payments: number
	limitGroups: number
	lists: number
}

export const backupCounts = (backup: BackupV4): V4Counts => ({
	cards: backup.cards.length,
	purchases: backup.purchases.length,
	payments: backup.payments.length,
	limitGroups: backup.limitGroups.length,
	lists: backup.lists.length,
})

export async function countRecordsV4(repo: Repository): Promise<V4Counts> {
	return backupCounts(await exportBackupV4(repo, new Date()))
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

/**
 * A card's problem, checking its location against `locationIds` and its owner against
 * `ownerIds` when given (version 4). In either version its id must be in the card id form
 * (RD-28) and it must name one of the file's `groupIds` (RD-27): a card without a limit group
 * is invalid data.
 */
const cardAllProblem =
	(groupIds: ReadonlySet<string>, locationIds: ReadonlySet<string>, ownerIds?: ReadonlySet<string>) =>
	(value: unknown): MessageKey | null => {
		const problem = cardProblem(value, locationIds, ownerIds)
		if (problem) return problem
		const card = value as Record<string, unknown>
		if (!isCardId(prop(card, "id") as string)) return "backup.problem.badCardId"
		const group = prop(card, "limitGroupId")
		if (group === undefined || group === "") return "backup.problem.missingLimitGroup"
		if (typeof group !== "string" || !groupIds.has(group)) return "backup.problem.unknownLimitGroup"
		return cardRangeProblem(card)
	}

function purchaseAllProblem(value: unknown): MessageKey | null {
	const problem = purchaseProblem(value)
	if (problem) return problem
	return isPositiveAmount(prop(value as Record<string, unknown>, "amount")) ? null : "backup.problem.badAmountRange"
}

/** A limit group's problem, checking its owner against `ownerIds` when given (version 4). */
const limitGroupAllProblem =
	(ownerIds?: ReadonlySet<string>) =>
	(value: unknown): MessageKey | null => {
		const problem = limitGroupProblem(value, ownerIds)
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
		// A draft keeps a card with no amount yet as 0 (DD-187).
		const amount = prop(line, "amount")
		if (!isPositiveAmount(amount) && !(status === "draft" && amount === 0)) return "backup.problem.badLineAmount"
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

function ownerRecordProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject"
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId"
	if (!isNonEmptyString(prop(value, "name"))) return "backup.problem.missingName"
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
 * Reads a version 3 or 4 file as version 4, rejecting the whole file before anything is
 * written when any record breaks a shape or range rule (RD-06). Any other version, the
 * retired versions 1 and 2 included, is rejected as one this app does not read. A file's cards
 * must each name one of its own locations. A version 4 file's groups and supplementary cards
 * must each name one of its own owners; a version 3 file keeps the closed set of owners and
 * carries the starting three (DC-06).
 */
export function parseAnyBackup(text: string): BackupV4 {
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
	// With no version at all it is some other JSON, not a backup of a version this app skips.
	if (version === undefined) throw new MessageError("backup.unreadable")
	if (version !== BACKUP_OLDEST && version !== BACKUP_V4) {
		throw new MessageError("backup.version", {
			found: JSON.stringify(version),
			oldest: BACKUP_OLDEST,
			newest: BACKUP_V4,
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

	// Owners first: in a version 4 file each group and supplementary card names one of them.
	let owners = startingOwners()
	let ownerIds: ReadonlySet<string> | undefined
	if (version === BACKUP_V4) {
		const listed = prop(value, "owners")
		if (!isList(listed)) throw new MessageError("backup.unreadable")
		check(listed, "backup.owner", ownerRecordProblem)
		owners = listed as OwnerRecord[]
		ownerIds = new Set(owners.map((owner) => owner.id))
	}

	check(limitGroups, "backup.limitGroup", limitGroupAllProblem(ownerIds))
	const groupIds = new Set((limitGroups as LimitGroup[]).map((group) => group.id))

	const statementDates = prop(value, "statementDates")
	const lists = prop(value, "lists")
	const locations = prop(value, "locations")
	if (!isList(statementDates) || !isList(lists) || !isList(locations)) {
		throw new MessageError("backup.unreadable")
	}
	// Locations first: each card must name one of the file's own locations.
	check(locations, "backup.location", locationProblem)
	const locationIds = new Set((locations as LocationRecord[]).map((location) => location.id))
	check(cards, "backup.card", cardAllProblem(groupIds, locationIds, ownerIds))
	check(purchases, "backup.purchase", purchaseAllProblem)
	check(payments, "backup.cardPayment", cardPaymentProblem)
	check(statementDates, "backup.statementDates", statementDatesProblem)
	check(lists, "backup.list", listProblem)

	return {
		version: BACKUP_V4,
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
		owners,
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

/**
 * True when every stored owner is one of the three starting owners under its own initials:
 * what a new or reset browser holds once seeded, before the reader renamed or added one. An
 * empty list counts too.
 */
export function onlySeededOwners(records: OwnerRecord[]): boolean {
	return records.every((record) => DEFAULT_OWNERS.some((seed) => seed.id === record.id && seed.name === record.name))
}

/** How `importBackupV4` treats the stored locations and owners. */
export type ImportOptions = {
	/**
	 * Restoring into a browser with nothing in it yet: when the stored locations are only
	 * untouched starting places (`onlySeededDefaults`), the file's locations are written over
	 * them, and a starting place the file lacks that no card uses goes. A file with no locations
	 * leaves them alone. Over any other stored location the
	 * keep-local rule holds as without this option. Owners follow the same rule
	 * (`onlySeededOwners`): a starting owner the file lacks goes while nothing names it.
	 */
	overSeeded?: boolean
}

/**
 * Additive: writes every record over whatever shares its key, except locations and owners: a
 * file's location or owner whose id is already stored is skipped, so an old backup cannot undo
 * a rename or a *Takes purchases* tick (see `ImportOptions.overSeeded` for the one exception). Settings are
 * never touched, and no stored record is deleted.
 */
export async function importBackupV4(repo: Repository, backup: BackupV4, options: ImportOptions = {}): Promise<void> {
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
	const storedOwners = await repo.listOwners()
	const overwriteOwners = options.overSeeded === true && backup.owners.length > 0 && onlySeededOwners(storedOwners)
	const storedOwnerIds = new Set(storedOwners.map((owner) => owner.id))
	for (const owner of backup.owners) {
		if (overwriteOwners || !storedOwnerIds.has(owner.id)) await repo.saveOwner(owner)
	}
	for (const card of backup.cards) await repo.saveCard(card)
	for (const purchase of backup.purchases) await repo.savePurchase(purchase)
	for (const payment of backup.payments) await repo.saveCardPayment(payment)
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
	if (overwriteOwners) {
		// Likewise a starting owner the file does without, unless a group or card still names it.
		const kept = new Set(backup.owners.map((owner) => owner.id))
		const [groups, cards] = await Promise.all([repo.listLimitGroups(), repo.listCards()])
		for (const seed of storedOwners) {
			if (!kept.has(seed.id) && canDeleteOwner(seed.id, groups, cards)) await repo.deleteOwner(seed.id)
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
 * Destructive: forgets everything stored, then writes the backup, so the file's location and
 * owner records are the ones kept. Every group leaves with a colour (`importBackupV4` assigns
 * them), so the colours marker is not needed and `clearAll` having removed it is harmless.
 */
export async function replaceWithBackupV4(repo: Repository, backup: BackupV4): Promise<void> {
	await repo.clearAll()
	await importBackupV4(repo, backup)
}
