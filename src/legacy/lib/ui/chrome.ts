import type { MessageKey } from "#lib/i18n/catalog"

import { getLocale, subscribe, t } from "#lib/i18n/index"
import { type BuildInfo, buildInfo, titleMark } from "#lib/ui/build-info"
import { applyTheme } from "#lib/ui/theme"

export type ChromeOptions = {
	build?: Pick<BuildInfo, "environment" | "pr">
}

/**
 * Keeps the document title in the reader's language, marked with the build, and in step with
 * the language picker. Also stamps the build on `<html data-env>`, where tokens.css picks up
 * the build's tint, and restores the reader's saved colour theme, since every page passes
 * through here first. The header and the tab bar are the Astro shell's (`AppLayout`).
 */
export function applyChrome(titleKey: MessageKey, options: ChromeOptions = {}): void {
	const { environment, pr } = options.build ?? buildInfo()

	const apply = () => {
		document.title = t(titleKey) + titleMark(environment, pr)
		document.documentElement.lang = getLocale()
		document.documentElement.setAttribute("data-env", environment)
	}
	applyTheme()
	apply()
	subscribe(apply)
}
