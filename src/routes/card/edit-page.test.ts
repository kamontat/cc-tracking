import { expect, test } from "bun:test";
import type { CcCardForm } from "#components/cc-card-form";
import type { CcErrorBanner } from "#components/cc-error-banner";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import {
	bannerText,
	flatText,
	mount,
	seed,
	settle,
} from "../list/test-support";
import { renderCardEditPage } from "./edit-page";

const setup = async (
	mode: "new" | "edit",
	search: string,
	before?: (repo: Repository) => Promise<void>,
	repo: Repository = new InMemoryRepository(),
) => {
	setLocale("en");
	await seed(repo);
	await before?.(repo);
	const root = mount();
	const visited: string[] = [];
	renderCardEditPage(repo, root, mode, {
		search,
		navigate: (url) => {
			visited.push(url);
		},
	});
	await settle(5);
	return { repo, root, visited };
};

const form = (root: HTMLElement) =>
	root.querySelector<CcCardForm>("cc-card-form");

const inner = <T extends Element = HTMLElement>(
	root: HTMLElement,
	selector: string,
) => form(root)?.shadowRoot?.querySelector<T>(selector) ?? null;

const fill = async (root: HTMLElement, name: string, value: string) => {
	const field = inner<HTMLInputElement>(root, `[name="${name}"]`);
	if (!field) throw new Error(`no field ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input"));
	await form(root)?.updateComplete;
};

const submit = async (root: HTMLElement) => {
	inner(root, "form")?.dispatchEvent(new Event("submit", { cancelable: true }));
	await settle(5);
};

const fillNew = async (root: HTMLElement, id: string) => {
	await fill(root, "id", id);
	await fill(root, "name", "New Visa");
	await fill(root, "last4", "9999");
	await fill(root, "closeDay", "10");
	await fill(root, "dueOffsetDays", "20");
	await fill(root, "limitGroupId", "g1");
};

/** A repository whose card writes fail, for the keep-what-was-typed path. */
class FailingRepo extends InMemoryRepository {
	fail = false;
	override async saveCard(value: Card) {
		if (this.fail) throw new Error("disk full");
		return super.saveCard(value);
	}
}

test("/card/new: a compact sub-header to Cards, New card with no subtitle, over an empty form", async () => {
	const { root } = await setup("new", "");
	expect(flatText(root.querySelector(".sub-header__title"))).toBe("New card");
	expect(root.querySelector(".sub-header__detail")).toBeNull();
	expect(
		root
			.querySelector('.sub-header [data-action="back"]')
			?.getAttribute("href"),
	).toBe("/cards");
	expect(form(root)?.card).toBeNull();
	expect(form(root)?.groups.map((group) => group.id)).toEqual(["g1"]);
	// The floating + New menu stays off the form page.
	expect(document.documentElement.hasAttribute("data-form-page")).toBe(true);
});

test("/card/new: a save stores the card and replaces the address with its page", async () => {
	const { root, repo, visited } = await setup("new", "");
	await fillNew(root, "N 1");
	await submit(root);
	expect((await repo.getCard("N 1"))?.name).toBe("New Visa");
	expect(visited).toEqual(["/card?id=N%201"]);
});

test("/card/new: an id already stored is refused, the typing kept", async () => {
	const { root, repo, visited } = await setup("new", "");
	await fillNew(root, "A");
	await submit(root);
	expect(visited).toEqual([]);
	expect((await repo.getCard("A"))?.name).toBe("A card");
	expect(form(root)?.error).toContain('A card with id "A" already exists.');
	expect(inner<HTMLInputElement>(root, '[name="name"]')?.value).toBe(
		"New Visa",
	);
});

test("/card/edit: the title keeps the stored card's name while the form is typed in", async () => {
	const { root } = await setup("edit", "?id=A");
	await fill(root, "name", "Renamed");
	await settle(5);
	expect(flatText(root.querySelector(".sub-header__title"))).toBe(
		"A card · KC (1234)",
	);
});

test("/card/edit: the stored card in the form under a sub-header to its page", async () => {
	const { root } = await setup("edit", "?id=A", (r) =>
		r.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00, owner: "RI" }),
	);
	expect(flatText(root.querySelector(".sub-header__title"))).toBe(
		"A card · RI (1234)",
	);
	expect(flatText(root.querySelector(".sub-header__detail"))).toBe(
		"Card id can't change",
	);
	expect(
		root
			.querySelector('.sub-header [data-action="back"]')
			?.getAttribute("href"),
	).toBe("/card?id=A");
	expect(form(root)?.card?.id).toBe("A");
});

test("/card/edit: a save writes the changes and goes to the card's page", async () => {
	const { root, repo, visited } = await setup("edit", "?id=A");
	await fill(root, "name", "Renamed");
	await submit(root);
	expect((await repo.getCard("A"))?.name).toBe("Renamed");
	expect(visited).toEqual(["/card?id=A"]);
});

test("/card/edit: a failed save keeps the form, what was typed, and says why", async () => {
	const repo = new FailingRepo();
	const { root, visited } = await setup("edit", "?id=A", undefined, repo);
	await fill(root, "name", "Renamed");
	repo.fail = true;
	await submit(root);
	expect(visited).toEqual([]);
	expect(form(root)?.error).toContain("Could not save the card.");
	expect(form(root)?.error).toContain("disk full");
	expect(inner<HTMLInputElement>(root, '[name="name"]')?.value).toBe("Renamed");
	// The reason sits in the form, not twice over in the page's banner too.
	expect(bannerText(root)).toBe("");
});

test("/card/edit: a failed save never puts its reason in the page banner, not even for a moment", async () => {
	const repo = new FailingRepo();
	const { root } = await setup("edit", "?id=A", undefined, repo);
	const banner = root.querySelector<CcErrorBanner>(":scope > cc-error-banner");
	if (!banner) throw new Error("no banner");
	const seen: string[] = [];
	const proto = Object.getOwnPropertyDescriptor(
		Object.getPrototypeOf(banner),
		"message",
	);
	Object.defineProperty(banner, "message", {
		configurable: true,
		get: () => proto?.get?.call(banner),
		set: (value: string) => {
			seen.push(value);
			proto?.set?.call(banner, value);
		},
	});
	await fill(root, "name", "Renamed");
	repo.fail = true;
	await submit(root);
	expect(seen.filter((message) => message !== "")).toEqual([]);
});

test("/card/edit: no Archive or Delete on the edit page -- the card page's More menu has them", async () => {
	const { root } = await setup("edit", "?id=A");
	expect(inner(root, '[data-action="archive"]')).toBeNull();
	expect(inner(root, '[data-action="delete-card"]')).toBeNull();
	expect(root.querySelector("cc-more-menu")).toBeNull();
});

test("/card/edit: an unknown id says so, with no form", async () => {
	const { root } = await setup("edit", "?id=nope");
	expect(form(root)).toBeNull();
	expect(bannerText(root)).toContain("No card with the id nope.");
	expect(
		root
			.querySelector('.sub-header [data-action="back"]')
			?.getAttribute("href"),
	).toBe("/cards");
});

test("/card/edit with no id says no card was chosen", async () => {
	const { root } = await setup("edit", "");
	expect(form(root)).toBeNull();
	expect(bannerText(root)).toContain("No card was selected.");
});

test("re-renders its header in place on a language switch", async () => {
	const { root } = await setup("new", "");
	setLocale("th");
	await settle();
	expect(flatText(root.querySelector(".sub-header__title"))).toBe("บัตรใหม่");
	setLocale("en");
	await settle();
	expect(flatText(root.querySelector(".sub-header__title"))).toBe("New card");
});
