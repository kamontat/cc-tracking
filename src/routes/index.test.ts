import { expect, test } from "bun:test";
import type { CcNeedsYou } from "#components/cc-needs-you";
import type { CcReadyList } from "#components/cc-ready-list";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { LocalStorageRepository } from "#lib/storage/local";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { renderHomePage } from "./index";

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
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
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});

/** 10:00 Bangkok on 31 Oct 2026, movable. */
const movableClock = () => {
	let at = new Date("2026-10-31T03:00:00Z");
	return {
		clock: () => at,
		set: (iso: string) => {
			at = new Date(iso);
		},
	};
};

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 });
	await repo.saveCard(card("A"));
	await repo.saveCard(card("B"));
	await repo.saveSettings({ purchaseLocations: ["krabi"] });
};

const setup = async (repo: Repository = new InMemoryRepository()) => {
	setLocale("en");
	const root = mount();
	await seed(repo);
	const visited: string[] = [];
	const time = movableClock();
	renderHomePage(repo, root, {
		clock: time.clock,
		navigate: (url) => visited.push(url),
	});
	await settle();
	return { root, repo, visited, time };
};

const readyList = async (root: HTMLElement): Promise<CcReadyList> => {
	const list = root.querySelector<CcReadyList>("cc-ready-list");
	if (!list) throw new Error("no ready list");
	await list.updateComplete;
	return list;
};

const toggle = async (root: HTMLElement, cardId: string) => {
	const list = await readyList(root);
	list.dispatchEvent(
		new CustomEvent("toggle", {
			detail: { cardId },
			bubbles: true,
			composed: true,
		}),
	);
	await settle();
};

const selectionBar = (root: HTMLElement) =>
	root.querySelector<HTMLElement>('[data-testid="selection"]');

test("needs you comes before ready to use", async () => {
	const { root } = await setup();
	const tags = [...root.querySelectorAll("cc-needs-you, cc-ready-list")].map(
		(element) => element.localName,
	);
	expect(tags).toEqual(["cc-needs-you", "cc-ready-list"]);
});

test("no dashboard panel is left", async () => {
	const { root } = await setup();
	for (const selector of [
		"cc-quick-add",
		"cc-sitting-list",
		"cc-spendable",
		"cc-due-list",
		"cc-purchase-range",
		"[data-panel]",
	]) {
		expect(root.querySelector(selector)).toBeNull();
	}
});

test("the batch start is never touched", async () => {
	localStorage.clear();
	await setup(new LocalStorageRepository(localStorage));
	await settle();
	expect(localStorage.getItem("cc:batch-start")).toBeNull();
});

test("ticking cards shows the selection bar", async () => {
	const { root } = await setup();
	expect(selectionBar(root)).toBeNull();

	await toggle(root, "A");
	await toggle(root, "B");
	expect(selectionBar(root)?.textContent).toContain("2 cards selected");

	selectionBar(root)
		?.querySelector<HTMLButtonElement>('[data-action="clear"]')
		?.click();
	await settle();
	expect(selectionBar(root)).toBeNull();
	expect((await readyList(root)).selected).toEqual([]);
});

test("ticking a card twice takes it back off", async () => {
	const { root } = await setup();
	await toggle(root, "A");
	expect(selectionBar(root)?.textContent).toContain("1 card selected");
	await toggle(root, "A");
	expect(selectionBar(root)).toBeNull();
});

test("the floating Payment button steps aside while cards are selected", async () => {
	const { root } = await setup();
	const html = document.documentElement;
	expect(html.hasAttribute("data-selecting")).toBe(false);
	await toggle(root, "A");
	expect(html.hasAttribute("data-selecting")).toBe(true);
	selectionBar(root)
		?.querySelector<HTMLButtonElement>('[data-action="clear"]')
		?.click();
	await settle();
	expect(html.hasAttribute("data-selecting")).toBe(false);

	const css = await Bun.file("src/styles/app.css").text();
	expect(css).toMatch(
		/:root\[data-selecting\] \.fab:any-link\s*\{\s*display: none;/,
	);
});

test("enter amounts opens the list with the picked cards", async () => {
	const { root, visited } = await setup();
	await toggle(root, "B");
	await toggle(root, "A");
	expect((await readyList(root)).selected).toEqual(["B", "A"]);

	selectionBar(root)
		?.querySelector<HTMLButtonElement>('[data-action="enter-amounts"]')
		?.click();
	expect(visited).toEqual(["/list/new?card=B&card=A"]);
});

test("stored payments and sent lists move the room", async () => {
	const repo = new InMemoryRepository();
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-09-10",
		amount: 20_000_00,
		note: "",
	});
	await repo.saveCardPayment({
		id: "c1",
		cardId: "A",
		date: "2026-10-01",
		amount: 20_000_00,
		status: "paid",
		period: "2026-09",
	});
	await repo.savePurchase({
		id: "p2",
		cardId: "A",
		date: "2026-10-28",
		amount: 5_000_00,
		note: "",
	});
	await repo.savePurchaseList({
		id: "l1",
		date: "2026-10-31",
		status: "sent",
		lines: [{ cardId: "B", amount: 10_000_00 }],
	});
	const { root } = await setup(repo);

	const list = await readyList(root);
	expect(list.rows.length).toBe(2);
	for (const row of list.rows) expect(row.room.room).toBe(85_000_00);

	const kinds = (
		root.querySelector<CcNeedsYou>("cc-needs-you")?.items ?? []
	).map((item) => item.kind);
	expect(kinds).toContain("waiting");
	expect(kinds).not.toContain("overdue");
});

test("an overdue bill needs you", async () => {
	const repo = new InMemoryRepository();
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-09-10",
		amount: 3_000_00,
		note: "",
	});
	const { root } = await setup(repo);

	const items = root.querySelector<CcNeedsYou>("cc-needs-you")?.items ?? [];
	expect(
		items.some((item) => item.kind === "overdue" && item.card.id === "A"),
	).toBe(true);
});

test("past midnight moves today", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	await seed(repo);
	const root = mount();
	const time = movableClock();
	renderHomePage(repo, root, { clock: time.clock, tickMs: 5 });
	await settle();
	expect((await readyList(root)).today).toBe("2026-10-31");

	time.set("2026-11-01T03:00:00Z");
	await settle(30);
	expect((await readyList(root)).today).toBe("2026-11-01");
	root.remove();
});

test("a reload keeps the selection in tap order, pruned to cards still ready", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	await seed(repo);
	await repo.saveCard(card("C"));
	const root = mount();
	const time = movableClock();
	renderHomePage(repo, root, { clock: time.clock, tickMs: 5 });
	await settle();
	await toggle(root, "C");
	await toggle(root, "A");
	await toggle(root, "B");
	await repo.saveCard(card("A", { archived: true }));

	time.set("2026-11-01T03:00:00Z");
	await settle(30);
	expect((await readyList(root)).selected).toEqual(["C", "B"]);
	root.remove();
});

class FailingReadRepository extends InMemoryRepository {
	override listCards(): Promise<Card[]> {
		return Promise.reject(new Error("disk is gone"));
	}
}

test("a failed read shows the banner", async () => {
	setLocale("en");
	const root = mount();
	renderHomePage(new FailingReadRepository(), root, {
		clock: movableClock().clock,
	});
	await settle();
	const banner = root.querySelector("cc-error-banner");
	expect(banner?.message.startsWith("Could not read your cards.")).toBe(true);
});
