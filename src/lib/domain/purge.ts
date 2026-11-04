import {
	addDays,
	clampDay,
	compareDates,
	comparePeriods,
	parseDate,
} from "#lib/domain/date";
import { cardLedger } from "#lib/domain/ledger";
import { sumAmounts } from "#lib/domain/money";
import type {
	Card,
	CardPayment,
	Period,
	PlainDate,
	Purchase,
	PurchaseList,
	StatementDates,
} from "#lib/domain/types";

export type PurgeAge = "6m" | "1y" | "3y" | "all";

const MONTHS_BACK: Record<Exclude<PurgeAge, "all">, number> = {
	"6m": 6,
	"1y": 12,
	"3y": 36,
};

/**
 * The first date that is kept: records dated before it may go. `all` keeps nothing up to and
 * including today. A day past the end of the month it lands in clamps to that month's last day.
 */
export function purgeCutoff(age: PurgeAge, today: PlainDate): PlainDate {
	if (age === "all") return addDays(today, 1);
	const { year, month, day } = parseDate(today);
	const total = year * 12 + (month - 1) - MONTHS_BACK[age];
	return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}

/** A card payment, named the way storage keys it: an id is unique only within its card. */
export type PaymentRef = { cardId: string; id: string };

const refKey = (p: PaymentRef): string =>
	`${encodeURIComponent(p.cardId)}:${encodeURIComponent(p.id)}`;

export type PurgePlan = {
	purchaseIds: string[];
	/** Payment ids repeat across cards (converted ones do), so each names its card. */
	paymentIds: PaymentRef[];
	/** Payments that stay with a smaller amount. Every other field is unchanged. */
	trimmed: CardPayment[];
	listIds: string[];
	frozenPeriods: { cardId: string; period: Period }[];
};

type CardPart = Omit<PurgePlan, "listIds">;

const EMPTY_PART: CardPart = {
	purchaseIds: [],
	paymentIds: [],
	trimmed: [],
	frozenPeriods: [],
};

const byDateThenId = (
	a: { date: PlainDate; id: string },
	b: { date: PlainDate; id: string },
): number => compareDates(a.date, b.date) || (a.id < b.id ? -1 : 1);

/**
 * Choose old records to delete without changing what any card owes or its credit (RD-18).
 *
 * Per card, a purchase dated before `cutoff` goes only when its statement is closed and fully
 * paid. Paid payments dated before `cutoff` go, oldest first, until they add up to exactly what
 * those purchases took; one that overshoots stays, cut to the overshoot. A payment aimed at a
 * statement that stays always stays. When the payments fall short, the newest statements stay
 * until they do not. Planned payments never go.
 *
 * As a last guard, each card's part is applied the way storage will apply it, by card and id, and the
 * ledgers rebuilt: a part that would move any card's owed or credit is dropped entirely.
 */
export function planPurge(
	cards: Card[],
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[],
	lists: PurchaseList[],
	cutoff: PlainDate,
	today: PlainDate,
): PurgePlan {
	const balances = (
		somePurchases: Purchase[],
		somePayments: CardPayment[],
		someFrozen: StatementDates[],
	) =>
		cards.map((card) => {
			const l = cardLedger(
				card,
				somePurchases,
				somePayments,
				someFrozen,
				today,
			);
			return `${l.owed}/${l.credit}`;
		});
	const before = balances(purchases, payments, frozen).join(",");

	const plan: PurgePlan = {
		purchaseIds: [],
		paymentIds: [],
		trimmed: [],
		listIds: lists
			.filter((l) => l.status === "saved" && compareDates(l.date, cutoff) < 0)
			.map((l) => l.id),
		frozenPeriods: [],
	};

	for (const card of cards) {
		const part = planCard(card, purchases, payments, frozen, cutoff, today);
		if (part.purchaseIds.length === 0) continue;

		const after = applyPart(part, purchases, payments, frozen);
		if (
			balances(after.purchases, after.payments, after.frozen).join(",") !==
			before
		)
			continue;

		plan.purchaseIds.push(...part.purchaseIds);
		plan.paymentIds.push(...part.paymentIds);
		plan.trimmed.push(...part.trimmed);
		plan.frozenPeriods.push(...part.frozenPeriods);
	}
	return plan;
}

function planCard(
	card: Card,
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[],
	cutoff: PlainDate,
	today: PlainDate,
): CardPart {
	const ledger = cardLedger(card, purchases, payments, frozen, today);

	// Oldest first, so dropping from the end keeps the newest statements.
	const going = ledger.statements
		.filter((s) => s.paid && !s.open && compareDates(s.closeDate, today) < 0)
		.map((s) => ({
			period: s.period,
			purchases: s.purchases.filter((p) => compareDates(p.date, cutoff) < 0),
			whole: s.purchases.every((p) => compareDates(p.date, cutoff) < 0),
		}))
		.filter((s) => s.purchases.length > 0)
		.sort((a, b) => comparePeriods(a.period, b.period));

	const paidBeforeCutoff = payments
		.filter(
			(p) =>
				p.cardId === card.id &&
				p.status === "paid" &&
				compareDates(p.date, cutoff) < 0,
		)
		.sort(byDateThenId);

	while (going.length > 0) {
		const removed = new Set(going.filter((s) => s.whole).map((s) => s.period));
		const target = sumAmounts(
			going.flatMap((s) => s.purchases.map((p) => p.amount)),
		);
		// A payment aimed at a statement that stays must stay with it.
		const candidates = paidBeforeCutoff.filter(
			(p) => p.period === undefined || removed.has(p.period),
		);
		if (sumAmounts(candidates.map((p) => p.amount)) < target) {
			going.pop();
			continue;
		}

		const paymentIds: PaymentRef[] = [];
		const trimmed: CardPayment[] = [];
		let taken = 0;
		for (const p of candidates) {
			if (taken === target) break;
			if (taken + p.amount <= target) {
				paymentIds.push({ cardId: p.cardId, id: p.id });
				taken += p.amount;
			} else {
				trimmed.push({ ...p, amount: taken + p.amount - target });
				taken = target;
			}
		}

		return {
			purchaseIds: going.flatMap((s) => s.purchases.map((p) => p.id)),
			paymentIds,
			trimmed,
			frozenPeriods: frozen
				.filter((f) => f.cardId === card.id && removed.has(f.period))
				.map((f) => ({ cardId: f.cardId, period: f.period })),
		};
	}
	return EMPTY_PART;
}

function applyPart(
	part: CardPart,
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[],
) {
	const purchaseIds = new Set(part.purchaseIds);
	const paymentKeys = new Set(part.paymentIds.map(refKey));
	const trimmed = new Map(part.trimmed.map((p) => [refKey(p), p]));
	return {
		purchases: purchases.filter((p) => !purchaseIds.has(p.id)),
		payments: payments
			.filter((p) => !paymentKeys.has(refKey(p)))
			.map((p) => trimmed.get(refKey(p)) ?? p),
		frozen: frozen.filter(
			(f) =>
				!part.frozenPeriods.some(
					(r) => r.cardId === f.cardId && r.period === f.period,
				),
		),
	};
}
