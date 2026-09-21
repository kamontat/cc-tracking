import "#components/cc-error-banner";
import { createRepository, StorageUnavailableError } from "#lib/storage/index";
import type { Repository } from "#lib/storage/repository";

/**
 * Creates the repository once per page and hands it to the page's renderer.
 * A browser that refuses storage gets the banner instead of a half-working page.
 */
export function bootstrap(render: (repo: Repository) => void): void {
	try {
		render(createRepository());
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
	}
}
