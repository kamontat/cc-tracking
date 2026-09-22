import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, subscribe, t } from "#lib/i18n/index";

const setText = (root: ParentNode, id: string, key: MessageKey): void => {
	const element = root.querySelector(`#${id}`);
	if (element) element.textContent = t(key);
};

/**
 * Fills the parts of the page that live in static HTML rather than in a Lit template —
 * the document title and the nav — and keeps them in step with the language picker.
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
	};
	apply();
	subscribe(apply);
}
