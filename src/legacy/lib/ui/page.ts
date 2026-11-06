import "#legacy/components/cc-error-banner"
import type { MessageKey } from "#lib/i18n/catalog"
import type { Repository } from "#lib/storage/repository"

import { applyChrome } from "#legacy/lib/ui/chrome"
import { subscribe, t } from "#lib/i18n/index"
import { pageSignal } from "#lib/ui/spa"
import { openRepository, type StartupOptions } from "#lib/ui/startup"

/**
 * Opens the store (`openRepository`: the repository plus every startup migration) and hands
 * the repository to the page's renderer. A browser that refuses storage, or a payment
 * conversion that fails, gets the banner instead of a half-working page.
 *
 * `titleKey` fills the document title via `applyChrome` before anything else runs --
 * including the banner below -- so a reader whose browser refuses storage still gets a
 * translated title under it, and no route can miss that path.
 */
export type BootstrapOptions = StartupOptions

export async function bootstrap(
	titleKey: MessageKey,
	render: (repo: Repository) => void,
	options: BootstrapOptions = {},
): Promise<void> {
	applyChrome(titleKey)

	const opened = await openRepository(options)
	if (!opened.ok) {
		const banner = document.createElement("cc-error-banner")
		// Re-read on every locale switch, so the banner never freezes in the language startup
		// failed in.
		const paint = () => {
			banner.message = opened.message()
			banner.retryLabel = t("common.reload")
		}
		paint()
		subscribe(paint, { signal: pageSignal() })
		banner.addEventListener("retry", () => location.reload())
		;(document.querySelector("main") ?? document.body).prepend(banner)
		return
	}

	render(opened.repo)
}
