import { html, nothing, type TemplateResult } from "lit";
import type { Card, LimitGroup } from "#lib/domain/types";
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

/*
 * Phase 4's surfaces (the payment sheet, Transactions) name a card by its name, with the id in
 * square brackets and the last 4 as a quieter second part: **SCB Krabi** `[SCB-K] · 1029`.
 * Sentences and buttons use the name alone ("Record ฿41,230.00 to SCB Krabi").
 */

/** The id as a tag: `[SCB-K]`. */
export const cardIdTag = (id: string): string => `[${id}]`;

/** The muted second part of a card's name: `[SCB-K] · 1029`. */
export const cardMetaText = (card: Card): string =>
	`${cardIdTag(card.id)} · ${card.last4}`;

/** The name in bold, then the id and last 4 in a `.card-meta` element. */
export function cardNameHtml(card: Card): TemplateResult {
	return html`<span class="card-name"><b>${card.name}</b> <small class="card-meta">${cardMetaText(card)}</small></span>`;
}

/**
 * Which of the four group pastels a card wears: its group's place in the stored group order,
 * four colours round (1 to 4). Null when it draws on no stored group.
 */
export function groupTone(card: Card, groups: LimitGroup[]): number | null {
	const index = groups.findIndex(({ id }) => id === card.limitGroupId);
	return index < 0 ? null : (index % 4) + 1;
}

/**
 * The small card chip at a row's start: the last 4 on the group's pastel (`cardBits` in
 * shared.ts draws it). Decorative, since the row's text already says the last 4.
 */
export function cardMini(
	card: Card,
	groups: LimitGroup[],
	big = false,
): TemplateResult {
	const tone = groupTone(card, groups);
	return html`<span class="mini" data-g=${tone ?? nothing} ?data-big=${big} aria-hidden="true">${card.last4}</span>`;
}
