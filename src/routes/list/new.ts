import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "../../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { namesCards } from "#lib/ui/ready-query";
import { renderEntryPage } from "./entry";
import { renderPickerPage } from "./picker-page";

/**
 * A new purchase list. `/list/new` alone is the picker, *Ready to use* in full (DD-103);
 * `/list/new?card=<id>`, once per card, enters the amounts for the cards picked there.
 */
bootstrap("title.listNew", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (!root) return;
	if (namesCards(location.search)) renderEntryPage(repo, root, "new");
	else renderPickerPage(repo, root);
});
