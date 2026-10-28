import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { isValidDate } from "#lib/domain/date";
import {
	formatAmount,
	formatAmountInput,
	parseAmount,
} from "#lib/domain/money";
import type { PlainDate, Statement } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

export type PaymentDetail = {
	cardId: string;
	period: string;
	paidAt: PlainDate;
	/** Satang. */
	amount: number;
};

/**
 * Records one payment toward a statement. Starts at today and at whatever is left, so paying a
 * statement off in one go is a single click, and paying part of it is a matter of changing the
 * amount.
 */
@customElement("cc-payment-form")
export class CcPaymentForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.form-actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.balance {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}
		`,
	];

	@property({ attribute: false }) statement: Statement | null = null;
	@property() today: PlainDate = "";

	// A catalog key, not a sentence, so a language switch re-renders it in the new language.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const statement = this.statement;
		if (!statement) return;
		const paidAt = this.value("date");
		if (!isValidDate(paidAt)) {
			this.errorKey = "quickAdd.error.badDate";
			return;
		}
		let amount: number;
		try {
			amount = parseAmount(this.value("amount"));
		} catch {
			this.errorKey = "quickAdd.error.badAmount";
			return;
		}
		this.errorKey = "";
		this.dispatchEvent(
			new CustomEvent<PaymentDetail>("pay", {
				detail: {
					cardId: statement.cardId,
					period: statement.period,
					paidAt,
					amount,
				},
			}),
		);
	}

	override render() {
		const statement = this.statement;
		if (!statement) return nothing;
		return html`
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				<p class="balance">${t("payment.balance", {
					period: statement.period,
					total: formatAmount(statement.total),
					paid: formatAmount(statement.paidAmount),
					left: formatAmount(statement.remaining),
				})}</p>
				<label>${t("payment.date")} <input name="date" type="date" .value=${this.today} required /></label>
				<label>${t("quickAdd.amount")} <input name="amount" inputmode="decimal"
					placeholder=${t("quickAdd.amountPlaceholder")}
					.value=${statement.remaining > 0 ? formatAmountInput(statement.remaining) : ""} required /></label>
				<div class="form-actions" row>
					<button type="submit">${t("payment.submit")}</button>
					<button type="button" data-variant="quiet" data-action="cancel"
						@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
				</div>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-payment-form": CcPaymentForm;
	}
}
