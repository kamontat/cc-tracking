import type { Card } from "#lib/domain/types"
import type { RestoredDetail } from "#lib/ui/restore"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test, vi } from "vitest"

import RestoreSheet from "#components/organisms/RestoreSheet.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { seedOwners } from "#lib/storage/seed-owners"
import { exportBackupV4, type V4Counts } from "#lib/storage/transfer-v4"

/**
 * *Restore a copy*, clipboard first, in a sheet: an empty browser takes the copy at once, one
 * with records asks Merge or Replace with both counts. Ported from the legacy
 * `cc-restore-sheet` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes the sheet's awaited reads and writes and Svelte's updates. */
const settle = async () => {
	for (let i = 0; i < 20; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const sampleCard: Card = {
	id: "k1",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
	limitGroupId: "pool",
}

const seeded = async <R extends Repository>(repo: R): Promise<R> => {
	for (const record of defaultLocations(DEFAULT_SETTINGS)) await repo.saveLocation(record)
	return repo
}

/** A browser that already holds a card, two purchases and a limit group. */
const populated = async (): Promise<InMemoryRepository> => {
	const repo = await seeded(new InMemoryRepository())
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 })
	await repo.saveCard({ ...sampleCard, limitGroupId: "pool" })
	for (const id of ["p1", "p2"])
		await repo.savePurchase({ id, cardId: "k1", date: "2026-09-05", amount: 100, note: "" })
	return repo
}

/** A copy holding one card (SCB) and one purchase. */
const oneCardBackup = async (): Promise<string> => {
	const source = await seeded(new InMemoryRepository())
	await source.saveLimitGroup({ id: "scb", name: "SCB account", limit: 1 })
	await source.saveCard({ ...sampleCard, id: "s1", name: "SCB", limitGroupId: "scb" })
	await source.savePurchase({ id: "s1", cardId: "s1", date: "2026-09-05", amount: 10_000, note: "fuel" })
	return JSON.stringify(await exportBackupV4(source, new Date()))
}

/** Swaps in a stub `navigator.clipboard` (or none) for the length of `run`. */
const withClipboard = async (clipboard: Partial<Pick<Clipboard, "readText">> | undefined, run: () => Promise<void>) => {
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard")
	Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
	try {
		await run()
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original)
		else delete (navigator as { clipboard?: unknown }).clipboard
	}
}

const show = async (repo: Repository, storage: Storage = memoryStorage()) => {
	document.body.innerHTML = ""
	const restored: RestoredDetail[] = []
	let closed = 0
	mounted = mount(RestoreSheet, {
		target: document.body,
		props: {
			repo,
			// A private store, so no marker the sheet writes leaks into another test.
			storage,
			onrestored: (detail: RestoredDetail) => restored.push(detail),
			onclose: () => {
				closed += 1
			},
		},
	})
	await settle()
	const root = document.body
	return {
		root,
		storage,
		restored,
		closed: () => closed,
		action: (name: string) => root.querySelector<HTMLElement>(`[data-action="${name}"]`),
		click: async (name: string) => {
			const button = root.querySelector<HTMLElement>(`[data-action="${name}"]`)
			if (!button) throw new Error(`no ${name} button`)
			button.click()
			await settle()
		},
		text: () => root.textContent?.replace(/\s+/g, " ") ?? "",
		step: () => root.querySelector("[data-step]")?.getAttribute("data-step"),
	}
}

const typeText = (root: HTMLElement, value: string) => {
	const area = root.querySelector("textarea") as HTMLTextAreaElement
	area.value = value
	area.dispatchEvent(new Event("input", { bubbles: true }))
	// Restore follows what was typed, as it would before anyone could click it.
	flushSync()
}

const chooseFile = async (root: HTMLElement, file: File) => {
	const input = root.querySelector('[data-action="choose-file"]') as HTMLInputElement
	input.files = [file] as unknown as FileList
	input.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
}

const oneCardCounts: V4Counts = { cards: 1, purchases: 1, payments: 0, limitGroups: 1, lists: 0 }

test("sits in a sheet headed Restore a copy, opening on the clipboard, a file and paste by hand", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const { root, step, action } = await show(new InMemoryRepository())
		expect(root.querySelector("dialog")?.open).toBe(true)
		expect(root.querySelector("dialog h2")?.textContent?.trim()).toBe("Restore a copy")
		expect(step()).toBe("start")
		expect(action("paste-clipboard")).not.toBeNull()
		expect(action("choose-file")).not.toBeNull()
		expect(action("from-link")).not.toBeNull()
		expect(action("paste-by-hand")).not.toBeNull()
	})
})

