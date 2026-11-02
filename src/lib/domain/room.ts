import { usageLevel } from "#lib/domain/limit";
import type {
	Card,
	CardLedger,
	LimitGroup,
	PurchaseList,
} from "#lib/domain/types";

export type GroupRoom = {
	group: LimitGroup;
	/** Owed less credit, across every card in the group, archived included. */
	used: number;
	/** `limit - used`; above the limit when credit exceeds what is owed. */
	available: number;
	/** Planned satang on sent lists, not yet reflected in the ledgers. */
	held: number;
	/** `available - held`. */
	room: number;
	level: "within" | "high" | "over";
	/** The group's other cards, archived included. */
	sharedWith: number;
};

/** Planned satang across the given lists for cards in the group, optionally skipping one list. */
export function heldBy(
	lists: PurchaseList[],
	cards: Card[],
	groupId: string,
	exceptListId?: string,
): number {
	const inGroup = new Set(
		cards.filter((c) => c.limitGroupId === groupId).map((c) => c.id),
	);
	let held = 0;
	for (const l of lists) {
		if (l.id === exceptListId) continue;
		for (const line of l.lines) {
			if (inGroup.has(line.cardId)) held += line.amount;
		}
	}
	return held;
}

export function groupRoom(
	group: LimitGroup,
	cards: Card[],
	ledgers: Map<string, CardLedger>,
	lists: PurchaseList[],
	cardId: string,
	exceptListId?: string,
): GroupRoom {
	const members = cards.filter((c) => c.limitGroupId === group.id);
	let used = 0;
	for (const c of members) {
		const l = ledgers.get(c.id);
		if (l) used += l.owed - l.credit;
	}
	const available = group.limit - used;
	const held = heldBy(
		lists.filter((l) => l.status === "sent"),
		cards,
		group.id,
		exceptListId,
	);
	return {
		group,
		used,
		available,
		held,
		room: available - held,
		level: usageLevel(used, group.limit),
		sharedWith: members.filter((c) => c.id !== cardId).length,
	};
}
