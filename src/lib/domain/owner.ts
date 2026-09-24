import type { LimitGroup } from "#lib/domain/types";

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
