import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	actionRow,
	actionRowStyles,
	plannedText,
	waitingText,
} from "#components/action-row";
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
	LimitGroup,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardMini, cardName, cardPanelLabel } from "#lib/ui/card-label";
import { listPageAddress } from "#lib/ui/list-address";
import { base, cardBits, controls, rowPanel } from "#styles/shared";

export type Upcoming = {
	lists: PurchaseList[];
	planned: { payment: CardPayment; card: Card | undefined }[];
	/** Every stored card, to name a waiting list's cards. */
	cards: Card[];
};

const MINUS = "−";

/**
 * The ledger: purchases and paid payments, grouped under day headings (`groups`) or flat
 * (`entries`), and the *Upcoming* section above it. Each day (or the flat list) is one panel
 * of rows. A purchase row is a link; a payment row is a button that opens in place, where a
 * wrong payment is deleted in two steps (UI-09). Upcoming uses the shared action row (DD-108):
 * a waiting list links to its reply and has *Confirm*, which asks once more before it saves
 * every line as made (`confirm-list`); a planned payment is plain text with *Paid* (`mark-paid`) and a
 * *Delete* button after it, which asks once more (DD-110). The page owns `open`, for a paid
 * payment's delete; `confirming` is its second step and is dropped whenever another row opens.
 */
