import type { GroupRoom } from "#lib/domain/room"

import { usedPct } from "#lib/domain/cards-view"
import { usageShare } from "#lib/domain/limit"
import { formatAmount } from "#lib/domain/money"
import { t } from "#lib/i18n/index"

/** From this share of the limit in use, a row says it instead of the room (prototype `lvl`). */
export const WARN_PCT = 80

/** How full a group is, counting what sent lists hold: the tile rail's and the bars' colour. */
export type RoomLevel = "within" | "high" | "over"

/** The tone of the word under a room amount: warning from `WARN_PCT`, danger past the limit. */
export type RoomTone = "warn" | "bad"

/** The word under a card's room amount, its tone, if any, and whether it is just *room*. */
export type RoomNote = { text: string; tone: RoomTone | null; plain?: true }

/** Over once `used + held` passes the limit (the room is below zero), high from `WARN_PCT`. */
export function roomLevel(room: GroupRoom): RoomLevel {
	if (room.room < 0) return "over"
	return usedPct(room) >= WARN_PCT ? "high" : "within"
}

/** The rail's width: `used + held` as a share of the limit, 0 to 100. */
export const roomShare = (room: GroupRoom): number => usageShare(room.used + room.held, room.group.limit)

/**
 * What a card says under its group's room (every card tile): *over limit* in the danger tone
 * past the limit, *N% used* in the warn tone from `WARN_PCT`, else the credit the card holds
 * when it has any, else *room*.
 */
export function roomNote(room: GroupRoom, credit: number): RoomNote {
	const level = roomLevel(room)
	if (level === "over") return { text: t("cards.page.over"), tone: "bad" }
	if (level === "high") return { text: t("cards.page.used", { pct: usedPct(room) }), tone: "warn" }
	if (credit > 0)
		return {
			text: t("cards.page.credit", { amount: formatAmount(credit) }),
			tone: null,
		}
	return { text: t("cards.page.room"), tone: null, plain: true }
}
