import { expect, test } from "bun:test";
import "#components/cc-pay-picker";
import type { PayChoice } from "#lib/domain/pay";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card = (id: string, name: string, last4 = "1234"): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
});

const bill = (dueDate: string) => ({
	period: "2026-09",
	cardId: "x",
	closeDate: "2026-09-25",
	dueDate,
	total: 0,
	paidAmount: 0,
	remaining: 0,
	parts: [],
	open: false,
});

const choices = (): PayChoice[] =>
	[
		{
			card: card("A", "Alpha"),
			owed: 500_00,
			credit: 0,
			bill: bill("2026-10-28"),
			urgency: "overdue",
			days: 3,
		},
		{
			card: card("B", "Beta", "9999"),
			owed: 200_00,
			credit: 0,
			bill: bill("2026-11-02"),
			urgency: "soon",
			days: 2,
		},
		{
			card: card("C", "Gamma"),
			owed: 100_00,
			credit: 0,
			bill: bill("2026-11-20"),
			urgency: "due",
			days: 20,
		},
		{
			card: card("D", "Delta"),
			owed: 0,
			credit: 50_00,
			bill: null,
			urgency: "none",
			days: 0,
		},
		{
			card: card("E", "Echo"),
			owed: 0,
			credit: 0,
			bill: null,
			urgency: "none",
			days: 0,
		},
	] as unknown as PayChoice[];

const mount = async () => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-pay-picker");
	element.choices = choices();
	element.today = "2026-10-31";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const rows = (el: HTMLElement) => [
	...(el.shadowRoot?.querySelectorAll<HTMLAnchorElement>("a[data-card]") ?? []),
];
const flat = (e: Element | null | undefined) =>
	e?.textContent?.replace(/\s+/g, " ").trim() ?? "";

test("rows keep the given order and link to the form", async () => {
	const el = await mount();
	expect(rows(el).map((r) => r.dataset["card"])).toEqual([
		"A",
		"B",
		"C",
		"D",
		"E",
	]);
	expect(rows(el)[0]?.getAttribute("href")).toBe("/pay?card=A");
});

test("tags say it in words", async () => {
	const el = await mount();
	const tag = (i: number) => flat(rows(el)[i]?.querySelector(".tag"));
	expect(tag(0)).toBe("Overdue 3 days");
	expect(tag(1)).toBe("Due in 2 days");
	expect(tag(2)).toBe("Due 20 Nov 2026");
	expect(tag(3)).toBe("Credit ฿50.00");
	expect(tag(4)).toBe("Nothing owed");
	expect(rows(el)[0]?.querySelector(".tag")?.getAttribute("data-urgency")).toBe(
		"overdue",
	);
	expect(flat(rows(el)[0]?.querySelector("[data-numeric]"))).toBe("฿500.00");
	expect(flat(rows(el)[0])).toContain("A) Alpha (1234)");
});

test("search narrows the rows, and an empty result says what to do", async () => {
	const el = await mount();
	const input = el.shadowRoot?.querySelector<HTMLInputElement>(
		'input[type="search"]',
	);
	if (!input) throw new Error("no search");
	input.value = "9999";
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
	expect(rows(el).map((r) => r.dataset["card"])).toEqual(["B"]);
	input.value = "zzz";
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
	expect(rows(el)).toHaveLength(0);
	expect(flat(el.shadowRoot?.querySelector(".empty"))).toBe(
		"No card matches. Clear the search.",
	);
});

test("a card id with & and a space survives the link", async () => {
	setLocale("en");
	document.body.innerHTML = "";
	const el = document.createElement("cc-pay-picker");
	el.choices = [
		{ ...choices()[4], card: card("A&B 1", "Odd") },
	] as unknown as PayChoice[];
	el.today = "2026-10-31";
	document.body.append(el);
	await el.updateComplete;
	const href = rows(el)[0]?.getAttribute("href") ?? "";
	expect(new URLSearchParams(href.split("?")[1]).get("card")).toBe("A&B 1");
});

test("with no cards at all it says to add one, linking to Cards", async () => {
	setLocale("en");
	document.body.innerHTML = "";
	const el = document.createElement("cc-pay-picker");
	el.choices = [];
	document.body.append(el);
	await el.updateComplete;
	const empty = el.shadowRoot?.querySelector(".empty");
	expect(empty?.textContent?.replace(/\s+/g, " ").trim()).toBe(
		"No cards yet. Add one on the Cards page.",
	);
	expect(empty?.querySelector("a")?.getAttribute("href")).toBe("/cards");
});
