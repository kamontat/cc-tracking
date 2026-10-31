import { afterEach, expect, test } from "bun:test";
import "#components/cc-tx-ledger";
import type { CcTxLedger } from "#components/cc-tx-ledger";
import { byDay, type TxEntry } from "#lib/domain/transactions";
import type { Card, CardPayment, PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card = (id: string, archived = false): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived,
});

const purchase = (id: string, amount: number, note = "", c = card("A")) =>
	({
		kind: "purchase",
		purchase: { id, cardId: c.id, date: "2026-10-31", amount, note },
		card: c,
	}) as TxEntry;

const payment = (
	id: string,
	amount: number,
	status: CardPayment["status"] = "paid",
	c = card("A"),
): CardPayment & { _card: Card } => ({
	id,
	cardId: c.id,
	date: "2026-10-31",
	amount,
	status,
	_card: c,
});

const payEntry = (id: string, amount: number, c = card("A")): TxEntry => ({
	kind: "payment",
	payment: payment(id, amount, "paid", c),
	card: c,
});

const list = (id: string): PurchaseList => ({
	id,
	date: "2026-10-31",
	status: "saved",
	lines: [],
});

const mount = async (props: Partial<CcTxLedger> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-tx-ledger") as CcTxLedger;
	element.today = "2026-10-31";
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

test("rows read direction by sign and word, and purchases link to list or card", async () => {
	const entries = [
		purchase("L1-1", 1_000_00),
		purchase("zz", 50_00, "coffee"),
		payEntry("p1", 700_00),
	];
	const { root } = await mount({ entries, lists: [list("L1")] });
	const rows = root.querySelectorAll("[data-kind]");
	expect(rows.length).toBe(3);
	const [a, b, c] = Array.from(rows);
	expect(a?.tagName).toBe("A");
	expect(a?.getAttribute("href")).toBe("/list/view?id=L1");
	expect(text(a as Element, "[data-numeric]")).toBe("−฿1,000.00");
	expect(a?.querySelector(".amount.out")).not.toBeNull();
	expect(a?.textContent).toContain("Purchase");
	expect(b?.getAttribute("href")).toBe("/card?id=A");
	expect(b?.textContent).toContain("coffee");
	expect(c?.tagName).toBe("BUTTON");
	expect(text(c as Element, "[data-numeric]")).toBe("+฿700.00");
	expect(c?.querySelector(".amount.in")).not.toBeNull();
	expect(c?.textContent).toContain("Payment");
});

test("a purchase named like a list link goes to the card when no such list exists", async () => {
	const { root } = await mount({
		entries: [purchase("L9-1", 100_00)],
		lists: [],
	});
	expect(root.querySelector("a")?.getAttribute("href")).toBe("/card?id=A");
});

test("archived cards are tagged", async () => {
	const { root } = await mount({
		entries: [purchase("x", 100_00, "", card("A", true))],
	});
	expect(root.querySelector(".archived")?.textContent).toContain("Archived");
});

test("day groups head with Today and a date", async () => {
	const other = purchase("y", 10_00);
	if (other.kind === "purchase") other.purchase.date = "2026-10-30";
	const groups = byDay([purchase("x", 100_00), other]);
	const { root } = await mount({ groups });
	const heads = Array.from(root.querySelectorAll("h3")).map((h) =>
		h.textContent?.trim(),
	);
	expect(heads).toEqual(["Today · Sat, 31 Oct", "Fri, 30 Oct"]);
});

test("a flat list shows the date on each row", async () => {
	const { root } = await mount({ entries: [purchase("x", 100_00)] });
	expect(root.querySelector("h3")).toBeNull();
	expect(root.querySelector("[data-kind]")?.textContent).toContain(
		"31 Oct 2026",
	);
});

test("a filtered ledger heads with the count and the signed total", async () => {
	const { root } = await mount({
		entries: [purchase("x", 100_00), payEntry("p", 30_00)],
		filtered: true,
	});
	expect(text(root, ".result-head")).toBe("2 results · −฿70.00");
	const net = await mount({
		entries: [payEntry("p", 30_00)],
		filtered: true,
	});
	expect(text(net.root, ".result-head")).toBe("1 result · +฿30.00");
});

test("an empty ledger names the way on", async () => {
	const { root } = await mount({ entries: [] });
	expect(text(root, ".empty")).toContain("Add a purchase from Home");
	const filtered = await mount({ entries: [], filtered: true });
	expect(text(filtered.root, ".empty")).toContain("Clear the search");
});

test("a payment row opens in place and deleting asks twice", async () => {
	const { element, root } = await mount({
		entries: [payEntry("p1", 700_00)],
	});
	const toggles: unknown[] = [];
	element.addEventListener("toggle", (e) =>
		toggles.push((e as unknown as CustomEvent).detail),
	);
	(root.querySelector("button[data-kind=payment]") as HTMLElement).click();
	expect(toggles).toEqual([{ id: "p1" }]);
	element.open = "p1";
	await element.updateComplete;
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull();
	const deleted: unknown[] = [];
	element.addEventListener("delete-payment", (e) =>
		deleted.push((e as CustomEvent).detail),
	);
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	expect(element.confirming).toBe(true);
	expect(text(root, ".confirm")).toContain("Delete ฿700.00 to Card A?");
	const keep = root.querySelector("[data-action=keep]") as HTMLElement;
	expect(keep.hasAttribute("data-variant")).toBe(false);
	expect(
		root
			.querySelector("[data-action=confirm-delete]")
			?.getAttribute("data-variant"),
	).toBe("danger");
	keep.click();
	await element.updateComplete;
	expect(element.confirming).toBe(false);
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	(root.querySelector("[data-action=confirm-delete]") as HTMLElement).click();
	expect(deleted.length).toBe(1);
	expect((deleted[0] as { payment: CardPayment }).payment.id).toBe("p1");
});

test("opening another row drops the question", async () => {
	const { element } = await mount({
		entries: [payEntry("p1", 100_00), payEntry("p2", 100_00)],
		open: "p1",
		confirming: true,
	});
	element.open = "p2";
	await element.updateComplete;
	expect(element.confirming).toBe(false);
});

test("Upcoming uses the shared row: a waiting list with Confirm, a planned payment with Paid", async () => {
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: [
			{ cardId: "A", amount: 100_00 },
			{ cardId: "B", amount: 50_00 },
		],
	};
	const c = { ...card("A"), last4: "1029", limitGroupId: "g1" };
	const planned = {
		...payment("pl1", 900_00, "planned", c),
		date: "2026-11-02" as const,
	};
	const { element, root } = await mount({
		entries: [],
		limitGroups: [{ id: "g1", name: "G", limit: 1, owner: "KC" }],
		upcoming: {
			lists: [sent],
			planned: [{ payment: planned, card: c }],
			cards: [c],
		},
	});
	expect(text(root, ".upcoming h2")).toBe("Upcoming");
	// The "not counted yet" note is gone.
	expect(root.querySelector(".upcoming .sec-head small")).toBeNull();
	const waiting = root.querySelector('[data-row="w1"]') as HTMLElement;
	const link = waiting.querySelector("a[data-item=waiting]");
	expect(link?.getAttribute("href")).toBe("/list/reply?id=w1");
	expect(text(waiting, ".a-title")).toBe("Waiting on list for 30 Oct 2026");
	expect(text(waiting, ".a-sub")).toBe("Card A (KC), c-[B]");
	expect(waiting.querySelector(".tag")).toBeNull();
	expect(text(waiting, ".a-right [data-numeric]")).toBe("−฿150.00");
	expect(text(waiting, "[data-action=confirm-list]")).toBe("Confirm");

	const row = root.querySelector('[data-row="pl1"]') as HTMLElement;
	expect(text(row, ".a-title")).toBe("Planned: pay Card A (KC) in 2 days");
	expect(text(row, ".a-sub")).toBe("02 Nov 2026");
	expect(row.querySelector(".tag")).toBeNull();
	expect(row.querySelector(".a-right .amount.in")?.textContent).toBe(
		"+฿900.00",
	);
	expect(text(row, "[data-action=mark-paid]")).toBe("Paid");
	// The row is plain text: tapping it opens nothing. Delete is a danger button after Paid.
	expect(row.querySelector("a, button.a-hit")).toBeNull();
	const buttons = [...row.querySelectorAll(".a-btns button")];
	expect(buttons.map((b) => b.getAttribute("data-action"))).toEqual([
		"mark-paid",
		"delete",
	]);
	expect(buttons[1]?.getAttribute("data-variant")).toBe("danger");
	const marked: unknown[] = [];
	element.addEventListener("mark-paid", (e) =>
		marked.push((e as CustomEvent).detail),
	);
	(root.querySelector("[data-action=mark-paid]") as HTMLElement).click();
	expect((marked[0] as { payment: CardPayment }).payment.id).toBe("pl1");
});

