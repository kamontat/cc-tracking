import { afterEach, describe, expect, test } from "vitest"

import { isRecordId, RecordPanel, readRecord, withRecord } from "#lib/ui/record-panel.svelte"
import { fakeHistory } from "./fake-history"

let stops: (() => void)[] = []

afterEach(() => {
	for (const stop of stops) stop()
	stops = []
})

const setup = (start = "/cards", answer = true) => {
	const history = fakeHistory(start)
	let asked = 0
	const panel = new RecordPanel({
		address: history.bar,
		path: "/cards",
		kinds: ["card"],
		ask: () => {
			asked++
			return answer
		},
	})
	stops.push(panel.start())
	return { history, panel, asked: () => asked }
}

const card = (id: string) => ({ kind: "card" as const, id })

describe("readRecord", () => {
	test("reads the record key the page takes, card winning over the others", () => {
		expect(readRecord("?card=12.3")).toEqual({ kind: "card", id: "12.3" })
		expect(readRecord("?limit=g1&card=5")).toEqual({ kind: "card", id: "5" })
		expect(readRecord("?limit=g1&list=l1")).toEqual({ kind: "limit", id: "g1" })
		expect(readRecord("?list=l1")).toEqual({ kind: "list", id: "l1" })
		expect(readRecord("?q=a")).toBeNull()
	})

	test("reads a settings panel by name, as a page with no record key of its own", () => {
		expect(readRecord("?panel=locations", ["panel"])).toEqual({ kind: "panel", id: "locations" })
		expect(readRecord("?panel=", ["panel"])).toBeNull()
		expect(readRecord("?panel=owners", ["card"])).toBeNull()
		expect(withRecord("/settings?panel=locations", null)).toBe("/settings")
		expect(withRecord("/settings", { kind: "panel", id: "owners" })).toBe("/settings?panel=owners")
	})

	test("ignores a key the page does not take", () => {
		expect(readRecord("?limit=g1", ["card"])).toBeNull()
		expect(readRecord("?limit=g1&card=5", ["limit"])).toEqual({ kind: "limit", id: "g1" })
	})

	test("an empty or invalid card id opens nothing", () => {
		expect(readRecord("?card=")).toBeNull()
		for (const id of ["5.", ".5", "1..2", "K1", "k b", "ab1"]) expect(readRecord(`?card=${id}`)).toBeNull()
		for (const id of ["5", "12.3", "k1.2"]) expect(readRecord(`?card=${id}`)).toEqual({ kind: "card", id })
	})

	test("isRecordId holds a card id to its format and any other id to being there", () => {
		expect(isRecordId("card", "k1.2")).toBe(true)
		expect(isRecordId("card", "K1")).toBe(false)
		expect(isRecordId("limit", "any-uuid")).toBe(true)
		expect(isRecordId("list", "")).toBe(false)
	})
})

describe("withRecord", () => {
	test("sets the record key after the page's own keys, dropping any other record key", () => {
		expect(withRecord("/cards?q=a&sort=room", card("12.3"))).toBe("/cards?q=a&sort=room&card=12.3")
		expect(withRecord("/cards?card=5&q=a&limit=g1", card("7"))).toBe("/cards?q=a&card=7")
		expect(withRecord("/cards?card=5&q=a", null)).toBe("/cards?q=a")
		expect(withRecord("/cards?card=5", null)).toBe("/cards")
		expect(withRecord("/cards", { kind: "limit", id: "g1" })).toBe("/cards?limit=g1")
	})
})

