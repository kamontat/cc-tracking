import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderEntryPage } from "./entry";

/** A stored draft to finish, send or delete: `/list/draft?id=<id>`. */
bootstrap("title.listDraft", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderEntryPage(repo, root, "draft");
});
