import type { PlainDate } from "#lib/domain/types"

import { isValidDate } from "#lib/domain/date"
import { amountOf, formatAmount } from "#lib/domain/money"

/** What the payment form hands back when it is sent (`PayForm`'s `onpay`). */
export type PayDetail = {
	/** Satang. */
	amount: number
	date: PlainDate
	/** What was typed in the optional Note field, trimmed; absent when it is blank. */
	note?: string
}

/** The card's figures the payment form shows, in satang. */
export type PayFigures = {
	owed: number
	credit: number
	nextBill: number
	overdue: boolean
}

/**
 * An amount's text in the pieces it may wrap between: after the baht sign and after each
 * comma, so no digit is left alone on a line. The form puts a `<wbr>` between them.
 */
export const figureParts = (satang: number): string[] => formatAmount(satang).split(/(?<=[,฿])/)

/**
 * The amount to send, in satang, or null while the button is disabled -- one rule for both: a
 * readable amount above zero on a date that exists.
 */
export function readyAmount(text: string, date: PlainDate): number | null {
	const amount = amountOf(text)
	return amount !== null && amount > 0 && isValidDate(date) ? amount : null
}

/** The detail to send, carrying the note only when it is not blank. */
export function payDetail(amount: number, date: PlainDate, note: string): PayDetail {
	const text = note.trim()
	return text ? { amount, date, note: text } : { amount, date }
}
