import type { GroupColor } from "#lib/domain/group-color"
import type { Owner } from "#lib/domain/owner"

/** A calendar date in Asia/Bangkok, formatted `YYYY-MM-DD`. */
export type PlainDate = string

/** A statement period, formatted `YYYY-MM`, named after the month its close date falls in. */
export type Period = string

export type DateParts = { year: number; month: number; day: number }

export type CycleRule =
	| { kind: "offset"; closeDay: number; dueOffsetDays: number }
	| { kind: "fixed"; closeDay: number; dueDay: number }

export type Card = {
	id: string
	name: string
	last4: string
	/** The id of the location record the card is kept at. */
	location: string
	/**
	 * A บัตรเสริม — a supplementary card issued against someone else's account. Absent on
	 * cards saved before the field existed, which reads the same as not being one.
	 */
	supplementary?: boolean
	/**
	 * Who holds a supplementary card, which is not whoever owns the account it draws on. Only
	 * read while `supplementary` is set; see `cardOwnerOf` in `#lib/domain/owner`.
	 */
	owner?: Owner
	cycle: CycleRule
	comment?: string
	archived: boolean
	/** Absent only on cards stored before limits existed; the card form requires one. */
	limitGroupId?: string
}

/** Someone an account or a supplementary card can belong to (RD-30). */
export type OwnerRecord = {
	/** What groups and cards store; never changes, so a rename keeps them pointing here. */
	id: Owner
	/** Shown wherever the owner is, untranslated. */
	name: string
}

/** A pool of credit. A card that shares its limit with nothing else still has one of these. */
export type LimitGroup = {
	id: string
	name: string
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	limit: number
	/** Absent on groups saved before the field existed; see `ownerOf` in `#lib/domain/owner`. */
	owner?: Owner
	/** Absent on groups saved before the field existed; see `group-color.ts`. */
	color?: GroupColor
}

export type Purchase = {
	id: string
	cardId: string
	date: PlainDate
	/** Satang. 1 THB = 100 satang. Always an integer. */
	amount: number
	note: string
	/**
	 * When the purchase was first entered, as an ISO 8601 instant. Absent on purchases saved
	 * before entry times were recorded; an edit carries the original over.
	 */
	addedAt?: string
}

export type PaymentStatus = "planned" | "paid"

/** Money paid toward a card. `period` is set only on records converted from the old model. */
export type CardPayment = {
	id: string
	cardId: string
	date: PlainDate
	amount: number
	status: PaymentStatus
	period?: Period
	/** What the payer wrote about it, e.g. which account it came from; absent when none. */
	note?: string
}

/** Close and due dates kept once money first reached a statement. */
export type StatementDates = {
	cardId: string
	period: Period
	closeDate: PlainDate
	dueDate: PlainDate
}

export type LedgerStatement = {
	cardId: string
	period: Period
	closeDate: PlainDate
	dueDate: PlainDate
	purchases: Purchase[]
	total: number
	paidAmount: number
	/** The parts of payments that settled it, in the order they were spent; sums to `paidAmount`. */
	payments: { payment: CardPayment; amount: number }[]
	remaining: number
	paid: boolean
	open: boolean
}

export type CardLedger = {
	statements: LedgerStatement[]
	owed: number
	credit: number
}

export type ListStatus = "draft" | "sent" | "saved"

export type ListLine = {
	cardId: string
	/** Satang planned. A positive integer; on a draft, 0 means no amount yet. */
	amount: number
	/** Absent until the spender answers. */
	made?: boolean
	/** Satang really spent, when it differs from the plan. */
	actual?: number
	/** What the purchase is for, trimmed; absent when blank. Becomes the purchase's note. */
	note?: string
}

export type PurchaseList = {
	id: string
	date: PlainDate
	status: ListStatus
	lines: ListLine[]
	/** ISO 8601 instants. */
	sentAt?: string
	savedAt?: string
	/** Id of the draft that took this list's not-made lines. */
	movedTo?: string
}

/** A place cards are kept, as a record the user can rename and extend. */
export type LocationRecord = {
	id: string
	name: string
	takesPurchases: boolean
}
