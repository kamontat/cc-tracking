import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmount } from "#lib/domain/money";
import { matchesCard, type PayChoice } from "#lib/domain/pay";
import type { PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardLabelHtml } from "#lib/ui/card-label";
import { payTag } from "#lib/ui/pay-tag";
import { base, controls } from "#styles/shared";

/** *Which card?*: every card a payment can go to, most pressing first, with a search box. */
@customElement("cc-pay-picker")
export class CcPayPicker extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.list {
				display: flex;
				flex-direction: column;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-sm);
				overflow: hidden;
			}

			a[data-card] {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) var(--cc-panel-padding);
				color: inherit;
				text-decoration: none;
			}

			a[data-card] + a[data-card] {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			a[data-card]:hover {
				background: var(--cc-surface-sunken);
			}

			.what {
				display: flex;
				flex-direction: column;
				min-inline-size: 0;
			}

			.figures {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				flex: none;
			}

			.tag {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.tag[data-urgency="overdue"] {
				color: var(--cc-danger);
				font-weight: 600;
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) choices: PayChoice[] = [];
	@property() today: PlainDate = "";
	@state() private query = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		const shown = this.choices.filter((c) => matchesCard(c.card, this.query));
		return html`
			<input class="search" type="search" name="q" .value=${this.query}
				aria-label=${t("list.search")} placeholder=${t("pay.searchPlaceholder")}
				@input=${(event: Event) => {
					this.query = (event.target as HTMLInputElement).value;
				}} />
			${
				shown.length === 0
					? html`<p class="empty">${t("pay.noMatch")}</p>`
					: html`<div class="list">${shown.map((choice) => {
							const tag = payTag(choice);
							return html`<a data-card=${choice.card.id}
								href=${`/pay?card=${encodeURIComponent(choice.card.id)}`}>
								<span class="what"><b>${cardLabelHtml(choice.card.id, choice.card)}</b></span>
								<span class="figures">
									<b data-numeric>${formatAmount(choice.owed)}</b>
									${
										tag
											? html`<span class="tag" data-urgency=${tag.urgency}>${tag.text}</span>`
											: nothing
									}
								</span>
							</a>`;
						})}</div>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-pay-picker": CcPayPicker;
	}
}
