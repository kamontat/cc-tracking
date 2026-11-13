import { describe, expect, test } from "vitest"

import {
	DEFAULT_LEDGER_VIEW,
	DEFAULT_LISTS_VIEW,
	DEFAULT_OWED_VIEW,
	LEDGER_ADDRESS,
	type LedgerView,
	LISTS_ADDRESS,
	type ListsView,
	readLedgerView,
	readListsView,
	readOwedView,
	writeLedgerView,
	writeListsView,
	writeOwedView,
} from "#lib/ui/tx-query"

describe("the Ledger tab's address (/transactions)", () => {
	test("is /transactions, and its defaults write as an empty string and read back", () => {
		expect(LEDGER_ADDRESS).toBe("/transactions")
		expect(writeLedgerView(DEFAULT_LEDGER_VIEW)).toBe("")
		expect(readLedgerView("")).toEqual(DEFAULT_LEDGER_VIEW)
	})

	test("round trips every field, filters under f., the repeating ones repeated", () => {
		const view: LedgerView = {
			filter: {
				q: "ตั๋ว & lunch",
				types: ["purchase", "payment"],
				cards: ["12.3", "k1.2"],
				range: "custom",
				from: "2026-10-01",
				to: "2026-10-31",
			},
			sort: "amount",
			dir: "asc",
			by: "card",
		}
		const search = writeLedgerView(view)
		expect(search).toBe(
			"?q=%E0%B8%95%E0%B8%B1%E0%B9%8B%E0%B8%A7+%26+lunch&f.types=purchase&f.types=payment&f.cards=12.3&f.cards=k1.2&f.range=custom&f.from=2026-10-01&f.to=2026-10-31&sort=amount&dir=asc&by=card",
		)
		expect(readLedgerView(search)).toEqual(view)
	})

	test("unknown values fall back to defaults, and the retired keys are ignored", () => {
		expect(readLedgerView("?sort=zzz&dir=up&f.range=forever&f.types=bogus&f.from=notadate&by=month")).toEqual(
			DEFAULT_LEDGER_VIEW,
		)
		expect(readLedgerView("?view=lists&type=payment&card=A&range=week&from=2026-10-01&to=2026-10-02")).toEqual(
			DEFAULT_LEDGER_VIEW,
		)
	})

	test("the open card's key is not a filter", () => {
		expect(readLedgerView("?card=12.3").filter.cards).toEqual([])
	})

	test("sorts by date or amount, each with its own default direction", () => {
		expect(DEFAULT_LEDGER_VIEW).toMatchObject({ sort: "date", dir: "desc", by: "day" })
		expect(readLedgerView("?sort=amount")).toMatchObject({ sort: "amount", dir: "desc" })
		expect(readLedgerView("?dir=asc")).toMatchObject({ sort: "date", dir: "asc" })
		expect(writeLedgerView({ ...DEFAULT_LEDGER_VIEW, dir: "asc" })).toBe("?dir=asc")
		expect(writeLedgerView({ ...DEFAULT_LEDGER_VIEW, sort: "amount", dir: "desc" })).toBe("?sort=amount")
		for (const old of ["new", "old", "big", "small"]) {
			expect(readLedgerView(`?sort=${old}`)).toMatchObject({ sort: "date", dir: "desc" })
		}
	})

	test("a card picked twice is kept once", () => {
		expect(readLedgerView("?f.cards=A&f.cards=A&f.cards=").filter.cards).toEqual(["A"])
	})
})

describe("the Lists tab's address (/transactions/lists)", () => {
	test("is /transactions/lists, and its defaults write as an empty string and read back", () => {
		expect(LISTS_ADDRESS).toBe("/transactions/lists")
		expect(writeListsView(DEFAULT_LISTS_VIEW)).toBe("")
		expect(readListsView("")).toEqual(DEFAULT_LISTS_VIEW)
	})

	test("round trips every field: q, f.statuses, f.cards, f.range, f.from, f.to and by", () => {
		const view: ListsView = {
			filter: {
				q: "fuel & stamps",
				status: ["draft", "saved"],
				cards: ["12.3", "7"],
				range: "custom",
				from: "2026-11-01",
				to: "2026-11-09",
			},
			by: "month",
		}
		const search = writeListsView(view)
		expect(search).toBe(
			"?q=fuel+%26+stamps&f.statuses=draft&f.statuses=saved&f.cards=12.3&f.cards=7&f.range=custom&f.from=2026-11-01&f.to=2026-11-09&by=month",
		)
		expect(readListsView(search)).toEqual(view)
	})

	test("unknown values fall back to defaults, and the retired keys are ignored", () => {
		expect(readListsView("?f.statuses=x&f.range=forever&f.from=nope&by=card")).toEqual(DEFAULT_LISTS_VIEW)
		expect(readListsView("?lq=fuel&status=sent&lcard=A&lrange=week&lfrom=2026-11-01&lby=month")).toEqual(
			DEFAULT_LISTS_VIEW,
		)
	})

	test("groups by status by default; the open list's key is not a filter", () => {
		expect(DEFAULT_LISTS_VIEW.by).toBe("status")
		expect(writeListsView({ ...DEFAULT_LISTS_VIEW, by: "none" })).toBe("?by=none")
		expect(readListsView("?list=abc&card=7")).toEqual(DEFAULT_LISTS_VIEW)
	})
})

describe("Owed's order, kept for /owed (Part 5)", () => {
	test("sort and dir, each sort with its own default direction", () => {
		expect(DEFAULT_OWED_VIEW).toEqual({ sort: "urgency", dir: "asc" })
		expect(writeOwedView(DEFAULT_OWED_VIEW)).toBe("")
		expect(readOwedView("?sort=left")).toEqual({ sort: "left", dir: "desc" })
		expect(readOwedView("?sort=left&dir=asc")).toEqual({ sort: "left", dir: "asc" })
		expect(writeOwedView({ sort: "due", dir: "desc" })).toBe("?sort=due&dir=desc")
		expect(readOwedView("?sort=nope&dir=up")).toEqual(DEFAULT_OWED_VIEW)
	})
})
