import { afterEach, expect, test } from "vitest"

import { MessageError, messageOf } from "#lib/i18n/error"
import { setLocale } from "#lib/i18n/index"
import { fetchBackupText, isWebAddress, linkedFailure, linkHintParts, linkName, resolveLink } from "#lib/ui/restore"

afterEach(() => setLocale("en"))

/** A stand-in for `fetch` answering every request with `body` and `status`. */
const answering =
	(body: string, status = 200) =>
	async (_input: RequestInfo | URL) =>
		new Response(body, { status })

/** The sentence a failure shows. */
const sentence = (failure: unknown): string => messageOf(failure, "backup.error.import")

/** The sentence a failed fetch shows. */
const failureOf = async (work: Promise<unknown>): Promise<string> => {
	try {
		await work
	} catch (caught) {
		return sentence(caught)
	}
	throw new Error("expected a failure")
}

/** The address `link` is fetched from. */
const fetchedFrom = async (link: string): Promise<string[]> => {
	const asked: string[] = []
	await fetchBackupText(link, async (input) => {
		asked.push(String(input))
		return new Response("{}")
	})
	return asked
}

test("reads the text the link answers with", async () => {
	expect(await fetchBackupText("https://example.com/copy.json", answering('{"version":4}'))).toBe('{"version":4}')
})

test("trims the link before fetching it", async () => {
	expect(await fetchedFrom("  https://example.com/copy.json \n")).toEqual(["https://example.com/copy.json"])
})

test("a link without a scheme is read over https", async () => {
	expect(await fetchedFrom("example.com/copy.json")).toEqual(["https://example.com/copy.json"])
	expect(await fetchedFrom("//example.com/copy.json")).toEqual(["https://example.com/copy.json"])
	expect(await fetchedFrom("localhost:4321/copy.json")).toEqual(["https://localhost:4321/copy.json"])
	// One typed with http keeps it.
	expect(await fetchedFrom("http://example.com/copy.json")).toEqual(["http://example.com/copy.json"])
})

test("refuses what is not a web address, without fetching", async () => {
	let fetched = 0
	const counting = async () => {
		fetched += 1
		return new Response("{}")
	}
	for (const link of ["", "copy", "not a link", "ftp://example.com/copy.json", "javascript:alert(1)"]) {
		expect(await failureOf(fetchBackupText(link, counting))).toBe("That is not a web address (https://…).")
	}
	expect(fetched).toBe(0)
})

test("a link that cannot be reached says the site may not let the app read it", async () => {
	const failing = () => Promise.reject(new TypeError("Failed to fetch"))
	expect(await failureOf(fetchBackupText("https://example.com/copy.json", failing))).toBe(
		"Could not reach that link. The site may not let other sites read it; save the copy on GitHub Gist or PasteFox, or download the file and choose it instead.",
	)
})

test("a link that answers with an error names the status", async () => {
	expect(await failureOf(fetchBackupText("https://example.com/copy.json", answering("nope", 404)))).toBe(
		"That link answered with error 404.",
	)
})

test("the failures read in Thai too", async () => {
	setLocale("th")
	expect(await failureOf(fetchBackupText("copy", answering("{}")))).not.toContain("web address")
	expect(await failureOf(fetchBackupText("https://pastefox.com/206br1", answering("Not found", 404)))).not.toContain(
		"has nothing",
	)
})

test("only an http or https address on a host with a dot counts as a web address", () => {
	for (const link of [" https://example.com/b.json ", "http://example.com", "example.com/b.json", "b.json"])
		expect(isWebAddress(link)).toBe(true)
	for (const link of ["", "   ", "copy", "not a link", "ftp://example.com/b.json", "javascript:alert(1)"])
		expect(isWebAddress(link)).toBe(false)
})

test("a gist's page is read from its raw file, named by the file its anchor points at", () => {
	expect(resolveLink("https://gist.github.com/kamontat/0a1b2c3d4e5f#file-gistfile1-json")).toEqual({
		url: "https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw/gistfile1.json",
		platform: "gist",
		name: "gistfile1.json",
	})
	expect(resolveLink("gist.github.com/kamontat/0a1b2c3d4e5f#file-cc-tracking-2026-11-14-json")).toEqual({
		url: "https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw/cc-tracking-2026-11-14.json",
		platform: "gist",
		name: "cc-tracking-2026-11-14.json",
	})
})

test("a gist's page with no file anchor is read from its first file, named by the gist", () => {
	expect(resolveLink("https://gist.github.com/kamontat/0a1b2c3d4e5f")).toEqual({
		url: "https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw",
		platform: "gist",
		name: "0a1b2c3d4e5f",
	})
	expect(resolveLink("https://gist.github.com/kamontat/0a1b2c3d4e5f/")?.url).toBe(
		"https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw",
	)
})

