import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { formatAmount } from "#lib/domain/money";
import type { PayChoice } from "#lib/domain/pay";
import type { OwedSort } from "#lib/domain/transactions";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardLabelHtml } from "#lib/ui/card-label";
import { openPayment } from "#lib/ui/pay-sheet";
import { payTag } from "#lib/ui/pay-tag";
import { base, controls, listControls } from "#styles/shared";

const SORTS: OwedSort[] = ["urgency", "card", "due", "left"];

/** Every card that owes money or holds credit, each row opening the payment sheet on it. */
@customElement("cc-owed-list")
export class CcOwedList extends LitElement {
	static override styles = [
		base,
		controls,
		listControls,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.toolbar {
				display: flex;
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

			button[data-card] {
				display: flex;
				flex-direction: row;
				align-items: center;
				align-self: stretch;
				justify-content: space-between;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) var(--cc-panel-padding);
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
				background: var(--cc-surface-sunken);
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

	@property({ attribute: false }) rows: PayChoice[] = [];
	@property() sort: OwedSort = "urgency";

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		if (this.rows.length === 0)
			return html`<p class="empty">${t("tx.owed.empty")}</p>`;
		return html`
			<div class="toolbar">
				<label class="chip" ?data-active=${this.sort !== "urgency"}>
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
				</label>
			</div>
			<div class="list">${this.rows.map((row) => {
				const tag = payTag(row);
				return html`<button type="button" data-card=${row.card.id}
					@click=${() => openPayment({ cardId: row.card.id })}>
					<b>${cardLabelHtml(row.card.id, row.card)}</b>
					<span class="figures">
						<b data-numeric>${formatAmount(row.owed)}</b>
						${tag ? html`<span class="tag" data-urgency=${tag.urgency}>${tag.text}</span>` : nothing}
					</span>
				</button>`;
			})}</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-owed-list": CcOwedList;
	}
}
