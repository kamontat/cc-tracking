import { expect, test } from "vitest"

import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { setLocale } from "#lib/i18n/index"
import {
	groupSheetAddress,
	NEW_GROUP,
	readCardsShow,
	readCardsView,
	readGroupSheet,
	writeCardsView,
} from "#lib/ui/cards-query"

test("an empty address reads as the defaults and writes as nothing", () => {
	expect(readCardsView("", [])).toEqual(DEFAULT_CARDS_VIEW)
	expect(writeCardsView(DEFAULT_CARDS_VIEW)).toBe("")
})

test("due sort survives an address round trip", () => {
	const view = { ...DEFAULT_CARDS_VIEW, sort: "due" as const, dir: "asc" as const }
	expect(writeCardsView(view)).toBe("?sort=due")
	expect(readCardsView("?sort=due", [])).toEqual(view)
})

test("round trip with repeated loc and owner", () => {
	const view: CardsView = {
		q: "kb x",
		locations: ["bangkok", "krabi"],
		owners: ["KC", "RI"],
		ungrouped: true,
		sort: "close",
		dir: "desc",
	}
	const text = writeCardsView(view)
	expect(text).toBe("?q=kb+x&loc=bangkok&loc=krabi&owner=KC&owner=RI&ungrouped=1&sort=close&dir=desc")
	expect(readCardsView(text, ["bangkok", "krabi"])).toEqual(view)
})

test("unknown sort, owner and place are ignored, as are the retired keys", () => {
	expect(readCardsView("?sort=zzz&owner=XX&loc=mars&dir=up&gq=a&gowner=KC&edit=1", ["bangkok"])).toEqual(
		DEFAULT_CARDS_VIEW,
	)
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room", dir: "desc" })).toBe("?sort=room")
})

test("dir is written only when it is not the sort's own default, and read against that sort", () => {
	expect(readCardsView("?sort=room", [])).toMatchObject({ sort: "room", dir: "desc" })
	expect(readCardsView("?sort=room&dir=asc", [])).toMatchObject({ sort: "room", dir: "asc" })
	expect(readCardsView("?dir=desc", [])).toMatchObject({ sort: "place", dir: "desc" })
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room", dir: "asc" })).toBe("?sort=room&dir=asc")
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, dir: "desc" })).toBe("?dir=desc")
})

test("a place is read when a stored record has its id, in the address's order", () => {
	setLocale("en")
	expect(readCardsView("?loc=mars&loc=chiang-mai&loc=bangkok", ["bangkok", "chiang-mai"]).locations).toEqual([
		"chiang-mai",
		"bangkok",
	])
	expect(readCardsView("?loc=chiang-mai", ["chiang-mai"]).locations).toEqual(["chiang-mai"])
	expect(readCardsView("?loc=bangkok", []).locations).toEqual([])
})

test("readGroupSheet", () => {
	expect(readGroupSheet("")).toBeNull()
	expect(readGroupSheet("?group=")).toBeNull()
	expect(readGroupSheet("?newGroup=1")).toBe(NEW_GROUP)
	expect(readGroupSheet("?newGroup=1&group=pool")).toBe(NEW_GROUP)
	expect(readGroupSheet("?q=a&group=pool")).toBe("pool")
})

test("groupSheetAddress opens and closes, keeping the rest", () => {
	expect(groupSheetAddress("", "pool")).toBe("?group=pool")
	expect(groupSheetAddress("", null)).toBe("")
	expect(groupSheetAddress("?q=a&group=x", NEW_GROUP)).toBe("?q=a&newGroup=1")
	expect(groupSheetAddress("?q=a&newGroup=1", "pool")).toBe("?q=a&group=pool")
	expect(groupSheetAddress("?q=a&newGroup=1", null)).toBe("?q=a")
	expect(groupSheetAddress("?q=a&group=x", null)).toBe("?q=a")
	expect(groupSheetAddress("", "a b")).toBe("?group=a+b")
})

test("?group=new is a group whose id is new; ?ungrouped=1 reads as the filter", () => {
	expect(readGroupSheet("?group=new")).toBe("new")
	expect(groupSheetAddress("", NEW_GROUP)).toBe("?newGroup=1")
	expect(groupSheetAddress("", "new")).toBe("?group=new")
	expect(readCardsView("?ungrouped=1", []).ungrouped).toBe(true)
	expect(readCardsView("?ungrouped=0", []).ungrouped).toBe(false)
})

test("the phone view: ?view=groups shows the groups, anything else the cards", () => {
	expect(readCardsShow("")).toBe("cards")
	expect(readCardsShow("?view=groups")).toBe("groups")
	expect(readCardsShow("?view=zzz")).toBe("cards")
	expect(writeCardsView(DEFAULT_CARDS_VIEW, "cards")).toBe("")
	expect(writeCardsView(DEFAULT_CARDS_VIEW, "groups")).toBe("?view=groups")
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, q: "a" }, "groups")).toBe("?view=groups&q=a")
})
