import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { describe, expect, it } from "vitest"

import { allowedImports, checkAtomic, tierOf } from "./atomic"

const root = join(import.meta.dirname, "..", "..")
const componentsDir = join(root, "src", "components")

describe("tierOf", () => {
	it("reads the tier from the first directory under src/components", () => {
		expect(tierOf("atoms/Heading.astro")).toBe("atoms")
		expect(tierOf("molecules/Card.astro")).toBe("molecules")
		expect(tierOf("organisms/Header.astro")).toBe("organisms")
	})

	it("returns undefined outside a tier", () => {
		expect(tierOf("Heading.astro")).toBeUndefined()
		expect(tierOf("widgets/Heading.astro")).toBeUndefined()
	})
})

describe("allowedImports", () => {
	it("lets atoms import no component", () => {
		expect(allowedImports.atoms).toEqual([])
	})

	it("lets molecules import only atoms", () => {
		expect(allowedImports.molecules).toEqual(["atoms"])
	})

	it("lets organisms import atoms, molecules and other organisms", () => {
		expect(allowedImports.organisms).toEqual(["atoms", "molecules", "organisms"])
	})
})

describe("checkAtomic", () => {
	const file = (path: string, imports: string[] = []) => ({ path, imports })

	it("accepts a component inside a tier with allowed imports", () => {
		expect(
			checkAtomic([
				file("atoms/Heading.astro"),
				file("molecules/Card.astro", ["atoms/Heading.astro"]),
				file("organisms/Header.astro", ["molecules/Card.astro", "atoms/Heading.astro"]),
			]),
		).toEqual([])
	})

	it("rejects a component outside a tier", () => {
		expect(checkAtomic([file("Heading.astro")])).toEqual([
			"Heading.astro is not inside atoms/, molecules/ or organisms/",
		])
	})

	it("rejects an upward import", () => {
		expect(checkAtomic([file("atoms/Heading.astro", ["molecules/Card.astro"])])).toEqual([
			"atoms/Heading.astro (atoms) must not import molecules/Card.astro (molecules)",
		])
	})

	it("rejects a molecule importing another molecule", () => {
		expect(checkAtomic([file("molecules/Card.astro", ["molecules/Tag.astro"])])).toEqual([
			"molecules/Card.astro (molecules) must not import molecules/Tag.astro (molecules)",
		])
	})
})

// Lists every .astro file under src/components with the component imports in
// its frontmatter, as paths relative to src/components.
const scan = () => {
	const files = readdirSync(componentsDir, { recursive: true, encoding: "utf8" }).filter((path) =>
		path.endsWith(".astro"),
	)
	return files.map((path) => {
		const source = readFileSync(join(componentsDir, path), "utf8")
		const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
		const specifiers = [...frontmatter.matchAll(/from\s+["']([^"']+\.astro)["']/g)].map((match) => match[1] as string)
		const imports = specifiers
			.map((specifier) => {
				if (specifier.startsWith("#components/")) return specifier.slice("#components/".length)
				if (specifier.startsWith(".")) {
					const target = resolve(dirname(join(componentsDir, path)), specifier)
					const rel = relative(componentsDir, target)
					return rel.startsWith("..") ? undefined : rel
				}
				return undefined
			})
			.filter((rel): rel is string => rel !== undefined)
			.map((rel) => rel.split(sep).join("/"))
		return { path: path.split(sep).join("/"), imports }
	})
}

describe("src/components", () => {
	it("follows the atomic design tiers", () => {
		expect(checkAtomic(scan())).toEqual([])
	})
})
