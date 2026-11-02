import { expect, test } from "bun:test";
import type { CcReadyFilter } from "#components/cc-ready-filter";
import type { CcReadyPicker } from "#components/cc-ready-picker";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { renderPickerPage } from "./picker-page";
import { CLOCK, card, mount, settle } from "./test-support";

/** Four ready cards over two groups and two places, one archived and one in no place. */
const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({
		id: "g1",
		name: "G1",
		limit: 100_000_00,
		owner: "KC",
	});
	await repo.saveLimitGroup({
		id: "g2",
		name: "G2",
		limit: 50_000_00,
		owner: "NT",
	});
	await repo.saveCard(card("A"));
	await repo.saveCard(card("B", { name: "UOB Krabi", limitGroupId: "g2" }));
	await repo.saveCard(card("C", { location: "bangkok", last4: "9876" }));
	await repo.saveCard(card("D", { location: "bangkok", limitGroupId: "g2" }));
	await repo.saveCard(card("E", { location: "phichit" }));
	await repo.saveCard(card("Z", { archived: true }));
	await repo.saveSettings({ purchaseLocations: ["krabi", "bangkok"] });
	// Room: g1 has two cards spending 30k, g2 two cards spending 10k.
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-10-28",
		amount: 30_000_00,
		note: "",
	});
	await repo.savePurchase({
		id: "p2",
		cardId: "B",
		date: "2026-10-28",
		amount: 10_000_00,
		note: "",
	});
};

const setup = async (
	search = "",
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en");
	await seed(repo);
	await before?.(repo);
	const root = mount();
	const visited: string[] = [];
	const addresses: string[] = [];
	renderPickerPage(repo, root, {
		clock: CLOCK,
		search,
		navigate: (url) => visited.push(url),
		replaceAddress: (url) => addresses.push(url),
	});
	await settle();
	return { root, repo, visited, addresses };
};

const picker = async (root: HTMLElement) => {
	const element = root.querySelector<CcReadyPicker>("cc-ready-picker");
	if (!element) throw new Error("no picker");
	await element.updateComplete;
	return element;
};
const order = async (root: HTMLElement) =>
	(await picker(root)).rows.map((row) => row.card.id);
const toggle = async (root: HTMLElement, cardId: string) => {
	const element = await picker(root);
	element.shadowRoot
		?.querySelector<HTMLElement>(`[data-card="${cardId}"]`)
		?.click();
	await settle();
};
const bar = (root: HTMLElement) =>
	root.querySelector<HTMLElement>('[data-testid="selection"]');
const flat = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim();
const sheet = async (root: HTMLElement) => {
	const element = root.querySelector<CcReadyFilter>("cc-ready-filter");
	if (!element) throw new Error("no sheet");
	await element.updateComplete;
	return element;
};
const inSheet = async (root: HTMLElement, selector: string) => {
	const element = await sheet(root);
	element.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
	await element.updateComplete;
};

test("a list page under a back header to Home, with the ready cards by most room", async () => {
	const { root } = await setup();
	expect(document.documentElement.hasAttribute("data-list-page")).toBe(true);
	expect(flat(root.querySelector(".back-header h1"))).toBe(
		"New purchase list4 cards in Krabi, Bangkok",
	);
	expect(
		root
			.querySelector('.back-header [data-action="back"]')
			?.getAttribute("href"),
	).toBe("/");
	expect(await order(root)).toEqual(["A", "C", "B", "D"]);
	expect(flat(root.querySelector('[data-action="sort"]'))).toBe(
		"Sort: Most room ▾",
	);
	expect(root.querySelector(".tx-count")).toBeNull();
	expect(root.querySelector("[data-chip]")).toBeNull();
});

test("ticking cards shows the selection bar; Enter amounts opens them in tap order", async () => {
	const { root, visited } = await setup();
	expect(bar(root)).toBeNull();
	await toggle(root, "C");
	expect(flat(bar(root)?.querySelector("b"))).toBe("1 card selected");
	await toggle(root, "A");
	expect(flat(bar(root)?.querySelector("b"))).toBe("2 cards selected");
	expect((await picker(root)).selected).toEqual(["C", "A"]);
	bar(root)
		?.querySelector<HTMLElement>('[data-action="enter-amounts"]')
		?.click();
	expect(visited).toEqual(["/list/new?card=C&card=A"]);
});

test("ticking twice or Clear takes the pick back off", async () => {
	const { root } = await setup();
	await toggle(root, "A");
	await toggle(root, "A");
	expect(bar(root)).toBeNull();
	await toggle(root, "A");
	await toggle(root, "B");
	bar(root)?.querySelector<HTMLElement>('[data-action="clear"]')?.click();
	await settle();
	expect(bar(root)).toBeNull();
	expect((await picker(root)).selected).toEqual([]);
});

test("the search narrows the rows and is kept in the address", async () => {
	const { root, addresses } = await setup();
	const input = root.querySelector<HTMLInputElement>(
		'.tx-search input[name="q"]',
	);
	if (!input) throw new Error("no search");
	input.value = "uob";
	input.dispatchEvent(new Event("input"));
	await settle();
	expect(await order(root)).toEqual(["B"]);
	expect(addresses.at(-1)).toBe("/list/new?q=uob");
	input.value = "9876";
	input.dispatchEvent(new Event("input"));
	await settle();
	expect(await order(root)).toEqual(["C"]);
});