/** The sheet's buttons outside the question: what the reader picks and confirms the copy with. */
const wayIn = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLElement>("[data-step] button, [data-step] label.file"),
]

/** Every icon in `root`'s ways in, by the action of the button it leads. */
const leadingIcons = (root: HTMLElement) =>
	wayIn(root).map((el) => [
		el.getAttribute("data-action") ?? el.querySelector("input")?.getAttribute("data-action"),
		el.firstElementChild?.matches("svg.icon") ?? false,
	])

test("every way in, Back and Restore are quiet and led by an icon, Paste by hand as text", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		const quiet = () =>
			wayIn(sheet.root).map((el) => el.matches('[data-variant="quiet"]') || el.classList.contains("file"))
		expect(leadingIcons(sheet.root)).toEqual([
			["paste-clipboard", true],
			["choose-file", true],
			["from-link", true],
			["paste-by-hand", true],
		])
		expect(quiet()).toEqual([true, true, true, true])
		// Paste by hand stays text, the least of the ways in: drawn as a link, not a button.
		expect(sheet.action("paste-by-hand")?.classList.contains("by-hand")).toBe(true)
		expect(sheet.root.querySelectorAll(".by-hand")).toHaveLength(1)

		await sheet.click("from-link")
		expect(leadingIcons(sheet.root)).toEqual([
			["back", true],
			["import-link", true],
		])
		expect(quiet()).toEqual([true, true])

		await sheet.click("back")
		await sheet.click("paste-by-hand")
		expect(leadingIcons(sheet.root)).toEqual([
			["back", true],
			["import-text", true],
		])
		expect(quiet()).toEqual([true, true])
	})
})

test("without a readable clipboard, From a link under the text area is a quiet button with its icon", async () => {
	await withClipboard(undefined, async () => {
		const sheet = await show(new InMemoryRepository())
		expect(leadingIcons(sheet.root)).toEqual([
			["import-text", true],
			["from-link", true],
		])
	})
})

test("on the question Merge stays primary, with no icons", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const sheet = await show(await populated())
		await sheet.click("paste-clipboard")
		expect(sheet.step()).toBe("question")
		expect(sheet.action("merge-import")?.hasAttribute("data-variant")).toBe(false)
		expect(sheet.root.querySelector('[data-step="question"] svg.icon')).toBeNull()
	})
})

/** A new browser as the app leaves it: the starting places seeded, and nothing else. */
const freshBrowser = async () => {
	const repo = new InMemoryRepository()
	const storage = memoryStorage()
	await seedLocations(repo, storage)
	return { repo, storage }
}

test("paste from clipboard restores into an empty browser in one click", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		const sheet = await show(repo, storage)
		await sheet.click("paste-clipboard")

		expect((await repo.listCards()).map((card) => card.id)).toEqual(["s1"])
		expect(sheet.restored).toEqual([oneCardCounts])
	})
})

test("into a new browser, the copy's renames and ticks replace the seeded starting places", async () => {
	const source = new InMemoryRepository()
	await source.saveLocation({ id: "krabi", name: "Ao Nang", takesPurchases: false })
	await source.saveLocation({ id: "phichit", name: "Phichit", takesPurchases: true })
	await source.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1 })
	await source.saveCard({ ...sampleCard, location: "krabi" })
	const text = JSON.stringify(await exportBackupV4(source, new Date()))
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		const sheet = await show(repo, storage)
		await sheet.click("paste-clipboard")

		expect(sheet.step()).not.toBe("question")
		expect(sheet.restored).toHaveLength(1)
		const stored = (await repo.listLocations()).toSorted((a, b) => a.id.localeCompare(b.id))
		// Bangkok was only a seed the copy does without, and no card sits there.
		expect(stored).toEqual([
			{ id: "krabi", name: "Ao Nang", takesPurchases: false },
			{ id: "phichit", name: "Phichit", takesPurchases: true },
		])
	})
})

test("with no cards but a renamed location here, the sheet asks merge or replace", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		await repo.saveLocation({ id: "krabi", name: "Ao Nang", takesPurchases: true })
		const sheet = await show(repo, storage)
		await sheet.click("paste-clipboard")

		expect(sheet.step()).toBe("question")
		await sheet.click("merge-import")
		// Merge keeps what is here.
		expect((await repo.listLocations()).find((r) => r.id === "krabi")?.name).toBe("Ao Nang")
	})
})

