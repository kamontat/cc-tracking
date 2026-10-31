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
import { base, cardBits, controls, rowPanel } from "#styles/shared";

const STATUSES: ListStatus[] = ["draft", "sent", "saved"];
/** A status pill's tint; a draft stays plain. The pill's word says the status either way. */
const TONES: Partial<Record<ListStatus, string>> = {
	sent: "warn",
	saved: "ok",
};

/** Every purchase list, newest first, narrowed by status chips (none ticked means all). */
@customElement("cc-list-index")
export class CcListIndex extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		rowPanel,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
			}

			.chips {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.chips button {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-weight: 400;
				color: var(--cc-text);
				background: var(--cc-surface-sunken);
				border-color: transparent;
				border-radius: var(--cc-radius-pill);
			}

			.chips button:hover {
				background: var(--cc-border);
			}

			.chips button[aria-pressed="true"] {
				font-weight: 600;
				color: var(--cc-success);
				background: var(--cc-accent-surface);
			}

			.crow {
				grid-template-columns: minmax(0, 1fr) auto;
			}

			.sub .tag {
				align-self: center;
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
					html`<button type="button" data-status=${status} data-variant="quiet"
						aria-pressed=${this.status.includes(status)}
						@click=${() => this.toggle(status)}>${t(`tx.lists.status.${status}`)}</button>`,
			)}</div>
			${
				rows.length === 0
					? html`<p class="empty">${t("tx.lists.noMatch")}</p>`
					: html`<div class="panel">${rows.map((list) => {
							const count = list.lines.length;
							return html`<a class="crow" data-list=${list.id} href=${listPageAddress(list)}>
								<span class="what">
									<b>${displayDate(list.date, getLocale())}</b>
									<span class="sub">
										<span class="tag" data-tone=${TONES[list.status] ?? nothing}>${t(`tx.lists.status.${list.status}`)}</span>
										<span>${t(count === 1 ? "tx.lists.cards.one" : "tx.lists.cards.many", { count })}</span>
									</span>
								</span>
								<b class="amount r" data-numeric>${this.total(list)}</b>
							</a>`;
						})}</div>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-index": CcListIndex;
	}
}
