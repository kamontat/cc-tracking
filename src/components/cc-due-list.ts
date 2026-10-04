import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sortChip, sortHeader } from "#components/list-controls";
import { daysBetween, displayDate } from "#lib/domain/date";
import {
	applyDueView,
	DEFAULT_DUE_VIEW,
	type DueRow,
	type DueSort,
	nextPanelSort,
	type PanelView,
} from "#lib/domain/list-view";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { PlainDate, Statement } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { base, controls, dataTable, listControls } from "#styles/shared";

export type { DueRow };

/** What the narrow layout's sort chip calls each sort; the wide one uses the headings. */
const SORT_LABELS: Record<DueSort, MessageKey> = {
	card: "due.column.card",
	location: "due.column.where",
	closes: "due.column.closes",
	due: "due.column.due",
	total: "due.column.total",
};

@customElement("cc-due-list")
export class CcDueList extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		listControls,
		css`
			/* Only the sort chip lives here, and it only shows once stacked. */
			@media (max-width: 639px) {
				.toolbar {
					margin-block-end: var(--cc-space-3);
				}
			}

			tbody tr {
				border-left: var(--cc-space-1) solid transparent;
			}

			/*
			 * Overdue is the one state worth interrupting someone for, so it gets more than a
			 * rule down the side: the whole row is tinted, its due date takes the danger colour,
			 * and its badge is filled rather than tinted. "Soon" deliberately keeps the quieter
			 * treatment, or neither would stand out.
			 */
			tbody tr[data-urgency="overdue"] {
				border-left-color: var(--cc-urgency-overdue);
				border-left-width: var(--cc-space-2);
				background: var(--cc-danger-surface);
			}

			tbody tr[data-urgency="overdue"] .due-cell {
				font-weight: 600;
				color: var(--cc-urgency-overdue);
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
				color: var(--cc-surface);
				background: var(--cc-urgency-overdue);
			}

			[data-urgency="soon"] .badge {
				color: var(--cc-urgency-soon);
				background: var(--cc-warning-surface);
			}

			.card-line {
				display: block;
			}

			.card-name {
				font-weight: 600;
			}

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}

			td.card-cell > small {
				display: block;
			}

			/*
			 * Only once stacked. A flex cell stops being a table cell, and the
			 * column then draws its row rule at its own content height rather
			 * than the row's, leaving the separator broken in two.
			 */
			@media (max-width: 639px) {
				td.card-cell {
					display: flex;
					flex-direction: column;
					align-items: flex-start;
					gap: var(--cc-space-1);
				}
			}
		`,
	];

	@property({ attribute: false }) rows: DueRow[] = [];
	@property() today: PlainDate = "";
	/** The reader's chosen order. Lives only as long as the page; a reload starts closes first. */
	@state() private view: PanelView<DueSort> = DEFAULT_DUE_VIEW;

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
		const onSort = (view: PanelView<DueSort>) => {
			this.view = view;
		};
		const sort = (key: DueSort, numeric = false) =>
			sortHeader(
				t(SORT_LABELS[key]),
				key,
				this.view,
				onSort,
				numeric,
				(view, next) => nextPanelSort(view, next, DEFAULT_DUE_VIEW),
			);
		return html`
			<div class="toolbar" row>
				${sortChip(this.view, SORT_LABELS, onSort, DEFAULT_DUE_VIEW)}
			</div>
			<table>
				<thead>
					<tr>
						${sort("card")}
						${sort("location")}
						${sort("closes")}
						${sort("due")}
						${sort("total", true)}
						<th></th>
					</tr>
				</thead>
				<tbody>
					${applyDueView(this.rows, this.view).map(({ card, statement }) => {
						const urgency = urgencyOf(statement, this.today);
						return html`
							<tr data-urgency=${urgency}>
								<td class="card-cell" data-label=${t("due.column.card")}>
									<span class="card-line"><small class="card-id">${card.id})</small> <a class="card-name" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a></span>
								</td>
								<td data-label=${t("due.column.where")}>${locationText(card.location)}</td>
								<td class="date" data-label=${t("due.column.closes")}>${displayDate(statement.closeDate, getLocale())}</td>
								<td class="due-cell" data-label=${t("due.column.due")}>
									${displayDate(statement.dueDate, getLocale())}
									<span class="badge">${this.when(statement)}</span>
								</td>
								<td data-label=${t("due.column.total")} data-numeric>${formatAmount(statement.total)}</td>
								<td>
									${
										urgency === "future"
											? html`<small>${t("due.stillOpen")}</small>`
											: html`<button data-action="mark-paid" @click=${() =>
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
