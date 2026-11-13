import type { LimitGroup, OwnerRecord } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import GroupForm from "#components/organisms/GroupForm.svelte"
import { GROUP_COLORS, type GroupColor } from "#lib/domain/group-color"
import { DEFAULT_OWNERS } from "#lib/domain/owner"
import { setLocale, t } from "#lib/i18n/index"

/**
 * The limit group form (in the limit panel, RD-24): name, limit, holder and colour, then *Save*,
 * with a two-step *Delete group* for a group no card uses. Ported from the group sheet's tests,
 * against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes Svelte's updates and anything they await. */
const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const scb: LimitGroup = {
	id: "g1",
	name: "SCB",
	limit: 200_000_00,
	owner: "KC",
}

interface Shown {
	group?: LimitGroup | null
	groups?: LimitGroup[]
	owners?: OwnerRecord[]
	inUse?: boolean
	error?: string
	busy?: boolean
	random?: () => number
}

/**
 * Mounts the sheet; `set` changes a prop afterwards, as the page would. The props read through
 * a `SvelteMap`, so a change reaches the mounted sheet as a reactive prop.
 */
const show = async (initial: Shown = {}) => {
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(Object.entries(initial))
	const saved: LimitGroup[] = []
	const deleted: LimitGroup[] = []
	let cancelled = 0
	mounted = mount(GroupForm, {
		target: document.body,
		props: {
			get group() {
				return (values.get("group") as LimitGroup | null | undefined) ?? null
			},
			get groups() {
				return (values.get("groups") as LimitGroup[] | undefined) ?? []
			},
			get owners() {
				return (values.get("owners") as OwnerRecord[] | undefined) ?? DEFAULT_OWNERS
			},
			get inUse() {
				return (values.get("inUse") as boolean | undefined) ?? false
			},
			get error() {
				return (values.get("error") as string | undefined) ?? ""
			},
			get busy() {
				return (values.get("busy") as boolean | undefined) ?? false
			},
			get random() {
				return (values.get("random") as (() => number) | undefined) ?? Math.random
			},
			onsave: (group: LimitGroup) => saved.push(group),
			ondelete: (group: LimitGroup) => deleted.push(group),
			oncancel: () => {
				cancelled += 1
			},
		},
	})
	await settle()
	const root = document.body
	return {
		root,
		saved,
		deleted,
		cancelled: () => cancelled,
		set: async (changes: Shown) => {
			for (const [key, value] of Object.entries(changes)) values.set(key, value)
			await settle()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const type = async (name: string, value: string) => {
	const input = document.querySelector(`input[name=${name}]`) as HTMLInputElement
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const click = async (selector: string) => {
	const target = document.querySelector<HTMLElement>(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

const submit = async () => {
	document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const focused = (attr: string) => document.activeElement?.getAttribute(attr)

test("a blank group has its fields, no holder chosen and Add limit group", async () => {
	const { root } = await show()
	expect(root.querySelector("dialog")).toBeNull()
	expect(text(root.querySelector("button[type=submit]"))).toBe("Add limit group")
	expect((root.querySelector("input[name=name]") as HTMLInputElement).value).toBe("")
	expect([...root.querySelectorAll("[data-owner]")].map((b) => [text(b), b.getAttribute("aria-checked")])).toEqual([
		["KC", "false"],
		["NT", "false"],
		["RI", "false"],
	])
	expect(root.querySelector("[data-action=delete-group]")).toBeNull()
})

test("offers the stored owners A to Z by name and saves the chosen one's id", async () => {
	const owners = [
		{ id: "KC", name: "Kamontat" },
		{ id: "pim", name: "Pim" },
		{ id: "ann", name: "Ann" },
	]
	const { root, saved } = await show({ owners })
	expect([...root.querySelectorAll("[data-owner]")].map((b) => [b.getAttribute("data-owner"), text(b)])).toEqual([
		["ann", "Ann"],
		["KC", "Kamontat"],
		["pim", "Pim"],
	])
	await type("name", "Pool")
	await type("limit", "100")
	await click('[data-owner="pim"]')
	await submit()
	expect(saved[0]?.owner).toBe("pim")
})

test("checks the name, a limit above zero and the holder", async () => {
	const { root, saved } = await show()
	const alert = () => text(root.querySelector("p[role=alert]"))
	await submit()
	expect(alert()).toBe("Give the limit group a name.")
	await type("name", "  KBank  ")
	await type("limit", "0")
	await submit()
	expect(alert()).toBe("Enter the limit in baht, like 300000.")
	await type("limit", "abc")
	await submit()
	expect(alert()).toBe("Enter the limit in baht, like 300000.")
	await type("limit", "250,000")
	await submit()
	expect(alert()).toBe("Choose the account holder for this limit group.")
	await click("[data-owner=NT]")
	expect(root.querySelector("[data-owner=NT]")?.getAttribute("aria-checked")).toBe("true")
	await submit()
	expect(root.querySelector("p[role=alert]")).toBeNull()
	expect(saved).toHaveLength(1)
	expect(saved[0]).toMatchObject({
		name: "KBank",
		limit: 250_000_00,
		owner: "NT",
	})
	expect(typeof saved[0]?.id).toBe("string")
})

test("an existing group fills the fields and keeps its id", async () => {
	const { root, saved } = await show({ group: scb })
	expect(text(root.querySelector("button[type=submit]"))).toBe("Save changes")
	expect((root.querySelector("input[name=limit]") as HTMLInputElement).value).toBe("200000")
	expect(root.querySelector("[data-owner=KC]")?.getAttribute("aria-checked")).toBe("true")
	await type("name", "SCB Biz")
	await submit()
	expect(saved).toEqual([{ ...scb, name: "SCB Biz", color: expect.any(String) }])
})

test("Delete group asks twice, focus following the swap", async () => {
	const { root, deleted } = await show({ group: scb })
	expect(text(root.querySelector("[data-action=delete-group]"))).toBe("Delete group")
	expect(root.querySelector("[data-action=delete-group]")?.getAttribute("data-variant")).toBe("danger")
	await click("[data-action=delete-group]")
	expect(text(root.querySelector(".ask"))).toBe("Delete SCB?")
	expect(focused("data-action")).toBe("confirm-delete")
	await click("[data-action=keep]")
	expect(root.querySelector(".ask")).toBeNull()
	expect(focused("data-action")).toBe("delete-group")
	await click("[data-action=delete-group]")
	await click("[data-action=confirm-delete]")
	expect(deleted).toEqual([scb])
})

test("a group a card uses has no Delete", async () => {
	const { root } = await show({ group: scb, inUse: true })
	expect(root.querySelector("[data-action=delete-group]")).toBeNull()
})

test("shows why a save failed and waits while busy", async () => {
	const { root } = await show({ group: scb, error: "Disk full", busy: true })
	const banner = root.querySelector(".error-banner")
	expect(banner?.getAttribute("role")).toBe("alert")
	expect(text(banner)).toBe("Disk full")
	// No retry: there is nothing to retry from here.
	expect(banner?.querySelector("button")).toBeNull()
	expect((root.querySelector("button[type=submit]") as HTMLButtonElement).disabled).toBe(true)
})

test("no banner while there is no error", async () => {
	const { root } = await show({ group: scb })
	expect(root.querySelector(".error-banner")).toBeNull()
})

test("Cancel asks the page to go back, beside the submit", async () => {
	const { root, cancelled } = await show({ group: scb })
	const actions = root.querySelector(".actions")
	expect(actions?.hasAttribute("data-twin")).toBe(true)
	expect([...(actions?.children ?? [])].map((b) => b.getAttribute("data-action") ?? b.getAttribute("type"))).toEqual([
		"cancel",
		"submit",
	])
	await click("[data-action=cancel]")
	expect(cancelled()).toBe(1)
})

test("without oncancel there is no Cancel", async () => {
	document.body.innerHTML = ""
	mounted = mount(GroupForm, {
		target: document.body,
		props: { group: null, groups: [], inUse: false, error: "", busy: false, onsave: () => {}, ondelete: () => {} },
	})
	await settle()
	expect(document.querySelector("[data-action=cancel]")).toBeNull()
	expect(document.querySelector(".actions")?.hasAttribute("data-twin")).toBe(false)
})

test("typing survives a language switch", async () => {
	const { root } = await show()
	await type("name", "Draft")
	setLocale("th")
	await settle()
	expect((root.querySelector("input[name=name]") as HTMLInputElement).value).toBe("Draft")
	expect(text(root.querySelector("button[type=submit]"))).toBe(t("limits.add"))
	expect(t("limits.add")).not.toBe("Add limit group")
})

test("a reload of the same group keeps the typing; another group resets it", async () => {
	const { root, set } = await show({ group: scb })
	await type("name", "Typed")
	await set({ group: { ...scb }, error: "Disk full" })
	const name = () => (root.querySelector("input[name=name]") as HTMLInputElement).value
	expect(name()).toBe("Typed")
	await set({ group: { ...scb, id: "g2", name: "Other" } })
	expect(name()).toBe("Other")
})

test("Delete NAME? stays after Delete, so a failed delete still shows it and the reason", async () => {
	const { root, set } = await show({ group: scb })
	await click("[data-action=delete-group]")
	await click("[data-action=confirm-delete]")
	await set({ error: "Could not delete that limit group." })
	expect(text(root.querySelector(".ask"))).toBe("Delete SCB?")
	expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull()
	expect(text(root.querySelector(".error-banner"))).toBe("Could not delete that limit group.")
})

const withColor = (id: string, color: GroupColor): LimitGroup => ({
	id,
	name: id,
	limit: 1_000_00,
	owner: "KC",
	color,
})

const pressed = (root: Element) =>
	[...root.querySelectorAll('.swatches [aria-checked="true"]')].map((b) => b.getAttribute("data-color"))

test("a new group's sheet opens with the one unused colour chosen", async () => {
	const others = GROUP_COLORS.filter((c) => c !== "cyan").map((c) => withColor(c, c))
	const { root } = await show({ groups: others })
	expect(pressed(root)).toEqual(["cyan"])
})

test("an existing group opens with its colour pressed and saves it unchanged", async () => {
	const { root, saved } = await show({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }, withColor("g2", "blue")],
	})
	expect(pressed(root)).toEqual(["rose"])
	await type("name", "SCB 2")
	await submit()
	expect(saved[0]?.color).toBe("rose")
})

test("pressing a swatch chooses it and saving emits it", async () => {
	const { root, saved } = await show({ group: { ...scb, color: "rose" } })
	await click('.swatches [data-color="teal"]')
	expect(pressed(root)).toEqual(["teal"])
	await submit()
	expect(saved[0]?.color).toBe("teal")
})

test("Random picks a colour no other group uses", async () => {
	const others = [withColor("g2", "blue")]
	const { root } = await show({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }, ...others],
		random: () => 0,
	})
	await click('[data-action="random-color"]')
	expect(pressed(root)).toEqual(["green"])
})

test("Random never draws the colour already chosen while another is free", async () => {
	const { root } = await show({
		group: { ...scb, color: "green" },
		groups: [{ ...scb, color: "green" }, withColor("g2", "blue")],
		random: () => 0,
	})
	await click('[data-action="random-color"]')
	expect(pressed(root)).toEqual(["purple"])
})

test("Random keeps the colour when it is the only free one", async () => {
	const others = GROUP_COLORS.filter((c) => c !== "green").map((c) => withColor(`g-${c}`, c))
	const { root } = await show({
		group: { ...scb, color: "green" },
		groups: [{ ...scb, color: "green" }, ...others],
		random: () => 0,
	})
	await click('[data-action="random-color"]')
	expect(pressed(root)).toEqual(["green"])
})

test("each swatch is named by its colour, in the language of the page", async () => {
	const { root } = await show()
	const label = (c: string) => root.querySelector(`.swatches [data-color="${c}"]`)?.getAttribute("aria-label")
	expect(label("teal")).toBe("Teal")
	setLocale("th")
	await settle()
	expect(label("teal")).toBe(t("color.teal"))
	expect(t("color.teal")).not.toBe("Teal")
})

test("a chosen colour survives a fresh copy of the same group", async () => {
	const { root, set } = await show({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }],
	})
	await click('.swatches [data-color="teal"]')
	await set({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }, withColor("g2", "blue")],
	})
	expect(pressed(root)).toEqual(["teal"])
})

