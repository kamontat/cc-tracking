import { expect, test } from "vitest"

import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { DEFAULT_LIMITS_VIEW, type LimitsView } from "#lib/domain/limits-view"
import { setLocale } from "#lib/i18n/index"
import {
	LIMITS_ADDRESS,
	limitAddress,
	readCardsView,
	readLimitsView,
	writeCardsView,
	writeLimitsView,
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

test("round trip with repeated f.locations and f.owners", () => {
	const view: CardsView = {
		q: "kb x",
		locations: ["bangkok", "krabi"],
		owners: ["KC", "RI"],
		usage: [],
		sort: "close",
		dir: "desc",
		by: "holder",
	}
	const text = writeCardsView(view)
	expect(text).toBe(
		"?q=kb+x&f.locations=bangkok&f.locations=krabi&f.owners=KC&f.owners=RI&sort=close&dir=desc&by=holder",
	)
	expect(readCardsView(text, ["bangkok", "krabi"])).toEqual(view)
})

test("f.usage repeats, read in the usages' order once each; unknown ones are ignored", () => {
	const view: CardsView = { ...DEFAULT_CARDS_VIEW, usage: ["used", "unused"] }
	expect(writeCardsView(view)).toBe("?f.usage=used&f.usage=unused")
	expect(readCardsView("?f.usage=unused&f.usage=zzz&f.usage=used&f.usage=used", [])).toEqual(view)
	expect(readCardsView("?f.usage=unused", []).usage).toEqual(["unused"])
})

test("the used sort runs most used first, and survives a round trip", () => {
	expect(readCardsView("?sort=used", [])).toMatchObject({ sort: "used", dir: "desc" })
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "used", dir: "desc" })).toBe("?sort=used")
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "used", dir: "asc" })).toBe("?sort=used&dir=asc")
})

test("unknown sort, owner and place are ignored, as are the retired keys", () => {
	expect(readCardsView("?sort=zzz&f.owners=XX&f.locations=mars&dir=up&gq=a&gowner=KC&edit=1", ["bangkok"])).toEqual(
		DEFAULT_CARDS_VIEW,
	)
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room", dir: "desc" })).toBe("?sort=room")
})

test("dir is written only when it is not the sort's own default, and read against that sort", () => {
	expect(readCardsView("?sort=room", [])).toMatchObject({ sort: "room", dir: "desc" })
	expect(readCardsView("?sort=room&dir=asc", [])).toMatchObject({ sort: "room", dir: "asc" })
	expect(readCardsView("?dir=desc", [])).toMatchObject({ sort: "card", dir: "desc" })
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, sort: "room", dir: "asc" })).toBe("?sort=room&dir=asc")
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, dir: "desc" })).toBe("?dir=desc")
})

test("a place is read when a stored record has its id, in the address's order", () => {
	setLocale("en")
	expect(
		readCardsView("?f.locations=mars&f.locations=chiang-mai&f.locations=bangkok", ["bangkok", "chiang-mai"]).locations,
	).toEqual(["chiang-mai", "bangkok"])
	expect(readCardsView("?f.locations=chiang-mai", ["chiang-mai"]).locations).toEqual(["chiang-mai"])
	expect(readCardsView("?f.locations=bangkok", []).locations).toEqual([])
})

test("?ungrouped=1 is no longer read (RD-27)", () => {
	expect(readCardsView("?ungrouped=1", [])).toEqual(DEFAULT_CARDS_VIEW)
})

test("the retired view, group and newGroup keys, and the old loc and owner, are ignored and never written", () => {
	expect(readCardsView("?view=groups&group=g1&newGroup=1&loc=bangkok&owner=KC", ["bangkok"])).toEqual(
		DEFAULT_CARDS_VIEW,
	)
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, q: "a" })).toBe("?q=a")
})

test("by groups the cards, place by default; the retired place sort reads as the default", () => {
	expect(readCardsView("?by=limit", [])).toMatchObject({ by: "limit" })
	expect(readCardsView("?by=zzz", [])).toMatchObject({ by: "place" })
	expect(writeCardsView({ ...DEFAULT_CARDS_VIEW, by: "none" })).toBe("?by=none")
	expect(readCardsView("?sort=place", [])).toEqual(DEFAULT_CARDS_VIEW)
})

test("the Limits tab's address, and a group's panel on it", () => {
	expect(LIMITS_ADDRESS).toBe("/cards/limits")
	expect(limitAddress("2f1c")).toBe("/cards/limits?limit=2f1c")
})

test("the Limits view: the defaults read from nothing and write as nothing", () => {
	expect(readLimitsView("")).toEqual(DEFAULT_LIMITS_VIEW)
	expect(writeLimitsView(DEFAULT_LIMITS_VIEW)).toBe("")
})

test("the Limits view round trips q, repeated f.owners, sort and dir", () => {
	const view: LimitsView = { q: "kb x", owners: ["KC", "RI"], sort: "used", dir: "asc" }
	const text = writeLimitsView(view)
	expect(text).toBe("?q=kb+x&f.owners=KC&f.owners=RI&sort=used&dir=asc")
	expect(readLimitsView(text)).toEqual(view)
})

test("the Limits view writes dir only off the sort's own, room and used running most first", () => {
	expect(readLimitsView("?sort=room")).toMatchObject({ sort: "room", dir: "desc" })
	expect(readLimitsView("?sort=used")).toMatchObject({ sort: "used", dir: "desc" })
	expect(writeLimitsView({ ...DEFAULT_LIMITS_VIEW, sort: "room", dir: "desc" })).toBe("?sort=room")
	expect(writeLimitsView({ ...DEFAULT_LIMITS_VIEW, dir: "desc" })).toBe("?dir=desc")
})

test("the Limits view ignores unknown values and the Cards tab's keys", () => {
	expect(readLimitsView("?sort=card&dir=up&f.owners=XX&f.locations=krabi&by=none&limit=g1")).toEqual(
		DEFAULT_LIMITS_VIEW,
	)
})
