import { READY_DIRS, READY_SORTS, type ReadySort } from "#lib/domain/home"
import { OWED_DIRS, OWED_SORTS, type OwedSort } from "#lib/domain/owed"
import { readDir, type SortDir } from "#lib/domain/sort"

/** Home's three tabs (RD-22), each a top-level path: what needs you, what to pay, where to spend. */
export const NEEDS_ADDRESS = "/"
export const OWED_ADDRESS = "/owed"
export const READY_ADDRESS = "/ready"

/** The Owed tab's order (`?sort=&dir=`). */
export type OwedView = { sort: OwedSort; dir: SortDir }

export const DEFAULT_OWED_VIEW: OwedView = { sort: "urgency", dir: OWED_DIRS.urgency }

/** The Ready to use tab's order (`?sort=&dir=`). */
export type ReadyView = { sort: ReadySort; dir: SortDir }

export const DEFAULT_READY_VIEW: ReadyView = { sort: "room", dir: READY_DIRS.room }

/** A sort and its direction from a query; an unknown sort reads as `fallback`, a direction as the sort's own. */
function readSort<F extends string>(search: string, sorts: readonly F[], dirs: Record<F, SortDir>, fallback: F) {
	const p = new URLSearchParams(search)
	const value = p.get("sort")
	const sort = sorts.includes(value as F) ? (value as F) : fallback
	return { sort, dir: readDir(p.get("dir"), sort, dirs) }
}

/** `""` for the default sort in its own direction, else `?` and the keys that differ. */
function writeSort<F extends string>(view: { sort: F; dir: SortDir }, dirs: Record<F, SortDir>, fallback: F): string {
	const p = new URLSearchParams()
	if (view.sort !== fallback) p.set("sort", view.sort)
	if (view.dir !== dirs[view.sort]) p.set("dir", view.dir)
	const text = p.toString()
	return text ? `?${text}` : ""
}

/** What each card owes, in order, read from a query; unknown values read as defaults. */
export const readOwedView = (search: string): OwedView =>
	readSort(search, OWED_SORTS, OWED_DIRS, DEFAULT_OWED_VIEW.sort)

export const writeOwedView = (view: OwedView): string => writeSort(view, OWED_DIRS, DEFAULT_OWED_VIEW.sort)

/** The ready cards' order, read from a query; unknown values read as defaults. */
export const readReadyView = (search: string): ReadyView =>
	readSort(search, READY_SORTS, READY_DIRS, DEFAULT_READY_VIEW.sort)

export const writeReadyView = (view: ReadyView): string => writeSort(view, READY_DIRS, DEFAULT_READY_VIEW.sort)
