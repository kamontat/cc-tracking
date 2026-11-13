import { afterEach, expect, test } from "vitest"

import { messageOf } from "#lib/i18n/error"
import { setLocale } from "#lib/i18n/index"
import { fetchBackupText, isWebAddress, linkHintParts, linkName } from "#lib/ui/restore"

afterEach(() => setLocale("en"))

/** A stand-in for `fetch` answering every request with `body` and `status`. */
const answering =
	(body: string, status = 200) =>
	async (_input: RequestInfo | URL) =>
		new Response(body, { status })

/** The sentence a failed fetch shows. */
const failureOf = async (work: Promise<unknown>): Promise<string> => {
	try {
		await work
	} catch (caught) {
		return messageOf(caught, "backup.error.import")
	}
	throw new Error("expected a failure")
}

test("reads the text the link answers with", async () => {
	expect(await fetchBackupText("https://example.com/copy.json", answering('{"version":4}'))).toBe('{"version":4}')
})

test("trims the link before fetching it", async () => {
	const asked: string[] = []
	await fetchBackupText("  https://example.com/copy.json \n", async (input) => {
		asked.push(String(input))
		return new Response("{}")
	})
	expect(asked).toEqual(["https://example.com/copy.json"])
})

test("refuses what is not an http or https address, without fetching", async () => {
	let fetched = 0
	const counting = async () => {
		fetched += 1
		return new Response("{}")
	}
	for (const link of ["", "copy.json", "ftp://example.com/copy.json", "javascript:alert(1)"]) {
		expect(await failureOf(fetchBackupText(link, counting))).toBe("That is not a web address (https://…).")
	}
	expect(fetched).toBe(0)
})

test("a link that cannot be reached says the site may not let the app read it", async () => {
	const failing = () => Promise.reject(new TypeError("Failed to fetch"))
	expect(await failureOf(fetchBackupText("https://example.com/copy.json", failing))).toBe(
		"Could not reach that link. The site may not let other sites read it; download the file and choose it instead.",
	)
})

test("a link that answers with an error names the status", async () => {
	expect(await failureOf(fetchBackupText("https://example.com/copy.json", answering("nope", 404)))).toBe(
		"That link answered with error 404.",
	)
})

test("the failures read in Thai too", async () => {
	setLocale("th")
	expect(await failureOf(fetchBackupText("copy.json", answering("{}")))).not.toContain("web address")
})

test("only an http or https address counts as a web address", () => {
	expect(isWebAddress(" https://example.com/b.json ")).toBe(true)
	expect(isWebAddress("http://example.com")).toBe(true)
	for (const link of ["", "   ", "b.json", "example.com/b.json", "ftp://example.com/b.json", "javascript:alert(1)"])
		expect(isWebAddress(link)).toBe(false)
})

test("a link is named by its file, else its host", () => {
	expect(linkName("https://example.com/backups/cc-tracking-2026-11-14.json")).toBe("cc-tracking-2026-11-14.json")
	expect(linkName("https://example.com/a%20copy.json?dl=1")).toBe("a copy.json")
	expect(linkName("https://example.com/")).toBe("example.com")
	expect(linkName(" https://example.com/backups/ ")).toBe("backups")
})

test("the link hint names gist and PasteFox as links, in the reader's language", () => {
	const links = (parts: ReturnType<typeof linkHintParts>) => parts.filter((part) => part.href !== undefined)
	const en = linkHintParts()
	expect(en.map((part) => part.text).join("")).toBe(
		"The site must let other sites read the file. Save the copy on GitHub Gist or PasteFox, then paste its raw link.",
	)
	expect(links(en)).toEqual([
		{ text: "GitHub Gist", href: "https://gist.github.com/" },
		{ text: "PasteFox", href: "https://pastefox.com/create" },
	])

	setLocale("th")
	const th = linkHintParts()
	expect(th.map((part) => part.text).join("")).not.toContain("{")
	expect(links(th).map((part) => part.href)).toEqual(["https://gist.github.com/", "https://pastefox.com/create"])
})
