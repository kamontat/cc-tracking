import { expect, test } from "bun:test";
import "#components/cc-card-table";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const mount = async (
	cards: Card[],
	purchaseCounts: Record<string, number> = {},
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-table");
	element.cards = cards;
	element.purchaseCounts = purchaseCounts;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows the card's fields and an active row's controls", async () => {
	const element = await mount([card]);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank Visa");
	expect(text).toContain("4821");
	expect(text).toContain("Krabi");
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).not.toBeNull();
});

test("shows a purchase count instead of delete once the card has purchases", async () => {
	const element = await mount([card], { kbank: 3 });
	expect(element.shadowRoot?.textContent).toContain("3 purchases");
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).toBeNull();
});

test("emits edit, archive, and remove with the card id", async () => {
	const element = await mount([card]);
	const events: Record<string, string> = {};
	for (const name of ["edit", "archive", "remove"]) {
		element.addEventListener(name, (event) => {
			events[name] = (event as CustomEvent<string>).detail;
		});
	}
	const buttons = [
		...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ??
			[]),
	];
	for (const button of buttons) button.click();
	expect(events).toEqual({ edit: "kbank", archive: "kbank", remove: "kbank" });
});

test("renders its column headings and empty state in the chosen language", async () => {
	setLocale("en");
	const element = await mount([]);
	expect(element.shadowRoot?.textContent).toContain(
		"No cards yet. Add the first one with the form above.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มด้านบน",
	);
});
