import { describe, expect, test } from "vitest"

import { DEFAULT_READY_VIEW } from "#lib/domain/home"
import { DEFAULT_OWED_PLAN } from "#lib/domain/owed-plan"
import {
	NEEDS_ADDRESS,
	OWED_ADDRESS,
	READY_ADDRESS,
	readOwedPlan,
	readReadyView,
	writeOwedPlan,
	writeReadyView,
} from "#lib/ui/home-query"

test("Home's three tabs are top-level paths: /, /owed and /ready", () => {
	expect([NEEDS_ADDRESS, OWED_ADDRESS, READY_ADDRESS]).toEqual(["/", "/owed", "/ready"])
})

const places = ["krabi", "bangkok"]

describe("the Owed tab's address (/owed)", () => {
	const read = (search: string) => readOwedPlan(search, places)

	test("the defaults write nothing: the calendar, the next 30 days, every kind, today's month", () => {
		expect(read("")).toEqual({ view: DEFAULT_OWED_PLAN, month: null, day: null })
		expect(writeOwedPlan(DEFAULT_OWED_PLAN, null, null)).toBe("")
	})

	test("search, places, holders, range, kinds, layout, month and day, the f. keys repeated", () => {
		const search =
			"?q=kbank&f.locations=krabi&f.owners=KC&f.owners=NT&f.range=14&f.shows=bill&f.shows=plan&view=week&month=2026-12&day=2026-12-02"
		const plan = read(search)
		expect(plan).toEqual({
			view: {
				q: "kbank",
				locations: ["krabi"],
				owners: ["KC", "NT"],
				range: 14,
				shows: ["bill", "plan"],
				layout: "week",
			},
			month: "2026-12",
			day: "2026-12-02",
		})
		expect(writeOwedPlan(plan.view, plan.month, plan.day)).toBe(search)
		expect(writeOwedPlan({ ...DEFAULT_OWED_PLAN, range: "all" }, null, null)).toBe("?f.range=all")
	})

	test("a value it does not know reads as the default", () => {
		expect(read("?f.range=9&f.shows=cash&view=grid&month=2026-13&day=31-12-2026&f.locations=mars")).toEqual({
			view: DEFAULT_OWED_PLAN,
			month: null,
			day: null,
		})
	})

	test("the open card is not the plan's to read", () => {
		expect(read("?card=7")).toEqual({ view: DEFAULT_OWED_PLAN, month: null, day: null })
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
