import { afterEach, expect, test } from "bun:test";
import { render } from "lit";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import {
	cardLabel,
	cardLabelHtml,
	cardLabelsText,
	cardLabelText,
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
