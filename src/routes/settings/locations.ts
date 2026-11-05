import { bootstrap } from "#lib/ui/page";
import { renderLocationsPage } from "./locations-page";

/** The Locations page: `/settings/locations`, every place a card can be kept, under Settings. */
bootstrap("title.locations", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderLocationsPage(repo, root);
});
