/**
 * Remembers whether each foldable panel (`<details>`) is open, so a reload reopens the page as
 * the reader left it. Panels are named, not numbered: `name` is a stable, locale-invariant key.
 */

const prefix = "cc:panel:";

/** The panel's saved state, or `fallback` when none is saved or the store cannot be read. */
export function panelOpen(name: string, fallback: boolean): boolean {
	try {
		const saved = globalThis.localStorage?.getItem(prefix + name);
		if (saved === "open") return true;
		if (saved === "closed") return false;
	} catch {
		// A blocked store must not decide what the reader sees.
	}
	return fallback;
}

/** A `@toggle` listener that saves the panel's new state under `name`. */
export function rememberPanel(name: string): (event: Event) => void {
	return (event) => {
		const { open } = event.currentTarget as HTMLDetailsElement;
		try {
			globalThis.localStorage?.setItem(prefix + name, open ? "open" : "closed");
		} catch (failure) {
			console.error(failure);
		}
	};
}
