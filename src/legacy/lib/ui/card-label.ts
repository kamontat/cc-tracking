import type { Card, LimitGroup } from "#lib/domain/types"

import { html, nothing, type TemplateResult } from "lit"

import { cardLine, groupColor } from "#lib/ui/card-label"

// The text forms live in #lib/ui/card-label, shared with the Svelte islands; this file adds the
// markup the Lit pages draw them with.
export {
	cardLine,
	cardLines,
	cardName,
	cardOwnerName,
	cardRowTitle,
	cardShort,
	cardTitle,
	groupColor,
} from "#lib/ui/card-label"

function swap(full: string, short: string): TemplateResult {
	return html`<span class="cl"><span class="cl-full">${full}</span><span class="cl-short" aria-hidden="true">${short}</span></span>`
}

/** The line form as markup, with its short form beside it for a narrow place. */
export const cardLineHtml = (id: string, card: Card | undefined) =>
	swap(cardLine(id, card), cardLine(id, card, { short: true }))

/**
 * The small card chip at the start of the panel form: the last 4 on the group's pastel
 * (`cardBits` in shared.ts draws it). It is the only place the panel form says the last 4, so
 * readers hear it; a card no longer stored gets an empty, hidden chip that keeps the row's shape.
 */
export function cardMini(card: Card | undefined, groups: LimitGroup[], big = false): TemplateResult {
	if (!card) return html`<span class="mini" ?data-big=${big} aria-hidden="true"></span>`
	const color = groupColor(card, groups)
	return html`<span class="mini" data-g=${color ?? nothing} ?data-big=${big}>${card.last4}</span>`
}

/** The panel form's text, after the chip: `10) Card A10`. */
export const cardPanelLabel = (id: string, card: Card | undefined) =>
	html`<span class="card-label">${cardLine(id, card, { short: true })}</span>`

/**
 * The panel form in one piece, for a row that lays the chip and the label out side by side
 * (a row whose grid puts the chip in its own column uses `cardMini` and `cardPanelLabel`).
 */
export const cardPanel = (id: string, card: Card | undefined, groups: LimitGroup[], big = false) =>
	html`<span class="card-panel">${cardMini(card, groups, big)} ${cardPanelLabel(id, card)}</span>`
