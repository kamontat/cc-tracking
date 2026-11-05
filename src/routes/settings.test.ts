import { expect, test } from "vitest";
import { defaultLocations } from "#lib/domain/locations";
import { DEFAULT_SETTINGS } from "#lib/domain/settings";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { memoryStorage } from "#lib/storage/contract";
import { LocalStorageRepository } from "#lib/storage/local";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { SEED_KEY } from "#lib/storage/seed-locations";
import { exportBackupV3, parseAnyBackup } from "#lib/storage/transfer-v3";
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

const row = (root: HTMLElement, name: string): HTMLElement => {
	const found = root.querySelector<HTMLElement>(`.set-row[data-row="${name}"]`);
	if (!found) throw new Error(`no ${name} row`);
	return found;
};

/** The restore sheet, opened from the Restore row unless it already shows. */
const openRestore = async (root: HTMLElement): Promise<ShadowRoot> => {
	if (!root.querySelector("cc-restore-sheet")) {
		row(root, "restore").click();
		await settle();
	}
	const sheet = root.querySelector("cc-restore-sheet");
	if (!sheet) throw new Error("no restore sheet");
	await sheet.updateComplete;
	return sheet.shadowRoot as ShadowRoot;
};

/** Presses `action` in the restore sheet. */
const clickSheet = async (root: HTMLElement, action: string) => {
	const shadow = await openRestore(root);
	const button = shadow.querySelector<HTMLElement>(`[data-action="${action}"]`);
	if (!button) throw new Error(`no ${action} button`);
	button.click();
	await settle();
	await settle();
};

/** Opens the restore sheet and picks `text` as its file. */
const chooseFile = async (
	root: HTMLElement,
	text: string,
	name = "backup.json",
) => {
	const shadow = await openRestore(root);
	const input = shadow.querySelector<HTMLInputElement>(
		'[data-action="choose-file"]',
	);
	if (!input) throw new Error("no file input");
	input.files = [
		new File([text], name, { type: "application/json" }),
	] as unknown as FileList;
	input.dispatchEvent(new Event("change"));
	await settle();
	await settle();
};

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

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
};

/** A repository holding the three starting location records, as bootstrap seeds them. */
const seeded = async <R extends Repository>(repo: R): Promise<R> => {
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation(record);
	return repo;
};

const sectionsIn = (root: HTMLElement, column: string): string[] =>
	[
		...root.querySelectorAll(`.settings-grid__${column} > section.set-section`),
	].map((section) => section.getAttribute("data-section") ?? "");

test("lays the sections out in two columns: display, locations and backup, then reset and about", async () => {
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	expect(sectionsIn(root, "main")).toEqual(["display", "locations", "backup"]);
	expect(sectionsIn(root, "side")).toEqual(["reset", "about"]);
	for (const section of root.querySelectorAll("section.set-section")) {
		expect(section.querySelector(":scope > h2")).not.toBeNull();
		expect(section.querySelector(":scope > .set")).not.toBeNull();
	}
	expect(
		root.querySelector('[data-section="display"] .set cc-display-settings'),
	).not.toBeNull();
	expect(
		root.querySelector('[data-section="about"] .set cc-about'),
	).not.toBeNull();
});

test("names each section in the chosen language", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	const headings = () =>
		[...root.querySelectorAll("section.set-section > h2")].map((h) =>
			h.textContent?.trim(),
		);
	expect(headings()).toEqual([
		"Display",
		"Locations",
		"Backup",
		"Reset",
		"About",
	]);
	setLocale("th");
	await settle();
	expect(headings()).not.toContain("Backup");
	setLocale("en");
});

test("the locations row links to the locations page and sums them up", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(await seeded(new InMemoryRepository()), root);
	await settle();

	const locations = row(root, "locations");
	expect(locations.tagName).toBe("A");
	expect(locations.getAttribute("href")).toBe("/settings/locations");
	expect(locations.textContent).toContain("Manage locations");
	expect(locations.textContent?.replace(/\s+/g, " ")).toContain(
		"3 places · Krabi takes purchases",
	);
});

