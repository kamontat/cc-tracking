import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date.ts";
import { formatAmount } from "#lib/domain/money.ts";
import { urgencyOf } from "#lib/domain/statement.ts";
import type { PlainDate, Statement } from "#lib/domain/types.ts";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
	@property({ attribute: false }) statements: Statement[] = [];
	@property() today: PlainDate = "";

	private emit(name: string, detail: Record<string, string>) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	override render() {
		if (this.statements.length === 0) {
			return html`<p>No statements yet. Add a purchase from the dashboard.</p>`;
		}
		return html`
			${this.statements.map(
				(statement) => html`
					<article data-urgency=${urgencyOf(statement, this.today)}>
						<header>
							<strong>${statement.period}</strong>
							— closes ${displayDate(statement.closeDate)},
							due ${displayDate(statement.dueDate)}
							<br />
							${
								statement.paid && statement.payment
									? html`<small>Paid ${displayDate(statement.payment.paidAt)}</small>
										<button data-action="unmark-paid" class="secondary"
											@click=${() =>
												this.emit("unmark-paid", {
													cardId: statement.cardId,
													period: statement.period,
												})}>Unmark</button>`
									: html`<button data-action="mark-paid"
										@click=${() =>
											this.emit("mark-paid", {
												cardId: statement.cardId,
												period: statement.period,
											})}>Mark paid</button>`
							}
						</header>

						${
							statement.purchases.length === 0
								? html`<p><small>No purchases in this period.</small></p>`
								: html`
									<table>
										<tbody>
											${statement.purchases.map(
												(purchase) => html`
													<tr>
														<td>${displayDate(purchase.date)}</td>
														<td>${purchase.note}</td>
														<td>${formatAmount(purchase.amount)}</td>
														<td>
															<button data-action="delete-purchase" class="secondary outline"
																@click=${() =>
																	this.emit("delete-purchase", {
																		cardId: purchase.cardId,
																		purchaseId: purchase.id,
																	})}>Delete</button>
														</td>
													</tr>
												`,
											)}
										</tbody>
									</table>
								`
						}

						<footer><strong>Total ${formatAmount(statement.total)}</strong></footer>
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
