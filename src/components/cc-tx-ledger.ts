import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate, headerDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import {
	entriesTotal,
	entryAmount,
	entryDate,
	listIdOf,
	type TxEntry,
} from "#lib/domain/transactions";
import type {
	Card,
	CardPayment,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardLabelHtml, cardLabelText } from "#lib/ui/card-label";
import { listPageAddress } from "#lib/ui/list-address";
import { base, controls } from "#styles/shared";

export type Upcoming = {
	lists: PurchaseList[];
	planned: { payment: CardPayment; card: Card | undefined }[];
};

const MINUS = "−";

/**
 * The ledger: purchases and paid payments, grouped under day headings (`groups`) or flat
 * (`entries`), and the *Upcoming* section above it. A purchase row is a link; a payment row is
 * a button that opens in place, where a wrong payment is deleted in two steps (UI-09). The page
 * owns `open`; `confirming` is the second step and is dropped whenever another row opens.
 */
@customElement("cc-tx-ledger")
export class CcTxLedger extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			section {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			h2,
			h3 {
				font-size: var(--cc-text-sm);
				font-weight: 600;
				color: var(--cc-text-muted);
			}

			.result-head {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.rows {
				display: flex;
				flex-direction: column;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-sm);
				overflow: hidden;
			}

			.row {
				display: flex;
				flex-direction: column;
			}

