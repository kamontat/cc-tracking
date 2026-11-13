import { afterEach, expect, test } from "vitest"

import ListEntryPage from "#components/organisms/ListEntryPage.svelte"
import ListReplyPage from "#components/organisms/ListReplyPage.svelte"
import ListViewPage from "#components/organisms/ListViewPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { type BackupV3, exportBackupV3, importBackupV3, parseAnyBackup } from "#lib/storage/transfer-v3"
import { cleanup, click, closeCard, fieldsOf, settle, setupPage, stored, typeField } from "./list-support"

/** A line's note across every list page and a backup. Ported from the legacy `note-flow` test. */
afterEach(cleanup)

/** Types into a field of a reply's line, by card and field. */
const typeInto = async (cardId: string, field: string, text: string) => {
	const input = document.querySelector<HTMLInputElement>(`section.line[data-card="${cardId}"] [data-field="${field}"]`)
	if (!input) throw new Error(`no ${field} for ${cardId}`)
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const press = async (selector: string) => {
	const button = document.querySelector<HTMLElement>(selector)
	if (!button) throw new Error(`no ${selector}`)
	button.click()
	await settle()
}

/**
 * The backup's text with the seeded cards A, B and Z renamed 1, 2 and 9, since restore refuses
 * an id outside the card id form (RD-28).
 */
const restorable = (backup: BackupV3): string => {
	const renamed: Record<string, string> = { A: "1", B: "2", Z: "9" }
	const id = (cardId: string) => renamed[cardId] ?? cardId
	return JSON.stringify({
		...backup,
		cards: backup.cards.map((card) => ({ ...card, id: id(card.id) })),
		purchases: backup.purchases.map((purchase) => ({ ...purchase, cardId: id(purchase.cardId) })),
		payments: backup.payments.map((payment) => ({ ...payment, cardId: id(payment.cardId) })),
		statementDates: backup.statementDates.map((dates) => ({ ...dates, cardId: id(dates.cardId) })),
		lists: backup.lists.map((list) => ({
			...list,
			lines: list.lines.map((line) => ({ ...line, cardId: id(line.cardId) })),
		})),
	})
}

const entryPage = (repo: Repository, mode: "new" | "draft", search: string) =>
	setupPage(ListEntryPage, { repo, search, props: { mode, newId: () => "l1", share: {} } })

test("a line's note goes from Enter amounts through Review, the send and the reply into its purchase", async () => {
	const repo = new InMemoryRepository()

	// Enter amounts: a note under each amount, kept through Review and back and a language switch.
	const entry = await entryPage(repo, "new", "?cards=A&cards=B")
	await typeField("A", "amount", "125")
	await typeField("A", "note", "  van fuel ")
	await typeField("B", "amount", "50")
	await typeField("B", "note", "stamps")
	setLocale("th")
	await settle()
	setLocale("en")
	await settle()
	await press('[data-action="review"]')
	await click(entry.root, "back")
	expect(await fieldsOf("A", "note")).toEqual(["  van fuel "])
	await closeCard()
	await press('[data-action="review"]')
	await click(entry.root, "mark-sent")
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 125_00, note: "van fuel" },
		{ cardId: "B", amount: 50_00, note: "stamps" },
	])

	// The reply shows each note and lets it change; B is not made and moves to a draft.
	const replyPage = await setupPage(ListReplyPage, { repo, search: "?list=l1" })
	await press('section.line[data-card="A"] [data-answer="made"]')
	await press('section.line[data-card="B"] [data-answer="not-made"]')
	await typeInto("A", "note", "diesel for the van")
	await press('[data-action="save-reply"]')
	expect(replyPage.visited).toEqual(["/transactions/lists?list=l1"])

	expect((await repo.listPurchases("A")).map((p) => p.note)).toEqual(["diesel for the van"])
	const moved = (await stored(repo)).find((l) => l.status === "draft")
	expect(moved?.lines).toEqual([{ cardId: "B", amount: 50_00, note: "stamps" }])

	// The saved view shows the note.
	await setupPage(ListViewPage, { repo, search: "?id=l1" })
	expect(document.querySelector('[data-card="A"] .line-note')?.textContent?.trim()).toBe("diesel for the van")

	// The moved draft reopens with its note, and saving it again keeps it.
	await setupPage(ListEntryPage, {
		repo,
		search: `?list=${moved?.id}`,
		props: { mode: "draft", share: {} },
	})
	expect(await fieldsOf("B", "note")).toEqual(["stamps"])
	await closeCard()
	await click(document, "save-draft")
	expect((await stored(repo)).find((l) => l.id === moved?.id)?.lines).toEqual([
		{ cardId: "B", amount: 50_00, note: "stamps" },
	])

	// A backup carries the notes on list lines.
	const copy = new InMemoryRepository()
	await importBackupV3(copy, parseAnyBackup(restorable(await exportBackupV3(repo, new Date()))))
	expect((await copy.listPurchaseLists()).find((l) => l.id === "l1")?.lines).toEqual([
		{ cardId: "1", amount: 125_00, made: true, note: "diesel for the van" },
		{ cardId: "2", amount: 50_00, made: false, note: "stamps" },
	])
})
