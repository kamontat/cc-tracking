import { expect, spyOn, test } from "bun:test";
import type { CcErrorBanner } from "#components/cc-error-banner";
import type { CcListAmounts } from "#components/cc-list-amounts";
import type { ListLine, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	type ShareApi,
	type ShareTable,
	shareTable,
	shareText,
} from "#lib/ui/list-share";
import { type EntryMode, renderEntryPage } from "./entry";
import {
	bannerText,
	CLOCK,
	card,
	click,
	draft,
	elsewhereLink,
	flatText,
	mount,
	saved,
	seed,
	sent,
	settle,
	setupPage,
	stored,
} from "./test-support";

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
		mode?: EntryMode;
		repo?: Repository;
		search?: string;
		share?: ShareApi;
		replaced?: string[];
		before?: (repo: Repository) => Promise<void>;
	} = {},
) => {
	const calls: Calls = { copy: [], saveImage: [] };
	const page = await setupPage(
		(repo, root, pageOptions) =>
			renderEntryPage(repo, root, options.mode ?? "new", {
				...pageOptions,
				share: options.share ?? recordingShare(calls),
				newId: () => "l-new",
				replaceAddress: (url) => {
					options.replaced?.push(url);
				},
			}),
		{
			repo: options.repo,
			search: options.search ?? "?card=A",
			before: options.before,
		},
	);
	return { ...page, calls };
};

/** The draft page, opened on `d1` as `before` stored it. */
const setupDraft = (
	before: (repo: Repository) => Promise<void>,
	repo?: Repository,
	replaced?: string[],
) =>
	setup({
		mode: "draft",
		search: "?id=d1",
		before,
		...(repo ? { repo } : {}),
		...(replaced ? { replaced } : {}),
	});

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

const statusText = (root: HTMLElement) =>
	root.querySelector('p.status[role="status"]')?.textContent?.trim() ?? "";

const draftWith =
	(cardIds: string[]) =>
	async (repo: Repository): Promise<void> =>
		repo.savePurchaseList(draft("d1", cardIds));

test("a new list opens with the picked cards and today", async () => {
	const { root } = await setup({ search: "?card=B&card=A&card=Z&card=nope" });
	const element = await amounts(root);
	expect(element.cards.map((c) => c.id)).toEqual(["B", "A"]);
	expect(element.date).toBe("2026-10-31");
	expect(root.querySelector("h1")?.textContent).toContain("New purchase list");
	// Back goes to the picker the cards came from (DD-103).
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe(
		"/list/new",
	);
});

test("a draft's back still goes Home", async () => {
	const { root } = await setupDraft(draftWith(["A"]));
	expect(root.querySelector('[data-action="back"]')?.getAttribute("href")).toBe(
		"/",
	);
});

