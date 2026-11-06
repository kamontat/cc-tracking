import { en } from "#lib/i18n/en"
import { getLocale, type MessageKey, subscribe, t } from "#lib/i18n/index"

/** The attribute static `.astro` markup carries its catalog key in (PRD DD-171). */
export const COPY_ATTRIBUTE = "data-i18n"

/** The attribute carrying the catalog key of an element's `aria-label`. */
export const LABEL_ATTRIBUTE = "data-i18n-aria-label"

/** Set on `<html>` once the copy is in the reader's locale; the CSS hides Thai copy until then. */
export const READY_ATTRIBUTE = "data-i18n-ready"

const isKey = (key: string): key is MessageKey => key in en

/**
 * Swaps the text of every `[data-i18n]` element, and the `aria-label` of every
 * `[data-i18n-aria-label]` element, under `root` to the reader's locale. A key the catalog
 * does not know leaves the shipped English in place rather than blanking it.
 */
export function applyCopy(root: ParentNode): void {
	for (const element of root.querySelectorAll<HTMLElement>(`[${COPY_ATTRIBUTE}]`)) {
		const key = element.getAttribute(COPY_ATTRIBUTE) ?? ""
		if (isKey(key)) element.textContent = t(key)
	}
	for (const element of root.querySelectorAll<HTMLElement>(`[${LABEL_ATTRIBUTE}]`)) {
		const key = element.getAttribute(LABEL_ATTRIBUTE) ?? ""
		if (isKey(key)) element.setAttribute("aria-label", t(key))
	}
}

/**
 * Puts a page's static copy in the reader's locale, sets `<html lang>`, marks the page ready,
 * and does it again whenever the locale changes. Returns the function that stops following.
 */
export function startCopy(doc: Document): () => void {
	const apply = () => {
		applyCopy(doc)
		doc.documentElement.lang = getLocale()
		doc.documentElement.setAttribute(READY_ATTRIBUTE, "")
	}
	apply()
	return subscribe(apply)
}
