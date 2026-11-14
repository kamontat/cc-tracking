import type { ListLine, PurchaseList } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import ListReplyPage from "#components/organisms/ListReplyPage.svelte"
import { formatAmountInput } from "#lib/domain/money"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import {
	bannerText,
	card,
	cleanup,
	click,
	closeCard,
	draft,
	elsewhereLink,
	openCard,
	saved,
	settle,
	setupPage,
	stored,
	titleOf,
} from "./list-support"

/**
 * The spender's reply to a waiting list, at `/transactions/lists/edit?list=` (RD-26). Ported
 * from the legacy `reply-page` tests; where those dispatched the reply element's event, these
 * answer the real form.
 */
afterEach(cleanup)

const w1: PurchaseList = {
	id: "w1",
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T03:00:00.000Z",
	lines: [
		{ cardId: "A", amount: 12_500_00 },
		{ cardId: "B", amount: 4_800_00 },
		{ cardId: "C", amount: 22_000_00 },
	],
}

const withW1 = async (repo: Repository) => {
	await repo.saveCard(card("C"))
	await repo.savePurchaseList(w1)
}

const setup = (options: { repo?: Repository; search?: string; before?: (repo: Repository) => Promise<void> } = {}) =>
	setupPage(ListReplyPage, {
		...(options.repo ? { repo: options.repo } : {}),
		search: options.search ?? "?list=w1",
		before: options.before ?? withW1,
	})

const answers: ListLine[] = [
	{ cardId: "A", amount: 1250000, made: true, actual: 1300000 },
	{ cardId: "B", amount: 480000, made: false },
	{ cardId: "C", amount: 2200000, made: true },
]

/** Answers every line in its card's sheet as `lines` says, ticks or unticks the move, then saves. */
const sendReply = async (root: ParentNode, moveUnmade: boolean, lines: ListLine[] = answers) => {
	for (const line of lines) {
		const sheet = await openCard(line.cardId)
		sheet.querySelector<HTMLElement>(`[data-answer="${line.made ? "made" : "not-made"}"]`)?.click()
		await settle(2)
		if (line.made) {
			const input = sheet.querySelector<HTMLInputElement>('[data-field="actual"]')
			if (!input) throw new Error(`no amount for ${line.cardId}`)
			input.value = formatAmountInput(line.actual ?? line.amount)
			input.dispatchEvent(new Event("input", { bubbles: true }))
			await settle(2)
		}
		await closeCard()
	}
	const move = root.querySelector<HTMLInputElement>('[data-field="move"]')
	if (move && move.checked !== moveUnmade) {
		move.click()
		await settle(2)
	}
	await click(root, "save-reply")
}

const allPurchases = async (repo: Repository) =>
	(await Promise.all(["A", "B", "C"].map((id) => repo.listPurchases(id)))).flat()

test("a sent list opens the reply", async () => {
	const { root } = await setup()
	expect([...root.querySelectorAll(".line[data-card]")].map((el) => el.getAttribute("data-card"))).toEqual([
		"A",
		"B",
		"C",
	])
	expect(root.querySelector('.line[data-card="C"] .card-label')?.textContent).toBe("C) C card")
	const h1 = root.querySelector("h1")
	expect(titleOf(h1)).toBe("Spender's reply")
	expect(h1?.querySelector("small")?.textContent).toBe("List for Fri, 30 Oct")
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe("/transactions/lists")
})

test("saving the reply stores purchases, the draft and the saved list, then shows it", async () => {
	const { root, repo, visited } = await setup()
	await sendReply(root, true)
	const purchases = await allPurchases(repo)
	expect(purchases.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
		{ id: "w1-0", cardId: "A", date: "2026-10-30", amount: 13_000_00, note: "", addedAt: "2026-10-31T03:00:00.000Z" },
		{ id: "w1-1", cardId: "C", date: "2026-10-30", amount: 22_000_00, note: "", addedAt: "2026-10-31T03:00:00.000Z" },
	])
	const lists = await stored(repo)
	expect(lists.find((l) => l.id === "w1-2")).toEqual({
		id: "w1-2",
		date: "2026-10-31",
		status: "draft",
		lines: [{ cardId: "B", amount: 480000 }],
	})
	const savedList = lists.find((l) => l.id === "w1")
	expect(savedList?.status).toBe("saved")
	expect(savedList?.savedAt).toBe("2026-10-31T03:00:00.000Z")
	expect(savedList?.movedTo).toBe("w1-2")
	expect(savedList?.lines).toEqual(answers)
	expect(visited).toEqual(["/transactions/lists?list=w1"])
	expect(bannerText(root)).toBe("")
	// On its way out, the page keeps the reply rather than flash the list's new state.
	expect(root.querySelector('[data-action="save-reply"]')).not.toBeNull()
})

