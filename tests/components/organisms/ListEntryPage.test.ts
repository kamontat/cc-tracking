import type { PurchaseList } from "#lib/domain/types"
import type { ShareApi, ShareTable } from "#lib/ui/list-share"

import { afterEach, describe, expect, test, vi } from "vitest"

import ListEntryPage from "#components/organisms/ListEntryPage.svelte"
import { MessageError } from "#lib/i18n/error"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { shareTable, shareText } from "#lib/ui/list-share"
import {
	bannerText,
	card,
	cleanup,
	click,
	closeCard,
	draft,
	elsewhereLink,
	fieldsOf,
	flatText,
	openCard,
	saved,
	sent,
	settle,
	setupPage,
	stored,
	typeField,
} from "./list-support"

/**
 * Writing a purchase list: the list, with each card's amounts in its add-a-card sheet, then
 * review and mark it sent or keep it as a draft, at `/transactions/lists/new?cards=…` and
 * `/transactions/lists/edit?list=` (RD-26). Ported from the legacy `entry` tests; where those
 * dispatched the amounts element's events, these type into the real form.
 */
afterEach(cleanup)

type Calls = { copy: string[]; saveImage: [ShareTable, string][] }

const recordingShare = (calls: Calls): ShareApi => ({
	copy: async (text) => {
		calls.copy.push(text)
	},
	saveImage: async (table, filename) => {
		calls.saveImage.push([table, filename])
		return "saved"
	},
})

const setup = async (
	options: {
		mode?: "new" | "draft"
		repo?: Repository
		search?: string
		share?: ShareApi
		before?: (repo: Repository) => Promise<void>
	} = {},
) => {
	const calls: Calls = { copy: [], saveImage: [] }
	const page = await setupPage(ListEntryPage, {
		...(options.repo ? { repo: options.repo } : {}),
		search: options.search ?? "?cards=A",
		...(options.before ? { before: options.before } : {}),
		props: {
			mode: options.mode ?? "new",
			share: options.share ?? recordingShare(calls),
			newId: () => "l-new",
		},
	})
	return { ...page, calls }
}

/** The draft page, opened on `d1` as `before` stored it. */
const setupDraft = (before: (repo: Repository) => Promise<void>, repo?: Repository) =>
	setup({ mode: "draft", search: "?list=d1", before, ...(repo ? { repo } : {}) })

const draftWith =
	(cardIds: string[]) =>
	async (repo: Repository): Promise<void> =>
		repo.savePurchaseList(draft("d1", cardIds))

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

/** The cards on the list, in order. */
const onList = () =>
	[...document.querySelectorAll(".lines > .line[data-card]")].map((el) => el.getAttribute("data-card"))

/** A card's first amount, read from its sheet, which closes again. */
const amountOf = async (cardId: string) => {
	const [value] = await fieldsOf(cardId, "amount")
	await closeCard()
	return value
}

const typeAmount = (cardId: string, value: string) => typeField(cardId, "amount", value)