test("a planned payment's Delete asks once more; Keep writes nothing", async () => {
	const c = card("A");
	const planned = payment("pl1", 900_00, "planned", c);
	const { element, root } = await mount({
		entries: [],
		upcoming: {
			lists: [],
			planned: [{ payment: planned, card: c }],
			cards: [c],
		},
	});
	const deleted: unknown[] = [];
	element.addEventListener("delete-payment", (e) =>
		deleted.push((e as CustomEvent).detail),
	);
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(text(root, "[data-confirming=pl1] .confirm")).toBe(
		"Delete ฿900.00 to Card A?",
	);
	const keep = root.querySelector("[data-action=keep]") as HTMLElement;
	expect(keep.getAttribute("data-variant")).toBeNull();
	expect(
		root
			.querySelector("[data-action=confirm-delete]")
			?.getAttribute("data-variant"),
	).toBe("danger");
	expect(root.querySelector(".a-btns")).toBeNull();
	keep.click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	expect(root.querySelector("[data-confirming]")).toBeNull();
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	(root.querySelector("[data-action=confirm-delete]") as HTMLElement).click();
	expect((deleted[0] as { payment: CardPayment }).payment.id).toBe("pl1");
});

test("Confirm asks once more before it saves the list, and Cancel writes nothing", async () => {
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: ["A", "B", "C", "D"].map((cardId) => ({ cardId, amount: 10_00 })),
	};
	const { element, root } = await mount({
		entries: [],
		upcoming: { lists: [sent], planned: [], cards: [] },
	});
	expect(text(root, '[data-row="w1"] .a-sub')).toBe("4 cards");
	const saved: unknown[] = [];
	element.addEventListener("confirm-list", (e) =>
		saved.push((e as CustomEvent).detail),
	);
	(root.querySelector("[data-action=confirm-list]") as HTMLElement).click();
	await element.updateComplete;
	expect(saved).toEqual([]);
	expect(text(root, "[data-confirming=w1] .confirm")).toBe(
		"Save all 4 as made?",
	);
	expect(root.querySelector("[data-action=confirm-list]")).toBeNull();
	(root.querySelector("[data-action=cancel-confirm]") as HTMLElement).click();
	await element.updateComplete;
	expect(saved).toEqual([]);
	expect(root.querySelector("[data-confirming]")).toBeNull();
	(root.querySelector("[data-action=confirm-list]") as HTMLElement).click();
	await element.updateComplete;
	(root.querySelector("[data-action=save-list]") as HTMLElement).click();
	await element.updateComplete;
	expect((saved[0] as { list: PurchaseList }).list.id).toBe("w1");
	expect(root.querySelector("[data-confirming]")).toBeNull();
});

