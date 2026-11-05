import { afterEach, expect, test } from "vitest";
import "#components/cc-restore-sheet";
import type { CcRestoreSheet } from "#components/cc-restore-sheet";
import { defaultLocations } from "#lib/domain/locations";
import { DEFAULT_SETTINGS } from "#lib/domain/settings";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { memoryStorage } from "#lib/storage/contract";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import { SEED_KEY, seedLocations } from "#lib/storage/seed-locations";
import { exportBackupV3, type V3Counts } from "#lib/storage/transfer-v3";

/** Flushes Lit's update chain and the sheet's awaited reads and writes. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => setLocale("en"));

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
};

const seeded = async <R extends Repository>(repo: R): Promise<R> => {
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation(record);
	return repo;
};

/** A browser that already holds a card, two purchases and a limit group. */
const populated = async (): Promise<InMemoryRepository> => {
	const repo = await seeded(new InMemoryRepository());
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 });
	await repo.saveCard({ ...sampleCard, limitGroupId: "pool" });
	for (const id of ["p1", "p2"])
		await repo.savePurchase({
			id,
			cardId: "kbank",
			date: "2026-09-05",
			amount: 100,
			note: "",
		});
	return repo;
};

/** A copy holding one card (SCB) and one purchase. */
const oneCardBackup = async (): Promise<string> => {
	const source = await seeded(new InMemoryRepository());
	await source.saveCard({ ...sampleCard, id: "scb", name: "SCB" });
	await source.savePurchase({
		id: "s1",
		cardId: "scb",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	});
	return JSON.stringify(await exportBackupV3(source, new Date()));
};

/** Swaps in a stub `navigator.clipboard` (or none) for the length of `run`. */
const withClipboard = async (
	clipboard: Partial<Pick<Clipboard, "readText">> | undefined,
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

const mount = async (repo: Repository, storage: Storage = memoryStorage()) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-restore-sheet") as CcRestoreSheet;
	element.repo = repo;
	// A private store, so no marker the sheet writes leaks into another test.
	element.storage = storage;
	const restored: ({ file?: string } & V3Counts)[] = [];
	let closed = 0;
	element.addEventListener("restored", (event) =>
		restored.push((event as CustomEvent<{ file?: string } & V3Counts>).detail),
	);
	element.addEventListener("close", () => {
		closed += 1;
	});
	document.body.append(element);
	await element.updateComplete;
	const root = element.shadowRoot as ShadowRoot;
	return {
		element,
		root,
		restored,
		closed: () => closed,
		action: (name: string) =>
			root.querySelector<HTMLElement>(`[data-action="${name}"]`),
		click: async (name: string) => {
			const button = root.querySelector<HTMLElement>(`[data-action="${name}"]`);
			if (!button) throw new Error(`no ${name} button`);
			button.click();
			await settle();
			await element.updateComplete;
		},
		text: () => root.textContent?.replace(/\s+/g, " ") ?? "",
		step: () => root.querySelector("[data-step]")?.getAttribute("data-step"),
	};
};

const oneCardCounts: V3Counts = {
	cards: 1,
	purchases: 1,
	payments: 0,
	limitGroups: 0,
	lists: 0,
};

test("sits in a sheet headed Restore a copy, opening on the clipboard, a file and paste by hand", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const { root, step, action } = await mount(new InMemoryRepository());
		const modal = root.querySelector("cc-modal");
		expect(modal?.hasAttribute("sheet")).toBe(true);
		expect(modal?.getAttribute("heading")).toBe("Restore a copy");
		expect(step()).toBe("start");
		// The clipboard is the primary choice; the file and paste by hand are quiet.
		expect(action("paste-clipboard")?.hasAttribute("data-variant")).toBe(false);
		expect(action("choose-file")).not.toBeNull();
		expect(action("paste-by-hand")).not.toBeNull();
	});
});

/** A new browser as the app leaves it: the starting places seeded, and nothing else. */
const freshBrowser = async () => {
	const repo = new InMemoryRepository();
	const storage = memoryStorage();
	await seedLocations(repo, storage);
	return { repo, storage };
};

test("paste from clipboard restores into an empty browser in one click", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser();
		const sheet = await mount(repo, storage);
		await sheet.click("paste-clipboard");

		expect((await repo.listCards()).map((card) => card.id)).toEqual(["scb"]);
		expect(sheet.restored).toEqual([oneCardCounts]);
	});
});

test("into a new browser, the copy's renames and ticks replace the seeded starting places", async () => {
	const source = new InMemoryRepository();
	await source.saveLocation({
		id: "krabi",
		name: "Ao Nang",
		takesPurchases: false,
	});
	await source.saveLocation({
		id: "phichit",
		name: "Phichit",
		takesPurchases: true,
	});
	await source.saveCard({ ...sampleCard, location: "krabi" });
	const text = JSON.stringify(await exportBackupV3(source, new Date()));
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser();
		const sheet = await mount(repo, storage);
		await sheet.click("paste-clipboard");

		expect(sheet.step()).not.toBe("question");
		expect(sheet.restored).toHaveLength(1);
		const stored = (await repo.listLocations()).toSorted((a, b) =>
			a.id.localeCompare(b.id),
		);
		// Bangkok was only a seed the copy does without, and no card sits there.
		expect(stored).toEqual([
			{ id: "krabi", name: "Ao Nang", takesPurchases: false },
			{ id: "phichit", name: "Phichit", takesPurchases: true },
		]);
	});
});