test("a gist's raw link is read as it is", () => {
	expect(resolveLink("https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw/gistfile1.json")).toEqual({
		url: "https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw/gistfile1.json",
		platform: "gist",
		name: "gistfile1.json",
	})
	expect(resolveLink("https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw")).toEqual({
		url: "https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw",
		platform: "gist",
		name: "0a1b2c3d4e5f",
	})
})

test("a PasteFox page is read from its raw address, named by its code", () => {
	expect(resolveLink("https://pastefox.com/206br1")).toEqual({
		url: "https://pastefox.com/api/pastes/206br1/raw",
		platform: "pastefox",
		name: "206br1",
	})
	expect(resolveLink("pastefox.com/206br1/")?.url).toBe("https://pastefox.com/api/pastes/206br1/raw")
	expect(resolveLink("https://pastefox.com/api/pastes/206br1/raw")).toEqual({
		url: "https://pastefox.com/api/pastes/206br1/raw",
		platform: "pastefox",
		name: "206br1",
	})
})

test("PasteFox's own pages are not taken for pastes", () => {
	for (const page of ["create", "docs", "legal", "privacy", "api"])
		expect(resolveLink(`https://pastefox.com/${page}`)?.url).toBe(`https://pastefox.com/${page}`)
})

test("a supported site's link is fetched from its raw address", async () => {
	expect(await fetchedFrom("pastefox.com/206br1")).toEqual(["https://pastefox.com/api/pastes/206br1/raw"])
	expect(await fetchedFrom("https://gist.github.com/kamontat/0a1b2c3d4e5f#file-gistfile1-json")).toEqual([
		"https://gist.githubusercontent.com/kamontat/0a1b2c3d4e5f/raw/gistfile1.json",
	])
})

test("a supported site that has nothing at the link says what to check", async () => {
	expect(await failureOf(fetchBackupText("https://pastefox.com/206br1", answering("Not found", 404)))).toBe(
		"PasteFox has nothing at that link. Check the link, and that the copy was not deleted or has not expired.",
	)
	expect(
		await failureOf(
			fetchBackupText("https://gist.github.com/kamontat/0a1b#file-gistfile1-json", answering("404: Not Found", 404)),
		),
	).toBe("GitHub Gist has nothing at that link. Check the link, and that the copy was not deleted or has not expired.")
})

test("a supported site that keeps the copy to itself says to share it", async () => {
	for (const status of [401, 403])
		expect(await failureOf(fetchBackupText("https://pastefox.com/206br1", answering("", status)))).toBe(
			"PasteFox would not share that copy: it may be private or need a password. Make it public or unlisted, then try again.",
		)
})

test("a supported site's other errors name the site and the status", async () => {
	expect(await failureOf(fetchBackupText("https://pastefox.com/206br1", answering("", 503)))).toBe(
		"PasteFox answered with error 503. Try again in a moment.",
	)
})

test("a supported site that cannot be reached says to check the connection", async () => {
	const failing = () => Promise.reject(new TypeError("Failed to fetch"))
	expect(await failureOf(fetchBackupText("https://pastefox.com/206br1", failing))).toBe(
		"Could not reach PasteFox. Check the connection and try again.",
	)
})

test("a supported site's link that holds no backup says so, naming the site", () => {
	const unreadable = new MessageError("backup.unreadable")
	expect(sentence(linkedFailure(unreadable, "https://pastefox.com/206br1"))).toBe(
		"That PasteFox link does not hold a backup. Save the text from Copy as text there, then paste its link.",
	)
	// Any other failure, or another site, keeps its own message.
	const version = new MessageError("backup.version", { found: 2, oldest: 3, newest: 4 })
	expect(linkedFailure(version, "https://pastefox.com/206br1")).toBe(version)
	expect(linkedFailure(unreadable, "https://example.com/b.json")).toBe(unreadable)
})

test("a link is named by its file, else its host", () => {
	expect(linkName("https://example.com/backups/cc-tracking-2026-11-14.json")).toBe("cc-tracking-2026-11-14.json")
	expect(linkName("https://example.com/a%20copy.json?dl=1")).toBe("a copy.json")
	expect(linkName("https://example.com/")).toBe("example.com")
	expect(linkName(" https://example.com/backups/ ")).toBe("backups")
	expect(linkName("https://pastefox.com/api/pastes/206br1/raw")).toBe("206br1")
})

test("the link hint names gist and PasteFox as links, in the reader's language", () => {
	const links = (parts: ReturnType<typeof linkHintParts>) => parts.filter((part) => part.href !== undefined)
	const en = linkHintParts()
	expect(en.map((part) => part.text).join("")).toBe(
		"The site must let other sites read the file. Save the copy on GitHub Gist or PasteFox, then paste its link.",
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
