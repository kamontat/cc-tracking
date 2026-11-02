import { afterEach, expect, test } from "bun:test";
import type { CcErrorBanner } from "#components/cc-error-banner";
import type { CcMoreMenu } from "#components/cc-more-menu";
import type { CcPurchaseSheet } from "#components/cc-purchase-sheet";
import { closeDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addDays, addPeriods, today } from "#lib/domain/date";
import type { Card, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository } from "#lib/storage/repository";
import { seedLocations } from "#lib/storage/seed-locations";
import { payAddress } from "#lib/ui/pay-address";
import { renderCardPage } from "./card";
import { draft, saved, sent } from "./list/test-support";

afterEach(() => setLocale("en"));

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const text = (el: Node | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const bannerMessage = (root: HTMLElement): string =>
	root.querySelector<CcErrorBanner>(":scope > cc-error-banner")?.message ?? "";

/** Records every message the page banner is handed, so a one-frame flash of it shows up. */
const watchBanner = (banner: CcErrorBanner): string[] => {
	const seen: string[] = [];
	const proto = Object.getOwnPropertyDescriptor(
		Object.getPrototypeOf(banner),
		"message",
	);
	Object.defineProperty(banner, "message", {
		configurable: true,
		get: () => proto?.get?.call(banner),
		set: (value: string) => {
			seen.push(value);
			proto?.set?.call(banner, value);
		},
	});
	return seen;
};

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

// 70 days ago is well outside the current period, so this purchase always lands in a
// statement that is already closed, regardless of what "today" is when the test runs.
const purchaseDate = addDays(today(), -70);
const period = periodOfPurchase(card.cycle, purchaseDate);
const purchase: Purchase = {
	id: "a",
	cardId: "kbank",
	date: purchaseDate,
	amount: 35_000,
	note: "fuel",
};

/** A repository whose savePurchase always rejects, to exercise the failure path in isolation. */
class RejectingPurchaseRepository extends InMemoryRepository {
	override savePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

/** A repository whose deletePurchase always rejects, to exercise the failure path in isolation. */
class RejectingDeleteRepository extends InMemoryRepository {
	override deletePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

/** Where the page went after a delete, through its `navigate` seam. */
let visited: string[] = [];

const open = async (repo: InMemoryRepository, id: string | null = "kbank") => {
	// As `bootstrap` does on a real load: the default records, ticked from the stored setting.
	await seedLocations(repo, { getItem: () => null, setItem: () => {} });
	const root = mount();
	visited = [];
	renderCardPage(repo, id, root, { navigate: (url) => visited.push(url) });
	await settle();
	return root;
};

const statementsOf = async (root: HTMLElement) => {
	const list = root.querySelector("cc-card-statements");
	await list?.updateComplete;
	return list;
};

/** Unfolds a statement's row in the list and hands back the list's shadow root. */
const unfold = async (root: HTMLElement, target: string) => {
	const list = await statementsOf(root);
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>(`[data-period="${target}"] button.head`)
		?.click();
	await list?.updateComplete;
	return list?.shadowRoot as ShadowRoot;
};

const openSheet = async (root: HTMLElement, purchaseId = "a") => {
	const shadow = await unfold(root, period);
	shadow
		.querySelector<HTMLButtonElement>(
			`[data-purchase="${purchaseId}"] [data-action="edit-purchase"]`,
		)
		?.click();
	await settle();
	const sheet = root.querySelector<CcPurchaseSheet>("cc-purchase-sheet");
	if (!sheet) throw new Error("the purchase sheet did not open");
	await sheet.updateComplete;
	return sheet;
};

const setField = async (
	sheet: CcPurchaseSheet,
	name: string,
	value: string,
) => {
	const input = sheet.shadowRoot?.querySelector<HTMLInputElement>(
		`input[name="${name}"]`,
	);
	if (!input) throw new Error(`no ${name} field`);
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await sheet.updateComplete;
};

const submitSheet = async (sheet: CcPurchaseSheet) => {
	sheet.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle();
	await settle();
};

test("a sub-header names the card and where it is kept, with Edit leading to the card form", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "g1",
		name: "Pool",
		limit: 100_000_00,
		owner: "RI",
	});
	await repo.saveCard({ ...card, id: "k b", limitGroupId: "g1" });
	const root = await open(repo, "k b");

	const header = root.querySelector(".sub-header");
	expect(
		header?.querySelector('a[data-action="back"]')?.getAttribute("href"),
	).toBe("/cards");
	expect(text(header?.querySelector("h1 .sub-header__title"))).toBe(
		"KBank Visa · RI (4821)",
	);
	expect(text(header?.querySelector("h1 small"))).toBe("k b · Kept in Krabi");
	const edit = header?.querySelector('a[data-action="edit"]');
	expect(edit?.getAttribute("href")).toBe("/card/edit?id=k%20b");
	expect(text(edit)).toBe("Edit");
	expect(header?.querySelector(".sub-header__actions cc-more-menu")).not.toBe(
		null,
	);
});

