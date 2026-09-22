import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { PlainDate, Statement } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
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
							<strong>${statement.period}</strong>
							—
							${t("statements.header", {
								close: displayDate(statement.closeDate, getLocale()),
								due: displayDate(statement.dueDate, getLocale()),
							})}
							<br />
							${
								statement.paid && statement.payment
									? html`<small>${t("statements.paid", { date: displayDate(statement.payment.paidAt, getLocale()) })}</small>
										<button data-action="unmark-paid" class="secondary"
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
														<td>${formatAmount(purchase.amount)}</td>
														<td>
															<button data-action="delete-purchase" class="secondary outline"
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