test("unticked, not-made lines are dropped", async () => {
	const { root, repo } = await setup()
	await sendReply(root, false)
	const lists = await stored(repo)
	expect(lists.map((l) => l.id)).toEqual(["w1"])
	expect(lists[0]?.status).toBe("saved")
	expect(lists[0]?.movedTo).toBeUndefined()
	expect(await allPurchases(repo)).toHaveLength(2)
})

test("a list already saved is refused", async () => {
	const { root, repo, visited } = await setup()
	await repo.savePurchaseList({
		...w1,
		status: "saved",
		savedAt: "2026-10-30T09:00:00.000Z",
		lines: w1.lines.map((line) => ({ ...line, made: true })),
	})
	await sendReply(root, true)
	expect(bannerText(root)).toContain("This list was already saved, so nothing was added again.")
	expect(await allPurchases(repo)).toEqual([])
	expect((await stored(repo)).map((l) => l.id)).toEqual(["w1"])
	expect(visited).toEqual([])
})

test("an unknown list says so and leads to the Lists tab", async () => {
	const { root } = await setup({ search: "?list=gone" })
	expect(root.textContent).toContain("This list no longer exists.")
	expect(root.querySelector('a[href="/transactions/lists"]:not([data-action])')).not.toBeNull()
	expect(root.querySelector(".line[data-card]")).toBeNull()
})

test("a saved list or a draft leads to where it is now", async () => {
	const done = await setup({ search: "?list=s1", before: (repo) => repo.savePurchaseList(saved("s1", ["A"])) })
	expect(done.root.querySelector(".line[data-card]")).toBeNull()
	expect(done.root.textContent).toContain("This list is already saved.")
	expect(elsewhereLink(done.root)).toBe("/transactions/lists?list=s1")

	const notSent = await setup({ search: "?list=d1", before: (repo) => repo.savePurchaseList(draft("d1", ["A"])) })
	expect(notSent.root.textContent).toContain("This list is a draft.")
	expect(elsewhereLink(notSent.root)).toBe("/transactions/lists/edit?list=d1")
})

/** A repository whose savePurchaseList rejects once, after `failNext` is set. */
class FlakyListRepository extends InMemoryRepository {
	failNext = false
	/** Rejects the next write of a saved list only, after any draft it moves is written. */
	failSaved = false
	override savePurchaseList(list: PurchaseList): Promise<void> {
		if (this.failNext || (this.failSaved && list.status === "saved")) {
			this.failNext = false
			this.failSaved = false
			return Promise.reject(new Error("disk is full"))
		}
		return super.savePurchaseList(list)
	}
}

const changed: ListLine[] = [
	{ cardId: "A", amount: 1250000, made: false },
	{ cardId: "B", amount: 480000, made: false },
	{ cardId: "C", amount: 2200000, made: true },
]

test("a retry with changed answers removes the draft a failed save moved", async () => {
	const repo = new FlakyListRepository()
	const { root } = await setup({ repo })
	repo.failSaved = true
	await sendReply(root, true)
	expect((await stored(repo)).map((l) => l.id).sort()).toEqual(["w1", "w1-2"])

	await sendReply(root, true, changed)
	const lists = await stored(repo)
	expect(lists.map((l) => l.id).sort()).toEqual(["w1", "w1-1"])
	expect(lists.find((l) => l.id === "w1-1")?.lines.map((l) => l.cardId)).toEqual(["A", "B"])
})

test("a retry without moving removes the draft a failed save moved", async () => {
	const repo = new FlakyListRepository()
	const { root } = await setup({
		repo,
		before: async (r) => {
			await withW1(r)
			// Another list's draft, by a name that only looks like ours.
			await r.savePurchaseList({
				id: "w1-2-0",
				date: "2026-11-01",
				status: "draft",
				lines: [{ cardId: "A", amount: 100 }],
			})
		},
	})
	repo.failSaved = true
	await sendReply(root, true)
	await sendReply(root, false)
	expect((await stored(repo)).map((l) => l.id).sort()).toEqual(["w1", "w1-2-0"])
})