const menu = (root: HTMLElement) => {
	const element = root.querySelector<CcMoreMenu>(".sub-header cc-more-menu");
	if (!element) throw new Error("no More menu");
	return element;
};

/** The More menu's buttons by action, in order. */
const menuActions = async (root: HTMLElement) => {
	const element = menu(root);
	await element.updateComplete;
	return [
		...(element.shadowRoot?.querySelectorAll(".more-menu button") ?? []),
	].map((b) => b.getAttribute("data-action"));
};

/** Opens the More menu and presses one of its buttons, waiting for the page to settle. */
const pick = async (root: HTMLElement, ...actions: string[]) => {
	const element = menu(root);
	await element.updateComplete;
	const shadow = element.shadowRoot as ShadowRoot;
	shadow.querySelector<HTMLButtonElement>("button.more")?.click();
	await element.updateComplete;
	for (const action of actions) {
		const button = shadow.querySelector<HTMLButtonElement>(
			`[data-action="${action}"]`,
		);
		if (!button) throw new Error(`no ${action} in the More menu`);
		button.click();
		await element.updateComplete;
	}
	await settle();
	await settle();
};

test("More: Archive card archives the stored card and stays on its page", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = await open(repo);
	expect(await menuActions(root)).toEqual(["archive", "delete"]);
	expect(
		text(menu(root).shadowRoot?.querySelector('[data-action="archive"]')),
	).toBe("Archive card");
	await pick(root, "archive");
	expect((await repo.getCard("kbank"))?.archived).toBe(true);
	expect(visited).toEqual([]);
	expect([...root.querySelectorAll(".card-badges .badge")].map(text)).toEqual([
		"Archived",
	]);
});

test("More: Unarchive card on an archived one", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, archived: true });
	const root = await open(repo);
	expect(
		text(menu(root).shadowRoot?.querySelector('[data-action="archive"]')),
	).toBe("Unarchive card");
	await pick(root, "archive");
	expect((await repo.getCard("kbank"))?.archived).toBe(false);
});

test("More: a failed archive says why in the banner", async () => {
	class FailingSave extends InMemoryRepository {
		override saveCard(value: Card): Promise<void> {
			if (value.archived) return Promise.reject(new Error("disk is full"));
			return super.saveCard(value);
		}
	}
	const repo = new FailingSave();
	await repo.saveCard(card);
	const root = await open(repo);
	await pick(root, "archive");
	expect((await repo.getCard("kbank"))?.archived).toBe(false);
	expect(bannerMessage(root)).toContain("Could not archive the card.");
});

test("More: Delete card asks twice, naming the card, then goes to Cards", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchaseList(saved("old", ["kbank"]));
	const root = await open(repo);
	await pick(root, "delete");
	expect(text(menu(root).shadowRoot?.querySelector(".ask"))).toBe(
		"Delete KBank Visa?",
	);
	expect(await repo.getCard("kbank")).not.toBeNull();
	menu(root)
		.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="confirm"]')
		?.click();
	await settle();
	await settle();
	expect(await repo.getCard("kbank")).toBeNull();
	expect(visited).toEqual(["/cards"]);
});

test("More: no Delete card while the card has a purchase", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = await open(repo);
	expect(await menuActions(root)).toEqual(["archive"]);
});

