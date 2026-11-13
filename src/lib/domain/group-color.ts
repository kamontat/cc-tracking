import type { LimitGroup } from "#lib/domain/types"

/**
 * The colours a limit group can carry, in palette order. Stored as these names; the values
 * behind them live in `tokens.css`. The first four are the colours the groups wore before the
 * choice was stored, which is why new groups start with them in order.
 */
export const GROUP_COLORS = [
	"blue",
	"green",
	"purple",
	"orange",
	"teal",
	"rose",
	"amber",
	"indigo",
	"olive",
	"cyan",
	"plum",
	"slate",
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

/**
 * Narrows untrusted data to a `GroupColor`, or `null` when it is not one. Takes `unknown` for
 * the same reason `toLocation` does: an imported backup or a group saved before the field existed
 * can carry anything.
 */
export function toGroupColor(value: unknown): GroupColor | null {
	const known: readonly string[] = GROUP_COLORS
	return typeof value === "string" && known.includes(value) ? (value as GroupColor) : null
}

/**
 * A colour for a new group: random among those no group in `groups` uses, or among all of them
 * once every colour is taken. `random` is injectable so a test can pin the draw.
 */
export function pickColor(groups: LimitGroup[], random: () => number = Math.random): GroupColor {
	const used = new Set(groups.map((g) => toGroupColor(g.color)))
	const free = GROUP_COLORS.filter((c) => !used.has(c))
	const candidates = free.length > 0 ? free : GROUP_COLORS
	const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1)
	return candidates[index] as GroupColor
}

/**
 * Gives a colour to every group that lacks a valid one, and returns only those groups.
 *
 * `groups` is in stored order. The first four keep the colour they wore before it was stored
 * (`GROUP_COLORS[index]`) unless another group already holds it; every other group draws with
 * `pickColor` over the groups as assigned so far, so two new groups never share a free colour.
 */
export function assignColors(groups: LimitGroup[], random: () => number = Math.random): LimitGroup[] {
	const current = groups.map((g) => ({ ...g }))
	const changed: LimitGroup[] = []
	current.forEach((g, index) => {
		if (toGroupColor(g.color)) return
		const legacy = index < 4 ? GROUP_COLORS[index] : undefined
		const taken = current.some((o) => o !== g && toGroupColor(o.color) === legacy)
		g.color =
			legacy && !taken
				? legacy
				: pickColor(
						current.filter((o) => o !== g),
						random,
					)
		changed.push(g)
	})
	return changed
}
