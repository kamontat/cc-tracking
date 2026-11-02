import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Card, ListStatus, PurchaseList } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { shareTable } from "#lib/ui/list-share";
import { base, dataTable } from "#styles/shared";

/** The purchase list as a document: what Copy text and Save image also say. */
@customElement("cc-list-table")
export class CcListTable extends LitElement {
	static override styles = [
		base,
		dataTable,
		css`
			:host {
				display: block;
			}

			.doc {
				padding: var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			h3 {
				margin: 0;
				font-size: var(--cc-text-lg);
			}

			p {
				margin: 0;
				color: var(--cc-text-muted);
			}

			table {
				margin-top: var(--cc-space-3);
			}

			tfoot td {
				font-weight: 700;
				border-bottom: 0;
			}

			@media (max-width: 639px) {
				tfoot tr {
					flex-direction: row;
					justify-content: space-between;
					border-bottom: 0;
				}
			}
		`,
	];

	@property({ attribute: false }) list: Pick<PurchaseList, "date" | "lines"> & {
		status?: ListStatus;
	} = {
		date: "",
		lines: [],
	};
	@property({ attribute: false }) cards: Card[] = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		const table = shareTable(this.list, this.cards);
		const [cardHead, nameHead, amountHead] = table.headers;
		return html`
			<div class="doc">
				<h3>${table.title}</h3>
				<p>${table.date}</p>
				<table>
					<thead>
						<tr>
							<th>${cardHead}</th>
							<th>${nameHead}</th>
							<th data-numeric>${amountHead}</th>
						</tr>
					</thead>
					<tbody>
						${table.rows.map(
							([card, name, amount]) => html`
								<tr>
									<td data-label=${cardHead}>${card}</td>
									<td data-label=${nameHead}>${name}</td>
									<td data-label=${amountHead} data-numeric>${amount}</td>
								</tr>
							`,
						)}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="2">${table.total[0]}</td>
							<td data-numeric>${table.total[1]}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-table": CcListTable;
	}
}
