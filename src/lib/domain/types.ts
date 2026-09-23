import type { Location } from "#lib/domain/location";

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
	cycle: CycleRule;
	comment?: string;
	archived: boolean;
	/** Absent on cards saved before the flag existed; see `canPurchase` in `#lib/domain/card`. */
	canPurchase?: boolean;
	/** Absent only on cards stored before limits existed; the card form requires one. */
	limitGroupId?: string;
};

/** A pool of credit. A card that shares its limit with nothing else still has one of these. */
export type LimitGroup = {
	id: string;
	name: string;
	/** Satang. Always a positive integer, like `Purchase.amount`. */
	limit: number;
};

export type Purchase = {
	id: string;
	cardId: string;
	date: PlainDate;
	/** Satang. 1 THB = 100 satang. Always an integer. */
	amount: number;
	note: string;
};

export type StatementPayment = {
	cardId: string;
	period: Period;
	paidAt: PlainDate;
	/** Frozen at payment time so a later cycle edit cannot rewrite history. */
	closeDate: PlainDate;
	dueDate: PlainDate;
};

/** Derived on read, never stored. */
export type Statement = {
	cardId: string;
	period: Period;
	closeDate: PlainDate;
	dueDate: PlainDate;
	purchases: Purchase[];
	total: number;
	paid: boolean;
	payment: StatementPayment | null;
};
