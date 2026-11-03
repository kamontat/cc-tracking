import { expect, test } from "bun:test";
import type { CcNeedsYou } from "#components/cc-needs-you";
import type { CcReadyPanel } from "#components/cc-ready-panel";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { LocalStorageRepository } from "#lib/storage/local";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { renderHomePage } from "./index";
import { saveLocations } from "./list/test-support";

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
	await saveLocations(repo, ["krabi"]);
};

const setup = async (repo: Repository = new InMemoryRepository()) => {
	setLocale("en");
	const root = mount();
	await seed(repo);
	const time = movableClock();
	renderHomePage(repo, root, { clock: time.clock });
	await settle();
	return { root, repo, time };
};

const readyList = async (root: HTMLElement): Promise<CcReadyPanel> => {
	const list = root.querySelector<CcReadyPanel>("cc-ready-panel");
	if (!list) throw new Error("no ready panel");
	await list.updateComplete;
	return list;
};

test("needs you comes before ready to use", async () => {
	const { root } = await setup();
	const tags = [...root.querySelectorAll("cc-needs-you, cc-ready-panel")].map(
		(element) => element.localName,
	);
	expect(tags).toEqual(["cc-needs-you", "cc-ready-panel"]);
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

test("Home has no selection: the short panel has no Start a list", async () => {
	const { root } = await setup();
	const panel = await readyList(root);
	expect(panel.rows.map((row) => row.card.id)).toEqual(["A", "B"]);
	const shadow = panel.shadowRoot as ShadowRoot;
	expect(shadow.querySelector(".tick")).toBeNull();
	expect(shadow.querySelector('[data-action="start"]')).toBeNull();
	expect(root.querySelector('[data-testid="selection"]')).toBeNull();
	expect(document.documentElement.hasAttribute("data-selecting")).toBe(false);
});

test("the floating Payment button stays on Home", async () => {
	const css = await Bun.file("src/styles/app.css").text();
	expect(css).not.toContain("data-selecting");
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

test("a planned payment due soon needs you, a far one does not", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCardPayment({
		id: "c1",
		cardId: "A",
		date: "2026-11-02",
		amount: 1_000_00,
		status: "planned",
	});
	await repo.saveCardPayment({
		id: "c2",
		cardId: "A",
		date: "2026-12-25",
		amount: 1_000_00,
		status: "planned",
	});
	const { root } = await setup(repo);
	const planned = (
		root.querySelector<CcNeedsYou>("cc-needs-you")?.items ?? []
	).filter((item) => item.kind === "planned");
	expect(planned.length).toBe(1);
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

class FailingReadRepository extends InMemoryRepository {
	override listCards(): Promise<Card[]> {
		return Promise.reject(new Error("disk is gone"));
	}
}

test("ready to use names the places that take purchases, A to Z in the reader's language", async () => {
	const { root, repo } = await setup();
	await repo.saveLocation({
		id: "chiang-mai",
		name: "Chiang Mai",
		takesPurchases: true,
	});
	await repo.saveCard(card("C", { location: "chiang-mai" }));
	renderHomePage(repo, root);
	await settle();
	const panel = await readyList(root);
	expect(panel.places).toEqual(["Chiang Mai", "Krabi"]);
	expect(panel.rows.map((row) => row.card.id).sort()).toEqual(["A", "B", "C"]);

	// A language switch repaints with the names, and their order, in that language.
	setLocale("th");
	await settle();
	expect((await readyList(root)).places).toEqual(["กระบี่", "Chiang Mai"]);
	setLocale("en");
});

test("with nothing ready, the panel still names no place that takes none", async () => {
	const { root, repo } = await setup();
	await saveLocations(repo, []);
	renderHomePage(repo, root);
	await settle();
	const panel = await readyList(root);
	expect(panel.rows).toEqual([]);
	expect(panel.places).toEqual([]);
});

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

test("Home is two columns from 900px: Ready to use left, Needs you right; a phone keeps Needs you first", async () => {
	const { root } = await setup();
	const grid = root.querySelector(".home-grid") as HTMLElement;
	expect([...grid.children].map((c) => c.localName)).toEqual([
		"cc-needs-you",
		"cc-ready-panel",
	]);
	const css = await Bun.file("src/styles/app.css").text();
	expect(css).toMatch(
		/@media \(min-width: 900px\)\s*\{\s*\.home-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1fr\);[^}]*grid-template-areas: "ready needs";/,
	);
	expect(css).toMatch(/\.home-grid > cc-needs-you\s*\{\s*grid-area: needs;/);
	expect(css).toMatch(/\.home-grid > cc-ready-panel\s*\{\s*grid-area: ready;/);
});

const needs = async (root: HTMLElement) => {
	const element = root.querySelector<CcNeedsYou>("cc-needs-you");
	if (!element) throw new Error("no needs you");
	await element.updateComplete;
	return { element, shadow: element.shadowRoot as ShadowRoot };
};

/** Opens the Needs you row `row` and taps `action` in it, then lets the page write and reload. */
const tapIn = async (root: HTMLElement, row: string, action: string) => {
	const { element, shadow } = await needs(root);
	const head = shadow.querySelector<HTMLElement>(`[data-row="${row}"] .a-hit`);
	if (head?.getAttribute("aria-expanded") !== "true") head?.click();
	await element.updateComplete;
	shadow
		.querySelector<HTMLElement>(`[data-row="${row}"] [data-action="${action}"]`)
		?.click();
	await settle(5);
	await element.updateComplete;
};

const soonPlan = {
	id: "c1",
	cardId: "A",
	date: "2026-11-02",
	amount: 1_000_00,
	status: "planned" as const,
};

test("Paid on a Needs you plan stores it paid and the row goes", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCardPayment(soonPlan);
	const { root } = await setup(repo);
	await tapIn(root, "plan:A:c1", "mark-paid");
	const [stored] = await repo.listCardPayments("A");
	expect(stored?.status).toBe("paid");
	const { shadow } = await needs(root);
	expect(shadow.querySelector('[data-row="plan:A:c1"]')).toBeNull();
	expect(root.querySelector("cc-error-banner")?.message).toBe("");
});

/** The focused element, through every shadow root. */
const deepActive = (): Element | null => {
	let active: Element | null = document.activeElement;
	while (active?.shadowRoot?.activeElement)
		active = active.shadowRoot.activeElement;
	return active;
};

/** Opens row `row`, focuses its `action` as a keyboard would, and presses it. */
const pressIn = async (root: HTMLElement, row: string, action: string) => {
	const { element, shadow } = await needs(root);
	shadow.querySelector<HTMLElement>(`[data-row="${row}"] .a-hit`)?.click();
	await element.updateComplete;
	const button = shadow.querySelector<HTMLElement>(
		`[data-row="${row}"] [data-action="${action}"]`,
	);
	button?.focus();
	expect(deepActive()).toBe(button);
	button?.click();
	await settle(5);
	await element.updateComplete;
};

const plans = (...dates: string[]) =>
	dates.map((date, i) => ({ ...soonPlan, id: `c${i + 1}`, date }));

test("after Paid takes a row away, focus moves to the next row's head", async () => {
	const repo = new InMemoryRepository();
	for (const plan of plans("2026-11-01", "2026-11-02", "2026-11-03"))
		await repo.saveCardPayment(plan);
	const { root } = await setup(repo);
	await pressIn(root, "plan:A:c2", "mark-paid");
	const { shadow } = await needs(root);
	expect(shadow.querySelector('[data-row="plan:A:c2"]')).toBeNull();
	expect(deepActive()).toBe(
		shadow.querySelector('[data-row="plan:A:c3"] .a-hit'),
	);
});

test("in a folded list, focus moves to the row that slides into the gone row's place", async () => {
	const repo = new InMemoryRepository();
	const dates = [
		"2026-10-29",
		"2026-10-30",
		"2026-10-31",
		"2026-11-01",
		"2026-11-02",
		"2026-11-03",
	];
	for (const plan of plans(...dates)) await repo.saveCardPayment(plan);
	const { root } = await setup(repo);
	const { shadow } = await needs(root);
	// Five show; the sixth waits behind See more.
	expect(shadow.querySelector('[data-row="plan:A:c6"]')).toBeNull();
	await pressIn(root, "plan:A:c5", "mark-paid");
	expect(deepActive()).toBe(
		shadow.querySelector('[data-row="plan:A:c6"] .a-hit'),
	);
});

test("after Paid takes the last row away, focus moves to the row before it", async () => {
	const repo = new InMemoryRepository();
	for (const plan of plans("2026-11-01", "2026-11-02"))
		await repo.saveCardPayment(plan);
	const { root } = await setup(repo);
	await pressIn(root, "plan:A:c2", "mark-paid");
	const { shadow } = await needs(root);
	expect(deepActive()).toBe(
		shadow.querySelector('[data-row="plan:A:c1"] .a-hit'),
	);
});

test("after Paid takes the only row away, focus moves to the heading", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCardPayment(soonPlan);
	const { root } = await setup(repo);
	await pressIn(root, "plan:A:c1", "mark-paid");
	const { shadow } = await needs(root);
	const heading = shadow.querySelector("h1");
	expect(heading?.getAttribute("tabindex")).toBe("-1");
	expect(deepActive()).toBe(heading);
});

test("after a two-step Delete takes a row away, focus moves to the next row's head", async () => {
	const repo = new InMemoryRepository();
	for (const plan of plans("2026-11-01", "2026-11-02"))
		await repo.saveCardPayment(plan);
	const { root } = await setup(repo);
	const { element, shadow } = await needs(root);
	shadow.querySelector<HTMLElement>('[data-row="plan:A:c1"] .a-hit')?.click();
	await element.updateComplete;
	const first = shadow.querySelector<HTMLElement>(
		'[data-row="plan:A:c1"] [data-action="delete"]',
	);
	first?.focus();
	first?.click();
	await element.updateComplete;
	// The swap moved focus to the asking Delete.
	const second = shadow.querySelector<HTMLElement>(
		'[data-row="plan:A:c1"] [data-action="confirm-delete"]',
	);
	expect(deepActive()).toBe(second);
	second?.click();
	await settle(5);
	await element.updateComplete;
	expect(shadow.querySelector('[data-row="plan:A:c1"]')).toBeNull();
	expect(deepActive()).toBe(
		shadow.querySelector('[data-row="plan:A:c2"] .a-hit'),
	);
});

class FailingWriteRepository extends InMemoryRepository {
	override saveCardPayment(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("a failed write shows the banner and keeps the row open", async () => {
	const repo = new FailingWriteRepository();
	await InMemoryRepository.prototype.saveCardPayment.call(repo, soonPlan);
	const { root } = await setup(repo);
	await tapIn(root, "plan:A:c1", "mark-paid");
	expect(root.querySelector("cc-error-banner")?.message).toBe(
		"Could not mark the payment paid. disk is full",
	);
	const { shadow } = await needs(root);
	expect(
		shadow
			.querySelector('[data-row="plan:A:c1"] .a-hit')
			?.getAttribute("aria-expanded"),
	).toBe("true");
});

const draft = {
	id: "d1",
	date: "2026-10-31",
	status: "draft" as const,
	lines: [{ cardId: "A", amount: 1_000_00 }],
};

test("Delete on a Needs you draft removes it at once", async () => {
	const repo = new InMemoryRepository();
	await repo.savePurchaseList(draft);
	const { root } = await setup(repo);
	await tapIn(root, "list:d1", "delete-draft");
	expect(await repo.listPurchaseLists()).toEqual([]);
	const { shadow } = await needs(root);
	expect(shadow.querySelector('[data-row="list:d1"]')).toBeNull();
});

test("Delete refuses a draft sent since, and says why", async () => {
	const repo = new InMemoryRepository();
	await repo.savePurchaseList(draft);
	const { root } = await setup(repo);
	await repo.savePurchaseList({ ...draft, status: "sent" });
	await tapIn(root, "list:d1", "delete-draft");
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual([
		"sent",
	]);
	expect(root.querySelector("cc-error-banner")?.message).toBe(
		"Could not delete the draft. This list was sent or saved elsewhere, so it was not changed.",
	);
});

/** Taps the first step, then the second, of a two-step button in a Needs you row. */
const tapTwice = async (
	root: HTMLElement,
	row: string,
	first: string,
	second: string,
) => {
	const { element, shadow } = await needs(root);
	const head = shadow.querySelector<HTMLElement>(`[data-row="${row}"] .a-hit`);
	head?.click();
	await element.updateComplete;
	shadow
		.querySelector<HTMLElement>(`[data-row="${row}"] [data-action="${first}"]`)
		?.click();
	await element.updateComplete;
	// Nothing is written by the first step.
	await settle(5);
	return async () => {
		shadow
			.querySelector<HTMLElement>(
				`[data-row="${row}"] [data-action="${second}"]`,
			)
			?.click();
		await settle(5);
		await element.updateComplete;
	};
};

test("Delete on a planned payment is two steps, then the stored payment is gone", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCardPayment(soonPlan);
	const { root } = await setup(repo);
	const second = await tapTwice(root, "plan:A:c1", "delete", "confirm-delete");
	expect(await repo.listCardPayments("A")).toHaveLength(1);
	await second();
	expect(await repo.listCardPayments("A")).toEqual([]);
	const { shadow } = await needs(root);
	expect(shadow.querySelector('[data-row="plan:A:c1"]')).toBeNull();
	expect(root.querySelector("cc-error-banner")?.message).toBe("");
});

test("Confirm on a waiting list is two steps, then Save stores the list saved", async () => {
	const repo = new InMemoryRepository();
	await repo.savePurchaseList({ ...draft, id: "w1", status: "sent" });
	const { root } = await setup(repo);
	const second = await tapTwice(root, "list:w1", "confirm-list", "save-list");
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual([
		"sent",
	]);
	await second();
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual([
		"saved",
	]);
	const { shadow } = await needs(root);
	expect(shadow.querySelector('[data-row="list:w1"]')).toBeNull();
});
