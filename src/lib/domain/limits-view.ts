import type { GroupPanel } from "#lib/domain/cards-view"
import type { Card } from "#lib/domain/types"

import { byGroupName } from "#lib/domain/list-view"
import { type Owner, ownerOf } from "#lib/domain/owner"
import { directed, type SortDir } from "#lib/domain/sort"

/** How the Limits tab orders its groups (RD-22): by name (the default), most room, most used. */
export type LimitsSort = "name" | "room" | "used"

export const LIMITS_SORTS: readonly LimitsSort[] = ["name", "room", "used"]

/** Each sort's own direction: A to Z, most room, most used. */
export const LIMITS_DIRS: Record<LimitsSort, SortDir> = { name: "asc", room: "desc", used: "desc" }

/** What narrows and orders the Limits tab. An empty `owners` means any holder. */
export type LimitsView = { q: string; owners: Owner[]; sort: LimitsSort; dir: SortDir }

export const DEFAULT_LIMITS_VIEW: LimitsView = { q: "", owners: [], sort: "name", dir: "asc" }

const KEYS: Record<LimitsSort, (a: GroupPanel, b: GroupPanel) => number> = {
	name: (a, b) => byGroupName(a.group, b.group),
	room: (a, b) => a.room - b.room,
	// The share of the limit in use, as the panel's bar and *N% used* show it.
	used: (a, b) => a.usedPct - b.usedPct,
}

/**
 * The group panels the Limits tab shows: those whose name, or one of whose cards' names, holds
 * the search (trimmed, any case), held by one of `owners`, in the view's order (ties A to Z).
 */
export function limitsResults(panels: readonly GroupPanel[], cards: readonly Card[], view: LimitsView): GroupPanel[] {
	const q = view.q.trim().toLowerCase()
	const names = (panel: GroupPanel) => [
		panel.group.name,
		...cards.filter((card) => card.limitGroupId === panel.group.id).map((card) => card.name),
	]
	return panels
		.filter((panel) => view.owners.length === 0 || view.owners.includes(ownerOf(panel.group)))
		.filter((panel) => q === "" || names(panel).some((name) => name.toLowerCase().includes(q)))
		.sort(directed(KEYS[view.sort], view.dir, KEYS.name))
}