test("More: no Delete card while a draft or a sent list holds it", async () => {
	for (const list of [draft("d", ["kbank"]), sent("s", ["kbank"])]) {
		const repo = new InMemoryRepository();
		await repo.saveCard(card);
		await repo.savePurchaseList(list);
		const root = await open(repo);
		expect(await menuActions(root)).toEqual(["archive"]);
	}
});

test("More: a refused delete stays, with storage's reason, and Delete card goes", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = await open(repo);
	// Raced in after the page loaded: the button showed, storage still says no.
	await repo.savePurchase(purchase);
	await pick(root, "delete", "confirm");
	expect(visited).toEqual([]);
	expect(await repo.getCard("kbank")).not.toBeNull();
	expect(bannerMessage(root)).toContain("Could not delete the card.");
	expect(await menuActions(root)).toEqual(["archive"]);
});

test("badges an archived or supplementary card under the header", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, archived: true, supplementary: true });
	const root = await open(repo);

	expect([...root.querySelectorAll(".card-badges .badge")].map(text)).toEqual([
		"Archived",
		"Supplementary card",
	]);
});

test("the hero gets the group's room, this card's debt and the next bill", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	await repo.saveCard({ ...card, limitGroupId: "pool" });
	// A sibling on the same pool: its spending comes out of this card's room too.
	await repo.saveCard({ ...card, id: "scb", limitGroupId: "pool" });
	await repo.savePurchase(purchase);
	await repo.savePurchase({
		...purchase,
		id: "b",
		cardId: "scb",
		amount: 10_000,
	});
	const root = await open(repo);

	const hero = root.querySelector("cc-card-hero");
	expect(hero?.card?.id).toBe("kbank");
	expect(hero?.room?.group.id).toBe("pool");
	expect(hero?.room?.used).toBe(45_000);
	expect(hero?.room?.room).toBe(455_000);
	expect(hero?.cards.map((c) => c.id).sort()).toEqual(["kbank", "scb"]);
	expect(hero?.owed).toBe(35_000);
	expect(hero?.next?.period).toBe(period);
});

test("card payments settle the oldest statement first and leave credit past what is owed", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 });
	await repo.saveCard({ ...card, limitGroupId: "pool" });
	await repo.savePurchase(purchase);
	await repo.saveCardPayment({
		id: "pay1",
		cardId: "kbank",
		date: today(),
		amount: 15_000,
		status: "paid",
	});
	let root = await open(repo);

	let hero = root.querySelector("cc-card-hero");
	expect(hero?.owed).toBe(20_000);
	expect(hero?.credit).toBe(0);
	expect(hero?.next?.remaining).toBe(20_000);
	const list = await statementsOf(root);
	expect(list?.statements.find((s) => s.period === period)?.paidAmount).toBe(
		15_000,
	);

	await repo.saveCardPayment({
		id: "pay2",
		cardId: "kbank",
		date: today(),
		amount: 30_000,
		status: "paid",
	});
	root = await open(repo);
	hero = root.querySelector("cc-card-hero");
	expect(hero?.owed).toBe(0);
	expect(hero?.credit).toBe(10_000);
	expect(hero?.next).toBeNull();
});

test("Use on a list starts a list on this card, and Make a payment opens its next bill", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 });
	await repo.saveCard({ ...card, id: "a b", limitGroupId: "pool" });
	await repo.savePurchase({ ...purchase, cardId: "a b" });
	const root = await open(repo, "a b");

	const actions = root.querySelector(".card-actions");
	const use = actions?.querySelector('a[data-action="use-on-list"]');
	expect(use?.getAttribute("href")).toBe("/list/new?card=a+b");
	expect(text(use)).toBe("Use on a list");
	const pay = actions?.querySelector('a[data-action="pay"]');
	expect(pay?.getAttribute("href")).toBe(
		payAddress({ cardId: "a b", amount: 35_000 }),
	);
	expect(pay?.getAttribute("data-variant")).toBe("quiet");
	expect(text(pay)).toBe("Make a payment");
	expect(actions?.querySelector(".note")).toBeNull();
});

