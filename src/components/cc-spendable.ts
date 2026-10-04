import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sortChip, sortHeader } from "#components/list-controls";
import { displayDate } from "#lib/domain/date";
import type { SpendRow } from "#lib/domain/limit";
import {
	applySpendView,
	DEFAULT_SPEND_VIEW,
	nextPanelSort,
	type PanelView,
	type SpendSort,
} from "#lib/domain/list-view";
import { formatAmount } from "#lib/domain/money";
import type { PlainDate } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { relativeDayText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { base, controls, dataTable, listControls } from "#styles/shared";

/** What the narrow layout's sort chip calls each sort; the wide one uses the headings. */
const SORT_LABELS: Record<SpendSort, MessageKey> = {
	card: "spendable.column.card",
	available: "spendable.column.available",
	closes: "spendable.column.closes",
	due: "spendable.column.due",
};

@customElement("cc-spendable")
export class CcSpendable extends LitElement {
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
	/** The reader's chosen order. Lives only as long as the page; a reload starts closes first. */
	@state() private view: PanelView<SpendSort> = DEFAULT_SPEND_VIEW;

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
			return html`<p>${t("spendable.empty")}</p>${this.notice()}`;
		}
		const onSort = (view: PanelView<SpendSort>) => {
			this.view = view;
		};
		const sort = (key: SpendSort, numeric = false) =>
			sortHeader(
				t(SORT_LABELS[key]),
				key,
				this.view,
				onSort,
				numeric,
				(view, next) => nextPanelSort(view, next, DEFAULT_SPEND_VIEW),
			);
		return html`
			<div class="toolbar" row>
				${sortChip(this.view, SORT_LABELS, onSort, DEFAULT_SPEND_VIEW)}
			</div>
			<table>
				<thead>
					<tr>
						${sort("card")}
						${sort("available", true)}
						${sort("closes")}
						${sort("due")}
					</tr>
				</thead>
				<tbody>
					${applySpendView(this.rows, this.view).map(
						(row) => html`
							<tr data-shared=${row.sharedWith > 0 ? "true" : "false"}>
								<td data-label=${t("spendable.column.card")}>
									<span class="card-line"><small class="card-id">${row.card.id})</small> <a class="card-name" href=${`/card?id=${encodeURIComponent(row.card.id)}`}>${row.card.name}</a></span>
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
