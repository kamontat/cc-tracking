import type { OwnerRecord } from "#lib/domain/types"
import type { NameProblem } from "#lib/ui/location-names"

import { t } from "#lib/i18n/index"

/** How names compare: trimmed, case-insensitive. */
const key = (name: string) => name.trim().toLocaleLowerCase()

/**
 * Checks `typed` against every owner but `self`: refused when empty, or when another owner's
 * name matches it, trimmed and case-insensitive. Owners' names are never translated, so unlike
 * a location's there is only the stored name to compare.
 */
export function ownerNameProblem(typed: string, owners: readonly OwnerRecord[], self?: string): NameProblem | null {
	const wanted = key(typed)
	if (!wanted) return { kind: "empty" }
	const taken = owners.some((owner) => owner.id !== self && key(owner.name) === wanted)
	return taken ? { kind: "duplicate", name: typed.trim() } : null
}

/** Why a name was refused, in the reader's language. */
export const ownerProblemText = (problem: NameProblem): string =>
	problem.kind === "empty" ? t("owners.error.empty") : t("owners.error.duplicate", { name: problem.name })
