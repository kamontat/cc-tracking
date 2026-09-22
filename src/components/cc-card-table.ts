import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Card } from "#lib/domain/types";
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

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}

			.archived {
				padding: 0 var(--cc-space-1);
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}
		`,
	];

	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) purchaseCounts: Record<string, number> = {};

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
						<th>${t("cards.column.cycle")}</th>
						<th>${t("cards.column.comment")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						return html`
							<tr>
								<td data-label=${t("cards.column.id")}>
									<a class="card-id" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a>
								</td>
								<td data-label=${t("cards.column.name")}>
									${card.name}${card.archived ? html` <span class="archived">${t("cards.archived")}</span>` : ""}
								</td>
								<td data-label=${t("cards.column.last4")}>••••${card.last4}</td>
								<td data-label=${t("cards.column.location")}>${locationText(card.location)}</td>
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
