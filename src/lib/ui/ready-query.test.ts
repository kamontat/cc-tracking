import { expect, test } from "vitest"

import { DEFAULT_READY_VIEW, namesCards, readReadyView, readyViewAddress } from "#lib/ui/ready-query"

test("an empty address is the default view, and the default writes no query", () => {
	expect(readReadyView("", [])).toEqual(DEFAULT_READY_VIEW)
	expect(readyViewAddress(DEFAULT_READY_VIEW)).toBe("/list/new")
})

test("the view round-trips through the address, places and holders repeated", () => {
	const view = {
		filter: { q: "scb k", locations: ["bangkok", "krabi"], owners: ["NT"] },
		sort: "due",
	} as const
	const url = readyViewAddress({
		filter: {
			...view.filter,
			locations: [...view.filter.locations],
			owners: [...view.filter.owners],
		},
		sort: view.sort,
	})
	expect(url).toBe("/list/new?q=scb+k&loc=bangkok&loc=krabi&owner=NT&sort=due")
	expect(readReadyView(url.slice("/list/new".length), ["bangkok", "krabi"])).toEqual({
		filter: { q: "scb k", locations: ["bangkok", "krabi"], owners: ["NT"] },
		sort: "due",
	})
})

test("unknown places, holders and sorts read as nothing", () => {
	expect(readReadyView("?loc=mars&owner=ZZ&sort=big", ["bangkok"])).toEqual(DEFAULT_READY_VIEW)
})

test("any stored location id is read; one with no record is not", () => {
	expect(readReadyView("?loc=chiang-mai&loc=mars&loc=krabi", ["krabi", "chiang-mai"]).filter.locations).toEqual([
		"chiang-mai",
		"krabi",
	])
})

test("only an address with a card is the entering step", () => {
	expect(namesCards("")).toBe(false)
	expect(namesCards("?q=a&sort=due")).toBe(false)
	expect(namesCards("?card=1")).toBe(true)
	expect(namesCards("?card=1&card=2")).toBe(true)
})
