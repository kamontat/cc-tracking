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

			.form-actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			/*
			 * The one card there is to add against, shown as a field rather than a picker with a
			 * single option -- the same treatment cc-card-form gives a saved card's locked id: a
			 * label's muted type above a value carrying an input's padding, with no box.
			 */
			.readonly {
				gap: var(--cc-space-1);
			}

			.readonly__label {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.readonly__value {
				padding-block: var(--cc-space-2);
				border-block: var(--cc-border-width) solid transparent;
			}
		`,
	];

	@property({ attribute: false }) cards: Card[] = [];
	@property() today: PlainDate = "";
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

	/** The card, when there is only one to choose -- the card page's own. Nothing to pick then. */
	private get onlyCard(): Card | null {
		return this.cards.length === 1 ? (this.cards[0] ?? null) : null;
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
		const only = this.onlyCard;
		const cardId = only ? only.id : this.value("cardId");
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
		// No reset after the add: the page renders this form only inside an open dialog and
		// closes it once the save lands, so the next purchase gets a fresh form -- and a save
		// that fails leaves the reader's typing in place to retry.
		this.errorKey = "";
		this.dispatchEvent(
			new CustomEvent<QuickAddDetail>("add", {
				detail: { cardId, date, amount, note: this.value("note") },
			}),
		);
	}

	override render() {
		// The page hands over only the cards a purchase may be entered against, so an empty
		// list means every card is turned off -- not that there are no cards at all.
		if (this.cards.length === 0) {
			return html`<p>${t("quickAdd.noEligible")}</p>`;
		}
		const only = this.onlyCard;
		return html`
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				${
					only
						? html`
							<div class="readonly" data-field="card">
								<span class="readonly__label">${t("quickAdd.card")}</span>
								<span class="readonly__value">${only.id} — ${only.name}</span>
							</div>
						`
						: html`
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
						`
				}
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
				<div class="form-actions" row>
					<button type="submit">${t("quickAdd.submit")}</button>
					<button type="button" data-variant="quiet" data-action="cancel"
						@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
				</div>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-quick-add": CcQuickAdd;
	}
}
