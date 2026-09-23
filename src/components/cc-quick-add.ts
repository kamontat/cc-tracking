import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { compareDates, isValidDate } from "#lib/domain/date";
import type { SpendRow } from "#lib/domain/limit";
import { formatAmount, parseAmount } from "#lib/domain/money";
import type { Card, PlainDate } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

export type QuickAddDetail = {
	cardId: string;
	date: PlainDate;
	amount: number;
	note: string;
};

@customElement("cc-quick-add")
export class CcQuickAdd extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.answer {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-success);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			button[type="submit"] {
				align-self: stretch;
				text-align: center;
			}
		`,
	];

	@property({ attribute: false }) cards: Card[] = [];
	@property() today: PlainDate = "";
	/** Set by the page after a successful save. */
	@property() answer = "";
	/** Rows for the cards above, from `spendableRows`. A card with no row shows no credit. */
	@property({ attribute: false }) rows: SpendRow[] = [];

	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";
	@state() private selectedId = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		// The options are rendered by an unkeyed map, so when `cards` changes shape (a card
		// archived or removed elsewhere), Lit reuses <option> DOM nodes by position rather than
		// by card id -- the browser's native selection can end up silently pointing at a
		// different card's value, with no change event to catch it. Re-validate the tracked
		// selection against the new list here, before render, falling back to the first card
		// when the old one is gone -- a property set in willUpdate is folded into this same
		// render pass rather than scheduling a second one.
		if (!changed.has("cards")) return;
		if (!this.cards.some((card) => card.id === this.selectedId)) {
			this.selectedId = this.cards[0]?.id ?? "";
		}
	}

	override updated(changed: Map<string, unknown>) {
		// The select's actual selection is native DOM state that render() alone doesn't drive,
		// so once willUpdate has settled `selectedId` against the current `cards`, write it onto
		// the element explicitly to bring the DOM in line with it.
		if (!changed.has("cards")) return;
		const select =
			this.renderRoot.querySelector<HTMLSelectElement>('[name="cardId"]');
		if (select) select.value = this.selectedId;
	}

	private get selected(): SpendRow | null {
		const id = this.selectedId || this.cards[0]?.id;
		return this.rows.find((row) => row.card.id === id) ?? null;
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
			this.errorKey = "quickAdd.error.noCard";
			return;
		}
		if (!isValidDate(date)) {
			this.errorKey = "quickAdd.error.badDate";
			return;
		}
		if (compareDates(date, this.today) > 0) {
			this.errorKey = "quickAdd.error.futureDate";
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
		// The card select also goes back to its first option on reset, so the tracked
		// selection must follow -- otherwise the note keeps describing the card that was
		// just used rather than the one now selected.
		this.selectedId = "";
	}

	override render() {
		// The page hands over only the cards a purchase may be entered against, so an empty
		// list means every card is turned off -- not that there are no cards at all.
		if (this.cards.length === 0) {
			return html`<p>${t("quickAdd.noEligible")}</p>`;
		}
		return html`
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				<label>
					${t("quickAdd.card")}
					<select
						name="cardId"
						required
						@change=${(event: Event) => {
							this.selectedId = (event.target as HTMLSelectElement).value;
						}}
					>
						${this.cards.map(
							(card) =>
								html`<option value=${card.id}>${card.id} — ${card.name}</option>`,
						)}
					</select>
				</label>
				${
					this.selected
						? html`<p data-testid="available"><small>${t("quickAdd.available", {
								available: formatAmount(this.selected.available),
								limit: formatAmount(this.selected.group.limit),
							})}</small></p>`
						: nothing
				}
				<label>${t("quickAdd.date")} <input name="date" type="date" .value=${this.today} required /></label>
				<label>${t("quickAdd.amount")} <input name="amount" inputmode="decimal" placeholder=${t("quickAdd.amountPlaceholder")} required /></label>
				<label>${t("quickAdd.note")} <input name="note" placeholder=${t("quickAdd.notePlaceholder")} /></label>
				<button type="submit">${t("quickAdd.submit")}</button>
				${this.answer ? html`<p class="answer">${this.answer}</p>` : nothing}
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-quick-add": CcQuickAdd;
	}
}
