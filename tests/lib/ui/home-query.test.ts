import { describe, expect, test } from "vitest"

import {
	DEFAULT_OWED_VIEW,
	DEFAULT_READY_VIEW,
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

describe("the Owed tab's address (/owed)", () => {
	test("sort and dir, each sort with its own default direction", () => {
		expect(DEFAULT_OWED_VIEW).toEqual({ sort: "urgency", dir: "asc" })
		expect(writeOwedView(DEFAULT_OWED_VIEW)).toBe("")
		expect(readOwedView("?sort=left")).toEqual({ sort: "left", dir: "desc" })
		expect(writeOwedView({ sort: "left", dir: "desc" })).toBe("?sort=left")
		expect(readOwedView("?sort=left&dir=asc")).toEqual({ sort: "left", dir: "asc" })
		expect(writeOwedView({ sort: "due", dir: "desc" })).toBe("?sort=due&dir=desc")
		expect(readOwedView("?sort=nope&dir=up")).toEqual(DEFAULT_OWED_VIEW)
	})
	test("the open card is not the list's to read", () => {
		expect(readOwedView("?card=12.3")).toEqual(DEFAULT_OWED_VIEW)
	})
})

describe("the Ready to use tab's address (/ready)", () => {
	test("sort room, close or due, every one desc by default", () => {
		expect(DEFAULT_READY_VIEW).toEqual({ sort: "room", dir: "desc" })
		expect(writeReadyView(DEFAULT_READY_VIEW)).toBe("")
		expect(readReadyView("?sort=close")).toEqual({ sort: "close", dir: "desc" })
		expect(writeReadyView({ sort: "close", dir: "desc" })).toBe("?sort=close")
		expect(writeReadyView({ sort: "room", dir: "asc" })).toBe("?dir=asc")
		expect(readReadyView("?sort=due&dir=asc")).toEqual({ sort: "due", dir: "asc" })
		expect(writeReadyView({ sort: "due", dir: "asc" })).toBe("?sort=due&dir=asc")
		expect(readReadyView("?sort=name&dir=sideways&card=7")).toEqual(DEFAULT_READY_VIEW)
	})
})
