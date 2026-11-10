/** Which way a sort runs: `asc` puts the smallest, earliest or first-named first. */
export type SortDir = "asc" | "desc"

export const SORT_DIRS: readonly SortDir[] = ["asc", "desc"]

/**
 * The direction from an address value, or the field's own default (`defaults[field]`) when the
 * value is missing or unknown, so a bare `sort=` reads the way that field always has.
 */
export function readDir<F extends string>(value: string | null, field: F, defaults: Record<F, SortDir>): SortDir {
	return SORT_DIRS.includes(value as SortDir) ? (value as SortDir) : defaults[field]
}

/**
 * `key` (written ascending) run in `dir`, then `tie` (never flipped), so equal rows keep the
 * same order whichever way the sort runs.
 */
export function directed<T>(
	key: (a: T, b: T) => number,
	dir: SortDir,
	tie: (a: T, b: T) => number,
): (a: T, b: T) => number {
	const sign = dir === "asc" ? 1 : -1
	return (a, b) => sign * key(a, b) || tie(a, b)
}
