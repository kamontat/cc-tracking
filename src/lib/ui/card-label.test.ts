import { afterEach, expect, test } from "bun:test";
import { render } from "lit";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import {
	cardIdTag,
	cardLabel,
	cardLabelHtml,
	cardLabelsText,
	cardLabelText,
	cardMetaText,
	cardMini,
	cardNameHtml,
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
};

test("a card reads as id, name and last 4", () => {
	expect(cardLabel("10", card)).toEqual({
		id: "10)",
		name: "Card A10",
		last4: "(4412)",
	});
	expect(cardLabelText("10", card)).toBe("10) Card A10 (4412)");
	expect(cardLabelText("10", card, { last4: false })).toBe("10) Card A10");
});

test("a card no longer stored keeps its id", () => {
	expect(cardLabel("A", undefined)).toEqual({ id: "A)", name: "—", last4: "" });
	expect(cardLabelText("A", undefined)).toBe("A) —");
});

test("several cards are listed with commas", () => {
	expect(cardLabelsText(["10", "A"], [card])).toBe("10) Card A10 (4412), A) —");
});

test("the markup puts the last 4 in its own element", () => {
	const host = document.createElement("div");
	render(cardLabelHtml("10", card), host);
	const label = host.querySelector(".card-label");
	expect(label?.textContent?.replace(/\s+/g, " ").trim()).toBe(
		"10) Card A10 (4412)",
	);
	expect(label?.querySelector(".last4")?.textContent).toBe("(4412)");

	render(cardLabelHtml("A", undefined), host);
	expect(host.querySelector(".last4")).toBeNull();
});

const groups: LimitGroup[] = [
	{ id: "g1", name: "SCB", limit: 1 },
	{ id: "g2", name: "UOB", limit: 1 },
	{ id: "g3", name: "K", limit: 1 },
	{ id: "g4", name: "B", limit: 1 },
	{ id: "g5", name: "T", limit: 1 },
];

test("phase 4 names a card by its name, with the id in brackets and the last 4", () => {
	expect(cardIdTag("SCB-K")).toBe("[SCB-K]");
	expect(cardMetaText(card)).toBe("[10] · 4412");
	const host = document.createElement("div");
	render(cardNameHtml(card), host);
	expect(host.querySelector(".card-name b")?.textContent).toBe("Card A10");
	expect(host.querySelector(".card-meta")?.textContent).toBe("[10] · 4412");
});

test("a card's colour follows its group's place in the stored order, four colours round", () => {
	expect(groupTone({ ...card, limitGroupId: "g1" }, groups)).toBe(1);
	expect(groupTone({ ...card, limitGroupId: "g2" }, groups)).toBe(2);
	expect(groupTone({ ...card, limitGroupId: "g5" }, groups)).toBe(1);
	expect(groupTone({ ...card, limitGroupId: "nope" }, groups)).toBeNull();
	expect(groupTone(card, groups)).toBeNull();
});

test("the mini chip shows the last 4 in the group's colour, hidden from readers", () => {
	const host = document.createElement("div");
	render(cardMini({ ...card, limitGroupId: "g2" }, groups, true), host);
	const mini = host.querySelector(".mini");
	expect(mini?.textContent).toBe("4412");
	expect(mini?.getAttribute("data-g")).toBe("2");
	expect(mini?.hasAttribute("data-big")).toBe(true);
	expect(mini?.getAttribute("aria-hidden")).toBe("true");
	render(cardMini(card, groups), host);
	expect(host.querySelector(".mini")?.hasAttribute("data-g")).toBe(false);
});
