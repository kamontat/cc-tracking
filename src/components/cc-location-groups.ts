import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DueRow } from "#components/cc-due-list";
import { displayDate } from "#lib/domain/date";
import { type Location, locationLabel } from "#lib/domain/location";

@customElement("cc-location-groups")
export class CcLocationGroups extends LitElement {
	@property({ attribute: false }) rows: DueRow[] = [];

	private grouped(): [Location, DueRow[]][] {
		const groups = new Map<Location, DueRow[]>();
		for (const row of this.rows) {
			const location = row.card.location;
			groups.set(location, [...(groups.get(location) ?? []), row]);
		}
		return [...groups.entries()].sort(([a], [b]) =>
			locationLabel(a) < locationLabel(b) ? -1 : 1,
		);
	}

	override render() {
		return html`
			<details>
				<summary>Cards by location</summary>
				${this.grouped().map(([location, rows]) => {
					const soonest = rows.map((row) => row.statement.dueDate).sort()[0];
					return html`
						<article>
							<h3>${locationLabel(location)} (${rows.length})</h3>
							<p><small>Next due ${soonest ? displayDate(soonest) : "—"}</small></p>
							<ul>
								${rows.map(
									({ card }) => html`
										<li>
											<a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
											••••${card.last4}
										</li>
									`,
								)}
							</ul>
						</article>
					`;
				})}
			</details>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-location-groups": CcLocationGroups;
	}
}
