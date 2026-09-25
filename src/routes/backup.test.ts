import { expect, test } from "bun:test";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository } from "#lib/storage/repository";
import { exportBackup, parseBackup } from "#lib/storage/transfer";
import { prepareBackupFile, renderBackupPage } from "./backup";

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const bannerMessage = (root: HTMLElement): string =>
	root.querySelector("cc-error-banner")?.message ?? "";

const importStatus = (root: HTMLElement): string =>
	root.querySelector(".import-status")?.textContent?.trim() ?? "";

/** Simulates picking `text` as the file for the page's Import JSON input. */
const chooseFile = (root: HTMLElement, text: string, name = "backup.json") => {
	const input = root.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("no file input");
	input.files = [
		new File([text], name, { type: "application/json" }),
	] as unknown as FileList;
	input.dispatchEvent(new Event("change", { bubbles: true }));
};

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
};

test("importing a backup merges it into a populated repository without wiping what was there", async () => {
	const backupSource = new InMemoryRepository();
	await backupSource.saveCard({
		...sampleCard,
		id: "scb",
		name: "SCB Mastercard",
		location: "bangkok",
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
	renderBackupPage(repo, root);
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
	renderBackupPage(repo, root);
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
		location: "bangkok",
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
	renderBackupPage(repo, root);
	await settle();

	const exportButton = root.querySelector(
		'article button[data-variant="quiet"]',
	);
	expect(exportButton).not.toBeNull();
	exportButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await settle();

	expect(bannerMessage(root)).toBe("");
});

test("renders its heading and warning in the chosen language", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderBackupPage(repo, root);
	await settle();
	expect(root.querySelector("h1")?.textContent).toBe("Backup");
	expect(root.textContent).toContain("Export regularly");

	setLocale("th");
	await settle();
	expect(root.querySelector("h1")?.textContent).toBe("สำรองข้อมูล");
});

const oneCardBackup = async (): Promise<string> => {
	const source = new InMemoryRepository();
	await source.saveCard(sampleCard);
	await source.savePurchase({
		id: "p1",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	});
	return JSON.stringify(await exportBackup(source));
};

test("a successful import names the file and counts what it brought in", async () => {
	setLocale("en");
	const root = mount();
	renderBackupPage(new InMemoryRepository(), root);
	await settle();

	chooseFile(root, await oneCardBackup(), "cc-tracking-2026-09-21.json");
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(importStatus(root)).toBe(
		"Imported cc-tracking-2026-09-21.json: 1 cards, 1 purchases, 0 payments, 0 limit groups.",
	);
	expect(root.querySelector(".import-status")?.getAttribute("role")).toBe(
		"status",
	);
});

test("a failed import clears the success message from an earlier one", async () => {
	setLocale("en");
	const root = mount();
	renderBackupPage(new InMemoryRepository(), root);
	await settle();

	chooseFile(root, await oneCardBackup());
	await settle();
	expect(importStatus(root)).not.toBe("");

	chooseFile(root, "{ this is not json");
	await settle();

	expect(importStatus(root)).toBe("");
	expect(bannerMessage(root)).toContain("Could not import that backup.");
});

test("the success message follows a language switch", async () => {
	setLocale("en");
	const root = mount();
	renderBackupPage(new InMemoryRepository(), root);
	await settle();

	chooseFile(root, await oneCardBackup());
	await settle();
	const english = importStatus(root);

	setLocale("th");
	await settle();
	expect(importStatus(root)).toContain("backup.json");
	expect(importStatus(root)).not.toBe(english);
	setLocale("en");
});
