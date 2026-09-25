import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
	filterChip,
	isDefault,
	listSummary,
	searchBox,
	sortChip,
	sortHeader,
} from "#components/list-controls";
import {
	applyCardView,
	byOwnerThenName,
	type CardSort,
	type CardView,
	DEFAULT_CARD_VIEW,
	UNASSIGNED,
} from "#lib/domain/list-view";
import { LOCATIONS, toLocation } from "#lib/domain/location";
import { cardOwnerOf, groupLabel, OWNERS, toOwner } from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { badge, base, controls, dataTable, listControls } from "#styles/shared";

/** What the narrow layout's sort chip calls each sort; the wide one uses the headings. */
const SORT_LABELS: Record<Exclude<CardSort, "default">, MessageKey> = {
	name: "cards.sort.name",
	location: "cards.column.location",
	group: "cards.column.limitGroup",
	closeDay: "cards.sort.closeDay",
};

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		badge,
		listControls,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

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

			/* A section beneath the main list, not a peer of it: quieter, and ruled off. */
			details.archived-list {
				padding-top: var(--cc-space-3);
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			details.archived-list > summary {
				font-size: var(--cc-text-md);
				color: var(--cc-text-muted);
			}

			details.archived-list tr {
				color: var(--cc-text-muted);
			}

			.card-name {
				font-weight: 600;
			}

			.name-line {
				display: inline-flex;
				flex-wrap: wrap;
				gap: var(--cc-space-1) var(--cc-space-2);
				align-items: center;
			}

			.meta {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.meta .card-id {
				font-family: var(--cc-font-mono);
			}

			.comment {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				font-style: italic;
			}

			.owner {
				display: block;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			/* The widest column's content is prose already broken into lines; let it take the slack. */
			td.card {
				width: 100%;
			}

			/* A cycle is one phrase; broken mid-way it reads as two facts. Stacked rows get the
			   full width, so this only matters on the wide layout. */
			@media (min-width: 640px) {
				th,
				td.cycle,
				td.location,
				td.group {
					white-space: nowrap;
				}
			}

			/*
			 * Stacked, every cell becomes a label-and-value row. The card cell has no label: its
			 * name, details and comment are lines of one block and stay stacked, and the group's
			 * name and owner stay together at the value end rather than being spread apart.
			 */
			@media (max-width: 639px) {
				td.card {
					flex-direction: column;
					align-items: flex-start;
					gap: 0;
				}

				.group-value {
					text-align: right;
				}
			}

			/* Start-aligned, so Edit and Archive sit in the same place on every row and Delete,
			   when a row has one, trails after them rather than shoving them sideways. */
			.actions {
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) purchaseCounts: Record<string, number> = {};
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Which cards to list and in what order. The table only asks for changes; see `view-change`. */
	@property({ attribute: false }) view: CardView = DEFAULT_CARD_VIEW;

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: "edit" | "archive" | "remove", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	private change(patch: Partial<CardView>) {
		this.dispatchEvent(
			new CustomEvent<CardView>("view-change", {
				detail: { ...this.view, ...patch },
			}),
		);
	}

	override render() {
		const visible = applyCardView(this.cards, this.groups, this.view);
		const active = visible.filter((card) => !card.archived);
		const archived = visible.filter((card) => card.archived);
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed, nor close one they opened.
		return html`
			<details class="active" open>
				<summary>${t("cards.list")}</summary>
				${
					this.cards.length === 0
						? html`<p>${t("cards.empty")}</p>`
						: html`
							${this.toolbar(visible.length)}
							${
								visible.length === 0
									? html`<p>${t("cards.noMatch")}</p>`
									: active.length > 0
										? this.table(active)
										: nothing
							}
						`
				}
			</details>
			${
				archived.length > 0
					? html`
						<details class="archived-list">
							<summary>${t("cards.archivedList", { count: archived.length })}</summary>
							${this.table(archived)}
						</details>
					`
					: nothing
			}
		`;
	}

	private toolbar(shown: number) {
		const view = this.view;
		const groups = [...this.groups].sort(byOwnerThenName);
		return html`
			<div class="toolbar" row>
				${searchBox(view.q, t("cards.searchPlaceholder"), (q) => this.change({ q }))}
				${filterChip(
					"owner",
					t("cards.owner"),
					view.owner,
					OWNERS.map((owner) => ({ value: owner, text: owner })),
					(value) => this.change({ owner: toOwner(value) ?? "" }),
				)}
				${filterChip(
					"location",
					t("cards.column.location"),
					view.location,
					LOCATIONS.map((location) => ({
						value: location,
						text: locationText(location),
					})),
					(value) => this.change({ location: toLocation(value) ?? "" }),
				)}
				${filterChip(
					"group",
					t("cards.column.limitGroup"),
					view.group,
					[
						{ value: UNASSIGNED, text: t("cards.unassigned") },
						...groups.map((group) => ({
							value: group.id,
							text: groupLabel(group),
						})),
					],
					(group) => this.change({ group }),
				)}
				${sortChip(view, SORT_LABELS, (next) => this.change(next))}
				${listSummary(
					!isDefault(view, DEFAULT_CARD_VIEW),
					t("cards.count", { shown, total: this.cards.length }),
					() => this.change(DEFAULT_CARD_VIEW),
				)}
			</div>
		`;
	}

	private table(cards: Card[]) {
		const sort = (label: MessageKey, key: CardView["sort"]) =>
			sortHeader(t(label), key, this.view, (next) => this.change(next));
		return html`
			<table>
				<thead>
					<tr>
						${sort("cards.column.card", "name")}
						${sort("cards.column.location", "location")}
						${sort("cards.column.limitGroup", "group")}
						${sort("cards.column.cycle", "closeDay")}
						<th></th>
					</tr>
				</thead>
				<tbody>
					${cards.map((card) => this.row(card))}
				</tbody>
			</table>
		`;
	}

	private row(card: Card) {
		const count = this.purchaseCounts[card.id] ?? 0;
		const group =
			this.groups.find(({ id }) => id === card.limitGroupId) ?? null;
		const owner = cardOwnerOf(card, group);
		const meta = [
			html`<span class="card-id">${card.id}</span>`,
			html`••••${card.last4}`,
			...(count > 0
				? [
						count === 1
							? t("cards.purchaseCountOne")
							: t("cards.purchaseCount", { count }),
					]
				: []),
		];
		return html`
			<tr>
				<td class="card">
					<span class="name-line">
						<a class="card-name" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
						${card.archived ? html`<span class="badge archived">${t("cards.archived")}</span>` : nothing}
						${
							card.supplementary
								? html`<span class="badge supplementary">${t("form.supplementary")}</span>`
								: nothing
						}
					</span>
					<div class="meta" block>${meta.map((part, index) => html`${index > 0 ? " · " : ""}${part}`)}</div>
					${card.comment ? html`<div class="comment">${card.comment}</div>` : nothing}
				</td>
				<td class="location" data-label=${t("cards.column.location")}>${locationText(card.location)}</td>
				<td class="group" data-label=${t("cards.column.limitGroup")}>
					<span class="group-value">
						<span data-field="limit-group">${group ? groupLabel(group) : t("cards.unassigned")}</span>
						${owner ? html`<span class="owner">${t("cards.owner")} <span data-field="owner">${owner}</span></span>` : nothing}
					</span>
				</td>
				<td class="cycle" data-label=${t("cards.column.cycle")}>${describeCycleText(card.cycle)}</td>
				<td>
					<div class="actions" row>
						<button data-variant="quiet" @click=${() => this.emit("edit", card.id)}>${t("common.edit")}</button>
						<button data-variant="quiet" @click=${() => this.emit("archive", card.id)}>
							${card.archived ? t("cards.unarchive") : t("cards.archive")}
						</button>
						${
							count === 0
								? html`<button data-variant="danger"
									@click=${() => this.emit("remove", card.id)}>${t("common.delete")}</button>`
								: nothing
						}
					</div>
				</td>
			</tr>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-table": CcCardTable;
	}
}
