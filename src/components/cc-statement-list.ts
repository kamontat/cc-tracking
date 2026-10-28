import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { compareDates, displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { partsOf } from "#lib/domain/payment";
import { urgencyOf } from "#lib/domain/statement";
import type { PlainDate, Statement } from "#lib/domain/types";

import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { badge, base, controls, dataTable, panel } from "#styles/shared";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
	static override styles = [
		base,
		controls,
		panel,
		dataTable,
		badge,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			/*
			 * Tighter than the shared panel: a card's history is a dozen of these stacked,
			 * most of them a single collapsed line, so panel-sized padding spends more height
			 * on the gaps than on the months themselves.
			 */
			article {
				gap: var(--cc-space-2);
				padding: var(--cc-space-2) var(--cc-space-3);
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

			/* The statement today's spending lands on, ruled in the accent so it is found at a glance. */
			article[data-current] {
				border-left: var(--cc-space-1) solid var(--cc-accent);
			}

			article[data-current] .badge {
				color: var(--cc-accent);
				border-color: var(--cc-accent);
			}

			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
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

			/* Months with nothing in them: a line of text between panels, not a panel of its own. */
			.quiet {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
				border-left: var(--cc-border-width) dashed var(--cc-border);
			}

			/*
			 * In step with the tighter panel above. Centred, not top-aligned: a row carries
			 * buttons, and a button is taller than a line of text, so top alignment leaves the
			 * date, note and amount riding high beside them.
			 */
			td {
				padding: var(--cc-space-2);
				vertical-align: middle;
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

			/*
			 * Edit and delete side by side as one flex row, so they line up with each other
			 * rather than with the text baseline, and never wrap under each other.
			 */
			.purchase-actions .actions {
				gap: var(--cc-space-2);
				align-items: center;
			}

			.purchase-actions button {
				align-self: auto;
			}
		`,
	];

	@property({ attribute: false }) statements: Statement[] = [];
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: string, detail: Record<string, string | number>) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	override render() {
		if (this.statements.length === 0) {
			return html`<p>${t("statements.empty")}</p>`;
		}
		return html`${this.segments().map((segment) =>
			Array.isArray(segment)
				? this.quietLine(segment)
				: this.statement(segment),
		)}`;
	}

	/**
	 * Statements in order, with each run of quiet ones -- closed, nothing spent, nothing paid --
	 * gathered into an array. A year of an unused card is otherwise a dozen identical panels
	 * saying ฿0.00, burying the one month that has anything on it. The open period stays whole
	 * even when empty (it is where the next purchase lands), and so does a paid one (its payment
	 * can still be undone).
	 */
	private segments(): (Statement | Statement[])[] {
		const segments: (Statement | Statement[])[] = [];
		for (const statement of this.statements) {
			const quiet =
				statement.purchases.length === 0 &&
				statement.payment === null &&
				urgencyOf(statement, this.today) !== "future";
			const last = segments.at(-1);
			if (!quiet) segments.push(statement);
			else if (Array.isArray(last)) last.push(statement);
			else segments.push([statement]);
		}
		return segments;
	}

	private quietLine(run: Statement[]) {
		// Statements arrive newest first; the range reads oldest to newest.
		const newest = run[0]?.period ?? "";
		const oldest = run.at(-1)?.period ?? "";
		return html`<p class="quiet">${
			run.length === 1
				? t("statements.quietOne", { period: newest })
				: t("statements.quietRun", { from: oldest, to: newest })
		}</p>`;
	}

	/**
	 * The statement a purchase made today lands on: the earliest one not yet closed. Later ones
	 * exist only when a purchase is dated ahead, and are not current.
	 */
	private get currentPeriod(): string | null {
		let current: Statement | null = null;
		for (const statement of this.statements) {
			if (compareDates(this.today, statement.closeDate) > 0) continue;
			if (!current || compareDates(statement.closeDate, current.closeDate) < 0)
				current = statement;
		}
		return current?.period ?? null;
	}

	private statement(statement: Statement) {
		const urgency = urgencyOf(statement, this.today);
		const current = statement.period === this.currentPeriod;
		return html`
					<article data-urgency=${urgency} ?data-current=${current}>
						<details ?open=${statement.purchases.length > 0}>
							<summary>
								<div class="summary-line" row>
									<span class="period">${statement.period}</span>
									${current ? html`<span class="badge">${t("statements.current")}</span>` : nothing}
									<span class="dates">${t("statements.header", {
										close: displayDate(statement.closeDate, getLocale()),
										due: displayDate(statement.dueDate, getLocale()),
									})}</span>
									${
										statement.paid && statement.payment
											? html`<small>${t("statements.paid", { date: displayDate(statement.payment.paidAt, getLocale()) })}</small>`
											: statement.paidAmount > 0
												? html`<small>${t("statements.partlyPaid", {
														paid: formatAmount(statement.paidAmount),
														left: formatAmount(statement.remaining),
													})}</small>`
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
															<td class="purchase-actions"><div class="actions" row>
																<button data-action="edit-purchase" data-variant="quiet"
																	@click=${() =>
																		this.emit("edit-purchase", {
																			cardId: purchase.cardId,
																			purchaseId: purchase.id,
																		})}>${t("common.edit")}</button>
																<button data-action="delete-purchase" data-variant="danger"
																	@click=${() =>
																		this.emit("delete-purchase", {
																			cardId: purchase.cardId,
																			purchaseId: purchase.id,
																		})}>${t("common.delete")}</button>
															</div></td>
														</tr>
													`,
												)}
											</tbody>
										</table>
									`
							}

							${partsOf(statement.payment, statement.total).map(
								(part, index) => html`
									<div class="payment statement-actions" row>
										<small>${t("statements.part", {
											amount: formatAmount(part.amount),
											date: displayDate(part.paidAt, getLocale()),
										})}</small>
										<button data-action="unmark-paid" data-variant="quiet"
											@click=${() =>
												this.emit("unmark-paid", {
													cardId: statement.cardId,
													period: statement.period,
													index,
												})}>${t("statements.unmark")}</button>
									</div>
								`,
							)}

							<div class="statement-actions" row>
								${
									statement.paid
										? nothing
										: urgency === "future"
											? html`<small>${t("due.stillOpen")}</small>`
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
				`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-statement-list": CcStatementList;
	}
}