test("Upcoming reads in Thai", async () => {
	setLocale("th");
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: [{ cardId: "A", amount: 10_00 }],
	};
	const { root } = await mount({
		entries: [],
		upcoming: { lists: [sent], planned: [], cards: [card("A")] },
	});
	expect(text(root, ".a-title")).toBe("รอคำตอบใบรายการซื้อวันที่ 30 ต.ค. 2026");
	expect(root.querySelector(".tag")).toBeNull();
	expect(text(root, "[data-action=confirm-list]")).toBe("ยืนยัน");
});

test("no Upcoming section when nothing is upcoming", async () => {
	const { root } = await mount({
		entries: [],
		upcoming: { lists: [], planned: [], cards: [] },
	});
	expect(root.querySelector(".upcoming")).toBeNull();
});

test("Thai words after a language switch", async () => {
	const { element, root } = await mount({ entries: [purchase("x", 100_00)] });
	setLocale("th");
	await element.updateComplete;
	expect(root.querySelector("[data-kind]")?.textContent).toContain("การซื้อ");
});

test("rows name the card in the panel form and say which list a purchase came from", async () => {
	const c = { ...card("A"), limitGroupId: "g2" };
	const { root } = await mount({
		groups: byDay([
			purchase("L1-1", 100_00, "", c),
			purchase("zz", 10_00, "", c),
		]),
		lists: [{ ...list("L1"), date: "2026-10-29" }],
		limitGroups: [
			{ id: "g1", name: "One", limit: 1 },
			{ id: "g2", name: "Two", limit: 1 },
		],
	});
	const [fromList, plain] = Array.from(root.querySelectorAll("[data-kind]"));
	expect(fromList?.querySelector("b")?.textContent).toBe("A) Card A");
	expect(fromList?.querySelector(".mini")?.textContent).toBe("1111");
	expect(fromList?.querySelector(".mini")?.getAttribute("data-g")).toBe("2");
	expect(fromList?.textContent).toContain("From list Thu, 29 Oct");
	expect(plain?.querySelector(".sub")).toBeNull();
	expect(root.querySelectorAll(".panel")).toHaveLength(1);
});

test("a card no longer stored keeps its id", async () => {
	const entry = purchase("x", 10_00);
	const { root } = await mount({ entries: [{ ...entry, card: undefined }] });
	expect(root.querySelector("[data-kind] b")?.textContent).toBe("A) —");
});

test("a payment's note shows on its sub line, in the ledger and under Upcoming", async () => {
	const c = card("A");
	const paid: TxEntry = {
		kind: "payment",
		payment: { ...payment("p1", 700_00, "paid", c), note: "From savings" },
		card: c,
	};
	const planned = {
		...payment("pl1", 900_00, "planned", c),
		note: "Salary day",
	};
	const { root } = await mount({
		entries: [paid, payEntry("p2", 100_00)],
		upcoming: {
			lists: [],
			planned: [{ payment: planned, card: c }],
			cards: [],
		},
	});
	const rows = [...root.querySelectorAll("button[data-kind=payment]")];
	expect(text(rows[0] as Element, ".sub")).toBe("From savings · 31 Oct 2026");
	expect(text(rows[1] as Element, ".sub")).toBe("31 Oct 2026");
	expect(text(root, '[data-row="pl1"] .a-sub')).toBe(
		"31 Oct 2026 · Salary day",
	);
});
