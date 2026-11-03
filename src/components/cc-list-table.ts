import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Card, ListStatus, PurchaseList } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { shareTable } from "#lib/ui/list-share";
import { base, dataTable, rowPanel } from "#styles/shared";

/** The purchase list as a document: what Copy text and Save image also say. */
@customElement("cc-list-table")
export class CcListTable extends LitElement {
	static override styles = [
		base,
		dataTable,
		rowPanel,
		css`
			:host {
				display: block;
			}

			.doc {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			h3 {
				margin: 0;
				font-size: var(--cc-text-lg);
			}

			p {
				margin: 0;
				color: var(--cc-text-muted);
			}

			/* The table is a row list: one panel, a hairline between the body rows, a muted
			   header row and a bold total row. */
			.panel {
				display: block;
			}

			th {
				padding-inline: 0;
				border-bottom: 0;
			}

			td {
				padding-inline: 0;
				border-bottom: 0;
			}

			tbody tr + tr,
			tfoot tr {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			tbody tr:last-child td {
				border-bottom: 0;
			}

			tfoot td {
				font-weight: 700;
			}

			@media (max-width: 639px) {
				tr {
					border-bottom: 0;
				}

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
				<div>
					<h3>${table.title}</h3>
					<p>${table.date}</p>
				</div>
				<div class="panel"><table>
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
				</table></div>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-table": CcListTable;
	}
}
