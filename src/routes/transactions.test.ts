import { expect, test } from "bun:test";
import type { CcListIndex } from "#components/cc-list-index";
import type { CcOwedList } from "#components/cc-owed-list";
import type { CcTxFilter } from "#components/cc-tx-filter";
import type { CcTxLedger } from "#components/cc-tx-ledger";
import { setLocale } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { InMemoryRepository } from "#lib/storage/repository";
import {
	CLOCK,
	draft,
	flatText,
	mount,
	seed,
	sent,
	settle,
} from "./list/test-support";
import { renderTransactionsPage } from "./transactions";

const data = async (repo: Repository) => {
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-10-30",
		amount: 1_000_00,
		note: "fuel",
	});
	await repo.savePurchase({
		id: "p2",
		cardId: "B",
		date: "2026-10-31",
		amount: 250_00,
		note: "lunch",
	});
	await repo.saveCardPayment({
		id: "c1",
		cardId: "A",
		date: "2026-10-31",
		amount: 300_00,
		status: "paid",
	});
	await repo.saveCardPayment({
		id: "c2",
		cardId: "A",
		date: "2026-11-05",
		amount: 200_00,
		status: "planned",
	});
	await repo.savePurchaseList(sent("w1", ["B"]));
};

const open = async (
	search = "",
	extra: (repo: Repository) => Promise<void> = async () => {},
) => {
	setLocale("en");
	const repo = new InMemoryRepository();
	await seed(repo);
	await data(repo);
	await extra(repo);
	const root = mount();
	const written: string[] = [];
	renderTransactionsPage(repo, root, {
		clock: CLOCK,
		search,
		replace: (url) => written.push(url),
	});
	await settle();
	return { root, repo, written };
};

const ledger = (root: HTMLElement) =>
	root.querySelector("cc-tx-ledger") as CcTxLedger;
const inLedger = (root: HTMLElement, selector: string) =>
	ledger(root).shadowRoot?.querySelector<HTMLElement>(selector) ?? null;
const type = async (root: HTMLElement, value: string) => {
	const input = root.querySelector<HTMLInputElement>('input[name="q"]');
	if (!input) throw new Error("no search");
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await settle();
};
const press = async (el: Element | null | undefined) => {
	(el as HTMLElement).click();
	await settle();
};
/** The opened row's details, in the ledger. */
const shown = ".a-details:not([hidden])";

test("the default view shows the summary, upcoming and the ledger by day", async () => {
	const { root, written } = await open();
	expect(root.querySelector("h1")?.textContent).toBe("Transactions");
	expect(
		root.querySelector('[data-view="ledger"]')?.getAttribute("aria-pressed"),
	).toBe("true");
	const summary = root.querySelector('[data-testid="summary"]');
	expect(flatText(summary)).toContain("฿1,250.00");
	expect(flatText(summary)).toContain("฿300.00");
	const el = ledger(root);
	expect(el.upcoming?.lists.map((l) => l.id)).toEqual(["w1"]);
	expect(el.upcoming?.planned.map((p) => p.payment.id)).toEqual(["c2"]);
	expect(el.groups?.map((g) => g.date)).toEqual(["2026-10-31", "2026-10-30"]);
	// The card ledgers, so an opened row can name its statement and a payment's parts.
	expect(
		el.ledgers
			.get("A")
			?.statements.some((s) => s.purchases.some((p) => p.id === "p1")),
	).toBe(true);
	expect(written).toEqual([]);
});

test("searching writes ?q= and hides the summary", async () => {
	const { root, written } = await open();
	await type(root, "fuel");
	expect(written.at(-1)).toBe("?q=fuel");
	expect(root.querySelector('[data-testid="summary"]')).toBeNull();
	expect(ledger(root).filtered).toBe(true);
	expect(ledger(root).groups?.flatMap((g) => g.entries)).toHaveLength(1);
});

