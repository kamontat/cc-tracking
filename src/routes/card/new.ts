import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderCardEditPage } from "./edit-page";

/** Add a card: the card form, empty, under a back header to Cards. */
bootstrap("title.cardNew", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardEditPage(repo, root, "new");
});