test("a card kept at a place of its own that takes no purchases names that place", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 });
	await repo.saveLocation({
		id: "chiang-mai",
		name: "Chiang Mai",
		takesPurchases: false,
	});
	await repo.saveCard({
		...card,
		location: "chiang-mai",
		limitGroupId: "pool",
	});
	const root = await open(repo);

	const actions = root.querySelector(".card-actions");
	expect(actions?.querySelector('[data-action="use-on-list"]')).toBeNull();
	expect(text(actions?.querySelector(".note"))).toStartWith(
		"Chiang Mai takes no new purchases",
	);
	expect(text(root.querySelector("h1 small"))).toBe(
		`${card.id} · Kept in Chiang Mai`,
	);
	const hero = root.querySelector<HTMLElement & { locations: unknown[] }>(
		"cc-card-hero",
	);
	expect(hero?.locations).toContainEqual({
		id: "chiang-mai",
		name: "Chiang Mai",
		takesPurchases: false,
	});
});

test("a card kept where purchases are not ticked says so instead of Use on a list", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 });
	await repo.saveCard({ ...card, location: "bangkok", limitGroupId: "pool" });
	const root = await open(repo);

	const actions = root.querySelector(".card-actions");
	expect(actions?.querySelector('[data-action="use-on-list"]')).toBeNull();
	expect(text(actions?.querySelector(".note"))).toBe(
		"Bangkok takes no new purchases, so this card isn't offered on lists. Tick it under Settings › Locations.",
	);
	expect(
		actions?.querySelector('[data-action="settings"]')?.getAttribute("href"),
	).toBe("/settings/locations");
});

const NO_GROUP_NOTE =
	"Give this card a limit group (Edit) to use it on a list.";

test("a card with no limit group says so instead of Use on a list", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = await open(repo);

	expect(root.querySelector('[data-action="use-on-list"]')).toBeNull();
	expect(text(root.querySelector(".card-actions .note"))).toBe(NO_GROUP_NOTE);
});

test("a card whose limit group was deleted says the same", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, limitGroupId: "gone" });
	const root = await open(repo);

	expect(root.querySelector('[data-action="use-on-list"]')).toBeNull();
	expect(text(root.querySelector(".card-actions .note"))).toBe(NO_GROUP_NOTE);
});

test("an archived card says it is archived: archiving, not the place, is why", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, location: "bangkok", archived: true });
	const root = await open(repo);

	const note = text(root.querySelector(".card-actions .note"));
	expect(note).toBe("This card is archived, so it isn't offered on lists.");
	expect(root.querySelector('[data-action="use-on-list"]')).toBeNull();
	expect(root.querySelector("cc-card-statements")).not.toBeNull();
});

test("the comment shows under the stats when set", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, comment: "spare card in the drawer" });
	const root = await open(repo);
	expect(text(root.querySelector(".card-comment"))).toBe(
		"spare card in the drawer",
	);

	await repo.saveCard(card);
	const again = await open(repo);
	expect(again.querySelector(".card-comment")).toBeNull();
});

const pooled = async (repo: InMemoryRepository, limit = 500_000) => {
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit });
	await repo.saveCard({ ...card, limitGroupId: "pool" });
};

const openAddSheet = async (root: HTMLElement) => {
	root.querySelector<HTMLElement>('[data-action="add-purchase"]')?.click();
	await settle();
	const sheet = root.querySelector<CcPurchaseSheet>("cc-purchase-sheet");
	if (!sheet) throw new Error("the add sheet did not open");
	await sheet.updateComplete;
	return sheet;
};

test("the actions read Use on a list, Add purchase, Make a payment", async () => {
	const repo = new InMemoryRepository();
	await pooled(repo);
	const root = await open(repo);
	const actions = [
		...(root.querySelectorAll<HTMLElement>(".card-actions [data-action]") ??
			[]),
	];
	expect(actions.map((el) => el.dataset["action"])).toEqual([
		"use-on-list",
		"add-purchase",
		"pay",
	]);
	expect(actions.map((el) => text(el))).toEqual([
		"Use on a list",
		"Add purchase",
		"Make a payment",
	]);
});

