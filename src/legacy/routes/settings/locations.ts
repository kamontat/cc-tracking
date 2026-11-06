import { bootstrap } from "#legacy/lib/ui/page"
import { renderLocationsPage } from "./locations-page"

/** The Locations page: `/settings/locations`, every place a card can be kept, under Settings. */
export const start = () =>
	bootstrap("title.locations", (repo) => {
		const root = document.querySelector<HTMLElement>("#page")
		if (root) renderLocationsPage(repo, root)
	})
