import "#components/cc-error-banner";
import type { MessageKey } from "#lib/i18n/catalog";
import { messageOf } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import { createRepository } from "#lib/storage/index";
import { migrateLocations } from "#lib/storage/migrate-locations";
import { migratePayments } from "#lib/storage/migrate-payments";
import type { Repository } from "#lib/storage/repository";
import { applyChrome } from "#lib/ui/chrome";
import { mountPayHost } from "#lib/ui/pay-sheet";

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
export type BootstrapOptions = {
	storage?: Storage;
	createRepo?: () => Repository;
};

export async function bootstrap(
	titleKey: MessageKey,
	render: (repo: Repository) => void,
	options: BootstrapOptions = {},
): Promise<void> {
	applyChrome(titleKey);

	let repo: Repository;
	try {
		repo = (options.createRepo ?? createRepository)();
	} catch (error) {
		console.error(error);
		const banner = document.createElement("cc-error-banner");
		// Mirrors applyChrome above: re-render this banner's text on every locale switch,
		// not just once at the moment startup failed. Without this a locale change would
		// rewrite the title and nav while the banner itself stayed frozen
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

	const storage = options.storage ?? globalThis.localStorage;

	// The page renders whether or not the location migration succeeded. A location that
	// could not be rewritten is a cosmetic problem; refusing to render would turn it into
	// an outage.
	try {
		await migrateLocations(repo, storage);
	} catch (failure) {
		console.error(failure);
	}

	// Payments are different: numbers read from half-converted payments would be wrong, so a
	// failure shows the banner instead of the page. The marker stays unset; a reload retries.
	try {
		await migratePayments(repo, storage);
	} catch (failure) {
		console.error(failure);
		const banner = document.createElement("cc-error-banner");
		const paint = () => {
			banner.message = t("startup.paymentsFailed");
			banner.retryLabel = t("common.reload");
		};
		paint();
		subscribe(paint);
		banner.addEventListener("retry", () => location.reload());
		(document.querySelector("main") ?? document.body).prepend(banner);
		return;
	}

	// The payment sheet sits closed on every page, so the floating Payment button and every
	// other way to pay open it over the page (`openPayment`).
	mountPayHost(repo);
	render(repo);
}