test("the locations row names every place that takes purchases, A to Z, or says none do", async () => {
	setLocale("en");
	const repo = await seeded(new InMemoryRepository());
	await repo.saveLocation({
		id: "bangkok",
		name: "Bangkok",
		takesPurchases: true,
	});
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	expect(row(root, "locations").textContent?.replace(/\s+/g, " ")).toContain(
		"3 places · Bangkok, Krabi take purchases",
	);

	await repo.saveLocation({
		id: "bangkok",
		name: "Bangkok",
		takesPurchases: false,
	});
	await repo.saveLocation({
		id: "krabi",
		name: "Krabi",
		takesPurchases: false,
	});
	await repo.deleteLocation("phichit");
	const again = mount();
	renderSettingsPage(repo, again);
	await settle();
	expect(row(again, "locations").textContent?.replace(/\s+/g, " ")).toContain(
		"2 places · none take purchases",
	);
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

test("prepareBackupFile produces text that parseAnyBackup accepts and that round-trips every card, purchase, and payment", async () => {
	const repo = await seeded(new InMemoryRepository());
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
	await repo.saveCardPayment({
		id: "cp1",
		cardId: "kbank",
		date: "2026-10-01",
		amount: 5_000,
		status: "paid",
	});

	const { filename, text } = await prepareBackupFile(
		repo,
		new Date("2026-09-21T03:00:00Z"),
	);
	expect(filename).toBe("cc-tracking-2026-09-21.json");

	const backup = parseAnyBackup(text);
	expect(backup.cards).toEqual(await repo.listCards());
	expect(backup.purchases).toEqual(await repo.listPurchases("kbank"));
	expect(backup.payments).toEqual(await repo.listCardPayments("kbank"));
});

test("clicking Export JSON does not raise an error", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	row(root, "download").dispatchEvent(
		new MouseEvent("click", { bubbles: true }),
	);
	await settle();

	expect(bannerMessage(root)).toBe("");
});

test("the backup rows: download names the file it saves, copy and restore say what they do", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	const rows = [
		...root.querySelectorAll('[data-section="backup"] .set > .set-row'),
	].map((found) => found.getAttribute("data-row"));
	expect(rows).toEqual(["download", "copy", "restore"]);
	const today = new Date().toISOString().slice(0, 10);
	expect(row(root, "download").textContent).toContain("Download a copy");
	expect(row(root, "download").textContent).toContain(
		`cc-tracking-${today}.json`,
	);
	expect(row(root, "copy").textContent).toContain(
		"To paste into another browser",
	);
	expect(row(root, "restore").textContent).toContain("Restore a copy");
});

const oneCardBackup = async (): Promise<string> => {
	const source = await seeded(new InMemoryRepository());
	await source.saveCard(sampleCard);
	await source.savePurchase({
		id: "p1",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	});
	return JSON.stringify(await exportBackupV3(source, new Date()));
};

test("the backup section reminds that the data lives only in this browser", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	expect(
		root
			.querySelector('[data-section="backup"] > .set-note')
			?.textContent?.trim(),
	).toBe(
		"Your data lives only in this browser. Download a copy to keep it safe.",
	);
});

test("the Restore row opens the restore sheet, and closing it forgets its steps", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const root = mount();
		renderSettingsPage(new InMemoryRepository(), root);
		await settle();
		expect(root.querySelector("cc-restore-sheet")).toBeNull();

		await clickSheet(root, "paste-by-hand");
		let shadow = await openRestore(root);
		const area = shadow.querySelector("textarea") as HTMLTextAreaElement;
		area.value = "half typed";
		area.dispatchEvent(new Event("input"));
		shadow
			.querySelector("cc-modal")
			?.shadowRoot?.querySelector<HTMLElement>('[data-action="close"]')
			?.click();
		await settle();
		expect(root.querySelector("cc-restore-sheet")).toBeNull();

		shadow = await openRestore(root);
		expect(shadow.querySelector("[data-step]")?.getAttribute("data-step")).toBe(
			"start",
		);
		expect(shadow.querySelector("textarea")).toBeNull();
	});
});

