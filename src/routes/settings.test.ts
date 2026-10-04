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

const clickBackup = (root: HTMLElement, action: string) => {
	const button = root.querySelector<HTMLButtonElement>(
		`.backup [data-action="${action}"]`,
	);
	if (!button) throw new Error(`no ${action} button`);
	button.click();
};

const backupText = (root: HTMLElement): string =>
	root.querySelector(".backup")?.textContent?.replace(/\s+/g, " ") ?? "";

const pasteArea = (root: HTMLElement): HTMLTextAreaElement | null =>
	root.querySelector<HTMLTextAreaElement>(".backup textarea");

/** Opens the paste panel, types `text` into it and presses its Import button. */
const pasteBackup = async (root: HTMLElement, text: string) => {
	clickBackup(root, "open-paste");
	await settle();
	const area = pasteArea(root);
	if (!area) throw new Error("no paste area");
	area.value = text;
	area.dispatchEvent(new Event("input", { bubbles: true }));
	clickBackup(root, "import-text");
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
	clickBackup(root, "merge-import");
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

	expect(bannerMessage(root)).toContain("Could not restore that copy.");
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
	expect(root.textContent).toContain("keep a copy somewhere safe");

	setLocale("th");
	await settle();
	expect(root.querySelector("article.backup h2")?.textContent).toBe(
		"สำรองข้อมูล",
	);
	setLocale("en");
});

test("splits the backup into saving a copy and restoring one, each with its own actions", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	const save = root.querySelector(".backup__way--save");
	const restore = root.querySelector(".backup__way--restore");
	expect(save?.querySelector("h3")?.textContent).toBe("Save a copy");
	expect(restore?.querySelector("h3")?.textContent).toBe("Restore a copy");
	expect(save?.textContent).toContain("Download file");
	expect(restore?.querySelector('input[type="file"]')).not.toBeNull();
	expect(restore?.querySelector('[data-action="open-paste"]')).not.toBeNull();
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
		"Restored cc-tracking-2026-09-21.json: 1 cards, 1 purchases, 0 payments, 0 limit groups.",
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
	expect(bannerMessage(root)).toContain("Could not restore that copy.");
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

test("importing into a browser that already holds data asks to merge or replace, counting both sides", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	chooseFile(root, await oneCardBackup(), "cc-tracking-2026-09-21.json");
	await settle();

	expect(backupText(root)).toContain("Restore cc-tracking-2026-09-21.json?");
	const rows = [...root.querySelectorAll(".backup__compare > div")].map(
		(row) => [
			row.querySelector("dt")?.textContent,
			row.querySelector("dd")?.textContent,
		],
	);
	expect(rows).toEqual([
		["In this browser", "1 cards, 2 purchases, 0 payments, 1 limit groups"],
		["In the copy", "1 cards, 1 purchases, 0 payments, 0 limit groups"],
	]);
	expect(root.querySelector('.backup [data-action="open-paste"]')).toBeNull();
	expect(
		root.querySelector('.backup [data-action="merge-import"]'),
	).not.toBeNull();
	expect(
		root.querySelector('.backup [data-action="replace-import"]'),
	).not.toBeNull();
	expect(importStatus(root)).toBe("");
	expect(await repo.listPurchases("kbank")).toHaveLength(2);
});

test("importing into an empty browser asks nothing", async () => {
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	chooseFile(root, await oneCardBackup());
	await settle();

	expect(root.querySelector('.backup [data-action="merge-import"]')).toBeNull();
	expect(importStatus(root)).not.toBe("");
});

test("choosing replace leaves only what the backup carries", async () => {
	setLocale("en");
	const source = new InMemoryRepository();
	await source.saveCard({ ...sampleCard, id: "scb", name: "SCB" });
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	chooseFile(root, JSON.stringify(await exportBackup(source)), "b.json");
	await settle();
	clickBackup(root, "replace-import");
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect((await repo.listCards()).map((c) => c.id)).toEqual(["scb"]);
	expect(await repo.listLimitGroups()).toEqual([]);
	expect(importStatus(root)).toBe(
		"Restored b.json: 1 cards, 0 purchases, 0 payments, 0 limit groups.",
	);
	expect(
		root.querySelector('.backup [data-action="replace-import"]'),
	).toBeNull();
});

test("cancelling the merge-or-replace question imports nothing", async () => {
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	chooseFile(root, await oneCardBackup());
	await settle();
	clickBackup(root, "cancel-import");
	await settle();

	expect(root.querySelector('.backup [data-action="merge-import"]')).toBeNull();
	expect(importStatus(root)).toBe("");
	expect(await repo.listPurchases("kbank")).toHaveLength(2);
	expect(await repo.listLimitGroups()).toHaveLength(1);
});

test("the paste panel stays closed until asked for", async () => {
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	expect(pasteArea(root)).toBeNull();
	clickBackup(root, "open-paste");
	await settle();
	expect(pasteArea(root)).not.toBeNull();
	clickBackup(root, "close-paste");
	await settle();
	expect(pasteArea(root)).toBeNull();
});

