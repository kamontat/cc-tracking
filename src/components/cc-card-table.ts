import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ownerOf } from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { badge, base, controls, dataTable } from "#styles/shared";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		badge,
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

	constructor() {
		super();
		new LocaleController(this);
	}

	private emit(name: "edit" | "archive" | "remove", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	override render() {
		const active = this.cards.filter((card) => !card.archived);
		const archived = this.cards.filter((card) => card.archived);
		// `open` is a plain attribute, not a binding: a repaint must never reopen a section the
		// reader has just closed, nor close one they opened.
		return html`
			<details class="active" open>
				<summary>${t("cards.list")}</summary>
				${
					this.cards.length === 0
						? html`<p>${t("cards.empty")}</p>`
						: active.length > 0
							? this.table(active)
							: nothing
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

	private table(cards: Card[]) {
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("cards.column.card")}</th>
						<th>${t("cards.column.location")}</th>
						<th>${t("cards.column.limitGroup")}</th>
						<th>${t("cards.column.cycle")}</th>
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
		const group = this.groups.find(({ id }) => id === card.limitGroupId);
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
						<span data-field="limit-group">${group?.name ?? t("cards.unassigned")}</span>
						${group ? html`<span class="owner" data-field="owner">${ownerOf(group)}</span>` : nothing}
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
