import { afterEach, expect, test } from "bun:test";
import type { CcModal } from "#components/cc-modal";
import type { CcPayForm } from "#components/cc-pay-form";
import type { CcPayPicker } from "#components/cc-pay-picker";
import type { CardPayment } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { mountPayHost, openPayment, type PayRequest } from "#lib/ui/pay-sheet";
import { renderShell } from "#lib/ui/shell";
import { CLOCK, flatText, seed, settle } from "../../routes/list/test-support";

let dispose: (() => void) | null = null;
afterEach(() => {
	dispose?.();
	dispose = null;
});

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
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en");
	document.body.innerHTML = "";
	await seed(repo);
	await before?.(repo);
	let reloads = 0;
	dispose = mountPayHost(repo, {
		clock: CLOCK,
		reload: () => {
			reloads++;
		},
	});
	return { repo, reloads: () => reloads };
};

const open = async (request?: PayRequest) => {
	openPayment(request);
	await settle(5);
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

const submitText = () => flatText(inner(form(), 'button[type="submit"]')) ?? "";

test("closed until asked, then the floating Payment button opens the card picker", async () => {
	await setup();
	expect(modal()).toBeNull();
	const tabbar = document.createElement("div");
	tabbar.id = "tabbar";
	document.body.append(tabbar);
	renderShell({
		path: "/",
		today: "2026-10-31",
		environment: "production",
		pr: "",
	});
	document.querySelector<HTMLButtonElement>(".fab")?.click();
	await settle(5);

	expect(modal()?.heading).toBe("Make a payment");
	expect((await pickerRows()).map((r) => r.dataset["card"])).toEqual([
		"A",
		"B",
	]);
	expect(form()).toBeNull();
});

test("a cc:pay event with a card opens straight on its form, with the amount given", async () => {
	await setup(withStatement);
	await open({ cardId: "A", amount: 12050 });
	expect(picker()).toBeNull();
	await form()?.updateComplete;
	expect(inner<HTMLInputElement>(form(), '[name="amount"]')?.value).toBe(
		"120.50",
	);
	expect(submitText()).toBe("Record ฿120.50 to A card");
});

test("without an amount the form starts at the next bill, or empty with none", async () => {
	await setup(withStatement);
	await open({ cardId: "A" });
	await form()?.updateComplete;
	expect(inner<HTMLInputElement>(form(), '[name="amount"]')?.value).toBe(
		"10000",
	);
	await open({ cardId: "B" });
	await form()?.updateComplete;
	expect(inner<HTMLInputElement>(form(), '[name="amount"]')?.value).toBe("");
	expect(submitText()).toBe("Enter an amount");
});

test("picking a card shows its form, and Change goes back to the picker", async () => {
	await setup(withStatement);
	await open();
	(await pickerRows())[0]?.click();
	await settle();
	expect(picker()).toBeNull();
	expect(form()?.card?.id).toBe("A");
	await form()?.updateComplete;
	inner<HTMLButtonElement>(form(), '[data-action="change"]')?.click();
	await settle();
	expect(form()).toBeNull();
	expect(picker()).not.toBeNull();
});

test("an unknown card says so above the picker", async () => {
	await setup();
	await open({ cardId: "nope" });
	expect(flatText(document.querySelector("[data-missing]"))).toBe(
		"That card isn't here any more.",
	);
	expect(picker()).not.toBeNull();
});

test("a paid payment is stored, its statement dates kept, the sheet closed and the page reloaded", async () => {
	const { repo, reloads } = await setup(withStatement);
	await open({ cardId: "A" });
	await fill("amount", "100");
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
	} satisfies Partial<CardPayment>);
	expect(modal()).toBeNull();
	expect(reloads()).toBe(1);
});

test("a later date stores a planned payment and freezes nothing", async () => {
	const { repo, reloads } = await setup(withStatement);
	await open({ cardId: "A" });
	await fill("amount", "100");
	await fill("date", "2026-11-05");
	expect(submitText()).toBe("Plan ฿100.00 to A card on 05 Nov 2026");
	await submit();
	expect(await repo.listStatementDates("A")).toEqual([]);
	const [payment] = await repo.listCardPayments("A");
	expect(payment).toMatchObject({ status: "planned", date: "2026-11-05" });
	expect(reloads()).toBe(1);
});

test("two quick submits save one payment", async () => {
	const { repo, reloads } = await setup(withStatement);
	await open({ cardId: "A" });
	await fill("amount", "100");
	const element = inner<HTMLFormElement>(form(), "form");
	element?.dispatchEvent(new Event("submit", { cancelable: true }));
	element?.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle(10);
	expect(await repo.listCardPayments("A")).toHaveLength(1);
	expect(reloads()).toBe(1);
});

test("a failed save keeps the sheet and the typing, says why, and frees the button", async () => {
	const { repo, reloads } = await setup(async (repo) => {
		repo.saveCardPayment = () => Promise.reject(new Error("disk full"));
	});
	await open({ cardId: "A" });
	await fill("amount", "100");
	await submit();
	await form()?.updateComplete;
	expect(modal()).not.toBeNull();
	expect(reloads()).toBe(0);
	expect(inner<HTMLInputElement>(form(), '[name="amount"]')?.value).toBe("100");
	expect(form()?.error).toContain("Could not save the payment.");
	expect(
		inner<HTMLButtonElement>(form(), 'button[type="submit"]')?.disabled,
	).toBe(false);
	expect(await repo.listCardPayments("A")).toHaveLength(0);
});

test("Escape and Close shut the sheet", async () => {
	await setup();
	await open();
	inner(modal(), "dialog")?.dispatchEvent(
		new Event("cancel", { cancelable: true }),
	);
	await settle();
	expect(modal()).toBeNull();

	await open();
	inner<HTMLButtonElement>(modal(), '[data-action="close"]')?.click();
	await settle();
	expect(modal()).toBeNull();
});

test("a read failure shows in the sheet", async () => {
	const repo = new InMemoryRepository();
	await setup(undefined, repo);
	repo.listCards = () => Promise.reject(new Error("boom"));
	await open();
	expect(
		document.querySelector<HTMLElement & { message: string }>("cc-error-banner")
			?.message,
	).toContain("Could not read your cards.");
});
