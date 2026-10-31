import { afterEach, beforeEach, expect, test } from "bun:test";
import "#components/cc-cards-list";
import type { CcCardsList } from "#components/cc-cards-list";
import {
	type CardsRooms,
	type CardsView,
	cardsResults,
	DEFAULT_CARDS_VIEW,
} from "#lib/domain/cards-view";
import { LOCATIONS } from "#lib/domain/location";
import type { GroupRoom } from "#lib/domain/room";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => setLocale("en"));

const card = (id: string, o: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
	...o,
});
const g1: LimitGroup = {
	id: "g1",
	name: "SCB",
	limit: 100_000_00,
	owner: "KC",
};
const g2: LimitGroup = { id: "g2", name: "UOB", limit: 10_000_00, owner: "NT" };
const room = (group: LimitGroup, used: number): GroupRoom => ({
	group,
	used,
	available: group.limit - used,
	held: 0,
	room: group.limit - used,
	level: "within",
	sharedWith: 0,
});
const rooms: CardsRooms = new Map([
	["g1", room(g1, 20_000_00)],
	["g2", room(g2, 9_000_00)],
]);
const cards = [
	card("A"),
	card("B/2", { location: "krabi", limitGroupId: "g2" }),
	card("C", { location: "krabi" }),
	card("Z", { archived: true }),
];

const mount = async (
	view: Partial<CardsView> = {},
	props: Partial<CcCardsList> = {},
	list: Card[] = cards,
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-cards-list") as CcCardsList;
	element.results = cardsResults(
		list,
		[g1, g2],
		rooms,
		{ ...DEFAULT_CARDS_VIEW, ...view },
		LOCATIONS,
	);
	element.groups = [g1, g2];
	element.rooms = rooms;
	element.credits = new Map([["C", 250_00]]);
	element.settings = { purchaseLocations: ["krabi"] };
	element.total = list.length;
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

test("by place: a section per location in order, headed by its name and count", async () => {
	const { root } = await mount();
	const sections = [...root.querySelectorAll("section[data-location]")];
	expect(sections.map((s) => s.getAttribute("data-location"))).toEqual([
		"bangkok",
		"krabi",
	]);
	expect(text(sections[0]?.querySelector(".place"))).toBe("Bangkok 1 card");
	expect(text(sections[1]?.querySelector(".place"))).toBe(
		"Krabi 2 cards · takes purchases",
	);
});

test("the route names the places", async () => {
	const { root } = await mount({}, { locationName: (id) => `Place ${id}` });
	expect(
		text(root.querySelector("section[data-location=krabi] .place b")),
	).toBe("Place krabi");
});

test("rows link to the card page, encoded, with the chip and id) name", async () => {
	const { root } = await mount();
	const links = [
		...root.querySelectorAll<HTMLAnchorElement>("section a.crow[data-card]"),
	];
	expect(links.map((a) => a.getAttribute("href"))).toEqual([
		"/card?id=A",
		"/card?id=B%2F2",
		"/card?id=C",
	]);
	expect(links[0]?.querySelector(".mini")?.textContent).toBe("1111");
	expect(text(links[0]?.querySelector(".cl-short"))).toBe("A) Card A");
});

test("rows are titled id) name · holder (last4), with the open period's dates and a Supplementary tag", async () => {
	const { limitGroupId: _unused, ...bare } = card("N", { last4: "" });
	const list = [
		card("A"),
		card("S", { supplementary: true, owner: "NT" }),
		bare,
	];
	const { root } = await mount({}, { today: "2026-10-30" }, list);
	const row = (id: string) => root.querySelector(`a[data-card="${id}"]`);
	expect(text(row("A")?.querySelector(".t .cl-full"))).toBe(
		"A) Card A · KC (1111)",
	);
	expect(text(row("A")?.querySelector(".sub"))).toBe(
		"closes 18 Nov 2026 · due 03 Dec 2026",
	);
	expect(row("A")?.querySelector(".tag")).toBeNull();
	expect(text(row("S")?.querySelector(".tag"))).toBe("Supplementary");
	expect(text(row("S")?.querySelector(".t .cl-full"))).toBe(
		"S) Card S · NT (1111)",
	);
	expect(text(row("N")?.querySelector(".t .cl-full"))).toBe("N) Card N");
});

test("the right side: room, N% used from 80% in the warn tone, or credit", async () => {
	const { root } = await mount();
	const right = (id: string) => root.querySelector(`a[data-card="${id}"] .r`);
	expect(text(right("A"))).toBe("฿80,000.00 room");
	expect(text(right("B/2"))).toBe("฿1,000.00 90% used");
	expect(right("B/2")?.querySelector("small")?.getAttribute("data-tone")).toBe(
		"warn",
	);
	expect(right("B/2")?.querySelector("[data-numeric]")).not.toBeNull();
	expect(text(right("C"))).toBe("฿80,000.00 credit ฿250.00");
});

test("a card with no limit group, or a deleted one, says so in place of a dash", async () => {
	const { root } = await mount({}, {}, [
		(({ limitGroupId: _, ...rest }) => rest)(card("N")),
		card("D", { limitGroupId: "gone" }),
	]);
	for (const id of ["N", "D"]) {
		const right = root.querySelector(`a[data-card="${id}"] .r`);
		expect(text(right)).toBe("No limit group");
		expect(right?.querySelector("[data-numeric]")).toBeNull();
	}
});

test("any other sort is one flat list headed N cards, rows adding place and holder", async () => {
	const { root } = await mount({ sort: "name" });
	expect(root.querySelector("section[data-location]")).toBeNull();
	expect(text(root.querySelector(".result-head"))).toBe("3 cards");
	expect(text(root.querySelector('a[data-card="B/2"] .word'))).toBe(
		"· Krabi · NT",
	);
});

test("archived cards fold at the end, closed, and remember being opened", async () => {
	const { root } = await mount();
	const details = root.querySelector("details.archive") as HTMLDetailsElement;
	expect(details.open).toBe(false);
	expect(text(details.querySelector("summary"))).toBe("Archived (1)");
	expect(details.querySelector('a[data-card="Z"]')).not.toBeNull();
	expect(root.querySelector('section a[data-card="Z"]')).toBeNull();
	details.open = true;
	details.dispatchEvent(new Event("toggle"));
	expect(globalThis.localStorage.getItem("cc:panel:cards-archive")).toBe(
		"open",
	);
	const again = await mount();
	expect(
		(again.root.querySelector("details.archive") as HTMLDetailsElement).open,
	).toBe(true);
});

test("no archived card, no fold", async () => {
	const { root } = await mount({}, {}, cards.slice(0, 3));
	expect(root.querySelector("details.archive")).toBeNull();
});

test("no match names the way out", async () => {
	const { root } = await mount({ q: "nothing" });
	expect(text(root.querySelector(".empty"))).toBe(
		"No card matches. Clear the search or a filter.",
	);
});

test("no cards at all says how to add one", async () => {
	const { root } = await mount({}, {}, []);
	expect(text(root.querySelector(".empty"))).toBe(
		"No cards yet. Add one with Add card.",
	);
});

test("a language switch re-renders in place", async () => {
	const { element, root } = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(text(root.querySelector('a[data-card="A"] .r small'))).not.toBe(
		"room",
	);
});
