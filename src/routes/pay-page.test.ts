import { expect, test } from "bun:test";
import type { CcPayForm } from "#components/cc-pay-form";
import type { CardPayment } from "#lib/domain/types";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import type { ListPageOptions } from "./list/common";
import { bannerText, flatText, settle, setupPage } from "./list/test-support";
import { renderPayPage } from "./pay-page";

const open = (search: string, before?: (repo: Repository) => Promise<void>) =>
	setupPage(renderPayPage, { search, before });

const form = (root: HTMLElement) =>
	root.querySelector<CcPayForm>("cc-pay-form") as CcPayForm;
const inner = <T extends Element>(el: Element, selector: string) =>
	el.shadowRoot?.querySelector<T>(selector) as T;

const fill = async (el: CcPayForm, name: string, value: string) => {
	const input = inner<HTMLInputElement>(el, `[name="${name}"]`);
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
};
const submit = async (el: CcPayForm) => {
	inner<HTMLFormElement>(el, "form").dispatchEvent(
		new Event("submit", { cancelable: true }),
	);
	await settle(5);
};

test("without a card it asks which one, archived cards left out", async () => {
	const { root } = await open("");
	expect(flatText(root.querySelector("h2"))).toBe("Which card?");
	expect(flatText(root.querySelector("[data-missing]"))).toBe("");
	const picker = root.querySelector("cc-pay-picker");
	const ids = [
		...(picker?.shadowRoot?.querySelectorAll<HTMLElement>("a[data-card]") ??
			[]),
	].map((a) => a.dataset["card"]);
	expect(ids).toEqual(["A", "B"]);
	expect(root.querySelector('[data-action="back"]')).not.toBeNull();
	expect(document.documentElement.hasAttribute("data-list-page")).toBe(true);
});

test("an unknown card says so above the picker", async () => {
	const { root } = await open("?card=nope");
	expect(flatText(root.querySelector("[data-missing]"))).toBe(
		"That card isn't here any more.",
	);
	expect(root.querySelector("cc-pay-picker")).not.toBeNull();
});

test("a known card shows the form, amount prefilled", async () => {
	const { root } = await open("?card=A&amount=12050");
	const el = form(root);
	await el.updateComplete;
	expect(inner<HTMLInputElement>(el, '[name="amount"]').value).toBe("120.50");
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

test("a paid payment is stored and the page leaves for Transactions", async () => {
	const { root, repo, visited } = await open("?card=A", withStatement);
	const el = form(root);
	await fill(el, "amount", "100");
	await submit(el);
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
	expect(visited).toEqual(["/transactions"]);
});

test("a later date stores a planned payment", async () => {
	const { root, repo, visited } = await open("?card=A", withStatement);
	const el = form(root);
	await fill(el, "amount", "100");
	await fill(el, "date", "2026-11-05");
	await submit(el);
	expect(await repo.listStatementDates("A")).toEqual([]);
	const [payment] = await repo.listCardPayments("A");
	expect(payment).toMatchObject({ status: "planned", date: "2026-11-05" });
	expect(visited).toEqual(["/transactions"]);
});

test("a failed save keeps the amount, shows why and stays", async () => {
	const { root, visited } = await open("?card=A", async (repo) => {
		repo.saveCardPayment = () => Promise.reject(new Error("disk full"));
	});
	const el = form(root);
	await fill(el, "amount", "100");
	await submit(el);
	await settle(5);
	expect(visited).toEqual([]);
	expect(inner<HTMLInputElement>(form(root), '[name="amount"]').value).toBe(
		"100",
	);
	expect(form(root).error).toContain("Could not save the payment.");
	expect(bannerText(root)).toBe("");
});

test("the pay page is in the build", async () => {
	const html = await Bun.file(`${import.meta.dir}/pay.html`).text();
	expect(html).toContain('<script type="module" src="./pay.ts"></script>');
	expect(html).toContain('<link rel="icon" href="./favicon.svg"');
});

test("two quick pay events save one payment", async () => {
	const { root, repo, visited } = await open("?card=A", withStatement);
	const el = form(root);
	await fill(el, "amount", "100");
	const form1 = inner<HTMLFormElement>(el, "form");
	form1.dispatchEvent(new Event("submit", { cancelable: true }));
	form1.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle(10);
	expect(await repo.listCardPayments("A")).toHaveLength(1);
	expect(visited).toEqual(["/transactions"]);
});

test("a failed save frees the form to try again", async () => {
	const { root, repo } = await open("?card=A", async (repo) => {
		repo.saveCardPayment = () => Promise.reject(new Error("disk full"));
	});
	const el = form(root);
	await fill(el, "amount", "100");
	await submit(el);
	await el.updateComplete;
	expect(inner<HTMLButtonElement>(el, 'button[type="submit"]').disabled).toBe(
		false,
	);
	expect(await repo.listCardPayments("A")).toHaveLength(0);
});

const openWith = async (
	search: string,
	extra: { historyLength: () => number; goBack: () => void },
) => {
	const wrapped = (
		repo: Repository,
		root: HTMLElement,
		options: Required<ListPageOptions>,
	) => renderPayPage(repo, root, { ...options, ...extra });
	return setupPage(wrapped, { search });
};

test("Back goes to the previous page when there is one", async () => {
	let backs = 0;
	const { root, visited } = await openWith("", {
		historyLength: () => 3,
		goBack: () => {
			backs++;
		},
	});
	root.querySelector<HTMLElement>('[data-action="back"]')?.click();
	expect(backs).toBe(1);
	expect(visited).toEqual([]);
});

test("Back goes to Transactions when this is the first page", async () => {
	let backs = 0;
	const { root, visited } = await openWith("", {
		historyLength: () => 1,
		goBack: () => {
			backs++;
		},
	});
	root.querySelector<HTMLElement>('[data-action="back"]')?.click();
	expect(backs).toBe(0);
	expect(visited).toEqual(["/transactions"]);
});

test("a load failure reads as a read error", async () => {
	const repo = new InMemoryRepository();
	repo.listCards = () => Promise.reject(new Error("boom"));
	const { root } = await setupPage(renderPayPage, { search: "", repo });
	expect(bannerText(root)).toContain("Could not read");
});
