import { tick } from "svelte"
import { expect, test } from "vitest"

import { OpenRows } from "#lib/ui/open-row.svelte"

/** One row open per component, pruned when gone, focus handed on (UI-09). */

test("one row opens at a time, and a second tap closes it", () => {
	const rows = new OpenRows("tx", () => null)
	rows.toggle("a")
	expect(rows.isOpen("a")).toBe(true)
	rows.toggle("b")
	expect(rows.isOpen("a")).toBe(false)
	expect(rows.isOpen("b")).toBe(true)
	rows.toggle("b")
	expect(rows.isOpen("b")).toBe(false)
})

test("prune forgets an open row that is no longer listed, and tells the owner", () => {
	let changes = 0
	const rows = new OpenRows(
		"tx",
		() => null,
		() => changes++,
	)
	rows.toggle("a")
	rows.prune(["a", "b"])
	expect(rows.isOpen("a")).toBe(true)
	rows.prune(["b"])
	expect(rows.isOpen("a")).toBe(false)
	expect(changes).toBe(2)
})

test("details ids carry the prefix and stay one id when a row id holds whitespace", () => {
	const rows = new OpenRows("tx", () => null)
	expect(rows.detailsId("plan:1:p1")).toBe("tx-plan:1:p1")
	expect(rows.detailsId("list:a b\tc")).toBe("tx-list:a_b_c")
})

const head = (detailsId: string) =>
	`<div class="a-wrap"><div class="a-row"><button type="button" class="a-hit" id="${detailsId}-head"></button></div></div>`

test("a pruned row that held focus hands it to the row that took its place, else a heading", async () => {
	const root = document.createElement("div")
	document.body.append(root)
	const rows = new OpenRows("tx", () => root)
	root.innerHTML = `<h2 tabindex="-1" data-refocus="upcoming">Upcoming</h2><div class="panel">${head("tx-a")}${head("tx-b")}</div>`
	rows.toggle("a")
	root.querySelector<HTMLElement>("#tx-a-head")?.focus()
	rows.prune(["b"])
	root.querySelector(".a-wrap")?.remove()
	await tick()
	expect(document.activeElement?.id).toBe("tx-b-head")
	// The last row goes: focus lands on the section's heading.
	rows.toggle("b")
	root.querySelector<HTMLElement>("#tx-b-head")?.focus()
	rows.prune([])
	root.querySelector(".panel")?.remove()
	await tick()
	expect(document.activeElement?.getAttribute("data-refocus")).toBe("upcoming")
	root.remove()
})
