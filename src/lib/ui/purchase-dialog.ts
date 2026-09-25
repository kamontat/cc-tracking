import "#components/cc-error-banner";
import "#components/cc-modal";
import "#components/cc-quick-add";
import { html, nothing, type TemplateResult } from "lit";
import type { QuickAddDetail } from "#components/cc-quick-add";
import type { SpendRow } from "#lib/domain/limit";
import type { Card, PlainDate } from "#lib/domain/types";
import { t } from "#lib/i18n/index";

/**
 * The Add a purchase button, dialog and confirmation shared by the dashboard and the card page.
 * The page owns every piece of state -- whether the dialog is open, whether it has tried a save,
 * the answer to show -- and repaints; these only turn that state into markup.
 */

/** The button that opens the dialog, for the page's title row. */
export const addPurchaseButton = (onOpen: () => void): TemplateResult =>
	html`<button type="button" data-action="add-purchase" @click=${onOpen}>${t("dashboard.addPurchase")}</button>`;

/**
 * The dialog around the quick-add form. `error` is shown inside it, where the reader can see it
 * over the backdrop; pass "" until the dialog has tried a save, so an older page error does not
 * greet a reader who has only just opened it.
 */
export const purchaseDialog = (options: {
	cards: Card[];
	rows: SpendRow[];
	today: PlainDate;
	error: string;
	onAdd: (event: CustomEvent<QuickAddDetail>) => void;
	onClose: () => void;
	onRetry: () => void;
}): TemplateResult => html`
	<cc-modal heading=${t("dashboard.addPurchase")} @close=${options.onClose}>
		<cc-error-banner .message=${options.error} retry-label=${t("common.reload")}
			@retry=${options.onRetry}></cc-error-banner>
		<cc-quick-add .cards=${options.cards} .rows=${options.rows} .today=${options.today}
			@add=${options.onAdd} @cancel=${options.onClose}></cc-quick-add>
	</cc-modal>
`;

/**
 * Where a saved purchase lands, under the page heading. The live region stays in the DOM while
 * empty -- hidden by `:empty` -- so it is already in place when the next answer arrives.
 */
export const purchaseStatus = (
	answer: string,
	onDismiss: () => void,
): TemplateResult => html`
	<div class="purchase-status" role="status">${
		answer
			? html`<p>${answer}</p>
				<button type="button" data-variant="quiet" @click=${onDismiss}>${t("common.dismiss")}</button>`
			: nothing
	}</div>
`;
