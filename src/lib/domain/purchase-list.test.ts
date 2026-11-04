import { describe, expect, test } from "bun:test";
import { allAnswered, listTotal, saveReply } from "#lib/domain/purchase-list";
import type { PurchaseList } from "#lib/domain/types";

const now = "2026-10-30T12:00:00.000Z";
const list = (over: Partial<PurchaseList> = {}): PurchaseList => ({
	id: "l1",
	date: "2026-10-30",
	status: "sent",
	lines: [
		{ cardId: "a", amount: 22_000, made: true, actual: 21_640 },
		{ cardId: "b", amount: 5_000, made: false },
	],
	...over,
});
const opts = { now, newId: () => "new", moveUnmade: true };

describe("purchase list", () => {
	test("total of a sent list is its planned amounts", () => {
		expect(listTotal(list())).toBe(27_000);
	});

	test("total of a saved list counts only made lines at their real amount", () => {
		expect(listTotal(list({ status: "saved" }))).toBe(21_640);
	});

	test("refuses to save until every line is answered", () => {
		const l = list({ lines: [{ cardId: "a", amount: 1 }] });
		expect(allAnswered(l)).toBe(false);
		expect(saveReply(l, opts)).toEqual({ ok: false, reason: "unanswered" });
	});

	test("made lines become purchases on the list date", () => {
		const r = saveReply(list(), opts);
		if (!r.ok) throw new Error("expected ok");
		expect(r.purchases).toEqual([
			{
				id: "new",
				cardId: "a",
				date: "2026-10-30",
				amount: 21_640,
				note: "",
				addedAt: now,
			},
		]);
		expect(r.saved.status).toBe("saved");
		expect(r.saved.savedAt).toBe(now);
	});

	test("not-made lines move to a draft for the next day", () => {
		const r = saveReply(list(), opts);
		if (!r.ok) throw new Error("expected ok");
		expect(r.draft?.status).toBe("draft");
		expect(r.draft?.date).toBe("2026-10-31");
		expect(r.draft?.lines).toEqual([{ cardId: "b", amount: 5_000 }]);
		expect(r.saved.movedTo).toBe(r.draft?.id);
	});

	test("no draft when moveUnmade is off", () => {
		const r = saveReply(list(), { ...opts, moveUnmade: false });
		if (!r.ok) throw new Error("expected ok");
		expect(r.draft).toBeNull();
		expect(r.saved.movedTo).toBeUndefined();
	});

	test("no draft when every line was made", () => {
		const l = list({ lines: [{ cardId: "a", amount: 100, made: true }] });
		const r = saveReply(l, opts);
		if (!r.ok) throw new Error("expected ok");
		expect(r.draft).toBeNull();
		expect(r.purchases[0]?.amount).toBe(100);
	});

	test("a line's note becomes its purchase's note, and a moved line keeps it", () => {
		const l = list({
			lines: [
				{ cardId: "a", amount: 100, made: true, note: "fuel" },
				{ cardId: "b", amount: 200, made: true },
				{ cardId: "c", amount: 300, made: false, note: "next time" },
			],
		});
		const r = saveReply(l, opts);
		if (!r.ok) throw new Error("expected ok");
		expect(r.purchases.map((p) => p.note)).toEqual(["fuel", ""]);
		expect(r.draft?.lines).toEqual([
			{ cardId: "c", amount: 300, note: "next time" },
		]);
	});
});