test("importing pasted text brings it in and closes the panel", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	await pasteBackup(root, await oneCardBackup());
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect((await repo.listCards()).map((c) => c.id)).toEqual(["kbank"]);
	expect(importStatus(root)).toBe(
		"Restored pasted text: 1 cards, 1 purchases, 0 payments, 0 limit groups.",
	);
	expect(pasteArea(root)).toBeNull();
});

test("pasted text into a browser that holds data asks to merge or replace too", async () => {
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	setLocale("en");
	await pasteBackup(root, await oneCardBackup());
	await settle();
	expect(backupText(root)).toContain("Restore pasted text");
	expect(pasteArea(root)).toBeNull();
	clickBackup(root, "merge-import");
	await settle();

	expect(await repo.listPurchases("kbank")).toHaveLength(2);
	expect(await repo.listLimitGroups()).toHaveLength(1);
	expect(importStatus(root)).not.toBe("");
});

test("malformed pasted text leaves a message, keeps the text, and changes nothing", async () => {
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	await pasteBackup(root, "{ not json");
	await settle();

	expect(bannerMessage(root)).toContain("Could not restore that copy.");
	expect(pasteArea(root)?.value).toBe("{ not json");
	expect(root.querySelector('.backup [data-action="merge-import"]')).toBeNull();
	expect(await repo.listPurchases("kbank")).toHaveLength(2);
});

/** Swaps in a stub `navigator.clipboard` for the length of `run`. */
const withClipboard = async (
	clipboard: Partial<Pick<Clipboard, "readText" | "writeText">>,
	run: () => Promise<void>,
) => {
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: clipboard,
	});
	try {
		await run();
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original);
		else delete (navigator as { clipboard?: unknown }).clipboard;
	}
};

test("paste from clipboard fills the text area", async () => {
	await withClipboard({ readText: async () => '{"version":2}' }, async () => {
		const root = mount();
		renderSettingsPage(new InMemoryRepository(), root);
		await settle();

		clickBackup(root, "open-paste");
		await settle();
		clickBackup(root, "read-clipboard");
		await settle();

		expect(pasteArea(root)?.value).toBe('{"version":2}');
	});
});

test("a clipboard the browser will not read leaves a message", async () => {
	setLocale("en");
	await withClipboard(
		{ readText: () => Promise.reject(new Error("denied")) },
		async () => {
			const root = mount();
			renderSettingsPage(new InMemoryRepository(), root);
			await settle();

			clickBackup(root, "open-paste");
			await settle();
			clickBackup(root, "read-clipboard");
			await settle();

			expect(bannerMessage(root)).toContain("Could not read the clipboard.");
		},
	);
});

test("the merge-or-replace question follows a language switch", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(await populated(new InMemoryRepository()), root);
	await settle();

	chooseFile(root, await oneCardBackup());
	await settle();
	expect(backupText(root)).toContain("In this browser");

	setLocale("th");
	await settle();
	expect(backupText(root)).not.toContain("In this browser");
	expect(
		root.querySelector('.backup [data-action="merge-import"]'),
	).not.toBeNull();
	setLocale("en");
});

const exportStatus = (root: HTMLElement): string =>
	root.querySelector(".export-status")?.textContent?.trim() ?? "";

test("copy to clipboard writes the same backup Export JSON would, and says so", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	let written = "";
	await withClipboard(
		{
			writeText: async (text) => {
				written = text;
			},
		},
		async () => {
			const root = mount();
			renderSettingsPage(repo, root);
			await settle();

			clickBackup(root, "copy-export");
			await settle();

			expect(bannerMessage(root)).toBe("");
			const copied = parseBackup(written);
			expect(copied.cards).toEqual(await repo.listCards());
			expect(copied.purchases).toHaveLength(2);
			expect(exportStatus(root)).toBe("Copied to the clipboard.");
			expect(root.querySelector(".export-status")?.getAttribute("role")).toBe(
				"status",
			);
		},
	);
});

test("a clipboard the browser will not write leaves a message", async () => {
	setLocale("en");
	await withClipboard(
		{ writeText: () => Promise.reject(new Error("denied")) },
		async () => {
			const root = mount();
			renderSettingsPage(new InMemoryRepository(), root);
			await settle();

			clickBackup(root, "copy-export");
			await settle();

			expect(bannerMessage(root)).toContain("Could not copy the text.");
			expect(exportStatus(root)).toBe("");
		},
	);
});

test("copy to clipboard is not offered where the browser cannot write to it", async () => {
	await withClipboard({}, async () => {
		const root = mount();
		renderSettingsPage(new InMemoryRepository(), root);
		await settle();

		expect(
			root.querySelector('.backup [data-action="copy-export"]'),
		).toBeNull();
	});
});
