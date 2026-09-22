import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { compareDates, isValidDate } from "#lib/domain/date";
import { parseAmount } from "#lib/domain/money";
import type { Card, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";

export type QuickAddDetail = {
	cardId: string;
	date: PlainDate;
	amount: number;
	note: string;
};

@customElement("cc-quick-add")
export class CcQuickAdd extends LitElement {
	@property({ attribute: false }) cards: Card[] = [];
	@property() today: PlainDate = "";
	/** Set by the page after a successful save. */
	@property() answer = "";

	@state() private error = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const cardId = this.value("cardId");
		const date = this.value("date");
		if (!cardId) {
			this.error = t("quickAdd.error.noCard");
			return;
		}
		if (!isValidDate(date)) {
			this.error = t("quickAdd.error.badDate");
			return;
		}
		if (compareDates(date, this.today) > 0) {
			this.error = t("quickAdd.error.futureDate");
			return;
		}
		let amount: number;
		try {
			amount = parseAmount(this.value("amount"));
		} catch {
			this.error = t("quickAdd.error.badAmount");
			return;
		}
		this.error = "";
		this.dispatchEvent(
			new CustomEvent<QuickAddDetail>("add", {
				detail: { cardId, date, amount, note: this.value("note") },
			}),
		);
		const form = this.renderRoot.querySelector("form");
		form?.reset();
		// The date input is bound via the `.value` property, so `reset()` restores it to
		// its never-set `defaultValue` (empty) rather than `this.today`, and Lit's dirty
		// check then skips re-committing a binding whose value hasn't changed. Put it back
		// explicitly so a required field doesn't block the very next entry.
		const dateField = form?.querySelector<HTMLInputElement>('[name="date"]');
		if (dateField) dateField.value = this.today;
	}

	override render() {
		return html`
			<form @submit=${this.onSubmit}>
				${this.error ? html`<p role="alert"><mark>${this.error}</mark></p>` : nothing}
				<label>
					${t("quickAdd.card")}
					<select name="cardId" required>
						${this.cards.map(
							(card) =>
								html`<option value=${card.id}>${card.name} ••••${card.last4}</option>`,
						)}
					</select>
				</label>
				<label>${t("quickAdd.date")} <input name="date" type="date" .value=${this.today} required /></label>
				<label>${t("quickAdd.amount")} <input name="amount" inputmode="decimal" placeholder=${t("quickAdd.amountPlaceholder")} required /></label>
				<label>${t("quickAdd.note")} <input name="note" placeholder=${t("quickAdd.notePlaceholder")} /></label>
				<button type="submit">${t("quickAdd.submit")}</button>
				${this.answer ? html`<p><ins>${this.answer}</ins></p>` : nothing}
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-quick-add": CcQuickAdd;
	}
}
