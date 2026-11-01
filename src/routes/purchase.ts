import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderPurchasePage } from "./purchase-page";

/** Add purchase: `/purchase` asks which card, `/purchase?card=<id>` opens the sheet over it. */
bootstrap("title.purchase", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderPurchasePage(repo, root);
});
