import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ownerOf } from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			.actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			/*
			 * The purchase count stands in for the Delete button and is wider than it, and auto
			 * table layout hands this column only what the rest of the row leaves over. Allowed
			 * to wrap, the count dropped to a line of its own beneath the buttons, where it read
			 * as a stray note rather than as this row's answer. Held on one line, the column
			 * claims the width it needs from the emptier ones instead. Below 640px the row has
			 * stacked and has the full width to itself, so wrapping there stays available.
			 */
			@media (min-width: 640px) {
				.actions {
					flex-wrap: nowrap;
				}
			}

			.actions small {
				white-space: nowrap;
			}

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}

			/* A badge is one token. Broken across two lines its background box breaks with it. */
			.archived,
			.supplementary {
				padding: 0 var(--cc-space-1);
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				white-space: nowrap;
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
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
		if (this.cards.length === 0) {
			return html`<p>${t("cards.empty")}</p>`;
		}
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("cards.column.id")}</th>
						<th>${t("cards.column.name")}</th>
						<th>${t("cards.column.last4")}</th>
						<th>${t("cards.column.location")}</th>
						<th>${t("cards.column.owner")}</th>
						<th>${t("cards.column.limitGroup")}</th>
						<th>${t("cards.column.cycle")}</th>
						<th>${t("cards.column.comment")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						const group = this.groups.find(
							({ id }) => id === card.limitGroupId,
						);
						return html`
							<tr>
								<td data-label=${t("cards.column.id")}>
									<a class="card-id" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a>
								</td>
								<td data-label=${t("cards.column.name")}>
									${card.name}${card.archived ? html` <span class="archived">${t("cards.archived")}</span>` : ""}${
										card.supplementary
											? html` <span class="supplementary">${t("form.supplementary")}</span>`
											: ""
									}
								</td>
								<td data-label=${t("cards.column.last4")}>••••${card.last4}</td>
								<td data-label=${t("cards.column.location")}>${locationText(card.location)}</td>
								<td data-field="owner" data-label=${t("cards.column.owner")}>${
									group ? ownerOf(group) : t("cards.unassigned")
								}</td>
								<td data-field="limit-group" data-label=${t("cards.column.limitGroup")}>
									${group?.name ?? t("cards.unassigned")}
								</td>
								<td data-label=${t("cards.column.cycle")}>${describeCycleText(card.cycle)}</td>
								<td data-label=${t("cards.column.comment")}>${card.comment ?? ""}</td>
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
												: html`<small>${t("cards.purchaseCount", { count })}</small>`
										}
									</div>
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
		"cc-card-table": CcCardTable;
	}
}
