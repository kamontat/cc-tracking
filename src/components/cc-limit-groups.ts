import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatAmount, parseAmount } from "#lib/domain/money";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-limit-groups")
export class CcLimitGroups extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			form {
				display: flex;
				flex-wrap: wrap;
				align-items: flex-end;
				gap: var(--cc-space-3);
				margin-block-end: var(--cc-space-4);
			}

			.actions {
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			td[data-state="over"] {
				font-weight: 600;
				color: var(--cc-danger);
			}
		`,
	];

	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Satang already spent against each group id, from `groupUsage`. */
	@property({ attribute: false }) usage: Record<string, number> = {};
	/** How many cards point at each group id. */
	@property({ attribute: false }) counts: Record<string, number> = {};

	@state() private editingId: string | null = null;
	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private get editing(): LimitGroup | null {
		return this.groups.find(({ id }) => id === this.editingId) ?? null;
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
		const name = this.value("groupName");
		if (!name) {
			this.errorKey = "limits.error.name";
			return;
		}
		let limit: number;
		try {
			limit = parseAmount(this.value("groupLimit"));
		} catch {
			this.errorKey = "limits.error.limit";
			return;
		}
		this.errorKey = "";
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: { id: this.editingId ?? crypto.randomUUID(), name, limit },
			}),
		);
		this.editingId = null;
		// Bindings re-evaluate to the same "" they last committed after an add, so Lit's dirty
		// check skips the DOM write and the typed text stays put. A native reset bypasses it,
		// the same trick cc-quick-add uses for its date field.
		this.renderRoot.querySelector("form")?.reset();
	}

	override render() {
		const editing = this.editing;
		return html`
			<h2>${t("limits.title")}</h2>
			<p><small>${t("limits.explain")}</small></p>
			<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				${editing ? html`<p>${t("limits.editing", { name: editing.name })}</p>` : nothing}
				<label>${t("limits.name")} <input name="groupName" .value=${editing?.name ?? ""}
					placeholder=${t("limits.namePlaceholder")} required /></label>
				<label>${t("limits.limit")} <input name="groupLimit" inputmode="decimal"
					.value=${editing ? String(editing.limit / 100) : ""}
					placeholder=${t("limits.limitPlaceholder")} required /></label>
				<div class="actions" row>
					<button type="submit">${editing ? t("limits.save") : t("limits.add")}</button>
					${
						editing
							? html`<button type="button" data-variant="quiet" @click=${() => {
									this.editingId = null;
									this.errorKey = "";
								}}>${t("common.cancel")}</button>`
							: nothing
					}
				</div>
			</form>
			${this.groups.length === 0 ? html`<p>${t("limits.empty")}</p>` : this.table()}
		`;
	}

	private table() {
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("limits.column.name")}</th>
						<th data-numeric>${t("limits.column.limit")}</th>
						<th data-numeric>${t("limits.column.cards")}</th>
						<th data-numeric>${t("limits.column.used")}</th>
						<th data-numeric>${t("limits.column.available")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.groups.map((group) => {
						const used = this.usage[group.id] ?? 0;
						const available = group.limit - used;
						const count = this.counts[group.id] ?? 0;
						return html`
							<tr>
								<td data-label=${t("limits.column.name")}>${group.name}</td>
								<td data-label=${t("limits.column.limit")} data-numeric>${formatAmount(group.limit)}</td>
								<td data-label=${t("limits.column.cards")} data-numeric>${count}</td>
								<td data-label=${t("limits.column.used")} data-numeric>${formatAmount(used)}</td>
								<td data-label=${t("limits.column.available")} data-numeric
									data-state=${available < 0 ? "over" : "within"}>${formatAmount(available)}</td>
								<td>
									<div class="actions" row>
										<button data-variant="quiet" data-action="edit" data-id=${group.id}
											@click=${() => {
												this.editingId = group.id;
												this.errorKey = "";
											}}>${t("common.edit")}</button>
										${
											count === 0
												? html`<button data-variant="danger" data-action="remove" data-id=${group.id}
													@click=${() =>
														this.dispatchEvent(
															new CustomEvent<string>("remove-group", {
																detail: group.id,
															}),
														)}>${t("common.delete")}</button>`
												: html`<small>${t("limits.inUse", { count })}</small>`
										}
									</div>
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-groups": CcLimitGroups;
	}
}
