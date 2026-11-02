import { afterEach, expect, test } from "bun:test";
import { render } from "lit";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import {
	cardLine,
	cardLineHtml,
	cardLines,
	cardMini,
	cardName,
	cardOwnerName,
	cardPanel,
	cardShort,
	groupTone,
} from "#lib/ui/card-label";

afterEach(() => setLocale("en"));

const card: Card = {
	id: "10",
	name: "Card A10",
	last4: "4412",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g2",
};

const groups: LimitGroup[] = [
	{ id: "g1", name: "SCB", limit: 1 },
	{ id: "g2", name: "UOB", limit: 1 },
	{ id: "g3", name: "K", limit: 1 },
	{ id: "g4", name: "B", limit: 1 },
	{ id: "g5", name: "T", limit: 1 },
];

const { limitGroupId: _, ...ungrouped } = card;

const text = (host: Element | null | undefined) =>
	host?.textContent?.replace(/\s+/g, " ").trim();

test("the line form reads id, name and last 4; its short form leaves the digits off", () => {
	expect(cardLine("10", card)).toBe("10) Card A10 (4412)");
	expect(cardLine("10", card, { short: true })).toBe("10) Card A10");
});

test("the line form keeps the id of a card no longer stored", () => {
	expect(cardLine("A", undefined)).toBe("A) —");
	expect(cardLine("A", undefined, { short: true })).toBe("A) —");
});

test("several cards' lines are listed with commas", () => {
	expect(cardLines(["10", "A"], [card])).toBe("10) Card A10 (4412), A) —");
	expect(cardLines(["10", "A"], [card], { short: true })).toBe(
		"10) Card A10, A) —",
	);
});

test("the name form is the name; its short form is c-[id]", () => {
	expect(cardName("10", card)).toBe("Card A10");
	expect(cardShort("SCB-K")).toBe("c-[SCB-K]");
	expect(cardName("5", undefined)).toBe("c-[5]");
});

test("the line markup holds the full and the short form, for CSS to swap", () => {
	const host = document.createElement("div");
	render(cardLineHtml("10", card), host);
	expect(text(host.querySelector(".cl-full"))).toBe("10) Card A10 (4412)");
	expect(text(host.querySelector(".cl-short"))).toBe("10) Card A10");
	expect(host.querySelector(".cl-short")?.getAttribute("aria-hidden")).toBe(
		"true",
	);
});

test("the panel form is the last-4 chip, then id) name", () => {
	const host = document.createElement("div");
	render(cardPanel("10", card, groups), host);
	expect(host.querySelector(".mini")?.textContent).toBe("4412");
	expect(host.querySelector(".mini")?.getAttribute("data-g")).toBe("2");
	expect(text(host.querySelector(".card-label"))).toBe("10) Card A10");
	expect(text(host)).toBe("4412 10) Card A10");

	render(cardPanel("A", undefined, groups), host);
	expect(host.querySelector(".mini")?.textContent).toBe("");
	expect(text(host.querySelector(".card-label"))).toBe("A) —");
});

test("a card's colour follows its group's place in the stored order, four colours round", () => {
	expect(groupTone({ ...card, limitGroupId: "g1" }, groups)).toBe(1);
	expect(groupTone({ ...card, limitGroupId: "g2" }, groups)).toBe(2);
	expect(groupTone({ ...card, limitGroupId: "g5" }, groups)).toBe(1);
	expect(groupTone({ ...card, limitGroupId: "nope" }, groups)).toBeNull();
	expect(groupTone(ungrouped, groups)).toBeNull();
});

test("the mini chip shows the last 4 in the group's colour", () => {
	const host = document.createElement("div");
	render(cardMini(card, groups, true), host);
	const mini = host.querySelector(".mini");
	expect(mini?.textContent).toBe("4412");
	expect(mini?.getAttribute("data-g")).toBe("2");
	expect(mini?.hasAttribute("data-big")).toBe(true);
	render(cardMini(ungrouped, groups), host);
	expect(host.querySelector(".mini")?.hasAttribute("data-g")).toBe(false);
	render(cardMini(undefined, groups), host);
	expect(host.querySelector(".mini")?.getAttribute("aria-hidden")).toBe("true");
});

test("cardOwnerName adds the cardholder: the group's owner, or a supplementary card's own", () => {
	const owned: LimitGroup[] = [{ id: "g2", name: "G", limit: 1, owner: "RI" }];
	expect(cardOwnerName("10", card, owned)).toBe("Card A10 (RI)");
	expect(
		cardOwnerName("10", { ...card, supplementary: true, owner: "NT" }, owned),
	).toBe("Card A10 (NT)");
	// A group with no owner is the default holder; no group at all is no holder.
	expect(cardOwnerName("10", card, [{ id: "g2", name: "G", limit: 1 }])).toBe(
		"Card A10 (KC)",
	);
	const { limitGroupId: _unused, ...noGroup } = card;
	expect(cardOwnerName("10", noGroup, owned)).toBe("Card A10");
	expect(cardOwnerName("10", undefined, owned)).toBe("c-[10]");
});
