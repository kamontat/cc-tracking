import "#components/cc-error-banner";
import { createRepository, StorageUnavailableError } from "#lib/storage/index";
import { migrateLocations } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";

/**
 * Creates the repository once per page, reconciles any stored location the closed set no
 * longer recognises, and hands the repository to the page's renderer. A browser that
 * refuses storage gets the banner instead of a half-working page.
 */
export function bootstrap(render: (repo: Repository) => void): void {
	let repo: Repository;
	try {
		repo = createRepository();
	} catch (error) {
		console.error(error);
		const banner = document.createElement("cc-error-banner");
		banner.message =
			error instanceof StorageUnavailableError
				? error.message
				: "Something went wrong starting the page.";
		banner.retryLabel = "Reload";
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