test("a retry leaves alone purchases that are not this reply's", async () => {
	const repo = new FlakyListRepository()
	const { root } = await setup({
		repo,
		before: async (r) => {
			await withW1(r)
			const base = { cardId: "A", date: "2026-10-29", amount: 100, note: "", addedAt: "2026-10-29T03:00:00.000Z" }
			await r.savePurchase({ ...base, id: "6f1c2a4e-2b9d-4c11-9a8e-0d3f5b7c9e21" })
			// The purchase of a draft this list once moved (`w1-2`), saved since.
			await r.savePurchase({ ...base, id: "w1-2-0" })
		},
	})
	repo.failNext = true
	await sendReply(root, false)
	await sendReply(root, false, changed)
	expect((await repo.listPurchases("A")).map((p) => p.id).sort()).toEqual([
		"6f1c2a4e-2b9d-4c11-9a8e-0d3f5b7c9e21",
		"w1-2-0",
	])
})

test("a retry after a failed write adds nothing twice", async () => {
	const repo = new FlakyListRepository()
	const { root, visited } = await setup({ repo })
	repo.failNext = true
	await sendReply(root, false)
	expect(bannerText(root).startsWith("Could not save the reply.")).toBe(true)
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("sent")
	expect(root.querySelector(".line[data-card]")).not.toBeNull()
	expect(visited).toEqual([])

	await sendReply(root, false)
	expect((await allPurchases(repo)).map((p) => p.id).sort()).toEqual(["w1-0", "w1-1"])
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("saved")
	expect(visited).toEqual(["/transactions/lists?list=w1"])
})

test("a retry with changed answers leaves no stale purchase", async () => {
	const repo = new FlakyListRepository()
	const { root } = await setup({ repo })
	repo.failNext = true
	await sendReply(root, false)
	expect(await allPurchases(repo)).toHaveLength(2)

	await sendReply(root, false, changed)
	expect((await allPurchases(repo)).map((p) => [p.id, p.cardId])).toEqual([["w1-0", "C"]])
})

test("a waiting list offers Cancel list in the reply's side panel", async () => {
	const { root } = await setup()
	const button = root.querySelector('[data-action="cancel-list"]')
	expect(button?.getAttribute("data-variant")).toBe("danger")
	expect(button?.closest(".list-layout__side")).not.toBeNull()
	expect(button?.textContent?.trim()).toBe("Cancel list")
})

test("cancel list removes the waiting list at once, buys nothing and leaves for the Lists tab", async () => {
	const { root, repo, visited } = await setup({
		before: async (r) => {
			await withW1(r)
			await r.savePurchaseList(draft("d1", ["A"]))
		},
	})
	await click(root, "cancel-list")
	expect((await stored(repo)).map((l) => l.id)).toEqual(["d1"])
	expect(await allPurchases(repo)).toEqual([])
	expect(visited).toEqual(["/transactions/lists"])
})

test("a list saved meanwhile is not cancelled", async () => {
	const { root, repo, visited } = await setup()
	const done = { ...saved("w1", ["A"]) }
	await repo.savePurchaseList(done)
	await click(root, "cancel-list")
	expect(bannerText(root)).toContain("This list is no longer waiting for a reply, so it was not cancelled.")
	expect(await stored(repo)).toEqual([done])
	expect(visited).toEqual([])
})

test("an old `id` is not read", async () => {
	const { root } = await setup({ search: "?id=w1" })
	expect(root.querySelector(".line[data-card]")).toBeNull()
	expect(root.textContent).toContain("This list no longer exists.")
})

test("a card's sheet is in history: Back closes it, and Done steps back over it", async () => {
	const { root, now, back, entries, popOptions, pushOptions } = await setup()
	expect(popOptions).toEqual([{ ownPage: true }])
	await openCard("A")
	expect(pushOptions).toEqual([{ ownPage: true }])
	expect(entries).toEqual(["?list=w1", "/transactions/lists/edit?list=w1"])
	// The card before or after changes nothing in history.
	await click(root, "next-card")
	expect(entries).toHaveLength(2)
	back()
	await settle()
	expect(root.querySelector("dialog")).toBeNull()
	expect(now()).toBe("?list=w1")
	await openCard("B")
	await closeCard()
	expect(root.querySelector("dialog")).toBeNull()
	expect(now()).toBe("?list=w1")
})
