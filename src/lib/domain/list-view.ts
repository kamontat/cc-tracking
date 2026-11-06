import type { LimitGroup } from "#lib/domain/types"

import { getLocale } from "#lib/i18n/index"

/**
 * The one order every place that lists limit groups uses: A to Z by name in the reader's
 * language, then by id, so two groups of one name keep a stable order.
 */
export function byGroupName(a: LimitGroup, b: LimitGroup): number {
	return a.name.localeCompare(b.name, getLocale()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
