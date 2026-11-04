import { afterEach, expect, test } from "bun:test";
import { html, nothing, type ReactiveController, render } from "lit";
import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	cycleLine,
	fitCycle,
	fitLabels,
	listParts,
	money,
	partLines,
	say,
	useCycleFit,
	useOpenRow,
} from "#components/action-row";
import type { PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const text: ActionRowText = {
	kind: "planned",
	title: "Pay SCB K",
	subtitle: "5 Nov",
};

const draw = (expanded: boolean, onToggle = () => {}) => {
	const root = document.createElement("div");
	render(
		actionRow(text, {
			id: "p1",
			amount: { text: "+1,000.00", tone: "in" },
			action: html`<button type="button" data-action="paid">Paid</button>`,
			open: {
				expanded,
				onToggle,
				detailsId: "rows-p1",
				above: html`<p class="note-line">A note</p>`,
				say: "Planned for 5 Nov.",
			},
		}),
		root,
	);
	const head = root.querySelector<HTMLElement>(".a-hit");
	const details = root.querySelector<HTMLElement>("#rows-p1");
	if (!head || !details) throw new Error("row not drawn");
	return { root, head, details };
};

test("a closed row's head is one button naming its hidden details", () => {
	const { head, details } = draw(false);
	expect(head.localName).toBe("button");
	expect(head.getAttribute("type")).toBe("button");
	expect(head.getAttribute("aria-expanded")).toBe("false");
	expect(head.getAttribute("aria-controls")).toBe("rows-p1");
	expect(head.querySelector("a, button")).toBeNull();
	expect(head.querySelector(".amount")?.textContent).toBe("+1,000.00");
	expect(head.querySelector(".a-chev")).not.toBeNull();
	expect(details.classList.contains("a-details")).toBe(true);
	expect(details.getAttribute("role")).toBe("region");
	expect(details.hidden).toBe(true);
});

test("an opened row is a drawer: what sits above, then a foot of one sentence and the buttons", () => {
	const { head, details } = draw(true);
	expect(head.getAttribute("aria-expanded")).toBe("true");
	expect(details.hidden).toBe(false);
	const kids = [...details.children];
	expect(kids.map((e) => e.className)).toEqual(["note-line", "a-foot"]);
	const foot = details.querySelector(".a-foot") as HTMLElement;
	expect([...foot.children].map((e) => e.className)).toEqual([
		"a-say",
		"a-btns",
	]);
	expect(foot.querySelector(".a-say")?.textContent).toBe("Planned for 5 Nov.");
	expect(foot.querySelector("[data-action=paid]")).not.toBeNull();
	expect(details.querySelector(".a-info")).toBeNull();
});

test("tapping the head toggles the row once", () => {
	let calls = 0;
	const { head } = draw(false, () => {
		calls += 1;
	});
	head.click();
	expect(calls).toBe(1);
});

test("a lead replaces the kind icon in the head", () => {
	const root = document.createElement("div");
	render(
		actionRow(
			{ kind: "purchase", title: "Lunch", subtitle: "SCB K" },
			{
				lead: html`<span class="chip">K</span>`,
				open: {
					expanded: false,
					onToggle: () => {},
					detailsId: "rows-x",
					say: nothing,
				},
			},
		),
		root,
	);
	const head = root.querySelector(".a-hit");
	expect(head?.getAttribute("data-item")).toBe("purchase");
	expect(head?.querySelector(".chip")).not.toBeNull();
	expect(head?.querySelector(".a-ic")).toBeNull();
});

test("a saved row draws a neutral icon when given no lead", () => {
	const root = document.createElement("div");
	render(
		actionRow(
			{ kind: "saved", title: "Saved", subtitle: "" },
			{
				open: {
					expanded: false,
					onToggle: () => {},
					detailsId: "rows-s",
					say: nothing,
				},
			},
		),
		root,
	);
	expect(root.querySelector(".a-ic[data-kind=saved] svg")).not.toBeNull();
});

const host = () => {
	const controllers: ReactiveController[] = [];
	let updates = 0;
	const element = Object.assign(document.createElement("cc-rows"), {
		addController: (c: ReactiveController) => controllers.push(c),
		removeController: () => {},
		requestUpdate: () => {
			updates += 1;
		},
		updateComplete: Promise.resolve(true),
	});
	return { element, controllers, updates: () => updates };
};

test("one row opens at a time, and a second tap closes it", () => {
	const h = host();
	const rows = useOpenRow(h.element);
	expect(h.controllers).toContain(rows);
	rows.toggle("a");
	expect(rows.isOpen("a")).toBe(true);
	rows.toggle("b");
	expect(rows.isOpen("a")).toBe(false);
	expect(rows.isOpen("b")).toBe(true);
	rows.toggle("b");
	expect(rows.isOpen("b")).toBe(false);
	expect(h.updates()).toBe(3);
});

test("prune forgets an open row that is no longer listed", () => {
	const h = host();
	const rows = useOpenRow(h.element);
	rows.toggle("b");
	rows.prune(["a", "b"]);
	expect(rows.isOpen("b")).toBe(true);
	rows.prune(["a"]);
	expect(rows.isOpen("a")).toBe(false);
	expect(rows.isOpen("b")).toBe(false);
});

test("details ids carry the host's prefix", () => {
	const rows = useOpenRow(host().element);
	expect(rows.detailsId("p1")).toBe("cc-rows-p1");
});

test("the opened row's styles: hidden wins, the foot wraps by its own width, the chevron keeps still under reduced motion", () => {
	const css = actionRowStyles.cssText;
	expect(css).toMatch(/\.a-details\[hidden\]\s*\{\s*display: none/);
	// The sentence and the buttons share a line while the foot has room, whatever the viewport;
	// in a narrow column the buttons drop under the sentence, at the end.
	expect(css).toMatch(
		/\.a-foot\s*\{[^}]*display: flex;[^}]*flex-direction: row;[^}]*flex-wrap: wrap;[^}]*align-items: center;/,
	);
	expect(css).toMatch(/\.a-say\s*\{[^}]*flex: 1 1 var\(--cc-foot-say\)/);
	expect(css).toMatch(/\.a-foot \.a-btns\s*\{[^}]*margin-inline-start: auto/);
	expect(css).not.toMatch(/@media \([^)]*900[^)]*\)\s*\{\s*\.a-foot/);
	// The buttons wrap at their natural width; none is stretched.
	expect(css).toMatch(/\.a-btns\s*\{[^}]*flex-wrap: wrap;/);
	expect(css).not.toMatch(/\.a-btns > \*[^{]*\{[^}]*inline-size: 100%/);
	expect(css).not.toContain(".a-info");
	expect(css).toMatch(
		/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.a-chev\s*\{\s*transition: none/,
	);
	expect(css).toMatch(/\[aria-expanded="true"\] \.a-chev\s*\{[^}]*rotate/);
});

