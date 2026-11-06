// Atomic design rules for src/components. Templates are src/layouts/ and
// pages are src/pages/, so only the three component tiers live here.
export const tiers = ["atoms", "molecules", "organisms"] as const

export type Tier = (typeof tiers)[number]

// Which tiers a component in each tier may import.
export const allowedImports: Record<Tier, Tier[]> = {
	atoms: [],
	molecules: ["atoms"],
	organisms: ["atoms", "molecules", "organisms"],
}

export interface ComponentFile {
	// Path relative to src/components, with forward slashes.
	path: string
	// Imported .astro components, as paths relative to src/components.
	imports: string[]
}

export const tierOf = (path: string): Tier | undefined => {
	const [first, ...rest] = path.split("/")
	if (rest.length === 0) return undefined
	return tiers.find((tier) => tier === first)
}

// Returns one message per rule broken; empty when every file follows the tiers.
export const checkAtomic = (files: ComponentFile[]): string[] =>
	files.flatMap((file) => {
		const tier = tierOf(file.path)
		if (tier === undefined) {
			return [`${file.path} is not inside ${tiers.slice(0, -1).join("/, ")}/ or ${tiers.at(-1)}/`]
		}
		return file.imports.flatMap((imported) => {
			const importedTier = tierOf(imported)
			if (importedTier !== undefined && allowedImports[tier].includes(importedTier)) return []
			return [`${file.path} (${tier}) must not import ${imported} (${importedTier ?? "no tier"})`]
		})
	})
