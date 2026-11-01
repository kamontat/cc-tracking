import { expect, test } from "bun:test";
import type { CcModal } from "#components/cc-modal";
import type { CcPurchasePicker } from "#components/cc-purchase-picker";
import type { CcPurchaseSheet } from "#components/cc-purchase-sheet";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	CLOCK,
	card,
	flatText,
	mount,
	seed,
	settle,
} from "./list/test-support";
import type { PayAddressBar } from "./pay-page";
import { renderPurchasePage } from "./purchase-page";

/** An address bar that records what the page did to it, and can play Back and Forward. */
const fakeBar = (start: string) => {
	const entries = [start];
	let at = 0;
	const calls: string[] = [];
	let pop = () => {};
	const bar: PayAddressBar = {
		search: () => {
			const entry = entries[at] ?? "";
			const q = entry.indexOf("?");
			return q === -1 ? "" : entry.slice(q);
		},
		push: (url) => {
			calls.push(`push ${url}`);
			entries.splice(at + 1, entries.length, url);
			at++;
		},
		replace: (url) => {
			calls.push(`replace ${url}`);
			entries[at] = url;
		},
		onPop: (listener) => {
			pop = listener;
		},
		length: () => entries.length,
		back: () => {
			calls.push("back");
			at = Math.max(0, at - 1);
			pop();
		},
	};
	const forward = () => {
		at = Math.min(entries.length - 1, at + 1);
		pop();
	};
	return { bar, calls, entries, forward, now: () => entries[at] };
};

/** Two places ticked, a card in each order, and cards that can't take a purchase. */
const places = async (repo: Repository) => {
	await repo.saveSettings({ purchaseLocations: ["krabi", "phichit"] });
	await repo.saveCard(card("P", { location: "phichit" }));
	await repo.saveCard(card("C", { location: "bangkok" }));
	const { limitGroupId: _, ...noGroup } = card("N");
	await repo.saveCard(noGroup);
};

const setup = async (
	start: string,
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en");
	document.documentElement.removeAttribute("data-purchase-page");
	await seed(repo);
	await before?.(repo);
	const root = mount();
	const address = fakeBar(start);
	const visited: string[] = [];
	renderPurchasePage(repo, root, {
		clock: CLOCK,
		now: () => new Date("2026-10-31T03:00:00.000Z"),
		address: address.bar,
		navigate: (url) => {
			visited.push(url);
		},
	});
	await settle(5);
	return { repo, root, address, visited };
};

const sheet = () =>
	document.querySelector<CcPurchaseSheet>("cc-purchase-sheet");
const modal = () =>
	sheet()?.shadowRoot?.querySelector<CcModal>("cc-modal[sheet]") ?? null;
const picker = () =>
	document.querySelector<CcPurchasePicker>("cc-purchase-picker");

const pickerRows = async () => {
	await picker()?.updateComplete;
	return [
		...(picker()?.shadowRoot?.querySelectorAll<HTMLButtonElement>(
			"button[data-card]",
		) ?? []),
	];
};

const fill = async (name: string, value: string) => {
	const el = sheet();
	await el?.updateComplete;
	const input = el?.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!el || !input) throw new Error(`no ${name}`);
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
};

const submit = async () => {
	sheet()
		?.shadowRoot?.querySelector("form")
		?.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle(10);
};

const closeSheet = async () => {
	await sheet()?.updateComplete;
	modal()
		?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="close"]')
		?.click();
	await settle();
};

test("/purchase is a card picker under a back header, with no sheet, and hides + New", async () => {
	const { root } = await setup("/purchase");
	expect(flatText(root.querySelector(".back-header h1"))).toBe("Add purchase");
	expect(sheet()).toBeNull();
	expect(document.documentElement.hasAttribute("data-purchase-page")).toBe(
		true,
	);
	const css = await Bun.file("src/styles/app.css").text();
	expect(css).toMatch(/:root\[data-purchase-page\] \.fab-menu,/);
});

test("the picker offers only cards that can take a purchase, by place then id", async () => {
	await setup("/purchase", places);
	// Phichit comes before Krabi in the places' order; Bangkok is not ticked, N has no group
	// and Z is archived.
	expect((await pickerRows()).map((r) => r.dataset["card"])).toEqual([
		"P",
		"A",
		"B",
	]);
	expect(flatText((await pickerRows())[1])).toContain("A) A card");
});

test("the picker's search narrows by id, name or last 4", async () => {
	await setup("/purchase", places);
	await picker()?.updateComplete;
	const search = picker()?.shadowRoot?.querySelector<HTMLInputElement>(
		'input[type="search"]',
	);
	if (!search) throw new Error("no search");
	search.value = "b";
	search.dispatchEvent(new Event("input"));
	expect((await pickerRows()).map((r) => r.dataset["card"])).toEqual(["B"]);
});