test("details ids stay one id when a row id holds whitespace", () => {
	const rows = useOpenRow(host().element);
	const id = rows.detailsId("a  b\tc");
	expect(id).not.toMatch(/\s/);
	expect(id).toBe("cc-rows-a_b_c");
	const root = document.createElement("div");
	render(
		actionRow(text, {
			open: {
				expanded: false,
				onToggle: () => {},
				detailsId: id,
				say: nothing,
			},
		}),
		root,
	);
	const head = root.querySelector(".a-hit");
	const details = root.querySelector(".a-details");
	expect(head?.getAttribute("aria-controls")).toBe(details?.id as string);
});

test("the details inset follows a lead's width, and a head with no figure keeps no empty column", () => {
	const css = actionRowStyles.cssText;
	expect(css).toMatch(
		/\.a-wrap\s*\{[^}]*--a-lead-inline: calc\(var\(--cc-space-5\) \+ var\(--cc-space-3\) \+ var\(--cc-space-3\)\)/,
	);
	expect(css).toMatch(
		/\.a-details\s*\{[^}]*padding-inline-start: var\(--a-lead-inline\)/,
	);
	expect(css).toMatch(
		/button\.a-hit\[aria-expanded\]:not\(:has\(\.amount\)\)\s*\{\s*grid-template-columns: auto minmax\(0, 1fr\) auto;/,
	);
});

test("the open row tells its owner each time it changes, so a half-done swap can end", () => {
	const h = host();
	let changes = 0;
	const rows = useOpenRow(h.element, () => {
		changes += 1;
	});
	rows.toggle("a");
	rows.toggle("a");
	expect(changes).toBe(2);
	rows.toggle("b");
	rows.prune(["a", "b"]);
	expect(changes).toBe(3);
	rows.prune(["a"]);
	expect(changes).toBe(4);
});

test("a hovered opening head keeps a neutral tag on the surface; no payment-only right side is left", () => {
	const css = actionRowStyles.cssText;
	expect(css).toMatch(
		/\.a-row:has\(> button\.a-hit:hover\) \.tag:not\([^)]*\)\s*\{\s*background: var\(--cc-surface\)/,
	);
	expect(css).not.toContain(".pay-right");
	expect(css).not.toContain(".a-right");
});

test("a sentence keeps its money strong and the rest muted", () => {
	const root = document.createElement("div");
	render(html`<p>${say("row.say.paid", { total: money("฿1.00") })}</p>`, root);
	expect(root.textContent).toBe("Statement ฿1.00 paid.");
	expect(root.querySelector(".a-money")?.textContent).toBe("฿1.00");
	const css = actionRowStyles.cssText;
	expect(css).toMatch(/\.a-say\s*\{[^}]*color: var\(--cc-text-muted\)/);
	expect(css).toMatch(
		/\.a-money\s*\{[^}]*font-weight: 650;[^}]*color: var\(--cc-text\)/,
	);
});

