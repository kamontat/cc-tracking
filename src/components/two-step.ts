import {
	html,
	type ReactiveController,
	type ReactiveControllerHost,
	type TemplateResult,
} from "lit";
import { formatAmount } from "#lib/domain/money";
import type { Card, CardPayment, PurchaseList } from "#lib/domain/types";
import { t } from "#lib/i18n/index";
import { cardName } from "#lib/ui/card-label";

/*
 * The buttons that ask twice before they write (UI-09, DD-110), shared by every list of rows
 * that offers them (Needs you, the ledger, the Lists view). *Delete* on a payment swaps in
 * place for an asking *Delete* and *Cancel*; *Confirm* on a waiting list swaps for *Save* and
 * *Cancel*. Nothing is written until the second step. Focus follows each swap, so the keyboard
 * never drops to the page.
 *
 * Each builder returns bare buttons; the row puts them in its own `.a-btns`. A swap's pair sits
 * in a `.a-swap` span (`display: contents`, so it adds no box of its own) that carries
 * `data-confirming`.
 */

type Host = ReactiveControllerHost & { renderRoot: ParentNode };

/** A payment's key: its id repeats across cards (`PaymentRef` is `{ cardId, id }`). */
const planKey = (payment: CardPayment) => `${payment.cardId}:${payment.id}`;

export class TwoStepController implements ReactiveController {
	/** The payment (`planKey`) whose *Delete* asks its second step. */
	private plan: string | null = null;
	/** The waiting list whose *Confirm* asks its second step. */
	private list: string | null = null;
	/** The button to focus once the swap has rendered. */
	private refocus: { action: string; id: string } | null = null;

	constructor(private readonly host: Host) {
		host.addController(this);
	}

	hostConnected(): void {}

	hostUpdated(): void {
		const want = this.refocus;
		if (!want) return;
		this.refocus = null;
		const button = [
			...this.host.renderRoot.querySelectorAll<HTMLElement>(
				`[data-action="${want.action}"]`,
			),
		].find((b) => b.getAttribute("data-for") === want.id);
		button?.focus();
	}

	/** Ends any half-done swap: its row closed or went (`useOpenRow`'s `onChange`). */
	reset(): void {
		this.plan = null;
		this.list = null;
		this.refocus = null;
	}

	/** Swaps a row's buttons, then focuses the button `action` of row `id` in the new set. */
	private swap(change: () => void, action: string, id: string) {
		this.refocus = { action, id };
		change();
		this.host.requestUpdate();
	}

	/** A planned payment's buttons: *Paid* and *Delete* (DD-110). */
	planButtons(
		payment: CardPayment,
		card: Card | undefined,
		on: { paid: () => void; remove: () => void },
	): TemplateResult {
		if (this.plan === planKey(payment))
			return this.deleteSwap(payment, card, on.remove);
		return html`<button type="button" data-variant="quiet" data-action="mark-paid"
			@click=${on.paid}>${t("row.paid")}</button>${this.deleteButton(payment)}`;
	}

	/** A paid payment's *Delete* (DD-77). */
	paidButtons(
		payment: CardPayment,
		card: Card | undefined,
		remove: () => void,
	): TemplateResult {
		if (this.plan === planKey(payment))
			return this.deleteSwap(payment, card, remove);
		return this.deleteButton(payment);
	}

	private deleteButton(payment: CardPayment) {
		const key = planKey(payment);
		return html`<button type="button" data-variant="danger" data-action="delete" data-for=${key}
			@click=${() =>
				this.swap(
					() => {
						this.plan = key;
					},
					"confirm-delete",
					key,
				)}>${t("common.delete")}</button>`;
	}

	/** *Delete* (asks "Delete ฿X to NAME?" as its label) and *Cancel*, in place of the buttons. */
	private deleteSwap(
		payment: CardPayment,
		card: Card | undefined,
		remove: () => void,
	) {
		const key = planKey(payment);
		return html`<span class="a-swap" data-confirming=${key}><button type="button" data-variant="danger" data-action="confirm-delete" data-for=${key}
			aria-label=${t("tx.confirmDelete", { amount: formatAmount(payment.amount), card: cardName(payment.cardId, card) })}
			@click=${() => {
				this.plan = null;
				// If the write fails the row stays: focus then lands on its *Delete*.
				this.refocus = { action: "delete", id: key };
				this.host.requestUpdate();
				remove();
			}}>${t("common.delete")}</button><button type="button" data-action="cancel-delete"
			@click=${() =>
				this.swap(
					() => {
						this.plan = null;
					},
					"delete",
					key,
				)}>${t("common.cancel")}</button></span>`;
	}

	/** A waiting list's *Confirm*, which swaps for *Save* and *Cancel*; only *Save* writes. */
	listButtons(list: PurchaseList, confirm: () => void): TemplateResult {
		if (this.list !== list.id)
			return html`<button type="button" data-variant="quiet" data-action="confirm-list" data-for=${list.id}
				@click=${() =>
					this.swap(
						() => {
							this.list = list.id;
						},
						"save-list",
						list.id,
					)}>${t("row.confirm")}</button>`;
		const count = list.lines.length;
		return html`<span class="a-swap" data-confirming=${list.id}><button type="button" data-action="save-list" data-for=${list.id}
			aria-label=${count === 1 ? t("row.confirmAsk.one") : t("row.confirmAsk.many", { count })}
			@click=${() => {
				this.list = null;
				this.refocus = { action: "confirm-list", id: list.id };
				this.host.requestUpdate();
				confirm();
			}}>${t("row.save")}</button><button type="button" data-variant="quiet" data-action="cancel-confirm"
			@click=${() =>
				this.swap(
					() => {
						this.list = null;
					},
					"confirm-list",
					list.id,
				)}>${t("common.cancel")}</button></span>`;
	}
}

export function useTwoStep(host: Host): TwoStepController {
	return new TwoStepController(host);
}
