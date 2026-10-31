import { afterEach, expect, test } from "bun:test";
import "#components/cc-tx-filter";
import type { CcTxFilter } from "#components/cc-tx-filter";
import {
	DEFAULT_TX_FILTER,
	type TxFilter,
	type TxSort,
} from "#lib/domain/transactions";
import type { Card } from "#lib/domain/types";
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

const mount = async (props: Partial<CcTxFilter> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-tx-filter") as CcTxFilter;
	element.cards = [card("A"), card("B")];
	element.filter = DEFAULT_TX_FILTER;
	element.sort = "new";
	element.count = (f: TxFilter, _s: TxSort) =>
		f.types.length + f.cards.length + (f.range ? 1 : 0) + 5;
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	const modal = element.shadowRoot?.querySelector("cc-modal") as HTMLElement;
	return { element, root: element.shadowRoot as ShadowRoot, modal };
};

const click = async (element: CcTxFilter, selector: string) => {
	element.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
	await element.updateComplete;
};

test("sits in a modal with the apply button counting results", async () => {
	const { element, root, modal } = await mount();
	expect(modal.getAttribute("heading")).toBe("Filter and sort");
	expect(root.querySelector("[data-action=apply]")?.textContent?.trim()).toBe(
		"Show 5 results",
	);
	await click(element, "[data-type=purchase]");
	expect(root.querySelector("[data-action=apply]")?.textContent?.trim()).toBe(
		"Show 6 results",
	);
});

test("one result reads singular and none disables the button", async () => {
	const one = await mount({ count: () => 1 });
	expect(
		one.root.querySelector("[data-action=apply]")?.textContent?.trim(),
	).toBe("Show 1 result");
	const none = await mount({ count: () => 0 });
	const apply = none.root.querySelector(
		"[data-action=apply]",
	) as HTMLButtonElement;
	expect(apply.textContent?.trim()).toBe("Nothing matches");
	expect(apply.disabled).toBe(true);
});

test("apply emits the draft filter and sort", async () => {
	const { element } = await mount();
	let detail: { filter: TxFilter; sort: TxSort } | undefined;
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent).detail;
	});
	await click(element, "[data-type=payment]");
	await click(element, "[data-card=B]");
	await click(element, "[data-range=week]");
	await click(element, "[data-sort=big]");
	expect(
		element.shadowRoot
			?.querySelector("[data-sort=big]")
			?.getAttribute("aria-pressed"),
	).toBe("true");
	await click(element, "[data-action=apply]");
	expect(detail?.filter.types).toEqual(["payment"]);
	expect(detail?.filter.cards).toEqual(["B"]);
	expect(detail?.filter.range).toBe("week");
	expect(detail?.sort).toBe("big");
});

test("types and cards toggle off again; the search text is kept", async () => {
	const { element } = await mount({
		filter: { ...DEFAULT_TX_FILTER, q: "abc", cards: ["A"] },
	});
	let detail: { filter: TxFilter } | undefined;
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent).detail;
	});
	await click(element, "[data-card=A]");
	await click(element, "[data-action=apply]");
	expect(detail?.filter.cards).toEqual([]);
	expect(detail?.filter.q).toBe("abc");
});

test("a custom range shows from and to", async () => {
	const { element, root } = await mount();
	expect(root.querySelector("input[name=from]")).toBeNull();
	await click(element, "[data-range=custom]");
	const from = root.querySelector("input[name=from]") as HTMLInputElement;
	from.value = "2026-10-01";
	from.dispatchEvent(new Event("input"));
	let detail: { filter: TxFilter } | undefined;
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent).detail;
	});
	await click(element, "[data-action=apply]");
	expect(detail?.filter.range).toBe("custom");
	expect(detail?.filter.from).toBe("2026-10-01");
});

test("Clear all resets the draft but keeps the sheet open", async () => {
	const { element, root } = await mount({
		filter: { ...DEFAULT_TX_FILTER, types: ["payment"], range: "month" },
		sort: "old",
	});
	await click(element, "[data-action=clear]");
	expect(
		root.querySelector("[data-type=payment]")?.getAttribute("aria-pressed"),
	).toBe("false");
	expect(
		root.querySelector("[data-range=month]")?.getAttribute("aria-pressed"),
	).toBe("false");
	expect(
		root.querySelector("[data-sort=new]")?.getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		root.querySelector("[data-sort=old]")?.getAttribute("aria-pressed"),
	).toBe("false");
});

test("close from the modal is passed on", async () => {
	const { element, modal } = await mount();
	let closed = 0;
	element.addEventListener("close", () => closed++);
	modal.dispatchEvent(new CustomEvent("close"));
	expect(closed).toBe(1);
});

test("leaving custom clears the typed from and to", async () => {
	const { element, root } = await mount();
	await click(element, "[data-range=custom]");
	const from = root.querySelector("input[name=from]") as HTMLInputElement;
	from.value = "2026-10-01";
	from.dispatchEvent(new Event("input"));
	await click(element, "[data-range=month]");
	let detail: { filter: TxFilter } | undefined;
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent).detail;
	});
	await click(element, "[data-action=apply]");
	expect(detail?.filter.range).toBe("month");
	expect(detail?.filter.from).toBe("");
	expect(detail?.filter.to).toBe("");
});

test("draws as a sheet, with card choices in the line form", async () => {
	const { root, modal } = await mount();
	expect(modal.hasAttribute("sheet")).toBe(true);
	const chip = root.querySelector("[data-card=A]");
	expect(chip?.textContent?.replace(/\s+/g, " ").trim()).toBe(
		"A) Card A (1111)",
	);
	expect(root.querySelectorAll("[data-sort]")).toHaveLength(4);
});

test("apply waits for the sheet to slide away before it is handed back", async () => {
	const { element, modal } = await mount();
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const dialog = modal.shadowRoot?.querySelector("dialog") as HTMLDialogElement;
	dialog.getAnimations = () =>
		modal.hasAttribute("closing") ? [{ finished } as unknown as Animation] : [];
	let applied = 0;
	element.addEventListener("apply", () => applied++);
	element.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action=apply]")
		?.click();
	expect(modal.hasAttribute("closing")).toBe(true);
	expect(applied).toBe(0);
	finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(applied).toBe(1);
});