test("parts are label and amount lines, the amounts tabular", () => {
	const root = document.createElement("div");
	render(
		partLines([
			{ label: "October statement", amount: "฿3,000.00" },
			{ label: "Kept as credit", amount: "฿5,000.00" },
		]),
		root,
	);
	const lines = [...root.querySelectorAll(".a-parts > .a-part")];
	expect(lines.map((l) => [...l.children].map((c) => c.textContent))).toEqual([
		["October statement", "฿3,000.00"],
		["Kept as credit", "฿5,000.00"],
	]);
	expect(lines[0]?.lastElementChild?.hasAttribute("data-numeric")).toBe(true);
	expect(actionRowStyles.cssText).toMatch(
		/\.a-part\s*\{[^}]*display: flex;[^}]*flex-direction: row;[^}]*justify-content: space-between/,
	);
});

test("a list's parts are its lines, with no total line", () => {
	const list: PurchaseList = {
		id: "l",
		date: "2026-11-02",
		status: "saved",
		lines: [
			{ cardId: "A", amount: 100, made: true, actual: 90 },
			{ cardId: "B", amount: 200, made: false },
		],
	};
	const root = document.createElement("div");
	render(listParts(list, []), root);
	expect(
		[...root.querySelectorAll(".a-part")].map((l) =>
			[...l.children].map((c) => c.textContent),
		),
	).toEqual([
		["A) —", "฿0.90"],
		["B) —", "Not made"],
	]);
	expect(root.querySelector(".a-total")).toBeNull();
});

/** Draws a cycle line and reads back each marker. */
const cycle = (args: Parameters<typeof cycleLine>[0]) => {
	const root = document.createElement("div");
	render(cycleLine(args), root);
	const line = root.querySelector<HTMLElement>(".a-cycle");
	if (!line) throw new Error("no cycle line");
	const marks = [...line.querySelectorAll<HTMLElement>(".a-mk")].map((m) => ({
		mark: m.dataset["mark"],
		text: m.textContent?.trim(),
		quiet: m.hasAttribute("data-quiet"),
		at: m.style.getPropertyValue("inset-inline-start"),
		edge: m.dataset["edge"] ?? null,
		late: m.hasAttribute("data-late"),
		hidden: m.getAttribute("aria-hidden"),
	}));
	const fill = line.querySelector<HTMLElement>(".a-fill");
	return { line, marks, fill };
};

