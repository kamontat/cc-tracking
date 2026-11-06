import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"

const skillsDir = join(import.meta.dirname, "..", ".claude", "skills")

const skills = readdirSync(skillsDir, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)

test.each(skills)("%s is prefixed with project-", (skill) => {
	expect(skill).toMatch(/^project-/)
})

test.each(skills)("%s has a SKILL.md whose name matches its directory", (skill) => {
	const source = readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8")
	expect(source.match(/^---\n(?:.*\n)*?name: (.+)\n/)?.[1]).toBe(skill)
})
