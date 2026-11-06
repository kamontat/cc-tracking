import { bootstrap } from "#legacy/lib/ui/page"
import { renderReplyPage } from "./reply-page"

/** The spender's reply to a waiting list: `/list/reply?id=<id>`. */
export const start = () =>
	bootstrap("title.listReply", (repo) => {
		const root = document.querySelector<HTMLElement>("#page")
		if (root) renderReplyPage(repo, root)
	})
