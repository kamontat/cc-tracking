import { expect, test } from "bun:test";
import type { Repository } from "#lib/storage/repository";
import {
	draft,
	elsewhereLink,
	flatText,
	sent,
	setupPage,
	titleOf,
} from "./test-support";
import { renderSavedPage } from "./view-page";

const setup = (search: string, before: (repo: Repository) => Promise<void>) =>
	setupPage(renderSavedPage, { search, before });

const s9 = (repo: Repository) =>
	repo.savePurchaseList({
		id: "s9",
		date: "2026-10-30",
		status: "saved",
		sentAt: "2026-10-30T03:00:00.000Z",
		savedAt: "2026-10-30T09:00:00.000Z",
		lines: [
			{ cardId: "A", amount: 12_500_00, made: true, actual: 13_000_00 },
			{ cardId: "B", amount: 4_800_00, made: false },
		],
	});

test("a saved list shows what was bought", async () => {
	const { root } = await setup("?id=s9", s9);
	const h1 = root.querySelector("h1");
	expect(titleOf(h1)).toBe("Fri, 30 Oct 2026");
	expect(h1?.querySelector("small")?.textContent).toBe("Purchase list · saved");
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe(
		"/",
	);
	expect(flatText(root.querySelector('p.note[data-tone="ok"]'))).toBe(
		"Saved 1 purchase, ฿13,000.00. It counts against the card's room now.",
	);
	const rowA = root.querySelector('[data-card="A"]');
	expect(flatText(rowA?.querySelector(".card-label"))).toBe("A) A card (1234)");
	expect(flatText(rowA)).toContain("฿13,000.00");
	expect(flatText(rowA)).toContain("planned ฿12,500.00");
	const rowB = root.querySelector('[data-card="B"]');
	expect(flatText(rowB?.querySelector(".tag"))).toBe("Not made");
	expect(flatText(rowB)).not.toContain("฿");
	expect(root.querySelector('[data-action="open-draft"]')).toBeNull();
	expect(root.querySelector("cc-list-reply")).toBeNull();
	expect(root.querySelector("button")).toBeNull();
});

test("a saved list that moved lines links to their draft", async () => {
	const { root } = await setup("?id=w1", async (repo) => {
		await repo.saveCard({
			id: "C",
			name: "C card",
			last4: "1234",
			location: "krabi",
			cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
			archived: false,
			limitGroupId: "g1",
		});
		await repo.savePurchaseList({
			id: "w1",
			date: "2026-10-30",
			status: "saved",
			sentAt: "2026-10-30T03:00:00.000Z",
			savedAt: "2026-10-31T03:00:00.000Z",
			movedTo: "w1-2",
			lines: [
				{ cardId: "A", amount: 1250000, made: true, actual: 1300000 },
				{ cardId: "B", amount: 480000, made: false },
				{ cardId: "C", amount: 2200000, made: true },
			],
		});
	});
	expect(flatText(root.querySelector('p.note[data-tone="ok"]'))).toContain(
		"Saved 2 purchases, ฿35,000.00.",
	);
	const link = root.querySelector('[data-action="open-draft"]');
	// The summary and the draft's link sit in the side panel, the rows in the main column.
	const side = root.querySelector(".list-layout > .list-layout__side");
	expect(side?.contains(link)).toBe(true);
	expect(side?.querySelector('p.note[data-tone="ok"]')).toBeInstanceOf(
		HTMLElement,
	);
	expect(
		root.querySelector(".list-layout > .list-layout__main > .saved-lines"),
	).toBeInstanceOf(HTMLElement);
	expect(link?.getAttribute("href")).toBe("/list/draft?id=w1-2");
	expect(flatText(link)).toContain("B moved to a draft for Sat, 31 Oct");
	expect(link?.querySelector("small")?.textContent).toBe(
		"Open it when you're ready to send",
	);
});

test("an unknown list says so and leads home", async () => {
	const { root } = await setup("?id=gone", async () => {});
	expect(root.textContent).toContain("This list no longer exists.");
	expect(root.querySelector('a[href="/"]:not([data-action])')).not.toBeNull();
	expect(root.querySelector(".saved-lines")).toBeNull();
});

test("a list not yet saved leads to its own page", async () => {
	const waiting = await setup("?id=w1", (repo) =>
		repo.savePurchaseList(sent("w1", ["A"])),
	);
	expect(waiting.root.querySelector(".saved-lines")).toBeNull();
	expect(elsewhereLink(waiting.root)).toBe("/list/reply?id=w1");

	const notSent = await setup("?id=d1", (repo) =>
		repo.savePurchaseList(draft("d1", ["A"])),
	);
	expect(elsewhereLink(notSent.root)).toBe("/list/draft?id=d1");
});
