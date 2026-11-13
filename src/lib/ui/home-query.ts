import { CARDS_GROUPS, type CardsGroup } from "#lib/domain/cards-view"
import { DEFAULT_READY_VIEW, READY_DIRS, READY_SORTS, type ReadyView } from "#lib/domain/home"
import { DEFAULT_OWED_VIEW, OWED_DIRS, OWED_SORTS, OWED_STATES, type OwedView } from "#lib/domain/owed"
import { readDir, type SortDir } from "#lib/domain/sort"
import { readCardFilter, writeCardFilter } from "#lib/ui/cards-query"

/** Home's three tabs (RD-22), each a top-level path: what needs you, what to pay, where to spend. */
export const NEEDS_ADDRESS = "/"
export const OWED_ADDRESS = "/owed"
export const READY_ADDRESS = "/ready"

/** A sort, its direction and a grouping from a query; unknown values read as `defaults`, a direction as the sort's own. */
function readOrder<F extends string>(
	p: URLSearchParams,
	sorts: readonly F[],
	dirs: Record<F, SortDir>,
	defaults: { sort: F; by: CardsGroup },
) {
	const value = p.get("sort")
	const sort = sorts.includes(value as F) ? (value as F) : defaults.sort
	const by = p.get("by") as CardsGroup
	return { sort, dir: readDir(p.get("dir"), sort, dirs), by: CARDS_GROUPS.includes(by) ? by : defaults.by }
}

/** Sets the sort, the direction and the grouping where they differ from `defaults` (a direction from the sort's own). */
function writeOrder<F extends string>(
	p: URLSearchParams,
	view: { sort: F; dir: SortDir; by: CardsGroup },
	dirs: Record<F, SortDir>,
	defaults: { sort: F; by: CardsGroup },
) {
	if (view.sort !== defaults.sort) p.set("sort", view.sort)
	if (view.dir !== dirs[view.sort]) p.set("dir", view.dir)
	if (view.by !== defaults.by) p.set("by", view.by)
}

const query = (p: URLSearchParams): string => {
	const text = p.toString()
	return text ? `?${text}` : ""
}

/**
 * The _Owed_ tab's view from `/owed?q=&f.locations=&f.owners=&f.states=&sort=&dir=&by=` (RD-29);
 * unknown values read as defaults (`DEFAULT_OWED_VIEW`), and an `f.locations` is kept only when it
 * is one of `locationIds`, the stored records' ids.
 */
export function readOwedView(search: string, locationIds: readonly string[]): OwedView {
	const p = new URLSearchParams(search)
	const states = p.getAll("f.states")
	return {
		...readCardFilter(p, locationIds),
		states: OWED_STATES.filter((state) => states.includes(state)),
		...readOrder(p, OWED_SORTS, OWED_DIRS, DEFAULT_OWED_VIEW),
	}
}

/** `""` for the defaults, else `?` and the keys that differ, the `f.` keys repeated. */
export function writeOwedView(view: OwedView): string {
	const p = new URLSearchParams()
	writeCardFilter(p, view)
	for (const state of view.states) p.append("f.states", state)
	writeOrder(p, view, OWED_DIRS, DEFAULT_OWED_VIEW)
	return query(p)
}

/**
 * The _Ready to use_ tab's view from `/ready?q=&f.locations=&f.owners=&sort=&dir=&by=` (RD-29);
 * unknown values read as defaults (`DEFAULT_READY_VIEW`).
 */
export function readReadyView(search: string, locationIds: readonly string[]): ReadyView {
	const p = new URLSearchParams(search)
	return { ...readCardFilter(p, locationIds), ...readOrder(p, READY_SORTS, READY_DIRS, DEFAULT_READY_VIEW) }
}

/** `""` for the defaults, else `?` and the keys that differ, the `f.` keys repeated. */
export function writeReadyView(view: ReadyView): string {
	const p = new URLSearchParams()
	writeCardFilter(p, view)
	writeOrder(p, view, READY_DIRS, DEFAULT_READY_VIEW)
	return query(p)
}
