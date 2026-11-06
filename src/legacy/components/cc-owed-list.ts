import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { OwedSort } from "#lib/domain/transactions"
import type { CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { css, html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { base, controls, listControls } from "#legacy/styles/shared"
import { today } from "#lib/domain/date"
import { t } from "#lib/i18n/index"
import { payAddress } from "#lib/ui/pay-address"
import { cardTileStyles, tileTone } from "./card-tile"
import { payTileBody, payTileName } from "./pay-tile"

const SORTS: OwedSort[] = ["urgency", "card", "due", "left"]

/**
 * "Owed on each card": a heading with its sort chip, then a card list of payment tiles, one for
 * every card that owes money or holds credit, each a link to the payment sheet on its card. The
 * tile is the payment picker's (DD-166); the list is one column, since it sits in a narrow
 * column beside the ledger from 900px and has the phone's width below it.
 */
@customElement("cc-owed-list")
export class CcOwedList extends LitElement {
	static override styles = [
		base,
		controls,
		listControls,
		cardTileStyles,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
			}

			.sec-head {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-2);
			}

			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 700;
			}

			/* One column at every width: the side column is narrow, a phone narrower. */
			.tiles {
				grid-template-columns: minmax(0, 1fr);
			}

			.empty {
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	]

	@property({ attribute: false }) rows: PayChoice[] = []
	/** The stored limit groups, in order: a tile takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = []
	/** Each group's room, by group id: a tile's rail shows its group's used share. */
	@property({ attribute: false }) rooms: Map<string, GroupRoom> = new Map()
	/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map()
	/** Today, which picks a card's open period when its ledger has no open statement. */
	@property() today: PlainDate = today(new Date())
	@property() sort: OwedSort = "urgency"

	constructor() {
		super()
		new LocaleController(this)
	}

	override render() {
		const head = html`<div class="sec-head">
			<h2>${t("tx.owed.title")}</h2>
			${
				this.rows.length
					? html`<label class="chip" ?data-active=${this.sort !== "urgency"}>
						${t("list.sort")}
						<select name="sort" @change=${(event: Event) =>
							this.dispatchEvent(
								new CustomEvent("sort", {
									detail: { sort: (event.target as HTMLSelectElement).value },
								}),
							)}>
							${SORTS.map(
								(sort) =>
									html`<option value=${sort} .selected=${this.sort === sort}>${t(`tx.owed.sort.${sort}`)}</option>`,
							)}
						</select>
					</label>`
					: nothing
			}
		</div>`
		if (this.rows.length === 0) return html`${head}<p class="empty">${t("tx.owed.empty")}</p>`
		return html`
			${head}
			<div class="tiles">${this.rows.map(
				(row) => html`<a class="tile" data-g=${tileTone(row.card, this.groups)}
					data-card=${row.card.id} aria-label=${payTileName(row)}
					href=${payAddress({ cardId: row.card.id })}>${payTileBody(row, this)}</a>`,
			)}</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-owed-list": CcOwedList
	}
}
