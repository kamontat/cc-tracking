import { describe, expect, test } from "vitest"

import { DEFAULT_READY_VIEW } from "#lib/domain/home"
import { DEFAULT_OWED_VIEW } from "#lib/domain/owed"
import {
	NEEDS_ADDRESS,
	OWED_ADDRESS,
	READY_ADDRESS,
	readOwedView,
	readReadyView,
	writeOwedView,
	writeReadyView,
} from "#lib/ui/home-query"

test("Home's three tabs are top-level paths: /, /owed and /ready", () => {
	expect([NEEDS_ADDRESS, OWED_ADDRESS, READY_ADDRESS]).toEqual(["/", "/owed", "/ready"])
})

const places = ["krabi", "bangkok"]

describe("the Owed tab's address (/owed)", () => {
	test("the defaults write nothing: not grouped, most urgent first", () => {
		expect(writeOwedView(DEFAULT_OWED_VIEW)).toBe("")
		expect(readOwedView("", places)).toEqual(DEFAULT_OWED_VIEW)
	})
	test("sort and dir, each sort with its own default direction", () => {
		expect(readOwedView("?sort=left", places)).toMatchObject({ sort: "left", dir: "desc" })
		expect(writeOwedView({ ...DEFAULT_OWED_VIEW, sort: "left", dir: "desc" })).toBe("?sort=left")
		expect(readOwedView("?sort=left&dir=asc", places)).toMatchObject({ sort: "left", dir: "asc" })
		expect(writeOwedView({ ...DEFAULT_OWED_VIEW, sort: "due", dir: "desc" })).toBe("?sort=due&dir=desc")
		expect(readOwedView("?sort=nope&dir=up&by=day&f.states=late", places)).toEqual(DEFAULT_OWED_VIEW)
	})
	test("search, places, holders and bill states, the repeating keys repeated; a group by", () => {
		const view = {
			...DEFAULT_OWED_VIEW,
			q: "plat",
			locations: ["krabi", "bangkok"],
			owners: ["KC" as const, "RI" as const],
			states: ["overdue" as const, "unbilled" as const],
			by: "place" as const,
		}
		const written = writeOwedView(view)
		expect(written).toBe(
			"?q=plat&f.locations=krabi&f.locations=bangkok&f.owners=KC&f.owners=RI&f.states=overdue&f.states=unbilled&by=place",
		)
		expect(readOwedView(written, places)).toEqual(view)
		expect(readOwedView("?f.locations=mars&f.owners=XX&f.states=soon&by=none", places)).toEqual({
			...DEFAULT_OWED_VIEW,
			states: ["soon"],
		})
	})
	test("the open card is not the list's to read", () => {
		expect(readOwedView("?card=12.3", places)).toEqual(DEFAULT_OWED_VIEW)
	})
})

describe("the Ready to use tab's address (/ready)", () => {
	test("the defaults write nothing: by place, most room first", () => {
		expect(writeReadyView(DEFAULT_READY_VIEW)).toBe("")
		expect(readReadyView("", places)).toEqual(DEFAULT_READY_VIEW)
	})
	test("sort room, close or due, every one desc by default", () => {
		expect(readReadyView("?sort=close", places)).toMatchObject({ sort: "close", dir: "desc" })
		expect(writeReadyView({ ...DEFAULT_READY_VIEW, sort: "close", dir: "desc" })).toBe("?sort=close")
		expect(writeReadyView({ ...DEFAULT_READY_VIEW, sort: "room", dir: "asc" })).toBe("?dir=asc")
		expect(readReadyView("?sort=due&dir=asc", places)).toMatchObject({ sort: "due", dir: "asc" })
		expect(writeReadyView({ ...DEFAULT_READY_VIEW, sort: "due", dir: "asc" })).toBe("?sort=due&dir=asc")
		expect(readReadyView("?sort=name&dir=sideways&card=7", places)).toEqual(DEFAULT_READY_VIEW)
	})
	test("search, places and holders repeated, and a group by; no bill states here", () => {
		const view = {
			...DEFAULT_READY_VIEW,
			q: "9876",
			locations: ["bangkok"],
			owners: ["NT" as const],
			by: "none" as const,
		}
		const written = writeReadyView(view)
		expect(written).toBe("?q=9876&f.locations=bangkok&f.owners=NT&by=none")
		expect(readReadyView(`${written}&f.states=overdue`, places)).toEqual(view)
		expect(writeReadyView({ ...DEFAULT_READY_VIEW, by: "holder" })).toBe("?by=holder")
	})
})
