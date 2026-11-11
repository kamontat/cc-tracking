import type { CardsGroup } from "#lib/domain/cards-view"
import type { ReadyGroup } from "#lib/domain/ready-filter"
import type { ListsGroup, TxGroup } from "#lib/domain/transactions"

import { t } from "#lib/i18n/index"

/** Every way any list is sectioned; one set of words serves every page. */
export type Grouping = CardsGroup | ReadyGroup | TxGroup | ListsGroup

/** A grouping's name, for a *Group by* chip and the page's group chip: *Place*, *Day*, *None*. */
export const groupingLabel = (by: Grouping): string => t(`group.${by}`)
