import type { TemplateResult } from "lit"
import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { CardLedger, PlainDate } from "#lib/domain/types"

import { cardName } from "#legacy/lib/ui/card-label"
import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
import { displayDate } from "#lib/domain/date"
import { formatAmount } from "#lib/domain/money"
import { openPeriod } from "#lib/domain/statement"
import { getLocale, t } from "#lib/i18n/index"
import { payTag } from "#lib/ui/pay-tag"
import { lastFour, type TileContent, tileBody } from "./card-tile"

/** What a payment tile needs besides its card: each group's room, each card's ledger, today. */
export type PayTileContext = {
	/** Each group's room, by group id: a tile's rail shows its group's used share. */
	rooms: Map<string, GroupRoom>
	/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
	ledgers: Map<string, CardLedger>
	/** Today, which picks a card's open period when its ledger has no open statement. */
	today: PlainDate
}

/** Line 2: what is owed, else the credit, else nothing owed (the pay tag's words). */
function owedFigure(choice: PayChoice): NonNullable<TileContent["figure"]> {
	if (choice.owed > 0) return { amount: formatAmount(choice.owed), word: t("pay.owedUnder") }
	return { word: payTag(choice)?.text ?? t("pay.tag.nothing") }
}

/** Line 2's aside: how late or how soon the bill is due; nothing for credit or nothing owed. */
function urgency(choice: PayChoice): Pick<TileContent, "aside" | "asideTone"> {
	const tag = payTag(choice)
	if (!tag || tag.urgency === "credit" || tag.urgency === "none") return {}
	if (tag.urgency === "overdue") return { aside: tag.text, asideTone: "bad" }
	if (tag.urgency === "soon") return { aside: tag.text, asideTone: "warn" }
	return { aside: tag.text }
}

/**
 * Line 3: the bill the payment goes to -- the oldest closed one with money left -- or, with
 * none, when the open statement closes and is due, as Cards says it. The ledger's open
 * statement honours kept dates; the cycle only fills in without one.
 */
function facts(choice: PayChoice, context: PayTileContext): string {
	const locale = getLocale()
	if (choice.bill)
		return t("pay.tile.bill", {
			date: displayDate(choice.bill.closeDate, locale),
			amount: formatAmount(choice.bill.remaining),
		})
	const { card } = choice
	const period = openPeriod(card, context.today)
	const kept = context.ledgers.get(card.id)?.statements.find((s) => s.open)
	return t("cards.page.dates", {
		close: displayDate(kept?.closeDate ?? closeDateOf(card.cycle, period), locale),
		due: displayDate(kept?.dueDate ?? dueDateOf(card.cycle, period), locale),
	})
}

/** A payment tile's accessible name: the card and what it owes (`pay.pickName`). */
export const payTileName = (choice: PayChoice): string =>
	t("pay.pickName", {
		card: cardName(choice.card.id, choice.card),
		amount: formatAmount(choice.owed),
	})

/**
 * The inside of a payment tile (DD-166): `id) name` and `•••• last4`; what is owed with its
 * word and the urgency at the right; the bill it goes to or when the open statement closes;
 * the group's rail. The payment picker wraps it in a `button.tile`, *Owed on each card* in an
 * `a.tile` to the payment sheet; both carry `data-g` from `tileTone`.
 */
export function payTileBody(choice: PayChoice, context: PayTileContext): TemplateResult {
	const { card } = choice
	const group = card.limitGroupId
	return tileBody({
		card,
		room: (group && context.rooms.get(group)) || null,
		credit: choice.credit,
		corner: lastFour(card),
		mono: true,
		figure: owedFigure(choice),
		...urgency(choice),
		facts: facts(choice, context),
	})
}
