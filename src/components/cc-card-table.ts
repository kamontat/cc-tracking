import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { locationLabel } from "#lib/domain/location";
import type { Card } from "#lib/domain/types";
import { describeCycleText } from "#lib/i18n/format";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) purchaseCounts: Record<string, number> = {};

	private emit(name: "edit" | "archive" | "remove", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	override render() {
		if (this.cards.length === 0) {
			return html`<p>No cards yet. Add the first one with the form above.</p>`;
		}
		return html`
			<table>
				<thead>
					<tr><th>Id</th><th>Name</th><th>Last 4</th><th>Location</th><th>Cycle</th><th>Comment</th><th></th></tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						return html`
							<tr>
								<td><a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a></td>
								<td>${card.name}${card.archived ? html` <small>(archived)</small>` : ""}</td>
								<td>••••${card.last4}</td>
								<td>${locationLabel(card.location)}</td>
								<td>${describeCycleText(card.cycle)}</td>
								<td>${card.comment ?? ""}</td>
								<td>
									<button @click=${() => this.emit("edit", card.id)}>Edit</button>
									<button class="secondary" @click=${() => this.emit("archive", card.id)}>
										${card.archived ? "Unarchive" : "Archive"}
									</button>
									${
										count === 0
											? html`<button class="secondary outline"
												@click=${() => this.emit("remove", card.id)}>Delete</button>`
											: html`<small>${count} purchases</small>`
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
