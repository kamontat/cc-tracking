import type { TxEntry } from "#lib/domain/transactions"
import type { Card, CardLedger, CardPayment, LedgerStatement, PlainDate, PurchaseList } from "#lib/domain/types"
import type { CycleInput, CycleMark } from "#lib/ui/cycle-line"
import type { RowPart, Say } from "#lib/ui/row-text"

import { addDays, compareDates, dayMonth, daysBetween, monthName } from "#lib/domain/date"
import { statementStart } from "#lib/domain/ledger"
import { formatAmount, sumAmounts } from "#lib/domain/money"
import { getLocale, t } from "#lib/i18n/index"
import { PAST_TODAY } from "#lib/ui/cycle-line"
import { late, money, say } from "#lib/ui/row-text"

/*
 * What an opened Transactions ledger row (`TxLedger`) shows above its buttons, and the ids its
 * rows open under. Pure (given the locale): a purchase opens to its statement's billing cycle
 * line and one sentence of what that statement holds; a paid payment to how much reached each
 * statement and any credit kept (DD-165).
 */

/** The *Upcoming* section above the ledger: waiting lists and planned payments. */
export type Upcoming = {
	lists: PurchaseList[]
	planned: { payment: CardPayment; card: Card | undefined }[]
	/** Every stored card, to name a waiting list's cards. */
	cards: Card[]
}

/** What an opened row shows above its buttons: a cycle line or parts, then one sentence. */
export type Drawer = { cycle?: CycleInput; parts?: RowPart[]; say: string | Say }

type Purchased = TxEntry & { kind: "purchase" }

/** A day of the ledger: its date and its rows. */
export type LedgerDay = { date: PlainDate; entries: TxEntry[] }

/** A planned payment's open-row id: a payment's id repeats across cards. */
export const planId = (payment: CardPayment): string => `plan:${payment.cardId}:${payment.id}`

/** A ledger row's open-row id, unique across kinds and cards. */
export function entryId(entry: TxEntry): string {
	return entry.kind === "purchase"
		? `buy:${entry.purchase.cardId}:${entry.purchase.id}`
		: `pay:${entry.payment.cardId}:${entry.payment.id}`
}

/** The day groups cut to the first `limit` rows; a day cut part-way keeps its heading. */
export function shownGroups(groups: LedgerDay[], limit: number): LedgerDay[] {
	const shown: LedgerDay[] = []
	let left = limit
	for (const group of groups) {
		if (left <= 0) break
		shown.push({ ...group, entries: group.entries.slice(0, left) })
		left -= group.entries.length
	}
	return shown
}

/**
 * A purchase's drawer: its statement's billing cycle line, from the statement's start to its due
 * date, and one sentence of what the statement holds. The note and the list it came from are on
 * the sub line already (and *Open list* links the list), so they are not said twice.
 */
export function purchaseDrawer(entry: Purchased, ledgers: Map<string, CardLedger>, today: PlainDate): Drawer {
	const { purchase } = entry
	const ledger = ledgers.get(purchase.cardId)
	const statement = ledger?.statements.find((s) => s.purchases.some((p) => p.id === purchase.id))
	if (!ledger || !statement) return { say: "" }
	const start = entry.card ? statementStart(entry.card, ledger.statements, statement.period) : undefined
	const words = statementWords(statement, today)
	if (!start) return { say: words }
	const closed = !statement.open && compareDates(statement.closeDate, today) < 0
	const settled = statement.remaining === 0
	const overdue = closed && !settled && compareDates(today, statement.dueDate) > 0
	const marks: CycleMark[] = [
		{ kind: "buy", date: purchase.date },
		{ kind: closed ? "closed" : "closes", date: statement.closeDate },
		{ kind: "due", date: statement.dueDate },
	]
	// Today shows while the statement is still to pay; once it is late the line runs past today,
	// as an overdue bill's does in Needs you.
	if (!closed || !settled) marks.push({ kind: "now", date: today })
	return {
		cycle: {
			start,
			end: overdue ? addDays(today, PAST_TODAY) : statement.dueDate,
			marks,
			fillTo: today,
			late: overdue,
		},
		say: words,
	}
}

/** One sentence of what a purchase's statement holds: so far, what is left and when, or paid. */
export function statementWords(statement: LedgerStatement, today: PlainDate): Say {
	const total = money(formatAmount(statement.total))
	if (statement.open || compareDates(statement.closeDate, today) >= 0) {
		const days = daysBetween(today, statement.closeDate)
		return say("row.say.open", {
			month: monthName(statement.closeDate, getLocale()),
			total,
			closes:
				days === 0
					? t("row.say.closesToday")
					: days === 1
						? t("row.say.closesIn.one")
						: t("row.say.closesIn.many", { days }),
		})
	}
	if (statement.remaining === 0) return say("row.say.paid", { total })
	const days = daysBetween(today, statement.dueDate)
	const when =
		days === 0
			? t("row.say.dueToday")
			: days === 1
				? t("row.say.dueIn.one")
				: days > 1
					? t("row.say.dueIn.many", { days })
					: late(days === -1 ? t("row.say.late.one") : t("row.say.late.many", { days: -days }))
	return say("row.say.left", { left: money(formatAmount(statement.remaining)), total, when })
}

/**
 * A paid payment's drawer: how much reached each statement, oldest first, and what it kept as
 * credit (its note is on the sub line).
 */
export function paymentDrawer(payment: CardPayment, ledgers: Map<string, CardLedger>): Drawer {
	const ledger = ledgers.get(payment.cardId)
	const parts: { label: string; amount: number }[] = []
	for (const statement of [...(ledger?.statements ?? [])].reverse()) {
		const amount = sumAmounts(
			statement.payments
				.filter((part) => part.payment.cardId === payment.cardId && part.payment.id === payment.id)
				.map((part) => part.amount),
		)
		if (amount > 0)
			parts.push({ label: t("row.part.statement", { month: monthName(statement.closeDate, getLocale()) }), amount })
	}
	// Only a known ledger can say what was not spent on a statement.
	const credit = ledger ? payment.amount - sumAmounts(parts.map((part) => part.amount)) : 0
	if (credit > 0) parts.push({ label: t("row.part.credit"), amount: credit })
	const paid = t("row.say.paidOn", { date: dayMonth(payment.date, getLocale()) })
	return {
		parts: parts.map((part) => ({ label: part.label, amount: formatAmount(part.amount) })),
		say: credit > 0 ? `${paid} ${t("row.say.credit")}` : paid,
	}
}