test("a card that can't take a purchase shows the note instead of Add purchase", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = await open(repo);
	expect(root.querySelector('[data-action="add-purchase"]')).toBeNull();
	expect(text(root.querySelector(".card-actions .note"))).toBe(NO_GROUP_NOTE);
});

test("Add purchase opens a blank sheet on this card; a save stores it, stays and reloads", async () => {
	const repo = new InMemoryRepository();
	await pooled(repo);
	const root = await open(repo);
	const sheet = await openAddSheet(root);
	expect(sheet.purchase).toBeNull();
	expect(sheet.card?.id).toBe("kbank");
	await setField(sheet, "amount", "100");
	await setField(sheet, "note", "stamps");
	await submitSheet(sheet);

	expect(root.querySelector("cc-purchase-sheet")).toBeNull();
	expect(visited).toEqual([]);
	const stored = await repo.listPurchases("kbank");
	expect(stored).toHaveLength(1);
	expect(stored[0]).toMatchObject({
		cardId: "kbank",
		date: today(),
		amount: 10_000,
		note: "stamps",
	});
	expect(stored[0]?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	// Within the room, nothing more is said.
	expect(root.querySelector("[data-over-room]")).toBeNull();
	// The page reloaded: the hero counts the new purchase.
	expect(
		root.querySelector<HTMLElement & { owed: number }>("cc-card-hero")?.owed,
	).toBe(10_000);
});

test("a purchase over the room is saved, and the page says by how much over which group", async () => {
	const repo = new InMemoryRepository();
	await pooled(repo, 50_000);
	const root = await open(repo);
	const sheet = await openAddSheet(root);
	await setField(sheet, "amount", "600");
	await submitSheet(sheet);

	expect(await repo.listPurchases("kbank")).toHaveLength(1);
	expect(text(root.querySelector("[data-over-room]"))).toBe(
		"Saved. It went ฿100.00 over the room of Pool.",
	);
	// Opening the sheet again clears it.
	await openAddSheet(root);
	expect(root.querySelector("[data-over-room]")).toBeNull();
});

test("a failed add keeps the sheet, the typing and the reason", async () => {
	const repo = new RejectingPurchaseRepository();
	await pooled(repo);
	const root = await open(repo);
	const sheet = await openAddSheet(root);
	await setField(sheet, "amount", "100");
	await submitSheet(sheet);
	const still = root.querySelector<CcPurchaseSheet>("cc-purchase-sheet");
	expect(still).not.toBeNull();
	await still?.updateComplete;
	expect(still?.error).toContain("Could not save the purchase.");
	expect(
		still?.shadowRoot?.querySelector<HTMLInputElement>('input[name="amount"]')
			?.value,
	).toBe("100");
	expect(bannerMessage(root)).toBe("");
});

test("an unknown card id shows a message instead of a blank page", async () => {
	const repo = new InMemoryRepository();
	const root = await open(repo, "does-not-exist");

	expect(bannerMessage(root)).toContain("does-not-exist");
	expect(root.querySelector("cc-card-statements")).toBeNull();
	expect(
		root.querySelector('a[data-action="back"]')?.getAttribute("href"),
	).toBe("/cards");
});

test("no card id at all shows a message instead of a blank page", async () => {
	const repo = new InMemoryRepository();
	const root = await open(repo, null);

	expect(bannerMessage(root)).toContain("No card was selected.");
});

test('"Show older statements" reveals a period beyond the first twelve', async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);

	const openPeriod = periodOfPurchase(card.cycle, today());
	const farPeriod = addPeriods(openPeriod, -12);
	await repo.savePurchase({
		id: "far",
		cardId: "kbank",
		date: closeDateOf(card.cycle, farPeriod),
		amount: 5_000,
		note: "vintage typewriter",
	});
	const root = await open(repo);

	let list = await statementsOf(root);
	// Counted on the data, not the markup: the list folds empty months into quiet lines.
	expect(list?.statements).toHaveLength(12);
	expect(
		list?.shadowRoot?.querySelector(`[data-period="${farPeriod}"]`),
	).toBeNull();

	const showOlder = root.querySelector<HTMLButtonElement>(
		"[data-action='show-older']",
	);
	expect(text(showOlder)).toBe("Show older statements");
	expect(showOlder?.getAttribute("data-variant")).toBe("quiet");
	showOlder?.click();
	await settle();

	list = await statementsOf(root);
	expect(list?.statements).toHaveLength(24);
	const shadow = await unfold(root, farPeriod);
	expect(text(shadow)).toContain("vintage typewriter");
});

