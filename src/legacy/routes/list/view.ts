import { bootstrap } from "#legacy/lib/ui/page"
import { renderSavedPage } from "./view-page"

/** A saved list, read-only: `/list/view?id=<id>`. */
export const start = () =>
	bootstrap("title.listView", (repo) => {
		const root = document.querySelector<HTMLElement>("#page")
		if (root) renderSavedPage(repo, root)
	})