test("with no cards but a renamed location here, the sheet asks merge or replace", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser();
		await repo.saveLocation({
			id: "krabi",
			name: "Ao Nang",
			takesPurchases: true,
		});
		const sheet = await mount(repo, storage);
		await sheet.click("paste-clipboard");

		expect(sheet.step()).toBe("question");
		await sheet.click("merge-import");
		// Merge keeps what is here.
		expect(
			(await repo.listLocations()).find((r) => r.id === "krabi")?.name,
		).toBe("Ao Nang");
	});
});

test("with data here, the clipboard asks first, counting here and in the copy", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");

		expect(sheet.step()).toBe("question");
		const rows = [...sheet.root.querySelectorAll(".compare > div")].map(
			(row) => [
				row.querySelector("dt")?.textContent?.trim(),
				row.querySelector("dd")?.textContent?.trim(),
			],
		);
		expect(rows).toEqual([
			["Here", "1 card, 2 purchases, 0 payments, 1 limit group, 0 lists"],
			[
				"In the copy",
				"1 card, 1 purchase, 0 payments, 0 limit groups, 0 lists",
			],
		]);
		expect(sheet.action("merge-import")?.hasAttribute("data-variant")).toBe(
			false,
		);
		expect(sheet.action("replace-import")?.getAttribute("data-variant")).toBe(
			"danger",
		);
		expect(sheet.restored).toEqual([]);
		expect(await repo.listPurchases("scb")).toEqual([]);
	});
});

test("merge keeps what is here and adds the copy", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");
		await sheet.click("merge-import");

		expect((await repo.listCards()).map((card) => card.id).sort()).toEqual([
			"kbank",
			"scb",
		]);
		expect(await repo.listLimitGroups()).toHaveLength(1);
		expect(sheet.restored).toEqual([oneCardCounts]);
	});
});

test("replace leaves only what the copy carries", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");
		await sheet.click("replace-import");

		expect((await repo.listCards()).map((card) => card.id)).toEqual(["scb"]);
		expect(await repo.listLimitGroups()).toEqual([]);
		expect(sheet.restored).toEqual([oneCardCounts]);
		expect(sheet.element.storage.getItem("cc:migration:payments")).toBe("done");
	});
});

test("cancel on the question writes nothing and closes the sheet", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");
		await sheet.click("cancel");

		expect(sheet.closed()).toBe(1);
		expect(sheet.restored).toEqual([]);
		expect(await repo.listPurchases("scb")).toEqual([]);
	});
});

test("a clipboard the browser will not read falls back to the text area with a hint", async () => {
	setLocale("en");
	await withClipboard(
		{ readText: () => Promise.reject(new Error("denied")) },
		async () => {
			const sheet = await mount(new InMemoryRepository());
			await sheet.click("paste-clipboard");

			expect(sheet.step()).toBe("paste");
			expect(sheet.root.querySelector("textarea")).not.toBeNull();
			expect(sheet.root.querySelector(".hint")?.textContent).toContain(
				"clipboard",
			);
			expect(sheet.restored).toEqual([]);
		},
	);
});

test("without a readable clipboard it opens on the text area, offering no clipboard button", async () => {
	await withClipboard(undefined, async () => {
		const repo = new InMemoryRepository();
		const sheet = await mount(repo);

		expect(sheet.step()).toBe("paste");
		expect(sheet.action("paste-clipboard")).toBeNull();

		const area = sheet.root.querySelector("textarea") as HTMLTextAreaElement;
		area.value = await oneCardBackup();
		area.dispatchEvent(new Event("input"));
		await sheet.click("import-text");

		expect(sheet.restored).toEqual([oneCardCounts]);
	});
});

test("paste by hand shows the text area, and text that is not a copy shows why and writes nothing", async () => {
	setLocale("en");
	await withClipboard({ readText: async () => "" }, async () => {
		const repo = await populated();
		const sheet = await mount(repo);
		await sheet.click("paste-by-hand");
		expect(sheet.step()).toBe("paste");

		const area = sheet.root.querySelector("textarea") as HTMLTextAreaElement;
		area.value = "{ not json";
		area.dispatchEvent(new Event("input"));
		await sheet.click("import-text");

		expect(sheet.step()).toBe("paste");
		expect(sheet.root.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not restore that copy.",
		);
		expect(
			(sheet.root.querySelector("textarea") as HTMLTextAreaElement).value,
		).toBe("{ not json");
		expect(sheet.restored).toEqual([]);
		expect(await repo.listPurchases("kbank")).toHaveLength(2);
	});
});