@customElement("cc-tx-ledger")
export class CcTxLedger extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		rowPanel,
		actionRowStyles,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
				min-inline-size: 0;
			}

			section {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
			}

			.sec-head {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				justify-content: space-between;
				gap: var(--cc-space-2);
			}

			h2,
			h3 {
				font-size: var(--cc-text-xs);
				font-weight: 650;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: var(--cc-text-muted);
			}

			.sec-head small {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.result-head {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.row {
				display: flex;
				flex-direction: column;
			}

			.t {
				display: inline;
			}

			.archived {
				align-self: center;
			}

			.actions {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
				padding: 0 0 var(--cc-space-3)
					calc(var(--cc-space-5) + var(--cc-space-3) + var(--cc-space-3));
			}

			.confirm {
				flex: 1 1 100%;
				font-size: var(--cc-text-sm);
			}

			/* Below 900px a ledger row stacks like the action row (DD-109): the chip, the title
			   and its sub line, then the signed amount on its own line, in line with the text. */
			@media (max-width: 899.98px) {
				.crow[data-kind] {
					grid-template-columns: auto minmax(0, 1fr);
				}

				.crow[data-kind] > .amount {
					grid-column: 2;
					align-items: flex-start;
					text-align: start;
				}
			}

			.empty {
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	];

	@property({ attribute: false }) groups:
		| { date: PlainDate; entries: TxEntry[] }[]
		| null = null;
	@property({ attribute: false }) entries: TxEntry[] = [];
	@property({ attribute: false }) lists: PurchaseList[] = [];
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) limitGroups: LimitGroup[] = [];
	@property({ attribute: false }) upcoming: Upcoming | null = null;
	@property() today: PlainDate = "";
	@property() open: string | null = null;
	@property({ type: Boolean }) confirming = false;
	@property({ type: Boolean }) filtered = false;
	/** The waiting list whose *Confirm* asks its second step. */
	@state() private confirmingList: string | null = null;
	/** The planned payment whose *Delete* asks its second step. */
	@state() private confirmingPlan: string | null = null;

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

	private listOf(entry: TxEntry & { kind: "purchase" }) {
		const listId = listIdOf(entry.purchase.id);
		return listId ? this.lists.find((l) => l.id === listId) : undefined;
	}

	private link(entry: TxEntry & { kind: "purchase" }): string {
		const list = this.listOf(entry);
		return list
			? `/list/view?id=${encodeURIComponent(list.id)}`
			: `/card?id=${encodeURIComponent(entry.purchase.cardId)}`;
	}

	private chip(card: Card | undefined) {
		return cardMini(card, this.limitGroups);
	}

	/** The row's first line: the card's `id) name` in bold, then the kind of row, muted. */
	private heading(id: string, card: Card | undefined, word: string) {
		return html`<span class="t"><b>${cardPanelLabel(id, card)}</b> <span class="word">${word}</span></span>`;
	}

	private deleteBlock(payment: CardPayment, card: Card | undefined) {
		return html`<div class="actions" data-open=${payment.id}>
			${
				this.confirming
					? html`
						<p class="confirm">${t("tx.confirmDelete", { amount: formatAmount(payment.amount), card: cardName(payment.cardId, card) })}</p>
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

	/** A planned payment's second step: ask, then *Delete* or *Keep* (UI-09, DD-110). */
	private planDeleteBlock(payment: CardPayment, card: Card | undefined) {
		return html`<div class="actions" data-confirming=${payment.id}>
			<p class="confirm">${t("tx.confirmDelete", { amount: formatAmount(payment.amount), card: cardName(payment.cardId, card) })}</p>
			<button type="button" data-variant="danger" data-action="confirm-delete"
				@click=${() => {
					this.confirmingPlan = null;
					this.emit("delete-payment", { payment });
				}}>${t("common.delete")}</button>
			<button type="button" data-action="keep"
				@click=${() => {
					this.confirmingPlan = null;
				}}>${t("tx.keep")}</button>
		</div>`;
	}

	private row(entry: TxEntry, showDate: boolean) {
		const purchase = entry.kind === "purchase";
		const id = purchase ? entry.purchase.cardId : entry.payment.cardId;
		const word = t(purchase ? "tx.type.purchase" : "tx.type.payment");
		const list = purchase ? this.listOf(entry) : undefined;
		const parts: string[] = [];
		const note = purchase ? entry.purchase.note : entry.payment.note;
		if (note) parts.push(note);
		if (list)
			parts.push(
				t("tx.fromList", { date: headerDate(list.date, getLocale(), false) }),
			);
		if (showDate) parts.push(displayDate(entryDate(entry), getLocale()));
		const body = html`
			${this.chip(entry.card)}
			<span class="what">
				${this.heading(id, entry.card, word)}
				${
					parts.length > 0 || entry.card?.archived
						? html`<span class="sub">${parts.length > 0 ? html`<span>${parts.join(" · ")}</span>` : nothing}${
								entry.card?.archived
									? html`<span class="tag archived">${t("cards.archived")}</span>`
									: nothing
							}</span>`
						: nothing
				}
			</span>
			<b class="amount r ${purchase ? "out" : "in"}" data-numeric>${this.signed(entry)}</b>`;
		if (entry.kind === "purchase")
			return html`<div class="row">
				<a class="crow" data-kind="purchase" href=${this.link(entry)}>${body}</a>
			</div>`;
		const open = this.open === entry.payment.id;
		return html`<div class="row">
			<button type="button" class="crow" data-kind="payment" aria-expanded=${open}
				@click=${() => this.emit("toggle", { id: entry.payment.id })}>${body}</button>
			${open ? this.deleteBlock(entry.payment, entry.card) : nothing}
		</div>`;
	}

	/** The second step of a waiting list's *Confirm*: nothing is written until *Save*. */
	private confirmBlock(list: PurchaseList) {
		const count = list.lines.length;
		return html`<div class="actions" data-confirming=${list.id}>
			<p class="confirm">${count === 1 ? t("row.confirmAsk.one") : t("row.confirmAsk.many", { count })}</p>
			<button type="button" data-action="save-list"
				@click=${() => {
					this.confirmingList = null;
					this.emit("confirm-list", { list });
				}}>${t("row.save")}</button>
			<button type="button" data-variant="quiet" data-action="cancel-confirm"
				@click=${() => {
					this.confirmingList = null;
				}}>${t("common.cancel")}</button>
		</div>`;
	}

	private renderUpcoming() {
		const up = this.upcoming;
		if (!up || (up.lists.length === 0 && up.planned.length === 0))
			return nothing;
		return html`<section class="upcoming">
			<div class="sec-head"><h2>${t("tx.upcoming")}</h2></div>
			<div class="panel">
				${up.lists.map((list) =>
					actionRow(waitingText(list, up.cards, this.limitGroups, false), {
						id: list.id,
						href: listPageAddress(list),
						amount: {
							text: `${MINUS}${formatAmount(listTotal(list))}`,
							tone: "muted",
						},
						action:
							this.confirmingList === list.id
								? undefined
								: html`<button type="button" data-variant="quiet" data-action="confirm-list"
									@click=${() => {
										this.confirmingList = list.id;
									}}>${t("row.confirm")}</button>`,
						below:
							this.confirmingList === list.id
								? this.confirmBlock(list)
								: nothing,
					}),
				)}
				${up.planned.map(({ payment, card }) => {
					const asking = this.confirmingPlan === payment.id;
					return actionRow(
						plannedText(payment, card, this.limitGroups, this.today, true),
						{
							id: payment.id,
							amount: { text: `+${formatAmount(payment.amount)}`, tone: "in" },
							action: asking
								? undefined
								: html`<span class="a-btns"><button type="button" data-variant="quiet" data-action="mark-paid"
										@click=${() => this.emit("mark-paid", { payment })}>${t("row.paid")}</button><button type="button" data-variant="danger" data-action="delete"
										@click=${() => {
											this.confirmingPlan = payment.id;
										}}>${t("common.delete")}</button></span>`,
							below: asking ? this.planDeleteBlock(payment, card) : nothing,
						},
					);
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
								(group) => html`<section class="day">
									<h3>${
										group.date === this.today
											? t("tx.today", {
													date: headerDate(group.date, getLocale(), false),
												})
											: headerDate(group.date, getLocale(), false)
									}</h3>
									<div class="panel">${group.entries.map((e) => this.row(e, false))}</div>
								</section>`,
							)
						: html`<div class="panel">${this.entries.map((e) => this.row(e, true))}</div>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-ledger": CcTxLedger;
	}
}
