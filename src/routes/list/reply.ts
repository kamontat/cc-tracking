import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderReplyPage } from "./reply-page";

/** The spender's reply to a waiting list: `/list/reply?id=<id>`. */
bootstrap("title.listReply", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderReplyPage(repo, root);
});
