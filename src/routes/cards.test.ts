import { expect, test } from "bun:test";
import type { Card } from "#lib/domain/types.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";
import { exportBackup, parseBackup } from "#lib/storage/transfer.ts";
import { prepareBackupFile, renderCardsPage } from "./cards.ts";

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

/** Simulates picking `text` as the file for the page's Import JSON input. */
const chooseFile = (root: HTMLElement, text: string) => {
	const input = root.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("no file input");
	input.files = [
		new File([text], "backup.json", { type: "application/json" }),
	] as unknown as FileList;
	input.dispatchEvent(new Event("change", { bubbles: true }));
};

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
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
	fill(root, "location", "Krabi");
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
	fill(root, "location", "Bangkok");
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
	fill(root, "location", "Bangkok");
	fill(root, "closeDay", "18");
	fill(root, "dueOffsetDays", "15");
	submit(root);
	await settle();

	expect(bannerMessage(root)).toBe("");

	const table = root.querySelector("cc-card-table");
	await table?.updateComplete;
	expect(table?.shadowRoot?.textContent).toContain("scb");
});

test("importing a backup merges it into a populated repository without wiping what was there", async () => {
	const backupSource = new InMemoryRepository();
	await backupSource.saveCard({
		...sampleCard,
		id: "scb",
		name: "SCB Mastercard",
		location: "Bangkok",
	});
	await backupSource.savePurchase({
		id: "p1",
		cardId: "scb",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	});
	await backupSource.savePayment({
		cardId: "scb",
		period: "2026-09",
		paidAt: "2026-10-01",
		closeDate: "2026-09-18",
		dueDate: "2026-10-03",
	});
	const backupText = JSON.stringify(await exportBackup(backupSource));

	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard); // pre-existing card, not part of the backup
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	chooseFile(root, backupText);
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect((await repo.listCards()).map((c) => c.id)).toEqual(["kbank", "scb"]);
	expect(await repo.getCard("kbank")).toEqual(sampleCard);
	expect(await repo.listPurchases("scb")).toHaveLength(1);
	expect(await repo.listPayments("scb")).toHaveLength(1);
});

test("importing a malformed file leaves a message in the banner and changes nothing", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	chooseFile(root, "{ this is not json");
	await settle();

	expect(bannerMessage(root)).toContain("Could not import that backup.");
	expect(await repo.listCards()).toEqual([sampleCard]);
});

test("prepareBackupFile produces text that parseBackup accepts and that round-trips every card, purchase, and payment", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	await repo.saveCard({
		...sampleCard,
		id: "scb",
		name: "SCB Mastercard",
		location: "Bangkok",
	});
	await repo.savePurchase({
		id: "p1",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	});
	await repo.savePayment({
		cardId: "kbank",
		period: "2026-09",
		paidAt: "2026-10-01",
		closeDate: "2026-09-18",
		dueDate: "2026-10-03",
	});

	const { filename, text } = await prepareBackupFile(
		repo,
		new Date("2026-09-21T03:00:00Z"),
	);
	expect(filename).toBe("cc-tracking-2026-09-21.json");

	const backup = parseBackup(text);
	expect(backup.cards).toEqual(await repo.listCards());
	expect(backup.purchases).toEqual(await repo.listPurchases("kbank"));
	expect(backup.payments).toEqual(await repo.listPayments("kbank"));
});

test("clicking Export JSON does not raise an error", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderCardsPage(repo, root);
	await settle();

	root
		.querySelector("article button.secondary")
		?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await settle();

	expect(bannerMessage(root)).toBe("");
});
