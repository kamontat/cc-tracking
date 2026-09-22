import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { daysBetween, displayDate } from "#lib/domain/date";
import { locationLabel } from "#lib/domain/location";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { Card, PlainDate, Statement } from "#lib/domain/types";
import { getLocale } from "#lib/i18n/index";

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

	private when(statement: Statement): string {
		const remaining = daysBetween(this.today, statement.dueDate);
		if (remaining < 0) return `${Math.abs(remaining)} days overdue`;
		if (remaining === 0) return "due today";
		return `in ${remaining} days`;
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<p>No cards yet. Add one on the <a href="/cards">Cards</a> page.</p>`;
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
					<tr><th>Card</th><th>Where</th><th>Closes</th><th>Due</th><th>Total</th><th></th></tr>
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
								<td>${locationLabel(card.location)}</td>
								<td>${displayDate(statement.closeDate, getLocale())}</td>
								<td>${displayDate(statement.dueDate, getLocale())}<br /><small>${this.when(statement)}</small></td>
								<td>${formatAmount(statement.total)}</td>
								<td>
									${
										urgency === "future"
											? html`<small>still open</small>`
											: html`<button @click=${() =>
													this.dispatchEvent(
														new CustomEvent("mark-paid", {
															detail: {
																cardId: card.id,
																period: statement.period,
															},
														}),
													)}>Mark paid</button>`
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
