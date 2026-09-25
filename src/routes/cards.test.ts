import { expect, test } from "bun:test";
import { today } from "#lib/domain/date";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { MIGRATION_KEY } from "#lib/storage/migrate-locations";
import { InMemoryRepository } from "#lib/storage/repository";
import { renderCardsPage } from "./cards";

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const fill = (root: HTMLElement, name: string, value: string) => {
	const field = root
		.querySelector("cc-card-form")
		?.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (root: HTMLElement) => {
	root
		.querySelector("cc-card-form")
		?.shadowRoot?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

const bannerMessage = (root: HTMLElement): string =>
	root.querySelector("cc-error-banner")?.message ?? "";

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
};

/** A repository whose saveCard always rejects, to exercise the failure path in isolation. */
class RejectingSaveRepository extends InMemoryRepository {
	override saveCard(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("a failed save keeps its error message after the refresh that follows it", async () => {
	const repo = new RejectingSaveRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "kbank");
	fill(root, "name", "KBank Visa");
	fill(root, "last4", "4821");
	fill(root, "location", "krabi");
	fill(root, "closeDay", "18");
	fill(root, "dueOffsetDays", "15");
	fill(root, "limitGroupId", "pool");
	submit(root);
	await settle();

	// The write failed, but the read that follows it (to refresh the table) succeeds:
	// the banner must still show the failure, not be wiped by that successful read.
	expect(bannerMessage(root)).toContain("disk is full");
});

test("creating a card with an id that already exists does not overwrite it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "kbank");
	fill(root, "name", "A completely different card");
	fill(root, "last4", "9999");
	fill(root, "location", "bangkok");
	fill(root, "closeDay", "1");
	fill(root, "dueOffsetDays", "10");
	fill(root, "limitGroupId", "pool");
	submit(root);
	await settle();

	expect(await repo.getCard("kbank")).toEqual(sampleCard);
	const message = bannerMessage(root);
	expect(message).toContain("kbank");
	expect(message.toLowerCase()).toContain("unique");
});

test("a successful save clears the banner and the card appears in the table", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "scb");
	fill(root, "name", "SCB Mastercard");
	fill(root, "last4", "1234");
	fill(root, "location", "bangkok");
	fill(root, "closeDay", "18");
	fill(root, "dueOffsetDays", "15");
	fill(root, "limitGroupId", "pool");
	submit(root);
	await settle();

	expect(bannerMessage(root)).toBe("");

	const table = root.querySelector("cc-card-table");
	await table?.updateComplete;
	expect(table?.shadowRoot?.textContent).toContain("scb");
});

test("names the cards whose location was reset, once", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	const storage = globalThis.localStorage;
	storage.clear();
	storage.setItem(MIGRATION_KEY, JSON.stringify(["KBank Visa", "SCB"]));

	renderCardsPage(repo, root, storage);
	await settle();

	const notice = root.querySelector('[data-testid="location-reset"]');
	expect(notice?.textContent).toContain("KBank Visa");
	expect(notice?.textContent).toContain("SCB");
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();

	// A second render of a fresh page must not repeat it.
	const second = mount();
	renderCardsPage(repo, second, storage);
	await settle();
	expect(second.querySelector('[data-testid="location-reset"]')).toBeNull();
});

test("leaves backup to the settings page, offering no export or import of its own", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	expect(root.querySelector('input[type="file"]')).toBeNull();
	expect(root.textContent).not.toContain("Export JSON");
});

test("renders its heading in the chosen language", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();
	expect(root.querySelector("h1")?.textContent).toBe("Cards");

	setLocale("th");
	await settle();
	expect(root.querySelector("h1")?.textContent).toBe("บัตร");
});

test("shows the limit groups with what each has used", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	await repo.saveCard({ ...sampleCard, limitGroupId: "pool" });
	await repo.savePurchase({
		id: "p1",
		cardId: sampleCard.id,
		date: today(),
		amount: 120_000,
		note: "fuel",
	});

	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	const section = root.querySelector("cc-limit-group-table");
	expect(section?.groups).toHaveLength(1);
	expect(section?.usage).toEqual({ pool: 120_000 });
	expect(section?.counts).toEqual({ pool: 1 });
});

test("saves a new limit group", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root.querySelector("cc-limit-group-form")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "pool", name: "KBank account", limit: 500_000 },
		}),
	);
	await settle();

	expect(await repo.listLimitGroups()).toEqual([
		{ id: "pool", name: "KBank account", limit: 500_000 },
	]);
});

test("deletes a limit group", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("cc-limit-group-table")
		?.dispatchEvent(new CustomEvent("remove-group", { detail: "pool" }));
	await settle();

	expect(await repo.listLimitGroups()).toEqual([]);
});

