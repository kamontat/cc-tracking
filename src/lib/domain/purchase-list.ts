import type { ListLine, Purchase, PurchaseList } from "#lib/domain/types"

import { addDays } from "#lib/domain/date"

/** Planned amounts; a saved list sums the real amount of its made lines. */
export function listTotal(list: PurchaseList): number {
	if (list.status === "saved") {
		return list.lines.reduce((sum, line) => (line.made ? sum + (line.actual ?? line.amount) : sum), 0)
	}
	return list.lines.reduce((sum, line) => sum + line.amount, 0)
}

/** How many cards are on `lines`, each counted once, and how many orders (lines) in all. */
export function listCount(lines: ListLine[]): { cards: number; orders: number } {
	return { cards: new Set(lines.map((line) => line.cardId)).size, orders: lines.length }
}

export function allAnswered(list: PurchaseList): boolean {
	return list.lines.every((line) => line.made !== undefined)
}

export function saveReply(
	list: PurchaseList,
	opts: { now: string; newId: () => string; moveUnmade: boolean },
):
	| {
			ok: true
			saved: PurchaseList
			purchases: Purchase[]
			draft: PurchaseList | null
	  }
	| { ok: false; reason: "unanswered" } {
	if (!allAnswered(list)) return { ok: false, reason: "unanswered" }

	const purchases: Purchase[] = list.lines
		.filter((line) => line.made)
		.map((line) => ({
			id: opts.newId(),
			cardId: line.cardId,
			date: list.date,
			amount: line.actual ?? line.amount,
			note: line.note ?? "",
			addedAt: opts.now,
		}))

	const unmade: ListLine[] = list.lines
		.filter((line) => !line.made)
		.map(
			(line): ListLine => ({
				cardId: line.cardId,
				amount: line.amount,
				...(line.note ? { note: line.note } : {}),
			}),
		)

	const draft: PurchaseList | null =
		opts.moveUnmade && unmade.length > 0
			? {
					id: opts.newId(),
					date: addDays(list.date, 1),
					status: "draft",
					lines: unmade,
				}
			: null

	const saved: PurchaseList = {
		...list,
		status: "saved",
		savedAt: opts.now,
		...(draft ? { movedTo: draft.id } : {}),
	}
	return { ok: true, saved, purchases, draft }
}

/** Only a draft or a list waiting for the spender can take in another. */
const mergeable = (list: PurchaseList): boolean => list.status === "draft" || list.status === "sent"

/** The other lists `list` can merge with: the same date and the same status, a draft or waiting (DD-187). */
export function mergeCandidates(list: PurchaseList, lists: PurchaseList[]): PurchaseList[] {
	if (!mergeable(list)) return []
	return lists.filter((l) => l.id !== list.id && l.date === list.date && l.status === list.status)
}

/**
 * `into` with every order of `others` added: a card's orders stay together, cards in the order
 * first seen, and a card's blank draft line (no amount, no note) goes once it has a real order.
 * Merged waiting lists keep the earliest sent time. Throws for lists that may not merge.
 */
export function mergeLists(into: PurchaseList, others: PurchaseList[]): PurchaseList {
	if (!mergeable(into) || others.some((l) => l.date !== into.date || l.status !== into.status)) {
		throw new Error("only same-day drafts, or same-day waiting lists, merge")
	}
	const byCard = new Map<string, ListLine[]>()
	for (const line of [into, ...others].flatMap((l) => l.lines)) {
		byCard.set(line.cardId, [...(byCard.get(line.cardId) ?? []), line])
	}
	const blank = (line: ListLine) => line.amount === 0 && !line.note
	const lines = [...byCard.values()].flatMap((orders) => {
		const real = orders.filter((line) => !blank(line))
		return real.length > 0 ? real : orders.slice(0, 1)
	})
	const sent = [into, ...others].flatMap((l) => (l.sentAt ? [l.sentAt] : [])).sort()
	return { ...into, lines, ...(sent[0] ? { sentAt: sent[0] } : {}) }
}
