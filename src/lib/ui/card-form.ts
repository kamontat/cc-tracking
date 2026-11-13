import type { Owner } from "#lib/domain/owner"
import type { Card, CycleRule, LimitGroup, LocationRecord } from "#lib/domain/types"
import type { MessageKey } from "#lib/i18n/catalog"

import { isCardId } from "#lib/domain/card"
import { DEFAULT_LOCATION } from "#lib/domain/location"
import { sortLocations } from "#lib/i18n/format"

/** The card form's typed fields, by input name. */
export const TEXT_FIELDS = ["id", "name", "last4", "closeDay", "dueOffsetDays", "dueDay", "comment"] as const
export type TextField = (typeof TEXT_FIELDS)[number]

/** What the card form holds while it is typed in. */
export type CardDraft = {
	text: Record<TextField, string>
	/** The place picked, or the card's own; "" for a new card until one is picked (`keptIn`). */
	location: string
	groupId: string
	kind: CycleRule["kind"]
	supplementary: boolean
	/**
	 * Kept while the card is set back to the account holder, so switching straight back does not
	 * lose the choice; written into the saved card only for a supplementary one.
	 */
	owner: Owner | ""
}

/** The form's fields filled from `card`, or blank for a new one. */
export function draftOf(card: Card | null): CardDraft {
	const rule = card?.cycle
	return {
		text: {
			id: card?.id ?? "",
			name: card?.name ?? "",
			last4: card?.last4 ?? "",
			closeDay: rule ? String(rule.closeDay) : "",
			dueOffsetDays: rule?.kind === "offset" ? String(rule.dueOffsetDays) : "",
			dueDay: rule?.kind === "fixed" ? String(rule.dueDay) : "",
			comment: card?.comment ?? "",
		},
		location: card?.location ?? "",
		groupId: card?.limitGroupId ?? "",
		kind: rule?.kind ?? "offset",
		supplementary: card?.supplementary ?? false,
		owner: card?.owner ?? "",
	}
}

/**
 * Where the card is kept: the place picked or stored, else for a new card Bangkok while it is
 * stored (or nothing is loaded yet), else the first location A to Z.
 */
export function keptIn(picked: string, locations: LocationRecord[]): string {
	if (picked) return picked
	if (locations.length === 0 || locations.some((record) => record.id === DEFAULT_LOCATION)) return DEFAULT_LOCATION
	return sortLocations(locations)[0]?.id ?? DEFAULT_LOCATION
}

const numberOf = (text: string): number => {
	const trimmed = text.trim()
	return trimmed === "" ? Number.NaN : Number(trimmed)
}

const inRange = (value: number, low: number, high: number) => Number.isInteger(value) && value >= low && value <= high

/** The card the form describes, or the catalog key of the first thing wrong with it. */
export type CardRead = { ok: true; card: Card } | { ok: false; key: MessageKey }

/**
 * Reads the draft into a card: the id (kept from `card` when editing, else in the card id form,
 * `isCardId`), name, four-digit last 4,
 * close day 1-31, then due 1-60 days after close or on day 1-31, a stored limit group, and a
 * holder for a supplementary card -- which a primary card leaves off, since whoever holds its
 * group holds it.
 */
export function readCardDraft(
	draft: CardDraft,
	card: Card | null,
	groups: LimitGroup[],
	locations: LocationRecord[],
): CardRead {
	const { text } = draft
	const id = card ? card.id : text.id.trim()
	const name = text.name.trim()
	const last4 = text.last4.trim()
	const closeDay = numberOf(text.closeDay)

	if (!id) return { ok: false, key: "form.error.id" }
	if (!card && !isCardId(id)) return { ok: false, key: "form.error.idFormat" }
	if (!name) return { ok: false, key: "form.error.name" }
	if (!/^\d{4}$/.test(last4)) return { ok: false, key: "form.error.last4" }
	if (!inRange(closeDay, 1, 31)) return { ok: false, key: "form.error.closeDay" }

	let cycle: CycleRule
	if (draft.kind === "offset") {
		const dueOffsetDays = numberOf(text.dueOffsetDays)
		if (!inRange(dueOffsetDays, 1, 60)) return { ok: false, key: "form.error.dueOffsetDays" }
		cycle = { kind: "offset", closeDay, dueOffsetDays }
	} else {
		const dueDay = numberOf(text.dueDay)
		if (!inRange(dueDay, 1, 31)) return { ok: false, key: "form.error.dueDay" }
		cycle = { kind: "fixed", closeDay, dueDay }
	}

	if (!groups.some((group) => group.id === draft.groupId)) return { ok: false, key: "form.error.limitGroup" }
	const owner = draft.supplementary ? draft.owner || null : null
	if (draft.supplementary && !owner) return { ok: false, key: "form.error.owner" }

	return {
		ok: true,
		card: {
			id,
			name,
			last4,
			location: keptIn(draft.location, locations),
			supplementary: draft.supplementary,
			...(owner ? { owner } : {}),
			cycle,
			comment: text.comment.trim(),
			archived: card?.archived ?? false,
			limitGroupId: draft.groupId,
		},
	}
}
