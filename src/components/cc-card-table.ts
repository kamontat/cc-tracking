import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Card } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
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
					<tr><th>${t("cards.column.id")}</th><th>${t("cards.column.name")}</th><th>${t("cards.column.last4")}</th><th>${t("cards.column.location")}</th><th>${t("cards.column.cycle")}</th><th>${t("cards.column.comment")}</th><th></th></tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						return html`
							<tr>
								<td><a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a></td>
								<td>${card.name}${card.archived ? html` <small>${t("cards.archived")}</small>` : ""}</td>
								<td>••••${card.last4}</td>
								<td>${locationText(card.location)}</td>
								<td>${describeCycleText(card.cycle)}</td>
								<td>${card.comment ?? ""}</td>
								<td>
									<button @click=${() => this.emit("edit", card.id)}>${t("common.edit")}</button>
									<button class="secondary" @click=${() => this.emit("archive", card.id)}>
										${card.archived ? t("cards.unarchive") : t("cards.archive")}
									</button>
									${
										count === 0
											? html`<button class="secondary outline"
												@click=${() => this.emit("remove", card.id)}>${t("common.delete")}</button>`
											: html`<small>${t("cards.purchaseCount", { count })}</small>`
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
		"cc-card-table": CcCardTable;
	}
}
