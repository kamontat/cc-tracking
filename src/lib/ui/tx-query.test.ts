import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TX_VIEW,
	readTxView,
	type TxView,
	writeTxView,
} from "#lib/ui/tx-query";

describe("tx-query", () => {
	test("defaults write as an empty string and read back", () => {
		expect(writeTxView(DEFAULT_TX_VIEW)).toBe("");
		expect(readTxView("")).toEqual(DEFAULT_TX_VIEW);
	});

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
			status: ["draft", "saved"],
		};
		const search = writeTxView(view);
		expect(search.startsWith("?")).toBe(true);
		expect(readTxView(search)).toEqual(view);
	});

	test("unknown values fall back to defaults", () => {
		const view = readTxView(
			"?sort=zzz&view=nope&owed=x&range=forever&type=bogus&status=x&from=notadate",
		);
		expect(view).toEqual(DEFAULT_TX_VIEW);
	});

	test("a lone preset range is kept", () => {
		const view = readTxView("?range=month&type=payment");
		expect(view.filter.range).toBe("month");
		expect(view.filter.types).toEqual(["payment"]);
		expect(writeTxView(view)).toBe("?type=payment&range=month");
	});
});
