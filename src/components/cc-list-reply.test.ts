import { afterEach, expect, test } from "bun:test";
import "#components/cc-list-reply";
import type { CcListReply } from "#components/cc-list-reply";
import type { Card, ListLine, PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

const w1: PurchaseList = {
	id: "w1",
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T03:00:00.000Z",
	lines: [
		{ cardId: "A", amount: 12_500_00 },
		{ cardId: "B", amount: 4_800_00 },
		{ cardId: "C", amount: 22_000_00 },
	],
};

const mount = async () => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-list-reply") as CcListReply;
	Object.assign(element, { list: w1, cards: [card("A"), card("B")] });
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const flat = (el: Element | ParentNode | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const line = (root: ParentNode, id: string) =>
	root.querySelector(`section.line[data-card="${id}"]`) as HTMLElement;
const answerButton = (root: ParentNode, id: string, answer: string) =>
	line(root, id).querySelector(
		`[data-answer="${answer}"]`,
	) as HTMLButtonElement;
const actual = (root: ParentNode, id: string) =>
	line(root, id).querySelector('[data-field="actual"]') as HTMLInputElement;
const saveButton = (root: ParentNode) =>
	root.querySelector('[data-action="save-reply"]') as HTMLButtonElement;
const move = (root: ParentNode) =>
	root.querySelector('[data-field="move"]') as HTMLInputElement | null;

const answer = async (
	element: CcListReply,
	id: string,
	which: "made" | "not-made",
) => {
	answerButton(element.shadowRoot as ShadowRoot, id, which).click();
	await element.updateComplete;
};

const typeActual = async (element: CcListReply, id: string, text: string) => {
	const input = actual(element.shadowRoot as ShadowRoot, id);
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	await element.updateComplete;
};

test("save waits for every answer", async () => {
	const { element, root } = await mount();
	expect(flat(root.querySelector("p.note"))).toBe(
		"Record the spender's reply for each line. Change the amount if the real one differs.",
	);
	expect(flat(line(root, "A"))).toContain("planned ฿12,500.00");
	expect(
		line(root, "A").querySelector('[role="group"]')?.getAttribute("aria-label"),
	).toBe("Was it made?");
	await answer(element, "A", "made");
	expect(answerButton(root, "A", "made").getAttribute("aria-pressed")).toBe(
		"true",
	);
	expect(answerButton(root, "A", "not-made").getAttribute("aria-pressed")).toBe(
		"false",
	);
	expect(saveButton(root).disabled).toBe(true);
	expect(flat(saveButton(root))).toBe("Answer every line (1 of 3)");
});

test("a made line takes the real amount", async () => {
	const { element, root } = await mount();
	expect(actual(root, "A")).toBeNull();
	await answer(element, "A", "made");
	expect(actual(root, "A").value).toBe("12500");
	expect(flat(line(root, "A"))).not.toContain("vs plan");
	await typeActual(element, "A", "13000");
	expect(flat(line(root, "A"))).toContain("+฿500.00 vs plan");
	await typeActual(element, "A", "12000");
	expect(flat(line(root, "A"))).toContain("-฿500.00 vs plan");
});

test("not made offers the move, ticked", async () => {
	const { element, root } = await mount();
	expect(move(root)).toBeNull();
	await answer(element, "B", "not-made");
	expect(actual(root, "B")).toBeNull();
	expect(move(root)?.checked).toBe(true);
	expect(flat(move(root)?.closest("label"))).toBe(
		"Move B to a draft for Sat, 31 Oct",
	);
});

test("saving sends the answers", async () => {
	const { element, root } = await mount();
	const seen: { lines: ListLine[]; moveUnmade: boolean }[] = [];
	element.addEventListener("save-reply", (e) =>
		seen.push((e as CustomEvent).detail),
	);
	await answer(element, "A", "made");
	await typeActual(element, "A", "13000");
	await answer(element, "B", "not-made");
	await answer(element, "C", "made");
	const box = move(root) as HTMLInputElement;
	box.checked = false;
	box.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
	await element.updateComplete;
	expect(saveButton(root).disabled).toBe(false);
	expect(flat(saveButton(root))).toBe("Save 2 purchases · ฿35,000.00");
	saveButton(root).click();
	expect(seen).toEqual([
		{
			lines: [
				{ cardId: "A", amount: 1250000, made: true, actual: 1300000 },
				{ cardId: "B", amount: 480000, made: false },
				{ cardId: "C", amount: 2200000, made: true },
			],
			moveUnmade: false,
		},
	]);
});

test("one made line says purchase", async () => {
	const { element, root } = await mount();
	await answer(element, "A", "made");
	await answer(element, "B", "not-made");
	await answer(element, "C", "not-made");
	expect(flat(saveButton(root))).toBe("Save 1 purchase · ฿12,500.00");
	expect(flat(move(root)?.closest("label"))).toBe(
		"Move B, C to a draft for Sat, 31 Oct",
	);
});

test("a real amount that is not money stops the save", async () => {
	const { element, root } = await mount();
	await answer(element, "A", "made");
	await answer(element, "B", "made");
	await answer(element, "C", "made");
	expect(saveButton(root).disabled).toBe(false);
	await typeActual(element, "A", "abc");
	expect(flat(line(root, "A"))).toContain(
		"Enter the amount in baht, like 1234.56.",
	);
	expect(saveButton(root).disabled).toBe(true);
	await typeActual(element, "A", "");
	expect(saveButton(root).disabled).toBe(true);
});

test("answers survive a language switch", async () => {
	const { element, root } = await mount();
	await answer(element, "A", "made");
	await answer(element, "B", "not-made");
	await typeActual(element, "A", "13000");
	setLocale("th");
	await element.updateComplete;
	expect(answerButton(root, "A", "made").getAttribute("aria-pressed")).toBe(
		"true",
	);
	expect(answerButton(root, "B", "not-made").getAttribute("aria-pressed")).toBe(
		"true",
	);
	expect(answerButton(root, "C", "made").getAttribute("aria-pressed")).toBe(
		"false",
	);
	expect(actual(root, "A").value).toBe("13000");
	expect(flat(answerButton(root, "A", "made"))).toBe("ซื้อแล้ว");
});