const setDate = async (value: string) => {
	const input = $<HTMLInputElement>('[data-field="date"]')
	if (!input) throw new Error("no date")
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

/** Takes a card off the list from its sheet. */
const remove = async (cardId: string) => {
	await openCard(cardId)
	await click(document, "remove")
}

/** Opens *Add a card*, picks `cardId` and adds it to the list. */
const add = async (cardId: string) => {
	await click(document, "add-card")
	const tile = $(`dialog .tile[data-card="${cardId}"]`)
	if (!tile) throw new Error(`${cardId} is not offered`)
	tile.click()
	await settle()
	await click(document, "add-to-list")
}

/** The cards *Add a card* offers that are not on the list yet, without picking one. */
const offered = async () => {
	await click(document, "add-card")
	const ids = [...document.querySelectorAll("dialog .tile[data-card]")]
		.filter((tile) => !tile.querySelector(".aside"))
		.map((el) => el.getAttribute("data-card"))
	await click(document, "close")
	return ids
}

const typeAndReview = async (amounts: Record<string, string>) => {
	for (const [cardId, value] of Object.entries(amounts)) await typeAmount(cardId, value)
	await click(document, "review")
}

const statusText = () => $('p.status[role="status"]')?.textContent?.trim() ?? ""
const deleteButton = () => $<HTMLButtonElement>('[data-action="delete-draft"]')
const subtitleOf = () => flatText($(".sub-header h1 .sub-header__detail"))

test("a new list opens with the picked cards and today", async () => {
	await setup({ search: "?cards=B&cards=A&cards=Z&cards=nope" })
	expect(onList()).toEqual(["B", "A"])
	expect($<HTMLInputElement>('[data-field="date"]')?.value).toBe("2026-10-31")
	expect($("h1")?.textContent).toContain("New purchase list")
	// There is no picker before the list any more (DD-195): Back goes to the Lists tab.
	expect($('[data-action="back"]')?.getAttribute("href")).toBe("/transactions/lists")
})

test("a draft's back goes to the Lists tab too", async () => {
	await setupDraft(draftWith(["A"]))
	expect($('[data-action="back"]')?.getAttribute("href")).toBe("/transactions/lists")
})

test("a new list ignores a list in its address", async () => {
	await setup({ search: "?list=d1", before: draftWith(["A"]) })
	expect(onList()).toEqual([])
	expect($("h1")?.textContent).toContain("New purchase list")
})

test("review shows the table and comes back with everything typed", async () => {
	await setup()
	await typeAndReview({ A: "125" })
	expect($(".list-layout__main .doc")).not.toBeNull()
	expect($('[data-field="amount"]')).toBeNull()
	expect($("h1")?.textContent).toContain("Review list")
	await click(document, "back")
	expect(await amountOf("A")).toBe("125")
})

test("mark as sent stores a waiting list and leaves for its panel", async () => {
	const { repo, visited } = await setup()
	await typeAndReview({ A: "125" })
	await click(document, "mark-sent")
	expect(await stored(repo)).toEqual([
		{
			id: "l-new",
			date: "2026-10-31",
			status: "sent",
			sentAt: "2026-10-31T03:00:00.000Z",
			lines: [{ cardId: "A", amount: 125_00 }],
		},
	])
	expect(visited).toEqual(["/transactions/lists?list=l-new"])
})

test("save as draft stores a draft from the amounts step", async () => {
	const { repo, visited } = await setup()
	await typeAmount("A", "125")
	await click(document, "save-draft")
	expect(await stored(repo)).toEqual([
		{ id: "l-new", date: "2026-10-31", status: "draft", lines: [{ cardId: "A", amount: 125_00 }] },
	])
	expect(visited).toEqual(["/transactions/lists?list=l-new"])
})

test("lines come only from the cards still on the list", async () => {
	const { repo } = await setup({ search: "?cards=A&cards=B" })
	await typeAmount("A", "125")
	await typeAmount("B", "50")
	await remove("B")
	expect(onList()).toEqual(["A"])
	await click(document, "review")
	await click(document, "mark-sent")
	expect((await stored(repo))[0]?.lines).toEqual([{ cardId: "A", amount: 125_00 }])
})

test("add puts a ready card on the list", async () => {
	await setup()
	expect(await offered()).toEqual(["B"])
	await add("B")
	expect(onList()).toEqual(["A", "B"])
	expect(await offered()).toEqual([])
})

test("a draft opens into enter amounts and keeps its id", async () => {
	const { repo } = await setupDraft((r) =>
		r.savePurchaseList({
			id: "d1",
			date: "2026-11-02",
			status: "draft",
			lines: [
				{ cardId: "A", amount: 12_345_00 },
				{ cardId: "Z", amount: 100 },
			],
		}),
	)
	expect(onList()).toEqual(["A"])
	expect(await amountOf("A")).toBe("12345")
	expect($<HTMLInputElement>('[data-field="date"]')?.value).toBe("2026-11-02")
	expect($("h1")?.textContent).toContain("Draft list")
	await click(document, "review")
	await click(document, "mark-sent")
	const lists = await stored(repo)
	expect(lists).toHaveLength(1)
	expect(lists[0]).toMatchObject({
		id: "d1",
		status: "sent",
		date: "2026-11-02",
		lines: [{ cardId: "A", amount: 12_345_00 }],
	})
})

const droppedNote = () => flatText($("p.note[data-dropped]"))

test("a reopened draft says which cards were left out and why", async () => {
	await setupDraft(draftWith(["A", "Z"]))
	expect(droppedNote()).toBe("Z) Z card (1234) can no longer take purchases and was left out.")
	await setupDraft(async (r) => {
		await r.saveCard(card("Y", { archived: true }))
		await draftWith(["A", "Z", "Y"])(r)
	})
	expect(droppedNote()).toBe("Z) Z card (1234), Y) Y card (1234) can no longer take purchases and were left out.")
	await setupDraft(draftWith(["A"]))
	expect($("p.note[data-dropped]")).toBeNull()
})

test("a draft sent or saved elsewhere is not saved over", async () => {
	for (const action of ["mark-sent", "save-draft"]) {
		const { repo, visited } = await setupDraft(draftWith(["A"]))
		if (action === "mark-sent") await click(document, "review")
		const elsewhere: PurchaseList = {
			id: "d1",
			date: "2026-11-02",
			status: "sent",
			sentAt: "2026-10-31T01:00:00.000Z",
			lines: [{ cardId: "A", amount: 999 }],
		}
		await repo.savePurchaseList(elsewhere)
		await click(document, action)
		expect(bannerText(document)).toContain("This list was sent or saved elsewhere, so it was not changed.")
		expect(await stored(repo)).toEqual([elsewhere])
		expect(visited).toEqual([])
		expect($(action === "mark-sent" ? ".list-layout__main .doc" : ".line[data-card]")).not.toBeNull()
	}
})

test("an unknown draft says so and leads to the Lists tab", async () => {
	await setup({ mode: "draft", search: "?list=gone" })
	expect(document.body.textContent).toContain("This list no longer exists.")
	expect(flatText($('a[href="/transactions/lists"]:not([data-action])'))).toBe("Go to Lists")
	expect($('[data-field="amount"]')).toBeNull()
})

test("a list that is not a draft leads to where it is worked on now", async () => {
	await setupDraft((r) => r.savePurchaseList(sent("d1", ["A"])))
	expect($(".line[data-card]")).toBeNull()
	expect(document.body.textContent).toContain("This list is waiting for the spender's reply.")
	expect(elsewhereLink(document)).toBe("/transactions/lists/edit?list=d1")
	await setupDraft((r) => r.savePurchaseList(saved("d1", ["A"])))
	expect(document.body.textContent).toContain("This list is already saved.")
	expect(elsewhereLink(document)).toBe("/transactions/lists?list=d1")
})

test("a sent list holds room on a new list", async () => {
	await setup({
		before: (r) => r.savePurchaseList({ ...sent("s1", ["A"]), lines: [{ cardId: "A", amount: 10_000_00 }] }),
	})
	await typeAmount("A", "1")
	// G1's ฿100,000.00, less the waiting ฿10,000.00, less this ฿1.00.
	expect(flatText($('.line[data-card="A"]'))).toContain("฿89,999.00")
})

test("a saved list replaces the page in history", async () => {
	const replace = vi.spyOn(location, "replace").mockImplementation(() => {})
	const assign = vi.spyOn(location, "assign").mockImplementation(() => {})
	try {
		await setupPage(ListEntryPage, {
			search: "?cards=A",
			props: { mode: "new", share: {}, newId: () => "l-new", navigate: undefined },
		})
		await typeAmount("A", "125")
		await click(document, "save-draft")
		expect(replace.mock.calls.map(([url]) => String(url))).toEqual(["/transactions/lists?list=l-new"])
		expect(assign).not.toHaveBeenCalled()
	} finally {
		replace.mockRestore()
		assign.mockRestore()
	}
})

test("copy text copies the table", async () => {
	const { calls } = await setup()
	await typeAndReview({ A: "125" })
	await click(document, "copy")
	const repoCards = [card("A"), card("B"), card("Z", { archived: true })]
	expect(calls.copy).toEqual([
		shareText(shareTable({ date: "2026-10-31", lines: [{ cardId: "A", amount: 125_00 }] }, repoCards)),
	])
	expect(statusText()).toBe("Copied. Paste it into the chat with the spender.")
})

test("copy and save image are offered only when the browser can", async () => {
	await setup({ share: {} })
	await typeAndReview({ A: "125" })
	expect($(".list-layout__main .doc")).not.toBeNull()
	expect($('[data-action="copy"]')).toBeNull()
	expect($('[data-action="save-image"]')).toBeNull()
})

test("a failed copy says so", async () => {
	await setup({ share: { copy: () => Promise.reject(new Error("denied")) } })
	await typeAndReview({ A: "125" })
	await click(document, "copy")
	expect(statusText()).toBe("Could not copy the text.")
})

test("save image is named by date and failure is said", async () => {
	const { calls } = await setup()
	await typeAndReview({ A: "125" })
	await click(document, "save-image")
	expect(calls.saveImage.map(([, name]) => name)).toEqual(["purchase-list-2026-10-31.png"])
	expect(calls.saveImage[0]?.[0].rows).toHaveLength(1)
	expect(statusText()).toBe("Image saved. Send it in the chat with the spender.")

	await setup({ share: { saveImage: () => Promise.reject(new MessageError("purchaseList.error.image")) } })
	await typeAndReview({ A: "125" })
	await click(document, "save-image")
	expect(statusText()).toBe("Could not save the image. Use Copy text instead.")
})

test("a shared image says so, and a cancelled share says nothing", async () => {
	await setup({ share: { saveImage: async () => "shared" } })
	await typeAndReview({ A: "125" })
	await click(document, "save-image")
	expect(statusText()).toBe("Image shared. Check it reached the spender.")

	await setup({ share: { saveImage: async () => "cancelled" } })
	await typeAndReview({ A: "125" })
	await click(document, "save-image")
	expect(statusText()).toBe("")
})

/** A repository whose savePurchaseList always rejects. */
class RejectingListRepository extends InMemoryRepository {
	override savePurchaseList(): Promise<void> {
		return Promise.reject(new Error("disk is full"))
	}
}

test("a failed save keeps the review, and Back still has what was typed", async () => {
	const { visited } = await setup({ repo: new RejectingListRepository() })
	await typeAndReview({ A: "125" })
	await click(document, "mark-sent")
	expect(bannerText(document).startsWith("Could not save the list.")).toBe(true)
	expect($(".list-layout__main .doc")).not.toBeNull()
	expect(visited).toEqual([])
	await click(document, "back")
	expect(await amountOf("A")).toBe("125")
})

test("re-renders in Thai", async () => {
	await setup()
	setLocale("th")
	await settle()
	expect($("h1")?.textContent).toContain("ใบรายการซื้อใหม่")
	expect($('[data-action="back"]')?.getAttribute("aria-label")).toBe("กลับ")
})

test("the review puts the table in the main column and its actions in the side panel", async () => {
	await setup()
	await typeAndReview({ A: "125" })
	expect($(".list-layout > .list-layout__main .doc")).toBeInstanceOf(HTMLElement)
	const side = $(".list-layout > .list-layout__side")
	for (const action of ["copy", "save-image", "mark-sent"])
		expect(side?.querySelector(`[data-action="${action}"]`)).toBeInstanceOf(HTMLElement)
	// A draft is kept before the review, on the amounts step (DD-187).
	expect(side?.querySelector('[data-action="save-draft"]')).toBeNull()
	expect(side?.querySelector('p.status[role="status"]')).toBeInstanceOf(HTMLElement)
})

test("only a draft offers Delete draft, in the side panel of both steps", async () => {
	await setup()
	expect(deleteButton()).toBeNull()
	await typeAndReview({ A: "125" })
	expect(deleteButton()).toBeNull()

	await setupDraft(draftWith(["A"]))
	expect(deleteButton()?.getAttribute("data-variant")).toBe("danger")
	expect(deleteButton()?.closest(".list-layout__side")).not.toBeNull()
	expect(deleteButton()?.textContent?.trim()).toBe("Delete draft")
	await click(document, "review")
	expect($(".list-layout > .list-layout__side")?.contains(deleteButton())).toBe(true)
})

test("delete draft removes the draft at once and leaves for the Lists tab", async () => {
	const { repo, visited } = await setupDraft(async (r) => {
		await draftWith(["A"])(r)
		await r.savePurchaseList(sent("s1", ["B"]))
	})
	await click(document, "delete-draft")
	expect((await stored(repo)).map((l) => l.id)).toEqual(["s1"])
	expect(visited).toEqual(["/transactions/lists"])
})

test("a draft sent or saved elsewhere is not deleted", async () => {
	const { repo, visited } = await setupDraft(draftWith(["A"]))
	const elsewhere = sent("d1", ["A"])
	await repo.savePurchaseList(elsewhere)
	await click(document, "delete-draft")
	expect(bannerText(document)).toContain("This list was sent or saved elsewhere, so it was not changed.")
	expect(await stored(repo)).toEqual([elsewhere])
	expect(visited).toEqual([])
})

/** A repository whose deletePurchaseList always rejects. */
class UndeletableRepository extends InMemoryRepository {
	override deletePurchaseList(): Promise<void> {
		return Promise.reject(new Error("disk is busy"))
	}
}

test("a failed delete says so and stays", async () => {
	const { repo, visited } = await setupDraft(draftWith(["A"]), new UndeletableRepository())
	await click(document, "delete-draft")
	expect(bannerText(document).startsWith("Could not delete the draft.")).toBe(true)
	expect((await stored(repo)).map((l) => l.id)).toEqual(["d1"])
	expect(visited).toEqual([])
	expect($(".line[data-card]")).not.toBeNull()
})

test("ids with & or , survive in the address", async () => {
	const { now } = await setup({
		before: async (r) => {
			await r.saveCard(card("a&b,c"))
		},
	})
	await add("a&b,c")
	expect(now()).toBe("/transactions/lists/new?cards=A&cards=a%26b%2Cc")
	expect(new URLSearchParams(now().split("?")[1]).getAll("cards")).toEqual(["A", "a&b,c"])
})

test("a draft page keeps its address as it is", async () => {
	const { now } = await setupDraft(draftWith(["A"]))
	await add("B")
	await remove("A")
	expect(now()).toBe("?list=d1")
	expect(onList()).toEqual(["B"])
})

test("Back between the page's own entries stays the page's, so the router keeps what was typed", async () => {
	const { popOptions, pushOptions } = await setup()
	expect(popOptions).toEqual([{ ownPage: true }])
	await click(document, "add-card")
	expect(pushOptions).toEqual([{ ownPage: true }])
})

test("a row's sheet is in history too, on a draft as on a new list", async () => {
	const { now, back, entries } = await setupDraft(draftWith(["A"]))
	await openCard("A")
	expect(entries).toEqual(["?list=d1", "/transactions/lists/edit?list=d1"])
	back()
	await settle()
	expect($("dialog")).toBeNull()
	expect(now()).toBe("?list=d1")
})

test("a new list with no card opens empty, ready to add the first", async () => {
	await setup({ search: "" })
	expect(onList()).toEqual([])
	await click(document, "add-card")
	expect([...document.querySelectorAll("dialog .tile")].map((t) => t.getAttribute("data-card")).sort()).toEqual([
		"A",
		"B",
	])
})

test("the sub-header's muted line names the list's date and how many cards it has", async () => {
	await setup({ search: "?cards=B&cards=A" })
	expect(flatText($(".sub-header .sub-header__title"))).toBe("New purchase list")
	expect(subtitleOf()).toBe("Sat, 31 Oct 2026 · 2 cards")
	// A new date shows at once; review counts the lines that carry an amount.
	await typeAmount("B", "1")
	await setDate("2026-11-03")
	expect(subtitleOf()).toBe("Tue, 03 Nov 2026 · 2 cards")
	await click(document, "review")
	expect(subtitleOf()).toBe("Tue, 03 Nov 2026 · 1 card")

	await setupDraft(draftWith(["A"]))
	expect(subtitleOf()).toBe("Mon, 02 Nov 2026 · 1 card")
})

/** Adds an order to `cardId` and types `value` into it. */
const addOrder = async (cardId: string, value: string) => {
	const sheet = await openCard(cardId)
	sheet.querySelector<HTMLElement>('[data-action="add-order"]')?.click()
	await settle()
	const orders = (await fieldsOf(cardId, "amount")).length
	await typeField(cardId, "amount", value, orders - 1)
}

test("a card's orders are stored as a line each, in order", async () => {
	const { repo } = await setup({ search: "?cards=A&cards=B" })
	await typeAmount("A", "100")
	await addOrder("A", "200")
	await typeAmount("B", "50")
	await click(document, "review")
	expect(document.querySelectorAll(".doc tbody tr")).toHaveLength(3)
	expect(subtitleOf()).toBe("Sat, 31 Oct 2026 · 2 cards · 3 orders")
	await click(document, "back")
	expect(await fieldsOf("A", "amount")).toEqual(["100", "200"])
	await closeCard()
	await click(document, "save-draft")
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 100_00 },
		{ cardId: "A", amount: 200_00 },
		{ cardId: "B", amount: 50_00 },
	])
})

