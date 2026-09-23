import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import type { SpendRow } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import type { PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { relativeDayText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { base, dataTable } from "#styles/shared";

@customElement("cc-spendable")
export class CcSpendable extends LitElement {
	static override styles = [
		base,
		dataTable,
		css`
			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.card-name {
				display: block;
				font-weight: 600;
			}

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}

			.group {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.limit {
				display: block;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			td[data-state="over"] {
				font-weight: 600;
				color: var(--cc-danger);
			}

			/*
			 * Deliberately quieter than cc-due-list's badge, which tints itself by urgency. This
			 * table answers "if I spend today, when does that bill land", so neither date is
			 * late yet and neither has anything to warn about.
			 */
			.badge {
				display: block;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			[data-testid="unassigned"] {
				margin-block-start: var(--cc-space-3);
				font-size: var(--cc-text-sm);
			}
		`,
	];

	@property({ attribute: false }) rows: SpendRow[] = [];
	/** How many unarchived cards point at no limit group. */
	@property({ type: Number }) unassigned = 0;
	/** Today in Asia/Bangkok. Empty means the caller gave none, and the badges stay off. */
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private relative(date: PlainDate) {
		if (!this.today) return nothing;
		return html`<small class="badge">${relativeDayText(this.today, date)}</small>`;
	}

	private notice() {
		if (this.unassigned === 0) return nothing;
		return html`
			<p data-testid="unassigned">
				${t("spendable.unassigned", { count: this.unassigned })}
				<a href="/cards">${t("spendable.unassignedAction")}</a>
			</p>
		`;
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<h2>${t("spendable.title")}</h2><p>${t("spendable.empty")}</p>${this.notice()}`;
		}
		return html`
			<h2>${t("spendable.title")}</h2>
			<table>
				<thead>
					<tr>
						<th>${t("spendable.column.card")}</th>
						<th data-numeric>${t("spendable.column.available")}</th>
						<th>${t("spendable.column.closes")}</th>
						<th>${t("spendable.column.due")}</th>
					</tr>
				</thead>
				<tbody>
					${this.rows.map(
						(row) => html`
							<tr data-shared=${row.sharedWith > 0 ? "true" : "false"}>
								<td data-label=${t("spendable.column.card")}>
									<a class="card-name" href=${`/card?id=${encodeURIComponent(row.card.id)}`}>${row.card.name}</a>
									<small class="card-id">${row.card.id}</small>
									${
										row.sharedWith > 0
											? html`<small class="group">${t("spendable.shared", {
													name: row.group.name,
													count: row.sharedWith,
												})}</small>`
											: nothing
									}
								</td>
								<td data-label=${t("spendable.column.available")} data-numeric
									data-state=${row.available < 0 ? "over" : "within"}>
									${formatAmount(row.available)}
									<small class="limit">${t("spendable.of", { limit: formatAmount(row.group.limit) })}</small>
								</td>
								<td class="date" data-field="closes" data-label=${t("spendable.column.closes")}>
									${displayDate(row.closeDate, getLocale())}${this.relative(row.closeDate)}
								</td>
								<td class="date" data-field="due" data-label=${t("spendable.column.due")}>
									${displayDate(row.dueDate, getLocale())}${this.relative(row.dueDate)}
								</td>
							</tr>
						`,
					)}
				</tbody>
			</table>
			${this.notice()}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-spendable": CcSpendable;
	}
}
