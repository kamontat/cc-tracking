import { html, nothing, type TemplateResult } from "lit";
import type { Card } from "#lib/domain/types";
import { t } from "#lib/i18n/index";

/** A card's name in its three parts; `last4` is empty when the card is no longer stored. */
export type CardLabel = { id: string; name: string; last4: string };

/**
 * How Home and the purchase lists name a card: `10) Card A10 (4412)` (UI-14). `card` is the
 * stored card for `id`, if there still is one; without it the line keeps its id and a dash.
 */
export function cardLabel(id: string, card: Card | undefined): CardLabel {
	return {
		id: `${id})`,
		name: card?.name ?? t("common.none"),
		last4: card ? `(${card.last4})` : "",
	};
}

/** The label as one line of text; `last4: false` leaves the digits off. */
export function cardLabelText(
	id: string,
	card: Card | undefined,
	{ last4 = true }: { last4?: boolean } = {},
): string {
	const parts = cardLabel(id, card);
	return [parts.id, parts.name, last4 ? parts.last4 : ""]
		.filter(Boolean)
		.join(" ");
}

/** Several cards' labels, comma separated, each looked up in `cards`. */
export function cardLabelsText(ids: string[], cards: Card[]): string {
	const byId = new Map(cards.map((card) => [card.id, card]));
	return ids.map((id) => cardLabelText(id, byId.get(id))).join(", ");
}

/**
 * The label as markup. The last 4 sit in their own `.last4` element, so a narrow place can hide
 * them without ever cutting the id or name.
 */
export function cardLabelHtml(
	id: string,
	card: Card | undefined,
): TemplateResult {
	const parts = cardLabel(id, card);
	return html`<span class="card-label">${parts.id} ${parts.name}${
		parts.last4 ? html` <span class="last4">${parts.last4}</span>` : nothing
	}</span>`;
}
