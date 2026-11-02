import { expect, test } from "bun:test";
import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view";
import { setLocale } from "#lib/i18n/index";
import {
	groupSheetAddress,
	NEW_GROUP,
	readCardsView,
	readGroupSheet,
	writeCardsView,
} from "#lib/ui/cards-query";

test("an empty address reads as the defaults and writes as nothing", () => {
	expect(readCardsView("", [])).toEqual(DEFAULT_CARDS_VIEW);
	expect(writeCardsView(DEFAULT_CARDS_VIEW)).toBe("");
});

test("round trip with repeated loc and owner", () => {
	const view: CardsView = {
		q: "kb x",
		locations: ["bangkok", "krabi"],
		owners: ["KC", "RI"],
		ungrouped: true,
		sort: "close",
	};
	const text = writeCardsView(view);
	expect(text).toBe(
		"?q=kb+x&loc=bangkok&loc=krabi&owner=KC&owner=RI&ungrouped=1&sort=close",
	);
	expect(readCardsView(text, ["bangkok", "krabi"])).toEqual(view);
});

test("unknown sort, owner and place are ignored, as are the retired keys", () => {
	expect(
		readCardsView(
			"?sort=zzz&owner=XX&loc=mars&dir=desc&gq=a&gowner=KC&edit=1",
			["bangkok"],
		),
	).toEqual(DEFAULT_CARDS_VIEW);
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room" })).toBe(
		"?sort=room",
	);
});

test("a place is read when a stored record has its id, in the address's order", () => {
	setLocale("en");
	expect(
		readCardsView("?loc=mars&loc=chiang-mai&loc=bangkok", [
			"bangkok",
			"chiang-mai",
		]).locations,
	).toEqual(["chiang-mai", "bangkok"]);
	expect(readCardsView("?loc=chiang-mai", ["chiang-mai"]).locations).toEqual([
		"chiang-mai",
	]);
	expect(readCardsView("?loc=bangkok", []).locations).toEqual([]);
});

test("readGroupSheet", () => {
	expect(readGroupSheet("")).toBeNull();
	expect(readGroupSheet("?group=")).toBeNull();
	expect(readGroupSheet("?newGroup=1")).toBe(NEW_GROUP);
	expect(readGroupSheet("?newGroup=1&group=pool")).toBe(NEW_GROUP);
	expect(readGroupSheet("?q=a&group=pool")).toBe("pool");
});

test("groupSheetAddress opens and closes, keeping the rest", () => {
	expect(groupSheetAddress("", "pool")).toBe("?group=pool");
	expect(groupSheetAddress("", null)).toBe("");
	expect(groupSheetAddress("?q=a&group=x", NEW_GROUP)).toBe("?q=a&newGroup=1");
	expect(groupSheetAddress("?q=a&newGroup=1", "pool")).toBe("?q=a&group=pool");
	expect(groupSheetAddress("?q=a&newGroup=1", null)).toBe("?q=a");
	expect(groupSheetAddress("?q=a&group=x", null)).toBe("?q=a");
	expect(groupSheetAddress("", "a b")).toBe("?group=a+b");
});

test("?group=new is a group whose id is new; ?ungrouped=1 reads as the filter", () => {
	expect(readGroupSheet("?group=new")).toBe("new");
	expect(groupSheetAddress("", NEW_GROUP)).toBe("?newGroup=1");
	expect(groupSheetAddress("", "new")).toBe("?group=new");
	expect(readCardsView("?ungrouped=1", []).ungrouped).toBe(true);
	expect(readCardsView("?ungrouped=0", []).ungrouped).toBe(false);
});
