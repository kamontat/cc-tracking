import { css, html, LitElement, nothing } from "lit";
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

			/* Tinted, not just ruled -- the same louder treatment the dashboard gives an
			   overdue row, so the two pages agree on what "late" looks like. */
			article[data-urgency="overdue"] {
				border: var(--cc-border-width) solid var(--cc-urgency-overdue);
				border-left: var(--cc-space-2) solid var(--cc-urgency-overdue);
				background: var(--cc-danger-surface);
			}

			article[data-urgency="soon"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-soon);
			}

			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				cursor: pointer;
			}

			/*
			 * A summary is a list-item box, so its content only sits on the marker's line while
			 * it stays inline-level -- an inner block would drop below the triangle.
			 */
			.summary-line {
				display: inline-flex;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
				align-items: baseline;
				width: calc(100% - var(--cc-space-5));
			}

			.period {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.dates {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			/* Pushed to the end of the line, so every month's total reads down one column. */
			.total {
				margin-left: auto;
				font-variant-numeric: tabular-nums;
			}

			.statement-actions {
				gap: var(--cc-space-2);
				align-items: center;
			}

			/*
			 * The note takes every spare pixel, so the date, amount and delete
			 * columns sit at the same width in every panel. Left to itself an auto
			 * table shares the slack out, and a panel of short notes drifts its
			 * amounts left of the panel above it.
			 */
			.note {
				width: 100%;
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
						<details ?open=${statement.purchases.length > 0}>
							<summary>
								<div class="summary-line" row>
									<span class="period">${statement.period}</span>
									<span class="dates">${t("statements.header", {
										close: displayDate(statement.closeDate, getLocale()),
										due: displayDate(statement.dueDate, getLocale()),
									})}</span>
									${
										statement.paid && statement.payment
											? html`<small>${t("statements.paid", { date: displayDate(statement.payment.paidAt, getLocale()) })}</small>`
											: nothing
									}
									<strong class="total">${t("statements.total", { amount: formatAmount(statement.total) })}</strong>
								</div>
							</summary>

							${
								statement.purchases.length === 0
									? html`<p><small>${t("statements.noPurchases")}</small></p>`
									: html`
										<table>
											<tbody>
												${statement.purchases.map(
													(purchase) => html`
														<tr>
															<td class="date">${displayDate(purchase.date, getLocale())}</td>
															<td class="note">${purchase.note}</td>
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

							<div class="statement-actions" row>
								${
									statement.paid
										? html`<button data-action="unmark-paid" data-variant="quiet"
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
						</details>
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
