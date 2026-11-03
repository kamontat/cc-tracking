import {
	css,
	html,
	LitElement,
	nothing,
	type PropertyValues,
	type TemplateResult,
} from "lit";
import { customElement, property } from "lit/decorators.js";
import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	listLines,
	plannedText,
	useOpenRow,
	waitingText,
} from "#components/action-row";
import { useTwoStep } from "#components/two-step";
import { displayDate, headerDate, periodLabel } from "#lib/domain/date";
import { formatAmount, MINUS } from "#lib/domain/money";
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
	CardLedger,
	CardPayment,
	LimitGroup,
	Period,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardMini, cardPanelLabel } from "#lib/ui/card-label";
import { listPageAddress } from "#lib/ui/list-address";
import { base, cardBits, controls, rowPanel } from "#styles/shared";

/** How many ledger rows show at first, and how many more each *Show more* adds. */
export const LEDGER_PAGE = 50;

export type Upcoming = {
	lists: PurchaseList[];
	planned: { payment: CardPayment; card: Card | undefined }[];
	/** Every stored card, to name a waiting list's cards. */
	cards: Card[];
};

/**
 * The ledger: purchases and paid payments, grouped under day headings (`groups`) or flat
 * (`entries`), and the *Upcoming* section above it. Each day (or the flat list) is one panel
 * of rows. Every row is the shared opening row (action-row.ts): its head is one button and it
 * opens in place, one row at a time across Upcoming and every day. A purchase opens to its
 * note, the statement it falls in and the list it came from, with *Open card* and, when from a
 * list, *Open list*; a paid payment to its note and how much reached each statement, with a
 * two-step *Delete* (DD-77). In Upcoming a waiting list opens to its lines, *Record reply* and
 * a two-step *Confirm* (`confirm-list`); a planned payment to its note, *Paid* (`mark-paid`)
 * and a two-step *Delete* (`delete-payment`). Each second step swaps the buttons in place
 * (UI-09) and focus follows the swap; a swap ends when its row closes. Only the first `limit`
 * rows show; a quiet *Show more* under them asks for more (`show-more`). The results line
 * still counts every entry.
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
				letter-spacing: var(--cc-tracking-caps);
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

			.more {
				align-self: center;
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
	/** Each card's ledger, by card id: a purchase's statement and where a payment went. */
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map();
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) limitGroups: LimitGroup[] = [];
	@property({ attribute: false }) upcoming: Upcoming | null = null;
	@property() today: PlainDate = "";
	@property({ type: Boolean }) filtered = false;
	/** How many rows show; the page raises it by `LEDGER_PAGE` on `show-more`. */
	@property({ attribute: false }) limit = LEDGER_PAGE;
	/** The two-step *Delete* and *Confirm* swaps, shared with Needs you. */
	private readonly steps = useTwoStep(this);
	/** The one open row on the page, Upcoming and ledger alike; a swap ends when its row closes. */
	private readonly rows = useOpenRow(this, () => this.steps.reset());

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (
			changed.has("groups") ||
			changed.has("entries") ||
			changed.has("upcoming") ||
			changed.has("limit")
		)
			this.rows.prune(this.drawnIds());
	}

	/** Every row drawn now, by its open-row id. */
	private drawnIds(): string[] {
		const up = this.upcoming;
		const shown = this.groups
			? this.shownGroups(this.groups).flatMap((g) => g.entries)
			: this.entries.slice(0, this.limit);
		return [
			...(up?.lists.map((l) => `list:${l.id}`) ?? []),
			...(up?.planned.map(({ payment }) => planId(payment)) ?? []),
			...shown.map(entryId),
		];
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

	/** Draws a row that opens in place under the id `id`. */
	private opening(
		id: string,
		text: ActionRowText,
		amount: { text: string; tone: "out" | "in" | "muted" },
		details: TemplateResult | typeof nothing,
		action: TemplateResult,
		lead?: TemplateResult,
	) {
		return actionRow(text, {
			id,
			lead,
			amount,
			action,
			open: {
				expanded: this.rows.isOpen(id),
				onToggle: () => this.rows.toggle(id),
				detailsId: this.rows.detailsId(id),
				details,
			},
		});
	}

	/** A purchase's details: its statement's dates. The note and the list it came from are on
	 * the row's sub line already (and *Open list* links the list), so they are not said twice. */
	private purchaseDetails(entry: TxEntry & { kind: "purchase" }) {
		const { purchase } = entry;
		const date = (d: PlainDate) => displayDate(d, getLocale());
		const statement = this.ledgers
			.get(purchase.cardId)
			?.statements.find((s) => s.purchases.some((p) => p.id === purchase.id));
		return html`${
			statement
				? html`<span>${t("row.statement", {
						close: date(statement.closeDate),
						due: date(statement.dueDate),
					})}</span>`
				: nothing
		}`;
	}

	/** A paid payment's details: how much reached each statement, oldest first (its note is on
	 * the sub line). */
	private paymentDetails(payment: CardPayment) {
		const parts = new Map<Period, number>();
		const statements = this.ledgers.get(payment.cardId)?.statements ?? [];
		for (const statement of [...statements].reverse())
			for (const part of statement.payments)
				if (
					part.payment.cardId === payment.cardId &&
					part.payment.id === payment.id
				)
					parts.set(
						statement.period,
						(parts.get(statement.period) ?? 0) + part.amount,
					);
		return html`${[...parts].map(
			([period, amount]) =>
				html`<span>${t("row.paidTo", {
					amount: formatAmount(amount),
					period: periodLabel(period, getLocale()),
				})}</span>`,
		)}`;
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
		const text: ActionRowText = {
			kind: entry.kind,
			title: html`${cardPanelLabel(id, entry.card)} <span class="word">${word}</span>`,
			subtitle: html`${parts.length > 0 ? html`<span>${parts.join(" · ")}</span>` : nothing}${
				entry.card?.archived
					? html`<span class="tag archived">${t("cards.archived")}</span>`
					: nothing
			}`,
		};
		const amount = {
			text: this.signed(entry),
			tone: purchase ? ("out" as const) : ("in" as const),
		};
		const chip = cardMini(entry.card, this.limitGroups);
		if (entry.kind === "purchase")
			return this.opening(
				entryId(entry),
				text,
				amount,
				this.purchaseDetails(entry),
				html`<a class="btn" data-variant="quiet" data-action="open-card"
					href=${`/card?id=${encodeURIComponent(entry.purchase.cardId)}`}>${t("row.openCard")}</a>${
						list
							? html`<a class="btn" data-variant="quiet" data-action="open-list"
								href=${`/list/view?id=${encodeURIComponent(list.id)}`}>${t("row.openList")}</a>`
							: nothing
					}`,
				chip,
			);
		const { payment } = entry;
		return this.opening(
			entryId(entry),
			text,
			amount,
			this.paymentDetails(payment),
			this.steps.paidButtons(payment, entry.card, () =>
				this.emit("delete-payment", { payment }),
			),
			chip,
		);
	}

	private renderUpcoming() {
		const up = this.upcoming;
		if (!up || (up.lists.length === 0 && up.planned.length === 0))
			return nothing;
		return html`<section class="upcoming">
			<div class="sec-head"><h2>${t("tx.upcoming")}</h2></div>
			<div class="panel">
				${up.lists.map((list) =>
					this.opening(
						`list:${list.id}`,
						waitingText(list, up.cards, this.limitGroups),
						{
							text: `${MINUS}${formatAmount(listTotal(list))}`,
							tone: "muted",
						},
						listLines(list, up.cards),
						html`<a class="btn" data-action="record-reply" href=${listPageAddress(list)}>${t("row.recordReply")}</a>${this.steps.listButtons(
							list,
							() => this.emit("confirm-list", { list }),
						)}`,
					),
				)}
				${up.planned.map(({ payment, card }) =>
					this.opening(
						planId(payment),
						plannedText(payment, card, this.limitGroups, this.today, true),
						{ text: `+${formatAmount(payment.amount)}`, tone: "in" },
						// The note is on the sub line already (`plannedText`).
						nothing,
						this.steps.planButtons(payment, card, {
							paid: () => this.emit("mark-paid", { payment }),
							remove: () => this.emit("delete-payment", { payment }),
						}),
					),
				)}
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

	/** The day groups cut to the first `limit` rows; a day cut part-way keeps its heading. */
	private shownGroups(groups: { date: PlainDate; entries: TxEntry[] }[]) {
		const shown: { date: PlainDate; entries: TxEntry[] }[] = [];
		let left = this.limit;
		for (const group of groups) {
			if (left <= 0) break;
			shown.push({ ...group, entries: group.entries.slice(0, left) });
			left -= group.entries.length;
		}
		return shown;
	}

	/** *Show 50 more · N left*, or *Show N more* when fewer than a page are left. */
	private renderMore(total: number) {
		const left = total - this.limit;
		if (left <= 0) return nothing;
		return html`<button type="button" class="more" data-variant="quiet" data-action="show-more"
			@click=${() => this.emit("show-more", {})}>${
				left > LEDGER_PAGE
					? t("tx.showMore.page", { page: LEDGER_PAGE, count: left })
					: t("tx.showMore.rest", { count: left })
			}</button>`;
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
						? this.shownGroups(this.groups).map(
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
						: html`<div class="panel">${this.entries.slice(0, this.limit).map((e) => this.row(e, true))}</div>`
			}
			${this.renderMore(all.length)}
		`;
	}
}

/** A planned payment's open-row id: a payment's id repeats across cards. */
const planId = (payment: CardPayment) => `plan:${payment.cardId}:${payment.id}`;

/** A ledger row's open-row id, unique across kinds and cards. */
function entryId(entry: TxEntry): string {
	return entry.kind === "purchase"
		? `buy:${entry.purchase.cardId}:${entry.purchase.id}`
		: `pay:${entry.payment.cardId}:${entry.payment.id}`;
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-ledger": CcTxLedger;
	}
}
