import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { PlainDate, Statement } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { base, controls, dataTable, panel } from "#styles/shared";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
	static override styles = [
		base,
		controls,
		panel,
		dataTable,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			article[data-urgency="overdue"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-overdue);
			}

			article[data-urgency="soon"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-soon);
			}

			.period {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.dates {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.statement-actions {
				gap: var(--cc-space-2);
				align-items: center;
			}
		`,
	];

	@property({ attribute: false }) statements: Statement[] = [];
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: string, detail: Record<string, string>) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	override render() {
		if (this.statements.length === 0) {
			return html`<p>${t("statements.empty")}</p>`;
		}
		return html`
			${this.statements.map(
				(statement) => html`
					<article data-urgency=${urgencyOf(statement, this.today)}>
						<header>
							<div>
								<span class="period">${statement.period}</span>
								<span class="dates">${t("statements.header", {
									close: displayDate(statement.closeDate, getLocale()),
									due: displayDate(statement.dueDate, getLocale()),
								})}</span>
							</div>
							<div class="statement-actions" row>
								${
									statement.paid && statement.payment
										? html`<small>${t("statements.paid", { date: displayDate(statement.payment.paidAt, getLocale()) })}</small>
											<button data-action="unmark-paid" data-variant="quiet"
												@click=${() =>
													this.emit("unmark-paid", {
														cardId: statement.cardId,
														period: statement.period,
													})}>${t("statements.unmark")}</button>`
										: html`<button data-action="mark-paid"
											@click=${() =>
												this.emit("mark-paid", {
													cardId: statement.cardId,
													period: statement.period,
												})}>${t("statements.markPaid")}</button>`
								}
							</div>
						</header>

						${
							statement.purchases.length === 0
								? html`<p><small>${t("statements.noPurchases")}</small></p>`
								: html`
									<table>
										<tbody>
											${statement.purchases.map(
												(purchase) => html`
													<tr>
														<td>${displayDate(purchase.date, getLocale())}</td>
														<td>${purchase.note}</td>
														<td data-numeric>${formatAmount(purchase.amount)}</td>
														<td>
															<button data-action="delete-purchase" data-variant="danger"
																@click=${() =>
																	this.emit("delete-purchase", {
																		cardId: purchase.cardId,
																		purchaseId: purchase.id,
																	})}>${t("common.delete")}</button>
														</td>
													</tr>
												`,
											)}
										</tbody>
									</table>
								`
						}

						<footer><strong>${t("statements.total", { amount: formatAmount(statement.total) })}</strong></footer>
					</article>
				`,
			)}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-statement-list": CcStatementList;
	}
}
