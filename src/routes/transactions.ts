import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { html, render } from "lit";
import { subscribe, t } from "#lib/i18n/index";
import { bootstrap } from "#lib/ui/page";

/** Renders the placeholder transactions page into `root`. Exported for tests. */
export function renderTransactionsPage(root: HTMLElement): void {
	const paint = () =>
		render(
			html`
				<h1>${t("nav.transactions")}</h1>
				<p class="placeholder">${t("transactions.soon")}</p>
				<a href="/cards" data-action="to-cards">${t("transactions.toCards")}</a>
			`,
			root,
		);

	subscribe(() => paint());
	paint();
}

bootstrap("title.transactions", () => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderTransactionsPage(root);
});
