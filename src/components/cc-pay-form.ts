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
import type { Card, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardLabelHtml } from "#lib/ui/card-label";
import { base, controls, panel } from "#styles/shared";

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
 * The payment form for one card: the card and its figures, two shortcuts that fill the amount,
 * the amount and the date. A date after today plans the payment instead of recording it.
 */
@customElement("cc-pay-form")
export class CcPayForm extends LitElement {
	static override styles = [
		base,
		controls,
		panel,
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

			.card {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				font-size: var(--cc-text-2xl);
				font-weight: 700;
			}

			.card a {
				font-size: var(--cc-text-sm);
				font-weight: 500;
			}

			dl {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(calc(var(--cc-space-7) * 2), 1fr));
				gap: var(--cc-space-3);
			}

			dt {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			dd {
				margin: 0;
				font-weight: 600;
			}

			.chips {
				display: flex;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.chips button[data-chip] {
				border-radius: var(--cc-radius-pill);
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}

			button[type="submit"] {
				align-self: stretch;
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;
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

	override render() {
		const card = this.card;
		if (!card) return nothing;
		const { owed, credit, nextBill, overdue } = this.figures;
		const amount = amountOf(this.text);
		const ready = amount !== null && isValidDate(this.date);
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
						card: card.id,
						date: displayDate(this.date, locale),
					})
				: t("pay.submit.record", {
						amount: formatAmount(amount),
						card: card.id,
					});
		}
		return html`
			<cc-error-banner .message=${this.error} retry-label=${t("common.retry")}></cc-error-banner>
			<div class="card">
				<span>${cardLabelHtml(card.id, card)}</span>
				<a data-action="change" href="/pay">${t("pay.change")}</a>
			</div>
			<dl>
				<div><dt>${t("pay.owed")}</dt><dd data-numeric>${formatAmount(owed)}</dd></div>
				<div><dt>${t("pay.nextBill")}</dt><dd data-numeric>${formatAmount(nextBill)}</dd></div>
				<div><dt>${t("pay.credit")}</dt><dd data-numeric>${formatAmount(credit)}</dd></div>
			</dl>
			<form @submit=${this.onSubmit}>
				<div class="chips">
					${
						nextBill > 0
							? html`<button type="button" data-variant="quiet" data-chip="bill"
								@click=${() => this.fill(nextBill)}>${t(
									overdue ? "pay.chip.overdue" : "pay.chip.bill",
									{ amount: formatAmount(nextBill) },
								)}</button>`
							: nothing
					}
					${
						owed > 0 && owed !== nextBill
							? html`<button type="button" data-variant="quiet" data-chip="owed"
								@click=${() => this.fill(owed)}>${t("pay.chip.owed", {
									amount: formatAmount(owed),
								})}</button>`
							: nothing
					}
				</div>
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
				${
					preview && preview.extra > 0
						? html`<p class="note" data-note="extra">${t("pay.note.extra", {
								extra: formatAmount(preview.extra),
								card: card.id,
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
				<button type="submit" ?disabled=${!ready}>${submit}</button>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-pay-form": CcPayForm;
	}
}
