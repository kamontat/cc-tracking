import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderCardEditPage } from "./edit-page";

/** Edit a card: `/card/edit?id=<id>`, the card form on that card, under a sub-header to its page. */
bootstrap("title.cardEdit", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardEditPage(repo, root, "edit");
});