test("a clipboard holding something else shows why and stays on the start", async () => {
	setLocale("en");
	await withClipboard({ readText: async () => "hello" }, async () => {
		const repo = new InMemoryRepository();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");

		expect(sheet.step()).toBe("start");
		expect(sheet.root.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not restore that copy.",
		);
		expect(await repo.listCards()).toEqual([]);
	});
});

test("choosing a file restores it at once and names it", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await mount(new InMemoryRepository());
		const input = sheet.action("choose-file") as HTMLInputElement;
		input.files = [
			new File([text], "cc-tracking-2026-09-21.json", {
				type: "application/json",
			}),
		] as unknown as FileList;
		input.dispatchEvent(new Event("change"));
		await settle();
		await settle();

		expect(sheet.restored).toEqual([
			{ file: "cc-tracking-2026-09-21.json", ...oneCardCounts },
		]);
	});
});

test("a file with data here asks about the file by name", async () => {
	setLocale("en");
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await mount(await populated());
		const input = sheet.action("choose-file") as HTMLInputElement;
		input.files = [
			new File([text], "b.json", { type: "application/json" }),
		] as unknown as FileList;
		input.dispatchEvent(new Event("change"));
		await settle();
		await settle();
		await sheet.element.updateComplete;

		expect(sheet.step()).toBe("question");
		expect(sheet.text()).toContain("Restore b.json?");
	});
});

test("a language switch on the question keeps the question", async () => {
	setLocale("en");
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const sheet = await mount(await populated());
		await sheet.click("paste-clipboard");
		expect(sheet.text()).toContain("In the copy");

		setLocale("th");
		await sheet.element.updateComplete;
		expect(sheet.step()).toBe("question");
		expect(sheet.text()).not.toContain("In the copy");
		expect(sheet.action("merge-import")).not.toBeNull();
	});
});

test("after a restore, a card on a missing location gets its place back", async () => {
	// The starting places were seeded once and since deleted, and an old copy brings a card
	// at Krabi with no location records of its own.
	const storage = memoryStorage();
	storage.setItem(SEED_KEY, "done");
	const old = JSON.stringify({
		version: 2,
		exportedAt: "2026-09-21T00:00:00.000Z",
		limitGroups: [],
		cards: [sampleCard],
		purchases: [],
		payments: [],
	});
	await withClipboard({ readText: async () => old }, async () => {
		const repo = new InMemoryRepository();
		const sheet = await mount(repo, storage);
		await sheet.click("paste-clipboard");

		expect(sheet.restored).toHaveLength(1);
		const ids = (await repo.listLocations()).map((location) => location.id);
		expect(ids).toContain("krabi");
	});
});

test("after a restore into a browser never seeded, the starting places are stored", async () => {
	const old = JSON.stringify({
		version: 2,
		exportedAt: "2026-09-21T00:00:00.000Z",
		limitGroups: [],
		cards: [],
		purchases: [],
		payments: [],
	});
	await withClipboard({ readText: async () => old }, async () => {
		const repo = new InMemoryRepository();
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");

		expect(sheet.restored).toHaveLength(1);
		expect(await repo.listLocations()).toHaveLength(3);
	});
});

test("Close re-emits close", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await mount(new InMemoryRepository());
		const modal = sheet.root.querySelector("cc-modal");
		modal?.shadowRoot
			?.querySelector<HTMLElement>('[data-action="close"]')
			?.click();
		await settle();
		expect(sheet.closed()).toBe(1);
	});
});

test("after a restore, the sheet stays busy while it slides away, so nothing writes twice", async () => {
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser();
		let writes = 0;
		const saveCard = repo.saveCard.bind(repo);
		repo.saveCard = async (card: Card) => {
			writes += 1;
			await saveCard(card);
		};
		const sheet = await mount(repo, storage);
		// Hold the exit animation open: the sheet is leaving but not yet gone.
		const modal = sheet.root.querySelector("cc-modal");
		if (!modal) throw new Error("no modal");
		modal.leave = () => {};
		await sheet.click("paste-clipboard");

		expect(writes).toBe(1);
		expect(sheet.action("paste-clipboard")?.hasAttribute("disabled")).toBe(
			true,
		);
		expect(sheet.action("paste-by-hand")?.hasAttribute("disabled")).toBe(true);
		await sheet.click("paste-clipboard");
		expect(writes).toBe(1);
	});
});

test("a failure with no message of its own says so once, not twice", async () => {
	setLocale("en");
	const text = await oneCardBackup();
	await withClipboard({ readText: async () => text }, async () => {
		const repo = new InMemoryRepository();
		repo.listLimitGroups = () => Promise.reject("not an error");
		const sheet = await mount(repo);
		await sheet.click("paste-clipboard");

		const alert = sheet.root.querySelector('[role="alert"]')?.textContent ?? "";
		expect(alert.split("Could not restore that copy.").length - 1).toBe(1);
	});
});