test("a new list ignores an id in its address", async () => {
	const { root } = await setup({
		search: "?id=d1",
		before: draftWith(["A"]),
	});
	expect((await amounts(root)).cards).toEqual([]);
	expect(root.querySelector("h1")?.textContent).toContain("New purchase list");
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
	const { root, repo } = await setupDraft((repo) =>
		repo.savePurchaseList({
			id: "d1",
			date: "2026-11-02",
			status: "draft",
			lines: [
				{ cardId: "A", amount: 12_345_00 },
				{ cardId: "Z", amount: 100 },
			],
		}),
	);
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

const droppedNote = (root: HTMLElement) =>
	flatText(root.querySelector("p.note[data-dropped]"));

test("a reopened draft says which cards were left out and why", async () => {
	const one = await setupDraft(draftWith(["A", "Z"]));
	expect(droppedNote(one.root)).toBe(
		"Z) Z card (1234) can no longer take purchases and was left out.",
	);

	const two = await setupDraft(async (repo) => {
		await repo.saveCard(card("Y", { archived: true }));
		await draftWith(["A", "Z", "Y"])(repo);
	});
	expect(droppedNote(two.root)).toBe(
		"Z) Z card (1234), Y) Y card (1234) can no longer take purchases and were left out.",
	);

	const none = await setupDraft(draftWith(["A"]));
	expect(none.root.querySelector("p.note[data-dropped]")).toBeNull();
});

test("a draft sent or saved elsewhere is not saved over", async () => {
	for (const action of ["mark-sent", "save-draft"]) {
		const { root, repo, visited } = await setupDraft(draftWith(["A"]));
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

test("an unknown draft says so and leads home", async () => {
	const { root } = await setup({ mode: "draft", search: "?id=gone" });
	expect(root.textContent).toContain("This list no longer exists.");
	expect(root.querySelector('a[href="/"]:not([data-action])')).not.toBeNull();
	expect(root.querySelector("cc-list-amounts")).toBeNull();
});

test("a list that is not a draft leads to its own page", async () => {
	const waiting = await setupDraft((repo) =>
		repo.savePurchaseList(sent("d1", ["A"])),
	);
	expect(waiting.root.querySelector("cc-list-amounts")).toBeNull();
	expect(waiting.root.textContent).toContain(
		"This list is waiting for the spender's reply.",
	);
	expect(elsewhereLink(waiting.root)).toBe("/list/reply?id=d1");

	const done = await setupDraft((repo) =>
		repo.savePurchaseList(saved("d1", ["A"])),
	);
	expect(done.root.textContent).toContain("This list is already saved.");
	expect(elsewhereLink(done.root)).toBe("/list/view?id=d1");
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
		renderEntryPage(repo, root, "new", {
			clock: CLOCK,
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
				...sent("s1", ["A"]),
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

test("the review puts the table in the main column and its actions in the side panel", async () => {
	const { root } = await setup();
	await typeAndReview(root, { A: "125" }, [{ cardId: "A", amount: 125_00 }]);
	expect(
		root.querySelector(".list-layout > .list-layout__main > cc-list-table"),
	).toBeInstanceOf(HTMLElement);
	const side = root.querySelector(".list-layout > .list-layout__side");
	expect(side).toBeInstanceOf(HTMLElement);
	for (const action of ["copy", "save-image", "mark-sent", "save-draft"]) {
		expect(side?.querySelector(`[data-action="${action}"]`)).toBeInstanceOf(
			HTMLElement,
		);
	}
	expect(side?.querySelector('p.status[role="status"]')).toBeInstanceOf(
		HTMLElement,
	);
});

/** The page's Delete draft button, in the light DOM wherever the step puts it. */
const deleteButton = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('[data-action="delete-draft"]');

test("only a draft offers Delete draft, in the side panel of both steps", async () => {
	const fresh = await setup();
	expect(deleteButton(fresh.root)).toBeNull();
	await typeAndReview(fresh.root, { A: "125" }, [
		{ cardId: "A", amount: 125_00 },
	]);
	expect(deleteButton(fresh.root)).toBeNull();

	const { root } = await setupDraft(draftWith(["A"]));
	const onAmounts = deleteButton(root);
	expect(onAmounts?.getAttribute("data-variant")).toBe("danger");
	expect(onAmounts?.getAttribute("slot")).toBe("side");
	expect(onAmounts?.parentElement?.tagName).toBe("CC-LIST-AMOUNTS");
	expect(onAmounts?.textContent?.trim()).toBe("Delete draft");

	await fire(root, "review", {
		date: "2026-11-02",
		lines: [{ cardId: "A", amount: 100 }],
	});
	const side = root.querySelector(".list-layout > .list-layout__side");
	expect(side?.contains(deleteButton(root))).toBe(true);
	expect(deleteButton(root)?.getAttribute("data-variant")).toBe("danger");
});

test("delete draft removes the draft at once and goes home", async () => {
	const { root, repo, visited } = await setupDraft(async (repo) => {
		await draftWith(["A"])(repo);
		await repo.savePurchaseList(sent("s1", ["B"]));
	});
	await click(root, "delete-draft");
	expect((await stored(repo)).map((l) => l.id)).toEqual(["s1"]);
	expect(visited).toEqual(["/"]);
});

test("a draft sent or saved elsewhere is not deleted", async () => {
	const { root, repo, visited } = await setupDraft(draftWith(["A"]));
	const elsewhere = sent("d1", ["A"]);
	await repo.savePurchaseList(elsewhere);
	await click(root, "delete-draft");
	expect(bannerText(root)).toContain(
		"This list was sent or saved elsewhere, so it was not changed.",
	);
	expect(await stored(repo)).toEqual([elsewhere]);
	expect(visited).toEqual([]);
});

/** A repository whose deletePurchaseList always rejects. */
class UndeletableRepository extends InMemoryRepository {
	override deletePurchaseList(): Promise<void> {
		return Promise.reject(new Error("disk is busy"));
	}
}

test("a failed delete says so and stays", async () => {
	const { root, repo, visited } = await setupDraft(
		draftWith(["A"]),
		new UndeletableRepository(),
	);
	await click(root, "delete-draft");
	expect(bannerText(root).startsWith("Could not delete the draft.")).toBe(true);
	expect((await stored(repo)).map((l) => l.id)).toEqual(["d1"]);
	expect(visited).toEqual([]);
	expect(root.querySelector("cc-list-amounts")).not.toBeNull();
});

test("add appends the card to the address, with replace not push", async () => {
	const replaced: string[] = [];
	const { root } = await setup({ replaced });
	await fire(root, "add", { cardId: "B" });
	expect(replaced).toEqual(["/list/new?card=A&card=B"]);
});

test("remove drops the card from the address and keeps order and other params", async () => {
	const replaced: string[] = [];
	const { root } = await setup({
		replaced,
		search: "?card=A&x=1&card=B",
	});
	await fire(root, "remove", { cardId: "A" });
	expect(replaced).toEqual(["/list/new?x=1&card=B"]);
	await fire(root, "remove", { cardId: "B" });
	expect(replaced).toEqual(["/list/new?x=1&card=B", "/list/new?x=1"]);
});

test("ids with & or , survive in the address", async () => {
	const replaced: string[] = [];
	const { root } = await setup({
		replaced,
		search: "?card=A",
		before: async (repo) => {
			await repo.saveCard(card("a&b,c"));
		},
	});
	await fire(root, "add", { cardId: "a&b,c" });
	expect(replaced).toEqual(["/list/new?card=A&card=a%26b%2Cc"]);
	expect(
		new URLSearchParams(replaced[0]?.split("?")[1]).getAll("card"),
	).toEqual(["A", "a&b,c"]);
});

test("a draft page leaves its address alone", async () => {
	const replaced: string[] = [];
	const { root } = await setupDraft(
		(repo) =>
			repo.savePurchaseList({
				id: "d1",
				date: "2026-11-02",
				status: "draft",
				lines: [{ cardId: "A", amount: 100 }],
			}),
		undefined,
		replaced,
	);
	await fire(root, "add", { cardId: "B" });
	await fire(root, "remove", { cardId: "A" });
	expect(replaced).toEqual([]);
});
