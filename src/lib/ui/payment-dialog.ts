import "#components/cc-error-banner";
import "#components/cc-modal";
import "#components/cc-payment-form";
import { html, type TemplateResult } from "lit";
import type { PaymentDetail } from "#components/cc-payment-form";
import { addPart } from "#lib/domain/payment";
import type { PlainDate, Statement } from "#lib/domain/types";
import { t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";

/**
 * The dialog that records a payment, shared by the dashboard and the card page. As with the
 * purchase dialog, the page owns whether it is open and whether it has tried a save; pass ""
 * as `error` until it has, so an older page error does not greet a reader who just opened it.
 */
export const paymentDialog = (options: {
	statement: Statement;
	today: PlainDate;
	error: string;
	onPay: (event: CustomEvent<PaymentDetail>) => void;
	onClose: () => void;
	onRetry: () => void;
}): TemplateResult => html`
	<cc-modal heading=${t("payment.heading")} @close=${options.onClose}>
		<cc-error-banner .message=${options.error} retry-label=${t("common.reload")}
			@retry=${options.onRetry}></cc-error-banner>
		<cc-payment-form .statement=${options.statement} .today=${options.today}
			@pay=${options.onPay} @cancel=${options.onClose}></cc-payment-form>
	</cc-modal>
`;

/** Adds the payment `detail` describes to `statement`'s record and stores it. */
export const savePart = (
	repo: Repository,
	statement: Statement,
	detail: PaymentDetail,
): Promise<void> =>
	repo.savePayment(
		addPart(statement.payment, statement, {
			paidAt: detail.paidAt,
			amount: detail.amount,
		}),
	);