test("lists a statement ahead of the open one when a purchase is dated into it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const aheadPeriod = addPeriods(periodOfPurchase(card.cycle, today()), 2);
	await repo.savePurchase({
		...purchase,
		id: "ahead",
		date: closeDateOf(card.cycle, aheadPeriod),
		note: "booked ahead",
	});
	const root = await open(repo);

	const list = await statementsOf(root);
	expect(list?.statements[0]?.period).toBe(aheadPeriod);
	expect(list?.statements).toHaveLength(12);
	const shadow = await unfold(root, aheadPeriod);
	expect(text(shadow)).toContain("booked ahead");
});

test("deleting a purchase asks twice, then removes it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = await open(repo);

	const shadow = await unfold(root, period);
	shadow
		.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await settle();
	expect(await repo.listPurchases("kbank")).toEqual([purchase]);
	shadow
		.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(await repo.listPurchases("kbank")).toEqual([]);
});

test("a failed delete leaves a message in the banner and keeps the purchase", async () => {
	const repo = new RejectingDeleteRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = await open(repo);

	const shadow = await unfold(root, period);
	shadow
		.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await settle();
	shadow
		.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPurchases("kbank")).toEqual([purchase]);
});

test("Edit opens the purchase sheet; a save keeps addedAt and closes it once written", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase({ ...purchase, addedAt: "2026-10-01T00:00:00.000Z" });
	const root = await open(repo);

	const sheet = await openSheet(root);
	expect(sheet.purchase?.id).toBe("a");
	expect(sheet.card?.id).toBe("kbank");
	const newDate = addDays(purchaseDate, 1);
	await setField(sheet, "date", newDate);
	await setField(sheet, "amount", "500");
	await setField(sheet, "note", "tyres");
	await submitSheet(sheet);

	expect(bannerMessage(root)).toBe("");
	expect(root.querySelector("cc-purchase-sheet")).toBeNull();
	expect(await repo.listPurchases("kbank")).toEqual([
		{
			id: "a",
			cardId: "kbank",
			date: newDate,
			amount: 50_000,
			note: "tyres",
			addedAt: "2026-10-01T00:00:00.000Z",
		},
	]);
});

test("an archived card's purchases can still be edited", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, archived: true });
	await repo.savePurchase(purchase);
	const root = await open(repo);
	const sheet = await openSheet(root);
	await setField(sheet, "amount", "1");
	await submitSheet(sheet);
	expect((await repo.listPurchases("kbank"))[0]?.amount).toBe(100);
});

test("closing the sheet leaves the purchase as it was", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = await open(repo);
	const sheet = await openSheet(root);
	sheet.dispatchEvent(new CustomEvent("close"));
	await settle();
	expect(root.querySelector("cc-purchase-sheet")).toBeNull();
	expect(await repo.listPurchases("kbank")).toEqual([purchase]);
});

test("a failed edit keeps the sheet open with the message, the typing and the old purchase", async () => {
	const repo = new RejectingPurchaseRepository();
	await repo.saveCard(card);
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase);
	const root = await open(repo);

	const sheet = await openSheet(root);
	await setField(sheet, "note", "typed");
	await submitSheet(sheet);

	const still = root.querySelector<CcPurchaseSheet>("cc-purchase-sheet");
	expect(still).not.toBeNull();
	await still?.updateComplete;
	expect(still?.error).toContain("disk is full");
	expect(
		still?.shadowRoot?.querySelector<HTMLInputElement>('input[name="note"]')
			?.value,
	).toBe("typed");
	expect(await repo.listPurchases("kbank")).toEqual([purchase]);
});

