import type { GroupColor } from "#lib/domain/group-color"
import type { Card, LimitGroup } from "#lib/domain/types"

import { toGroupColor } from "#lib/domain/group-color"

/**
 * The tile's colour (DD-151): its limit group's colour name, or undefined for a card with no
 * stored group or a colour outside the palette, so `data-g` is left off.
 */
export function tileTone(card: Card | undefined, groups: LimitGroup[]): GroupColor | undefined {
	const group = groups.find(({ id }) => id === card?.limitGroupId)
	return (group ? toGroupColor(group.color) : null) ?? undefined
}

/** Line 1's corner on Home and Cards: `•••• 4821`, or nothing when no last 4 is stored. */
export const lastFour = (card: Card): string => (card.last4 ? `•••• ${card.last4}` : "")
