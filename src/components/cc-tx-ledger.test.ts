import { afterEach, expect, test } from "bun:test";
import "#components/cc-tx-ledger";
import type { CcTxLedger } from "#components/cc-tx-ledger";
import { cardLedger } from "#lib/domain/ledger";
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

/** The head of the row `id` (`buy:`, `pay:`, `plan:`, `list:` and the ids). */
const head = (root: ParentNode, id: string) =>
	root.querySelector<HTMLElement>(`[data-row="${id}"] button.a-hit`);

/** Taps a row's head and waits for the repaint. */
const tap = async (element: CcTxLedger, id: string) => {
	head(element.shadowRoot as ShadowRoot, id)?.click();
	await element.updateComplete;
};

/** The one opened details region. */
const shown = (root: ParentNode) =>
	root.querySelector<HTMLElement>(".a-details:not([hidden])");

const lines = (root: ParentNode) =>
	[...(shown(root)?.querySelectorAll(".a-info > *") ?? [])].map((e) =>
		e.textContent?.replace(/\s+/g, " ").trim(),
	);

/** Card A's ledger: `old` on the October statement, `x` on November's; `p1` pays both. */
const ledgers = () => {
	const c = card("A");
	const old = purchase("old", 500_00);
	if (old.kind === "purchase") old.purchase.date = "2026-09-20";
	const x = purchase("x", 1_000_00, "lunch");
	const pay = payment("p1", 700_00);
	return {
		entries: [x, payEntry("p1", 700_00), old],
		ledgers: new Map([
			[
				"A",
				cardLedger(
					c,
					[old, x].map((e) => (e as TxEntry & { kind: "purchase" }).purchase),
					[pay],
					[],
					"2026-10-31",
				),
			],
		]),
	};
};

test("ledger rows are buttons that open in place, never links", async () => {
	const entries = [
		purchase("L1-1", 1_000_00),
		purchase("zz", 50_00, "coffee"),
		payEntry("p1", 700_00),
	];
	const { root } = await mount({ entries, lists: [list("L1")] });
	expect(root.querySelector("a.crow, .crow")).toBeNull();
	const heads = [...root.querySelectorAll(".a-hit")];
	expect(heads.map((h) => h.getAttribute("data-item"))).toEqual([
		"purchase",
		"purchase",
		"payment",
	]);
	for (const h of heads) {
		expect(h.localName).toBe("button");
		expect(h.getAttribute("aria-expanded")).toBe("false");
		expect(h.querySelector("a, button")).toBeNull();
	}
	const [a, b, c] = heads;
	expect(text(a as Element, "[data-numeric]")).toBe("−฿1,000.00");
	expect(a?.querySelector(".amount.out")).not.toBeNull();
	expect(a?.textContent).toContain("Purchase");
	expect(a?.querySelector(".mini")).not.toBeNull();
	expect(b?.textContent).toContain("coffee");
	expect(text(c as Element, "[data-numeric]")).toBe("+฿700.00");
	expect(c?.querySelector(".amount.in")).not.toBeNull();
	expect(c?.textContent).toContain("Payment");
	expect(root.querySelector(".a-details:not([hidden])")).toBeNull();
});

test("an opened purchase shows its statement and list, with Open card and Open list", async () => {
	const { entries, ledgers: books } = ledgers();
	const fromList = { ...list("L1"), date: "2026-10-29" as const };
	const listed = purchase("L1-0", 300_00, "gift");
	if (listed.kind === "purchase") listed.purchase.date = "2026-10-29";
	const { element, root } = await mount({
		entries: [...entries, listed],
		lists: [fromList],
		ledgers: books,
	});
	await tap(element, "buy:A:x");
	expect(head(root, "buy:A:x")?.getAttribute("aria-expanded")).toBe("true");
	expect(lines(root)).toEqual(["Statement 18 Nov 2026 · due 03 Dec 2026"]);
	const plain = [...(shown(root)?.querySelectorAll(".a-btns > *") ?? [])];
	expect(plain.map((b) => b.getAttribute("data-action"))).toEqual([
		"open-card",
	]);
	expect(plain[0]?.localName).toBe("a");
	expect(plain[0]?.getAttribute("data-variant")).toBe("quiet");
	expect(plain[0]?.getAttribute("href")).toBe("/card?id=A");
	expect(plain[0]?.textContent?.trim()).toBe("Open card");

	await tap(element, "buy:A:L1-0");
	expect(head(root, "buy:A:x")?.getAttribute("aria-expanded")).toBe("false");
	expect(lines(root)).toEqual(["From list Thu, 29 Oct"]);
	const both = [...(shown(root)?.querySelectorAll(".a-btns > *") ?? [])];
	expect(both.map((b) => b.getAttribute("data-action"))).toEqual([
		"open-card",
		"open-list",
	]);
	expect(both[1]?.getAttribute("href")).toBe("/list/view?id=L1");
	expect(both[1]?.getAttribute("data-variant")).toBe("quiet");
	expect(both[1]?.textContent?.trim()).toBe("Open list");
});

