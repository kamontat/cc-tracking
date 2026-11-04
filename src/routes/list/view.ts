import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderSavedPage } from "./view-page";

/** A saved list, read-only: `/list/view?id=<id>`. */
bootstrap("title.listView", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderSavedPage(repo, root);
});
