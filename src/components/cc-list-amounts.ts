import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";
import {
	type AmountWarning,
	type DraftLine,
	datePassed,
	lineWarnings,
} from "#lib/domain/amount-warnings";
import { displayDate, isValidDate } from "#lib/domain/date";
import {
	draftLines,
	lineAmount,
	listLines,
	roomAfter,
} from "#lib/domain/list-entry";
import { formatAmount, formatAmountInput } from "#lib/domain/money";
import type { GroupRoom } from "#lib/domain/room";
import type {
	Card,
	CardLedger,
	CardPayment,
	ListLine,
	PlainDate,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardLabelHtml, cardLabelText } from "#lib/ui/card-label";
import { base, controls, listLayout } from "#styles/shared";

/**
 * Step 2 of a purchase list: a date and one amount per card, each line warned about what the
 * bank may do with it. The warnings inform and never block; only text that is not money does.
 * The `side` slot takes the page's own actions, after Review (a draft's Delete draft).
 */
@customElement("cc-list-amounts")
export class CcListAmounts extends LitElement {
	static override styles = [
		base,
		controls,
		listLayout,
		css`
			:host {
				display: block;
			}

			.when {
				gap: var(--cc-space-3);
			}

			.line {
				display: grid;
				gap: var(--cc-space-3);
				padding: var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			/* The amber outline joins the warning text below it; never the only signal. */
			.line[data-warn] {
				border-color: var(--cc-warning);
				box-shadow: 0 0 0 var(--cc-border-width) var(--cc-warning);
			}

			/* One row: the card's label at the start, a small Remove at the end. */
			.top {
				display: flex;
				align-items: center;
				gap: var(--cc-space-3);
			}

			.top b {
				flex: 1;
				min-inline-size: 0;
			}

			.top button {
				flex: none;
				padding: var(--cc-space-1) var(--cc-space-2);
				font-size: var(--cc-text-xs);
			}

			.bigin {
				flex-direction: row;
				align-items: baseline;
				gap: var(--cc-space-2);
				padding: var(--cc-space-1) var(--cc-space-4);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			.bigin span {
				font-size: var(--cc-text-lg);
				color: var(--cc-text-muted);
			}

			.bigin input {
				padding: var(--cc-space-1) 0;
				font-size: var(--cc-text-2xl);
				font-weight: 700;
				font-variant-numeric: tabular-nums;
				background: transparent;
				border: none;
			}

			.after {
				display: flex;
				justify-content: space-between;
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
				font-variant-numeric: tabular-nums;
			}

			.error {
				font-size: var(--cc-text-sm);
				color: var(--cc-danger);
			}

			.note {
				display: grid;
				gap: var(--cc-space-2);
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-text);
				background: var(--cc-warning-surface);
				border-radius: var(--cc-radius-sm);
			}

			.note > span {
				display: block;
			}

			.picker {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			.empty {
				color: var(--cc-text-muted);
			}

			.action-bar {
				position: sticky;
				bottom: calc(
					var(--cc-tabbar-height) +
					var(--cc-space-3) +
					env(safe-area-inset-bottom, 0px)
				);
				z-index: 5;
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-lg);
			}


			.summary {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.summary.warned {
				color: var(--cc-warning);
				font-weight: 600;
			}

			.total {
				font-size: var(--cc-text-lg);
				font-variant-numeric: tabular-nums;
			}

			.action-bar button {
				align-self: center;
			}
		`,
	];

	/** The list's cards, in order. */
	@property({ attribute: false }) cards: Card[] = [];
	/** Ready cards not on the list, offered by Add another card. */
	/** Every card, so a planned payment on a group-mate not on the list still counts. */
	@property({ attribute: false }) allCards: Card[] = [];
	/** Planned payments (`plannedOf`). */
	@property({ attribute: false }) planned: CardPayment[] = [];
	@property({ attribute: false }) candidates: Card[] = [];
	@property({ attribute: false }) rooms: Map<string, GroupRoom> = new Map();
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map();
	@property() today: PlainDate = "";
	/** Read once, as the starting date. */
	@property() date: PlainDate = "";
	/** Read once, as the starting amounts. */
	@property({ attribute: false }) entries: Record<string, string> = {};

