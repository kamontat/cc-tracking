import type { Period, PlainDate } from "#lib/domain/types"

import { CARDS_GROUPS, type CardsGroup } from "#lib/domain/cards-view"
import { isValidDate } from "#lib/domain/date"
import { DEFAULT_READY_VIEW, READY_DIRS, READY_SORTS, type ReadyView } from "#lib/domain/home"
import { DEFAULT_OWED_PLAN, OWED_KINDS, OWED_LAYOUTS, OWED_RANGES, type OwedPlanView } from "#lib/domain/owed-plan"
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

/** What `/owed` holds: the view, the month the calendar shows and the day picked (null for their defaults). */
export type OwedPlanAddress = { view: OwedPlanView; month: Period | null; day: PlainDate | null }

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * The _Owed_ tab from `/owed?q=&f.locations=&f.owners=&f.range=&f.shows=&view=&month=&day=`
 * (RD-25, RD-29): unknown values read as the defaults (`DEFAULT_OWED_PLAN`); an `f.locations`
 * is kept only when it is one of `locationIds`, an `f.owners` one of `ownerIds`.
 */
export function readOwedPlan(
	search: string,
	locationIds: readonly string[],
	ownerIds?: readonly string[],
): OwedPlanAddress {
	const p = new URLSearchParams(search)
	const range = OWED_RANGES.find((r) => String(r) === p.get("f.range")) ?? DEFAULT_OWED_PLAN.range
	const shows = OWED_KINDS.filter((kind) => p.getAll("f.shows").includes(kind))
	const layout = OWED_LAYOUTS.find((l) => l === p.get("view")) ?? DEFAULT_OWED_PLAN.layout
	const month = p.get("month") ?? ""
	const day = p.get("day") ?? ""
	return {
		view: {
			...readCardFilter(p, locationIds, ownerIds),
			range,
			shows: shows.length > 0 ? shows : [...DEFAULT_OWED_PLAN.shows],
			layout,
		},
		month: MONTH_PATTERN.test(month) ? month : null,
		day: isValidDate(day) ? day : null,
	}
}

/** `""` for the defaults, else `?` and the keys that differ, the `f.` keys repeated. */
export function writeOwedPlan(view: OwedPlanView, month: Period | null, day: PlainDate | null): string {
	const p = new URLSearchParams()
	writeCardFilter(p, view)
	if (view.range !== DEFAULT_OWED_PLAN.range) p.set("f.range", String(view.range))
	if (view.shows.length < OWED_KINDS.length) for (const kind of view.shows) p.append("f.shows", kind)
	if (view.layout !== DEFAULT_OWED_PLAN.layout) p.set("view", view.layout)
	if (month) p.set("month", month)
	if (day) p.set("day", day)
	return query(p)
}

/**
 * The _Ready to use_ tab's view from `/ready?q=&f.locations=&f.owners=&sort=&dir=&by=` (RD-29);
 * unknown values read as defaults (`DEFAULT_READY_VIEW`).
 */
export function readReadyView(search: string, locationIds: readonly string[], ownerIds?: readonly string[]): ReadyView {
	const p = new URLSearchParams(search)
	return { ...readCardFilter(p, locationIds, ownerIds), ...readOrder(p, READY_SORTS, READY_DIRS, DEFAULT_READY_VIEW) }
}

/** `""` for the defaults, else `?` and the keys that differ, the `f.` keys repeated. */
export function writeReadyView(view: ReadyView): string {
	const p = new URLSearchParams()
	writeCardFilter(p, view)
	writeOrder(p, view, READY_DIRS, DEFAULT_READY_VIEW)
	return query(p)
}
