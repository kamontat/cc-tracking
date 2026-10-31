import { expect, spyOn, test } from "bun:test";
import type { CcErrorBanner } from "#components/cc-error-banner";
import type { CcListAmounts } from "#components/cc-list-amounts";
import type { CcListReply } from "#components/cc-list-reply";
import type { Card, ListLine, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	type ShareApi,
	type ShareTable,
	shareTable,
	shareText,
} from "#lib/ui/list-share";
import { type ListPageOptions, renderListPage } from "./list";

const settle = (ms = 0) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `${id} card`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 });
	await repo.saveCard(card("A"));
	await repo.saveCard(card("B"));
	await repo.saveCard(card("Z", { archived: true }));
	await repo.saveSettings({ purchaseLocations: ["krabi"] });
};

type Calls = { copy: string[]; saveImage: [ShareTable, string][] };

const recordingShare = (calls: Calls): ShareApi => ({
	copy: async (text) => {
		calls.copy.push(text);
	},
	saveImage: async (table, filename) => {
		calls.saveImage.push([table, filename]);
		return "saved";
	},
});

const setup = async (
	options: {
		repo?: Repository;
		search?: string;
		share?: ShareApi;
		before?: (repo: Repository) => Promise<void>;
	} = {},
) => {
	setLocale("en");
	const repo = options.repo ?? new InMemoryRepository();
	await seed(repo);
	await options.before?.(repo);
	const root = mount();
	const visited: string[] = [];
	const calls: Calls = { copy: [], saveImage: [] };
	const pageOptions: ListPageOptions = {
		clock: () => new Date("2026-10-31T03:00:00Z"),
		search: options.search ?? "?card=A",
		navigate: (url) => visited.push(url),
		share: options.share ?? recordingShare(calls),
		newId: () => "l-new",
	};
	renderListPage(repo, root, pageOptions);
	await settle();
	return { root, repo, visited, calls };
};

const amounts = async (root: HTMLElement): Promise<CcListAmounts> => {
	const element = root.querySelector<CcListAmounts>("cc-list-amounts");
	if (!element) throw new Error("no cc-list-amounts");
	await element.updateComplete;
	return element;
};

const fire = async (root: HTMLElement, name: string, detail: unknown) => {
	(await amounts(root)).dispatchEvent(
		new CustomEvent(name, { detail, bubbles: true, composed: true }),
	);
	await settle();
};

const typeAndReview = async (
	root: HTMLElement,
	entries: Record<string, string>,
	lines: ListLine[],
	date = "2026-10-31",
) => {
	await fire(root, "entry-change", { date, entries });
	await fire(root, "review", { date, lines });
};

