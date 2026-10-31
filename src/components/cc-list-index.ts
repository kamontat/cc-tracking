import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import { type ListFilter, listRows } from "#lib/domain/transactions";
import type { Card, ListStatus, PurchaseList } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { listPageAddress } from "#lib/ui/list-address";
import { shareTable } from "#lib/ui/list-share";
import { base, controls } from "#styles/shared";

const STATUSES: ListStatus[] = ["draft", "sent", "saved"];

/** Every purchase list, newest first, narrowed by status chips (none ticked means all). */
@customElement("cc-list-index")
export class CcListIndex extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.chips {
				display: flex;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.list {
				display: flex;
				flex-direction: column;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-sm);
				overflow: hidden;
			}

			a[data-list] {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) var(--cc-panel-padding);
				color: inherit;
				text-decoration: none;
			}

			a[data-list] + a[data-list] {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			a[data-list]:hover {
				background: var(--cc-surface-sunken);
			}

			.what {
				display: flex;
				flex-direction: column;
				min-inline-size: 0;
			}

			.sub {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.total {
				flex: none;
				font-weight: 600;
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) lists: PurchaseList[] = [];
	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) status: ListFilter = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	private toggle(status: ListStatus) {
		const next = this.status.includes(status)
			? this.status.filter((s) => s !== status)
			: [...this.status, status];
		this.dispatchEvent(new CustomEvent("status", { detail: { status: next } }));
	}

	private total(list: PurchaseList): string {
		return list.status === "saved"
			? shareTable(list, this.cards).total[1]
			: formatAmount(listTotal(list));
	}

	override render() {
		if (this.lists.length === 0)
			return html`<p class="empty">${t("tx.lists.empty")}</p>`;
		const rows = listRows([...this.lists], this.status);
		return html`
			<div class="chips">${STATUSES.map(
				(status) =>
					html`<button type="button" data-status=${status}
						data-variant=${this.status.includes(status) ? nothing : "quiet"}
						aria-pressed=${this.status.includes(status)}
						@click=${() => this.toggle(status)}>${t(`tx.lists.status.${status}`)}</button>`,
			)}</div>
			${rows.length === 0 ? html`<p class="empty">${t("tx.lists.empty")}</p>` : nothing}
			<div class="list">${rows.map((list) => {
				const count = list.lines.length;
				return html`<a data-list=${list.id} href=${listPageAddress(list)}>
					<span class="what">
						<b>${displayDate(list.date, getLocale())}</b>
						<span class="sub">${t(count === 1 ? "tx.lists.cards.one" : "tx.lists.cards.many", { count })} · ${t(`tx.lists.status.${list.status}`)}</span>
					</span>
					<span class="total" data-numeric>${this.total(list)}</span>
				</a>`;
			})}</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-index": CcListIndex;
	}
}
