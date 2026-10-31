import { expect, test } from "bun:test";
import type { CcListAmounts } from "#components/cc-list-amounts";
import type { CcListReply } from "#components/cc-list-reply";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	exportBackupV3,
	importBackupV3,
	parseAnyBackup,
} from "#lib/storage/transfer-v3";
import { renderEntryPage } from "./entry";
import { renderReplyPage } from "./reply-page";
import { click, settle, setupPage, stored } from "./test-support";
import { renderSavedPage } from "./view-page";

/** Types into a field inside a list element's shadow root, by line and field. */
const typeInto = async (
	element: CcListAmounts | CcListReply,
	cardId: string,
	field: string,
	text: string,
) => {
	await element.updateComplete;
	const input = element.shadowRoot?.querySelector<HTMLInputElement>(
		`section.line[data-card="${cardId}"] [data-field="${field}"]`,
	);
	if (!input) throw new Error(`no ${field} for ${cardId}`);
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	await element.updateComplete;
};

const pressIn = async (element: Element, selector: string) => {
	const button = element.shadowRoot?.querySelector<HTMLElement>(selector);
	if (!button) throw new Error(`no ${selector}`);
	button.click();
	await settle();
};

const entryPage = (repo: Repository, mode: "new" | "draft", search: string) =>
	setupPage(
		(r, root, options) =>
			renderEntryPage(r, root, mode, {
				...options,
				newId: () => "l1",
				replaceAddress: () => {},
				share: {},
			}),
		{ repo, search },
	);

const amountsOf = (root: HTMLElement) => {
	const element = root.querySelector<CcListAmounts>("cc-list-amounts");
	if (!element) throw new Error("no cc-list-amounts");
	return element;
};

test("a line's note goes from Enter amounts through Review, the send and the reply into its purchase", async () => {
	const repo = new InMemoryRepository();

	// Enter amounts: a note under each amount, kept through Review and back and a language switch.
	const entry = await entryPage(repo, "new", "?card=A&card=B");
	await typeInto(amountsOf(entry.root), "A", "amount", "125");
	await typeInto(amountsOf(entry.root), "A", "note", "  van fuel ");
	await typeInto(amountsOf(entry.root), "B", "amount", "50");
	await typeInto(amountsOf(entry.root), "B", "note", "stamps");
	setLocale("th");
	await settle();
	setLocale("en");
	await settle();
	await pressIn(amountsOf(entry.root), '[data-action="review"]');
	await click(entry.root, "back");
	const back = amountsOf(entry.root);
	await back.updateComplete;
	expect(
		back.shadowRoot?.querySelector<HTMLInputElement>(
			'section.line[data-card="A"] [data-field="note"]',
		)?.value,
	).toBe("  van fuel ");
	await pressIn(back, '[data-action="review"]');
	await click(entry.root, "mark-sent");
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 125_00, note: "van fuel" },
		{ cardId: "B", amount: 50_00, note: "stamps" },
	]);

	// The reply shows each note and lets it change; B is not made and moves to a draft.
	const replyPage = await setupPage(renderReplyPage, {
		repo,
		search: "?id=l1",
	});
	const reply = replyPage.root.querySelector<CcListReply>("cc-list-reply");
	if (!reply) throw new Error("no cc-list-reply");
	await reply.updateComplete;
	await pressIn(reply, 'section.line[data-card="A"] [data-answer="made"]');
	await pressIn(reply, 'section.line[data-card="B"] [data-answer="not-made"]');
	await typeInto(reply, "A", "note", "diesel for the van");
	await pressIn(reply, '[data-action="save-reply"]');
	expect(replyPage.visited).toEqual(["/list/view?id=l1"]);

	const purchases = await repo.listPurchases("A");
	expect(purchases.map((p) => p.note)).toEqual(["diesel for the van"]);
	const lists = await stored(repo);
	const moved = lists.find((l) => l.status === "draft");
	expect(moved?.lines).toEqual([
		{ cardId: "B", amount: 50_00, note: "stamps" },
	]);

	// The saved view shows the note.
	const view = await setupPage(renderSavedPage, { repo, search: "?id=l1" });
	expect(
		view.root.querySelector('[data-card="A"] .line-note')?.textContent?.trim(),
	).toBe("diesel for the van");

	// The moved draft reopens with its note, and saving it again keeps it.
	const draftPage = await entryPage(repo, "draft", `?id=${moved?.id}`);
	const draftAmounts = amountsOf(draftPage.root);
	await draftAmounts.updateComplete;
	expect(draftAmounts.notes).toEqual({ B: "stamps" });
	await pressIn(draftAmounts, '[data-action="review"]');
	await click(draftPage.root, "save-draft");
	expect((await stored(repo)).find((l) => l.id === moved?.id)?.lines).toEqual([
		{ cardId: "B", amount: 50_00, note: "stamps" },
	]);

	// A backup carries the notes on list lines.
	const copy = new InMemoryRepository();
	await importBackupV3(
		copy,
		parseAnyBackup(JSON.stringify(await exportBackupV3(repo, new Date()))),
	);
	expect(
		(await copy.listPurchaseLists()).find((l) => l.id === "l1")?.lines,
	).toEqual([
		{ cardId: "A", amount: 125_00, made: true, note: "diesel for the van" },
		{ cardId: "B", amount: 50_00, made: false, note: "stamps" },
	]);
});
