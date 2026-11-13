import type { CardsSort } from "#lib/domain/cards-view"
import type { ReadySort } from "#lib/domain/home"
import type { LimitsSort } from "#lib/domain/limits-view"
import type { OwedSort } from "#lib/domain/owed"
import type { SortDir } from "#lib/domain/sort"
import type { TxSort } from "#lib/domain/transactions"

import { t } from "#lib/i18n/index"

/** Every field any list sorts by; one set of words serves every page. */
export type SortField = TxSort | OwedSort | CardsSort | ReadySort | LimitsSort

/** A sort field's name, for a field chip: *Date*, *Room*. */
export const sortFieldLabel = (field: SortField): string => t(`sort.field.${field}`)

/** Which way a field runs, in words: *Newest first*, *Most room*; also the page's sort chip. */
export const sortOrderLabel = (field: SortField, dir: SortDir): string => t(`sort.order.${field}.${dir}`)

/**
 * A direction's short words, for the order switch: *Newest*, *Most*. Always found inside the
 * full words (`sortOrderLabel`), which name the button, so what is seen is what is said.
 */
export const sortShortLabel = (field: SortField, dir: SortDir): string => t(`sort.short.${field}.${dir}`)