test("a draft with several orders on a card opens them in the card's one sheet", async () => {
	const { repo } = await setupDraft((r) =>
		r.savePurchaseList({
			id: "d1",
			date: "2026-11-02",
			status: "draft",
			lines: [
				{ cardId: "A", amount: 100_00, note: "fuel" },
				{ cardId: "B", amount: 50_00 },
				{ cardId: "A", amount: 300_00 },
			],
		}),
	)
	expect(onList()).toEqual(["A", "B"])
	expect(await fieldsOf("A", "amount")).toEqual(["100", "300"])
	expect(await fieldsOf("A", "note")).toEqual(["fuel", ""])
	await closeCard()
	expect(subtitleOf()).toBe("Mon, 02 Nov 2026 · 2 cards · 3 orders")
	await click(document, "review")
	await click(document, "mark-sent")
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 100_00, note: "fuel" },
		{ cardId: "A", amount: 300_00 },
		{ cardId: "B", amount: 50_00 },
	])
})

test("a draft keeps a card with no amount yet, and reopens it blank", async () => {
	const { repo } = await setup({ search: "?cards=A&cards=B" })
	await typeAmount("A", "125")
	expect($<HTMLButtonElement>('[data-action="review"]')?.disabled).toBe(false)
	await click(document, "save-draft")
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 125_00 },
		{ cardId: "B", amount: 0 },
	])

	await setupDraft((r) => r.savePurchaseList(draft("d1", ["A", "B"], { lines: [{ cardId: "A", amount: 0 }] })))
	expect(onList()).toEqual(["A"])
	expect(await amountOf("A")).toBe("")
})

