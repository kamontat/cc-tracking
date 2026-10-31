import type { ReadyRow } from "#lib/domain/home";
import type { Card, LimitGroup } from "#lib/domain/types";

/** Shared by the Ready to use components' tests: three rows with different room and dates. */

export const testCard = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

const group: LimitGroup = { id: "g", name: "G", limit: 100_000_00 };

export const testRow = (
	id: string,
	room: number,
	closeDate: string,
	dueDate: string,
	extra: { sharedWith?: number; overdue?: boolean } = {},
): ReadyRow => ({
	card: testCard(id),
	room: {
		group,
		used: 40_000_00,
		available: room,
		held: 0,
		room,
		level: "within",
		sharedWith: extra.sharedWith ?? 0,
	} as ReadyRow["room"],
	closeDate,
	dueDate,
	overdue: extra.overdue ?? false,
});

export const testRows = (): ReadyRow[] => [
	testRow("A", 60_000_00, "2026-11-10", "2026-11-25", { overdue: true }),
	testRow("B", 80_000_00, "2026-11-25", "2026-12-15", { sharedWith: 1 }),
	testRow("C", 20_000_00, "2026-11-18", "2026-12-03"),
];

export const flat = (el: Element | ParentNode | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim();
