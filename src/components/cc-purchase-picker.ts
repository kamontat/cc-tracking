import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ReadyRow } from "#lib/domain/home";
import { formatAmount } from "#lib/domain/money";
import { matchesReady } from "#lib/domain/ready-filter";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardName } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";
import { base, cardBits, controls, rowPanel, usageBar } from "#styles/shared";
import type { PickDetail } from "./cc-pay-picker";
import { readyRowParts, readyRowStyles } from "./ready-row";

/**
 * The purchase page's card picker: the cards a purchase can go on (FR-22), in the order given
 * (by place, then id), each a *Ready to use* row with its room, with a search box over the id,
 * name and last 4. A row emits `pick` with its card; the page then opens the purchase sheet.
 */
@customElement("cc-purchase-picker")
export class CcPurchasePicker extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		usageBar,
		rowPanel,
		readyRowStyles,
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

			/* A row with no tick still picks. */
			.ready-row[data-plain] {
				cursor: pointer;
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) rows: ReadyRow[] = [];
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property() today: PlainDate = "";
	@state() private query = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private pick(cardId: string) {
		this.dispatchEvent(
			new CustomEvent<PickDetail>("pick", { detail: { cardId } }),
		);
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<p class="empty" data-empty="no-cards"><a href="/settings">${t("quickAdd.noEligible")}</a></p>`;
		}
		const shown = this.rows.filter((row) => matchesReady(row, this.query));
		return html`
			<p class="hint">${t("purchase.pickHint")}</p>
			<label class="search">${icons.search}<input type="search" name="q" .value=${this.query}
				aria-label=${t("pay.searchPlaceholder")} placeholder=${t("pay.searchPlaceholder")}
				@input=${(event: Event) => {
					this.query = (event.target as HTMLInputElement).value;
				}} /></label>
			${
				shown.length === 0
					? html`<p class="empty">${t("pay.noMatch")}</p>`
					: html`<div class="panel">${shown.map(
							(
								row,
							) => html`<button type="button" class="crow ready-row" data-plain
								data-card=${row.card.id}
								aria-label=${t("ready.pickName", {
									card: cardName(row.card.id, row.card),
									room: formatAmount(row.room.room),
								})}
								@click=${() => this.pick(row.card.id)}>
								${readyRowParts(row, this.groups, this.today)}
							</button>`,
						)}</div>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-purchase-picker": CcPurchasePicker;
	}
}
