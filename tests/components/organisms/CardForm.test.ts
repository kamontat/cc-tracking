import type { Card, LimitGroup, LocationRecord } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import CardForm from "#components/organisms/CardForm.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The card form, as the card's panel shows it for a new card or an edit (RD-24). Ported from
 * the legacy `cc-card-form` tests; where those read the element's state, these read what it draws.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const settle = async () => {
	for (let i = 0; i < 3; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const groups: LimitGroup[] = [{ id: "pool", name: "KBank account", limit: 500_000 }]

/** The three seeded places, stored out of name order. */
const places: LocationRecord[] = [
	{ id: "phichit", name: "Phichit", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
]

const stored = (extra: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...extra,
})

interface Shown {
	card?: Card | null
	groups?: LimitGroup[]
	locations?: LocationRecord[]
	error?: string
	busy?: boolean
}

/** Mounts the form; `set` changes a prop afterwards, as the page would. */
const show = async (card: Card | null = null, limitGroups = groups, extra: Shown = {}) => {
	setLocale("en")
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ card, groups: limitGroups, locations: places, error: "", busy: false, ...extra }),
	)
	const saves: Card[] = []
	mounted = mount(CardForm, {
		target: document.body,
		props: {
			get card() {
				return values.get("card") as Card | null
			},
			get groups() {
				return values.get("groups") as LimitGroup[]
			},
			get locations() {
				return values.get("locations") as LocationRecord[]
			},
			get error() {
				return values.get("error") as string
			},
			get busy() {
				return values.get("busy") as boolean
			},
			onsave: (next: Card) => saves.push(next),
		},
	})
	await settle()
	return {
		saves,
		set: async (changes: Shown) => {
			for (const [key, value] of Object.entries(changes)) values.set(key, value)
			await settle()
		},
	}
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)

const text = () => document.body.textContent ?? ""

const fill = async (name: string, value: string) => {
	const field = $<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
	if (!field) throw new Error(`no field named ${name}`)
	field.value = value
	field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
	await settle()
}

const press = async (selector: string) => {
	const button = $<HTMLButtonElement>(selector)
	if (!button) throw new Error(`no button ${selector}`)
	button.click()
	await settle()
}

const pickLocation = (location: string) => press(`[data-location="${location}"]`)

/** Every field a valid offset-rule card needs, except the limit group. */
const fillCard = async () => {
	await fill("id", "12.3")
	await fill("name", "KBank Visa")
	await fill("last4", "4821")
	await pickLocation("krabi")
	await fill("closeDay", "18")
	await fill("dueOffsetDays", "15")
}

const submit = async () => {
	$("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

test("refuses to save a card with no limit group", async () => {
	const { saves } = await show()
	await fillCard()
	await submit()
	expect(saves).toHaveLength(0)
	expect(text()).toContain("limit group")
})

test("carries the chosen limit group in the saved card", async () => {
	const { saves } = await show()
	await fillCard()
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]?.limitGroupId).toBe("pool")
})

test("opens an existing card on its stored group", async () => {
	await show(stored())
	expect($<HTMLSelectElement>('[name="limitGroupId"]')?.value).toBe("pool")
})

test("keeps the chosen limit group in place when the group list reshapes under the open form", async () => {
	const threeGroups: LimitGroup[] = [
		{ id: "a", name: "Group A", limit: 100_000 },
		{ id: "b", name: "Group B", limit: 200_000 },
		{ id: "c", name: "Group C", limit: 300_000 },
	]
	const { set } = await show(null, threeGroups)
	await fill("limitGroupId", "b")

	// A fourth group lands ahead of "b": the browser's own selection must not drift onto it.
	await set({
		groups: [
			threeGroups[0] as LimitGroup,
			{ id: "d", name: "Group D", limit: 400_000 },
			threeGroups[1] as LimitGroup,
			threeGroups[2] as LimitGroup,
		],
	})
	expect($<HTMLSelectElement>('[name="limitGroupId"]')?.value).toBe("b")

	// "b" is deleted outright: back to the placeholder, not whatever sits in its old slot.
	await set({ groups: [threeGroups[0] as LimitGroup, threeGroups[2] as LimitGroup] })
	expect($<HTMLSelectElement>('[name="limitGroupId"]')?.value).toBe("")
})

