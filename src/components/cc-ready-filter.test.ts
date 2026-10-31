import { afterEach, expect, test } from "bun:test";
import "#components/cc-ready-filter";
import type { CcReadyFilter } from "#components/cc-ready-filter";
import {
	DEFAULT_READY_FILTER,
	type ReadyFilter,
} from "#lib/domain/ready-filter";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const mount = async (props: Partial<CcReadyFilter> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-ready-filter") as CcReadyFilter;
	element.locations = ["bangkok", "krabi"];
	element.owners = ["KC", "NT"];
	element.filter = DEFAULT_READY_FILTER;
	element.sort = "room";
	element.count = (f: ReadyFilter) => 5 - f.locations.length - f.owners.length;
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	const modal = element.shadowRoot?.querySelector("cc-modal") as HTMLElement;
	return { element, root: element.shadowRoot as ShadowRoot, modal };
};

const click = async (element: CcReadyFilter, selector: string) => {
	element.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
	await element.updateComplete;
};

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

test("a sheet of Kept in, Account holder and Sort, counting cards", async () => {
	const { root, modal } = await mount();
	expect(modal.getAttribute("heading")).toBe("Filter and sort");
	expect(modal.hasAttribute("sheet")).toBe(true);
	expect(
		[...root.querySelectorAll("legend")].map((l) => l.textContent),
	).toEqual(["Kept in", "Account holder", "Sort"]);
	expect(
		[...root.querySelectorAll("[data-location]")].map((b) => b.textContent),
	).toEqual(["Bangkok", "Krabi"]);
	expect(
		[...root.querySelectorAll("[data-owner]")].map((b) => b.textContent),
	).toEqual(["KC", "NT"]);
	expect(
		[...root.querySelectorAll("[data-sort]")].map((b) => b.textContent),
	).toEqual(["Most room", "Longest to close", "Latest due"]);
	expect(
		root.querySelector("[data-sort=room]")?.getAttribute("aria-pressed"),
	).toBe("true");
	expect(text(root, "[data-action=apply]")).toBe("Show 5 cards");
});

test("picks count live and only apply hands them back", async () => {
	const { element, root } = await mount();
	const applied: unknown[] = [];
	element.addEventListener("apply", (e: Event) =>
		applied.push((e as CustomEvent).detail),
	);
	await click(element, "[data-location=krabi]");
	await click(element, "[data-owner=NT]");
	await click(element, "[data-sort=due]");
	expect(
		root.querySelector("[data-location=krabi]")?.getAttribute("aria-pressed"),
	).toBe("true");
	expect(text(root, "[data-action=apply]")).toBe("Show 3 cards");
	expect(applied).toEqual([]);
	await click(element, "[data-action=apply]");
	expect(applied).toEqual([
		{ filter: { q: "", locations: ["krabi"], owners: ["NT"] }, sort: "due" },
	]);
});

test("Clear all keeps the search, and one or no card reads right", async () => {
	const { element, root } = await mount({
		filter: { q: "scb", locations: ["krabi"], owners: [] },
		sort: "close",
	});
	const applied: unknown[] = [];
	element.addEventListener("apply", (e: Event) =>
		applied.push((e as CustomEvent).detail),
	);
	await click(element, "[data-action=clear]");
	expect(
		root.querySelector("[data-sort=room]")?.getAttribute("aria-pressed"),
	).toBe("true");
	await click(element, "[data-action=apply]");
	expect(applied).toEqual([
		{ filter: { q: "scb", locations: [], owners: [] }, sort: "room" },
	]);
	const one = await mount({ count: () => 1 });
	expect(text(one.root, "[data-action=apply]")).toBe("Show 1 card");
	const none = await mount({ count: () => 0 });
	const apply = none.root.querySelector<HTMLButtonElement>(
		"[data-action=apply]",
	);
	expect(apply?.disabled).toBe(true);
	expect(apply?.textContent?.trim()).toBe("Nothing matches");
});

test("a group with no choice is left out", async () => {
	const { root } = await mount({ owners: [] });
	expect(
		[...root.querySelectorAll("legend")].map((l) => l.textContent),
	).toEqual(["Kept in", "Sort"]);
});

test("reads in Thai", async () => {
	setLocale("th");
	const { root } = await mount();
	expect(
		[...root.querySelectorAll("legend")].map((l) => l.textContent),
	).toEqual(["ที่อยู่บัตร", "เจ้าของบัตร", "เรียงตาม"]);
	expect(text(root, "[data-action=apply]")).toBe("แสดง 5 ใบ");
});
