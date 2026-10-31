import "#components/cc-error-banner";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { displayDate, isValidDate } from "#lib/domain/date";
import {
	formatAmount,
	formatAmountInput,
	parseAmount,
} from "#lib/domain/money";
import { payPreview } from "#lib/domain/pay";
import type { Card, LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardMetaText, cardMini } from "#lib/ui/card-label";
import { base, cardBits, controls } from "#styles/shared";

export type PayDetail = {
	/** Satang. */
	amount: number;
	date: PlainDate;
};

export type PayFigures = {
	owed: number;
	credit: number;
	nextBill: number;
	overdue: boolean;
};

const amountOf = (text: string): number | null => {
	try {
		return parseAmount(text);
	} catch {
		return null;
	}
};

/**
 * The payment sheet's second step, for one card: the card with *Change*, its owed, next bill
 * and credit, chips that fill the amount, the amount and the date. A date after today plans
 * the payment instead of recording it. Emits `pay` with the amount and date, and `change` to go
 * back to the card picker.
 */
@customElement("cc-pay-form")
export class CcPayForm extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.paycard {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto;
				align-items: center;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3);
				line-height: 1.35;
				background: var(--cc-surface);
				border: calc(var(--cc-border-width) * 1.5) solid var(--cc-accent);
				border-radius: var(--cc-radius-md);
			}

			.paycard .what {
				display: flex;
				flex-direction: column;
				min-inline-size: 0;
			}

			.paycard .what b {
				font-size: var(--cc-text-md);
			}

			.paycard .card-meta {
				font-size: var(--cc-text-sm);
			}

			.paycard button {
				align-self: center;
			}

			.stats {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: var(--cc-space-2);
			}

			.stat {
				gap: calc(var(--cc-space-1) * 0.75);
				padding: var(--cc-space-2) var(--cc-space-3);
				line-height: 1.3;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-sm);
			}

			.stat small {
				font-size: var(--cc-text-xs);
				font-weight: 600;
				text-transform: uppercase;
				letter-spacing: 0.06em;
			}

			.stat b {
				font-size: var(--cc-text-md);
				overflow-wrap: anywhere;
			}

			.stat b[data-overdue] {
				color: var(--cc-danger);
			}

			.chips {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.chips button[data-chip] {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-weight: 400;
				color: var(--cc-text);
				background: var(--cc-surface-sunken);
				border-color: transparent;
				border-radius: var(--cc-radius-pill);
			}

			.chips button[data-chip]:hover {
				background: var(--cc-border);
			}

			.chips button[data-chip][aria-pressed="true"] {
				font-weight: 600;
				color: var(--cc-success);
				background: var(--cc-accent-surface);
			}

			.fields {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: var(--cc-space-3);
			}

			.fields input {
				min-inline-size: 0;
				padding: var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			.note {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}

			.note[data-note="extra"] {
				background: var(--cc-accent-surface);
			}

			button[type="submit"] {
				align-self: stretch;
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
				white-space: normal;
				border-radius: var(--cc-radius-sm);
			}

			.hint {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				text-align: center;
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;
	/** The stored limit groups, in order: the card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property({ attribute: false }) figures: PayFigures = {
		owed: 0,
		credit: 0,
		nextBill: 0,
		overdue: false,
	};
	@property() today: PlainDate = "";
	/** The amount's first text; typing replaces it. */
	@property() amount = "";
	/** Why the last save failed, shown above the form; typing is kept. */
	@property() error = "";

	/** A save is under way; the button waits so a second tap cannot record it twice. */
	@property({ type: Boolean }) busy = false;

	@state() private text = "";
	@state() private date: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("amount")) this.text = this.amount;
		if (changed.has("today") && this.date === "") this.date = this.today;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		if (this.busy) return;
		const amount = amountOf(this.text);
		if (amount === null || !isValidDate(this.date)) return;
		this.dispatchEvent(
			new CustomEvent<PayDetail>("pay", {
				detail: { amount, date: this.date },
			}),
		);
	}

	private fill(satang: number) {
		this.text = formatAmountInput(satang);
	}

	private chip(kind: "bill" | "owed", satang: number, label: string) {
		return html`<button type="button" data-variant="quiet" data-chip=${kind}
			aria-pressed=${amountOf(this.text) === satang ? "true" : "false"}
			@click=${() => this.fill(satang)}>${label}</button>`;
	}

	override render() {
		const card = this.card;
		if (!card) return nothing;
		const { owed, credit, nextBill, overdue } = this.figures;
		const amount = amountOf(this.text);
		const ready = amount !== null && amount > 0 && isValidDate(this.date);
		const preview =
			ready && amount !== null
				? payPreview(amount, this.date, owed, this.today)
				: null;
		const locale = getLocale();
		let submit = t("pay.submit.empty");
		if (preview && amount !== null) {
			submit = preview.plan
				? t("pay.submit.plan", {
						amount: formatAmount(amount),
						card: card.name,
						date: displayDate(this.date, locale),
					})
				: t("pay.submit.record", {
						amount: formatAmount(amount),
						card: card.name,
					});
		}
		return html`
			<cc-error-banner .message=${this.error} no-retry></cc-error-banner>
			<div class="paycard">
				${cardMini(card, this.groups, true)}
				<span class="what"><b>${card.name}</b><small class="card-meta">${cardMetaText(card)}</small></span>
				<button type="button" data-variant="quiet" data-action="change"
					@click=${() => this.dispatchEvent(new CustomEvent("change"))}>${t("pay.change")}</button>
			</div>
			<div class="stats">
				<div class="stat" data-stat="owed"><small>${t("pay.owed")}</small>
					<b data-numeric>${formatAmount(owed)}</b></div>
				<div class="stat" data-stat="bill"><small>${t("pay.nextBill")}</small>
					<b data-numeric
					?data-overdue=${overdue && nextBill > 0}>${nextBill > 0 ? formatAmount(nextBill) : t("common.none")}</b></div>
				<div class="stat" data-stat="credit"><small>${t("pay.credit")}</small>
					<b data-numeric>${formatAmount(credit)}</b></div>
			</div>
			<form @submit=${this.onSubmit}>
				${
					nextBill > 0 || owed > 0
						? html`<div class="chips">
							${
								nextBill > 0
									? this.chip(
											"bill",
											nextBill,
											t(overdue ? "pay.chip.overdue" : "pay.chip.bill", {
												amount: formatAmount(nextBill),
											}),
										)
									: nothing
							}
							${
								owed > 0 && owed !== nextBill
									? this.chip(
											"owed",
											owed,
											t("pay.chip.owed", { amount: formatAmount(owed) }),
										)
									: nothing
							}
						</div>`
						: nothing
				}
				<div class="fields">
					<label>${t("pay.amount")}
						<input name="amount" inputmode="decimal" .value=${this.text}
							placeholder=${t("quickAdd.amountPlaceholder")}
							@input=${(e: Event) => {
								this.text = (e.target as HTMLInputElement).value;
							}} /></label>
					<label>${t("pay.date")}
						<input name="date" type="date" .value=${this.date}
							@input=${(e: Event) => {
								this.date = (e.target as HTMLInputElement).value;
							}} /></label>
				</div>
				${
					preview && preview.extra > 0
						? html`<p class="note" data-note="extra">${t("pay.note.extra", {
								extra: formatAmount(preview.extra),
								card: card.name,
							})}</p>`
						: nothing
				}
				${
					preview?.plan
						? html`<p class="note" data-note="plan">${t("pay.note.plan", {
								date: displayDate(this.date, locale),
							})}</p>`
						: nothing
				}
				<button type="submit" ?disabled=${!ready || this.busy}>${submit}</button>
				<p class="hint">${t("pay.dateHint")}</p>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-pay-form": CcPayForm;
	}
}
