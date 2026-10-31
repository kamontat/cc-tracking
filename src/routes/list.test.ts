import { expect, test } from "bun:test";
import type { CcErrorBanner } from "#components/cc-error-banner";
import type { CcListAmounts } from "#components/cc-list-amounts";
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
	expect(root.textContent).toContain("This list no longer exists.");
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