test("save as draft needs no amount at all, but refuses text that is not money", async () => {
	const { repo } = await setup()
	const button = () => $<HTMLButtonElement>('[data-action="save-draft"]')
	expect(button()?.disabled).toBe(false)
	await typeAmount("A", "abc")
	expect(button()?.disabled).toBe(true)
	await typeAmount("A", "")
	await click(document, "save-draft")
	expect((await stored(repo))[0]?.lines).toEqual([{ cardId: "A", amount: 0 }])
})

const mergeAsk = () => flatText($("[data-merge-ask]"))

test("saving a draft on a day that has one asks to merge, and Merge adds this list to it", async () => {
	const existing = draft("d0", ["B"], { date: "2026-10-31" })
	const { repo, visited } = await setup({ before: (r) => r.savePurchaseList(existing) })
	await typeAmount("A", "125")
	await click(document, "save-draft")
	expect(mergeAsk()).toContain("There is already a draft for")
	expect(await stored(repo)).toEqual([existing])
	expect(visited).toEqual([])
	await click(document, "merge")
	expect(await stored(repo)).toEqual([
		{
			...existing,
			lines: [
				{ cardId: "B", amount: 100 },
				{ cardId: "A", amount: 125_00 },
			],
		},
	])
	expect(visited).toEqual(["/transactions/lists?list=d0"])
})

