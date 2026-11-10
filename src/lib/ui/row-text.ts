import type { Card, CardPayment, LimitGroup, PurchaseList } from "#lib/domain/types"

import { dayMonth, daysBetween, displayDate, today as plainToday } from "#lib/domain/date"
import { formatAmount } from "#lib/domain/money"
import { getLocale, type MessageKey, t } from "#lib/i18n/index"
import { cardLine, cardOwnerName } from "#lib/ui/card-label"

/*
 * The words of the one row that opens in place (`ActionRow`, DD-108, DD-165): Home's *Needs
 * you*, Transactions' *Upcoming*, the ledger and the Lists view. Pure (given the locale), so
 * every list words a thing the same way. A sentence that mixes strong money, a red late phrase
 * and muted words is a list of pieces (`Say`) the row draws, never markup in a string.
 */

export type ActionKind = "waiting" | "overdue" | "planned" | "draft" | "purchase" | "payment" | "saved"

export type RowText = {
	kind: ActionKind
	title: string
	subtitle: string
}

/** A piece of a sentence: muted words, a strong money figure, or a red late phrase. */
export type SayPiece = string | { money: string } | { late: string }

/** One sentence, in pieces. */
export type Say = SayPiece[]

/** A money figure inside a sentence: strong, where the rest of the sentence is muted. */
export const money = (text: string): SayPiece => ({ money: text })

/** A late phrase inside a sentence: strong and red. */
export const late = (text: string): SayPiece => ({ late: text })

/**
 * The catalog's sentence `key` with its placeholders filled by `params`, which may be pieces
 * (a `money` figure, a `late` phrase); words stay words, so the sentence reads the same in
 * either language.
 */
export function say(key: MessageKey, params: Record<string, string | number | SayPiece> = {}): Say {
	const pieces = t(key).split(/\{(\w+)\}/)
	const out: Say = []
	pieces.forEach((piece, i) => {
		if (i % 2 === 0) {
			if (piece) out.push(piece)
			return
		}
		const value = params[piece]
		if (value === undefined) out.push(`{${piece}}`)
		else out.push(typeof value === "number" ? String(value) : value)
	})
	return out
}

/** A sentence as plain text, for a label or a test. */
export const sayText = (sentence: Say): string =>
	sentence.map((piece) => (typeof piece === "string" ? piece : "money" in piece ? piece.money : piece.late)).join("")

/** A list's cards as `name (owner)` when three or fewer, else "N cards" (DD-110). */
export function cardsOrCount(ids: string[], cards: Card[], groups: LimitGroup[]): string {
	const byId = new Map(cards.map((card) => [card.id, card]))
	return ids.length <= 3
		? ids.map((id) => cardOwnerName(id, byId.get(id), groups)).join(", ")
		: t("row.cards", { count: ids.length })
}

/** "1 day ago" / "N days ago". */
export const agoWords = (days: number): string => (days === 1 ? t("row.ago.one") : t("row.ago.many", { days }))

/** "for 1 day" / "for N days": how long a bill has been overdue. */
export const forWords = (days: number): string => (days === 1 ? t("row.for.one") : t("row.for.many", { days }))

/** How far a plan's date is from today: today, tomorrow, in N days, or N days ago once past. */
export function whenWords(date: string, today: string): string {
	const days = daysBetween(today, date)
	if (days === 0) return t("row.when.today")
	if (days === 1) return t("row.when.tomorrow")
	if (days > 1) return t("row.when.in", { days })
	return agoWords(-days)
}

const listDate = (list: PurchaseList) => displayDate(list.date, getLocale())

const listCards = (list: PurchaseList, cards: Card[], groups: LimitGroup[]) =>
	cardsOrCount([...new Set(list.lines.map((l) => l.cardId))], cards, groups)

/** A waiting list; the total is the row's amount on the right (DD-108), not in the subtitle. */
export const waitingText = (list: PurchaseList, cards: Card[], groups: LimitGroup[]): RowText => ({
	kind: "waiting",
	title: t("row.waiting", { date: listDate(list) }),
	subtitle: listCards(list, cards, groups),
})

export const draftText = (list: PurchaseList, cards: Card[], groups: LimitGroup[]): RowText => ({
	kind: "draft",
	title: t("row.draft", { date: listDate(list) }),
	subtitle: listCards(list, cards, groups),
})

/** A saved list; its total (the made lines) is the row's amount. */
export const savedText = (list: PurchaseList, cards: Card[], groups: LimitGroup[]): RowText => ({
	kind: "saved",
	title: t("row.saved", { date: listDate(list) }),
	subtitle: listCards(list, cards, groups),
})

/**
 * A planned payment, the same in Needs you and Upcoming (DD-155): the amount is on the right
 * (DD-108); the date and how far off it is sit under the title. The note is not on the row; the
 * opened details say it (`plannedSay`).
 */
export function plannedText(
	payment: CardPayment,
	card: Card | undefined,
	groups: LimitGroup[],
	today: string,
): RowText {
	const date = displayDate(payment.date, getLocale())
	return {
		kind: "planned",
		title: t("row.plannedPay", { card: cardOwnerName(payment.cardId, card, groups) }),
		subtitle: `${date} · ${whenWords(payment.date, today)}`,
	}
}

/** An opened planned payment's sentence: when it is planned for, then its note (DD-165). */
export const plannedSay = (payment: CardPayment): string =>
	[t("row.say.planned", { date: dayMonth(payment.date, getLocale()) }), ...(payment.note ? [payment.note] : [])].join(
		" ",
	)

/** A bill past its due date: `days` is how many days past it. */
export const overdueText = (card: Card, groups: LimitGroup[], days: number): RowText => ({
	kind: "overdue",
	title: t("row.overdue", { card: cardOwnerName(card.id, card, groups) }),
	subtitle: forWords(days),
})

/** The day a list was sent, as day and month: its `sentAt` in Bangkok, else the list's date. */
export function sentWords(list: PurchaseList): string {
	const at = list.sentAt ? new Date(list.sentAt) : undefined
	const day = at && !Number.isNaN(at.getTime()) ? plainToday(at) : list.date
	return dayMonth(day, getLocale())
}

/** A label and amount line above an opened row's foot: a list's line, a payment's statement. */
export type RowPart = { label: string; amount: string }

/**
 * An opened list row's parts: each line's card in the line form and its amount (the row's head
 * already carries the total). A saved list shows what was bought: the real amount, or "Not
 * made" (the reply page's words). Missing cards keep their id (`cardLine`).
 */
export function listParts(list: PurchaseList, cards: Card[]): RowPart[] {
	const byId = new Map(cards.map((card) => [card.id, card]))
	const saved = list.status === "saved"
	return list.lines.map((line) => ({
		label: cardLine(line.cardId, byId.get(line.cardId)),
		amount: !saved
			? line.amount > 0
				? formatAmount(line.amount)
				: t("common.none")
			: line.made
				? formatAmount(line.actual ?? line.amount)
				: t("reply.notMade"),
	}))
}
