import type { Card, LimitGroup, OwnerRecord } from "#lib/domain/types"

/** An owner record's id (`OwnerRecord.id`), which groups and supplementary cards store. */
export type Owner = string

/**
 * The three people the app started with, as records: each named by its initials, which are
 * not translated. Seeded once (`seed-owners`), and the closed set a version 2 or 3 backup
 * was written with.
 */
export const DEFAULT_OWNERS: readonly OwnerRecord[] = [
	{ id: "KC", name: "KC" },
	{ id: "NT", name: "NT" },
	{ id: "RI", name: "RI" },
]

export const DEFAULT_OWNER: Owner = "KC"

/**
 * True for one of the starting owners' ids. Takes `unknown`: its callers check a version 2 or
 * 3 backup file, which the type system can't vouch for.
 */
export function isStartingOwner(value: unknown): value is Owner {
	return typeof value === "string" && DEFAULT_OWNERS.some((owner) => owner.id === value)
}

/**
 * Whose account this pool of credit belongs to. `LimitGroup.owner` is optional, so a group
 * written before the field existed carries nothing and lands on the default; the startup
 * repair (`migrate-owners`) has pointed any other value at a stored record by the time a page
 * reads it.
 */
export function ownerOf(group: LimitGroup): Owner {
	return group.owner || DEFAULT_OWNER
}

/**
 * Who holds this card. A supplementary card (บัตรเสริม) is issued to someone other than the
 * account's owner -- KC's account, NT's card -- so it answers with its own `owner`. Every other
 * card, and a supplementary one saved before the field existed, belongs to whoever owns the
 * group it draws on. `null` only for a card with neither: no owner of its own and no group.
 */
export function cardOwnerOf(card: Card, group: LimitGroup | null): Owner | null {
	const own = card.supplementary ? card.owner : undefined
	return own || (group ? ownerOf(group) : null)
}

/** How an owner is shown: its record's name, or the id itself when no record has it. */
export function ownerName(id: Owner, owners: readonly OwnerRecord[] = []): string {
	return owners.find((owner) => owner.id === id)?.name ?? id
}

/** A group as a picker names it: `KBank pool (KC)`, the owner by its stored name. */
export function groupLabel(group: LimitGroup, owners: readonly OwnerRecord[] = []): string {
	return `${group.name} (${ownerName(ownerOf(group), owners)})`
}

/** A to Z by name, the order every picker, filter and section lists owners in. */
export function sortOwners(owners: readonly OwnerRecord[]): OwnerRecord[] {
	return owners.toSorted((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * A slug of `name` that no record in `existing` already uses. A name with no ASCII letters or
 * digits (Thai only, say) falls back to `owner`.
 */
export function ownerId(name: string, existing: readonly OwnerRecord[]): Owner {
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "owner"
	const taken = new Set(existing.map((record) => record.id))
	if (!taken.has(slug)) return slug
	let n = 2
	while (taken.has(`${slug}-${n}`)) n++
	return `${slug}-${n}`
}

/** Changes the name only; the id stays, since groups and cards refer to it. Returns a new array. */
export function renameOwner(records: readonly OwnerRecord[], id: Owner, name: string): OwnerRecord[] {
	return records.map((record) => (record.id === id ? { ...record, name } : record))
}

/** False while any group (by `ownerOf`) or supplementary card (archived too) names `id`. */
export function canDeleteOwner(id: Owner, groups: readonly LimitGroup[], cards: readonly Card[]): boolean {
	return (
		!groups.some((group) => ownerOf(group) === id) && !cards.some((card) => card.supplementary && card.owner === id)
	)
}
