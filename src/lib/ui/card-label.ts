import { html, nothing, type TemplateResult } from "lit";
import { cardOwnerOf } from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";
import { t } from "#lib/i18n/index";

/*
 * Every page names a card in one of three forms (UI-14, DD-98):
 * - panel: the last-4 chip, then `id) name` -- rows in lists and panels;
 * - line: `id) name (last4)` -- single-line text, the copied list text, pickers and filter
 *   chips; short `id) name`;
 * - name: the name -- buttons, notices and sentences; short `c-[id]`.
 * A short form is for a small space. The markup helpers hold both forms (`.cl-full` and
 * `.cl-short`) and the page's CSS swaps them (`cardBits` in shared.ts); nothing measures widths.
 * A card that is no longer stored keeps its id: `id) —`, and `c-[id]` for its name.
 */

/** The name form's short form, and the name of a card no longer stored: `c-[5]`. */
export const cardShort = (id: string): string => `c-[${id}]`;

/** The line form: `10) Card A10 (4412)`; `short` leaves the last 4 off: `10) Card A10`. */
export function cardLine(
	id: string,
	card: Card | undefined,
	{ short = false }: { short?: boolean } = {},
): string {
	if (!card) return `${id}) ${t("common.none")}`;
	return short ? `${id}) ${card.name}` : `${id}) ${card.name} (${card.last4})`;
}

/** Several cards' lines, comma separated, each looked up in `cards`. */
export function cardLines(
	ids: string[],
	cards: Card[],
	options: { short?: boolean } = {},
): string {
	const byId = new Map(cards.map((card) => [card.id, card]));
	return ids.map((id) => cardLine(id, byId.get(id), options)).join(", ");
}

/** The name form: the card's name, or `c-[id]` once it is no longer stored. */
export const cardName = (id: string, card: Card | undefined): string =>
	card?.name ?? cardShort(id);

function swap(full: string, short: string): TemplateResult {
	return html`<span class="cl"><span class="cl-full">${full}</span><span class="cl-short" aria-hidden="true">${short}</span></span>`;
}

/** The line form as markup, with its short form beside it for a narrow place. */
export const cardLineHtml = (id: string, card: Card | undefined) =>
	swap(cardLine(id, card), cardLine(id, card, { short: true }));

/**
 * Which of the four group pastels a card wears: its group's place in the stored group order,
 * four colours round (1 to 4). Null when it draws on no stored group.
 */
export function groupTone(card: Card, groups: LimitGroup[]): number | null {
	const index = groups.findIndex(({ id }) => id === card.limitGroupId);
	return index < 0 ? null : (index % 4) + 1;
}

/**
 * The small card chip at the start of the panel form: the last 4 on the group's pastel
 * (`cardBits` in shared.ts draws it). It is the only place the panel form says the last 4, so
 * readers hear it; a card no longer stored gets an empty, hidden chip that keeps the row's shape.
 */
export function cardMini(
	card: Card | undefined,
	groups: LimitGroup[],
	big = false,
): TemplateResult {
	if (!card)
		return html`<span class="mini" ?data-big=${big} aria-hidden="true"></span>`;
	const tone = groupTone(card, groups);
	return html`<span class="mini" data-g=${tone ?? nothing} ?data-big=${big}>${card.last4}</span>`;
}

/** The panel form's text, after the chip: `10) Card A10`. */
export const cardPanelLabel = (id: string, card: Card | undefined) =>
	html`<span class="card-label">${cardLine(id, card, { short: true })}</span>`;

/**
 * The panel form in one piece, for a row that lays the chip and the label out side by side
 * (a row whose grid puts the chip in its own column uses `cardMini` and `cardPanelLabel`).
 */
export const cardPanel = (
	id: string,
	card: Card | undefined,
	groups: LimitGroup[],
	big = false,
) =>
	html`<span class="card-panel">${cardMini(card, groups, big)} ${cardPanelLabel(id, card)}</span>`;

/**
 * The name form with the cardholder after it, for the Needs you and Upcoming rows (DD-110):
 * `Krungsri Bangkok (RI)`. The holder is `cardOwnerOf` (DR-13); with none it is just the name.
 * A card no longer stored is `c-[id]`.
 */
export function cardOwnerName(
	id: string,
	card: Card | undefined,
	groups: LimitGroup[],
): string {
	if (!card) return cardShort(id);
	const group = groups.find((g) => g.id === card.limitGroupId) ?? null;
	const owner = cardOwnerOf(card, group);
	return owner ? `${card.name} (${owner})` : card.name;
}