describe("RecordPanel", () => {
	test("a pasted address opens its record at once; nothing else opens nothing", () => {
		expect(setup("/cards?q=a&card=12.3").panel.view).toEqual({ kind: "card", id: "12.3", form: null })
		expect(setup("/cards?q=a").panel.view).toBeNull()
		expect(setup("/cards?card=K1").panel.view).toBeNull()
	})

	test("opening from nothing pushes, so Back closes it", () => {
		const { history, panel } = setup("/cards?q=a")
		panel.show(card("5"))
		expect(history.calls).toEqual(["push /cards?q=a&card=5"])
		expect(panel.view).toEqual({ kind: "card", id: "5", form: null })
		history.userBack()
		expect(panel.view).toBeNull()
		expect(history.now()).toBe("/cards?q=a")
	})

	test("swapping to another record rewrites the entry, so Back does not walk through each", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.show(card("7"))
		expect(history.calls).toEqual(["push /cards?card=5", "replace /cards?card=7"])
		expect(panel.view?.id).toBe("7")
		history.userBack()
		expect(panel.view).toBeNull()
	})

	test("showing the record already open changes nothing", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.show(card("5"))
		expect(history.calls).toEqual(["push /cards?card=5"])
	})

	test("a form pushes an entry with the address unchanged; Back and ‹ return to the record", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.openForm({ name: "edit" })
		expect(history.calls).toEqual(["push /cards?card=5", "push /cards?card=5"])
		expect(panel.view).toEqual({ kind: "card", id: "5", form: { name: "edit" } })
		history.userBack()
		expect(panel.view).toEqual({ kind: "card", id: "5", form: null })
		history.userForward()
		expect(panel.view?.form).toEqual({ name: "edit" })
		panel.back()
		expect(history.calls.at(-1)).toBe("go -1")
		expect(panel.view).toEqual({ kind: "card", id: "5", form: null })
		history.userBack()
		expect(panel.view).toBeNull()
	})

	test("a reload on a form's entry shows the record", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.openForm({ name: "pay" })
		const again = new RecordPanel({ address: history.bar, path: "/cards", kinds: ["card"] })
		stops.push(again.start())
		expect(again.view).toEqual({ kind: "card", id: "5", form: null })
	})

	test("a record opened straight on a form swaps back to the record in place", () => {
		const { history, panel } = setup()
		panel.show(card("5"), { name: "pay", arg: "1200" })
		expect(panel.view).toEqual({ kind: "card", id: "5", form: { name: "pay", arg: "1200" } })
		panel.back()
		expect(history.calls).toEqual(["push /cards?card=5", "replace /cards?card=5"])
		expect(panel.view).toEqual({ kind: "card", id: "5", form: null })
		history.userBack()
		expect(panel.view).toBeNull()
	})

	test("‹ on a form over a pasted address steps back to the record's entry", () => {
		const { history, panel } = setup("/cards?card=5")
		panel.openForm({ name: "edit" })
		panel.back()
		expect(history.calls).toEqual(["push /cards?card=5", "go -1"])
		expect(panel.view).toEqual({ kind: "card", id: "5", form: null })
	})

	test("× steps back over every entry the panel pushed", () => {
		const { history, panel } = setup("/cards?q=a")
		panel.show(card("5"))
		panel.openForm({ name: "edit" })
		panel.close()
		expect(history.calls.at(-1)).toBe("go -2")
		expect(history.now()).toBe("/cards?q=a")
		expect(panel.view).toBeNull()
	})

	test("× on a pasted address rewrites it without the record", () => {
		const { history, panel } = setup("/cards?q=a&card=5")
		panel.close()
		expect(history.calls).toEqual(["replace /cards?q=a"])
		expect(panel.view).toBeNull()
	})

	test("× on a form over a pasted address steps back, then rewrites", () => {
		const { history, panel } = setup("/cards?card=5")
		panel.openForm({ name: "edit" })
		panel.close()
		expect(history.calls).toEqual(["push /cards?card=5", "go -1", "replace /cards"])
		expect(history.now()).toBe("/cards")
		expect(panel.view).toBeNull()
	})

	test("going deeper pushes another record, so Back returns to the one before", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.deeper(card("7"))
		expect(history.calls.at(-1)).toBe("push /cards?card=7")
		history.userBack()
		expect(panel.view?.id).toBe("5")
	})

	test("a blank form opens with the address unchanged; adding the record writes its address", () => {
		const { history, panel } = setup("/cards?q=a")
		panel.blank("card")
		expect(history.calls).toEqual(["push /cards?q=a"])
		expect(panel.view).toEqual({ kind: "card", id: null, form: { name: "new" } })
		panel.created(card("51.4"))
		expect(history.calls.at(-1)).toBe("replace /cards?q=a&card=51.4")
		expect(panel.view).toEqual({ kind: "card", id: "51.4", form: null })
		history.userBack()
		expect(panel.view).toBeNull()
		expect(history.now()).toBe("/cards?q=a")
	})

	test("a blank form over an open record takes that record's entry, without its key", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		panel.blank("card")
		expect(history.calls).toEqual(["push /cards?card=5", "replace /cards"])
		expect(panel.view?.form).toEqual({ name: "new" })
		history.userBack()
		expect(panel.view).toBeNull()
	})

	test("× on a blank form steps back over it", () => {
		const { history, panel } = setup()
		panel.blank("card")
		panel.close()
		expect(history.calls).toEqual(["push /cards", "go -1"])
		expect(panel.view).toBeNull()
	})

	test("drop forgets an unknown record and takes its key out of the address", () => {
		const { history, panel } = setup("/cards?q=a&card=99")
		panel.drop()
		expect(history.calls).toEqual(["replace /cards?q=a"])
		expect(panel.view).toBeNull()
		panel.show(card("5"))
		expect(history.calls.at(-1)).toBe("push /cards?q=a&card=5")
	})

	test("keep carries the open record into an address the page writes", () => {
		const { panel } = setup()
		expect(panel.keep("/cards?sort=room")).toBe("/cards?sort=room")
		panel.show(card("5"))
		expect(panel.keep("/cards?sort=room")).toBe("/cards?sort=room&card=5")
		panel.blank("card")
		expect(panel.keep("/cards?sort=room")).toBe("/cards?sort=room")
	})

	describe("unsaved changes", () => {
		test("a changed form asks before another record, ×, Escape or the backdrop drop it", () => {
			const { history, panel, asked } = setup()
			panel.show(card("5"))
			panel.openForm({ name: "edit" })
			panel.touch()
			expect(panel.dirty).toBe(true)
			panel.show(card("7"))
			expect(asked()).toBe(1)
			expect(panel.view?.id).toBe("7")
			expect(panel.dirty).toBe(false)
			panel.openForm({ name: "edit" })
			panel.touch()
			panel.close()
			expect(asked()).toBe(2)
			expect(panel.view).toBeNull()
			expect(history.size()).toBeGreaterThan(1)
		})

		test("answering no keeps the form and what was typed", () => {
			const { history, panel, asked } = setup("/cards", false)
			panel.show(card("5"))
			panel.openForm({ name: "edit" })
			panel.touch()
			const before = [...history.calls]
			panel.show(card("7"))
			panel.close()
			panel.blank("card")
			expect(asked()).toBe(3)
			expect(history.calls).toEqual(before)
			expect(panel.view).toEqual({ kind: "card", id: "5", form: { name: "edit" } })
			expect(panel.dirty).toBe(true)
		})

		test("Back leaves a changed form without asking", () => {
			const { history, panel, asked } = setup()
			panel.show(card("5"))
			panel.openForm({ name: "edit" })
			panel.touch()
			history.userBack()
			expect(asked()).toBe(0)
			expect(panel.view?.form).toBeNull()
			expect(panel.dirty).toBe(false)
		})

		test("an unchanged form, or a record's summary, never asks", () => {
			const { panel, asked } = setup()
			panel.show(card("5"))
			panel.touch()
			expect(panel.dirty).toBe(false)
			panel.openForm({ name: "edit" })
			panel.show(card("7"))
			panel.close()
			expect(asked()).toBe(0)
		})

		test("a write's own close does not ask", () => {
			const { panel, asked } = setup()
			panel.show(card("5"))
			panel.openForm({ name: "edit" })
			panel.touch()
			panel.close({ ask: false })
			expect(asked()).toBe(0)
			expect(panel.view).toBeNull()
		})

		test("a write's own step back does not ask, and leaves the form clean", () => {
			const { panel, asked } = setup()
			panel.show(card("5"))
			panel.openForm({ name: "edit" })
			panel.touch()
			panel.back()
			expect(asked()).toBe(0)
			expect(panel.dirty).toBe(false)
		})
	})

	test("an address the panel did not make (Back to an older page state) is read as it is", () => {
		const { history, panel } = setup()
		panel.show(card("5"))
		// The page swapped this entry's address under the panel.
		history.bar.replace("/cards?card=9")
		history.userBack()
		history.userForward()
		expect(panel.view).toEqual({ kind: "card", id: "9", form: null })
	})

	test("start's remover stops listening", () => {
		const history = fakeHistory()
		const panel = new RecordPanel({ address: history.bar, path: "/cards", kinds: ["card"] })
		const stop = panel.start()
		panel.show(card("5"))
		stop()
		history.userBack()
		expect(panel.view?.id).toBe("5")
	})
})