test("a purchase's cycle line puts each marker on one scale from the statement's start to its due date", () => {
	// 26 Oct = 0, bought 29 Oct = 3, today 3 Nov = 8, closes 25 Nov = 30, due 15 Dec = 50.
	const { line, marks, fill } = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-29" },
			{ kind: "closes", date: "2026-11-25" },
			{ kind: "due", date: "2026-12-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
	});
	expect(line.getAttribute("role")).toBe("img");
	expect(line.getAttribute("aria-label")).toBe(
		"Bought 29 Oct, closes 25 Nov, due 15 Dec, today 3 Nov",
	);
	expect(marks).toEqual([
		{
			mark: "buy",
			text: "Bought 29 Oct",
			quiet: false,
			at: "6%",
			edge: "start",
			late: false,
			hidden: "true",
		},
		{
			mark: "now",
			text: "Today",
			quiet: false,
			at: "16%",
			edge: null,
			late: false,
			hidden: "true",
		},
		{
			mark: "closes",
			text: "Closes 25 Nov",
			quiet: false,
			at: "60%",
			edge: null,
			late: false,
			hidden: "true",
		},
		{
			mark: "due",
			text: "Due 15 Dec",
			quiet: false,
			at: "100%",
			edge: "end",
			late: false,
			hidden: "true",
		},
	]);
	expect(fill?.style.getPropertyValue("inline-size")).toBe("16%");
	expect(fill?.hasAttribute("data-late")).toBe(false);
});

test("an overdue bill's cycle line is red to today, its due marker late, and markers near an end align to it", () => {
	// 26 Aug = 0, closed 25 Sep = 30, due 15 Oct = 50, today 3 Nov = 69, end 6 Nov = 72.
	const { line, marks, fill } = cycle({
		start: "2026-08-26",
		end: "2026-11-06",
		marks: [
			{ kind: "closed", date: "2026-09-25" },
			{ kind: "due", date: "2026-10-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
		late: true,
	});
	expect(line.getAttribute("aria-label")).toBe(
		"Closed 25 Sep, due 15 Oct (19 days late), today 3 Nov",
	);
	expect(marks.map((m) => [m.mark, m.at, m.edge, m.late])).toEqual([
		["closed", "41.67%", null, false],
		["due", "69.44%", null, true],
		["now", "95.83%", "end", false],
	]);
	expect(fill?.hasAttribute("data-late")).toBe(true);
	expect(fill?.style.getPropertyValue("inline-size")).toBe("95.83%");
	const css = actionRowStyles.cssText;
	expect(css).toMatch(
		/\.a-fill\[data-late\]\s*\{[^}]*background: var\(--cc-danger\)/,
	);
	expect(css).toMatch(/\.a-mk\[data-late\]\s*\{[^}]*color: var\(--cc-danger\)/);
	expect(css).toMatch(
		/\.a-mk\[data-mark="now"\]\s*\{[^}]*color: var\(--cc-accent\)/,
	);
});

test("markers clamp to the line and the start aligns its label to the start", () => {
	const { marks } = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-01" },
			{ kind: "due", date: "2027-01-01" },
		],
		fillTo: "2026-10-26",
	});
	expect(marks.map((m) => [m.at, m.edge])).toEqual([
		["0%", "start"],
		["100%", "end"],
	]);
});

test("the cycle line reads in Thai", () => {
	setLocale("th");
	const { line, marks } = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-29" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
	});
	expect(marks.map((m) => m.text)).toEqual(["ซื้อ 29 ต.ค.", "วันนี้"]);
	expect(line.getAttribute("aria-label")).toBe("ซื้อ 29 ต.ค. วันนี้ 3 พ.ย.");
	const late = cycle({
		start: "2026-08-26",
		end: "2026-11-06",
		marks: [
			{ kind: "closed", date: "2026-09-25" },
			{ kind: "due", date: "2026-10-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
		late: true,
	});
	expect(late.marks.map((m) => m.text)).toEqual([
		"สรุปยอดแล้ว 25 ก.ย.",
		"ครบกำหนด 15 ต.ค.",
		"วันนี้",
	]);
	expect(late.line.getAttribute("aria-label")).toBe(
		"สรุปยอดแล้ว 25 ก.ย. ครบกำหนด 15 ต.ค. (เลยกำหนดมา 19 วัน) วันนี้ 3 พ.ย.",
	);
});

