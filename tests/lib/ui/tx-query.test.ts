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
			sort: "big",
			owedSort: "left",
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
			"?sort=zzz&view=nope&owed=x&range=forever&type=bogus&status=x&from=notadate&lrange=forever&lfrom=nope",
		)
		expect(view).toEqual(DEFAULT_TX_VIEW)
	})

	test("the Lists view keeps its own search and filters, apart from the ledger's", () => {
		const view = readTxView("?view=lists&lq=fuel&status=sent&lcard=A&lrange=week")
		expect(view.filter).toEqual(DEFAULT_TX_VIEW.filter)
		expect(view.lists).toEqual({ q: "fuel", status: ["sent"], cards: ["A"], range: "week", from: "", to: "" })
		expect(writeTxView(view)).toBe("?view=lists&lq=fuel&status=sent&lcard=A&lrange=week")
	})

	test("a lone preset range is kept", () => {
		const view = readTxView("?range=month&type=payment")
		expect(view.filter.range).toBe("month")
		expect(view.filter.types).toEqual(["payment"])
		expect(writeTxView(view)).toBe("?type=payment&range=month")
	})
})
