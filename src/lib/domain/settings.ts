import { type Location, toLocation } from "#lib/domain/location";

/** Everything the app remembers that is not a card, a purchase, or a payment. */
export type Settings = {
	/** The places whose cards a new purchase may be entered against. */
	purchaseLocations: Location[];
};

/**
 * Krabi only.
 *
 * This reproduces the rule that was in force when the answer lived on each card: the Krabi
 * cards were the ones purchases were ever entered against.
 */
export const DEFAULT_SETTINGS: Settings = { purchaseLocations: ["krabi"] };

/**
 * A fresh copy of the default. Anything handed out to a caller that might mutate it goes
 * through here: `DEFAULT_SETTINGS` is a module-level constant, and one stray `push` into it
 * would rewrite the fallback for every later read in the process.
 */
export const defaultSettings = (): Settings => ({
	purchaseLocations: [...DEFAULT_SETTINGS.purchaseLocations],
});

export function canPurchaseAt(settings: Settings, location: Location): boolean {
	return settings.purchaseLocations.includes(location);
}

/** `settings` with `location` turned on or off. Returns a new object; the argument is untouched. */
export function withPurchaseAt(
	settings: Settings,
	location: Location,
	allowed: boolean,
): Settings {
	const without = settings.purchaseLocations.filter(
		(value) => value !== location,
	);
	return {
		purchaseLocations: allowed ? [...without, location] : without,
	};
}

/**
 * Narrows untrusted data to `Settings`, falling back to the default.
 *
 * An empty list is kept as written: turning every location off is a real answer, and
 * treating it as "nothing stored" would silently switch Krabi back on.
 */
export function toSettings(value: unknown): Settings {
	if (typeof value !== "object" || value === null) return defaultSettings();
	const stored = (value as { purchaseLocations?: unknown }).purchaseLocations;
	if (!Array.isArray(stored)) return defaultSettings();
	return {
		purchaseLocations: stored
			.map(toLocation)
			.filter((location): location is Location => location !== null),
	};
}
