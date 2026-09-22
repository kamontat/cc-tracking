/** The three places a company card is physically kept. Stored as these lowercase keys. */
export const LOCATIONS = ["bangkok", "phichit", "krabi"] as const;

export type Location = (typeof LOCATIONS)[number];

export const DEFAULT_LOCATION: Location = "bangkok";

/**
 * Narrows untrusted data to a `Location`, or `null` when it is not one.
 *
 * Takes `unknown` rather than `string` on purpose: its callers are a backup file being
 * imported and cards written before this field was a closed set. Neither is something the
 * type system can vouch for.
 */
export function toLocation(value: unknown): Location | null {
	const known: readonly string[] = LOCATIONS;
	return typeof value === "string" && known.includes(value)
		? (value as Location)
		: null;
}