test("with no group stored, says to add one first and links to Limits instead of a select (RD-27)", async () => {
	await show(null, [])
	expect($('[name="limitGroupId"]')).toBeNull()
	expect($("[data-no-groups]")?.textContent).toContain("Add one first")
	expect($<HTMLAnchorElement>("[data-no-groups] a")?.getAttribute("href")).toBe("/cards/limits")
})

test("the placeholder cannot be picked: the group is required (RD-27)", async () => {
	await show()
	const select = $<HTMLSelectElement>('[name="limitGroupId"]')
	expect(select?.required).toBe(true)
	const placeholder = $<HTMLOptionElement>('[name="limitGroupId"] option[value=""]')
	expect(placeholder?.disabled).toBe(true)
})

test("refuses a new card id outside the card id form (RD-28)", async () => {
	const { saves } = await show()
	await fillCard()
	await fill("limitGroupId", "pool")
	await fill("id", "K1")
	await submit()
	expect(saves).toHaveLength(0)
	expect(text()).toContain("A card id is numbers joined by dots")
})

test("names each group as name (holder) · limit, A to Z by name", async () => {
	await show(null, [
		{ id: "solo", name: "SCB", limit: 100_000_00 },
		{ id: "pool", name: "KBank account", limit: 500_000_00, owner: "NT" },
	])
	const options = [...document.body.querySelectorAll<HTMLOptionElement>('[name="limitGroupId"] option')].slice(1)
	expect(options.map((option) => option.textContent?.trim())).toEqual([
		"KBank account (NT) · ฿500,000.00",
		"SCB (KC) · ฿100,000.00",
	])
})

test("emits a complete card with an offset rule", async () => {
	const { saves } = await show()
	await fillCard()
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]).toEqual({
		id: "12.3",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		comment: "",
		archived: false,
		limitGroupId: "pool",
	})
})

test("emits a fixed rule when that kind is chosen", async () => {
	const { saves } = await show()
	await press('[data-kind="fixed"]')
	expect($('[data-kind="fixed"]')?.getAttribute("aria-pressed")).toBe("true")
	await fill("id", "7")
	await fill("name", "SCB Mastercard")
	await fill("last4", "1234")
	await fill("closeDay", "18")
	await fill("dueDay", "5")
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 })
})

test("names the account holder from the chosen group, and asks for a holder only for a supplementary card", async () => {
	await show(null, [{ id: "nt", name: "NT pool", limit: 1, owner: "NT" }])
	const account = () => $<HTMLOptionElement>('[name="holder"] option[value="account"]')?.textContent
	expect(account()).toContain("Account holder (KC)")
	await fill("limitGroupId", "nt")
	expect(account()).toContain("Account holder (NT)")

	expect($('[name="owner"]')).toBeNull()
	await fill("holder", "supplementary")
	const options = [...document.body.querySelectorAll<HTMLOptionElement>('[name="owner"] option')].map((o) => o.value)
	expect(options).toEqual(["", "KC", "NT", "RI"])

	await fill("holder", "account")
	expect($('[name="owner"]')).toBeNull()
})

test("refuses a supplementary card with no holder chosen", async () => {
	const { saves } = await show()
	await fill("holder", "supplementary")
	await fillCard()
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves).toHaveLength(0)
	expect(text()).toContain("Choose who holds this supplementary card.")
})

test("saves the holder of a supplementary card", async () => {
	const { saves } = await show()
	await fill("holder", "supplementary")
	await fillCard()
	await fill("limitGroupId", "pool")
	await fill("owner", "NT")
	await submit()
	expect(saves[0]?.supplementary).toBe(true)
	expect(saves[0]?.owner).toBe("NT")
})

test("a stored group that no longer exists falls back to the placeholder", async () => {
	const { set, saves } = await show(stored())
	await set({ card: stored({ id: "other", limitGroupId: "gone" }) })
	expect($<HTMLSelectElement>('[name="limitGroupId"]')?.value).toBe("")
	// The stale id is not kept behind the blank select: the save asks for a group.
	await submit()
	expect(saves).toHaveLength(0)
	expect(text()).toContain("Choose the limit group this card draws on.")
	// Nor does it come back once a group with that id is listed.
	await set({ groups: [...groups, { id: "gone", name: "Gone", limit: 1 }] })
	expect($<HTMLSelectElement>('[name="limitGroupId"]')?.value).toBe("")
})