test("with no card to take a purchase the picker says what to do", async () => {
	await setup("/purchase", (repo) =>
		repo.saveSettings({ purchaseLocations: [] }),
	);
	await picker()?.updateComplete;
	expect(
		flatText(picker()?.shadowRoot?.querySelector("[data-empty]")),
	).toContain("Settings");
});

test("/purchase?card= opens the add sheet over the picker", async () => {
	await setup("/purchase?card=A");
	expect(picker()).not.toBeNull();
	await sheet()?.updateComplete;
	expect(modal()?.heading).toBe("Add purchase");
	expect(sheet()?.card?.id).toBe("A");
	expect(sheet()?.purchase).toBeNull();
	expect(sheet()?.today).toBe("2026-10-31");
});

test("picking a card pushes its address and opens its sheet; Back closes it", async () => {
	const { address } = await setup("/purchase");
	(await pickerRows())[0]?.click();
	await settle();
	expect(address.calls).toEqual(["push /purchase?card=A"]);
	expect(sheet()?.card?.id).toBe("A");
	address.bar.back();
	await settle();
	expect(sheet()).toBeNull();
	expect(picker()).not.toBeNull();
});

test("closing a sheet the page pushed steps back; one opened from a link rewrites", async () => {
	const pushed = await setup("/purchase");
	(await pickerRows())[0]?.click();
	await settle();
	await closeSheet();
	expect(pushed.address.calls).toEqual(["push /purchase?card=A", "back"]);
	expect(sheet()).toBeNull();

	const linked = await setup("/purchase?card=A");
	await closeSheet();
	expect(linked.address.calls).toEqual(["replace /purchase"]);
	expect(linked.address.entries).toEqual(["/purchase"]);
	expect(sheet()).toBeNull();
});

test("the back header steps back, or goes to Transactions with nothing behind", async () => {
	const { root, visited, address } = await setup("/purchase");
	root.querySelector<HTMLElement>('.back-header [data-action="back"]')?.click();
	await settle();
	expect(visited).toEqual(["/transactions"]);
	expect(address.calls).toEqual([]);
});

test("an unknown card, or one that can't take a purchase, says so and opens no sheet", async () => {
	await setup("/purchase?card=nope");
	expect(flatText(document.querySelector("[data-missing]"))).toBe(
		"That card isn't here any more, or can't take a purchase.",
	);
	expect(sheet()).toBeNull();
	await setup("/purchase?card=Z");
	expect(document.querySelector("[data-missing]")).not.toBeNull();
	expect(sheet()).toBeNull();
});

test("a save stores the purchase, stamped now, and the card page replaces this one", async () => {
	const { repo, visited } = await setup("/purchase?card=A");
	await fill("amount", "120.50");
	await fill("note", " parcel ");
	await submit();
	const stored = await repo.listPurchases("A");
	expect(stored).toHaveLength(1);
	expect(stored[0]).toMatchObject({
		cardId: "A",
		date: "2026-10-31",
		amount: 120_50,
		note: "parcel",
		addedAt: "2026-10-31T03:00:00.000Z",
	});
	expect(visited).toEqual(["/card?id=A"]);
});

test("a save over the room hands the amount over to the card page", async () => {
	const { visited } = await setup("/purchase?card=A");
	await fill("amount", "100001");
	await submit();
	expect(visited).toEqual(["/card?id=A&over=100"]);
});

test("a failed save keeps the sheet and the typing, says why; a retry writes one record", async () => {
	let fail = true;
	const { repo, visited } = await setup("/purchase?card=A", async (repo) => {
		const save = repo.savePurchase.bind(repo);
		repo.savePurchase = (p) =>
			fail ? Promise.reject(new Error("disk full")) : save(p);
	});
	await fill("amount", "100");
	await submit();
	await sheet()?.updateComplete;
	expect(sheet()).not.toBeNull();
	expect(visited).toEqual([]);
	expect(sheet()?.error).toContain("Could not save the purchase.");
	expect(
		sheet()?.shadowRoot?.querySelector<HTMLInputElement>('[name="amount"]')
			?.value,
	).toBe("100");
	fail = false;
	await submit();
	expect(await repo.listPurchases("A")).toHaveLength(1);
	expect(visited).toEqual(["/card?id=A"]);
});

test("a read failure shows on the page", async () => {
	await setup("/purchase", async (r) => {
		r.listCards = () => Promise.reject(new Error("boom"));
	});
	expect(
		document.querySelector<HTMLElement & { message: string }>("cc-error-banner")
			?.message,
	).toContain("Could not read your cards.");
});
