import { afterEach, expect, test } from "bun:test";
import "#components/cc-group-sheet";
import { CcGroupSheet } from "#components/cc-group-sheet";
import { GROUP_COLORS, type GroupColor } from "#lib/domain/group-color";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale, t } from "#lib/i18n/index";

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
			b.getAttribute("aria-checked"),
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
		root.querySelector("[data-owner=NT]")?.getAttribute("aria-checked"),
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
		root.querySelector("[data-owner=KC]")?.getAttribute("aria-checked"),
	).toBe("true");
	const got = saved(element);
	await type(element, "name", "SCB Biz");
	await submit(element);
	expect(got).toEqual([{ ...scb, name: "SCB Biz", color: expect.any(String) }]);
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

test("a reload of the same group keeps the typing; another group resets it", async () => {
	const { element, root } = await mount({ group: scb });
	await type(element, "name", "Typed");
	element.group = { ...scb };
	element.error = "Disk full";
	await element.updateComplete;
	const name = () =>
		(root.querySelector("input[name=name]") as HTMLInputElement).value;
	expect(name()).toBe("Typed");
	element.group = { ...scb, id: "g2", name: "Other" };
	await element.updateComplete;
	expect(name()).toBe("Other");
});

test("Delete NAME? stays after Delete, so a failed delete still shows it and the reason", async () => {
	const { element, root } = await mount({ group: scb });
	await click(element, "[data-action=delete-group]");
	await click(element, "[data-action=confirm-delete]");
	element.error = "Could not delete that limit group.";
	await element.updateComplete;
	expect(text(root.querySelector(".ask"))).toBe("Delete SCB?");
	expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull();
	expect(
		root.querySelector<HTMLElement & { message: string }>("cc-error-banner")
			?.message,
	).toBe("Could not delete that limit group.");
});

const withColor = (id: string, color: GroupColor): LimitGroup => ({
	id,
	name: id,
	limit: 1_000_00,
	owner: "KC",
	color,
});

const pressed = (root: ShadowRoot) =>
	[...root.querySelectorAll('.swatches [aria-checked="true"]')].map((b) =>
		b.getAttribute("data-color"),
	);

test("a new group's sheet opens with the one unused colour chosen", async () => {
	const others = GROUP_COLORS.filter((c) => c !== "cyan").map((c) =>
		withColor(c, c),
	);
	const { root } = await mount({ groups: others });
	expect(pressed(root)).toEqual(["cyan"]);
});

test("an existing group opens with its colour pressed and saves it unchanged", async () => {
	const { element, root } = await mount({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }, withColor("g2", "blue")],
	});
	expect(pressed(root)).toEqual(["rose"]);
	const got = saved(element);
	await type(element, "name", "SCB 2");
	await submit(element);
	expect(got[0]?.color).toBe("rose");
});

test("pressing a swatch chooses it and saving emits it", async () => {
	const { element, root } = await mount({ group: { ...scb, color: "rose" } });
	const got = saved(element);
	await click(element, '.swatches [data-color="teal"]');
	expect(pressed(root)).toEqual(["teal"]);
	await submit(element);
	expect(got[0]?.color).toBe("teal");
});

test("Random picks a colour no other group uses", async () => {
	const others = [withColor("g2", "blue")];
	const { element, root } = await mount({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }, ...others],
		random: () => 0,
	});
	await click(element, '[data-action="random-color"]');
	expect(pressed(root)).toEqual(["green"]);
});

test("Random never draws the colour already chosen while another is free", async () => {
	const { element, root } = await mount({
		group: { ...scb, color: "green" },
		groups: [{ ...scb, color: "green" }, withColor("g2", "blue")],
		random: () => 0,
	});
	await click(element, '[data-action="random-color"]');
	expect(pressed(root)).toEqual(["purple"]);
});

test("Random keeps the colour when it is the only free one", async () => {
	const others = GROUP_COLORS.filter((c) => c !== "green").map((c) =>
		withColor(`g-${c}`, c),
	);
	const { element, root } = await mount({
		group: { ...scb, color: "green" },
		groups: [{ ...scb, color: "green" }, ...others],
		random: () => 0,
	});
	await click(element, '[data-action="random-color"]');
	expect(pressed(root)).toEqual(["green"]);
});

