import "#components/cc-error-banner";
// Registered here rather than route by route: every page reaches this module through
// bootstrap(), so no route can ship the footer tag without the element behind it.
import "#components/cc-site-footer";
import type { MessageKey } from "#lib/i18n/catalog";
import { messageOf } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import { createRepository } from "#lib/storage/index";
import { migrateLocations } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";
import { applyChrome } from "#lib/ui/chrome";

/**
 * Creates the repository once per page, reconciles any stored location the closed set no
 * longer recognises, and hands the repository to the page's renderer. A browser that
 * refuses storage gets the banner instead of a half-working page.
 *
 * `titleKey` fills the document title and the nav via `applyChrome` before anything else
 * runs -- including the storage-unavailable banner below. Applying chrome from inside
 * `render` (the per-route callback) cannot cover that early-return path, since `render`
 * is never invoked when storage is unavailable; hoisting it here instead means a reader
 * whose browser refuses storage still gets a translated title and nav under the banner,
 * and no route can structurally miss that path the way a `render`-side call always would.
 */
export function bootstrap(
	titleKey: MessageKey,
	render: (repo: Repository) => void,
): void {
	applyChrome(titleKey);

	let repo: Repository;
	try {
		repo = createRepository();
	} catch (error) {
		console.error(error);
		const banner = document.createElement("cc-error-banner");
		// Mirrors applyChrome above: re-render this banner's text on every locale switch,
		// not just once at the moment startup failed. Without this the language picker
		// sitting right beside the banner would work while the banner itself stayed frozen
		// in whichever language `createRepository` happened to fail in -- the same class of
		// bug 094668d already fixed for cc-card-form and cc-quick-add.
		const paintBanner = () => {
			banner.message = messageOf(error, "startup.failed");
			banner.retryLabel = t("common.reload");
		};
		paintBanner();
		subscribe(paintBanner);
		banner.addEventListener("retry", () => location.reload());
		const target = document.querySelector("main") ?? document.body;
		target.prepend(banner);
		return;
	}

	// The page renders whether or not the migration succeeded. A location that could not be
	// rewritten is a cosmetic problem; refusing to render would turn it into an outage.
	void migrateLocations(repo, globalThis.localStorage)
		.catch((failure: unknown) => {
			console.error(failure);
		})
		.then(() => {
			render(repo);
		});
}