test("a restored file is named and counted under the panel, in the reader's language", async () => {
	setLocale("en");
	await withClipboard({ readText: async () => "" }, async () => {
		const root = mount();
		renderSettingsPage(new InMemoryRepository(), root);
		await settle();
		expect(row(root, "locations").textContent).toContain("0 places");

		await chooseFile(
			root,
			await oneCardBackup(),
			"cc-tracking-2026-09-21.json",
		);

		expect(root.querySelector("cc-restore-sheet")).toBeNull();
		expect(importStatus(root)).toBe(
			"Restored cc-tracking-2026-09-21.json: 1 card, 1 purchase, 0 payments, 0 limit groups, 0 lists.",
		);
		expect(root.querySelector(".import-status")?.getAttribute("role")).toBe(
			"status",
		);
		// The page reads the locations again: the copy brought its records.
		expect(row(root, "locations").textContent).toContain("3 places");

		const english = importStatus(root);
		setLocale("th");
		await settle();
		expect(importStatus(root)).toContain("cc-tracking-2026-09-21.json");
		expect(importStatus(root)).not.toBe(english);
		setLocale("en");
	});
});

test("restoring from the clipboard over data here takes Restore, Paste from clipboard, Merge", async () => {
	setLocale("en");
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated(new InMemoryRepository());
		const root = mount();
		renderSettingsPage(repo, root);
		await settle();

		await clickSheet(root, "paste-clipboard");
		await clickSheet(root, "merge-import");

		expect(root.querySelector("cc-restore-sheet")).toBeNull();
		expect(bannerMessage(root)).toBe("");
		expect(importStatus(root)).toBe(
			"Restored pasted text: 1 card, 1 purchase, 0 payments, 0 limit groups, 0 lists.",
		);
		// Merged: the purchase this browser held and the copy's own both stay.
		expect(await repo.listPurchases("kbank")).toHaveLength(2);
		expect(await repo.listLimitGroups()).toHaveLength(1);
	});
});

const click = (root: HTMLElement, action: string) => {
	if (action === "reset") return row(root, "delete-all").click();
	const button = root.querySelector<HTMLButtonElement>(
		`[data-section="reset"] [data-action="${action}"]`,
	);
	if (!button) throw new Error(`no ${action} button`);
	button.click();
};

const resetText = (root: HTMLElement): string =>
	root
		.querySelector('[data-section="reset"]')
		?.textContent?.replace(/\s+/g, " ") ?? "";

const resetStatus = (root: HTMLElement): string =>
	root.querySelector(".reset-status")?.textContent?.trim() ?? "";

/** A card, its group, two purchases and a setting: something for a reset to count and delete. */
const populated = async <R extends Repository>(repo: R): Promise<R> => {
	await seeded(repo);
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

test("the reset rows: delete old purchases, then delete all data", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();

	expect(
		[...root.querySelectorAll('[data-section="reset"] .set > .set-row')].map(
			(found) => found.getAttribute("data-row"),
		),
	).toEqual(["purge", "delete-all"]);
	expect(row(root, "purge").textContent).toContain("Delete old purchases");
	expect(row(root, "delete-all").textContent).toContain("Delete all data");
});

/** Two cards, a group, three purchases, a payment and a list: each kind counted apart. */
const fullyPopulated = async <R extends Repository>(repo: R): Promise<R> => {
	await populated(repo);
	await repo.saveCard({ ...sampleCard, id: "scb", name: "SCB", last4: "1111" });
	await repo.savePurchase({
		id: "p3",
		cardId: "scb",
		date: "2026-09-07",
		amount: 100,
		note: "",
	});
	await repo.saveCardPayment({
		id: "pay1",
		cardId: "kbank",
		date: "2026-09-20",
		amount: 100,
		status: "paid",
	});
	await repo.savePurchaseList({
		id: "list1",
		date: "2026-09-08",
		status: "draft",
		lines: [],
	});
	return repo;
};

