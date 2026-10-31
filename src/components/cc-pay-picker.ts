import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmount } from "#lib/domain/money";
import { matchesCard, type PayChoice } from "#lib/domain/pay";
import type { LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardMini, cardPanelLabel } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";
import { payTag } from "#lib/ui/pay-tag";
import { base, cardBits, controls } from "#styles/shared";

/** The card a row asks to pay. */
export type PickDetail = { cardId: string };

/**
 * The payment sheet's first step: every card a payment can go to, most pressing first, with a
 * search box. A row emits `pick` with its card; the sheet then shows the form.
 */
@customElement("cc-pay-picker")
export class CcPayPicker extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
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

			.list {
				display: flex;
				flex-direction: column;
				padding: 0 var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			button[data-card] {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto;
				align-items: center;
				align-self: stretch;
				gap: var(--cc-space-1) var(--cc-space-3);
				padding: var(--cc-space-3) 0;
				font-size: var(--cc-text-md);
				font-weight: 400;
				line-height: var(--cc-leading);
				white-space: normal;
				text-align: start;
				color: var(--cc-text);
				background: transparent;
				border: 0;
				border-radius: 0;
			}

			button[data-card] + button[data-card] {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			button[data-card]:hover {
				background: transparent;
			}

			button[data-card]:hover .what b {
				text-decoration: underline;
			}

			.what {
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				gap: var(--cc-space-1);
				min-inline-size: 0;
				line-height: 1.35;
			}

			.figures {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				line-height: 1.25;
			}

			.figures small {
				font-size: var(--cc-text-xs);
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) choices: PayChoice[] = [];
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
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
		if (this.choices.length === 0) {
			return html`<p class="empty" data-empty="no-cards"><a href="/cards">${t("pay.noCards")}</a></p>`;
		}
		const shown = this.choices.filter((c) => matchesCard(c.card, this.query));
		return html`
			<p class="hint">${t("pay.pickHint")}</p>
			<label class="search">${icons.search}<input type="search" name="q" .value=${this.query}
				aria-label=${t("pay.searchPlaceholder")} placeholder=${t("pay.searchPlaceholder")}
				@input=${(event: Event) => {
					this.query = (event.target as HTMLInputElement).value;
				}} /></label>
			${
				shown.length === 0
					? html`<p class="empty">${t("pay.noMatch")}</p>`
					: html`<div class="list">${shown.map((choice) => {
							const tag = payTag(choice);
							return html`<button type="button" data-card=${choice.card.id}
								@click=${() => this.pick(choice.card.id)}>
								${cardMini(choice.card, this.groups)}
								<span class="what"><b>${cardPanelLabel(choice.card.id, choice.card)}</b>${
									tag
										? html`<span class="tag" data-urgency=${tag.urgency}>${tag.text}</span>`
										: nothing
								}</span>
								<span class="figures">
									<b data-numeric>${formatAmount(choice.owed)}</b>
									<small>${t("pay.owedUnder")}</small>
								</span>
							</button>`;
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