test("with data here, the clipboard asks first, counting here and in the copy", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")

		expect(sheet.step()).toBe("question")
		const rows = [...sheet.root.querySelectorAll(".compare > div")].map((row) => [
			row.querySelector("dt")?.textContent?.trim(),
			row.querySelector("dd")?.textContent?.trim(),
		])
		expect(rows).toEqual([
			["Here", "1 card, 2 purchases, 0 payments, 1 limit group, 0 lists"],
			["In the copy", "1 card, 1 purchase, 0 payments, 1 limit group, 0 lists"],
		])
		expect(sheet.action("merge-import")?.hasAttribute("data-variant")).toBe(false)
		expect(sheet.action("replace-import")?.getAttribute("data-variant")).toBe("danger")
		expect(sheet.restored).toEqual([])
		expect(await repo.listPurchases("s1")).toEqual([])
	})
})

test("merge keeps what is here and adds the copy", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")
		await sheet.click("merge-import")

		expect((await repo.listCards()).map((card) => card.id).sort()).toEqual(["k1", "s1"])
		expect(await repo.listLimitGroups()).toHaveLength(2)
		expect(sheet.restored).toEqual([oneCardCounts])
	})
})

test("replace leaves only what the copy carries", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")
		await sheet.click("replace-import")

		expect((await repo.listCards()).map((card) => card.id)).toEqual(["s1"])
		expect((await repo.listLimitGroups()).map((group) => group.id)).toEqual(["scb"])
		expect(sheet.restored).toEqual([oneCardCounts])
	})
})

test("cancel on the question writes nothing and closes the sheet", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = await populated()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")
		await sheet.click("cancel")

		expect(sheet.closed()).toBe(1)
		expect(sheet.restored).toEqual([])
		expect(await repo.listPurchases("s1")).toEqual([])
	})
})

test("a clipboard the browser will not read falls back to the text area with a hint", async () => {
	await withClipboard({ readText: () => Promise.reject(new Error("denied")) }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("paste-clipboard")

		expect(sheet.step()).toBe("paste")
		expect(sheet.root.querySelector("textarea")).not.toBeNull()
		expect(sheet.root.querySelector(".hint")?.textContent).toContain("clipboard")
		expect(sheet.restored).toEqual([])
	})
})

test("without a readable clipboard it opens on the text area, offering no clipboard button", async () => {
	await withClipboard(undefined, async () => {
		const sheet = await show(new InMemoryRepository())

		expect(sheet.step()).toBe("paste")
		expect(sheet.action("paste-clipboard")).toBeNull()

		typeText(sheet.root, await oneCardBackup())
		await sheet.click("import-text")

		expect(sheet.restored).toEqual([oneCardCounts])
	})
})

test("paste by hand shows the text area, and text that is not a copy shows why and writes nothing", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const repo = await populated()
		const sheet = await show(repo)
		await sheet.click("paste-by-hand")
		expect(sheet.step()).toBe("paste")

		typeText(sheet.root, "{ not json")
		await sheet.click("import-text")

		expect(sheet.step()).toBe("paste")
		expect(sheet.root.querySelector('[role="alert"]')?.textContent).toContain("Could not restore that copy.")
		expect((sheet.root.querySelector("textarea") as HTMLTextAreaElement).value).toBe("{ not json")
		expect(sheet.restored).toEqual([])
		expect(await repo.listPurchases("k1")).toHaveLength(2)
	})
})

test("a clipboard holding something else shows why and stays on the start", async () => {
	await withClipboard({ readText: async () => "hello" }, async () => {
		const repo = new InMemoryRepository()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")

		expect(sheet.step()).toBe("start")
		expect(sheet.root.querySelector('[role="alert"]')?.textContent).toContain("Could not restore that copy.")
		expect(await repo.listCards()).toEqual([])
	})
})

test("choosing a file restores it at once and names it", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await chooseFile(sheet.root, new File([text], "cc-tracking-2026-09-21.json", { type: "application/json" }))

		expect(sheet.restored).toEqual([{ file: "cc-tracking-2026-09-21.json", ...oneCardCounts }])
	})
})

test("a file with data here asks about the file by name", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(await populated())
		await chooseFile(sheet.root, new File([text], "b.json", { type: "application/json" }))

		expect(sheet.step()).toBe("question")
		expect(sheet.text()).toContain("Restore b.json?")
	})
})

