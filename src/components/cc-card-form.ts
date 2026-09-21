import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Card, CycleRule } from "#lib/domain/types.ts";

@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	// Pico styles the light DOM, so this component renders without shadow styles of its own.
	@property({ attribute: false }) card: Card | null = null;
	@property({ attribute: false }) locations: string[] = [];

	@state() private kind: CycleRule["kind"] = "offset";
	@state() private error = "";

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("card") && this.card) this.kind = this.card.cycle.kind;
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

		if (!id) return this.fail("Give the card an id you will recognise.");
		if (!this.value("name")) return this.fail("Give the card a name.");
		if (!/^\d{4}$/.test(last4))
			return this.fail("Last 4 must be exactly four digits.");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("Closing day must be between 1 and 31.");
		}

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = Number(this.value("dueOffsetDays"));
			if (
				!Number.isInteger(dueOffsetDays) ||
				dueOffsetDays < 1 ||
				dueOffsetDays > 60
			) {
				return this.fail("Days until due must be between 1 and 60.");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = Number(this.value("dueDay"));
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("Due day must be between 1 and 31.");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		this.error = "";
		const wasCreate = this.card === null;
		const card: Card = {
			id,
			name: this.value("name"),
			last4,
			location: this.value("location"),
			cycle,
			comment: this.value("comment"),
			archived: this.card?.archived ?? false,
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
			const offsetRadio = form?.querySelector<HTMLInputElement>(
				'[name="kind"][value="offset"]',
			);
			if (offsetRadio) offsetRadio.checked = true;
		}
	}

	private fail(message: string) {
		this.error = message;
	}

	override render() {
		const card = this.card;
		const rule = card?.cycle;
		return html`
			<form @submit=${this.onSubmit}>
				${this.error ? html`<p role="alert"><mark>${this.error}</mark></p>` : nothing}

				${
					card
						? html`<p>Id <strong>${card.id}</strong> <small>(cannot change)</small></p>`
						: html`<label>Id <input name="id" placeholder="kbank-visa" required /></label>`
				}

				<label>Name <input name="name" .value=${card?.name ?? ""} required /></label>
				<label>Last 4 <input name="last4" inputmode="numeric" .value=${card?.last4 ?? ""} required /></label>
				<label>
					Location
					<input name="location" list="cc-locations" .value=${card?.location ?? ""} required />
					<datalist id="cc-locations">
						${this.locations.map((value) => html`<option value=${value}></option>`)}
					</datalist>
				</label>

				<fieldset>
					<legend>Billing cycle</legend>
					<label>
						<input type="radio" name="kind" value="offset"
							.checked=${this.kind === "offset"}
							@change=${() => {
								this.kind = "offset";
							}} />
						Due a number of days after closing
					</label>
					<label>
						<input type="radio" name="kind" value="fixed"
							.checked=${this.kind === "fixed"}
							@change=${() => {
								this.kind = "fixed";
							}} />
						Due on a fixed day of the month
					</label>
				</fieldset>

				<label>Closing day <input name="closeDay" type="number" min="1" max="31"
					.value=${String(rule?.closeDay ?? "")} required /></label>

				${
					this.kind === "offset"
						? html`<label>Days until due <input name="dueOffsetDays" type="number" min="1" max="60"
							.value=${String(rule?.kind === "offset" ? rule.dueOffsetDays : "")} required /></label>`
						: html`<label>Due day <input name="dueDay" type="number" min="1" max="31"
							.value=${String(rule?.kind === "fixed" ? rule.dueDay : "")} required /></label>`
				}

				<label>Comment <input name="comment" .value=${card?.comment ?? ""} /></label>

				<button type="submit">${card ? "Save changes" : "Add card"}</button>
				<button type="button" class="secondary"
					@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>Cancel</button>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