test("asks before resetting, counting each kind of record it would delete", async () => {
	setLocale("en");
	const repo = await fullyPopulated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	expect(
		root.querySelector(
			'[data-section="reset"] [data-action="delete-everything"]',
		),
	).toBeNull();
	click(root, "reset");
	await settle();

	expect(resetText(root)).toContain(
		"This deletes 2 cards, 3 purchases, 1 payment, 1 limit group, 1 list. Language and theme stay. It can't be undone.",
	);
	expect(root.querySelector('[data-row="delete-all"]')).toBeNull();
	expect(await repo.listCards()).toHaveLength(2);
});

test("backing out of a reset deletes nothing", async () => {
	setLocale("en");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "keep-data");
	await settle();

	expect(root.querySelector('[data-row="delete-all"]')).not.toBeNull();
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
	click(root, "delete-everything");
	await settle();

	expect(await repo.listCards()).toEqual([]);
	expect(await repo.listPurchases("kbank")).toEqual([]);
	expect(await repo.listLimitGroups()).toEqual([]);
	expect(await repo.getSettings()).toEqual({ purchaseLocations: ["krabi"] });
	expect(resetStatus(root)).toBe("All data deleted.");
	// The starting places come back, so Home and the Locations page are not empty.
	expect(await repo.listLocations()).toEqual([
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "krabi", name: "Krabi", takesPurchases: true },
		{ id: "phichit", name: "Phichit", takesPurchases: false },
	]);
	expect(root.querySelector('[data-row="delete-all"]')).not.toBeNull();
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
	click(root, "delete-everything");
	await settle();

	expect(await repo.listCards()).toEqual([]);
	expect(localStorage.getItem("cc:lang")).toBe("th");
	expect((await repo.listLocations()).map((record) => record.id)).toEqual([
		"bangkok",
		"krabi",
		"phichit",
	]);
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
	click(root, "delete-everything");
	await settle();

	expect(bannerMessage(root)).toContain("disk is locked");
	expect(resetStatus(root)).toBe("");
	expect(await repo.listCards()).toHaveLength(1);
});

test("the reset question follows a language switch", async () => {
	setLocale("en");
	const repo = await fullyPopulated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	click(root, "reset");
	await settle();
	setLocale("th");
	await settle();

	expect(resetText(root)).not.toContain("This deletes");
	expect(resetText(root)).toContain(
		"จะลบบัตร 2 ใบ, รายการซื้อ 3 รายการ, การชำระ 1 รายการ, กลุ่มวงเงิน 1 กลุ่ม, ใบรายการซื้อ 1 ใบ ภาษาและธีมยังคงเดิม ย้อนกลับไม่ได้",
	);
	expect(
		root.querySelector(
			'[data-section="reset"] [data-action="delete-everything"]',
		),
	).not.toBeNull();
	setLocale("en");
});

const copyLabel = (root: HTMLElement): string =>
	row(root, "copy").querySelector(".set-row__action")?.textContent?.trim() ??
	"";

test("copy to clipboard writes the backup as compact JSON, and says so", async () => {
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

			row(root, "copy").click();
			await settle();

			expect(bannerMessage(root)).toBe("");
			const copied = parseAnyBackup(written);
			expect(copied.cards).toEqual(await repo.listCards());
			expect(copied.purchases).toHaveLength(2);
			// Compact, not pretty-printed: pasted text is carried around, not read.
			expect(written).toBe(JSON.stringify(JSON.parse(written)));
			expect(copyLabel(root)).toBe("Copied");
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

			row(root, "copy").click();
			await settle();

			expect(bannerMessage(root)).toContain("Could not copy the text.");
			expect(copyLabel(root)).toBe("Copy");
		},
	);
});

test("copy to clipboard is not offered where the browser cannot write to it", async () => {
	await withClipboard({}, async () => {
		const root = mount();
		renderSettingsPage(new InMemoryRepository(), root);
		await settle();

		expect(root.querySelector('[data-row="copy"]')).toBeNull();
	});
});

