import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { daysBetween, displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { Card, PlainDate, Statement } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";

export type DueRow = { card: Card; statement: Statement };

@customElement("cc-due-list")
export class CcDueList extends LitElement {
	static override styles = css`
		table { width: 100%; border-collapse: collapse; }
		td, th { padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left; }
		[data-urgency="overdue"] { border-left: 4px solid #b3261e; }
		[data-urgency="soon"] { border-left: 4px solid #b26a00; }
		[data-urgency="open"], [data-urgency="future"] { border-left: 4px solid transparent; }
		small { color: #666; }
	`;

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
					<tr><th>${t("due.column.card")}</th><th>${t("due.column.where")}</th><th>${t("due.column.closes")}</th><th>${t("due.column.due")}</th><th>${t("due.column.total")}</th><th></th></tr>
				</thead>
				<tbody>
					${sorted.map(({ card, statement }) => {
						const urgency = urgencyOf(statement, this.today);
						return html`
							<tr data-urgency=${urgency}>
								<td>
									<a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
									<br /><small>••••${card.last4}</small>
								</td>
								<td>${locationText(card.location)}</td>
								<td>${displayDate(statement.closeDate, getLocale())}</td>
								<td>${displayDate(statement.dueDate, getLocale())}<br /><small>${this.when(statement)}</small></td>
								<td>${formatAmount(statement.total)}</td>
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
