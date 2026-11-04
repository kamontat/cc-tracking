import { afterEach, expect, test } from "bun:test";
import { CcGroupPanels } from "#components/cc-group-panels";
import type { GroupPanel } from "#lib/domain/cards-view";
import type { Owner } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const g = (id: string, name: string, owner: Owner): LimitGroup => ({
	id,
	name,
	limit: 200_000_00,
	owner,
});
const panels: GroupPanel[] = [
	{
		group: g("g1", "SCB Business", "KC"),
		room: 61_550_00,
		limit: 200_000_00,
		usedPct: 69,
		cardIds: ["1", "2"],
		full: false,
	},
	{
		group: g("g/2", "UOB", "NT"),
		room: 3_120_00,
		limit: 200_000_00,
		usedPct: 92,
		cardIds: [],
		full: true,
	},
];

const mount = async (props: Partial<CcGroupPanels> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-group-panels") as CcGroupPanels;
	element.panels = panels;
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

test("heading with the count and Add group", async () => {
	const { element, root } = await mount();
	expect(text(root.querySelector("h2"))).toBe("Limit groups");
	expect(text(root.querySelector(".sec-head small"))).toBe("2");
	// One row the page can hide on a phone, with Add group at its end.
	expect(root.querySelector(".sec-head")?.getAttribute("part")).toBe("head");
	expect(
		root.querySelector(".sec-head > :last-child")?.getAttribute("data-action"),
	).toBe("add-group");
	let added = false;
	element.addEventListener("add-group", () => {
		added = true;
	});
	root.querySelector<HTMLElement>("[data-action=add-group]")?.click();
	expect(added).toBe(true);
});

test("a panel: name (holder), room of limit, the bar, ids and use", async () => {
	const { root } = await mount();
	const first = root.querySelector('button[data-group="g1"]');
	expect(text(first?.querySelector(".gname"))).toBe("SCB Business (KC)");
	expect(text(first?.querySelector("[data-numeric]"))).toBe(
		"฿61,550.00 of ฿200,000.00",
	);
	expect(first?.querySelector(".usage")).not.toBeNull();
	expect(text(first?.querySelector(".gnote"))).toBe("1, 2 · 69% used");
	const full = root.querySelector('button[data-group="g/2"]');
	expect(text(full?.querySelector(".gnote"))).toBe("92% used · getting full");
	expect(full?.querySelector(".usage")?.getAttribute("data-level")).toBe(
		"high",
	);
});

test("the bar takes the tiles' rail colours: grey within, amber from 80%, red past the limit", async () => {
	const over: GroupPanel = {
		group: g("g3", "KTC", "RI"),
		room: -21_065_00,
		limit: 200_000_00,
		usedPct: 111,
		cardIds: ["7"],
		full: true,
	};
	const { root } = await mount({ panels: [...panels, over] });
	const level = (id: string) =>
		root
			.querySelector(`button[data-group="${id}"] .usage`)
			?.getAttribute("data-level");
	expect(level("g1")).toBe("within");
	expect(level("g/2")).toBe("high");
	expect(level("g3")).toBe("over");
	expect(text(root.querySelector('button[data-group="g3"] .gnote'))).toBe(
		"7 · over limit",
	);
	const css = (
		customElements.get("cc-group-panels") as unknown as {
			elementStyles: { cssText: string }[];
		}
	).elementStyles
		.map((s) => s.cssText)
		.join("\n");
	expect(css).toMatch(
		/\.usage > span\s*\{[^}]*background: var\(--cc-text-muted\)/,
	);
	expect(css).not.toMatch(
		/\.usage > span\s*\{[^}]*background: var\(--cc-accent\)/,
	);
});

test("tapping a panel emits open-group with its id", async () => {
	const { element, root } = await mount();
	let id = "";
	element.addEventListener("open-group", (e) => {
		id = (e as CustomEvent<{ id: string }>).detail.id;
	});
	root.querySelector<HTMLElement>('button[data-group="g/2"]')?.click();
	expect(id).toBe("g/2");
});

test("no groups names the next step", async () => {
	const { root } = await mount({ panels: [] });
	expect(text(root.querySelector(".empty"))).toBe(
		"No limit groups yet. Add one.",
	);
	expect(text(root.querySelector(".sec-head small"))).toBe("0");
});

test("a panel wears its group's colour; none or a bad one wears none", async () => {
	const withColor = (p: GroupPanel, color: unknown): GroupPanel => ({
		...p,
		group: { ...p.group, color } as LimitGroup,
	});
	const [a, b] = panels as [GroupPanel, GroupPanel];
	const { root } = await mount({
		panels: [withColor(a, "teal"), withColor(b, "nope"), { ...a }],
	});
	const rows = [...root.querySelectorAll(".gpanel")];
	expect(rows[0]?.getAttribute("data-g")).toBe("teal");
	expect(rows[1]?.hasAttribute("data-g")).toBe(false);
	expect(rows[2]?.hasAttribute("data-g")).toBe(false);
	const css = (CcGroupPanels.styles as unknown[])
		.flat(Infinity)
		.map((s) => (s as { cssText: string }).cssText)
		.join("\n");
	expect(css).toMatch(/\.gpanel\[data-g\][^}]*var\(--g-soft\)/);
});
