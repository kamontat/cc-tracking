import type { GroupRoom } from "#lib/domain/room"
import type { CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { css, html, LitElement, type TemplateResult } from "lit"
import { customElement, property, state } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { icons } from "#legacy/lib/ui/icons"
import { base, controls } from "#legacy/styles/shared"
import { today } from "#lib/domain/date"
import { matchesCard, type PayChoice } from "#lib/domain/pay"
import { t } from "#lib/i18n/index"
import { cardTileStyles, tileTone } from "./card-tile"
import { payTileBody, payTileName } from "./pay-tile"

/** The card a row asks to pay. */
export type PickDetail = { cardId: string }

/**
 * The payment sheet's first step: every card a payment can go to, most pressing first, with a
 * search box, as card tiles (DD-151, DD-166). A whole tile is one `<button>` named only by the
 * card and what it owes; a tap emits `pick` with its card, and the sheet then shows the form.
 */
@customElement("cc-pay-picker")
export class CcPayPicker extends LitElement {
	static override styles = [
		base,
		controls,
		cardTileStyles,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.hint {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.search {
				position: relative;
				display: block;
			}

			.search .icon {
				position: absolute;
				inset-inline-start: var(--cc-space-3);
				inset-block-start: 50%;
				inline-size: var(--cc-icon-size-sm);
				block-size: var(--cc-icon-size-sm);
				color: var(--cc-text-muted);
				transform: translateY(-50%);
			}

			.search input {
				padding-block: var(--cc-space-3);
				padding-inline: calc(var(--cc-space-3) * 2 + var(--cc-icon-size-sm))
					var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	]

	@property({ attribute: false }) choices: PayChoice[] = []
	/** The stored limit groups, in order: a tile takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = []
	/** Each group's room, by group id: a tile's rail shows its group's used share. */
	@property({ attribute: false }) rooms: Map<string, GroupRoom> = new Map()
	/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map()
	/** Today, which picks a card's open period when its ledger has no open statement. */
	@property() today: PlainDate = today(new Date())
	/** How many cards are stored, to tell "none yet" from "only archived, paid off". */
	@property({ type: Number }) total = 0
	@state() private query = ""

	constructor() {
		super()
		new LocaleController(this)
	}

	private pick(cardId: string) {
		this.dispatchEvent(new CustomEvent<PickDetail>("pick", { detail: { cardId } }))
	}

	private tile(choice: PayChoice): TemplateResult {
		const { card } = choice
		return html`<button type="button" class="tile" data-g=${tileTone(card, this.groups)}
			data-card=${card.id} aria-label=${payTileName(choice)}
			@click=${() => this.pick(card.id)}>${payTileBody(choice, this)}</button>`
	}

	override render() {
		if (this.choices.length === 0) {
			if (this.total > 0) return html`<p class="empty" data-empty="archived">${t("pay.noneToPay")}</p>`
			return html`<p class="empty" data-empty="no-cards"><a href="/cards">${t("pay.noCards")}</a></p>`
		}
		const shown = this.choices.filter((c) => matchesCard(c.card, this.query))
		return html`
			<p class="hint">${t("pay.pickHint")}</p>
			<label class="search">${icons.search}<input type="search" name="q" .value=${this.query}
				aria-label=${t("pay.searchPlaceholder")} placeholder=${t("pay.searchPlaceholder")}
				@input=${(event: Event) => {
					this.query = (event.target as HTMLInputElement).value
				}} /></label>
			${
				shown.length === 0
					? html`<p class="empty">${t("pay.noMatch")}</p>`
					: html`<div class="tiles">${shown.map((choice) => this.tile(choice))}</div>`
			}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-pay-picker": CcPayPicker
	}
}