	// What the reader typed lives here, not in the inputs, so a re-render keeps it.
	@state() private typed: Record<string, string> = {};
	@state() private dateText = "";
	@state() private picking = false;
	private started = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: PropertyValues<this>) {
		super.willUpdate(changed);
		if (!this.started) {
			this.started = true;
			this.typed = { ...this.entries };
			this.dateText = this.date;
		}
	}

	/** The purchase date; an emptied or impossible field reads as today. */
	private get effectiveDate(): PlainDate {
		return isValidDate(this.dateText) ? this.dateText : this.today;
	}

	private amounts(): Record<string, number | null> {
		const out: Record<string, number | null> = {};
		for (const card of this.cards) {
			out[card.id] = lineAmount(this.typed[card.id] ?? "");
		}
		return out;
	}

	private emit(name: string, detail: unknown) {
		this.dispatchEvent(
			new CustomEvent(name, { detail, bubbles: true, composed: true }),
		);
	}

	private changed() {
		this.emit("entry-change", {
			date: this.effectiveDate,
			entries: { ...this.typed },
		});
	}

	private setAmount(cardId: string, text: string) {
		this.typed = { ...this.typed, [cardId]: text };
		this.changed();
	}

	private setDate(text: string) {
		this.dateText = text;
		this.changed();
	}

	private warningNote(card: Card, warning: AmountWarning, line: DraftLine) {
		const locale = getLocale();
		switch (warning.kind) {
			case "over-room":
				return html`
					<p class="note" data-warning="over-room">
						<span>${t("purchaseList.warn.overRoom", { over: formatAmount(warning.over) })}</span>
						${
							warning.held > 0
								? html`<span>${t("purchaseList.warn.held", {
										room: formatAmount(warning.room),
										held: formatAmount(warning.held),
									})}</span>`
								: nothing
						}
						${
							warning.plannedBefore > 0
								? html`<span data-part="planned">${t(
										"purchaseList.warn.planned",
										{
											amount: formatAmount(warning.plannedBefore),
										},
									)}</span>`
								: nothing
						}
						${
							warning.room > 0
								? html`<button data-variant="quiet" data-action="lower"
									@click=${() => this.setAmount(card.id, formatAmountInput(warning.room))}
								>${t("purchaseList.warn.lowerTo", { room: formatAmount(warning.room) })}</button>`
								: nothing
						}
					</p>
				`;
			case "shared-limit":
				return html`
					<p class="note" data-warning="shared-limit">
						${t("purchaseList.warn.shared", {
							cards: warning.cardIds.join(", "),
							group: line.room.group.name,
							over: formatAmount(warning.over),
							room: formatAmount(line.room.room),
						})}
					</p>
				`;
			case "overdue-bill":
				return html`
					<p class="note" data-warning="overdue-bill">
						<span>${t("purchaseList.warn.overdue", {
							card: card.id,
							date: displayDate(warning.dueDate, locale),
							remaining: formatAmount(warning.remaining),
						})}</span>
						<a data-action="see-card" href=${`/card?id=${encodeURIComponent(card.id)}`}
							>${t("purchaseList.warn.seeCard")}</a>
					</p>
				`;
			case "close-date":
				return html`
					<p class="note" data-warning="close-date">
						${t("purchaseList.warn.closeDate", {
							card: card.id,
							date: displayDate(warning.closeDate, locale),
						})}
					</p>
				`;
		}
	}

	override render() {
		const date = this.effectiveDate;
		const amounts = this.amounts();
		const money: Record<string, number> = {};
		for (const [id, amount] of Object.entries(amounts)) {
			money[id] = amount ?? 0;
		}
		const lines = draftLines(
			this.cards,
			money,
			this.rooms,
			this.ledgers,
			this.planned,
			date,
			this.allCards.length > 0 ? this.allCards : this.cards,
		);
		const passed = datePassed(date, this.today);

		let warned = 0;
		const sections = this.cards.map((card) => {
			const line = lines.find((l) => l.card.id === card.id);
			const warnings = line ? lineWarnings(line, lines, date, this.today) : [];
			const bad = amounts[card.id] === null;
			const warn = bad || warnings.length > 0;
			if (warn) warned++;
			const after =
				line && !bad ? formatAmount(roomAfter(line, lines)) : t("common.none");
			return html`
				<section class="line" data-card=${card.id} ?data-warn=${warn}>
					<div class="top" row>
						<b>${cardLabelHtml(card.id, card)}</b>
						<button data-variant="quiet" data-action="remove"
							@click=${() => this.emit("remove", { cardId: card.id })}
						>${t("purchaseList.remove")}</button>
					</div>
					<label class="bigin">
						<span>฿</span>
						<input inputmode="decimal" data-field="amount" placeholder="0"
							aria-label=${t("purchaseList.amountFor", { card: card.id })}
							.value=${live(this.typed[card.id] ?? "")}
							@input=${(e: Event) =>
								this.setAmount(
									card.id,
									(e.target as HTMLInputElement).value,
								)} />
					</label>
					${bad ? html`<p class="error">${t("quickAdd.error.badAmount")}</p>` : nothing}
					<div class="after" row>
						<span>${t("purchaseList.roomAfter")}</span>
						<b>${after}</b>
					</div>
					${line ? warnings.map((w) => this.warningNote(card, w, line)) : nothing}
				</section>
			`;
		});

		const values = Object.values(amounts);
		const total = values.reduce<number>((n, a) => n + (a ?? 0), 0);
		const canReview =
			values.some((a) => a !== null && a > 0) &&
			values.every((a) => a !== null);

		const parts: string[] = [];
		if (warned === 1) parts.push(t("purchaseList.warn.lines.one"));
		if (warned > 1)
			parts.push(t("purchaseList.warn.lines.many", { count: warned }));
		if (passed) parts.push(t("purchaseList.warn.datePassedShort"));
		const summary =
			parts.length > 0
				? html`<span class="summary warned">${parts.join(" · ")}</span>`
				: html`<span class="summary">${t(
						this.cards.length === 1
							? "purchaseList.total.one"
							: "purchaseList.total.many",
						{ count: this.cards.length },
					)}</span>`;

		return html`<div class="list-layout">
			<div class="list-layout__main">
			${this.cards.length === 0 ? html`<p class="empty">${t("purchaseList.noCards")}</p>` : html`<div class="lines">${sections}</div>`}
			<button data-variant="quiet" data-action="add-card"
				aria-expanded=${this.picking ? "true" : "false"}
				@click=${() => {
					this.picking = !this.picking;
				}}>+ ${t("purchaseList.addCard")}</button>
			${
				this.picking
					? html`<div class="picker">
						${this.candidates.map(
							(card) => html`<button data-variant="quiet" data-card=${card.id}
								@click=${() => this.emit("add", { cardId: card.id })}
							>${cardLabelText(card.id, card)}</button>`,
						)}
					</div>`
					: nothing
			}
			</div>
			<div class="list-layout__side">
			<div class="when" data-place="start">
				<label>${t("purchaseList.date")}
					<input type="date" data-field="date" .value=${live(this.dateText)}
						@input=${(e: Event) => this.setDate((e.target as HTMLInputElement).value)} />
				</label>
				${
					passed
						? html`<div class="note" data-warning="date-passed">
							<span>${t("purchaseList.warn.datePassed")}</span>
							<button data-variant="quiet" data-action="to-today"
								@click=${() => this.setDate(this.today)}
							>${t("purchaseList.warn.toToday")}</button>
						</div>`
						: nothing
				}
			</div>
			<div class="action-bar" row>
				${summary}
				<b class="total">${formatAmount(total)}</b>
				<button data-action="review" ?disabled=${!canReview}
					@click=${() =>
						this.emit("review", {
							date,
							lines: listLines(
								this.cards.map((c) => c.id),
								money,
							) satisfies ListLine[],
						})}
				>${t("purchaseList.review")} ›</button>
			</div>
			<slot name="side"></slot>
			</div>
		</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-amounts": CcListAmounts;
	}
}
