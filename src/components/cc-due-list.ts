import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { daysBetween, displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { Card, PlainDate, Statement } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

export type DueRow = { card: Card; statement: Statement };

@customElement("cc-due-list")
export class CcDueList extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			tbody tr {
				border-left: var(--cc-space-1) solid transparent;
			}

			tbody tr[data-urgency="overdue"] {
				border-left-color: var(--cc-urgency-overdue);
			}

			tbody tr[data-urgency="soon"] {
				border-left-color: var(--cc-urgency-soon);
			}

			.badge {
				display: inline-block;
				padding: 0 var(--cc-space-1);
				font-size: var(--cc-text-xs);
				font-weight: 600;
				border-radius: var(--cc-radius-sm);
				color: var(--cc-text-muted);
			}

			[data-urgency="overdue"] .badge {
				color: var(--cc-urgency-overdue);
				background: var(--cc-danger-surface);
			}

			[data-urgency="soon"] .badge {
				color: var(--cc-urgency-soon);
			}

			.card-name {
				font-weight: 600;
			}

			td[data-label="Card"] {
				flex-direction: column;
				align-items: flex-start;
			}
		`,
	];

	@property({ attribute: false }) rows: DueRow[] = [];
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private when(statement: Statement): string {
		const remaining = daysBetween(this.today, statement.dueDate);
		if (remaining < 0) return t("due.overdue", { days: Math.abs(remaining) });
		if (remaining === 0) return t("due.today");
		return t("due.inDays", { days: remaining });
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<p>${t("due.empty")} <a href="/cards">${t("due.emptyAction")}</a></p>`;
		}
		const sorted = [...this.rows].sort((a, b) =>
			a.statement.dueDate < b.statement.dueDate
				? -1
				: a.statement.dueDate > b.statement.dueDate
					? 1
					: 0,
		);
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("due.column.card")}</th>
						<th>${t("due.column.where")}</th>
						<th>${t("due.column.closes")}</th>
						<th>${t("due.column.due")}</th>
						<th data-numeric>${t("due.column.total")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${sorted.map(({ card, statement }) => {
						const urgency = urgencyOf(statement, this.today);
						return html`
							<tr data-urgency=${urgency}>
								<td data-label=${t("due.column.card")}>
									<a class="card-name" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
									<small>••••${card.last4}</small>
								</td>
								<td data-label=${t("due.column.where")}>${locationText(card.location)}</td>
								<td data-label=${t("due.column.closes")}>${displayDate(statement.closeDate, getLocale())}</td>
								<td data-label=${t("due.column.due")}>
									${displayDate(statement.dueDate, getLocale())}
									<span class="badge">${this.when(statement)}</span>
								</td>
								<td data-label=${t("due.column.total")} data-numeric>${formatAmount(statement.total)}</td>
								<td>
									${
										urgency === "future"
											? html`<small>${t("due.stillOpen")}</small>`
											: html`<button @click=${() =>
													this.dispatchEvent(
														new CustomEvent("mark-paid", {
															detail: {
																cardId: card.id,
																period: statement.period,
															},
														}),
													)}>${t("due.markPaid")}</button>`
									}
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-due-list": CcDueList;
	}
}
