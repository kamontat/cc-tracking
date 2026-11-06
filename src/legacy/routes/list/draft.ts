import { bootstrap } from "#legacy/lib/ui/page"
import { renderEntryPage } from "./entry"

/** A stored draft to finish, send or delete: `/list/draft?id=<id>`. */
export const start = () =>
	bootstrap("title.listDraft", (repo) => {
		const root = document.querySelector<HTMLElement>("#page")
		if (root) renderEntryPage(repo, root, "draft")
	})
