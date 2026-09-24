import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmountInput, parseAmount } from "#lib/domain/money";
import { DEFAULT_OWNER, OWNERS, toOwner } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

@customElement("cc-limit-group-form")
export class CcLimitGroupForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}

			form {
				display: flex;
				flex-wrap: wrap;
				align-items: flex-end;
				gap: var(--cc-space-3);
			}

			/* An error speaks for the whole form, so it takes a line of its own above the fields. */
			p[role="alert"] {
				flex-basis: 100%;
			}

			.form-actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) group: LimitGroup | null = null;

	// The reader's own answer to "is this section open", not a mirror of `group`: it is forced
	// open when an edit target arrives, and otherwise follows the element's own toggle event, so
	// a section closed by hand stays closed through every later repaint.
	@state() private open = false;
	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("group") && this.group) this.open = true;
	}

	override updated(changed: Map<string, unknown>) {
		// A <select> takes its value from the element, not from an `<option>` binding, and only
		// when the edit target changes -- doing this on every update would fight the reader's own
		// choice, which re-renders on any @state change.
		if (!changed.has("group")) return;
		const owner =
			this.renderRoot.querySelector<HTMLSelectElement>('[name="owner"]');
		if (owner) owner.value = toOwner(this.group?.owner) ?? DEFAULT_OWNER;
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const name = this.value("name");
		if (!name) return this.fail("limits.error.name");

		let limit: number;
		try {
			limit = parseAmount(this.value("limit"));
		} catch {
			return this.fail("limits.error.limit");
		}

		const owner = toOwner(this.value("owner"));
		if (!owner) return this.fail("limits.error.owner");

		this.errorKey = "";
		const wasCreate = this.group === null;
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: {
					id: this.group?.id ?? crypto.randomUUID(),
					name,
					limit,
					owner,
				},
			}),
		);

		if (wasCreate) {
			// Bindings re-evaluate to the same "" they last committed after a create, so Lit's
			// dirty check skips the DOM write and the typed text stays put. A native reset
			// bypasses it, the same trick cc-card-form and cc-quick-add use. A <select>'s value
			// is not restored by reset() either, so it is written back by hand.
			const form = this.renderRoot.querySelector("form");
			form?.reset();
			const owned = form?.querySelector<HTMLSelectElement>('[name="owner"]');
			if (owned) owned.value = DEFAULT_OWNER;
		}
	}

	override render() {
		const group = this.group;
		return html`
			<details ?open=${this.open} @toggle=${(event: Event) => {
				this.open = (event.target as HTMLDetailsElement).open;
			}}>
				<summary>${group ? t("limits.edit", { name: group.name }) : t("limits.add")}</summary>
				<form @submit=${this.onSubmit}>
					${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
					<label>${t("limits.name")} <input name="name" .value=${group?.name ?? ""}
						placeholder=${t("limits.namePlaceholder")} required /></label>
					<label>${t("limits.limit")} <input name="limit" inputmode="decimal"
						.value=${group ? formatAmountInput(group.limit) : ""}
						placeholder=${t("limits.limitPlaceholder")} required /></label>
					<label>
						${t("limits.owner")}
						<select name="owner" required>
							${OWNERS.map((value) => html`<option value=${value}>${value}</option>`)}
						</select>
					</label>
					<div class="form-actions" row>
						<button type="submit" data-action="save">${group ? t("limits.save") : t("limits.add")}</button>
						<button type="button" data-variant="quiet" data-action="cancel"
							@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
					</div>
				</form>
			</details>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-group-form": CcLimitGroupForm;
	}
}
