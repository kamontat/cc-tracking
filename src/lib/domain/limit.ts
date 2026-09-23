import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addPeriods, comparePeriods } from "#lib/domain/date";
import { buildStatement, openPeriod } from "#lib/domain/statement";
import type {
	Card,
	LimitGroup,
	Period,
	PlainDate,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";

/** One spendable card, with the room left on the pool it draws from. */
export type SpendRow = {
	card: Card;
	group: LimitGroup;
	/** Unpaid total across every card in the group. */
	used: number;
	/** `group.limit - used`. Negative when the group is over its limit. */
	available: number;
	/** The open period's dates: the statement a purchase made today lands on. */
	closeDate: PlainDate;
	dueDate: PlainDate;
	/** How many other cards share this group. 0 means the card has it to itself. */
	sharedWith: number;
};

/**
 * What this card still owes: every purchase on a statement with no payment against it.
 *
 * The open period counts. Money spent this cycle is gone from the limit the moment it is
 * spent, and only comes back when that statement is marked paid -- which is also the only
 * way credit is ever returned, since a payment records no amount of its own.
 */
export function outstandingOf(
	card: Card,
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): number {
	const mine = purchases.filter((purchase) => purchase.cardId === card.id);
	const periods = mine.map((purchase) =>
		periodOfPurchase(card.cycle, purchase.date),
	);
	const open = openPeriod(card, today);
	const sorted = [...periods].sort(comparePeriods);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];

	// Imported data can hold a future-dated purchase the form would refuse, so walk past the
	// open period when one exists rather than silently dropping what it owes.
	let period: Period = first && comparePeriods(first, open) < 0 ? first : open;
	const end: Period = last && comparePeriods(last, open) > 0 ? last : open;

	let total = 0;
	while (comparePeriods(period, end) <= 0) {
		const paid = payments.some(
			(payment) => payment.cardId === card.id && payment.period === period,
		);
		if (!paid) total += buildStatement(card, period, mine).total;
		period = addPeriods(period, 1);
	}
	return total;
}

/** What the whole pool owes. Archived cards count: their unpaid balance is still real money. */
export function groupUsage(
	group: LimitGroup,
	cards: Card[],
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): number {
	return cards
		.filter((card) => card.limitGroupId === group.id)
		.reduce(
			(total, card) => total + outstandingOf(card, purchases, payments, today),
			0,
		);
}

/**
 * One row per card a purchase may be entered against, most room first.
 *
 * Dates come from the open period, not from `nextActionable`: the due list answers "what must
 * I pay next", this answers "if I spend today, when does that bill close and fall due". On a
 * card with an overdue statement the two disagree, and both are right for their own question.
 */
export function spendableRows(
	cards: Card[],
	groups: LimitGroup[],
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): SpendRow[] {
	const members = new Map<string, number>();
	for (const card of cards) {
		if (!card.limitGroupId) continue;
		members.set(card.limitGroupId, (members.get(card.limitGroupId) ?? 0) + 1);
	}
	const usage = new Map(
		groups.map((group) => [
			group.id,
			groupUsage(group, cards, purchases, payments, today),
		]),
	);

	return cards
		.filter((card) => !card.archived && canPurchase(card))
		.flatMap((card) => {
			const group = groups.find(({ id }) => id === card.limitGroupId);
			if (!group) return [];
			const used = usage.get(group.id) ?? 0;
			const period = openPeriod(card, today);
			return [
				{
					card,
					group,
					used,
					available: group.limit - used,
					closeDate: closeDateOf(card.cycle, period),
					dueDate: dueDateOf(card.cycle, period),
					sharedWith: (members.get(group.id) ?? 1) - 1,
				},
			];
		})
		.sort(
			(a, b) => b.available - a.available || (a.card.id < b.card.id ? -1 : 1),
		);
}

/** Unarchived cards pointing at no group, or at one that does not exist. */
export function unassignedCards(cards: Card[], groups: LimitGroup[]): Card[] {
	return cards.filter(
		(card) =>
			!card.archived && !groups.some(({ id }) => id === card.limitGroupId),
	);
}
