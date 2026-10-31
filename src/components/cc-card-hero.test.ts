import { afterEach, expect, test } from "bun:test";
import "#components/cc-card-hero";
import type { CcCardHero } from "#components/cc-card-hero";
import type { GroupRoom } from "#lib/domain/room";
import type { Card, LedgerStatement, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const scb: LimitGroup = { id: "g1", name: "SCB Business", limit: 200_000_00 };
const other: LimitGroup = { id: "g0", name: "KBank", limit: 100_000_00 };

const card: Card = {
	id: "SCB-B",
	name: "SCB Bangkok",
	last4: "5521",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
	limitGroupId: "g1",
};
const sibling: Card = { ...card, id: "SCB-K", name: "SCB Krabi" };

const room = (overrides: Partial<GroupRoom> = {}): GroupRoom => ({
	group: scb,
	used: 120_000_00,
	available: 80_000_00,
	held: 18_450_00,
	room: 61_550_00,
	level: "within",
	sharedWith: 1,
	...overrides,
});

const bill = (overrides: Partial<LedgerStatement> = {}): LedgerStatement => ({
	cardId: "SCB-B",
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	purchases: [],
	total: 14_700_00,
	paidAmount: 0,
	payments: [],
	remaining: 14_700_00,
	paid: false,
	open: false,
	...overrides,
});

const mount = async (props: Partial<CcCardHero> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-hero") as CcCardHero;
	Object.assign(element, {
		card,
		cards: [card, sibling],
		groups: [other, scb],
		room: room(),
		owed: 14_700_00,
		credit: 0,
		next: bill(),
		today: "2026-10-30",
		...props,
	});
	document.body.append(element);
	await element.updateComplete;
	return element.shadowRoot as ShadowRoot;
};

const text = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

test("the hero names the group, its holder and the cards it is shared with, on the group's pastel", async () => {
	const root = await mount();
	const hero = root.querySelector(".hero");
	expect(hero?.getAttribute("data-g")).toBe("2");
	expect(text(hero?.querySelector(".who"))).toBe(
		"SCB Business · KC · shared with SCB-K",
	);
});

test("a group of one names no one to share with", async () => {
	const root = await mount({ cards: [card], room: room({ sharedWith: 0 }) });
	expect(text(root.querySelector(".who"))).toBe("SCB Business · KC");
});

test("the room is the big figure, of the limit, with the bar and the share used", async () => {
	const root = await mount();
	expect(text(root.querySelector(".big"))).toBe("฿61,550.00");
	expect(text(root.querySelector(".of"))).toBe("room of ฿200,000.00");
	// used + held = 138,450 of 200,000 = 69%.
	const fill = root.querySelector<HTMLElement>(".bar > span");
	expect(fill?.getAttribute("style")).toContain("69%");
	expect(text(root.querySelector(".used"))).toBe(
		"69% used · buy today: closes 10 Nov 2026, due 05 Dec 2026",
	);
});

test("a card on no group says so instead of a room", async () => {
	const root = await mount({ room: null });
	expect(root.querySelector(".big")).toBeNull();
	expect(text(root.querySelector(".hero"))).toContain(
		"This card draws on no limit group.",
	);
});

test("three stats: owed, the next bill, and where the card is kept", async () => {
	const root = await mount();
	const stats = [...root.querySelectorAll(".stat")].map((s) => [
		text(s.querySelector("small")),
		text(s.querySelector("b")),
	]);
	expect(stats).toEqual([
		["Owed", "฿14,700.00"],
		["Next bill", "฿14,700.00"],
		["Kept in", "Bangkok"],
	]);
	expect(root.querySelector("b[data-overdue]")).toBeNull();
});

test("an overdue next bill reads in the bad colour; no bill is a dash", async () => {
	let root = await mount({ today: "2026-11-20" });
	expect(text(root.querySelector("b[data-overdue]"))).toBe("฿14,700.00");
	root = await mount({ next: null, owed: 0 });
	expect(text(root.querySelectorAll(".stat b")[1])).toBe("—");
});

test("credit takes the third stat's place when the card holds some", async () => {
	const root = await mount({ credit: 5_000_00, owed: 0, next: null });
	const last = root.querySelectorAll(".stat")[2];
	expect(text(last?.querySelector("small"))).toBe("Credit");
	expect(text(last?.querySelector("b"))).toBe("฿5,000.00");
});

test("figures carry data-numeric", async () => {
	const root = await mount();
	expect(root.querySelector(".big")?.hasAttribute("data-numeric")).toBe(true);
	expect(
		[...root.querySelectorAll(".stat b")]
			.slice(0, 2)
			.every((b) => b.hasAttribute("data-numeric")),
	).toBe(true);
});

test("a language switch re-renders in place", async () => {
	const root = await mount();
	setLocale("th");
	await (document.querySelector("cc-card-hero") as CcCardHero).updateComplete;
	expect(text(root.querySelector(".stat small"))).toBe("ยอดค้าง");
});