test("the filter sheet offers the ready cards' places and holders and applies with the sort", async () => {
	const { root, addresses } = await setup();
	root.querySelector<HTMLElement>('[data-action="filter"]')?.click();
	await settle();
	const element = await sheet(root);
	expect(element.locations).toEqual(["bangkok", "krabi"]);
	expect(element.owners).toEqual(["KC", "NT"]);
	await inSheet(root, "[data-location=bangkok]");
	await inSheet(root, "[data-owner=NT]");
	await inSheet(root, "[data-sort=due]");
	expect(flat(element.shadowRoot?.querySelector("[data-action=apply]"))).toBe(
		"Show 1 card",
	);
	await inSheet(root, "[data-action=apply]");
	await settle();
	expect(root.querySelector("cc-ready-filter")).toBeNull();
	expect(await order(root)).toEqual(["D"]);
	expect(addresses.at(-1)).toBe("/list/new?loc=bangkok&owner=NT&sort=due");
	expect(flat(root.querySelector(".tx-count"))).toBe("2");
	expect(flat(root.querySelector('[data-action="sort"]'))).toBe(
		"Sort: Latest due ▾",
	);
	expect([...root.querySelectorAll("[data-chip]")].map((c) => flat(c))).toEqual(
		["Bangkok ×", "NT ×"],
	);
	root.querySelector<HTMLElement>('[data-chip="owner:NT"]')?.click();
	await settle();
	expect(await order(root)).toEqual(["C", "D"]);
	expect(addresses.at(-1)).toBe("/list/new?loc=bangkok&sort=due");
});

test("the sort chip opens the sheet, and closing it changes nothing", async () => {
	const { root, addresses } = await setup();
	root.querySelector<HTMLElement>('[data-action="sort"]')?.click();
	await settle();
	await inSheet(root, "[data-sort=close]");
	(await sheet(root)).dispatchEvent(new CustomEvent("close"));
	await settle();
	expect(root.querySelector("cc-ready-filter")).toBeNull();
	expect(addresses).toEqual([]);
	expect(await order(root)).toEqual(["A", "C", "B", "D"]);
});

test("the address restores the search, filters and sort", async () => {
	const { root } = await setup("?loc=krabi&sort=close");
	expect(await order(root)).toEqual(["A", "B"]);
	expect(flat(root.querySelector('[data-action="sort"]'))).toBe(
		"Sort: Longest to close ▾",
	);
	expect(flat(root.querySelector('[data-chip="location:krabi"]'))).toBe(
		"Krabi ×",
	);
});

test("a filter that matches nothing says so and clears", async () => {
	const { root, addresses } = await setup("?q=nothing&owner=NT");
	expect(root.querySelector("cc-ready-picker")).toBeNull();
	expect(flat(root.querySelector('[data-empty="no-match"]'))).toContain(
		"No card matches.",
	);
	root.querySelector<HTMLElement>('[data-action="clear-filters"]')?.click();
	await settle();
	expect(await order(root)).toEqual(["A", "C", "B", "D"]);
	expect(addresses.at(-1)).toBe("/list/new");
});

test("nothing ready names the next step; not-assigned cards are counted", async () => {
	const { root } = await setup("", async (repo) => {
		await repo.saveSettings({ purchaseLocations: [] });
	});
	expect(root.querySelector("cc-ready-picker")).toBeNull();
	expect(root.querySelector(".tx-controls")).toBeNull();
	expect(
		root.querySelector('[data-action="settings"]')?.getAttribute("href"),
	).toBe("/settings");
	expect(root.querySelector(".back-header small")).toBeNull();
});

test("cards with no limit group are counted, with the way to assign them", async () => {
	const { root } = await setup("", async (repo) => {
		const { limitGroupId: _, ...loose } = card("N");
		await repo.saveCard(loose);
	});
	expect(flat(root.querySelector('[data-testid="unassigned"]'))).toBe(
		"1 card has no limit group yet. Assign them",
	);
	expect(
		root.querySelector('[data-testid="unassigned"] a')?.getAttribute("href"),
	).toBe("/cards");
});

test("reads in Thai", async () => {
	const { root } = await setup();
	setLocale("th");
	await settle();
	expect(flat(root.querySelector('[data-action="sort"]'))).toBe(
		"เรียง: วงเงินเหลือมากสุด ▾",
	);
	await toggle(root, "A");
	expect(flat(bar(root)?.querySelector("b"))).toBe("เลือกแล้ว 1 ใบ");
	setLocale("en");
});

class FailingReadRepository extends InMemoryRepository {
	override listCards(): Promise<Card[]> {
		return Promise.reject(new Error("disk is gone"));
	}
}

test("a failed read shows the banner", async () => {
	setLocale("en");
	const root = mount();
	renderPickerPage(new FailingReadRepository(), root, {
		clock: CLOCK,
		search: "",
		replaceAddress: () => {},
	});
	await settle();
	const banner = root.querySelector("cc-error-banner");
	expect(banner?.message.startsWith("Could not read your cards.")).toBe(true);
});