test("drops the owner once the card is no longer supplementary", async () => {
	const { saves } = await show(stored({ supplementary: true, owner: "NT" }))
	await fill("holder", "account")
	await submit()
	expect(saves[0]?.supplementary).toBe(false)
	expect(saves[0] && "owner" in saves[0]).toBe(false)
})

test("shows the edited card's supplementary answer and holder, and saves them back untouched", async () => {
	const { saves } = await show(stored({ supplementary: true, owner: "RI" }))
	expect($<HTMLSelectElement>('[name="holder"]')?.value).toBe("supplementary")
	expect($<HTMLSelectElement>('[name="owner"]')?.value).toBe("RI")
	await submit()
	expect(saves[0]?.supplementary).toBe(true)
	expect(saves[0]?.owner).toBe("RI")
})

test("refuses a last4 that is not four digits", async () => {
	const { saves } = await show()
	await fillCard()
	await fill("last4", "48")
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves).toHaveLength(0)
	expect(text()).toContain("four digits")
})

test("re-renders a displayed error in the new language when the locale switches", async () => {
	await show()
	await fillCard()
	await fill("last4", "48")
	await submit()
	expect(text()).toContain("Last 4 must be exactly four digits.")

	setLocale("th")
	await settle()
	expect(text()).toContain("เลข 4 ตัวท้ายต้องเป็นตัวเลขสี่หลัก")
})

test("shows a four-digit example in the id field", async () => {
	await show()
	expect($<HTMLInputElement>('[name="id"]')?.placeholder).toBe("0001")
})

test("shows the id of a saved card disabled, and saves under it", async () => {
	const { saves } = await show(stored())
	const id = $<HTMLInputElement>('[name="id"]')
	expect(id?.disabled).toBe(true)
	expect(id?.value).toBe("kbank")
	// The page's sub-header says the id can't change; the form does not repeat it.
	expect(text()).not.toContain("Card id can't change")

	await fill("name", "Renamed")
	await submit()
	expect(saves[0]?.id).toBe("kbank")
	expect(saves[0]?.name).toBe("Renamed")
})

const locationButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>(".seg [data-location]")]

test("offers the stored locations as a segmented control, A to Z by name", async () => {
	await show()
	const buttons = locationButtons()
	expect(buttons.map((button) => button.dataset["location"])).toEqual(["bangkok", "krabi", "phichit"])
	expect(buttons.map((button) => button.textContent?.trim())).toEqual(["Bangkok", "Krabi", "Phichit"])
	expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"])
})

test("Kept in lists a custom location and saves its id", async () => {
	const { saves } = await show(null, groups, {
		locations: [...places, { id: "chiang-mai", name: "Chiang Mai", takesPurchases: false }],
	})
	expect(locationButtons().map((b) => b.textContent?.trim())).toEqual(["Bangkok", "Chiang Mai", "Krabi", "Phichit"])

	await fillCard()
	await pickLocation("chiang-mai")
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]?.location).toBe("chiang-mai")
})

test("Kept in follows the language: a seeded name in Thai sorts by its Thai name", async () => {
	await show(null, groups, {
		locations: [...places, { id: "ayutthaya", name: "Ayutthaya", takesPurchases: false }],
	})
	setLocale("th")
	await settle()
	const names = locationButtons().map((b) => b.textContent?.trim())
	expect(names).toEqual([...(names as string[])].sort((a, b) => a.localeCompare(b, "th")))
	expect(names).toContain("กระบี่")
})

test("a new card defaults to the first location A to Z when Bangkok is gone", async () => {
	const { saves } = await show(null, groups, {
		locations: [
			{ id: "krabi", name: "Krabi", takesPurchases: true },
			{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false },
		],
	})
	expect($('[data-location="chiang-mai"]')?.getAttribute("aria-pressed")).toBe("true")

	await fill("id", "12.3")
	await fill("name", "KBank Visa")
	await fill("last4", "4821")
	await fill("closeDay", "18")
	await fill("dueOffsetDays", "15")
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]?.location).toBe("chiang-mai")
})

test("defaults a new card to Bangkok without the user touching the field", async () => {
	const { saves } = await show()
	await fill("id", "12.3")
	await fill("name", "KBank Visa")
	await fill("last4", "4821")
	await fill("closeDay", "18")
	await fill("dueOffsetDays", "15")
	await fill("limitGroupId", "pool")
	await submit()
	expect(saves[0]?.location).toBe("bangkok")
})

