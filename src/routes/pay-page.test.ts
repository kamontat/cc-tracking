import { expect, test } from "bun:test";
import type { CcModal } from "#components/cc-modal";
import type { CcPayForm } from "#components/cc-pay-form";
import type { CcPayPicker } from "#components/cc-pay-picker";
import {
	DEFAULT_TX_FILTER,
	filterEntries,
	ledgerEntries,
} from "#lib/domain/transactions";
import type { CardPayment } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	exportBackupV3,
	importBackupV3,
	parseAnyBackup,
} from "#lib/storage/transfer-v3";
import { CLOCK, flatText, mount, seed, settle } from "./list/test-support";
import { type PayAddressBar, renderPayPage } from "./pay-page";

/** An address bar that records what the page did to it, and can play Back. */
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
	return { bar, calls, entries, now: () => entries[at] };
};

const withStatement = async (repo: Repository) => {
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-09-10",
		amount: 10_000_00,
		note: "fuel",
	});
};

const setup = async (
	start: string,
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en");
	document.documentElement.removeAttribute("data-pay-page");
	await seed(repo);
	await before?.(repo);
	const root = mount();
	const address = fakeBar(start);
	const visited: string[] = [];
	renderPayPage(repo, root, {
		clock: CLOCK,
		address: address.bar,
		navigate: (url) => {
			visited.push(url);
		},
	});
	await settle(5);
	return { repo, root, address, visited };
};

const modal = () => document.querySelector<CcModal>("cc-modal[sheet]");
const picker = () => document.querySelector<CcPayPicker>("cc-pay-picker");
const form = () => document.querySelector<CcPayForm>("cc-pay-form");
const inner = <T extends Element>(el: Element | null, selector: string) =>
	el?.shadowRoot?.querySelector<T>(selector) ?? null;

const pickerRows = async () => {
	await picker()?.updateComplete;
	return [
		...(picker()?.shadowRoot?.querySelectorAll<HTMLButtonElement>(
			"button[data-card]",
		) ?? []),
	];
};

const fill = async (name: string, value: string) => {
	const el = form();
	await el?.updateComplete;
	const input = inner<HTMLInputElement>(el, `[name="${name}"]`);
	if (!el || !input) throw new Error(`no ${name}`);
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
};

const submit = async () => {
	inner<HTMLFormElement>(form(), "form")?.dispatchEvent(
		new Event("submit", { cancelable: true }),
	);
	await settle(10);
};

const amountValue = async () => {
	await form()?.updateComplete;
	return inner<HTMLInputElement>(form(), '[name="amount"]')?.value;
};

const submitText = () => flatText(inner(form(), 'button[type="submit"]')) ?? "";

test("/pay is the card picker under a back header, with no sheet, and hides the Payment button", async () => {
	const { root } = await setup("/pay");
	expect(flatText(root.querySelector(".back-header h1"))).toBe(
		"Make a payment",
	);
	expect((await pickerRows()).map((r) => r.dataset["card"])).toEqual([
		"A",
		"B",
	]);
	expect(modal()).toBeNull();
	expect(document.documentElement.hasAttribute("data-pay-page")).toBe(true);
	const css = await Bun.file("src/styles/app.css").text();
	expect(css).toMatch(/:root\[data-pay-page\] \.fab,/);
});

test("/pay?card= opens the sheet over the picker, the amount prefilled from the address", async () => {
	await setup("/pay?card=A&amount=12050", withStatement);
	expect(picker()).not.toBeNull();
	expect(modal()?.heading).toBe("Make a payment");
	expect(form()?.card?.id).toBe("A");
	expect(await amountValue()).toBe("120.50");
	expect(submitText()).toBe("Record ฿120.50 to A card");
});

test("without an amount the sheet starts at the next bill, or empty with none", async () => {
	await setup("/pay?card=A", withStatement);
	expect(await amountValue()).toBe("10000");
	await setup("/pay?card=B", withStatement);
	expect(await amountValue()).toBe("");
	expect(submitText()).toBe("Enter an amount");
});

test("picking a card pushes its address and opens its sheet; Back closes it", async () => {
	const { address } = await setup("/pay", withStatement);
	(await pickerRows())[0]?.click();
	await settle();
	expect(address.calls).toEqual(["push /pay?card=A"]);
	expect(modal()).not.toBeNull();
	expect(form()?.card?.id).toBe("A");
	// The browser's Back pops the entry the pick pushed, and the sheet goes with it.
	address.bar.back();
	await settle();
	expect(modal()).toBeNull();
	expect(picker()).not.toBeNull();
});

