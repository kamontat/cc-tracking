import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderEntryPage } from "./entry";

/** A new purchase list from the cards picked on Home: `/list/new?card=<id>`, once per card. */
bootstrap("title.listNew", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderEntryPage(repo, root, "new");
});
