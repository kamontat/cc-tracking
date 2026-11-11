import { describe, expect, test } from "vitest"

import { DEFAULT_TX_VIEW, readTxView, type TxView, writeTxView } from "#lib/ui/tx-query"

describe("tx-query", () => {
	test("defaults write as an empty string and read back", () => {
		expect(writeTxView(DEFAULT_TX_VIEW)).toBe("")
		expect(readTxView("")).toEqual(DEFAULT_TX_VIEW)
	})

	test("round trips every field, with a card id full of punctuation", () => {
		const view: TxView = {
			view: "lists",
			filter: {
				q: "ตั๋ว & lunch",
				types: ["purchase", "payment"],
				cards: ["a&b:c d", "kbank"],
				range: "custom",
				from: "2026-10-01",
				to: "2026-10-31",
			},
			sort: "amount",
			dir: "asc",
			by: "card",
			owedSort: "left",
			owedDir: "asc",
			listsBy: "month",
			lists: {
				q: "fuel & stamps",
				status: ["draft", "saved"],
				cards: ["x/y", "kbank"],
				range: "custom",
				from: "2026-11-01",
				to: "2026-11-09",
			},
		}
		const search = writeTxView(view)
		expect(search.startsWith("?")).toBe(true)
		expect(readTxView(search)).toEqual(view)
	})

	test("unknown values fall back to defaults", () => {
		const view = readTxView(
			"?sort=zzz&dir=up&odir=x&view=nope&owed=x&range=forever&type=bogus&status=x&from=notadate&lrange=forever&lfrom=nope",
		)
		expect(view).toEqual(DEFAULT_TX_VIEW)
	})

	test("the Lists view keeps its own search and filters, apart from the ledger's", () => {
		const view = readTxView("?view=lists&lq=fuel&status=sent&lcard=A&lrange=week")
		expect(view.filter).toEqual(DEFAULT_TX_VIEW.filter)
		expect(view.lists).toEqual({ q: "fuel", status: ["sent"], cards: ["A"], range: "week", from: "", to: "" })
		expect(writeTxView(view)).toBe("?view=lists&lq=fuel&status=sent&lcard=A&lrange=week")
	})

	test("the ledger sorts by date or amount, each with its own default direction", () => {
		expect(DEFAULT_TX_VIEW).toMatchObject({ sort: "date", dir: "desc", owedSort: "urgency", owedDir: "asc" })
		expect(readTxView("?sort=amount")).toMatchObject({ sort: "amount", dir: "desc" })
		expect(readTxView("?dir=asc")).toMatchObject({ sort: "date", dir: "asc" })
		expect(writeTxView({ ...DEFAULT_TX_VIEW, dir: "asc" })).toBe("?dir=asc")
		expect(writeTxView({ ...DEFAULT_TX_VIEW, sort: "amount", dir: "desc" })).toBe("?sort=amount")
	})

	test("the retired ledger sorts read as the default", () => {
		for (const old of ["new", "old", "big", "small"]) {
			expect(readTxView(`?sort=${old}`)).toMatchObject({ sort: "date", dir: "desc" })
		}
	})

	test("Owed keeps its own direction, odir, read against its sort", () => {
		expect(readTxView("?owed=left")).toMatchObject({ owedSort: "left", owedDir: "desc" })
		expect(readTxView("?owed=left&odir=asc")).toMatchObject({ owedSort: "left", owedDir: "asc" })
		expect(writeTxView({ ...DEFAULT_TX_VIEW, owedDir: "desc" })).toBe("?odir=desc")
	})

	test("the ledger groups by day by default and the Lists view by status, each with its own key", () => {
		expect(DEFAULT_TX_VIEW).toMatchObject({ by: "day", listsBy: "status" })
		expect(readTxView("?by=card&lby=month")).toMatchObject({ by: "card", listsBy: "month" })
		expect(readTxView("?by=month&lby=card")).toMatchObject({ by: "day", listsBy: "status" })
		expect(writeTxView({ ...DEFAULT_TX_VIEW, by: "none", listsBy: "none" })).toBe("?by=none&lby=none")
	})

	test("a lone preset range is kept", () => {
		const view = readTxView("?range=month&type=payment")
		expect(view.filter.range).toBe("month")
		expect(view.filter.types).toEqual(["payment"])
		expect(writeTxView(view)).toBe("?type=payment&range=month")
	})
})