test("a marker within 10% of an end aligns its label to that end, so a bill a day late keeps Due inside", () => {
	// 19 Sep = 0 .. 3 Nov = 45: due 30 Oct = 41 (91.11%), today 31 Oct = 42; a start at 4 (8.89%).
	const { marks } = cycle({
		start: "2026-09-19",
		end: "2026-11-03",
		marks: [
			{ kind: "closed", date: "2026-09-23" },
			{ kind: "due", date: "2026-10-30" },
			{ kind: "now", date: "2026-10-31" },
		],
		fillTo: "2026-10-31",
		late: true,
	});
	expect(marks.map((m) => [m.mark, m.at, m.edge])).toEqual([
		["closed", "8.89%", "start"],
		["due", "91.11%", "end"],
		["now", "93.33%", "end"],
	]);
});

test("on first paint, labels under the track guess at room: the less important of two close ones keeps only its dot", () => {
	// 26 Oct = 0 .. 15 Dec = 50: bought 24 Nov = 29 (58%), closes 25 Nov = 30 (60%), due 100%.
	const near = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-11-24" },
			{ kind: "closes", date: "2026-11-25" },
			{ kind: "due", date: "2026-12-15" },
			{ kind: "now", date: "2026-11-24" },
		],
		fillTo: "2026-11-24",
	});
	expect(near.marks.map((m) => [m.mark, m.text, m.quiet])).toEqual([
		["buy", "Bought 24 Nov", true],
		["now", "Today", false],
		["closes", "Closes 25 Nov", false],
		["due", "Due 15 Dec", false],
	]);
	expect(near.line.querySelector('.a-mk[data-mark="buy"] i')).not.toBeNull();
	// Every mark is still said.
	expect(near.line.getAttribute("aria-label")).toBe(
		"Bought 24 Nov, closes 25 Nov, due 15 Dec, today 24 Nov",
	);
	// Due outranks a close: 9 Dec is 88%, 6 days (12%) from due at 100%.
	const late = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-27" },
			{ kind: "closes", date: "2026-12-09" },
			{ kind: "due", date: "2026-12-15" },
		],
		fillTo: "2026-10-27",
	});
	expect(late.marks.map((m) => m.quiet)).toEqual([false, true, false]);
	expect(actionRowStyles.cssText).toMatch(
		/\.a-mk\[data-quiet\] \.a-lbl\s*\{\s*visibility: hidden/,
	);
});

const box = (kind: string, left: number, right: number) => ({
	kind: kind as "buy" | "closes" | "closed" | "due" | "now",
	left,
	right,
});

test("measured labels: one overlapping a kept label goes quiet, in the order due, close, bought", () => {
	// Thai at 390px: all three overlap; only Due keeps its words.
	expect(
		fitLabels([
			box("buy", 0, 125),
			box("closed", 50, 140),
			box("due", 120, 200),
			box("now", 100, 130),
		]),
	).toEqual([true, true, false, false]);
	// A label that only overlapped a quiet one keeps its words.
	expect(
		fitLabels([
			box("buy", 0, 70),
			box("closed", 50, 140),
			box("due", 120, 200),
		]),
	).toEqual([false, true, false]);
	// The close is kept over Bought when only those two overlap.
	expect(
		fitLabels([
			box("buy", 0, 60),
			box("closes", 58, 120),
			box("due", 300, 360),
		]),
	).toEqual([true, false, false]);
	// A gap under 4px counts as touching.
	expect(fitLabels([box("closes", 0, 50), box("due", 52, 100)])).toEqual([
		true,
		false,
	]);
});

test("measured labels with room all keep their words, and Due always does", () => {
	expect(
		fitLabels([
			box("buy", 0, 40),
			box("closes", 100, 160),
			box("due", 300, 360),
		]),
	).toEqual([false, false, false]);
	expect(fitLabels([box("due", 0, 500), box("buy", 0, 500)])).toEqual([
		false,
		true,
	]);
	// Today is above the track: never quiet, never in the way.
	expect(fitLabels([box("now", 0, 500), box("buy", 0, 500)])).toEqual([
		false,
		false,
	]);
});