test("a language switch on the question keeps the question", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const sheet = await show(await populated())
		await sheet.click("paste-clipboard")
		expect(sheet.text()).toContain("In the copy")

		setLocale("th")
		await settle()
		expect(sheet.step()).toBe("question")
		expect(sheet.text()).not.toContain("In the copy")
		expect(sheet.action("merge-import")).not.toBeNull()
	})
})

test("after a restore into a browser never seeded, the starting places are stored", async () => {
	const old = JSON.stringify({
		version: 3,
		exportedAt: "2026-09-21T00:00:00.000Z",
		limitGroups: [],
		cards: [],
		purchases: [],
		payments: [],
		statementDates: [],
		lists: [],
		locations: [],
	})
	await withClipboard({ readText: async () => old }, async () => {
		const repo = new InMemoryRepository()
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")

		expect(sheet.restored).toHaveLength(1)
		expect(await repo.listLocations()).toHaveLength(3)
	})
})

test("into a new browser, the copy's owners replace the seeded ones, and its groups keep theirs", async () => {
	const source = new InMemoryRepository()
	await source.saveOwner({ id: "KC", name: "Kamontat" })
	await source.saveOwner({ id: "pim", name: "Pim" })
	await source.saveLimitGroup({ id: "pool", name: "KBank account", limit: 1, owner: "pim" })
	await source.saveCard(sampleCard)
	const text = JSON.stringify(await exportBackupV4(source, new Date()))
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		await seedOwners(repo, storage)
		const sheet = await show(repo, storage)
		await sheet.click("paste-clipboard")

		expect(sheet.step()).not.toBe("question")
		expect(await repo.listOwners()).toEqual([
			{ id: "KC", name: "Kamontat" },
			{ id: "pim", name: "Pim" },
		])
		expect((await repo.listLimitGroups())[0]?.owner).toBe("pim")
	})
})

test("with no cards but a renamed owner here, the sheet asks merge or replace", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		await repo.saveOwner({ id: "KC", name: "Kamontat" })
		const sheet = await show(repo, storage)
		await sheet.click("paste-clipboard")
		expect(sheet.step()).toBe("question")
	})
})

test("after a restore, the starting owners are stored and every group names one", async () => {
	const old = JSON.stringify({
		version: 3,
		exportedAt: "2026-09-21T00:00:00.000Z",
		limitGroups: [{ id: "pool", name: "KBank account", limit: 1 }],
		cards: [sampleCard],
		purchases: [],
		payments: [],
		statementDates: [],
		lists: [],
		locations: [{ id: "krabi", name: "Krabi", takesPurchases: true }],
	})
	await withClipboard({ readText: async () => old }, async () => {
		const repo = new InMemoryRepository()
		const sheet = await show(repo, memoryStorage())
		await sheet.click("paste-clipboard")

		expect(sheet.restored).toHaveLength(1)
		expect((await repo.listOwners()).map((owner) => owner.id)).toEqual(["KC", "NT", "RI"])
		expect((await repo.listLimitGroups())[0]?.owner).toBe("KC")
	})
})

test("Close asks the page to close it", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("close")
		expect(sheet.closed()).toBe(1)
	})
})

test("after a restore, the sheet stays busy while it slides away, so nothing writes twice", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const { repo, storage } = await freshBrowser()
		let writes = 0
		const saveCard = repo.saveCard.bind(repo)
		repo.saveCard = async (card: Card) => {
			writes += 1
			await saveCard(card)
		}
		const sheet = await show(repo, storage)
		// Hold the exit animation open: the sheet is leaving but not yet gone.
		const dialog = sheet.root.querySelector("dialog")
		if (!dialog) throw new Error("no dialog")
		dialog.getAnimations = () => [{ finished: new Promise<void>(() => {}) } as unknown as Animation]
		await sheet.click("paste-clipboard")

		expect(writes).toBe(1)
		expect(sheet.restored).toEqual([])
		expect(sheet.action("paste-clipboard")?.hasAttribute("disabled")).toBe(true)
		expect(sheet.action("paste-by-hand")?.hasAttribute("disabled")).toBe(true)
		await sheet.click("paste-clipboard")
		expect(writes).toBe(1)
		// The held sheet ignores Close while it leaves.
		await sheet.click("close")
		expect(sheet.closed()).toBe(0)
	})
})