test("the swatches lay out as a wrapping row with a visible edge", async () => {
	const source = await Bun.file("src/components/organisms/GroupForm.svelte").text()
	const css = source.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? ""
	const rule = css.match(/\.swatches\s*\{[^}]*\}/)?.[0] ?? ""
	expect(rule).toMatch(/flex-direction:\s*row/)
	expect(rule).toMatch(/flex-wrap:\s*wrap/)
	expect(css).toMatch(/button\[data-color\]\s*\{[^}]*var\(--cc-border-width\)[^}]*color-mix/)
})

test("the pressed swatch carries a check mark", async () => {
	const { root } = await show({ group: { ...scb, color: "rose" } })
	expect(root.querySelectorAll(".swatches svg")).toHaveLength(1)
	expect(root.querySelector('[data-color="rose"] svg')).not.toBeNull()
})

test("each swatch wears its group colour", async () => {
	const { root } = await show()
	for (const button of root.querySelectorAll(".swatches [data-color]"))
		expect(button.getAttribute("data-g")).toBe(button.getAttribute("data-color"))
})

/** Presses `key` on the focused radio of the group `selector`, as a keyboard would. */
const key = async (selector: string, name: string) => {
	const active = document.activeElement
	const from = active && active !== document.body ? active : document.querySelector(selector)
	const event = new KeyboardEvent("keydown", {
		key: name,
		bubbles: true,
		cancelable: true,
		composed: true,
	})
	from?.dispatchEvent(event)
	await settle()
	return event
}

