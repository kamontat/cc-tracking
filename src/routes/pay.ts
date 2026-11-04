import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { bootstrap } from "#lib/ui/page";
import { renderPayPage } from "./pay-page";

/** Make a payment: `/pay` asks which card, `/pay?card=<id>` opens the payment sheet over it. */
bootstrap("title.pay", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderPayPage(repo, root);
});
