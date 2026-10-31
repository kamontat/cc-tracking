import { OWNERS, ownerOf } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";

// Numeric, so "Card 2" sorts before "Card 10"; base sensitivity, so case does not split names.
const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

/**
 * The one order every limit group dropdown lists its groups in: owner first, in `OWNERS`
 * order, then name. A reader scanning for their own account finds all of it in one run.
 */
export function byOwnerThenName(a: LimitGroup, b: LimitGroup): number {
	return (
		OWNERS.indexOf(ownerOf(a)) - OWNERS.indexOf(ownerOf(b)) ||
		collator.compare(a.name, b.name)
	);
}
