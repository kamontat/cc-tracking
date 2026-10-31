import { expect, test } from "bun:test";
import type { CcListReply } from "#components/cc-list-reply";
import type { ListLine, PurchaseList } from "#lib/domain/types";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { renderReplyPage } from "./reply-page";
import {
	bannerText,
	card,
	draft,
	elsewhereLink,
	saved,
	settle,
	setupPage,
	stored,
	titleOf,
} from "./test-support";

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
};

const withW1 = async (repo: Repository) => {
	await repo.saveCard(card("C"));
	await repo.savePurchaseList(w1);
};

const setup = (
	options: {
		repo?: Repository;
		search?: string;
		before?: (repo: Repository) => Promise<void>;
	} = {},
) =>
	setupPage(renderReplyPage, {
		repo: options.repo,
		search: options.search ?? "?id=w1",
		before: options.before ?? withW1,
	});

const answers: ListLine[] = [
	{ cardId: "A", amount: 1250000, made: true, actual: 1300000 },
	{ cardId: "B", amount: 480000, made: false },
	{ cardId: "C", amount: 2200000, made: true },
];

const reply = async (root: HTMLElement): Promise<CcListReply> => {
	const element = root.querySelector<CcListReply>("cc-list-reply");
	if (!element) throw new Error("no cc-list-reply");
	await element.updateComplete;
	return element;
};

const sendReply = async (
	root: HTMLElement,
	moveUnmade: boolean,
	lines: ListLine[] = answers,
) => {
	(await reply(root)).dispatchEvent(
		new CustomEvent("save-reply", {
			detail: { lines, moveUnmade },
			bubbles: true,
			composed: true,
		}),
	);
	await settle();
};

const allPurchases = async (repo: Repository) =>
	(
		await Promise.all(["A", "B", "C"].map((id) => repo.listPurchases(id)))
	).flat();

test("a sent list opens the reply", async () => {
	const { root } = await setup();
	const element = await reply(root);
	expect(element.list.id).toBe("w1");
	expect(element.cards.map((c) => c.id)).toContain("C");
	const h1 = root.querySelector("h1");
	expect(titleOf(h1)).toBe("Spender's reply");
	expect(h1?.querySelector("small")?.textContent).toBe("List for Fri, 30 Oct");
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe(
		"/",
	);
});

test("saving the reply stores purchases, the draft and the saved list, then shows it", async () => {
	const { root, repo, visited } = await setup();
	await sendReply(root, true);
	const purchases = await allPurchases(repo);
	expect(purchases.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
		{
			id: "w1-0",
			cardId: "A",
			date: "2026-10-30",
			amount: 13_000_00,
			note: "",
			addedAt: "2026-10-31T03:00:00.000Z",
		},
		{
			id: "w1-1",
			cardId: "C",
			date: "2026-10-30",
			amount: 22_000_00,
			note: "",
			addedAt: "2026-10-31T03:00:00.000Z",
		},
	]);
	const lists = await stored(repo);
	expect(lists.find((l) => l.id === "w1-2")).toEqual({
		id: "w1-2",
		date: "2026-10-31",
		status: "draft",
		lines: [{ cardId: "B", amount: 480000 }],
	});
	const savedList = lists.find((l) => l.id === "w1");
	expect(savedList?.status).toBe("saved");
	expect(savedList?.savedAt).toBe("2026-10-31T03:00:00.000Z");
	expect(savedList?.movedTo).toBe("w1-2");
	expect(savedList?.lines).toEqual(answers);
	expect(visited).toEqual(["/list/view?id=w1"]);
	expect(bannerText(root)).toBe("");
});

test("unticked, not-made lines are dropped", async () => {
	const { root, repo } = await setup();
	await sendReply(root, false);
	const lists = await stored(repo);
	expect(lists.map((l) => l.id)).toEqual(["w1"]);
	expect(lists[0]?.status).toBe("saved");
	expect(lists[0]?.movedTo).toBeUndefined();
	expect(await allPurchases(repo)).toHaveLength(2);
});

test("a list already saved is refused", async () => {
	const { root, repo, visited } = await setup();
	await reply(root);
	await repo.savePurchaseList({
		...w1,
		status: "saved",
		savedAt: "2026-10-30T09:00:00.000Z",
		lines: w1.lines.map((line) => ({ ...line, made: true })),
	});
	await sendReply(root, true);
	expect(bannerText(root)).toContain(
		"This list was already saved, so nothing was added again.",
	);
	expect(await allPurchases(repo)).toEqual([]);
	expect((await stored(repo)).map((l) => l.id)).toEqual(["w1"]);
	expect(visited).toEqual([]);
});

test("an unknown list says so and leads home", async () => {
	const { root } = await setup({ search: "?id=gone" });
	expect(root.textContent).toContain("This list no longer exists.");
	expect(root.querySelector('a[href="/"]:not([data-action])')).not.toBeNull();
	expect(root.querySelector("cc-list-reply")).toBeNull();
});

