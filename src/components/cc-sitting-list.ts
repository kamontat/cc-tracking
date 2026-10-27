import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { formatAmount, sumAmounts } from "#lib/domain/money";
import type { Card, Purchase } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * What was entered since the current batch started, latest first, so a reader who walked away
 * mid-pile can see which receipts are already in. Read-only: corrections happen on the card page.
 */
@customElement("cc-sitting-list")
export class CcSittingList extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			.summary {
				flex-wrap: wrap;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-2);
				margin-block-end: var(--cc-space-3);
				padding: var(--cc-space-2) var(--cc-space-3);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-md);
			}

			.confirm {
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
			}

			.ago {
				color: var(--cc-text-muted);
				white-space: nowrap;
			}

			.empty {
				color: var(--cc-text-muted);
			}

			/* A card is named as the due list and spendable panels name it. */
			.card-name {
				font-weight: 600;
			}

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}
		`,
	];

	/** Already narrowed to this sitting and ordered, by `sittingPurchases`. */
	@property({ attribute: false }) purchases: Purchase[] = [];
	@property({ attribute: false }) cards: Card[] = [];
	/** The current time in ms, so "how long ago" is measured against the page's clock. */
	@property({ type: Number }) now = 0;

	@state() private confirming = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	private ago(addedAt: string | undefined): string {
		const elapsed = Math.max(0, this.now - Date.parse(addedAt ?? ""));
		if (elapsed < MINUTE) return t("sitting.ago.now");
		if (elapsed < HOUR)
			return t("sitting.ago.minutes", { n: Math.floor(elapsed / MINUTE) });
		if (elapsed < DAY)
			return t("sitting.ago.hours", { n: Math.floor(elapsed / HOUR) });
		return t("sitting.ago.days", { n: Math.floor(elapsed / DAY) });
	}

	/** Named as the other panels name a card, but not linked: this list is for checking, not going. */
	private cardLabel(cardId: string) {
		const card = this.cards.find((entry) => entry.id === cardId);
		return card
			? html`<small class="card-id">${card.id})</small> <span class="card-name">${card.name}</span>`
			: cardId;
	}

	private batchControls() {
		if (!this.confirming) {
			return html`<button type="button" data-variant="quiet" data-action="start-batch"
				@click=${() => {
					this.confirming = true;
				}}>${t("sitting.startBatch")}</button>`;
		}
		return html`<span class="confirm" row>
			<span>${t("sitting.confirmBatch")}</span>
			<button type="button" data-variant="danger" data-action="confirm-batch"
				@click=${() => {
					this.confirming = false;
					this.dispatchEvent(new CustomEvent("start-batch"));
				}}>${t("sitting.startBatch")}</button>
			<button type="button" data-variant="quiet" data-action="keep-batch"
				@click=${() => {
					this.confirming = false;
				}}>${t("sitting.keep")}</button>
		</span>`;
	}

	override render() {
		const total = sumAmounts(this.purchases.map((entry) => entry.amount));
		return html`
			<div class="summary" row>
				<span data-testid="sitting-summary">${t("sitting.summary", {
					count: this.purchases.length,
					total: formatAmount(total),
				})}</span>
				${this.batchControls()}
			</div>
			${
				this.purchases.length === 0
					? html`<p class="empty">${t("sitting.empty")}</p>`
					: html`<table>
						<thead>
							<tr>
								<th>${t("sitting.column.added")}</th>
								<th>${t("sitting.column.card")}</th>
								<th>${t("sitting.column.date")}</th>
								<th data-numeric>${t("sitting.column.amount")}</th>
							</tr>
						</thead>
						<tbody>
							${this.purchases.map(
								(entry) => html`<tr data-testid="sitting-row">
									<td class="ago" data-testid="sitting-ago">${this.ago(entry.addedAt)}</td>
									<td data-label=${t("sitting.column.card")}>${this.cardLabel(entry.cardId)}</td>
									<td class="date" data-label=${t("sitting.column.date")}>${displayDate(entry.date, getLocale())}</td>
									<td data-numeric data-label=${t("sitting.column.amount")}>${formatAmount(entry.amount)}</td>
								</tr>`,
							)}
						</tbody>
					</table>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-sitting-list": CcSittingList;
	}
}
