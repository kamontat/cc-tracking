import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { canPurchase, PURCHASE_LOCATION } from "#lib/domain/card";
import { DEFAULT_LOCATION, LOCATIONS, toLocation } from "#lib/domain/location";
import type { Card, CycleRule } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: grid;
				grid-template-columns: 1fr;
				gap: var(--cc-space-3);
			}

			@media (min-width: 640px) {
				form {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				fieldset,
				.form-actions,
				p[role="alert"] {
					grid-column: 1 / -1;
				}
			}

			fieldset {
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-4);
			}

			.form-actions {
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;

	@state() private kind: CycleRule["kind"] = "offset";
	@state() private allowPurchase = false;
	// Once the user has had an opinion about the box, the location select stops having one.
	@state() private purchaseTouched = false;
	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (!changed.has("card")) return;
		if (this.card) this.kind = this.card.cycle.kind;
		this.allowPurchase = this.card ? canPurchase(this.card) : false;
		this.purchaseTouched = false;
	}

	override updated(changed: Map<string, unknown>) {
		// Only when the edit target changes: doing this on every update would fight the user's
		// own selection, which re-renders on any @state change.
		if (!changed.has("card")) return;
		const select =
			this.renderRoot.querySelector<HTMLSelectElement>('[name="location"]');
		if (select) select.value = this.card?.location ?? DEFAULT_LOCATION;
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
		const id = this.card ? this.card.id : this.value("id");
		const last4 = this.value("last4");
		const closeDay = Number(this.value("closeDay"));

		if (!id) return this.fail("form.error.id");
		if (!this.value("name")) return this.fail("form.error.name");
		if (!/^\d{4}$/.test(last4)) return this.fail("form.error.last4");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("form.error.closeDay");
		}
		const location = toLocation(this.value("location"));
		if (!location) return this.fail("form.error.location");

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = Number(this.value("dueOffsetDays"));
			if (
				!Number.isInteger(dueOffsetDays) ||
				dueOffsetDays < 1 ||
				dueOffsetDays > 60
			) {
				return this.fail("form.error.dueOffsetDays");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = Number(this.value("dueDay"));
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("form.error.dueDay");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		this.errorKey = "";
		const wasCreate = this.card === null;
		const card: Card = {
			id,
			name: this.value("name"),
			last4,
			location,
			cycle,
			comment: this.value("comment"),
			archived: this.card?.archived ?? false,
			canPurchase: this.allowPurchase,
		};
		this.dispatchEvent(new CustomEvent<Card>("save", { detail: card }));

		if (wasCreate) {
			// The bindings above are `.value=${card?.name ?? ""}`, so after a create `this.card`
			// is still null and every expression re-evaluates to the same "" it last committed —
			// Lit's dirty check then skips the DOM write and the typed text stays put. A native
			// form reset bypasses that check entirely, the same trick already used in
			// cc-quick-add's date field. The `checked` bindings are set as properties too, never
			// as the `checked` attribute, so `reset()` leaves both radios unchecked regardless of
			// `this.kind`; set the DOM directly rather than trust a Lit re-render to fix it.
			const form = this.renderRoot.querySelector("form");
			form?.reset();
			this.kind = "offset";
			this.allowPurchase = false;
			this.purchaseTouched = false;
			const offsetRadio = form?.querySelector<HTMLInputElement>(
				'[name="kind"][value="offset"]',
			);
			if (offsetRadio) offsetRadio.checked = true;
			const locationSelect =
				form?.querySelector<HTMLSelectElement>('[name="location"]');
			if (locationSelect) locationSelect.value = DEFAULT_LOCATION;
		}
	}

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	/**
	 * A card being created follows its location until the user says otherwise: the Krabi cards
	 * are the ones purchases are entered against today, so the box arrives already ticked for
	 * them. An existing card is left alone -- its stored answer is the user's, not the
	 * location's, and moving a card must not silently revoke it.
	 */
	private onLocationInput(event: Event) {
		if (this.card || this.purchaseTouched) return;
		this.allowPurchase =
			(event.target as HTMLSelectElement).value === PURCHASE_LOCATION;
	}

	private onPurchaseChange(event: Event) {
		this.allowPurchase = (event.target as HTMLInputElement).checked;
		this.purchaseTouched = true;
	}

	override render() {
		const card = this.card;
		const rule = card?.cycle;
		return html`
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}

				${
					card
						? html`<p>${t("form.id")} <strong>${card.id}</strong> <small>${t("form.idImmutable")}</small></p>`
						: html`<label>${t("form.id")} <input name="id" placeholder=${t("form.idPlaceholder")} required /></label>`
				}

				<label>${t("form.name")} <input name="name" .value=${card?.name ?? ""} required /></label>
				<label>${t("form.last4")} <input name="last4" inputmode="numeric" .value=${card?.last4 ?? ""} required /></label>
				<label>
					${t("form.location")}
					<select name="location" required @input=${this.onLocationInput}>
						${LOCATIONS.map(
							(value) =>
								html`<option value=${value}>${locationText(value)}</option>`,
						)}
					</select>
				</label>

				<label>
					<input type="checkbox" name="canPurchase"
						.checked=${this.allowPurchase}
						@change=${this.onPurchaseChange} />
					${t("form.canPurchase")}
				</label>

				<fieldset>
					<legend>${t("form.cycle")}</legend>
					<label>
						<input type="radio" name="kind" value="offset"
							.checked=${this.kind === "offset"}
							@change=${() => {
								this.kind = "offset";
							}} />
						${t("form.cycleOffset")}
					</label>
					<label>
						<input type="radio" name="kind" value="fixed"
							.checked=${this.kind === "fixed"}
							@change=${() => {
								this.kind = "fixed";
							}} />
						${t("form.cycleFixed")}
					</label>
				</fieldset>

				<label>${t("form.closeDay")} <input name="closeDay" type="number" min="1" max="31"
					.value=${String(rule?.closeDay ?? "")} required /></label>

				${
					this.kind === "offset"
						? html`<label>${t("form.dueOffsetDays")} <input name="dueOffsetDays" type="number" min="1" max="60"
							.value=${String(rule?.kind === "offset" ? rule.dueOffsetDays : "")} required /></label>`
						: html`<label>${t("form.dueDay")} <input name="dueDay" type="number" min="1" max="31"
							.value=${String(rule?.kind === "fixed" ? rule.dueDay : "")} required /></label>`
				}

				<label>${t("form.comment")} <input name="comment" .value=${card?.comment ?? ""} /></label>

				<div class="form-actions" row>
					<button type="submit">${card ? t("form.save") : t("form.add")}</button>
					<button type="button" data-variant="quiet"
						@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
				</div>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
