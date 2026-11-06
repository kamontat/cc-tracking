import type { ReadyRow } from "#lib/domain/home"
import type { LimitGroup, PlainDate } from "#lib/domain/types"

import { css, html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { cardName } from "#legacy/lib/ui/card-label"
import { icons } from "#legacy/lib/ui/icons"
import { base } from "#legacy/styles/shared"
import { displayDate } from "#lib/domain/date"
import { formatAmount } from "#lib/domain/money"
import { cardOwnerOf, ownerOf } from "#lib/domain/owner"
import { getLocale, t } from "#lib/i18n/index"
import { cardTileStyles, tileBody, tileTone } from "./card-tile"

/**
 * Line 1's corner: the cardholder; for a supplementary card, the cardholder and whose account
 * it draws on (`NT · KC's account`). A supplementary card saved without a holder names the
 * account holder, as Cards does.
 */
function holders(row: ReadyRow): string {
	const account = ownerOf(row.room.group)
	if (!row.card.supplementary) return account
	const holder = cardOwnerOf(row.card, row.room.group) ?? account
	return t("tile.subAccount", { holder, owner: account })
}

/**
 * The new-list picker's cards (DD-103): the ready cards as given (already filtered and sorted),
 * as card tiles (DD-151). A whole tile is the toggle, a native `<button aria-pressed>` named only
 * by the card and its room, so a screen reader is not read the whole tile on every tab; nothing
 * inside it is interactive. A tap emits `toggle` with the card. A ticked tile wears an accent
 * outline and a filled tick.
 */
@customElement("cc-ready-picker")
export class CcReadyPicker extends LitElement {
	static override styles = [
		base,
		cardTileStyles,
		css`
			:host {
				display: block;
			}
		`,
	]

	@property({ attribute: false }) rows: ReadyRow[] = []
	@property({ attribute: false }) selected: string[] = []
	/** The stored limit groups, in order: a tile takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = []
	@property() today: PlainDate = ""

	constructor() {
		super()
		new LocaleController(this)
	}

	private toggle(cardId: string) {
		this.dispatchEvent(
			new CustomEvent("toggle", {
				detail: { cardId },
				bubbles: true,
				composed: true,
			}),
		)
	}

	override render() {
		const locale = getLocale()
		return html`<div class="tiles">${this.rows.map((row) => {
			const id = row.card.id
			const on = this.selected.includes(id)
			return html`<button type="button" class="tile" data-g=${tileTone(row.card, this.groups)}
				data-card=${id} aria-pressed=${on ? "true" : "false"}
				aria-label=${t("ready.pickName", { card: cardName(id, row.card), room: formatAmount(row.room.room) })}
				@click=${() => this.toggle(id)}>${tileBody({
					card: row.card,
					room: row.room,
					credit: row.credit,
					lead: html`<span class="tick" aria-hidden="true">${on ? icons.check : nothing}</span>`,
					corner: holders(row),
					plainRoom: true,
					facts: t("cards.page.dates", {
						close: displayDate(row.closeDate, locale),
						due: displayDate(row.dueDate, locale),
					}),
				})}</button>`
		})}</div>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-picker": CcReadyPicker
	}
}
