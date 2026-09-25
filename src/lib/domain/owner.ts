import type { Card, LimitGroup } from "#lib/domain/types";

/** The three people an account can belong to. Stored as these initials, which are not translated. */
export const OWNERS = ["KC", "NT", "RI"] as const;

export type Owner = (typeof OWNERS)[number];

export const DEFAULT_OWNER: Owner = "KC";

/**
 * Narrows untrusted data to an `Owner`, or `null` when it is not one.
 *
 * Takes `unknown` for the same reason `toLocation` does: its callers are an imported backup
 * file and limit groups written before the field existed, neither of which the type system
 * can vouch for.
 */
export function toOwner(value: unknown): Owner | null {
	const known: readonly string[] = OWNERS;
	return typeof value === "string" && known.includes(value)
		? (value as Owner)
		: null;
}

/**
 * Whose account this pool of credit belongs to.
 *
 * `LimitGroup.owner` is optional, so a group written before the field existed carries nothing
 * and lands on the default. The narrowing does more than that `??` would on its own: an
 * imported backup can carry anything, and a value the closed set does not know reads as the
 * default too rather than printing junk in the column.
 */
export function ownerOf(group: LimitGroup): Owner {
	return toOwner(group.owner) ?? DEFAULT_OWNER;
}

/**
 * Who holds this card. A supplementary card (บัตรเสริม) is issued to someone other than the
 * account's owner -- KC's account, NT's card -- so it answers with its own `owner`. Every other
 * card, and a supplementary one saved before the field existed, belongs to whoever owns the
 * group it draws on. `null` only for a card with neither: no owner of its own and no group.
 */
export function cardOwnerOf(
	card: Card,
	group: LimitGroup | null,
): Owner | null {
	const own = card.supplementary ? toOwner(card.owner) : null;
	return own ?? (group ? ownerOf(group) : null);
}

/**
 * A group as a picker names it: `KBank pool (KC)`. The owner's initials are not translated,
 * so neither is the pattern.
 */
export function groupLabel(group: LimitGroup): string {
	return `${group.name} (${ownerOf(group)})`;
}
