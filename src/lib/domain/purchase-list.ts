import { addDays } from "#lib/domain/date";
import type { ListLine, Purchase, PurchaseList } from "#lib/domain/types";

/** Planned amounts; a saved list sums the real amount of its made lines. */
export function listTotal(list: PurchaseList): number {
	if (list.status === "saved") {
		return list.lines.reduce(
			(sum, line) => (line.made ? sum + (line.actual ?? line.amount) : sum),
			0,
		);
	}
	return list.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function allAnswered(list: PurchaseList): boolean {
	return list.lines.every((line) => line.made !== undefined);
}

export function saveReply(
	list: PurchaseList,
	opts: { now: string; newId: () => string; moveUnmade: boolean },
):
	| {
			ok: true;
			saved: PurchaseList;
			purchases: Purchase[];
			draft: PurchaseList | null;
	  }
	| { ok: false; reason: "unanswered" } {
	if (!allAnswered(list)) return { ok: false, reason: "unanswered" };

	const purchases: Purchase[] = list.lines
		.filter((line) => line.made)
		.map((line) => ({
			id: opts.newId(),
			cardId: line.cardId,
			date: list.date,
			amount: line.actual ?? line.amount,
			note: line.note ?? "",
			addedAt: opts.now,
		}));

	const unmade: ListLine[] = list.lines
		.filter((line) => !line.made)
		.map(
			(line): ListLine => ({
				cardId: line.cardId,
				amount: line.amount,
				...(line.note ? { note: line.note } : {}),
			}),
		);

	const draft: PurchaseList | null =
		opts.moveUnmade && unmade.length > 0
			? {
					id: opts.newId(),
					date: addDays(list.date, 1),
					status: "draft",
					lines: unmade,
				}
			: null;

	const saved: PurchaseList = {
		...list,
		status: "saved",
		savedAt: opts.now,
		...(draft ? { movedTo: draft.id } : {}),
	};
	return { ok: true, saved, purchases, draft };
}