			.row + .row {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			a.line,
			button.line {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				inline-size: 100%;
				padding: var(--cc-space-3) var(--cc-panel-padding);
				font: inherit;
				font-size: var(--cc-text-md);
				font-weight: 400;
				color: inherit;
				text-align: start;
				white-space: normal;
				text-decoration: none;
				cursor: pointer;
				background: transparent;
				border: 0;
				border-radius: 0;
			}

			a.line:hover,
			button.line:hover {
				background: var(--cc-surface-sunken);
			}

			.what {
				display: flex;
				flex-direction: column;
				min-inline-size: 0;
			}

			.sub,
			.word {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.archived {
				font-size: var(--cc-text-xs);
				padding: 0 var(--cc-space-2);
				color: var(--cc-text-muted);
				background: var(--cc-surface-sunken);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-pill);
			}

			.amount {
				flex: none;
				font-weight: 600;
			}

			.actions {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
				padding: var(--cc-space-2) var(--cc-panel-padding) var(--cc-space-3);
				background: var(--cc-surface-sunken);
			}

			.confirm {
				flex: 1 1 100%;
				font-size: var(--cc-text-sm);
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) groups:
		| { date: PlainDate; entries: TxEntry[] }[]
		| null = null;
	@property({ attribute: false }) entries: TxEntry[] = [];
	@property({ attribute: false }) lists: PurchaseList[] = [];
	@property({ attribute: false }) upcoming: Upcoming | null = null;
	@property() today: PlainDate = "";
	@property() open: string | null = null;
	@property({ type: Boolean }) confirming = false;
	@property({ type: Boolean }) filtered = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("open") && changed.get("open") !== undefined)
			this.confirming = false;
	}

	private emit(name: string, detail: object) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	private all(): TxEntry[] {
		return this.groups ? this.groups.flatMap((g) => g.entries) : this.entries;
	}

	private signed(entry: TxEntry): string {
		return `${entry.kind === "payment" ? "+" : MINUS}${formatAmount(entryAmount(entry))}`;
	}

	private link(entry: TxEntry & { kind: "purchase" }): string {
		const listId = listIdOf(entry.purchase.id);
		return listId && this.lists.some((l) => l.id === listId)
			? `/list/view?id=${encodeURIComponent(listId)}`
			: `/card?id=${encodeURIComponent(entry.purchase.cardId)}`;
	}

	private deleteBlock(
		payment: CardPayment,
		card: Card | undefined,
		extra: unknown = nothing,
	) {
		const label = cardLabelText(payment.cardId, card);
		return html`<div class="actions" data-open=${payment.id}>
			${extra}
			${
				this.confirming
					? html`
						<p class="confirm">${t("tx.confirmDelete", { amount: formatAmount(payment.amount), card: label })}</p>
						<button type="button" data-variant="danger" data-action="confirm-delete"
							@click=${() => this.emit("delete-payment", { payment })}>${t("common.delete")}</button>
						<button type="button" data-action="keep"
							@click=${() => {
								this.confirming = false;
							}}>${t("tx.keep")}</button>`
					: html`<button type="button" data-variant="danger" data-action="delete"
							@click=${() => {
								this.confirming = true;
							}}>${t("tx.deletePayment")}</button>`
			}
		</div>`;
	}

	private row(entry: TxEntry, showDate: boolean) {
		const word = t(
			entry.kind === "purchase" ? "tx.type.purchase" : "tx.type.payment",
		);
		const note = entry.kind === "purchase" ? entry.purchase.note : "";
		const body = html`
			<span class="what">
				<b>${cardLabelHtml(entry.kind === "purchase" ? entry.purchase.cardId : entry.payment.cardId, entry.card)}
					${entry.card?.archived ? html`<span class="archived">${t("cards.archived")}</span>` : nothing}</b>
				<span class="sub"><span class="word">${word}</span>${note ? html` · ${note}` : nothing}${
					showDate
						? html` · ${displayDate(entryDate(entry), getLocale())}`
						: nothing
				}</span>
			</span>
			<span class="amount" data-numeric>${this.signed(entry)}</span>`;
		if (entry.kind === "purchase")
			return html`<div class="row">
				<a class="line" data-kind="purchase" href=${this.link(entry)}>${body}</a>
			</div>`;
		const open = this.open === entry.payment.id;
		return html`<div class="row">
			<button type="button" class="line" data-kind="payment" aria-expanded=${open}
				@click=${() => this.emit("toggle", { id: entry.payment.id })}>${body}</button>
			${open ? this.deleteBlock(entry.payment, entry.card) : nothing}
		</div>`;
	}

	private renderUpcoming() {
		const up = this.upcoming;
		if (!up || (up.lists.length === 0 && up.planned.length === 0))
			return nothing;
		return html`<section class="upcoming">
			<h2>${t("tx.upcoming")}</h2>
			<div class="rows">
				${up.lists.map((list) => {
					const count = list.lines.length;
					return html`<div class="row"><a class="line" data-kind="waiting"
						href=${listPageAddress(list)}>
						<span class="what"><b>${t("home.waiting")}</b>
							<span class="sub">${displayDate(list.date, getLocale())} · ${t(count === 1 ? "tx.lists.cards.one" : "tx.lists.cards.many", { count })}</span></span>
						<span class="amount" data-numeric>${formatAmount(listTotal(list))}</span>
					</a></div>`;
				})}
				${up.planned.map(({ payment, card }) => {
					const open = this.open === payment.id;
					return html`<div class="row">
						<button type="button" class="line" data-kind="planned" aria-expanded=${open}
							@click=${() => this.emit("toggle", { id: payment.id })}>
							<span class="what"><b>${cardLabelHtml(payment.cardId, card)}</b>
								<span class="sub"><span class="word">${t("tx.planned")}</span> · ${displayDate(payment.date, getLocale())}</span></span>
							<span class="amount" data-numeric>${formatAmount(payment.amount)}</span>
						</button>
						${
							open
								? this.deleteBlock(
										payment,
										card,
										this.confirming
											? nothing
											: html`<button type="button" data-action="mark-paid"
												@click=${() => this.emit("mark-paid", { payment })}>${t("statements.markPaid")}</button>`,
									)
								: nothing
						}
					</div>`;
				})}
			</div>
		</section>`;
	}

	private renderHead(all: TxEntry[]) {
		if (!this.filtered) return nothing;
		const total = entriesTotal(all);
		const sign = total < 0 ? MINUS : "+";
		return html`<p class="result-head">${t(
			all.length === 1 ? "tx.results.one" : "tx.results.many",
			{ count: all.length, total: `${sign}${formatAmount(Math.abs(total))}` },
		)}</p>`;
	}

	override render() {
		const all = this.all();
		return html`
			${this.renderUpcoming()}
			${this.renderHead(all)}
			${
				all.length === 0
					? html`<p class="empty">${t(this.filtered ? "tx.noResults" : "tx.empty")}</p>`
					: this.groups
						? this.groups.map(
								(group) => html`<section>
									<h3>${
										group.date === this.today
											? t("tx.today", {
													date: headerDate(group.date, getLocale(), false),
												})
											: headerDate(group.date, getLocale(), false)
									}</h3>
									<div class="rows">${group.entries.map((e) => this.row(e, false))}</div>
								</section>`,
							)
						: html`<div class="rows">${this.entries.map((e) => this.row(e, true))}</div>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-ledger": CcTxLedger;
	}
}