test("removing a chip drops that filter", async () => {
	const { root, written } = await open("?type=payment&card=A");
	expect(ledger(root).groups?.flatMap((g) => g.entries)).toHaveLength(1);
	await press(root.querySelector('[data-chip="type:payment"]'));
	expect(written.at(-1)).toBe("?card=A");
	expect(ledger(root).groups?.flatMap((g) => g.entries)).toHaveLength(2);
	await press(root.querySelector('[data-chip="card:A"]'));
	expect(written.at(-1)).toBe("");
});

test("the filter sheet applies a filter and a sort", async () => {
	const { root, written } = await open();
	await press(root.querySelector('[data-action="filter"]'));
	const sheet = root.querySelector("cc-tx-filter") as CcTxFilter;
	await sheet.updateComplete;
	sheet.shadowRoot
		?.querySelector<HTMLElement>('[data-type="payment"]')
		?.click();
	await sheet.updateComplete;
	sheet.shadowRoot
		?.querySelector<HTMLElement>('[data-action="apply"]')
		?.click();
	await settle();
	expect(written.at(-1)).toBe("?type=payment");
	expect(root.querySelector("cc-tx-filter")).toBeNull();
	expect(ledger(root).groups?.flatMap((g) => g.entries)).toHaveLength(1);
});

test("the Lists view filters by status chip", async () => {
	const { root, written } = await open("?view=lists");
	const index = root.querySelector("cc-list-index") as CcListIndex;
	await index.updateComplete;
	expect(index.lists).toHaveLength(1);
	index.shadowRoot
		?.querySelector<HTMLElement>('[data-status="saved"]')
		?.click();
	await settle();
	expect(written.at(-1)).toBe("?view=lists&status=saved");
	expect((root.querySelector("cc-list-index") as CcListIndex).status).toEqual([
		"saved",
	]);
});

const inIndex = (root: HTMLElement, selector: string) =>
	(
		root.querySelector("cc-list-index") as CcListIndex
	).shadowRoot?.querySelector<HTMLElement>(selector) ?? null;

