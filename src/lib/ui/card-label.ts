import type { Card, LimitGroup, OwnerRecord } from "#lib/domain/types"

import { type GroupColor, toGroupColor } from "#lib/domain/group-color"
import { cardOwnerOf, ownerName } from "#lib/domain/owner"
import { t } from "#lib/i18n/index"

/*
 * Every page names a card in one of three forms (UI-14, DD-98):
 * - panel: the last-4 chip, then `id) name` -- rows in lists and panels;
 * - line: `id) name (last4)` -- single-line text, the copied list text, pickers and filter
 *   chips; short `id) name`;
 * - name: the name -- buttons, notices and sentences; short `c-[id]`.
 * A short form is for a small space. The Cards rows and the card panel use
 * `cardTitle` instead. A card that is no longer stored keeps its id: `id) —`, and `c-[id]` for
 * its name. These are the text forms; a component draws the chip (`.mini`) and `.card-label` around them.
 */

/** The name form's short form, and the name of a card no longer stored: `c-[5]`. */
export const cardShort = (id: string): string => `c-[${id}]`

/** The line form: `10) Card A10 (4412)`; `short` leaves the last 4 off: `10) Card A10`. */
export function cardLine(id: string, card: Card | undefined, { short = false }: { short?: boolean } = {}): string {
	if (!card) return `${id}) ${t("common.none")}`
	return short ? `${id}) ${card.name}` : `${id}) ${card.name} (${card.last4})`
}

/** Several cards' lines, comma separated, each looked up in `cards`. */
export function cardLines(ids: string[], cards: Card[], options: { short?: boolean } = {}): string {
	const byId = new Map(cards.map((card) => [card.id, card]))
	return ids.map((id) => cardLine(id, byId.get(id), options)).join(", ")
}

/** The name form: the card's name, or `c-[id]` once it is no longer stored. */
export const cardName = (id: string, card: Card | undefined): string => card?.name ?? cardShort(id)

/**
 * The colour a card wears: its limit group's stored colour name. Null when it draws on no
 * stored group, or the group's colour is not one in the palette.
 */
export function groupColor(card: Card | undefined, groups: LimitGroup[]): GroupColor | null {
	const group = groups.find(({ id }) => id === card?.limitGroupId)
	return group ? toGroupColor(group.color) : null
}

/**
 * The name form with the cardholder after it, for the Needs you and Upcoming rows (DD-110):
 * `Krungsri Bangkok (RI)`. The holder is `cardOwnerOf` (DR-13); with none it is just the name.
 * A card no longer stored is `c-[id]`.
 */
export function cardOwnerName(
	id: string,
	card: Card | undefined,
	groups: LimitGroup[],
	owners: readonly OwnerRecord[] = [],
): string {
	if (!card) return cardShort(id)
	const group = groups.find((g) => g.id === card.limitGroupId) ?? null
	const owner = cardOwnerOf(card, group)
	return owner ? `${card.name} (${ownerName(owner, owners)})` : card.name
}

/**
 * The title the Cards page and the card panel give a card (amends UI-14 there):
 * `Krungsri Bangkok · RI (4412)`. The holder is `cardOwnerOf` (DR-13) and is left out, with its
 * `·`, when unknown; `(last4)` is left out when the card has none.
 */
export function cardTitle(card: Card, groups: LimitGroup[], owners: readonly OwnerRecord[] = []): string {
	const group = groups.find((g) => g.id === card.limitGroupId) ?? null
	const owner = cardOwnerOf(card, group)
	const holder = owner ? ` · ${ownerName(owner, owners)}` : ""
	const digits = card.last4 ? ` (${card.last4})` : ""
	return `${card.name}${holder}${digits}`
}

/** The Cards page row's title: `10) Krungsri Bangkok · RI (4412)`. */
export const cardRowTitle = (card: Card, groups: LimitGroup[], owners: readonly OwnerRecord[] = []): string =>
	`${card.id}) ${cardTitle(card, groups, owners)}`
