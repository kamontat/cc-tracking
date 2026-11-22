import { describe, expect, test } from "vitest"

/**
 * The changelog is written for the app's users, with the developer detail in each entry's last
 * section, Technical (`project-changelog`). `CHANGELOG_TH.md` is the same history in Thai (PRD
 * DD-218): About links a Thai reader to it, so an entry written in one file and not the other
 * leaves one reader behind.
 */
const SECTIONS: Record<string, string> = {
	"BREAKING CHANGES": "การเปลี่ยนแปลงที่ต้องรู้",
	Features: "ฟีเจอร์ใหม่",
	Improvements: "การปรับปรุง",
	"Bug fixes": "แก้ไขข้อผิดพลาด",
	Decisions: "การตัดสินใจ",
	Technical: "รายละเอียดทางเทคนิค",
}

const FILES = { en: "CHANGELOG.md", th: "CHANGELOG_TH.md" } as const

const read = (path: string) => Bun.file(path).text()

/** Each entry's date, in file order. */
const dates = (text: string) => [...text.matchAll(/^## (\d{4}-\d{2}-\d{2}): /gm)].map(([, date]) => date)

/** Each entry, its heading line dropped. */
const entries = (text: string) =>
	text
		.split(/^## /m)
		.slice(1)
		.map((entry) => entry.slice(entry.indexOf("\n") + 1))

/** Each entry's `###` headings, in file order. */
const headings = (entry: string) => [...entry.matchAll(/^### (.+)$/gm)].map(([, heading = ""]) => heading.trim())

/** An entry's text before its Technical section: what a user reads. */
const userPart = (entry: string, technical: string) => entry.split(new RegExp(`^### ${technical}$`, "m"))[0] ?? ""

test("the Thai changelog has every entry, newest first, as the English one does", async () => {
	const [english, thai] = await Promise.all([read(FILES.en), read(FILES.th)])

	expect(dates(english).length).toBeGreaterThan(0)
	expect(dates(thai)).toEqual(dates(english))
})

test("each entry's sections are the fixed ones, in order, and the same in both languages", async () => {
	const [english, thai] = await Promise.all([read(FILES.en), read(FILES.th)])
	const order = Object.keys(SECTIONS)
	const thaiEntries = entries(thai)

	entries(english).forEach((entry, index) => {
		const found = headings(entry)
		expect(
			found.every((heading) => heading in SECTIONS),
			`entry ${index + 1}: ${found}`,
		).toBe(true)
		expect(found, `entry ${index + 1} order`).toEqual([...found].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
		expect(headings(thaiEntries[index] ?? ""), `entry ${index + 1} in Thai`).toEqual(
			found.map((heading) => SECTIONS[heading]),
		)
	})
})

describe.each(Object.entries(FILES))("%s keeps developer detail in Technical", (locale, path) => {
	const technical = locale === "en" ? "Technical" : "รายละเอียดทางเทคนิค"

	test("no PRD ID outside Technical", async () => {
		const leaks = entries(await read(path)).flatMap((entry) =>
			[...userPart(entry, technical).matchAll(/\b(?:DD|RD|FR|DC|UI|CD|NFR)-\d+/g)].map(([id]) => id),
		)
		expect(leaks).toEqual([])
	})

	test("no code name outside Technical", async () => {
		const leaks = entries(await read(path)).flatMap((entry) =>
			[...userPart(entry, technical).matchAll(/`[^`\n]*\b[a-z]+[A-Z]\w*[^`\n]*`/g)].map(([code]) => code),
		)
		expect(leaks).toEqual([])
	})
})

test("each changelog links the other", async () => {
	expect(await read(FILES.en)).toContain("(CHANGELOG_TH.md)")
	expect(await read(FILES.th)).toContain("(CHANGELOG.md)")
})
