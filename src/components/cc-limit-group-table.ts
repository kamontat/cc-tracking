import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { usageLevel, usageShare } from "#lib/domain/limit";
import {
	applyGroupView,
	DEFAULT_GROUP_VIEW,
	GROUP_SORTS,
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
	listToolbar,
	usageBar,
} from "#styles/shared";

const SORT_LABELS: Record<GroupSort, MessageKey> = {
	default: "list.sortDefault",
	name: "limits.column.name",
	limit: "limits.column.limit",
	used: "limits.column.used",
	available: "limits.column.available",
};

const sameView = (a: GroupView, b: GroupView) =>
	(Object.keys(a) as (keyof GroupView)[]).every((key) => a[key] === b[key]);

@customElement("cc-limit-group-table")
export class CcLimitGroupTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		usageBar,
		listToolbar,
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
		const visible = applyGroupView(this.groups, this.usage, this.view);
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed.
		return html`
			<details open>
				<summary>${t("limits.title")}</summary>
				${
					this.groups.length === 0
						? html`<p>${t("limits.empty")}</p>`
						: html`
							${this.toolbar()}
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

	/** Options mark themselves `.selected`, for the reason `cc-card-table`'s toolbar gives. */
	private toolbar() {
		const view = this.view;
		const read = (event: Event) =>
			(event.target as HTMLInputElement | HTMLSelectElement).value;
		return html`
			<div class="toolbar" row>
				<label class="search">
					${t("list.search")}
					<input type="search" name="q" .value=${view.q}
						placeholder=${t("limits.searchPlaceholder")}
						@input=${(event: Event) => this.change({ q: read(event) })} />
				</label>
				<label>
					${t("limits.column.owner")}
					<select name="owner"
						@change=${(event: Event) => this.change({ owner: toOwner(read(event)) ?? "" })}>
						<option value="" .selected=${view.owner === ""}>${t("list.anyOwner")}</option>
						${OWNERS.map(
							(owner) =>
								html`<option value=${owner} .selected=${view.owner === owner}>${owner}</option>`,
						)}
					</select>
				</label>
				<label>
					${t("list.sort")}
					<select name="sort"
						@change=${(event: Event) => {
							const value = read(event);
							const sort = GROUP_SORTS.find((one) => one === value);
							if (sort) this.change({ sort });
						}}>
						${GROUP_SORTS.map(
							(sort) =>
								html`<option value=${sort} .selected=${view.sort === sort}>${t(SORT_LABELS[sort])}</option>`,
						)}
					</select>
				</label>
				<div class="toolbar-actions" row>
					<button type="button" data-variant="quiet" data-action="direction"
						?disabled=${view.sort === "default"}
						@click=${() => this.change({ dir: view.dir === "asc" ? "desc" : "asc" })}>
						${view.dir === "asc" ? `↑ ${t("list.ascending")}` : `↓ ${t("list.descending")}`}
					</button>
					${
						sameView(view, DEFAULT_GROUP_VIEW)
							? nothing
							: html`<button type="button" data-variant="quiet" data-action="clear"
								@click=${() => this.change(DEFAULT_GROUP_VIEW)}>${t("list.clear")}</button>`
					}
				</div>
			</div>
		`;
	}

	private table(groups: LimitGroup[]) {
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("limits.column.name")}</th>
						<th>${t("limits.column.owner")}</th>
						<th data-numeric>${t("limits.column.limit")}</th>
						<th data-numeric>${t("limits.column.cards")}</th>
						<th data-numeric>${t("limits.column.used")}</th>
						<th data-numeric>${t("limits.column.available")}</th>
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