test("each swatch is named by its colour, in the language of the page", async () => {
	const { root } = await mount();
	const label = (c: string) =>
		root
			.querySelector(`.swatches [data-color="${c}"]`)
			?.getAttribute("aria-label");
	expect(label("teal")).toBe("Teal");
	setLocale("th");
	await mount();
	const th = document.querySelector("cc-group-sheet")?.shadowRoot;
	expect(
		th
			?.querySelector('.swatches [data-color="teal"]')
			?.getAttribute("aria-label"),
	).toBe(t("color.teal"));
	expect(t("color.teal")).not.toBe("Teal");
});

test("a chosen colour survives a fresh copy of the same group", async () => {
	const { element, root } = await mount({
		group: { ...scb, color: "rose" },
		groups: [{ ...scb, color: "rose" }],
	});
	await click(element, '.swatches [data-color="teal"]');
	element.group = { ...scb, color: "rose" };
	element.groups = [{ ...scb, color: "rose" }, withColor("g2", "blue")];
	await element.updateComplete;
	expect(pressed(root)).toEqual(["teal"]);
});

test("the swatches lay out as a wrapping row with a visible edge", () => {
	const css = (CcGroupSheet.styles as unknown[])
		.flat(Infinity)
		.map((s) => (s as { cssText: string }).cssText)
		.join("\n");
	const rule = css.match(/\.swatches\s*\{[^}]*\}/)?.[0] ?? "";
	expect(rule).toMatch(/flex-direction:\s*row/);
	expect(rule).toMatch(/flex-wrap:\s*wrap/);
	expect(css).toMatch(
		/button\[data-color\]\s*\{[^}]*var\(--cc-border-width\)[^}]*color-mix/,
	);
});

test("the pressed swatch carries a check mark", async () => {
	const { root } = await mount({ group: { ...scb, color: "rose" } });
	expect(root.querySelectorAll(".swatches svg")).toHaveLength(1);
	expect(root.querySelector('[data-color="rose"] svg')).not.toBeNull();
});

/** Presses `key` on the focused radio of the group `selector`, as a keyboard would. */
const key = async (element: CcGroupSheet, selector: string, name: string) => {
	const root = element.shadowRoot as ShadowRoot;
	const from = root.activeElement ?? root.querySelector(selector);
	const event = new KeyboardEvent("keydown", {
		key: name,
		bubbles: true,
		cancelable: true,
		composed: true,
	});
	from?.dispatchEvent(event);
	await element.updateComplete;
	return event;
};

const radios = (root: ShadowRoot, attr: string) =>
	[...root.querySelectorAll<HTMLElement>(`[${attr}]`)].map((b) => ({
		value: b.getAttribute(attr),
		role: b.getAttribute("role"),
		checked: b.getAttribute("aria-checked"),
		tabindex: b.getAttribute("tabindex"),
	}));

