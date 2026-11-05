import type { MessageKey } from "#lib/i18n/catalog"
import type { V3Counts } from "#lib/storage/transfer-v3"

import { t } from "#lib/i18n/index"

/** The kinds in the order the sentence names them. */
const KINDS = ["cards", "purchases", "payments", "limitGroups", "lists"] as const

/**
 * "1 card, 2 purchases, …": how many of each record, singular or plural per kind. Used by the
 * restore question and messages and by the Delete all data warning.
 */
export const countsText = (counts: V3Counts): string =>
	KINDS.map((kind) => {
		const count = counts[kind]
		const key = `counts.${kind}.${count === 1 ? "one" : "many"}` as MessageKey
		return t(key, { count })
	}).join(", ")
