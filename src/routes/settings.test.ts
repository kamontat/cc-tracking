import { expect, test } from "bun:test";
import type { Settings } from "#lib/domain/settings";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { LocalStorageRepository } from "#lib/storage/local";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { exportBackup, parseBackup } from "#lib/storage/transfer";
import { prepareBackupFile, renderSettingsPage } from "./settings";

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

/** A repository whose saveSettings always rejects, to exercise the failure path in isolation. */
class RejectingSettingsRepository extends InMemoryRepository {
	override saveSettings(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("shows the stored settings", async () => {
	const repo = new InMemoryRepository();
	await repo.saveSettings({ purchaseLocations: ["bangkok"] });
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	const panel = root.querySelector("cc-settings");
	expect(panel?.settings.purchaseLocations).toEqual(["bangkok"]);
});

test("shows Krabi alone before anything has been saved", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi"],
	);
});

test("stores a change and shows it back", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	root.querySelector("cc-settings")?.dispatchEvent(
		new CustomEvent<Settings>("save-settings", {
			detail: { purchaseLocations: ["krabi", "phichit"] },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(await repo.getSettings()).toEqual({
		purchaseLocations: ["krabi", "phichit"],
	});
	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi", "phichit"],
	);
});

test("a failed save leaves a message in the banner and stores nothing", async () => {
	const repo = new RejectingSettingsRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	root.querySelector("cc-settings")?.dispatchEvent(
		new CustomEvent<Settings>("save-settings", {
			detail: { purchaseLocations: [] },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.getSettings()).toEqual({ purchaseLocations: ["krabi"] });
});

test("renders its heading in the chosen language", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	expect(root.textContent).toContain("Settings");

	setLocale("th");
	await settle();
	expect(root.textContent).toContain("ตั้งค่า");
});

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
	renderSettingsPage(repo, root);
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
	renderSettingsPage(repo, root);
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
	renderSettingsPage(repo, root);
	await settle();

	const exportButton = root.querySelector(
		'article.backup button[data-variant="quiet"]',
	);
	expect(exportButton).not.toBeNull();
	exportButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await settle();

	expect(bannerMessage(root)).toBe("");
});

test("renders the backup section's heading and warning in the chosen language", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	expect(root.querySelector("article.backup h2")?.textContent).toBe("Backup");
	expect(root.textContent).toContain("Export regularly");

	setLocale("th");
	await settle();
	expect(root.querySelector("article.backup h2")?.textContent).toBe(
		"สำรองข้อมูล",
	);
	setLocale("en");
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
	renderSettingsPage(new InMemoryRepository(), root);
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
	renderSettingsPage(new InMemoryRepository(), root);
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
	renderSettingsPage(new InMemoryRepository(), root);
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

test("importing a backup that carries settings shows them in the settings panel", async () => {
	const source = new InMemoryRepository();
	await source.saveSettings({ purchaseLocations: ["bangkok", "phichit"] });
	const backupText = JSON.stringify(await exportBackup(source));

	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi"],
	);

	chooseFile(root, backupText);
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["bangkok", "phichit"],
	);
});

const click = (root: HTMLElement, action: string) => {
	const button = root.querySelector<HTMLButtonElement>(
		`.reset [data-action="${action}"]`,
	);
	if (!button) throw new Error(`no ${action} button`);
	button.click();
};

const resetText = (root: HTMLElement): string =>
	root.querySelector(".reset")?.textContent?.replace(/\s+/g, " ") ?? "";

const resetStatus = (root: HTMLElement): string =>
	root.querySelector(".reset-status")?.textContent?.trim() ?? "";

/** A card, its group, two purchases and a setting: something for a reset to count and delete. */
const populated = async <R extends Repository>(repo: R): Promise<R> => {
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 });
	await repo.saveCard({ ...sampleCard, limitGroupId: "pool" });
	await repo.savePurchase({
		id: "p1",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 100,
		note: "",
	});
	await repo.savePurchase({
		id: "p2",
		cardId: "kbank",
		date: "2026-09-06",
		amount: 100,
		note: "",
	});
	await repo.saveSettings({ purchaseLocations: ["bangkok"] });
	return repo;
};

test("asks before resetting, counting what it would delete", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	expect(root.querySelector('.reset [data-action="confirm-reset"]')).toBeNull();
	click(root, "reset");
	await settle();

	expect(resetText(root)).toContain(
		"This deletes 1 cards, 2 purchases, 0 payments and 1 limit groups.",
	);
	expect(root.querySelector('.reset [data-action="reset"]')).toBeNull();
	expect(await repo.listCards()).toHaveLength(1);
});

test("backing out of a reset deletes nothing", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "cancel-reset");
	await settle();

	expect(root.querySelector('.reset [data-action="reset"]')).not.toBeNull();
	expect(await repo.listCards()).toHaveLength(1);
	expect(await repo.listPurchases("kbank")).toHaveLength(2);
});

test("confirming a reset deletes every record and setting, and says so", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "confirm-reset");
	await settle();

	expect(await repo.listCards()).toEqual([]);
	expect(await repo.listPurchases("kbank")).toEqual([]);
	expect(await repo.listLimitGroups()).toEqual([]);
	expect(await repo.getSettings()).toEqual({ purchaseLocations: ["krabi"] });
	// The page reloads what is left, so the panel shows the defaults, not the old choice.
	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi"],
	);
	expect(resetStatus(root)).toBe("All data deleted.");
	expect(root.querySelector('.reset [data-action="reset"]')).not.toBeNull();
});

test("a reset keeps the reader's language", async () => {
	localStorage.clear();
	setLocale("th");
	const repo = await populated(new LocalStorageRepository(localStorage));
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "confirm-reset");
	await settle();

	expect(await repo.listCards()).toEqual([]);
	expect(localStorage.getItem("cc:lang")).toBe("th");
	setLocale("en");
});

test("a failed reset says so and keeps the data", async () => {
	class RejectingClear extends InMemoryRepository {
		override clearAll(): Promise<void> {
			return Promise.reject(new Error("disk is locked"));
		}
	}
	setLocale("en");
	const repo = await populated(new RejectingClear());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "confirm-reset");
	await settle();

	expect(bannerMessage(root)).toContain("disk is locked");
	expect(resetStatus(root)).toBe("");
	expect(await repo.listCards()).toHaveLength(1);
});

test("the reset question follows a language switch", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	setLocale("th");
	await settle();

	expect(resetText(root)).not.toContain("This deletes");
	expect(
		root.querySelector('.reset [data-action="confirm-reset"]'),
	).not.toBeNull();
	setLocale("en");
});