test("the downloaded file is version 3 and carries lists", async () => {
	const repo = await seeded(new InMemoryRepository());
	await repo.saveCard(sampleCard);
	await repo.savePurchaseList({
		id: "l1",
		date: "2026-10-01",
		status: "draft",
		lines: [{ cardId: "kbank", amount: 1_000 }],
	});
	const { text } = await prepareBackupFile(
		repo,
		new Date("2026-09-21T03:00:00Z"),
	);
	const parsed = JSON.parse(text);
	expect(parsed.version).toBe(3);
	expect(parsed.lists).toHaveLength(1);
	expect(parsed.locations.length).toBeGreaterThan(0);
});

test("restoring a version 2 file into an empty browser converts it and counts the lists", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	await chooseFile(
		root,
		JSON.stringify({
			version: 2,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [],
			cards: [sampleCard],
			purchases: [
				{
					id: "p1",
					cardId: "kbank",
					date: "2026-09-05",
					amount: 10_000,
					note: "fuel",
				},
			],
			payments: [
				{
					cardId: "kbank",
					period: "2026-09",
					paidAt: "2026-10-01",
					closeDate: "2026-09-18",
					dueDate: "2026-10-03",
				},
			],
			settings: { purchaseLocations: ["bangkok"] },
		}),
		"old.json",
	);
	await settle();
	expect(bannerMessage(root)).toBe("");
	expect((await repo.listCardPayments("kbank")).length).toBe(1);
	expect(
		(await repo.listLocations())
			.filter((location) => location.takesPurchases)
			.map((location) => location.id),
	).toEqual(["bangkok"]);
	expect(importStatus(root)).toContain("0 lists");
});

test("the Delete old purchases row opens the purge sheet, and closing takes it away", async () => {
	setLocale("en");
	const root = mount();
	renderSettingsPage(new InMemoryRepository(), root);
	await settle();
	expect(root.querySelector("cc-purge-sheet")).toBeNull();
	expect(row(root, "purge").getAttribute("aria-expanded")).toBe("false");

	row(root, "purge").click();
	await settle();
	const sheet = root.querySelector("cc-purge-sheet");
	expect(sheet).not.toBeNull();
	expect(row(root, "purge").getAttribute("aria-expanded")).toBe("true");

	sheet?.shadowRoot
		?.querySelector("cc-modal")
		?.shadowRoot?.querySelector<HTMLElement>('[data-action="close"]')
		?.click();
	await settle();
	expect(root.querySelector("cc-purge-sheet")).toBeNull();
});

test("a purge reports what it deleted in the Reset panel, in the reader's language", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard);
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	row(root, "purge").click();
	await settle();
	const sheet = root.querySelector("cc-purge-sheet");
	if (!sheet) throw new Error("no purge sheet");
	sheet.dispatchEvent(
		new CustomEvent("purged", { detail: { count: 3, age: "1y" } }),
	);
	await settle();
	expect(root.querySelector("cc-purge-sheet")).toBeNull();
	expect(resetStatus(root)).toBe("Deleted 3 purchases older than 1 year.");
	setLocale("th");
	await settle();
	expect(resetStatus(root)).toContain("3");
	expect(resetStatus(root)).not.toContain("Deleted");
});

test("Delete all and the restore sheet use the storage the page is given", async () => {
	setLocale("en");
	const storage = memoryStorage();
	storage.setItem(SEED_KEY, "done");
	const repo = await populated(new InMemoryRepository());
	const root = mount();
	renderSettingsPage(repo, root, storage);
	await settle();

	click(root, "reset");
	await settle();
	click(root, "delete-everything");
	await settle();

	// The marker was cleared and set again in the page's storage, never in the shared one.
	expect(storage.getItem(SEED_KEY)).toBe("done");
	expect(globalThis.localStorage.getItem(SEED_KEY)).toBeNull();
	expect(await repo.listLocations()).toHaveLength(3);

	row(root, "restore").click();
	await settle();
	expect(root.querySelector("cc-restore-sheet")?.storage).toBe(storage);
});
