import { expect, test } from "vitest"

/**
 * `CHANGELOG_TH.md` is `CHANGELOG.md` in Thai (PRD DD-218): About links a Thai reader to it, so
 * an entry written in one file and not the other leaves one reader behind.
 */
const SECTIONS: Record<string, string> = {
	"BREAKING CHANGES": "การเปลี่ยนแปลงที่ไม่เข้ากับของเดิม",
	Features: "ฟีเจอร์ใหม่",
	Improvements: "การปรับปรุง",
	"Bug fixes": "แก้ไขข้อผิดพลาด",
	Decisions: "การตัดสินใจ",
}

const read = (path: string) => Bun.file(path).text()

/** Each entry's date, in file order. */
const dates = (text: string) => [...text.matchAll(/^## (\d{4}-\d{2}-\d{2}): /gm)].map(([, date]) => date)

/** Each entry's `###` headings, in file order, one string per entry. */
const sections = (text: string) =>
	text
		.split(/^## /m)
		.slice(1)
		.map((entry) => [...entry.matchAll(/^### (.+)$/gm)].map(([, heading = ""]) => heading.trim()))

test("the Thai changelog has every entry, newest first, as the English one does", async () => {
	const [english, thai] = await Promise.all([read("CHANGELOG.md"), read("CHANGELOG_TH.md")])

	expect(dates(english).length).toBeGreaterThan(0)
	expect(dates(thai)).toEqual(dates(english))
})

test("each Thai entry has the same sections, by their Thai names", async () => {
	const [english, thai] = await Promise.all([read("CHANGELOG.md"), read("CHANGELOG_TH.md")])
	const thaiSections = sections(thai)

	sections(english).forEach((headings, index) => {
		const expected = headings.filter((heading) => heading in SECTIONS).map((heading) => SECTIONS[heading])
		const found = (thaiSections[index] ?? []).filter((heading) => Object.values(SECTIONS).includes(heading))
		expect(found, `entry ${index + 1}`).toEqual(expected)
	})
})

test("each changelog links the other", async () => {
	expect(await read("CHANGELOG.md")).toContain("(CHANGELOG_TH.md)")
	expect(await read("CHANGELOG_TH.md")).toContain("(CHANGELOG.md)")
})
