import type { PurgeAge } from "#lib/domain/purge"

/** What the purge sheet hands back: how many purchases went, and the age they were older than. */
export type PurgedDetail = { count: number; age: PurgeAge }

/** The ages *Clean old data* offers, youngest first; a year is the default. */
export const PURGE_AGES: readonly PurgeAge[] = ["6m", "1y", "3y", "all"]