test("feeds the group being edited to the form, and lets go once it is saved", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("cc-limit-group-table")
		?.dispatchEvent(new CustomEvent("edit-group", { detail: "pool" }));
	await settle();

	expect(root.querySelector("cc-limit-group-form")?.group?.id).toBe("pool");

	root.querySelector("cc-limit-group-form")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: {
				id: "pool",
				name: "KBank account",
				limit: 700_000,
				owner: "NT",
			},
		}),
	);
	await settle();

	expect(root.querySelector("cc-limit-group-form")?.group).toBeNull();
	expect(await repo.listLimitGroups()).toEqual([
		{ id: "pool", name: "KBank account", limit: 700_000, owner: "NT" },
	]);
});

test("lets go of a group that is deleted while it is being edited", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("cc-limit-group-table")
		?.dispatchEvent(new CustomEvent("edit-group", { detail: "pool" }));
	await settle();
	root
		.querySelector("cc-limit-group-table")
		?.dispatchEvent(new CustomEvent("remove-group", { detail: "pool" }));
	await settle();

	// Still loaded, a Save would write the deleted group straight back.
	expect(root.querySelector("cc-limit-group-form")?.group).toBeNull();
});

test("lets go of a card that is deleted while it is being edited", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("cc-card-table")
		?.dispatchEvent(new CustomEvent("edit", { detail: sampleCard.id }));
	await settle();
	root
		.querySelector("cc-card-table")
		?.dispatchEvent(new CustomEvent("remove", { detail: sampleCard.id }));
	await settle();

	expect(root.querySelector("cc-card-form")?.card).toBeNull();
});

test("reopens a hand-collapsed form when the same group is picked again", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	const table = root.querySelector("cc-limit-group-table");
	table?.dispatchEvent(new CustomEvent("edit-group", { detail: "pool" }));
	await settle();

	const form = root.querySelector("cc-limit-group-form");
	const section = form?.shadowRoot?.querySelector("details");
	if (!section) throw new Error("no details element");
	section.open = false;
	section.dispatchEvent(new Event("toggle"));
	await settle();

	// Picking the same row again is the reader asking for it back.
	table?.dispatchEvent(new CustomEvent("edit-group", { detail: "pool" }));
	await settle();

	expect(form?.shadowRoot?.querySelector("details")?.open).toBe(true);
});

test("reopens a hand-collapsed card form when the same card is picked again", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	const table = root.querySelector("cc-card-table");
	table?.dispatchEvent(new CustomEvent("edit", { detail: sampleCard.id }));
	await settle();

	const form = root.querySelector("cc-card-form");
	const section = form?.shadowRoot?.querySelector("details");
	if (!section) throw new Error("no details element");
	section.open = false;
	section.dispatchEvent(new Event("toggle"));
	await settle();

	table?.dispatchEvent(new CustomEvent("edit", { detail: sampleCard.id }));
	await settle();

	expect(form?.shadowRoot?.querySelector("details")?.open).toBe(true);
});

test("says so when a limit group cannot be saved", async () => {
	class Rejecting extends InMemoryRepository {
		override saveLimitGroup(): Promise<void> {
			return Promise.reject(new Error("disk is full"));
		}
	}
	const root = mount();
	renderCardsPage(new Rejecting(), root);
	await settle();

	root.querySelector("cc-limit-group-form")?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "pool", name: "KBank account", limit: 500_000 },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
});

test("opens the form on the card a link asked to edit", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root, globalThis.localStorage, "kbank");
	await settle();

	const form = root.querySelector("cc-card-form");
	await form?.updateComplete;
	expect(form?.card?.id).toBe("kbank");
	expect(form?.shadowRoot?.querySelector("details")?.open).toBe(true);
});

test("ignores an edit link to a card that is not there", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root, globalThis.localStorage, "gone");
	await settle();

	expect(root.querySelector("cc-card-form")?.card).toBeNull();
});

test("keeps both forms together above the lists rather than between them", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	const forms = root.querySelector(".registry-forms");
	expect(forms?.querySelector("cc-card-form")).not.toBeNull();
	expect(forms?.querySelector("cc-limit-group-form")).not.toBeNull();
	expect(forms?.querySelector("cc-card-table")).toBeNull();
	const tags = [...root.children].map(
		(child) =>
			child.querySelector("cc-card-table, cc-limit-group-table")?.localName ??
			child.className,
	);
	expect(tags.indexOf("registry-forms")).toBeLessThan(
		tags.indexOf("cc-card-table"),
	);
});