/** Swaps in a stub `fetch` for the length of `run`, recording each address asked for. */
const withFetch = async (answer: (url: string) => Promise<Response>, run: (asked: string[]) => Promise<void>) => {
	const asked: string[] = []
	vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
		asked.push(String(input))
		return answer(String(input))
	})
	try {
		await run(asked)
	} finally {
		vi.unstubAllGlobals()
	}
}

const typeLink = (root: HTMLElement, value: string) => {
	const input = root.querySelector('input[type="url"]') as HTMLInputElement
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	flushSync()
}

test("from a link opens a step with the address field and Restore, quiet beside the clipboard", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		expect(sheet.action("from-link")?.getAttribute("data-variant")).toBe("quiet")
		await sheet.click("from-link")

		expect(sheet.step()).toBe("link")
		expect(sheet.root.querySelector('input[type="url"]')).not.toBeNull()
		expect(sheet.action("import-link")?.textContent?.trim()).toBe("Restore")
	})
})

test("the link step's hint links to GitHub Gist and PasteFox, each in a new tab", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("from-link")
		const links = [...sheet.root.querySelectorAll<HTMLAnchorElement>(".hint a")]
		expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.target, link.rel])).toEqual([
			["GitHub Gist", "https://gist.github.com/", "_blank", "noopener noreferrer"],
			["PasteFox", "https://pastefox.com/create", "_blank", "noopener noreferrer"],
		])
		expect(sheet.root.querySelector(".hint")?.textContent).toContain("then paste its link.")
	})
})

test("a link restores into an empty browser at once, named by its file", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => "" }, async () => {
		await withFetch(
			async () => new Response(text),
			async (asked) => {
				const { repo, storage } = await freshBrowser()
				const sheet = await show(repo, storage)
				await sheet.click("from-link")
				typeLink(sheet.root, "https://example.com/backups/cc-tracking-2026-11-14.json")
				await sheet.click("import-link")

				expect(asked).toEqual(["https://example.com/backups/cc-tracking-2026-11-14.json"])
				expect((await repo.listCards()).map((card) => card.id)).toEqual(["s1"])
				expect(sheet.restored).toEqual([{ file: "cc-tracking-2026-11-14.json", ...oneCardCounts }])
			},
		)
	})
})

test("a PasteFox page restores from its raw address, named by its code", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => "" }, async () => {
		await withFetch(
			async () => new Response(text),
			async (asked) => {
				const { repo, storage } = await freshBrowser()
				const sheet = await show(repo, storage)
				await sheet.click("from-link")
				typeLink(sheet.root, "pastefox.com/206br1")
				await sheet.click("import-link")

				expect(asked).toEqual(["https://pastefox.com/api/pastes/206br1/raw"])
				expect(sheet.restored).toEqual([{ file: "206br1", ...oneCardCounts }])
			},
		)
	})
})

test("a PasteFox page that holds no backup says so, naming PasteFox, and writes nothing", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		await withFetch(
			async () => new Response("<!doctype html><p>hello</p>"),
			async () => {
				const repo = await populated()
				const sheet = await show(repo)
				await sheet.click("from-link")
				typeLink(sheet.root, "https://pastefox.com/206br1")
				await sheet.click("import-link")

				expect(sheet.step()).toBe("link")
				expect(sheet.root.querySelector('[role="alert"]')?.textContent).toBe(
					"Could not restore that copy. That PasteFox link does not hold a backup. Save the text from Copy as text there, then paste its link.",
				)
				expect(await repo.listPurchases("k1")).toHaveLength(2)
			},
		)
	})
})

test("a link with data here asks merge or replace about the link's file", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => "" }, async () => {
		await withFetch(
			async () => new Response(text),
			async () => {
				const repo = await populated()
				const sheet = await show(repo)
				await sheet.click("from-link")
				typeLink(sheet.root, "https://example.com/b.json")
				await sheet.click("import-link")

				expect(sheet.step()).toBe("question")
				expect(sheet.text()).toContain("Restore b.json?")
				await sheet.click("merge-import")
				expect((await repo.listCards()).map((card) => card.id).sort()).toEqual(["k1", "s1"])
			},
		)
	})
})

