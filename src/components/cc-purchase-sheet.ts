import "#components/cc-error-banner";
import "#components/cc-modal";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { isCloseDate } from "#lib/domain/cycle";
import { compareDates, isValidDate } from "#lib/domain/date";
import { amountOf, formatAmountInput } from "#lib/domain/money";
import type { Card, LimitGroup, PlainDate, Purchase } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardPanel } from "#lib/ui/card-label";
import { base, cardBits, controls } from "#styles/shared";

/**
 * A purchase in a sheet, the card fixed and named (FR-21), then its date, amount and note.
 * Given a saved `purchase` it edits it, with *Save changes*, keeping its id, card and
 * `addedAt`. With none it adds one, with *Save purchase*: dated today, blank otherwise, its id
 * made once when the sheet opens -- so a failed save retried writes the same record -- and
 * stamped `addedAt` now (DR-15). A date ahead of today or on the close day is warned about,
 * not refused (FR-20). Emits `save-purchase` with the purchase, and `close`. `error` says why
 * a save failed; what was typed stays (UI-11).
 */
@customElement("cc-purchase-sheet")
export class CcPurchaseSheet extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		css`
			:host {
				display: contents;
			}

			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.fixed {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
			}

			.fixed__label {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.fixed .card-panel {
				padding: var(--cc-space-3);
				font-weight: 600;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-sm);
			}

			.fields {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: var(--cc-space-3);
			}

			.fields .wide {
				grid-column: 1 / -1;
			}

			input {
				min-inline-size: 0;
				padding: var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			/* A caution, not a refusal. */
			.warning {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-warning);
				background: var(--cc-warning-surface);
				border-radius: var(--cc-radius-sm);
			}

			button[type="submit"] {
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
				border-radius: var(--cc-radius-sm);
			}
		`,
	];

	/** The card the purchase is on; it is shown, never picked. */
	@property({ attribute: false }) card: Card | null = null;
	/** Every stored group, for the card chip's pastel. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** The purchase to edit; none adds a new one. */
	@property({ attribute: false }) purchase: Purchase | null = null;
	/** The clock a new purchase's `addedAt` is read from. */
	@property({ attribute: false }) now: () => Date = () => new Date();
	@property() today: PlainDate = "";
	/** Why the last save failed; typing is kept. */
	@property() error = "";
	/** A save is under way: the button waits and the sheet holds open. */
	@property({ type: Boolean }) busy = false;

	@state() private date: PlainDate = "";
	@state() private amount = "";
	@state() private note = "";
	// The catalog key, so a language switch re-renders the message in place.
	@state() private errorKey: MessageKey | "" = "";
	/** The purchase id the fields were last filled from; unset before the first fill. */
	private filledFor: string | undefined = undefined;
	/** A new purchase's id, made when the add sheet opens on a card. */
	private newId = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	/**
	 * Fills the fields only when the sheet turns to another purchase (by id), so a fresh copy of
	 * the same purchase -- a reload after a failed save -- keeps what was typed.
	 */
	protected override willUpdate(changed: PropertyValues<this>) {
		if (!changed.has("purchase") && !changed.has("card")) return;
		const purchase = this.purchase;
		if (!purchase) {
			// Adding: a fresh, blank purchase each time the sheet turns to another card.
			const key = this.card ? `new:${this.card.id}` : undefined;
			if (!key || key === this.filledFor) return;
			this.filledFor = key;
			this.newId = crypto.randomUUID();
			this.date = this.today;
			this.amount = "";
			this.note = "";
			this.errorKey = "";
			return;
		}
		if (purchase.id === this.filledFor) return;
		this.filledFor = purchase.id;
		this.date = purchase.date;
		this.amount = formatAmountInput(purchase.amount);
		this.note = purchase.note;
		this.errorKey = "";
	}

	private get inFuture(): boolean {
		return isValidDate(this.date) && compareDates(this.date, this.today) > 0;
	}

	private get onCloseDate(): boolean {
		return (
			this.card !== null &&
			isValidDate(this.date) &&
			isCloseDate(this.card.cycle, this.date)
		);
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		if (this.busy) return;
		const purchase = this.purchase;
		const card = this.card;
		if (!purchase && !card) return;
		const date = this.date.trim();
		if (!isValidDate(date)) {
			this.errorKey = "quickAdd.error.badDate";
			return;
		}
		const amount = amountOf(this.amount.trim());
		if (amount === null) {
			this.errorKey = "quickAdd.error.badAmount";
			return;
		}
		this.errorKey = "";
		const note = this.note.trim();
		const detail: Purchase = purchase
			? {
					id: purchase.id,
					cardId: purchase.cardId,
					date,
					amount,
					note,
					...(purchase.addedAt ? { addedAt: purchase.addedAt } : {}),
				}
			: {
					id: this.newId,
					cardId: card?.id ?? "",
					date,
					amount,
					note,
					addedAt: this.now().toISOString(),
				};
		this.dispatchEvent(new CustomEvent<Purchase>("save-purchase", { detail }));
	}

	private field(
		name: "date" | "amount" | "note",
		label: string,
		extra: { type?: string; inputmode?: string; placeholder?: string } = {},
	) {
		return html`<label class=${name === "note" ? "wide" : ""}>${label}
			<input name=${name} type=${extra.type ?? "text"}
				inputmode=${extra.inputmode ?? nothing}
				placeholder=${extra.placeholder ?? nothing}
				autocomplete="off"
				.value=${this[name]}
				@input=${(e: Event) => {
					this[name] = (e.target as HTMLInputElement).value;
				}} /></label>`;
	}

	override render() {
		const card = this.card;
		const adding = this.purchase === null;
		return html`<cc-modal sheet .held=${this.busy}
			heading=${t(adding ? "card.purchase.add" : "card.purchase.edit")}
			@close=${(event: Event) => {
				event.stopPropagation();
				this.dispatchEvent(new CustomEvent("close"));
			}}>
			<cc-error-banner .message=${this.error} no-retry></cc-error-banner>
			<form @submit=${this.onSubmit} novalidate>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				${
					card
						? html`<div class="fixed" data-field="card">
							<span class="fixed__label">${t("quickAdd.card")}</span>
							${cardPanel(card.id, card, this.groups)}
						</div>`
						: nothing
				}
				<div class="fields">
					${this.field("date", t("quickAdd.date"), { type: "date" })}
					${this.field("amount", t("quickAdd.amount"), {
						inputmode: "decimal",
						placeholder: t("quickAdd.amountPlaceholder"),
					})}
					${this.field("note", t("quickAdd.note"), {
						placeholder: t("quickAdd.notePlaceholder"),
					})}
				</div>
				${
					this.inFuture
						? html`<p class="warning" data-testid="future-date-warning">${t("quickAdd.futureDateWarning")}</p>`
						: nothing
				}
				${
					this.onCloseDate
						? html`<p class="warning" data-testid="close-date-warning">${t("quickAdd.closeDateWarning")}</p>`
						: nothing
				}
				<button type="submit" ?disabled=${this.busy}>${t(adding ? "card.purchase.saveNew" : "quickAdd.save")}</button>
			</form>
		</cc-modal>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-purchase-sheet": CcPurchaseSheet;
	}
}
