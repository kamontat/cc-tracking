import { expect, test } from "bun:test";
import "#components/cc-card-summary";
import type { GroupRoom } from "#lib/domain/room";
import { buildStatement } from "#lib/domain/statement";
import type {
	Card,
	LedgerStatement,
	LimitGroup,
	Purchase,
} from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const group: LimitGroup = { id: "pool", name: "KBank account", limit: 100_000 };

const purchase: Purchase = {
	id: "a",
	cardId: "kbank",
	date: "2026-08-10",
	amount: 85_000,
	note: "fuel",
};

/** A ledger statement, `paidAmount` of it settled. */
const stmt = (
	period: string,
	list: Purchase[],
	paidAmount = 0,
): LedgerStatement => {
	const built = buildStatement(card, period, list);
	return {
		cardId: built.cardId,
		period,
		closeDate: built.closeDate,
		dueDate: built.dueDate,
		purchases: built.purchases,
		total: built.total,
		paidAmount,
		remaining: built.total - paidAmount,
		paid: paidAmount > 0 && built.total === paidAmount,
		open: false,
	};
};

const roomOf = (used: number, sharedWith = 0): GroupRoom => ({
	group,
	used,
	available: group.limit - used,
	held: 0,
	room: group.limit - used,
	level:
		used > group.limit ? "over" : used >= group.limit * 0.8 ? "high" : "within",
	sharedWith,
});

type Props = {
	room: GroupRoom | null;
	owed: number;
	credit: number;
	next: LedgerStatement | null;
	payCardId: string;
	today: string;
};

const mount = async (overrides: Partial<Props> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-summary");
	Object.assign(element, {
		room: roomOf(85_000),
		owed: 85_000,
		credit: 0,
		// 2026-08 closes 18 Aug, due 02 Sep; today is 2026-08-30, so due soon.
		next: stmt("2026-08", [purchase]),
		payCardId: "kbank",
		today: "2026-08-30",
		...overrides,
	});
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const tile = (element: Element, name: string) =>
	element.shadowRoot?.querySelector<HTMLElement>(`[data-tile="${name}"]`);

test("shows what the group has left, of what limit, with a bar tinted as it runs out", async () => {
	const element = await mount();
	const available = tile(element, "available");
	expect(available?.textContent).toContain("฿150.00");
	expect(available?.textContent).toContain("of ฿1,000.00 · KBank account");
	expect(available?.querySelector(".usage")?.getAttribute("data-level")).toBe(
		"high",
	);
	expect(available?.dataset["level"]).toBe("high");
});

test("the bar counts what lists hold, so it agrees with the room figure", async () => {
	const room = { ...roomOf(50_000), held: 40_000, room: 10_000 };
	const bar = tile(
		await mount({ room }),
		"available",
	)?.querySelector<HTMLElement>(".usage > span");
	expect(bar?.getAttribute("style")).toContain("inline-size: 90%");
	expect(
		tile(await mount({ room }), "available")
			?.querySelector(".usage")
			?.getAttribute("data-level"),
	).toBe("high");
});

test("says how many other cards share the group, one or many", async () => {
	expect(tile(await mount(), "available")?.textContent).not.toContain("Shared");
	expect(
		tile(await mount({ room: roomOf(85_000, 1) }), "available")?.textContent,
	).toContain("Shared with 1 other card");
	expect(
		tile(await mount({ room: roomOf(85_000, 3) }), "available")?.textContent,
	).toContain("Shared with 3 other cards");
});

test("says so when the card draws on no group", async () => {
	const element = await mount({ room: null });
	expect(tile(element, "available")?.textContent).toContain(
		"This card draws on no limit group.",
	);
	expect(tile(element, "available")?.querySelector(".usage")).toBeNull();
});

test("shows what this card owes", async () => {
	const element = await mount({ owed: 123_456 });
	expect(tile(element, "owed")?.textContent).toContain("฿1,234.56");
});

test("shows the next statement due, its amount, and how urgent it is", async () => {
	const element = await mount();
	const next = tile(element, "next");
	expect(next?.textContent).toContain("฿850.00");
	expect(next?.textContent).toContain("Due 02 Sep 2026");
	expect(next?.dataset["urgency"]).toBe("soon");
});

test("shows only what is left on a partly paid next statement", async () => {
	const element = await mount({
		next: stmt("2026-08", [purchase], 35_000),
	});
	expect(tile(element, "next")?.textContent).toContain("฿500.00");
});

test("names the closing date of a statement that is still open", async () => {
	const element = await mount({ today: "2026-08-12" });
	const next = tile(element, "next");
	expect(next?.textContent).toContain("Still open, closes 18 Aug 2026");
	expect(next?.dataset["urgency"]).toBe("open");
});

test("says nothing is due when the next statement owes nothing", async () => {
	const element = await mount({
		next: stmt("2026-09", []),
	});
	expect(tile(element, "next")?.textContent).toContain("Nothing due");
});

test("shows credit only when the card holds some", async () => {
	expect(tile(await mount(), "owed")?.textContent).not.toContain("Credit");
	expect(tile(await mount({ credit: 5_000 }), "owed")?.textContent).toContain(
		"Credit ฿50.00",
	);
});

test("Make a payment opens the payment sheet on this card", async () => {
	const element = await mount();
	const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
		'button[data-action="pay"]',
	);
	expect(button?.textContent).toBe("Make a payment");
	const asked: unknown[] = [];
	const listen = (event: Event) => asked.push((event as CustomEvent).detail);
	document.addEventListener("cc:pay", listen);
	button?.click();
	document.removeEventListener("cc:pay", listen);
	expect(asked).toEqual([{ cardId: "kbank" }]);
});

test("renders in the chosen language", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ครบกำหนดถัดไป");
	setLocale("en");
});
