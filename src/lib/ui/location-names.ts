import type { LocationRecord } from "#lib/domain/types"

import { en } from "#lib/i18n/en"
import { locationName } from "#lib/i18n/format"
import { t } from "#lib/i18n/index"
import { th } from "#lib/i18n/th"

/** Why a typed location name is refused: none at all, or one another location already shows or stores. */
export type NameProblem = { kind: "empty" } | { kind: "duplicate"; name: string }

/** How names compare: trimmed, case-insensitive. */
const key = (name: string) => name.trim().toLocaleLowerCase()

/**
 * Every name `record` goes by: its stored name, its shown name, and -- for a seeded place
 * still under its English default -- its catalog name in both languages, so the check does
 * not depend on which language the reader has on.
 */
function namesOf(record: LocationRecord): string[] {
	const names = [record.name, locationName(record)]
	const catalogKey = `location.${record.id}`
	if (catalogKey in en) {
		const key = catalogKey as keyof typeof en
		if (record.name === en[key]) names.push(th[key])
	}
	return names
}

/**
 * Checks `typed` against every record but `self`: refused when empty, or when it matches any
 * name the record goes by (`namesOf`), trimmed and case-insensitive.
 */
export function nameProblem(typed: string, records: LocationRecord[], self?: string): NameProblem | null {
	const wanted = key(typed)
	if (!wanted) return { kind: "empty" }
	const taken = records.some((record) => record.id !== self && namesOf(record).some((name) => key(name) === wanted))
	return taken ? { kind: "duplicate", name: typed.trim() } : null
}

/** Why a name was refused, in the reader's language. */
export const problemText = (problem: NameProblem): string =>
	problem.kind === "empty" ? t("locations.error.empty") : t("locations.error.duplicate", { name: problem.name })