test("Keep separate saves the draft on its own", async () => {
	const existing = draft("d0", ["B"], { date: "2026-10-31" })
	const { repo, visited } = await setup({ before: (r) => r.savePurchaseList(existing) })
	await typeAmount("A", "125")
	await click(document, "save-draft")
	await click(document, "keep-separate")
	expect((await stored(repo)).map((l) => l.id).sort()).toEqual(["d0", "l-new"])
	expect(visited).toEqual(["/transactions/lists?list=l-new"])
})

test("a reopened draft merges into the other same-day draft and goes", async () => {
	const { repo } = await setupDraft(async (r) => {
		await r.savePurchaseList(draft("d1", ["A"]))
		await r.savePurchaseList(draft("d2", ["B"]))
	})
	await click(document, "save-draft")
	await click(document, "merge")
	const lists = await stored(repo)
	expect(lists.map((l) => l.id)).toEqual(["d2"])
	expect(lists[0]?.lines.map((l) => l.cardId)).toEqual(["B", "A"])
})

test("marking sent on a day with a waiting list asks to add these orders to it", async () => {
	const waiting = { ...sent("w0", ["B"]), date: "2026-10-31" }
	const { repo, visited } = await setup({ before: (r) => r.savePurchaseList(waiting) })
	await typeAndReview({ A: "125" })
	await click(document, "mark-sent")
	expect(mergeAsk()).toContain("already waiting for the spender")
	await click(document, "merge")
	expect(await stored(repo)).toEqual([
		{
			...waiting,
			lines: [
				{ cardId: "B", amount: 100 },
				{ cardId: "A", amount: 125_00 },
			],
		},
	])
	expect(visited).toEqual(["/transactions/lists?list=w0"])
})

