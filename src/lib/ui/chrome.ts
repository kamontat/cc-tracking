import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, subscribe, t } from "#lib/i18n/index";

const setText = (root: ParentNode, id: string, key: MessageKey): void => {
	const element = root.querySelector(`#${id}`);
	if (element) element.textContent = t(key);
};

/** The path each nav link owns. Kept in step with the `href`s in the route HTML files. */
const NAV_PATHS: readonly (readonly [id: string, path: string])[] = [
	["nav-dashboard", "/"],
	["nav-cards", "/cards"],
	["nav-backup", "/backup"],
];

/**
 * Marks whichever nav link matches `path` as the current page, and clears the marker from
 * the others. Takes the path rather than reading `location` so it can be tested without
 * navigating a real document.
 *
 * Matching is exact. A card detail page (`/card`) therefore marks neither link: it is reached
 * from the dashboard and from the registry alike, so naming either one would be a guess.
 */
export function markCurrentLink(root: ParentNode, path: string): void {
	for (const [id, linkPath] of NAV_PATHS) {
		const link = root.querySelector(`#${id}`);
		if (!link) continue;
		if (path === linkPath) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
	}
}

/**
 * Fills the parts of the page that live in static HTML rather than in a Lit template —
 * the document title and the nav — and keeps them in step with the language picker.
 *
 * The current-page marker is set once rather than on every locale change: these are plain
 * `<a href>` navigations with no client-side router, so the path cannot change without a
 * fresh page load, and the attribute survives the nav's text being rewritten.
 */
export function applyChrome(
	titleKey: MessageKey,
	root: ParentNode = document,
): void {
	const apply = () => {
		document.title = t(titleKey);
		document.documentElement.lang = getLocale();
		setText(root, "nav-brand", "nav.brand");
		setText(root, "nav-dashboard", "nav.dashboard");
		setText(root, "nav-cards", "nav.cards");
		setText(root, "nav-backup", "nav.backup");
	};
	apply();
	markCurrentLink(root, location.pathname);
	subscribe(apply);
}
