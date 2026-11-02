import { expect, test } from "bun:test";
import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view";
import {
	groupSheetAddress,
	readCardsView,
	readGroupSheet,
	writeCardsView,
} from "#lib/ui/cards-query";

test("an empty address reads as the defaults and writes as nothing", () => {
	expect(readCardsView("")).toEqual(DEFAULT_CARDS_VIEW);
	expect(writeCardsView(DEFAULT_CARDS_VIEW)).toBe("");
});

test("round trip with repeated loc and owner", () => {
	const view: CardsView = {
		q: "kb x",
		locations: ["bangkok", "krabi"],
		owners: ["KC", "RI"],
		sort: "close",
	};
	const text = writeCardsView(view);
	expect(text).toBe(
		"?q=kb+x&loc=bangkok&loc=krabi&owner=KC&owner=RI&sort=close",
	);
	expect(readCardsView(text)).toEqual(view);
});

test("unknown sort, owner and place are ignored, as are the retired keys", () => {
	expect(
		readCardsView("?sort=zzz&owner=XX&loc=mars&dir=desc&gq=a&gowner=KC&edit=1"),
	).toEqual(DEFAULT_CARDS_VIEW);
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room" })).toBe(
		"?sort=room",
	);
});

test("readGroupSheet", () => {
	expect(readGroupSheet("")).toBeNull();
	expect(readGroupSheet("?group=")).toBeNull();
	expect(readGroupSheet("?group=new")).toBe("new");
	expect(readGroupSheet("?q=a&group=pool")).toBe("pool");
});

test("groupSheetAddress opens and closes, keeping the rest", () => {
	expect(groupSheetAddress("", "pool")).toBe("?group=pool");
	expect(groupSheetAddress("", null)).toBe("");
	expect(groupSheetAddress("?q=a&group=x", "new")).toBe("?q=a&group=new");
	expect(groupSheetAddress("?q=a&group=x", null)).toBe("?q=a");
	expect(groupSheetAddress("", "a b")).toBe("?group=a+b");
});