test("the holders and the colours are radio groups named by their legends", async () => {
	const { root } = await mount({ group: { ...scb, color: "rose" } });
	for (const selector of [".seg", ".swatches"]) {
		const group = root.querySelector(selector);
		expect(group?.getAttribute("role")).toBe("radiogroup");
		const id = group?.getAttribute("aria-labelledby") ?? "";
		expect(id).not.toBe("");
		const named = root.querySelector(`[id="${id}"]`);
		expect(named?.localName).toBe("legend");
		expect(text(named)).toBe(
			text(group?.closest("fieldset")?.querySelector("legend")),
		);
		expect(text(named).length).toBeGreaterThan(0);
	}
	expect(radios(root, "data-owner")).toEqual([
		{ value: "KC", role: "radio", checked: "true", tabindex: "0" },
		{ value: "NT", role: "radio", checked: "false", tabindex: "-1" },
		{ value: "RI", role: "radio", checked: "false", tabindex: "-1" },
	]);
	const colours = radios(root, "data-color");
	expect(colours.every((c) => c.role === "radio")).toBe(true);
	expect(colours.filter((c) => c.tabindex === "0").map((c) => c.value)).toEqual(
		["rose"],
	);
	expect(
		colours.filter((c) => c.checked === "true").map((c) => c.value),
	).toEqual(["rose"]);
	// Random is a button of its own after the group, not one of its choices.
	const random = root.querySelector('[data-action="random-color"]');
	expect(random?.closest('[role="radiogroup"]')).toBeNull();
	expect(random?.hasAttribute("role")).toBe(false);
	const swatches = root.querySelector(".swatches") as Element;
	expect(
		swatches.compareDocumentPosition(random as Node) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
});

test("with no holder chosen, the first holder takes the tab stop", async () => {
	const { root } = await mount();
	expect(radios(root, "data-owner").map((r) => r.tabindex)).toEqual([
		"0",
		"-1",
		"-1",
	]);
});

test("arrows, Home and End move the holder choice and focus with it, wrapping", async () => {
	const { element, root } = await mount({ group: scb });
	const owner = () =>
		radios(root, "data-owner").find((r) => r.checked === "true")?.value;
	const focused = () => root.activeElement?.getAttribute("data-owner");
	root.querySelector<HTMLElement>("[data-owner=KC]")?.focus();
	const steps: [string, string][] = [
		["ArrowRight", "NT"],
		["ArrowDown", "RI"],
		["ArrowRight", "KC"],
		["ArrowLeft", "RI"],
		["ArrowUp", "NT"],
		["End", "RI"],
		["Home", "KC"],
	];
	for (const [name, want] of steps) {
		const event = await key(element, ".seg", name);
		expect(event.defaultPrevented).toBe(true);
		expect(owner()).toBe(want);
		expect(focused()).toBe(want);
		expect(
			radios(root, "data-owner")
				.filter((r) => r.tabindex === "0")
				.map((r) => r.value),
		).toEqual([want]);
	}
	// Other keys pass through untouched.
	expect((await key(element, ".seg", "a")).defaultPrevented).toBe(false);
	expect(owner()).toBe("KC");
});

test("arrows, Home and End move the colour choice and focus with it, wrapping", async () => {
	const first = GROUP_COLORS[0] as GroupColor;
	const last = GROUP_COLORS.at(-1) as GroupColor;
	const { element, root } = await mount({ group: { ...scb, color: last } });
	const colour = () =>
		radios(root, "data-color").find((r) => r.checked === "true")?.value;
	const focused = () => root.activeElement?.getAttribute("data-color");
	root.querySelector<HTMLElement>(`[data-color="${last}"]`)?.focus();
	await key(element, ".swatches", "ArrowRight");
	expect([colour(), focused()]).toEqual([first, first]);
	await key(element, ".swatches", "ArrowLeft");
	expect([colour(), focused()]).toEqual([last, last]);
	await key(element, ".swatches", "Home");
	expect([colour(), focused()]).toEqual([first, first]);
	await key(element, ".swatches", "ArrowDown");
	expect([colour(), focused()]).toEqual([GROUP_COLORS[1], GROUP_COLORS[1]]);
	await key(element, ".swatches", "ArrowUp");
	expect([colour(), focused()]).toEqual([first, first]);
	await key(element, ".swatches", "End");
	expect([colour(), focused()]).toEqual([last, last]);
	const got = saved(element);
	await submit(element);
	expect(got[0]?.color).toBe(last);
});

test("Space and Enter choose the focused radio, as its button's own press", async () => {
	const { element, root } = await mount();
	const nt = root.querySelector<HTMLElement>("[data-owner=NT]");
	expect(nt?.localName).toBe("button");
	expect(nt?.getAttribute("type")).toBe("button");
	nt?.focus();
	// The group leaves these keys to the button, which presses itself.
	expect((await key(element, ".seg", " ")).defaultPrevented).toBe(false);
	expect((await key(element, ".seg", "Enter")).defaultPrevented).toBe(false);
	nt?.click();
	await element.updateComplete;
	expect(nt?.getAttribute("aria-checked")).toBe("true");
	expect(nt?.getAttribute("tabindex")).toBe("0");
});

test("with no holder chosen, ArrowRight on the focused first holder chooses the next", async () => {
	const { element, root } = await mount();
	root.querySelector<HTMLElement>("[data-owner=KC]")?.focus();
	await key(element, ".seg", "ArrowRight");
	expect(
		root.querySelector("[data-owner=NT]")?.getAttribute("aria-checked"),
	).toBe("true");
	expect(root.activeElement?.getAttribute("data-owner")).toBe("NT");
});