const click = async (root: HTMLElement, action: string) => {
	const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`);
	if (!button) throw new Error(`no ${action}`);
	button.click();
	await settle();
};

const stored = async (repo: Repository): Promise<PurchaseList[]> =>
	repo.listPurchaseLists();

const statusText = (root: HTMLElement) =>
	root.querySelector('p.status[role="status"]')?.textContent?.trim() ?? "";

test("a new list opens with the picked cards and today", async () => {
	const { root } = await setup({ search: "?card=B&card=A&card=Z&card=nope" });
	const element = await amounts(root);
	expect(element.cards.map((c) => c.id)).toEqual(["B", "A"]);
	expect(element.date).toBe("2026-10-31");
	expect(root.querySelector("h1")?.textContent).toContain("New purchase list");
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe(
		"/",
	);
});

test("review shows the table and comes back with everything typed", async () => {
	const { root } = await setup();
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	expect(root.querySelector("cc-list-table")).not.toBeNull();
	expect(root.querySelector("cc-list-amounts")).toBeNull();
	expect(root.querySelector("h1")?.textContent).toContain("Review list");

	await click(root, "back");
	expect((await amounts(root)).entries["A"]).toBe("125");
});

test("mark as sent stores a waiting list and goes home", async () => {
	const { root, repo, visited } = await setup();
	const lines = [{ cardId: "A", amount: 125_00 }];
	await typeAndReview(root, { A: "125" }, lines);
	await click(root, "mark-sent");
	expect(await stored(repo)).toEqual([
		{
			id: "l-new",
			date: "2026-10-31",
			status: "sent",
			sentAt: "2026-10-31T03:00:00.000Z",
			lines,
		},
	]);
	expect(visited).toEqual(["/"]);
});

test("save as draft stores a draft", async () => {
	const { root, repo, visited } = await setup();
	const lines = [{ cardId: "A", amount: 125_00 }];
	await typeAndReview(root, { A: "125" }, lines);
	await click(root, "save-draft");
	const lists = await stored(repo);
	expect(lists).toEqual([
		{ id: "l-new", date: "2026-10-31", status: "draft", lines },
	]);
	expect(lists[0]?.sentAt).toBeUndefined();
	expect(visited).toEqual(["/"]);
});

test("lines come only from the cards still on the list", async () => {
	const { root, repo } = await setup({ search: "?card=A&card=B" });
	await fire(root, "entry-change", {
		date: "2026-10-31",
		entries: { A: "125", B: "50" },
	});
	await fire(root, "remove", { cardId: "B" });
	expect((await amounts(root)).cards.map((c) => c.id)).toEqual(["A"]);
	await fire(root, "review", {
		date: "2026-10-31",
		lines: [{ cardId: "A", amount: 125_00 }],
	});
	await click(root, "mark-sent");
	expect((await stored(repo))[0]?.lines).toEqual([
		{ cardId: "A", amount: 125_00 },
	]);
});

test("add puts a ready card on the list", async () => {
	const { root } = await setup();
	expect((await amounts(root)).candidates.map((c) => c.id)).toEqual(["B"]);
	await fire(root, "add", { cardId: "B" });
	const element = await amounts(root);
	expect(element.cards.map((c) => c.id)).toEqual(["A", "B"]);
	expect(element.candidates).toEqual([]);
});

test("a draft opens into enter amounts and keeps its id", async () => {
	const { root, repo } = await setup({
		search: "?id=d1",
		before: (repo) =>
			repo.savePurchaseList({
				id: "d1",
				date: "2026-11-02",
				status: "draft",
				lines: [
					{ cardId: "A", amount: 12_345_00 },
					{ cardId: "Z", amount: 100 },
				],
			}),
	});
	const element = await amounts(root);
	expect(element.cards.map((c) => c.id)).toEqual(["A"]);
	expect(element.entries).toEqual({ A: "12345" });
	expect(element.date).toBe("2026-11-02");
	expect(root.querySelector("h1")?.textContent).toContain("Draft list");

	await fire(root, "review", {
		date: "2026-11-02",
		lines: [{ cardId: "A", amount: 12_345_00 }],
	});
	await click(root, "mark-sent");
	const lists = await stored(repo);
	expect(lists).toHaveLength(1);
	expect(lists[0]?.id).toBe("d1");
	expect(lists[0]?.status).toBe("sent");
	expect(lists[0]?.date).toBe("2026-11-02");
	expect(lists[0]?.lines).toEqual([{ cardId: "A", amount: 12_345_00 }]);
});

const draftWith = (cardIds: string[]) => (repo: Repository) =>
	repo.savePurchaseList({
		id: "d1",
		date: "2026-11-02",
		status: "draft",
		lines: cardIds.map((cardId) => ({ cardId, amount: 100 })),
	});

const droppedNote = (root: HTMLElement) =>
	flatText(root.querySelector("p.note[data-dropped]"));

test("a reopened draft says which cards were left out and why", async () => {
	const one = await setup({ search: "?id=d1", before: draftWith(["A", "Z"]) });
	expect(droppedNote(one.root)).toBe(
		"Z can no longer take purchases and was left out.",
	);

	const two = await setup({
		search: "?id=d1",
		before: async (repo) => {
			await repo.saveCard(card("Y", { archived: true }));
			await draftWith(["A", "Z", "Y"])(repo);
		},
	});
	expect(droppedNote(two.root)).toBe(
		"Z, Y can no longer take purchases and were left out.",
	);

	const none = await setup({ search: "?id=d1", before: draftWith(["A"]) });
	expect(none.root.querySelector("p.note[data-dropped]")).toBeNull();
});

test("a draft sent or saved elsewhere is not saved over", async () => {
	for (const action of ["mark-sent", "save-draft"]) {
		const { root, repo, visited } = await setup({
			search: "?id=d1",
			before: draftWith(["A"]),
		});
		await fire(root, "review", {
			date: "2026-11-02",
			lines: [{ cardId: "A", amount: 100 }],
		});
		const elsewhere: PurchaseList = {
			id: "d1",
			date: "2026-11-02",
			status: "sent",
			sentAt: "2026-10-31T01:00:00.000Z",
			lines: [{ cardId: "A", amount: 999 }],
		};
		await repo.savePurchaseList(elsewhere);
		await click(root, action);
		expect(bannerText(root)).toContain(
			"This list was sent or saved elsewhere, so it was not changed.",
		);
		expect(await stored(repo)).toEqual([elsewhere]);
		expect(visited).toEqual([]);
		expect(root.querySelector("cc-list-table")).not.toBeNull();
	}
});

test("a saved list replaces the page in history", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	await seed(repo);
	const root = mount();
	const replaced: string[] = [];
	const assigned: string[] = [];
	const replace = spyOn(location, "replace").mockImplementation((url) => {
		replaced.push(String(url));
	});
	const assign = spyOn(location, "assign").mockImplementation((url) => {
		assigned.push(String(url));
	});
	try {
		renderListPage(repo, root, {
			clock: () => new Date("2026-10-31T03:00:00Z"),
			search: "?card=A",
			share: {},
			newId: () => "l-new",
		});
		await settle();
		await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
		await click(root, "save-draft");
		expect(replaced).toEqual(["/"]);
		expect(assigned).toEqual([]);
	} finally {
		replace.mockRestore();
		assign.mockRestore();
	}
});

test("a sent list holds room on a new list", async () => {
	const { root } = await setup({
		before: (repo) =>
			repo.savePurchaseList({
				id: "s1",
				date: "2026-10-30",
				status: "sent",
				sentAt: "2026-10-30T03:00:00.000Z",
				lines: [{ cardId: "A", amount: 10_000_00 }],
			}),
	});
	expect((await amounts(root)).rooms.get("A")?.held).toBe(10_000_00);
});

test("copy text copies the table", async () => {
	const { root, calls } = await setup();
	const lines = [{ cardId: "A", amount: 125_00 }];
	await typeAndReview(root, { A: "125" }, lines);
	await click(root, "copy");
	const repoCards = [card("A"), card("B"), card("Z", { archived: true })];
	expect(calls.copy).toEqual([
		shareText(shareTable({ date: "2026-10-31", lines }, repoCards)),
	]);
	expect(statusText(root)).toBe(
		"Copied. Paste it into the chat with the spender.",
	);
});

test("copy and save image are offered only when the browser can", async () => {
	const { root } = await setup({ share: {} });
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	expect(root.querySelector("cc-list-table")).not.toBeNull();
	expect(root.querySelector('[data-action="copy"]')).toBeNull();
	expect(root.querySelector('[data-action="save-image"]')).toBeNull();
});

test("a failed copy says so", async () => {
	const { root } = await setup({
		share: { copy: () => Promise.reject(new Error("denied")) },
	});
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	await click(root, "copy");
	expect(statusText(root)).toBe("Could not copy the text.");
});

test("save image is named by date and failure is said", async () => {
	const { root, calls } = await setup();
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	await click(root, "save-image");
	expect(calls.saveImage.map(([, name]) => name)).toEqual([
		"purchase-list-2026-10-31.png",
	]);
	expect(calls.saveImage[0]?.[0].rows).toHaveLength(1);
	expect(statusText(root)).toBe(
		"Image saved. Send it in the chat with the spender.",
	);

	const failing = await setup({
		share: {
			saveImage: () =>
				Promise.reject(new MessageError("purchaseList.error.image")),
		},
	});
	await typeAndReview(failing.root, { A: "125" }, [
		{ cardId: "A", amount: 125_00 },
	]);
	await click(failing.root, "save-image");
	expect(statusText(failing.root)).toBe(
		"Could not save the image. Use Copy text instead.",
	);
});

test("a shared image says so, and a cancelled share says nothing", async () => {
	const shared = await setup({ share: { saveImage: async () => "shared" } });
	await typeAndReview(shared.root, { A: "125" }, [
		{ cardId: "A", amount: 125_00 },
	]);
	await click(shared.root, "save-image");
	expect(statusText(shared.root)).toBe(
		"Image shared. Check it reached the spender.",
	);

	const cancelled = await setup({
		share: { saveImage: async () => "cancelled" },
	});
	await typeAndReview(cancelled.root, { A: "125" }, [
		{ cardId: "A", amount: 125_00 },
	]);
	await click(cancelled.root, "save-image");
	expect(statusText(cancelled.root)).toBe("");
});

/** A repository whose savePurchaseList always rejects. */
class RejectingListRepository extends InMemoryRepository {
	override savePurchaseList(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("a failed save keeps the review", async () => {
	const repo = new RejectingListRepository();
	const { root, visited } = await setup({ repo });
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	await click(root, "mark-sent");
	const banner =
		root.querySelector<CcErrorBanner>("cc-error-banner")?.message ?? "";
	expect(banner.startsWith("Could not save the list.")).toBe(true);
	expect(root.querySelector("cc-list-table")).not.toBeNull();
	expect(visited).toEqual([]);

	await click(root, "back");
	expect((await amounts(root)).entries["A"]).toBe("125");
});

test("an unknown list says so", async () => {
	const { root } = await setup({ search: "?id=gone" });
	expect(root.textContent).toContain("This list no longer exists.");
	expect(root.querySelector('a[href="/"]:not([data-action])')).not.toBeNull();
	expect(root.querySelector("cc-list-amounts")).toBeNull();
});

test("a sent list is not reopened for editing", async () => {
	const { root } = await setup({
		search: "?id=s1",
		before: (repo) =>
			repo.savePurchaseList({
				id: "s1",
				date: "2026-10-30",
				status: "sent",
				sentAt: "2026-10-30T03:00:00.000Z",
				lines: [{ cardId: "A", amount: 100 }],
			}),
	});
	expect(root.querySelector("cc-list-amounts")).toBeNull();
	expect(root.querySelector("cc-list-reply")).not.toBeNull();
});

test("re-renders in Thai", async () => {
	const { root } = await setup();
	setLocale("th");
	await settle();
	expect(root.querySelector("h1")?.textContent).toContain("ใบรายการซื้อใหม่");
	expect(
		root.querySelector('[data-action="back"]')?.getAttribute("aria-label"),
	).toBe("กลับ");
	setLocale("en");
});

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

const bannerText = (root: HTMLElement) =>
	root.querySelector<CcErrorBanner>("cc-error-banner")?.message ?? "";

const flatText = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The heading's own text, without the detail under it. */
const titleOf = (h1: Element | null) => {
	const copy = h1?.cloneNode(true) as Element | undefined;
	copy?.querySelector("small")?.remove();
	return flatText(copy);
};

test("a sent list opens the reply", async () => {
	const { root } = await setup({ search: "?id=w1", before: withW1 });
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

test("saving the reply stores purchases, the draft and the saved list", async () => {
	const { root, repo } = await setup({ search: "?id=w1", before: withW1 });
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
	const saved = lists.find((l) => l.id === "w1");
	expect(saved?.status).toBe("saved");
	expect(saved?.savedAt).toBe("2026-10-31T03:00:00.000Z");
	expect(saved?.movedTo).toBe("w1-2");
	expect(saved?.lines).toEqual(answers);

	expect(root.querySelector("cc-list-reply")).toBeNull();
	expect(flatText(root.querySelector('p.note[data-tone="ok"]'))).toContain(
		"Saved 2 purchases, ฿35,000.00.",
	);
	const link = root.querySelector('[data-action="open-draft"]');
	expect(link?.getAttribute("href")).toBe("/list?id=w1-2");
	expect(flatText(link)).toContain("B moved to a draft for Sat, 31 Oct");
	expect(link?.querySelector("small")?.textContent).toBe(
		"Open it when you're ready to send",
	);
	expect(bannerText(root)).toBe("");
});

test("unticked, not-made lines are dropped", async () => {
	const { root, repo } = await setup({ search: "?id=w1", before: withW1 });
	await sendReply(root, false);
	const lists = await stored(repo);
	expect(lists.map((l) => l.id)).toEqual(["w1"]);
	expect(lists[0]?.status).toBe("saved");
	expect(lists[0]?.movedTo).toBeUndefined();
	expect(await allPurchases(repo)).toHaveLength(2);
	expect(root.querySelector('[data-action="open-draft"]')).toBeNull();
});

test("a list already saved is refused", async () => {
	const { root, repo } = await setup({ search: "?id=w1", before: withW1 });
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
	const { root } = await setup({ repo, search: "?id=w1", before: withW1 });
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
	expect(bannerText(root)).toBe("");
});

test("a retry without moving removes the draft a failed save moved", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({
		repo,
		search: "?id=w1",
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
		search: "?id=w1",
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
	const { root } = await setup({ repo, search: "?id=w1", before: withW1 });
	repo.failNext = true;
	await sendReply(root, false);
	expect(bannerText(root).startsWith("Could not save the reply.")).toBe(true);
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("sent");
	expect(root.querySelector("cc-list-reply")).not.toBeNull();

	await sendReply(root, false);
	const ids = (await allPurchases(repo)).map((p) => p.id).sort();
	expect(ids).toEqual(["w1-0", "w1-1"]);
	expect((await stored(repo)).find((l) => l.id === "w1")?.status).toBe("saved");
	expect(bannerText(root)).toBe("");
});

test("a retry with changed answers leaves no stale purchase", async () => {
	const repo = new FlakyListRepository();
	const { root } = await setup({ repo, search: "?id=w1", before: withW1 });
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

test("a saved list shows what was bought", async () => {
	const { root } = await setup({
		search: "?id=s9",
		before: (repo) =>
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
			}),
	});
	const h1 = root.querySelector("h1");
	expect(titleOf(h1)).toBe("Fri, 30 Oct 2026");
	expect(h1?.querySelector("small")?.textContent).toBe("Purchase list · saved");
	expect(flatText(root.querySelector('p.note[data-tone="ok"]'))).toBe(
		"Saved 1 purchase, ฿13,000.00. It counts against the card's room now.",
	);
	const rowA = root.querySelector('[data-card="A"]');
	expect(flatText(rowA)).toContain("฿13,000.00");
	expect(flatText(rowA)).toContain("planned ฿12,500.00");
	const rowB = root.querySelector('[data-card="B"]');
	expect(flatText(rowB?.querySelector(".tag"))).toBe("Not made");
	expect(flatText(rowB)).not.toContain("฿");
	expect(root.querySelector('[data-action="open-draft"]')).toBeNull();
	expect(root.querySelector("cc-list-reply")).toBeNull();
});
