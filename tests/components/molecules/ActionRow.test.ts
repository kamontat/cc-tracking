import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ActionRow from "#components/molecules/ActionRow.svelte"

/**
 * The one row that opens in place (DD-108, DD-165): the head is one button naming its hidden
 * details; the drawer holds a cycle line or parts, then one sentence and the buttons. Ported from
 * the legacy `actionRow` tests.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const raw = (html: string) => createRawSnippet(() => ({ render: () => html }))

const draw = (props: Record<string, unknown> = {}) => {
	let toggles = 0
	mounted = mount(ActionRow, {
		target: document.body,
		props: {
			kind: "planned",
			title: "Pay SCB K",
			subtitle: "5 Nov",
			id: "p1",
			detailsId: "rows-p1",
			expanded: false,
			ontoggle: () => {
				toggles++
			},
			amount: { text: "+1,000.00", tone: "in" },
			say: "Planned for 5 Nov.",
			actions: raw(`<button type="button" data-action="paid">Paid</button>`),
			...props,
		},
	})
	flushSync()
	const head = document.querySelector<HTMLElement>(".a-hit")
	const details = document.querySelector<HTMLElement>("#rows-p1")
	if (!head || !details) throw new Error("row not drawn")
	return { head, details, toggles: () => toggles }
}

test("a closed row's head is one button naming its hidden details", () => {
	const { head, details } = draw()
	expect(head.localName).toBe("button")
	expect(head.getAttribute("type")).toBe("button")
	expect(head.id).toBe("rows-p1-head")
	expect(head.getAttribute("aria-expanded")).toBe("false")
	expect(head.getAttribute("aria-controls")).toBe("rows-p1")
	expect(head.querySelector("a, button")).toBeNull()
	expect(head.querySelector(".amount")?.textContent).toBe("+1,000.00")
	expect(head.querySelector(".amount")?.classList.contains("in")).toBe(true)
	expect(head.querySelector(".a-title")?.textContent).toBe("Pay SCB K")
	expect(head.querySelector(".a-sub")?.textContent).toBe("5 Nov")
	expect(details.hidden).toBe(true)
	// A section named by its head is a region to a screen reader.
	expect(details.localName).toBe("section")
	expect(details.getAttribute("aria-labelledby")).toBe("rows-p1-head")
	expect(document.querySelector("[data-row]")?.getAttribute("data-row")).toBe("p1")
})

test("an opened row is a drawer: parts, then a foot of one sentence and the buttons", () => {
	const { head, details } = draw({ expanded: true, parts: [{ label: "1) Card A", amount: "฿500.00" }] })
	expect(head.getAttribute("aria-expanded")).toBe("true")
	expect(details.hidden).toBe(false)
	expect([...details.children].map((el) => el.className.split(" ")[0])).toEqual(["a-parts", "a-foot"])
	expect(details.querySelector(".a-part")?.textContent).toBe("1) Card A฿500.00")
	expect(details.querySelector(".a-part [data-numeric]")?.textContent).toBe("฿500.00")
	expect(details.querySelector(".a-say")?.textContent?.trim()).toBe("Planned for 5 Nov.")
	expect(details.querySelector(".a-btns [data-action='paid']")).not.toBeNull()
})

test("a cycle line sits above the foot", () => {
	const { details } = draw({
		expanded: true,
		cycle: {
			start: "2026-10-26",
			end: "2026-12-15",
			marks: [{ kind: "buy", date: "2026-10-29" }],
			fillTo: "2026-11-03",
		},
	})
	expect(details.firstElementChild?.classList.contains("a-cycle")).toBe(true)
	expect(details.querySelector(".a-cycle")?.getAttribute("role")).toBe("img")
})

test("tapping the head toggles the row once", () => {
	const { head, toggles } = draw()
	head.click()
	expect(toggles()).toBe(1)
})

test("a lead replaces the kind icon; with none the kind's icon shows", () => {
	draw({ lead: raw(`<span class="mini">1234</span>`) })
	expect(document.querySelector(".a-hit .mini")).not.toBeNull()
	expect(document.querySelector(".a-ic")).toBeNull()
	unmount(mounted as ReturnType<typeof mount>)
	mounted = undefined
	draw({ kind: "saved" })
	expect(document.querySelector(".a-ic")?.getAttribute("data-kind")).toBe("saved")
	expect(document.querySelector(".a-ic svg.icon")).not.toBeNull()
})

test("a sentence keeps its money strong and a late phrase red, the rest plain words", () => {
	const { details } = draw({ expanded: true, say: ["Left ", { money: "฿200.00" }, ", ", { late: "2 days late" }] })
	const sentence = details.querySelector(".a-say")
	expect(sentence?.textContent).toBe("Left ฿200.00, 2 days late")
	expect(sentence?.querySelector(".a-money")?.textContent).toBe("฿200.00")
	expect(sentence?.querySelector(".a-money")?.hasAttribute("data-numeric")).toBe(true)
	expect(sentence?.querySelector(".a-late")?.textContent).toBe("2 days late")
})

test("the styles: hidden wins, the foot wraps by its own width, the chevron keeps still under reduced motion", () => {
	const source = readFileSync(join(import.meta.dirname, "../../../src/components/molecules/ActionRow.svelte"), "utf8")
	expect(source).toMatch(/\.a-details\[hidden\]\s*\{\s*display: none/)
	expect(source).toMatch(/\.a-foot\s*\{[^}]*flex-wrap: wrap/)
	expect(source).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.a-chev\s*\{\s*transition: none/)
	expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i)
	// The row is one column at every width: the head button is its only child.
	expect(source).toMatch(/\.a-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/)
	// The details line up with the text past the icon or chip: its width and the gap.
	expect(source).toMatch(
		/\.a-wrap\s*\{[^}]*--a-lead-inline: calc\(var\(--cc-space-5\) \+ var\(--cc-space-3\) \+ var\(--cc-space-3\)\)/,
	)
})

// DD-105, DD-109: a hovered head's ground reaches the panel's inner edges, never an underline;
// a neutral icon tile or tag turns to the surface so it stays visible; the focus ring stays.
test("the head hovers with a ground to the panel's edges and keeps a focus ring", () => {
	const source = readFileSync(join(import.meta.dirname, "../../../src/components/molecules/ActionRow.svelte"), "utf8")
	expect(source).toMatch(
		/\.a-row:has\(> button\.a-hit:hover\)\s*\{[^}]*background: var\(--cc-surface-sunken\);[^}]*calc\(var\(--cc-space-4\) \* -1\) 0 0 var\(--cc-surface-sunken\),\s*var\(--cc-space-4\) 0 0 var\(--cc-surface-sunken\)/,
	)
	expect(source).toMatch(/:global\(\.tag:not[^{]*\{\s*background: var\(--cc-surface\)/)
	expect(source).toMatch(/\.a-hit:focus-visible\s*\{\s*box-shadow: var\(--cc-focus-ring\)/)
	expect(source).not.toMatch(/:hover[^{]*\{[^}]*text-decoration: underline/)
})

test("a row that opens a panel (onopen) has no drawer: its head opens the record, marked while it is open", () => {
	let opens = 0
	mounted = mount(ActionRow, {
		target: document.body,
		props: {
			kind: "draft",
			title: "Draft list",
			subtitle: "30 Oct",
			id: "list:d1",
			amount: { text: "−100.00", tone: "muted" },
			onopen: () => {
				opens++
			},
			current: true,
		},
	})
	flushSync()
	const head = document.querySelector<HTMLElement>(".a-hit")
	expect(head?.localName).toBe("button")
	expect(head?.hasAttribute("aria-expanded")).toBe(false)
	expect(head?.hasAttribute("aria-controls")).toBe(false)
	expect(head?.getAttribute("aria-current")).toBe("true")
	expect(head?.getAttribute("data-opens")).toBe("panel")
	expect(document.querySelector(".a-details")).toBeNull()
	head?.click()
	expect(opens).toBe(1)
})
