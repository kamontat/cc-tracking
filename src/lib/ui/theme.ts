export type Theme = "system" | "light" | "dark";

export const THEMES: readonly Theme[] = ["system", "light", "dark"];

const STORAGE_KEY = "cc:theme";

const isTheme = (value: string | null): value is Theme =>
	value === "system" || value === "light" || value === "dark";

/** "system" leaves the colours to the device's own light or dark preference. */
export function getTheme(): Theme {
	try {
		const saved = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
		return isTheme(saved) ? saved : "system";
	} catch {
		// A blocked store must not decide the colours for the reader.
		return "system";
	}
}

/**
 * Stamps the saved pick on `<html data-theme>`, where tokens.css reads it. No stamp means
 * "system": the `prefers-color-scheme` query in tokens.css then decides on its own.
 */
export function applyTheme(): void {
	if (typeof document === "undefined") return;
	const theme = getTheme();
	if (theme === "system")
		document.documentElement.removeAttribute("data-theme");
	else document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, theme);
	} catch (failure) {
		console.error(failure);
	}
	applyTheme();
}
