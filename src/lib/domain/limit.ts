import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { buildStatement, openPeriod } from "#lib/domain/statement";
import type {
	Card,
	LimitGroup,
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
 * The open period always counts, payment or not: it is the cycle still being spent on, and
 * only once it closes -- becoming a past period -- does a payment against it return the
 * credit normally. A payment shouldn't exist against a period still open, but stored or
 * imported data could carry one anyway, and honouring it would hide every purchase made this
 * cycle from the available-credit total -- the one direction this feature must not be wrong in.
 *
 * Sums only the distinct periods that actually carry a purchase for this card, plus the open
 * period, rather than walking every period from the earliest purchase through today. An empty
 * period contributes zero either way, so the total is identical, but a purchase dated far in
 * the future -- imported data can hold one the form would refuse -- no longer means walking
 * (and risking overflowing `Period`'s four-digit year on) thousands of empty months to reach it.
 */
export function outstandingOf(
	card: Card,
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): number {
	const mine = purchases.filter((purchase) => purchase.cardId === card.id);
	const open = openPeriod(card, today);
	const periods = new Set(
		mine.map((purchase) => periodOfPurchase(card.cycle, purchase.date)),
	);
	periods.add(open);

	let total = 0;
	for (const period of periods) {
		const paid = payments.some(
			(payment) => payment.cardId === card.id && payment.period === period,
		);
		if (period === open || !paid) {
			total += buildStatement(card, period, mine).total;
		}
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