test("shows the edited card's own location pressed", async () => {
	await show(stored({ location: "phichit" }))
	expect($('[data-location="phichit"]')?.getAttribute("aria-pressed")).toBe("true")
})

test("renders its labels and locations in the chosen language", async () => {
	await show()
	expect(text()).toContain("Add card")
	expect(text()).toContain("Bangkok")

	setLocale("th")
	await settle()
	expect(text()).toContain("เพิ่มบัตร")
	expect(text()).toContain("กรุงเทพฯ")
})

test("keeps what was typed when the page hands back a fresh copy of the same card", async () => {
	const { set } = await show(stored())
	await fill("name", "Typed")
	await set({ card: stored() })
	expect($<HTMLInputElement>('[name="name"]')?.value).toBe("Typed")
})

test("a new card has no archive, no delete and no cancel -- the sub-header leaves", async () => {
	await show()
	expect($('[data-action="archive"]')).toBeNull()
	expect($('[data-action="delete-card"]')).toBeNull()
	expect($('[data-action="cancel"]')).toBeNull()
	expect($('button[type="submit"]')?.textContent?.trim()).toBe("Add card")
})

test("editing saves changes, with no Archive or Delete -- they live on the card panel", async () => {
	await show(stored())
	expect($('button[type="submit"]')?.textContent?.trim()).toBe("Save changes")
	expect($('[data-action="archive"]')).toBeNull()
	expect($('[data-action="delete-card"]')).toBeNull()
	expect(text()).not.toContain("Archive card")
	expect(text()).not.toContain("Delete card")
})

test("groups the fields in sections: Card, Where and who, Billing cycle, Comment, then Save", async () => {
	await show(stored())
	const sections = [...document.body.querySelectorAll("form > section")]
	expect(sections.map((section) => section.querySelector("h2")?.textContent?.trim())).toEqual([
		"Card",
		"Where and who",
		"Billing cycle",
		"Comment",
	])
	const names = (section: Element | undefined) =>
		[...(section?.querySelectorAll("[name], [data-location], [data-kind]") ?? [])].map(
			(field) => field.getAttribute("name") ?? (field.hasAttribute("data-location") ? "location" : "kind"),
		)
	expect(names(sections[0])).toEqual(["name", "id", "last4"])
	expect([...new Set(names(sections[1]))]).toEqual(["location", "limitGroupId", "holder"])
	expect([...new Set(names(sections[2]))]).toEqual(["kind", "closeDay", "dueOffsetDays"])
	expect(names(sections[3])).toEqual(["comment"])
	// Each section is named by its heading.
	for (const section of sections) {
		const id = section.getAttribute("aria-labelledby")
		expect(id && section.querySelector(`#${CSS.escape(id)}`)?.tagName).toBe("H2")
	}
	// The cycle's kinds are a fieldset named by the section's heading, not a div with a role.
	const kinds = sections[2]?.querySelector("fieldset")
	expect(kinds?.querySelector("[data-kind]")).not.toBeNull()
	expect(kinds?.getAttribute("aria-labelledby")).toBe(sections[2]?.getAttribute("aria-labelledby"))
	// Save closes the form, after the last section.
	expect($("form")?.lastElementChild?.querySelector('button[type="submit"]')).not.toBeNull()
})

test("shows the page's reason a write failed, and holds the buttons while busy", async () => {
	await show(stored(), groups, { error: "Could not save the card.", busy: true })
	expect($(".error-banner")?.textContent).toContain("Could not save the card.")
	// The form's banner only says what went wrong: the submit tries again.
	expect($(".error-banner button")).toBeNull()
	expect($<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
})

test("a submit while busy saves nothing", async () => {
	const { saves } = await show(stored(), groups, { busy: true })
	await submit()
	expect(saves).toHaveLength(0)
})

test("Cancel shows only with oncancel, beside the submit, and calls it", async () => {
	await show(stored())
	expect($('[data-action="cancel"]')).toBeNull()
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	let cancelled = 0
	mounted = mount(CardForm, {
		target: document.body,
		props: {
			card: stored(),
			groups,
			locations: places,
			onsave: () => {},
			oncancel: () => {
				cancelled++
			},
		},
	})
	await settle()
	const cancel = $('.actions button[data-action="cancel"]')
	expect(cancel?.getAttribute("type")).toBe("button")
	expect(cancel?.getAttribute("data-variant")).toBe("quiet")
	cancel?.click()
	expect(cancelled).toBe(1)
})
