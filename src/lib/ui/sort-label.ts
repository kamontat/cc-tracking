import type { CardsSort } from "#lib/domain/cards-view"
import type { ReadySort } from "#lib/domain/home"
import type { SortDir } from "#lib/domain/sort"
import type { OwedSort, TxSort } from "#lib/domain/transactions"

import { t } from "#lib/i18n/index"

/** Every field any list sorts by; one set of words serves every page. */
export type SortField = TxSort | OwedSort | CardsSort | ReadySort

/** A sort field's name, for a field chip: *Date*, *Room*. */
export const sortFieldLabel = (field: SortField): string => t(`sort.field.${field}`)

/** Which way a field runs, in words: *Newest first*, *Most room*; also the page's sort chip. */
export const sortOrderLabel = (field: SortField, dir: SortDir): string => t(`sort.order.${field}.${dir}`)