const radios = (root: Element, attr: string) =>
	[...root.querySelectorAll<HTMLElement>(`[${attr}]`)].map((b) => ({
		value: b.getAttribute(attr),
		role: b.getAttribute("role"),
		checked: b.getAttribute("aria-checked"),
		tabindex: b.getAttribute("tabindex"),
	}))

test("the holders and the colours are radio groups named by their legends", async () => {
	const { root } = await show({ group: { ...scb, color: "rose" } })
	for (const selector of [".seg", ".swatches"]) {
		const group = root.querySelector(selector)
		expect(group?.getAttribute("role")).toBe("radiogroup")
		const id = group?.getAttribute("aria-labelledby") ?? ""
		expect(id).not.toBe("")
		const named = root.querySelector(`[id="${id}"]`)
		expect(named?.localName).toBe("legend")
		expect(text(named)).toBe(text(group?.closest("fieldset")?.querySelector("legend")))
		expect(text(named).length).toBeGreaterThan(0)
	}
	expect(radios(root, "data-owner")).toEqual([
		{ value: "KC", role: "radio", checked: "true", tabindex: "0" },
		{ value: "NT", role: "radio", checked: "false", tabindex: "-1" },
		{ value: "RI", role: "radio", checked: "false", tabindex: "-1" },
	])
	const colours = radios(root, "data-color")
	expect(colours.every((c) => c.role === "radio")).toBe(true)
	expect(colours.filter((c) => c.tabindex === "0").map((c) => c.value)).toEqual(["rose"])
	expect(colours.filter((c) => c.checked === "true").map((c) => c.value)).toEqual(["rose"])
	// Random is a button of its own after the group, not one of its choices.
	const random = root.querySelector('[data-action="random-color"]')
	expect(random?.closest('[role="radiogroup"]')).toBeNull()
	expect(random?.hasAttribute("role")).toBe(false)
	const swatches = root.querySelector(".swatches") as Element
	expect(swatches.compareDocumentPosition(random as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test("with no holder chosen, the first holder takes the tab stop", async () => {
	const { root } = await show()
	expect(radios(root, "data-owner").map((r) => r.tabindex)).toEqual(["0", "-1", "-1"])
})

test("arrows, Home and End move the holder choice and focus with it, wrapping", async () => {
	const { root } = await show({ group: scb })
	const owner = () => radios(root, "data-owner").find((r) => r.checked === "true")?.value
	root.querySelector<HTMLElement>("[data-owner=KC]")?.focus()
	const steps: [string, string][] = [
		["ArrowRight", "NT"],
		["ArrowDown", "RI"],
		["ArrowRight", "KC"],
		["ArrowLeft", "RI"],
		["ArrowUp", "NT"],
		["End", "RI"],
		["Home", "KC"],
	]
	for (const [name, want] of steps) {
		const event = await key(".seg", name)
		expect(event.defaultPrevented).toBe(true)
		expect(owner()).toBe(want)
		expect(focused("data-owner")).toBe(want)
		expect(
			radios(root, "data-owner")
				.filter((r) => r.tabindex === "0")
				.map((r) => r.value),
		).toEqual([want])
	}
	// Other keys pass through untouched.
	expect((await key(".seg", "a")).defaultPrevented).toBe(false)
	expect(owner()).toBe("KC")
})

test("arrows, Home and End move the colour choice and focus with it, wrapping", async () => {
	const first = GROUP_COLORS[0] as GroupColor
	const last = GROUP_COLORS.at(-1) as GroupColor
	const { root, saved } = await show({ group: { ...scb, color: last } })
	const colour = () => radios(root, "data-color").find((r) => r.checked === "true")?.value
	const now = () => [colour(), focused("data-color")]
	root.querySelector<HTMLElement>(`[data-color="${last}"]`)?.focus()
	await key(".swatches", "ArrowRight")
	expect(now()).toEqual([first, first])
	await key(".swatches", "ArrowLeft")
	expect(now()).toEqual([last, last])
	await key(".swatches", "Home")
	expect(now()).toEqual([first, first])
	await key(".swatches", "ArrowDown")
	expect(now()).toEqual([GROUP_COLORS[1], GROUP_COLORS[1]])
	await key(".swatches", "ArrowUp")
	expect(now()).toEqual([first, first])
	await key(".swatches", "End")
	expect(now()).toEqual([last, last])
	await submit()
	expect(saved[0]?.color).toBe(last)
})

test("Space and Enter choose the focused radio, as its button's own press", async () => {
	const { root } = await show()
	const nt = root.querySelector<HTMLElement>("[data-owner=NT]")
	expect(nt?.localName).toBe("button")
	expect(nt?.getAttribute("type")).toBe("button")
	nt?.focus()
	// The group leaves these keys to the button, which presses itself.
	expect((await key(".seg", " ")).defaultPrevented).toBe(false)
	expect((await key(".seg", "Enter")).defaultPrevented).toBe(false)
	nt?.click()
	await settle()
	expect(nt?.getAttribute("aria-checked")).toBe("true")
	expect(nt?.getAttribute("tabindex")).toBe("0")
})

test("with no holder chosen, ArrowRight on the focused first holder chooses the next", async () => {
	const { root } = await show()
	root.querySelector<HTMLElement>("[data-owner=KC]")?.focus()
	await key(".seg", "ArrowRight")
	expect(root.querySelector("[data-owner=NT]")?.getAttribute("aria-checked")).toBe("true")
	expect(focused("data-owner")).toBe("NT")
})