test("closing the sheet after a failed edit leaves the banner empty", async () => {
	const repo = new RejectingPurchaseRepository();
	await repo.saveCard(card);
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase);
	const root = await open(repo);

	const sheet = await openSheet(root);
	await submitSheet(sheet);
	await settle();
	root
		.querySelector("cc-purchase-sheet")
		?.dispatchEvent(new CustomEvent("close"));
	await settle();

	expect(root.querySelector("cc-purchase-sheet")).toBeNull();
	expect(bannerMessage(root)).toBe("");
});

test("a failed edit never puts its reason in the page banner, not even for a moment", async () => {
	const repo = new RejectingPurchaseRepository();
	await repo.saveCard(card);
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase);
	const root = await open(repo);
	const banner = root.querySelector<CcErrorBanner>(":scope > cc-error-banner");
	if (!banner) throw new Error("no banner");
	const seen = watchBanner(banner);

	const sheet = await openSheet(root);
	await submitSheet(sheet);
	await settle();

	expect(seen.filter((message) => message !== "")).toEqual([]);
});

test("renders in the chosen language and re-renders on a switch", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = await open(repo);
	expect(root.textContent).toContain("Show older statements");
	expect(text(root.querySelector(".card-statements h2"))).toBe("Statements");

	setLocale("th");
	await settle();
	expect(root.textContent).toContain("ดูใบแจ้งยอดเก่ากว่านี้");
	expect(text(root.querySelector(".card-statements h2"))).toBe("ใบแจ้งยอด");
});

/** Opens the page on a pooled card and adds a purchase ฿100 over the room, so the note shows. */
const overRoomShown = async (
	repo: InMemoryRepository,
	beforeSubmit?: () => Promise<void>,
) => {
	await pooled(repo, 50_000);
	await repo.savePurchase(purchase);
	const root = await open(repo);
	const sheet = await openAddSheet(root);
	await setField(sheet, "amount", "600");
	await beforeSubmit?.();
	await submitSheet(sheet);
	expect(root.querySelector("[data-over-room]")).not.toBeNull();
	return root;
};

test("the over-room note clears when the card is archived", async () => {
	const repo = new InMemoryRepository();
	const root = await overRoomShown(repo);
	await pick(root, "archive");
	expect((await repo.getCard("kbank"))?.archived).toBe(true);
	expect(root.querySelector("[data-over-room]")).toBeNull();
});

test("the over-room note clears when the card is unarchived", async () => {
	const repo = new InMemoryRepository();
	// Archived elsewhere while the sheet was open, so the page reloads on an archived card.
	const root = await overRoomShown(repo, async () => {
		await repo.saveCard({ ...card, limitGroupId: "pool", archived: true });
	});
	expect(
		text(menu(root).shadowRoot?.querySelector('[data-action="archive"]')),
	).toBe("Unarchive card");
	await pick(root, "archive");
	expect((await repo.getCard("kbank"))?.archived).toBe(false);
	expect(root.querySelector("[data-over-room]")).toBeNull();
});

test("the over-room note clears when a purchase is edited", async () => {
	const repo = new InMemoryRepository();
	const root = await overRoomShown(repo);
	const sheet = await openSheet(root);
	expect(root.querySelector("[data-over-room]")).toBeNull();
	await setField(sheet, "note", "diesel");
	await submitSheet(sheet);
	expect((await repo.listPurchases("kbank")).map((p) => p.note)).toContain(
		"diesel",
	);
	expect(root.querySelector("[data-over-room]")).toBeNull();
});

test("the over-room note clears when a purchase is deleted", async () => {
	const repo = new InMemoryRepository();
	const root = await overRoomShown(repo);
	const shadow = await unfold(root, period);
	shadow
		.querySelector<HTMLButtonElement>(
			'[data-purchase="a"] [data-action="delete-purchase"]',
		)
		?.click();
	await settle();
	shadow
		.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	await settle();
	await settle();
	expect((await repo.listPurchases("kbank")).map((p) => p.id)).not.toContain(
		"a",
	);
	expect(root.querySelector("[data-over-room]")).toBeNull();
});
