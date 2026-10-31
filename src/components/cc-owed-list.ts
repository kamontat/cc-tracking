import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { formatAmount } from "#lib/domain/money";
import type { PayChoice } from "#lib/domain/pay";
import type { OwedSort } from "#lib/domain/transactions";
import type { LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardMini, cardNameHtml } from "#lib/ui/card-label";
import { openPayment } from "#lib/ui/pay-sheet";
import { payTag } from "#lib/ui/pay-tag";
import {
	base,
	cardBits,
	controls,
	listControls,
	rowPanel,
} from "#styles/shared";

const SORTS: OwedSort[] = ["urgency", "card", "due", "left"];

/**
 * "Owed on each card": a heading with its sort chip, then one panel with a row for every card
 * that owes money or holds credit, each row opening the payment sheet on it.
 */
@customElement("cc-owed-list")
export class CcOwedList extends LitElement {
	static override styles = [
		base,
		controls,
		listControls,
		cardBits,
		rowPanel,
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

			.what {
				gap: var(--cc-space-1);
			}

			.empty {
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	];

	@property({ attribute: false }) rows: PayChoice[] = [];
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property() sort: OwedSort = "urgency";

	constructor() {
		super();
		new LocaleController(this);
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
		</div>`;
		if (this.rows.length === 0)
			return html`${head}<p class="empty">${t("tx.owed.empty")}</p>`;
		return html`
			${head}
			<div class="panel">${this.rows.map((row) => {
				const tag = payTag(row);
				return html`<button type="button" class="crow" data-card=${row.card.id}
					@click=${() => openPayment({ cardId: row.card.id })}>
					${cardMini(row.card, this.groups)}
					<span class="what">${cardNameHtml(row.card)}${
						tag
							? html`<span class="tag" data-urgency=${tag.urgency}>${tag.text}</span>`
							: nothing
					}</span>
					<span class="r">
						<b class="amount" data-numeric>${formatAmount(row.owed)}</b>
						<small>${t("pay.owedUnder")}</small>
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