test("a purchase named like a list id opens to its card alone when no such list exists", async () => {
	const { element, root } = await mount({
		entries: [purchase("L9-1", 100_00, "", card("A/1"))],
		lists: [],
	});
	await tap(element, "buy:A/1:L9-1");
	expect(root.querySelector("[data-action=open-list]")).toBeNull();
	expect(
		shown(root)?.querySelector("[data-action=open-card]")?.getAttribute("href"),
	).toBe("/card?id=A%2F1");
	expect(root.querySelector("[data-action=delete]")).toBeNull();
});

test("an opened payment says how much went to each statement, oldest first", async () => {
	const { entries, ledgers: books } = ledgers();
	const { element, root } = await mount({ entries, ledgers: books });
	await tap(element, "pay:A:p1");
	expect(lines(root)).toEqual(["฿500.00 to Oct 2026", "฿200.00 to Nov 2026"]);
	setLocale("th");
	await element.updateComplete;
	expect(lines(root)).toEqual([
		"฿500.00 เข้ารอบบิล ต.ค. 2026",
		"฿200.00 เข้ารอบบิล พ.ย. 2026",
	]);
});

test("at most one row is open across Upcoming and every day panel", async () => {
	const c = card("A");
	const other = purchase("y", 10_00);
	if (other.kind === "purchase") other.purchase.date = "2026-10-30";
	const { element, root } = await mount({
		groups: byDay([purchase("x", 100_00), other]),
		upcoming: {
			lists: [],
			planned: [{ payment: payment("pl1", 900_00, "planned", c), card: c }],
			cards: [c],
		},
	});
	const expanded = () =>
		[...root.querySelectorAll('.a-hit[aria-expanded="true"]')].map((h) =>
			h.closest("[data-row]")?.getAttribute("data-row"),
		);
	await tap(element, "plan:A:pl1");
	expect(expanded()).toEqual(["plan:A:pl1"]);
	await tap(element, "buy:A:x");
	expect(expanded()).toEqual(["buy:A:x"]);
	await tap(element, "buy:A:y");
	expect(expanded()).toEqual(["buy:A:y"]);
	await tap(element, "buy:A:y");
	expect(expanded()).toEqual([]);
	expect(root.querySelectorAll("section.day .panel")).toHaveLength(2);
});

