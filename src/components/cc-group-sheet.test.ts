import { afterEach, expect, test } from "bun:test";
import "#components/cc-group-sheet";
import type { CcGroupSheet } from "#components/cc-group-sheet";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const scb: LimitGroup = {
	id: "g1",
	name: "SCB",
	limit: 200_000_00,
	owner: "KC",
};

const mount = async (props: Partial<CcGroupSheet> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-group-sheet") as CcGroupSheet;
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const type = async (element: CcGroupSheet, name: string, value: string) => {
	const input = element.shadowRoot?.querySelector(
		`input[name=${name}]`,
	) as HTMLInputElement;
	input.value = value;
	input.dispatchEvent(new Event("input"));
	await element.updateComplete;
};

const click = async (element: CcGroupSheet, selector: string) => {
	element.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
	await element.updateComplete;
};

const submit = async (element: CcGroupSheet) => {
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { cancelable: true }));
	await element.updateComplete;
};

const saved = (element: CcGroupSheet) => {
	const got: LimitGroup[] = [];
	element.addEventListener("save-group", (e) =>
		got.push((e as CustomEvent<LimitGroup>).detail),
	);
	return got;
};

test("a blank group sits in a sheet with its fields and no holder chosen", async () => {
	const { root } = await mount();
	const modal = root.querySelector("cc-modal");
	expect(modal?.hasAttribute("sheet")).toBe(true);
	expect(modal?.getAttribute("heading")).toBe("Add limit group");
	expect(
		(root.querySelector("input[name=name]") as HTMLInputElement).value,
	).toBe("");
	expect(
		[...root.querySelectorAll("[data-owner]")].map((b) => [
			text(b),
			b.getAttribute("aria-pressed"),
		]),
	).toEqual([
		["KC", "false"],
		["NT", "false"],
		["RI", "false"],
	]);
	expect(root.querySelector("[data-action=delete-group]")).toBeNull();
});

test("checks the name, a limit above zero and the holder", async () => {
	const { element, root } = await mount();
	const got = saved(element);
	const alert = () => text(root.querySelector("p[role=alert]"));
	await submit(element);
	expect(alert()).toBe("Give the limit group a name.");
	await type(element, "name", "  KBank  ");
	await type(element, "limit", "0");
	await submit(element);
	expect(alert()).toBe("Enter the limit in baht, like 300000.");
	await type(element, "limit", "abc");
	await submit(element);
	expect(alert()).toBe("Enter the limit in baht, like 300000.");
	await type(element, "limit", "250,000");
	await submit(element);
	expect(alert()).toBe("Choose the account holder for this limit group.");
	await click(element, "[data-owner=NT]");
	expect(
		root.querySelector("[data-owner=NT]")?.getAttribute("aria-pressed"),
	).toBe("true");
	await submit(element);
	expect(root.querySelector("p[role=alert]")).toBeNull();
	expect(got).toHaveLength(1);
	expect(got[0]).toMatchObject({
		name: "KBank",
		limit: 250_000_00,
		owner: "NT",
	});
	expect(typeof got[0]?.id).toBe("string");
});

test("an existing group fills the fields and keeps its id", async () => {
	const { element, root } = await mount({ group: scb });
	expect(root.querySelector("cc-modal")?.getAttribute("heading")).toBe(
		"Edit SCB",
	);
	expect(
		(root.querySelector("input[name=limit]") as HTMLInputElement).value,
	).toBe("200000");
	expect(
		root.querySelector("[data-owner=KC]")?.getAttribute("aria-pressed"),
	).toBe("true");
	const got = saved(element);
	await type(element, "name", "SCB Biz");
	await submit(element);
	expect(got).toEqual([{ ...scb, name: "SCB Biz" }]);
});

test("Delete group asks twice, focus following the swap", async () => {
	const { element, root } = await mount({ group: scb });
	const deleted: LimitGroup[] = [];
	element.addEventListener("delete-group", (e) =>
		deleted.push((e as CustomEvent<{ group: LimitGroup }>).detail.group),
	);
	expect(text(root.querySelector("[data-action=delete-group]"))).toBe(
		"Delete group",
	);
	await click(element, "[data-action=delete-group]");
	expect(text(root.querySelector(".ask"))).toBe("Delete SCB?");
	expect(root.activeElement?.getAttribute("data-action")).toBe(
		"confirm-delete",
	);
	await click(element, "[data-action=keep]");
	expect(root.querySelector(".ask")).toBeNull();
	expect(root.activeElement?.getAttribute("data-action")).toBe("delete-group");
	await click(element, "[data-action=delete-group]");
	await click(element, "[data-action=confirm-delete]");
	expect(deleted).toEqual([scb]);
});

test("a group a card uses has no Delete", async () => {
	const { root } = await mount({ group: scb, inUse: true });
	expect(root.querySelector("[data-action=delete-group]")).toBeNull();
});

test("shows why a save failed and waits while busy", async () => {
	const { root } = await mount({ group: scb, error: "Disk full", busy: true });
	const banner = root.querySelector("cc-error-banner") as HTMLElement & {
		message: string;
	};
	expect(banner.message).toBe("Disk full");
	expect(
		(root.querySelector("button[type=submit]") as HTMLButtonElement).disabled,
	).toBe(true);
	expect(
		(root.querySelector("cc-modal") as HTMLElement & { held: boolean }).held,
	).toBe(true);
});

test("Close re-emits close", async () => {
	const { element, root } = await mount();
	let closed = false;
	element.addEventListener("close", () => {
		closed = true;
	});
	root.querySelector("cc-modal")?.dispatchEvent(new CustomEvent("close"));
	expect(closed).toBe(true);
});

test("typing survives a language switch", async () => {
	const { element, root } = await mount();
	await type(element, "name", "Draft");
	setLocale("th");
	await element.updateComplete;
	expect(
		(root.querySelector("input[name=name]") as HTMLInputElement).value,
	).toBe("Draft");
});