test("Close, Escape and Change take the card out of the address and leave the picker", async () => {
	const { address } = await setup("/pay?card=A&amount=500", withStatement);
	inner<HTMLButtonElement>(modal(), '[data-action="close"]')?.click();
	await settle();
	expect(modal()).toBeNull();
	expect(address.calls).toEqual(["replace /pay"]);
	expect(address.now()).toBe("/pay");
	expect(picker()).not.toBeNull();

	(await pickerRows())[1]?.click();
	await settle();
	inner(modal(), "dialog")?.dispatchEvent(
		new Event("cancel", { cancelable: true }),
	);
	await settle();
	expect(modal()).toBeNull();
	expect(address.now()).toBe("/pay");

	(await pickerRows())[0]?.click();
	await settle();
	await form()?.updateComplete;
	inner<HTMLButtonElement>(form(), '[data-action="change"]')?.click();
	await settle();
	expect(modal()).toBeNull();
	expect(address.calls.slice(-1)).toEqual(["replace /pay"]);
});

test("an unknown card says so above the picker and opens no sheet", async () => {
	await setup("/pay?card=nope");
	expect(flatText(document.querySelector("[data-missing]"))).toBe(
		"That card isn't here any more.",
	);
	expect(modal()).toBeNull();
	expect(picker()).not.toBeNull();
});

test("a paid payment is stored with its note, statement dates kept, then Transactions replaces the page", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement);
	await fill("amount", "100");
	await fill("note", "  From savings  ");
	expect(submitText()).toBe("Record ฿100.00 to A card");
	await submit();
	expect((await repo.listStatementDates("A")).map((d) => d.period)).toEqual([
		"2026-09",
	]);
	const stored = await repo.listCardPayments("A");
	expect(stored).toHaveLength(1);
	expect(stored[0]).toMatchObject({
		cardId: "A",
		amount: 10000,
		date: "2026-10-31",
		status: "paid",
		note: "From savings",
	} satisfies Partial<CardPayment>);
	expect(visited).toEqual(["/transactions"]);
});

test("a blank note stores no note", async () => {
	const { repo } = await setup("/pay?card=A", withStatement);
	await fill("amount", "100");
	await fill("note", "   ");
	await submit();
	const [payment] = await repo.listCardPayments("A");
	expect(payment && "note" in payment).toBe(false);
});

test("a later date stores a planned payment and freezes nothing", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement);
	await fill("amount", "100");
	await fill("date", "2026-11-05");
	expect(submitText()).toBe("Plan ฿100.00 to A card on 05 Nov 2026");
	await submit();
	expect(await repo.listStatementDates("A")).toEqual([]);
	const [payment] = await repo.listCardPayments("A");
	expect(payment).toMatchObject({ status: "planned", date: "2026-11-05" });
	expect(visited).toEqual(["/transactions"]);
});

test("two quick submits save one payment", async () => {
	const { repo, visited } = await setup("/pay?card=A", withStatement);
	await fill("amount", "100");
	const element = inner<HTMLFormElement>(form(), "form");
	element?.dispatchEvent(new Event("submit", { cancelable: true }));
	element?.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle(10);
	expect(await repo.listCardPayments("A")).toHaveLength(1);
	expect(visited).toEqual(["/transactions"]);
});

test("a failed save keeps the sheet and the typing, says why, and frees the button", async () => {
	const { repo, visited } = await setup("/pay?card=A", async (repo) => {
		repo.saveCardPayment = () => Promise.reject(new Error("disk full"));
	});
	await fill("amount", "100");
	await fill("note", "From savings");
	await submit();
	await form()?.updateComplete;
	expect(modal()).not.toBeNull();
	expect(visited).toEqual([]);
	expect(await amountValue()).toBe("100");
	expect(inner<HTMLInputElement>(form(), '[name="note"]')?.value).toBe(
		"From savings",
	);
	expect(form()?.error).toContain("Could not save the payment.");
	expect(
		inner<HTMLButtonElement>(form(), 'button[type="submit"]')?.disabled,
	).toBe(false);
	expect(await repo.listCardPayments("A")).toHaveLength(0);
});

test("a read failure shows on the page", async () => {
	const repo = new InMemoryRepository();
	await setup(
		"/pay",
		async (r) => {
			r.listCards = () => Promise.reject(new Error("boom"));
		},
		repo,
	);
	expect(
		document.querySelector<HTMLElement & { message: string }>("cc-error-banner")
			?.message,
	).toContain("Could not read your cards.");
});

test("a payment's note goes from the sheet to the ledger's search and through a backup", async () => {
	const { repo } = await setup("/pay?card=A", withStatement);
	await fill("amount", "100");
	await fill("note", "From savings");
	await submit();

	const search = async (from: Repository) =>
		filterEntries(
			ledgerEntries(
				await from.listCards(),
				[],
				await from.listCardPayments("A"),
			),
			{ ...DEFAULT_TX_FILTER, q: "savings" },
			"2026-10-31",
		).map((entry) =>
			entry.kind === "payment" ? entry.payment.note : undefined,
		);
	expect(await search(repo)).toEqual(["From savings"]);

	const restored = new InMemoryRepository();
	await importBackupV3(
		restored,
		parseAnyBackup(JSON.stringify(await exportBackupV3(repo, new Date()))),
	);
	expect(await search(restored)).toEqual(["From savings"]);
});
