import { expect, test } from "bun:test";
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
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "kbank");
	fill(root, "name", "KBank Visa");
	fill(root, "last4", "4821");
	fill(root, "location", "krabi");
	fill(root, "closeDay", "18");
	fill(root, "dueOffsetDays", "15");
	submit(root);
	await settle();

	// The write failed, but the read that follows it (to refresh the table) succeeds:
	// the banner must still show the failure, not be wiped by that successful read.
	expect(bannerMessage(root)).toContain("disk is full");
});

test("creating a card with an id that already exists does not overwrite it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "kbank");
	fill(root, "name", "A completely different card");
	fill(root, "last4", "9999");
	fill(root, "location", "bangkok");
	fill(root, "closeDay", "1");
	fill(root, "dueOffsetDays", "10");
	submit(root);
	await settle();

	expect(await repo.getCard("kbank")).toEqual(sampleCard);
	const message = bannerMessage(root);
	expect(message).toContain("kbank");
	expect(message.toLowerCase()).toContain("unique");
});

test("a successful save clears the banner and the card appears in the table", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	fill(root, "id", "scb");
	fill(root, "name", "SCB Mastercard");
	fill(root, "last4", "1234");
	fill(root, "location", "bangkok");
	fill(root, "closeDay", "18");
	fill(root, "dueOffsetDays", "15");
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

test("leaves backup to the backup page, offering no export or import of its own", async () => {
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
