import type { Card } from "#lib/domain/types";

/** The three people a card can belong to. Stored as these initials, which are not translated. */
export const OWNERS = ["KC", "NT", "RI"] as const;

export type Owner = (typeof OWNERS)[number];

export const DEFAULT_OWNER: Owner = "KC";

/**
 * Narrows untrusted data to an `Owner`, or `null` when it is not one.
 *
 * Takes `unknown` for the same reason `toLocation` does: its callers are an imported backup
 * file and cards written before the field existed, neither of which the type system can
 * vouch for.
 */
export function toOwner(value: unknown): Owner | null {
	const known: readonly string[] = OWNERS;
	return typeof value === "string" && known.includes(value)
		? (value as Owner)
		: null;
}

/**
 * Whose card this is.
 *
 * `Card.owner` is typed as `Owner`, so the guard here looks like dead code. It is not:
 * cards written before the field existed carry nothing at all, and an imported backup can
 * carry anything. Both read as the default rather than blanking the column.
 */
export function ownerOf(card: Card): Owner {
	return toOwner(card.owner) ?? DEFAULT_OWNER;
}