test("the Lists view's Confirm saves a sent list after the second step", async () => {
	const { root, repo } = await open("?view=lists");
	await press(inIndex(root, '[data-row="list:w1"] .a-hit'));
	await press(inIndex(root, `${shown} [data-action="confirm-list"]`));
	expect(
		(await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status,
	).toBe("sent");
	await press(inIndex(root, '[data-action="save-list"]'));
	await settle(5);
	expect(
		(await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status,
	).toBe("saved");
});

test("the Lists view's Delete removes a draft in one step", async () => {
	const { root, repo } = await open("?view=lists", async (r) => {
		await r.savePurchaseList(draft("d9", ["A"]));
	});
	await press(inIndex(root, '[data-row="list:d9"] .a-hit'));
	await press(inIndex(root, `${shown} [data-action="delete-draft"]`));
	await settle(5);
	expect((await repo.listPurchaseLists()).map((l) => l.id)).toEqual(["w1"]);
	expect(inIndex(root, '[data-row="list:d9"]')).toBeNull();
});

test("the switch changes the view and the address", async () => {
	const { root, written } = await open();
	await press(root.querySelector('[data-view="lists"]'));
	expect(written.at(-1)).toBe("?view=lists");
	expect(root.querySelector("cc-list-index")).not.toBeNull();
});

test("with Owed open the Ledger button is marked current for wide screens", async () => {
	const { root } = await open("?view=owed");
	const ledgerButton = root.querySelector('.tx-switch [data-view="ledger"]');
	expect(ledgerButton?.hasAttribute("data-desktop-current")).toBe(true);
	const other = await open("?view=lists");
	expect(
		other.root
			.querySelector('.tx-switch [data-view="ledger"]')
			?.hasAttribute("data-desktop-current"),
	).toBe(false);
});

test("Owed rows lead to the payment sheet on the card", async () => {
	const { root } = await open("?view=owed");
	const owed = root.querySelector("cc-owed-list") as CcOwedList;
	await owed.updateComplete;
	expect(
		owed.shadowRoot
			?.querySelector<HTMLAnchorElement>('a[data-card="A"]')
			?.getAttribute("href"),
	).toBe("/pay?card=A");
});

test("Mark paid moves a plan into the ledger and lowers owed", async () => {
	const { root, repo } = await open();
	const owedBefore = (
		root.querySelector("cc-owed-list") as CcOwedList
	).rows.find((r) => r.card.id === "A")?.owed;
	await press(inLedger(root, '[data-item="planned"]'));
	await press(inLedger(root, '[data-action="mark-paid"]'));
	await settle(5);
	const [, planned] = (await repo.listCardPayments("A")).sort((a, b) =>
		a.id < b.id ? -1 : 1,
	);
	expect(planned).toMatchObject({
		id: "c2",
		status: "paid",
		date: "2026-10-31",
	});
	expect(ledger(root).upcoming?.planned).toEqual([]);
	const owedAfter = (
		root.querySelector("cc-owed-list") as CcOwedList
	).rows.find((r) => r.card.id === "A")?.owed;
	expect((owedAfter ?? 0) < (owedBefore ?? 0)).toBe(true);
});

test("Confirm saves a waiting list as is: every line made, under the list's own ids", async () => {
	const { root, repo } = await open();
	await repo.savePurchaseList({
		...sent("w1", ["B"]),
		lines: [{ cardId: "B", amount: 120_00, note: "gift" }],
	});
	await press(inLedger(root, '[data-item="waiting"]'));
	await press(inLedger(root, '[data-action="confirm-list"]'));
	// The first tap only asks; nothing is written yet.
	expect(await repo.listPurchases("B")).toHaveLength(1);
	await press(inLedger(root, '[data-action="save-list"]'));
	await settle(5);
	const stored = (await repo.listPurchaseLists()).find((l) => l.id === "w1");
	expect(stored?.status).toBe("saved");
	const made = (await repo.listPurchases("B")).filter((p) =>
		p.id.startsWith("w1-"),
	);
	expect(made).toEqual([
		expect.objectContaining({
			id: "w1-0",
			cardId: "B",
			date: "2026-10-30",
			amount: 120_00,
			note: "gift",
		}),
	]);
	expect(ledger(root).upcoming?.lists).toEqual([]);
});

test("Confirm refuses a list no longer waiting and writes nothing", async () => {
	const { root, repo } = await open();
	const stored = (await repo.listPurchaseLists()).find((l) => l.id === "w1");
	await repo.savePurchaseList({
		...(stored as NonNullable<typeof stored>),
		status: "draft",
	});
	await press(inLedger(root, '[data-item="waiting"]'));
	await press(inLedger(root, '[data-action="confirm-list"]'));
	await press(inLedger(root, '[data-action="save-list"]'));
	await settle(5);
	expect(
		(await repo.listPurchases("B")).filter((p) => p.id.startsWith("w1-")),
	).toEqual([]);
	expect(root.querySelector("cc-error-banner")?.message).toContain(
		"no longer waiting",
	);
	// The list is no longer waiting, so its row goes from Upcoming.
	expect(inLedger(root, '[data-item="waiting"]')).toBeNull();
});

test("deleting a payment needs the second step", async () => {
	const { root, repo } = await open();
	await press(inLedger(root, '[data-item="payment"]'));
	await press(inLedger(root, `${shown} [data-action="delete"]`));
	expect(await repo.listCardPayments("A")).toHaveLength(2);
	await press(inLedger(root, `${shown} [data-action="confirm-delete"]`));
	await settle(5);
	expect((await repo.listCardPayments("A")).map((p) => p.id)).toEqual(["c2"]);
});

test("the address read on load restores the view", async () => {
	const { root } = await open("?q=lunch&sort=old");
	expect(root.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe(
		"lunch",
	);
	expect(root.querySelector('[data-action="sort"]')?.textContent).toContain(
		"Sort: Oldest first",
	);
	expect(ledger(root).groups?.flatMap((g) => g.entries)).toHaveLength(1);
});

test("re-renders in Thai", async () => {
	const { root } = await open();
	setLocale("th");
	expect(root.querySelector("h1")?.textContent).toBe("รายการเคลื่อนไหว");
	setLocale("en");
});

test("a custom range chip shows display dates", async () => {
	const { root } = await open("?from=2026-10-30&to=2026-10-31");
	const chip = root.querySelector('[data-chip="range"]');
	expect(chip?.textContent).not.toContain("2026-10-30");
	expect(chip?.textContent).toContain("30");
});

test("a failed delete names the delete, not a save", async () => {
	const { root, repo } = await open();
	repo.deleteCardPayment = () => Promise.reject(new Error("disk full"));
	await press(inLedger(root, '[data-item="payment"]'));
	await press(inLedger(root, `${shown} [data-action="delete"]`));
	await press(inLedger(root, `${shown} [data-action="confirm-delete"]`));
	await settle(5);
	const banner = root.querySelector("cc-error-banner");
	expect(banner?.message).toContain("Could not delete the payment.");
	expect(
		inLedger(root, '[data-item="payment"]')?.getAttribute("aria-expanded"),
	).toBe("true");
});

test("a failed mark paid names the marking, not a save", async () => {
	const { root, repo } = await open();
	repo.saveCardPayment = () => Promise.reject(new Error("disk full"));
	await press(inLedger(root, '[data-item="planned"]'));
	await press(inLedger(root, '[data-action="mark-paid"]'));
	await settle(5);
	const banner = root.querySelector("cc-error-banner");
	expect(banner?.message).toContain("Could not mark the payment paid.");
	// The plan is still there, and its row stays open.
	expect(
		inLedger(root, '[data-item="planned"]')?.getAttribute("aria-expanded"),
	).toBe("true");
	expect(inLedger(root, `${shown} [data-action="mark-paid"]`)).not.toBeNull();
});

test("the Filter button counts the filters in use and the sort chip opens the sheet", async () => {
	const { root } = await open("?type=payment&card=A");
	const filter = root.querySelector('[data-action="filter"]');
	expect(filter?.querySelector(".tx-count")?.textContent).toBe("2");
	const cardChip = root.querySelector('[data-chip="card:A"]');
	expect(cardChip?.querySelector(".cl-full")?.textContent).toBe(
		"A) A card (1234)",
	);
	expect(cardChip?.querySelector(".cl-short")?.textContent).toBe("A) A card");
	expect(cardChip?.getAttribute("aria-label")).toContain("A) A card (1234)");
	const plain = await open();
	expect(
		plain.root.querySelector('[data-action="filter"] .tx-count'),
	).toBeNull();
	expect(
		plain.root.querySelector('[data-action="sort"]')?.textContent,
	).toContain("Sort: Newest first");
	await press(plain.root.querySelector('[data-action="sort"]'));
	expect(plain.root.querySelector("cc-tx-filter")).not.toBeNull();
});

test("the summary names the month and signs its figures", async () => {
	const { root } = await open();
	const summary = root.querySelector('[data-testid="summary"]');
	expect(summary?.querySelector("h2")?.textContent).toBe("October so far");
	expect(summary?.querySelector(".tx-summary__head small")).toBeNull();
	expect(flatText(summary)).not.toContain(" · ");
	expect(
		summary?.querySelector('[data-field="purchases"] b')?.textContent,
	).toBe("−฿1,250.00");
	expect(
		summary
			?.querySelector('[data-field="purchases"] b')
			?.getAttribute("data-tone"),
	).toBe("out");
	expect(summary?.querySelector('[data-field="payments"] b')?.textContent).toBe(
		"+฿300.00",
	);
});

test("the Owed view keeps the title and switch above the owed panel", async () => {
	const { root } = await open("?view=owed");
	expect(root.querySelector("h1")?.textContent).toBe("Transactions");
	expect(root.querySelector(".tx-grid")?.getAttribute("data-show")).toBe(
		"owed",
	);
	expect(root.querySelector(".tx-owed cc-owed-list")).not.toBeNull();
});

/** 117 purchases on top of the three in `data`: 120 ledger entries, two a day back from October. */
const bulk = async (repo: Repository) => {
	for (let i = 0; i < 117; i++) {
		const day = new Date(
			Date.UTC(2026, 9, 29) - Math.floor(i / 2) * 86_400_000,
		);
		await repo.savePurchase({
			id: `bulk${i}`,
			cardId: "A",
			date: day.toISOString().slice(0, 10),
			amount: 100_00 + i,
			note: "bulk",
		});
	}
};

const ledgerRows = (root: HTMLElement) =>
	ledger(root).shadowRoot?.querySelectorAll(
		':is([data-item="purchase"], [data-item="payment"])',
	).length;

test("the ledger shows 50 rows, then 50 more a click, until all 120 show", async () => {
	const { root } = await open("", bulk);
	const more = () => inLedger(root, '[data-action="show-more"]');
	expect(ledgerRows(root)).toBe(50);
	expect(flatText(more())).toBe("Show 50 more · 70 left");
	expect(more()?.getAttribute("data-variant")).toBe("quiet");
	await press(more());
	expect(ledgerRows(root)).toBe(100);
	expect(flatText(more())).toBe("Show 20 more");
	await press(more());
	expect(ledgerRows(root)).toBe(120);
	expect(more()).toBeNull();
});

test("each day heading shows once, also where the cut falls inside a day", async () => {
	const { root } = await open("", bulk);
	const headings = () =>
		[
			...(ledger(root).shadowRoot?.querySelectorAll("section.day h3") ?? []),
		].map((h) => flatText(h));
	const unique = (list: (string | undefined)[]) =>
		new Set(list).size === list.length;
	expect(unique(headings())).toBe(true);
	const before = headings().length;
	await press(inLedger(root, '[data-action="show-more"]'));
	expect(unique(headings())).toBe(true);
	expect(headings().length).toBeGreaterThan(before);
});

test("a search, filter or sort change starts the ledger at 50 again; the address keeps no count", async () => {
	const { root, written } = await open("", bulk);
	await press(inLedger(root, '[data-action="show-more"]'));
	expect(ledgerRows(root)).toBe(100);
	await type(root, "bulk");
	expect(ledgerRows(root)).toBe(50);
	expect(flatText(inLedger(root, '[data-action="show-more"]'))).toBe(
		"Show 50 more · 67 left",
	);
	expect(written.at(-1)).toBe("?q=bulk");
	await press(inLedger(root, '[data-action="show-more"]'));
	expect(ledgerRows(root)).toBe(100);
	const sheet = root.querySelector<CcTxFilter>("cc-tx-filter");
	expect(sheet).toBeNull();
	root.querySelector<HTMLElement>(".tx-fbtn")?.click();
	await settle();
	const opened = root.querySelector("cc-tx-filter") as CcTxFilter;
	opened.dispatchEvent(
		new CustomEvent("apply", {
			detail: { filter: opened.filter, sort: "big" },
		}),
	);
	await settle();
	expect(ledgerRows(root)).toBe(50);
	expect(written.every((w) => !w.includes("50"))).toBe(true);
});

test("the results line counts every match, not only the rows shown", async () => {
	const { root } = await open("?q=bulk", bulk);
	expect(ledgerRows(root)).toBe(50);
	expect(flatText(inLedger(root, ".result-head"))).toContain("117");
});
