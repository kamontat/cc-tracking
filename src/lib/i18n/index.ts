import type { Catalog, Locale, MessageKey, Params } from "#lib/i18n/catalog";
import { en } from "#lib/i18n/en";
import { th } from "#lib/i18n/th";

export type { Catalog, Locale, MessageKey, Params };

const STORAGE_KEY = "cc:lang";

const CATALOGS: Record<Locale, Catalog> = { en, th };

const listeners = new Set<() => void>();

let current: Locale | null = null;

/**
 * Thai is the fallback, not English: the cards are Thai company cards in baht on
 * Asia/Bangkok dates, so Thai is the likely daily language and English is opted into.
 */
export function detectLocale(
	saved: string | null,
	languages: readonly string[],
): Locale {
	if (saved === "en" || saved === "th") return saved;
	return languages.some((language) => language.toLowerCase().startsWith("en"))
		? "en"
		: "th";
}

function readSaved(): string | null {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
	} catch {
		// A blocked or full store must not decide the language for the user.
		return null;
	}
}

export function getLocale(): Locale {
	if (current === null) {
		current = detectLocale(readSaved(), globalThis.navigator?.languages ?? []);
	}
	return current;
}

export function setLocale(locale: Locale): void {
	current = locale;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, locale);
	} catch (failure) {
		console.error(failure);
	}
	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}
	for (const listener of [...listeners]) listener();
}

/** Returns the function that removes this listener again. */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function t(key: MessageKey, params?: Params): string {
	const template = CATALOGS[getLocale()][key];
	if (!params) return template;
	// An unsupplied placeholder is left as written: a visible {name} is a bug worth seeing,
	// where "undefined" reads like a broken sentence nobody can trace.
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in params ? String(params[name]) : whole,
	);
}

/** Tests only: forget the resolved locale so the next read re-detects it. */
export function resetLocale(): void {
	current = null;
}
