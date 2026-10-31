import { expect, test } from "bun:test";
import "#components/cc-pay-form";
import type { PayDetail } from "#components/cc-pay-form";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "A",
	name: "Alpha",
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
};

const mount = async (
	figures = { owed: 500_00, credit: 0, nextBill: 300_00, overdue: false },
	amount = "",
) => {
	setLocale("en");
	document.body.innerHTML = "";
	const el = document.createElement("cc-pay-form");
	el.card = card;
	el.figures = figures;
	el.today = "2026-10-31";
	el.amount = amount;
	document.body.append(el);
	await el.updateComplete;
	return el;
};

const q = <T extends Element>(el: HTMLElement, selector: string) =>
	el.shadowRoot?.querySelector<T>(selector) ?? null;
const flat = (e: Element | null | undefined) =>
	e?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const type = async (
	el: HTMLElement & { updateComplete: Promise<unknown> },
	name: string,
	value: string,
) => {
	const input = q<HTMLInputElement>(el, `[name="${name}"]`);
	if (!input) throw new Error(`no ${name}`);
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await el.updateComplete;
};
const submitText = (el: HTMLElement) => flat(q(el, 'button[type="submit"]'));

test("shows the card, figures and a Change link", async () => {
	const el = await mount();
	expect(
		q<HTMLAnchorElement>(el, '[data-action="change"]')?.getAttribute("href"),
	).toBe("/pay");
	expect(flat(el.shadowRoot?.querySelector(".card"))).toContain(
		"A) Alpha (1234)",
	);
	expect(flat(q(el, "dl"))).toContain("฿500.00");
});

test("the button asks for an amount until there is one", async () => {
	const el = await mount();
	expect(submitText(el)).toBe("Enter an amount");
	expect(q<HTMLButtonElement>(el, 'button[type="submit"]')?.disabled).toBe(
		true,
	);
	await type(el, "amount", "abc");
	expect(q<HTMLButtonElement>(el, 'button[type="submit"]')?.disabled).toBe(
		true,
	);
	await type(el, "amount", "120.5");
	expect(submitText(el)).toBe("Record ฿120.50 to A");
	expect(q<HTMLButtonElement>(el, 'button[type="submit"]')?.disabled).toBe(
		false,
	);
});

test("a later date plans the payment", async () => {
	const el = await mount(undefined, "100");
	await type(el, "date", "2026-11-05");
	expect(submitText(el)).toBe("Plan ฿100.00 to A on 05 Nov 2026");
	expect(flat(q(el, '[data-note="plan"]'))).toBe(
		"Planned for 05 Nov 2026. It shows under Upcoming and counts once you mark it paid.",
	);
	await type(el, "date", "2026-02-31");
	expect(submitText(el)).toBe("Enter an amount");
	expect(q<HTMLButtonElement>(el, 'button[type="submit"]')?.disabled).toBe(
		true,
	);
});

test("chips fill the amount; the owed chip only shows when it differs", async () => {
	const el = await mount();
	expect(flat(q(el, '[data-chip="bill"]'))).toBe("Next bill · ฿300.00");
	expect(flat(q(el, '[data-chip="owed"]'))).toBe("Everything owed · ฿500.00");
	q<HTMLElement>(el, '[data-chip="owed"]')?.click();
	await el.updateComplete;
	expect(q<HTMLInputElement>(el, '[name="amount"]')?.value).toBe("500");
	q<HTMLElement>(el, '[data-chip="bill"]')?.click();
	await el.updateComplete;
	expect(q<HTMLInputElement>(el, '[name="amount"]')?.value).toBe("300");

	const same = await mount({
		owed: 300_00,
		credit: 0,
		nextBill: 300_00,
		overdue: true,
	});
	expect(flat(q(same, '[data-chip="bill"]'))).toBe("Overdue bill · ฿300.00");
	expect(q(same, '[data-chip="owed"]')).toBeNull();
});

test("the extra note shows only above what is owed", async () => {
	const el = await mount(undefined, "500");
	expect(q(el, '[data-note="extra"]')).toBeNull();
	await type(el, "amount", "650");
	expect(flat(q(el, '[data-note="extra"]'))).toBe(
		"฿150.00 more than owed. It stays on A as credit for its next purchases.",
	);
});

test("submitting sends the amount and date, and shows an error without losing typing", async () => {
	const el = await mount(undefined, "120.50");
	const sent: PayDetail[] = [];
	el.addEventListener("pay", (e) =>
		sent.push((e as CustomEvent<PayDetail>).detail),
	);
	q<HTMLFormElement>(el, "form")?.dispatchEvent(
		new Event("submit", { cancelable: true }),
	);
	expect(sent).toEqual([{ amount: 12050, date: "2026-10-31" }]);
	el.error = "Could not save the payment.";
	await el.updateComplete;
	expect(
		q<HTMLElement & { message: string }>(el, "cc-error-banner")?.message,
	).toBe("Could not save the payment.");
	expect(q<HTMLInputElement>(el, '[name="amount"]')?.value).toBe("120.50");
});
