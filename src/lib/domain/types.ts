import type { Location } from "#lib/domain/location";
import type { Owner } from "#lib/domain/owner";

/** A calendar date in Asia/Bangkok, formatted `YYYY-MM-DD`. */
export type PlainDate = string;

/** A statement period, formatted `YYYY-MM`, named after the month its close date falls in. */
export type Period = string;

export type DateParts = { year: number; month: number; day: number };

export type CycleRule =
	| { kind: "offset"; closeDay: number; dueOffsetDays: number }
	| { kind: "fixed"; closeDay: number; dueDay: number };

export type Card = {
	id: string;
	name: string;
	last4: string;
	location: Location;
	/**
	 * A บัตรเสริม — a supplementary card issued against someone else's account. Absent on
	 * cards saved before the field existed, which reads the same as not being one.
	 */
	supplementary?: boolean;
	/**
	 * Who holds a supplementary card, which is not whoever owns the account it draws on. Only
	 * read while `supplementary` is set; see `cardOwnerOf` in `#lib/domain/owner`.
	 */
	owner?: Owner;
	cycle: CycleRule;
	comment?: string;
	archived: boolean;
	/** Absent only on cards stored before limits existed; the card form requires one. */
	limitGroupId?: string;
};

/** A pool of credit. A card that shares its limit with nothing else still has one of these. */
export type LimitGroup = {
	id: string;
	name: string;
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	limit: number;
	/** Absent on groups saved before the field existed; see `ownerOf` in `#lib/domain/owner`. */
	owner?: Owner;
};

export type Purchase = {
	id: string;
	cardId: string;
	date: PlainDate;
	/** Satang. 1 THB = 100 satang. Always an integer. */
	amount: number;
	note: string;
	/**
	 * When the purchase was first entered, as an ISO 8601 instant. Absent on purchases saved
	 * before entry times were recorded; an edit carries the original over.
	 */
	addedAt?: string;
};

/** One payment toward a statement. */
export type PaymentPart = {
	paidAt: PlainDate;
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	amount: number;
};

export type StatementPayment = {
	cardId: string;
	period: Period;
	/** The latest payment's date. */
	paidAt: PlainDate;
	/** Frozen at payment time so a later cycle edit cannot rewrite history. */
	closeDate: PlainDate;
	dueDate: PlainDate;
	/**
	 * Every payment toward the statement, oldest first. Absent on records saved before partial
	 * payments existed, which paid the whole total on `paidAt`; see `partsOf` in
	 * `#lib/domain/payment`.
	 */
	parts?: PaymentPart[];
};

/** Derived on read, never stored. */
export type Statement = {
	cardId: string;
	period: Period;
	closeDate: PlainDate;
	dueDate: PlainDate;
	purchases: Purchase[];
	total: number;
	/** Sum of every payment toward the statement. */
	paidAmount: number;
	/** What is still owed: `total - paidAmount`, never below zero. */
	remaining: number;
	/** A payment exists and nothing remains. */
	paid: boolean;
	payment: StatementPayment | null;
};

export type PaymentStatus = "planned" | "paid";

/** Money paid toward a card. `period` is set only on records converted from the old model. */
export type CardPayment = {
	id: string;
	cardId: string;
	date: PlainDate;
	amount: number;
	status: PaymentStatus;
	period?: Period;
};

/** Close and due dates kept once money first reached a statement. */
export type StatementDates = {
	cardId: string;
	period: Period;
	closeDate: PlainDate;
	dueDate: PlainDate;
};

export type LedgerStatement = {
	cardId: string;
	period: Period;
	closeDate: PlainDate;
	dueDate: PlainDate;
	purchases: Purchase[];
	total: number;
	paidAmount: number;
	remaining: number;
	paid: boolean;
	open: boolean;
};

export type CardLedger = {
	statements: LedgerStatement[];
	owed: number;
	credit: number;
};

export type ListStatus = "draft" | "sent" | "saved";

export type ListLine = {
	cardId: string;
	/** Satang planned. A positive integer. */
	amount: number;
	/** Absent until the spender answers. */
	made?: boolean;
	/** Satang really spent, when it differs from the plan. */
	actual?: number;
};

export type PurchaseList = {
	id: string;
	date: PlainDate;
	status: ListStatus;
	lines: ListLine[];
	/** ISO 8601 instants. */
	sentAt?: string;
	savedAt?: string;
	/** Id of the draft that took this list's not-made lines. */
	movedTo?: string;
};