test("a link that fails shows why, keeps the address and writes nothing", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		await withFetch(
			async () => new Response("gone", { status: 404 }),
			async () => {
				const repo = await populated()
				const sheet = await show(repo)
				await sheet.click("from-link")
				typeLink(sheet.root, "https://example.com/b.json")
				await sheet.click("import-link")

				expect(sheet.step()).toBe("link")
				expect(sheet.root.querySelector('[role="alert"]')?.textContent).toBe(
					"Could not restore that copy. That link answered with error 404.",
				)
				expect((sheet.root.querySelector('input[type="url"]') as HTMLInputElement).value).toBe(
					"https://example.com/b.json",
				)
				expect(sheet.restored).toEqual([])
				expect(await repo.listPurchases("k1")).toHaveLength(2)
			},
		)
	})
})

test("a link is offered without a readable clipboard too", async () => {
	await withClipboard(undefined, async () => {
		const sheet = await show(new InMemoryRepository())
		expect(sheet.step()).toBe("paste")
		await sheet.click("from-link")
		expect(sheet.step()).toBe("link")
	})
})

test("Back from the link and paste steps returns to the start, leaving the last failure behind", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("from-link")
		expect(sheet.action("back")?.getAttribute("data-variant")).toBe("quiet")
		await sheet.click("back")
		expect(sheet.step()).toBe("start")

		await sheet.click("paste-by-hand")
		typeText(sheet.root, "{ not json")
		await sheet.click("import-text")
		expect(sheet.root.querySelector('[role="alert"]')).not.toBeNull()
		await sheet.click("back")
		expect(sheet.step()).toBe("start")
		expect(sheet.root.querySelector('[role="alert"]')).toBeNull()
	})
})

test("without a readable clipboard the text area has no Back, and Back from a link returns to it", async () => {
	await withClipboard(undefined, async () => {
		const sheet = await show(new InMemoryRepository())
		expect(sheet.action("back")).toBeNull()
		await sheet.click("from-link")
		await sheet.click("back")
		expect(sheet.step()).toBe("paste")
	})
})

test("Restore waits for a web address on the link step", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("from-link")
		const restore = () => sheet.action("import-link") as HTMLButtonElement
		expect(restore().disabled).toBe(true)
		for (const link of ["copy", "ftp://example.com/b.json", "   "]) {
			typeLink(sheet.root, link)
			await settle()
			expect(restore().disabled).toBe(true)
		}
		typeLink(sheet.root, "https://example.com/b.json")
		await settle()
		expect(restore().disabled).toBe(false)
	})
})

test("Restore waits for text on the paste step", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		await sheet.click("paste-by-hand")
		const restore = () => sheet.action("import-text") as HTMLButtonElement
		expect(restore().disabled).toBe(true)
		typeText(sheet.root, "  \n ")
		await settle()
		expect(restore().disabled).toBe(true)
		typeText(sheet.root, "{}")
		await settle()
		expect(restore().disabled).toBe(false)
	})
})

test("the link and text steps slide in, and Back slides the step before in from the other side", async () => {
	await withClipboard({ readText: async () => "" }, async () => {
		const sheet = await show(new InMemoryRepository())
		const slide = () => sheet.root.querySelector("[data-step]")?.getAttribute("data-slide")
		// The sheet opening rises on its own; its first step does not slide as well.
		expect(slide()).toBeNull()

		await sheet.click("from-link")
		expect(slide()).toBe("in")
		await sheet.click("back")
		expect(sheet.step()).toBe("start")
		expect(slide()).toBe("out")

		await sheet.click("paste-by-hand")
		expect(slide()).toBe("in")
		await sheet.click("back")
		expect(slide()).toBe("out")
	})
})

test("without a readable clipboard, the link step slides in over the text and Back slides the text in again", async () => {
	await withClipboard(undefined, async () => {
		const sheet = await show(new InMemoryRepository())
		const slide = () => sheet.root.querySelector("[data-step]")?.getAttribute("data-slide")
		expect(slide()).toBeNull()
		await sheet.click("from-link")
		expect(slide()).toBe("in")
		await sheet.click("back")
		expect(slide()).toBe("out")
	})
})

test("a failure with no message of its own says so once, not twice", async () => {
	const text = await oneCardBackup()
	await withClipboard({ readText: async () => text }, async () => {
		const repo = new InMemoryRepository()
		repo.listLimitGroups = () => Promise.reject("not an error")
		const sheet = await show(repo)
		await sheet.click("paste-clipboard")

		const alert = sheet.root.querySelector('[role="alert"]')?.textContent ?? ""
		expect(alert.split("Could not restore that copy.").length - 1).toBe(1)
	})
})