test("the merge question reads in Thai", async () => {
	await setup({ before: (r) => r.savePurchaseList(draft("d0", ["B"], { date: "2026-10-31" })) })
	await click(document, "save-draft")
	setLocale("th")
	await settle()
	expect(mergeAsk()).toContain("มีฉบับร่างของวันที่")
	expect(flatText($('[data-action="keep-separate"]'))).toBe("แยกไว้")
})

describe("the builder on its own addresses (RD-26)", () => {
	const fresh = (search: string, before?: (repo: Repository) => Promise<void>) =>
		setup({ search, ...(before ? { before } : {}) })
	const freshDraft = (before: (repo: Repository) => Promise<void>) =>
		setup({ mode: "draft", search: "?list=d1", before })

	test("a new list holds the cards in `cards`, each once, dropping cards that cannot take purchases", async () => {
		await fresh("?cards=B&cards=A&cards=B&cards=Z&card=A")
		expect(onList()).toEqual(["B", "A"])
		// ‹ goes back to the Lists tab, under which the builder lives.
		expect($('[data-action="back"]')?.getAttribute("href")).toBe("/transactions/lists")
	})

	test("adding or removing a card rewrites `cards` in place", async () => {
		const { now, entries } = await fresh("?cards=A")
		await add("B")
		expect(now()).toBe("/transactions/lists/new?cards=A&cards=B")
		await remove("A")
		expect(now()).toBe("/transactions/lists/new?cards=B")
		// The page's own entry holds the cards; the sheet's entries were stepped back over.
		expect(entries[0]).toBe("/transactions/lists/new?cards=B")
	})

	test("the add-a-card sheet is not in the address: opening pushes the same address, Back closes it", async () => {
		const { now, entries, back, pushOptions } = await fresh("?cards=A")
		await click(document, "add-card")
		expect($("dialog .tile")).not.toBeNull()
		expect(entries).toEqual(["?cards=A", "/transactions/lists/new?cards=A"])
		expect(pushOptions).toEqual([{ ownPage: true }])
		$('dialog .tile[data-card="B"]')?.click()
		await settle()
		expect(entries).toHaveLength(2)
		expect(now()).toBe("/transactions/lists/new?cards=A")
		back()
		await settle()
		expect($("dialog")).toBeNull()
		expect(onList()).toEqual(["A"])
	})

	test("Add to list closes the sheet by stepping back over its entry, and `cards` holds the card", async () => {
		const { now, entries } = await fresh("?cards=A")
		await add("B")
		expect($("dialog")).toBeNull()
		expect(onList()).toEqual(["A", "B"])
		expect(now()).toBe("/transactions/lists/new?cards=A&cards=B")
		expect(entries[0]).toBe("/transactions/lists/new?cards=A&cards=B")
	})

	test("an old address's sheet keys open nothing", async () => {
		await fresh("?cards=A&add=1&open=A")
		expect($("dialog")).toBeNull()
	})

	test("Save as draft leaves for the Lists tab with the new list open in its panel", async () => {
		const { repo, visited } = await fresh("?cards=A")
		await typeAmount("A", "125")
		await click(document, "save-draft")
		expect((await stored(repo)).map((l) => l.id)).toEqual(["l-new"])
		expect(visited).toEqual(["/transactions/lists?list=l-new"])
	})

	test("Mark as sent leaves the same way", async () => {
		const { visited } = await fresh("?cards=A")
		await typeAndReview({ A: "125" })
		await click(document, "mark-sent")
		expect(visited).toEqual(["/transactions/lists?list=l-new"])
	})

	test("a merged save opens the list it went into", async () => {
		const existing = draft("d0", ["B"], { date: "2026-10-31" })
		const { visited } = await fresh("?cards=A", (r) => r.savePurchaseList(existing))
		await typeAmount("A", "125")
		await click(document, "save-draft")
		await click(document, "merge")
		expect(visited).toEqual(["/transactions/lists?list=d0"])
	})

	test("a draft opens from `list`, keeps its address, and Delete leaves for the Lists tab", async () => {
		const { now, repo, visited } = await freshDraft(draftWith(["A"]))
		expect(onList()).toEqual(["A"])
		expect($("h1")?.textContent).toContain("Draft list")
		await add("B")
		expect(now()).toBe("?list=d1")
		await click(document, "delete-draft")
		expect(await stored(repo)).toEqual([])
		expect(visited).toEqual(["/transactions/lists"])
	})

	test("a draft's save opens it in its panel", async () => {
		const { visited } = await freshDraft(draftWith(["A"]))
		await click(document, "save-draft")
		expect(visited).toEqual(["/transactions/lists?list=d1"])
	})
})