test("a saved list or a draft leads to its own page", async () => {
	const done = await setup({
		search: "?id=s1",
		before: (repo) => repo.savePurchaseList(saved("s1", ["A"])),
	});
	expect(done.root.querySelector("cc-list-reply")).toBeNull();
	expect(done.root.textContent).toContain("This list is already saved.");
	expect(elsewhereLink(done.root)).toBe("/list/view?id=s1");

	const notSent = await setup({
		search: "?id=d1",
		before: (repo) => repo.savePurchaseList(draft("d1", ["A"])),
	});
	expect(notSent.root.textContent).toContain("This list is a draft.");
	expect(elsewhereLink(notSent.root)).toBe("/list/draft?id=d1");
});

/** A repository whose savePurchaseList rejects once, after `failNext` is set. */
class FlakyListRepository extends InMemoryRepository {
	failNext = false;
	/** Rejects the next write of a saved list only, after any draft it moves is written. */
	failSaved = false;
	override savePurchaseList(list: PurchaseList): Promise<void> {
		if (this.failNext || (this.failSaved && list.status === "saved")) {
			this.failNext = false;
			this.failSaved = false;
			return Promise.reject(new Error("disk is full"));
		}
		return super.savePurchaseList(list);
	}
}

test("a retry with changed answers removes the draft a failed save moved", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({ repo });
	repo.failSaved = true;
	await sendReply(root, true);
	expect((await stored(repo)).map((l) => l.id).sort()).toEqual(["w1", "w1-2"]);

	await sendReply(root, true, [
		{ cardId: "A", amount: 1250000, made: false },
		{ cardId: "B", amount: 480000, made: false },
		{ cardId: "C", amount: 2200000, made: true },
	]);
	const lists = await stored(repo);
	expect(lists.map((l) => l.id).sort()).toEqual(["w1", "w1-1"]);
	expect(
		lists.find((l) => l.id === "w1-1")?.lines.map((l) => l.cardId),
	).toEqual(["A", "B"]);
});

test("a retry without moving removes the draft a failed save moved", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({
		repo,
		before: async (repo) => {
			await withW1(repo);
			// Another list's draft, by a name that only looks like ours.
			await repo.savePurchaseList({
				id: "w1-2-0",
				date: "2026-11-01",
				status: "draft",
				lines: [{ cardId: "A", amount: 100 }],
			});
		},
	});
	repo.failSaved = true;
	await sendReply(root, true);
	await sendReply(root, false);
	expect((await stored(repo)).map((l) => l.id).sort()).toEqual([
		"w1",
		"w1-2-0",
	]);
});

test("a retry leaves alone purchases that are not this reply's", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({
		repo,
		before: async (repo) => {
			await withW1(repo);
			const base = {
				cardId: "A",
				date: "2026-10-29",
				amount: 100,
				note: "",
				addedAt: "2026-10-29T03:00:00.000Z",
			};
			await repo.savePurchase({
				...base,
				id: "6f1c2a4e-2b9d-4c11-9a8e-0d3f5b7c9e21",
			});
			// The purchase of a draft this list once moved (`w1-2`), saved since.
			await repo.savePurchase({ ...base, id: "w1-2-0" });
		},
	});
	repo.failNext = true;
	await sendReply(root, false);
	await sendReply(root, false, [
		{ cardId: "A", amount: 1250000, made: false },
		{ cardId: "B", amount: 480000, made: false },
		{ cardId: "C", amount: 2200000, made: true },
	]);
	expect((await repo.listPurchases("A")).map((p) => p.id).sort()).toEqual([
		"6f1c2a4e-2b9d-4c11-9a8e-0d3f5b7c9e21",
		"w1-2-0",
	]);
});

test("a retry after a failed write adds nothing twice", async () => {
	const repo = new FlakyListRepository();
	const { root, visited } = await setup({ repo });
	repo.failNext = true;
	await sendReply(root, false);
	expect(bannerText(root).startsWith("Could not save the reply.")).toBe(true);
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("sent");
	expect(root.querySelector("cc-list-reply")).not.toBeNull();
	expect(visited).toEqual([]);

	await sendReply(root, false);
	const ids = (await allPurchases(repo)).map((p) => p.id).sort();
	expect(ids).toEqual(["w1-0", "w1-1"]);
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("saved");
	expect(visited).toEqual(["/list/view?id=w1"]);
});

test("a retry with changed answers leaves no stale purchase", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({ repo });
	repo.failNext = true;
	await sendReply(root, false);
	expect(await allPurchases(repo)).toHaveLength(2);

	await sendReply(root, false, [
		{ cardId: "A", amount: 1250000, made: false },
		{ cardId: "B", amount: 480000, made: false },
		{ cardId: "C", amount: 2200000, made: true },
	]);
	const purchases = await allPurchases(repo);
	expect(purchases.map((p) => [p.id, p.cardId])).toEqual([["w1-0", "C"]]);
});
