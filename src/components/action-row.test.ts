import { expect, test } from "bun:test";
import { html, type ReactiveController, render } from "lit";
import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	useOpenRow,
} from "#components/action-row";

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
				details: html`<p class="note-line">A note</p>`,
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

test("an opened row shows its details, then its buttons", () => {
	const { head, details } = draw(true);
	expect(head.getAttribute("aria-expanded")).toBe("true");
	expect(details.hidden).toBe(false);
	const note = details.querySelector(".note-line");
	const buttons = details.querySelector(".a-btns");
	expect(note).not.toBeNull();
	expect(buttons?.querySelector("[data-action=paid]")).not.toBeNull();
	// The details come first, then the buttons.
	expect(
		(note as Node).compareDocumentPosition(buttons as Node) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
					details: html``,
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
	render(actionRow({ kind: "saved", title: "Saved", subtitle: "" }, {}), root);
	expect(root.querySelector(".a-ic[data-kind=saved] svg")).not.toBeNull();
});

test("without open, a row with href is still a link and a plain row a div", () => {
	const root = document.createElement("div");
	render(
		html`${actionRow(text, { href: "/transactions" })}${actionRow(text, {})}`,
		root,
	);
	const [link, plain] = [...root.querySelectorAll(".a-hit")];
	expect(link?.localName).toBe("a");
	expect(link?.getAttribute("href")).toBe("/transactions");
	expect(plain?.localName).toBe("div");
	expect(root.querySelector("[aria-expanded], .a-details, .a-chev")).toBeNull();
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

test("the opened row's styles: hidden wins, buttons stack below 900px, the chevron keeps still under reduced motion", () => {
	const css = actionRowStyles.cssText;
	expect(css).toMatch(/\.a-details\[hidden\]\s*\{\s*display: none/);
	expect(css).toMatch(
		/@media \(max-width: 899\.98px\)\s*\{[^@]*\.a-details \.a-btns\s*\{[^}]*flex-direction: column/,
	);
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
				details: html``,
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
