import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
	filterChip,
	isDefault,
	listSummary,
	searchBox,
	sortChip,
	sortHeader,
} from "#components/list-controls";
import { usageLevel, usageShare } from "#lib/domain/limit";
import {
	applyGroupView,
	DEFAULT_GROUP_VIEW,
	type GroupSort,
	type GroupView,
} from "#lib/domain/list-view";
import { formatAmount } from "#lib/domain/money";
import { OWNERS, ownerOf, toOwner } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import {
	base,
	controls,
	dataTable,
	listControls,
	usageBar,
} from "#styles/shared";

/** Each sort is named for the column heading that sets it, on every layout. */
const SORT_LABELS: Record<Exclude<GroupSort, "default">, MessageKey> = {
	name: "limits.column.name",
	owner: "limits.column.owner",
	limit: "limits.column.limit",
	cards: "limits.column.cards",
	used: "limits.column.used",
	available: "limits.column.available",
};

@customElement("cc-limit-group-table")
export class CcLimitGroupTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		usageBar,
		listControls,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}

			.actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			td[data-state="over"] {
				font-weight: 600;
				color: var(--cc-danger);
			}

			/* The amount, then its bar beneath it at the amount's own width. */
			.available {
				display: inline-flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				align-items: stretch;
			}

			@media (min-width: 640px) {
				.actions {
					flex-wrap: nowrap;
				}

				.actions small {
					white-space: nowrap;
				}
			}
		`,
	];

	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Satang already spent against each group id, from `groupUsage`. */
	@property({ attribute: false }) usage: Record<string, number> = {};
	/** How many cards point at each group id. */
	@property({ attribute: false }) counts: Record<string, number> = {};
	/** Which groups to list and in what order. The table only asks for changes; see `view-change`. */
	@property({ attribute: false }) view: GroupView = DEFAULT_GROUP_VIEW;

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: "edit-group" | "remove-group", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	private change(patch: Partial<GroupView>) {
		this.dispatchEvent(
			new CustomEvent<GroupView>("view-change", {
				detail: { ...this.view, ...patch },
			}),
		);
	}

	override render() {
		const visible = applyGroupView(
			this.groups,
			this.usage,
			this.view,
			this.counts,
		);
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed.
		return html`
			<details open>
				<summary>${t("limits.title")}</summary>
				${
					this.groups.length === 0
						? html`<p>${t("limits.empty")}</p>`
						: html`
							${this.toolbar(visible.length)}
							${
								visible.length === 0
									? html`<p>${t("limits.noMatch")}</p>`
									: this.table(visible)
							}
						`
				}
			</details>
		`;
	}

	private toolbar(shown: number) {
		const view = this.view;
		return html`
			<div class="toolbar" row>
				${searchBox(view.q, t("limits.searchPlaceholder"), (q) => this.change({ q }))}
				${filterChip(
					"owner",
					t("limits.column.owner"),
					view.owner,
					OWNERS.map((owner) => ({ value: owner, text: owner })),
					(value) => this.change({ owner: toOwner(value) ?? "" }),
				)}
				${sortChip(view, SORT_LABELS, (next) => this.change(next))}
				${listSummary(
					!isDefault(view, DEFAULT_GROUP_VIEW),
					t("limits.count", { shown, total: this.groups.length }),
					() => this.change(DEFAULT_GROUP_VIEW),
				)}
			</div>
		`;
	}

	private table(groups: LimitGroup[]) {
		const sort = (key: Exclude<GroupSort, "default">, numeric = false) =>
			sortHeader(
				t(SORT_LABELS[key]),
				key,
				this.view,
				(next) => this.change(next),
				numeric,
			);
		return html`
			<table>
				<thead>
					<tr>
						${sort("name")}
						${sort("owner")}
						${sort("limit", true)}
						${sort("cards", true)}
						${sort("used", true)}
						${sort("available", true)}
						<th></th>
					</tr>
				</thead>
				<tbody>
					${groups.map((group) => this.row(group))}
				</tbody>
			</table>
		`;
	}

	private row(group: LimitGroup) {
		const used = this.usage[group.id] ?? 0;
		const available = group.limit - used;
		const count = this.counts[group.id] ?? 0;
		const share = usageShare(used, group.limit);
		return html`
			<tr>
				<td data-label=${t("limits.column.name")}>${group.name}</td>
				<td data-field="owner" data-label=${t("limits.column.owner")}>${ownerOf(group)}</td>
				<td data-label=${t("limits.column.limit")} data-numeric>${formatAmount(group.limit)}</td>
				<td data-label=${t("limits.column.cards")} data-numeric>${count}</td>
				<td data-label=${t("limits.column.used")} data-numeric>${formatAmount(used)}</td>
				<td data-label=${t("limits.column.available")} data-numeric
					data-state=${available < 0 ? "over" : "within"}>
					<span class="available">
						${formatAmount(available)}
						<span class="usage" data-level=${usageLevel(used, group.limit)}
							title=${t("limits.usage", { share })}><span style=${`inline-size: ${share}%`}></span></span>
					</span>
				</td>
				<td>
					<div class="actions" row>
						<button type="button" data-variant="quiet" data-action="edit" data-id=${group.id}
							@click=${() => this.emit("edit-group", group.id)}>${t("common.edit")}</button>
						${
							count === 0
								? html`<button type="button" data-variant="danger" data-action="remove" data-id=${group.id}
									@click=${() => this.emit("remove-group", group.id)}>${t("common.delete")}</button>`
								: html`<small>${
										count === 1
											? t("limits.inUseOne")
											: t("limits.inUse", { count })
									}</small>`
						}
					</div>
				</td>
			</tr>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-group-table": CcLimitGroupTable;
	}
}
