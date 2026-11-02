import { usedPct } from "#lib/domain/cards-view";
import { formatAmount } from "#lib/domain/money";
import type { GroupRoom } from "#lib/domain/room";
import { t } from "#lib/i18n/index";

/** From this share of the limit in use, a row says it instead of the room (prototype `lvl`). */
export const WARN_PCT = 80;

/** The word under a card's room amount, and whether it is a warning. */
export type RoomNote = { text: string; warn: boolean };

/**
 * What a card row says under its group's room (the Cards page and *Ready to use*): *N% used*
 * in the warn tone from `WARN_PCT`, else the credit the card holds when it has any, else
 * *room*.
 */
export function roomNote(room: GroupRoom, credit: number): RoomNote {
	const pct = usedPct(room);
	if (pct >= WARN_PCT)
		return { text: t("cards.page.used", { pct }), warn: true };
	if (credit > 0)
		return {
			text: t("cards.page.credit", { amount: formatAmount(credit) }),
			warn: false,
		};
	return { text: t("cards.page.room"), warn: false };
}