test("a half-done swap survives a repaint, ends when its row closes, and a row that goes is forgotten", async () => {
	const entries = [payEntry("p1", 700_00), purchase("x", 10_00)];
	const { element, root } = await mount({ entries });
	await tap(element, "pay:A:p1");
	(
		root.querySelector(
			".a-details:not([hidden]) [data-action=delete]",
		) as HTMLElement
	).click();
	await element.updateComplete;
	element.requestUpdate();
	await element.updateComplete;
	element.entries = [...entries];
	await element.updateComplete;
	expect(head(root, "pay:A:p1")?.getAttribute("aria-expanded")).toBe("true");
	expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull();
	await tap(element, "pay:A:p1");
	await tap(element, "pay:A:p1");
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull();
	expect(shown(root)?.querySelector("[data-action=delete]")).not.toBeNull();
	element.entries = [entries[1] as TxEntry];
	await element.updateComplete;
	element.entries = entries;
	await element.updateComplete;
	expect(head(root, "pay:A:p1")?.getAttribute("aria-expanded")).toBe("false");
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
	expect(root.querySelector("[data-item]")?.textContent).toContain(
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

test("a payment's Delete waits in its opened row and swaps in place for Delete and Cancel", async () => {
	const { element, root } = await mount({
		entries: [payEntry("p1", 700_00)],
	});
	const deleted: unknown[] = [];
	element.addEventListener("delete-payment", (e) =>
		deleted.push((e as CustomEvent).detail),
	);
	const right = () => shown(root) as HTMLElement;
	expect(head(root, "pay:A:p1")?.querySelector(".amount")?.textContent).toBe(
		"+฿700.00",
	);
	expect(right()).toBeNull();
	await tap(element, "pay:A:p1");
	const del = right().querySelector("[data-action=delete]") as HTMLElement;
	expect(del.getAttribute("data-variant")).toBe("danger");
	expect(del.textContent?.trim()).toBe("Delete");
	del.click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	const confirm = right().querySelector(
		"[data-action=confirm-delete]",
	) as HTMLElement;
	expect(confirm.getAttribute("data-variant")).toBe("danger");
	expect(confirm.getAttribute("aria-label")).toBe("Delete ฿700.00 to Card A?");
	const cancel = right().querySelector(
		"[data-action=cancel-delete]",
	) as HTMLElement;
	expect(cancel.hasAttribute("data-variant")).toBe(false);
	expect(right().querySelector("[data-action=delete]")).toBeNull();
	cancel.click();
	await element.updateComplete;
	expect(right().querySelector("[data-action=delete]")).not.toBeNull();
	expect(deleted).toEqual([]);
	(right().querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	(
		right().querySelector("[data-action=confirm-delete]") as HTMLElement
	).click();
	expect(deleted.length).toBe(1);
	expect((deleted[0] as { payment: CardPayment }).payment.id).toBe("p1");
});

test("a purchase row has no Delete", async () => {
	const { element, root } = await mount({ entries: [purchase("x1", 100_00)] });
	await tap(element, "buy:A:x1");
	expect(root.querySelector("[data-action=delete]")).toBeNull();
});

test("Upcoming rows open in place: a waiting list with Record reply and Confirm, a plan with Paid and Delete", async () => {
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
	const waiting = root.querySelector('[data-row="list:w1"]') as HTMLElement;
	expect(waiting.querySelector("a.a-hit")).toBeNull();
	expect(head(root, "list:w1")?.getAttribute("data-item")).toBe("waiting");
	expect(text(waiting, ".a-title")).toBe("Waiting on list for 30 Oct 2026");
	expect(text(waiting, ".a-sub")).toBe("Card A (KC), c-[B]");
	expect(waiting.querySelector(".tag")).toBeNull();
	expect(text(waiting, ".a-hit [data-numeric]")).toBe("−฿150.00");
	expect(shown(root)).toBeNull();
	await tap(element, "list:w1");
	expect(text(shown(root) as HTMLElement, ".a-total")).toBe("Total ฿150.00");
	const reply = shown(root)?.querySelector("[data-action=record-reply]");
	expect(reply?.getAttribute("href")).toBe("/list/reply?id=w1");
	expect(reply?.textContent?.trim()).toBe("Record reply");
	expect(text(shown(root) as HTMLElement, "[data-action=confirm-list]")).toBe(
		"Confirm",
	);

	const row = root.querySelector('[data-row="plan:A:pl1"]') as HTMLElement;
	expect(text(row, ".a-title")).toBe("Planned: pay Card A (KC) in 2 days");
	expect(text(row, ".a-sub")).toBe("02 Nov 2026");
	expect(row.querySelector(".tag")).toBeNull();
	expect(row.querySelector(".a-hit .amount.in")?.textContent).toBe("+฿900.00");
	expect(row.querySelector(".a-details")?.hasAttribute("hidden")).toBe(true);
	await tap(element, "plan:A:pl1");
	expect(text(row, "[data-action=mark-paid]")).toBe("Paid");
	// The buttons sit in the opened area, none in the head. Delete is a danger button after Paid.
	expect(head(root, "plan:A:pl1")?.querySelector("a, button")).toBeNull();
	const buttons = [...row.querySelectorAll(".a-details .a-btns button")];
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

test("a planned payment's Delete swaps in place for Delete and Cancel; Cancel writes nothing", async () => {
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
	await tap(element, "plan:A:pl1");
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	// The same buttons swap in place.
	expect(root.querySelector(".confirm")).toBeNull();
	expect(root.querySelector('[data-row="plan:A:pl1"] .actions')).toBeNull();
	const buttons = [
		...root.querySelectorAll('[data-row="plan:A:pl1"] .a-btns button'),
	];
	expect(buttons.map((b) => b.getAttribute("data-action"))).toEqual([
		"confirm-delete",
		"cancel-delete",
	]);
	expect(buttons[0]?.getAttribute("data-variant")).toBe("danger");
	expect(buttons[1]?.getAttribute("data-variant")).toBeNull();
	expect(buttons[0]?.getAttribute("aria-label")).toBe(
		"Delete ฿900.00 to Card A?",
	);
	(buttons[1] as HTMLElement).click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	expect(root.querySelector("[data-confirming]")).toBeNull();
	expect(root.querySelector("[data-action=mark-paid]")).not.toBeNull();
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	(root.querySelector("[data-action=confirm-delete]") as HTMLElement).click();
	expect((deleted[0] as { payment: CardPayment }).payment.id).toBe("pl1");
});

test("Confirm swaps in place for Save and Cancel, and Cancel writes nothing", async () => {
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
	expect(text(root, '[data-row="list:w1"] .a-sub')).toBe("4 cards");
	const saved: unknown[] = [];
	element.addEventListener("confirm-list", (e) =>
		saved.push((e as CustomEvent).detail),
	);
	await tap(element, "list:w1");
	(root.querySelector("[data-action=confirm-list]") as HTMLElement).click();
	await element.updateComplete;
	expect(saved).toEqual([]);
	expect(root.querySelector(".confirm")).toBeNull();
	expect(
		root
			.querySelector("[data-confirming=w1] [data-action=save-list]")
			?.getAttribute("aria-label"),
	).toBe("Save all 4 as made?");
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
	expect(root.querySelector("[data-item]")?.textContent).toContain("การซื้อ");
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
			{ id: "g1", name: "One", limit: 1, color: "blue" },
			{ id: "g2", name: "Two", limit: 1, color: "rose" },
		],
	});
	const [fromList, plain] = Array.from(root.querySelectorAll("[data-item]"));
	expect(fromList?.querySelector(".card-label")?.textContent).toBe("A) Card A");
	expect(fromList?.querySelector(".mini")?.textContent).toBe("1111");
	expect(fromList?.querySelector(".mini")?.getAttribute("data-g")).toBe("rose");
	expect(fromList?.textContent).toContain("From list Thu, 29 Oct");
	expect(text(plain as Element, ".a-sub")).toBe("");
	expect(root.querySelectorAll(".panel")).toHaveLength(1);
});

test("a card no longer stored keeps its id", async () => {
	const entry = purchase("x", 10_00);
	const { root } = await mount({ entries: [{ ...entry, card: undefined }] });
	expect(root.querySelector("[data-item] .card-label")?.textContent).toBe(
		"A) —",
	);
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
	const rows = [...root.querySelectorAll("[data-item=payment]")];
	expect(text(rows[0] as Element, ".a-sub")).toBe("From savings · 31 Oct 2026");
	expect(text(rows[1] as Element, ".a-sub")).toBe("31 Oct 2026");
	expect(text(root, '[data-row="plan:A:pl1"] .a-sub')).toBe(
		"31 Oct 2026 · Salary day",
	);
});

test("a paid payment's Delete moves focus to the asking Delete, and Cancel moves it back", async () => {
	const { element, root } = await mount({
		entries: [payEntry("p1", 700_00)],
	});
	await tap(element, "pay:A:p1");
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(
		root.querySelector("[data-action=confirm-delete]"),
	);
	(root.querySelector("[data-action=cancel-delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(root.querySelector("[data-action=delete]"));
});

test("a planned payment's Delete moves focus to the asking Delete, and Cancel moves it back", async () => {
	const c = card("A");
	const { element, root } = await mount({
		entries: [payEntry("p0", 100_00)],
		upcoming: {
			lists: [],
			planned: [{ payment: payment("pl1", 900_00, "planned", c), card: c }],
			cards: [c],
		},
	});
	const planned = () =>
		root.querySelector('[data-row="plan:A:pl1"]') as HTMLElement;
	await tap(element, "plan:A:pl1");
	(planned().querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(
		planned().querySelector("[data-action=confirm-delete]"),
	);
	(
		planned().querySelector("[data-action=cancel-delete]") as HTMLElement
	).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(
		planned().querySelector("[data-action=delete]"),
	);
});

test("Confirm moves focus to Save, and Cancel moves it back to Confirm", async () => {
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: [{ cardId: "A", amount: 10_00 }],
	};
	const { element, root } = await mount({
		entries: [],
		upcoming: { lists: [sent], planned: [], cards: [] },
	});
	await tap(element, "list:w1");
	(root.querySelector("[data-action=confirm-list]") as HTMLElement).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(
		root.querySelector("[data-action=save-list]"),
	);
	(root.querySelector("[data-action=cancel-confirm]") as HTMLElement).click();
	await element.updateComplete;
	expect(root.activeElement).toBe(
		root.querySelector("[data-action=confirm-list]"),
	);
});

test("a limit cuts the rows, keeps the day headings whole, and asks for more", async () => {
	const day = (date: string, n: number): TxEntry[] =>
		Array.from({ length: n }, (_, i) => {
			const e = purchase(`${date}-${i}`, 100_00) as TxEntry & {
				kind: "purchase";
			};
			return { ...e, purchase: { ...e.purchase, date } };
		});
	const entries = [...day("2026-10-31", 3), ...day("2026-10-30", 4)];
	const { element, root } = await mount({ groups: byDay(entries), limit: 5 });
	expect(root.querySelectorAll("[data-row] > .a-row").length).toBe(5);
	const days = [...root.querySelectorAll("section.day")];
	expect(days.length).toBe(2);
	expect(days[1]?.querySelectorAll(".a-wrap").length).toBe(2);
	const more = root.querySelector('[data-action="show-more"]') as HTMLElement;
	expect(more.textContent?.trim()).toBe("Show 2 more");
	let asked = 0;
	element.addEventListener("show-more", () => asked++);
	more.click();
	expect(asked).toBe(1);
	element.limit = 50;
	await element.updateComplete;
	expect(root.querySelectorAll("[data-row] > .a-row").length).toBe(7);
	expect(root.querySelector('[data-action="show-more"]')).toBeNull();
	setLocale("th");
	element.limit = 1;
	element.entries = entries;
	element.groups = null;
	await element.updateComplete;
	expect(root.querySelectorAll("[data-row] > .a-row").length).toBe(1);
	expect(
		root.querySelector('[data-action="show-more"]')?.textContent?.trim(),
	).toBe("แสดงเพิ่มอีก 6 รายการ");
});

/** How many times `word` appears in the row `id`, head and details together. */
const times = (root: ParentNode, id: string, word: string) =>
	(root.querySelector(`[data-row="${id}"]`)?.textContent ?? "").split(word)
		.length - 1;

test("an opened row says its note once, on its sub line", async () => {
	const c = card("A");
	const paid: TxEntry = {
		kind: "payment",
		payment: { ...payment("p1", 700_00, "paid", c), note: "From savings" },
		card: c,
	};
	const { element, root } = await mount({
		entries: [purchase("x", 100_00, "p3"), paid],
		upcoming: {
			lists: [],
			planned: [
				{
					payment: {
						...payment("pl1", 900_00, "planned", c),
						note: "Salary day",
					},
					card: c,
				},
			],
			cards: [c],
		},
	});
	await tap(element, "buy:A:x");
	expect(times(root, "buy:A:x", "p3")).toBe(1);
	await tap(element, "pay:A:p1");
	expect(times(root, "pay:A:p1", "From savings")).toBe(1);
	await tap(element, "plan:A:pl1");
	expect(times(root, "plan:A:pl1", "Salary day")).toBe(1);
	// Nothing else to say: no empty details block.
	expect(shown(root)?.querySelector(".a-info")).toBeNull();
});