test("fitting a drawn line sets data-quiet from the labels' boxes and leaves the aria-label alone", () => {
	const { line } = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-29" },
			{ kind: "closes", date: "2026-11-25" },
			{ kind: "due", date: "2026-12-15" },
		],
		fillTo: "2026-10-29",
	});
	const aria = line.getAttribute("aria-label");
	const rects: Record<string, [number, number]> = {
		buy: [0, 90],
		closes: [80, 170],
		due: [160, 250],
	};
	for (const mark of line.querySelectorAll<HTMLElement>(".a-mk")) {
		const label = mark.querySelector(".a-lbl") as HTMLElement;
		const [left, right] = rects[mark.dataset["mark"] as string] as [
			number,
			number,
		];
		label.getBoundingClientRect = () =>
			({ left, right, width: right - left }) as DOMRect;
	}
	fitCycle(line);
	expect(
		[...line.querySelectorAll(".a-mk")].map((m) =>
			m.hasAttribute("data-quiet"),
		),
	).toEqual([false, true, false]);
	expect(line.getAttribute("aria-label")).toBe(aria);
	// Unlaid-out labels (a closed row, happy-dom) keep the first guess.
	const unlaid = cycle({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-29" },
			{ kind: "due", date: "2026-12-15" },
		],
		fillTo: "2026-10-29",
	});
	fitCycle(unlaid.line);
	expect(unlaid.line.querySelector("[data-quiet]")).toBeNull();
});

test("useCycleFit fits every cycle line after each update, refits on resize, and lets go on disconnect", () => {
	const observed: Element[] = [];
	let callback: ResizeObserverCallback = () => {};
	let disconnected = 0;
	const real = globalThis.ResizeObserver;
	globalThis.ResizeObserver = class {
		constructor(cb: ResizeObserverCallback) {
			callback = cb;
		}
		observe(el: Element) {
			observed.push(el);
		}
		unobserve() {}
		disconnect() {
			disconnected += 1;
		}
	} as unknown as typeof ResizeObserver;
	try {
		const root = document.createElement("div");
		const controllers: ReactiveController[] = [];
		const host = {
			renderRoot: root,
			addController: (c: ReactiveController) => controllers.push(c),
			removeController: () => {},
			requestUpdate: () => {},
			updateComplete: Promise.resolve(true),
		};
		const fit = useCycleFit(host);
		expect(controllers).toContain(fit);
		render(
			cycleLine({
				start: "2026-10-26",
				end: "2026-12-15",
				marks: [
					{ kind: "buy", date: "2026-10-29" },
					{ kind: "due", date: "2026-12-15" },
				],
				fillTo: "2026-10-29",
			}),
			root,
		);
		const line = root.querySelector(".a-cycle") as HTMLElement;
		const labels = [...line.querySelectorAll<HTMLElement>(".a-lbl")];
		for (const label of labels)
			label.getBoundingClientRect = () =>
				({ left: 0, right: 100, width: 100 }) as DOMRect;
		fit.hostUpdated();
		expect(observed).toEqual([line]);
		expect(
			line.querySelector('[data-mark="buy"]')?.hasAttribute("data-quiet"),
		).toBe(true);
		// Room again after a resize: the label comes back.
		(labels[0] as HTMLElement).getBoundingClientRect = () =>
			({ left: 0, right: 40, width: 40 }) as DOMRect;
		(labels[1] as HTMLElement).getBoundingClientRect = () =>
			({ left: 200, right: 260, width: 60 }) as DOMRect;
		callback(
			[{ target: line } as unknown as ResizeObserverEntry],
			{} as ResizeObserver,
		);
		expect(
			line.querySelector('[data-mark="buy"]')?.hasAttribute("data-quiet"),
		).toBe(false);
		fit.hostUpdated();
		expect(observed).toEqual([line]);
		fit.hostDisconnected();
		expect(disconnected).toBe(1);
	} finally {
		globalThis.ResizeObserver = real;
	}
});
