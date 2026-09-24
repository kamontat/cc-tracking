import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	formatAmount,
	formatAmountInput,
	parseAmount,
} from "#lib/domain/money";
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

			/*
			 * Scoped to the add form on purpose. The edit form wraps the whole table so that the
			 * fields in a row belong to a form and Enter saves; laying that one out as a flex
			 * row would make the table a flex item and take its width with it.
			 */
			form[data-form="add"] {
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

			/* A field standing in for a figure is read against the same edge the figure was. */
			td[data-numeric] input {
				text-align: right;
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
	// One key per form. The two are independent -- a refused edit must not blank an error the
	// add form is showing, nor appear in a row the reader was not working in. Each carries the
	// catalog key rather than a resolved sentence, so a language switch while an error is on
	// screen re-renders it in the new language too.
	@state() private addErrorKey: MessageKey | "" = "";
	@state() private editErrorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	/** The name and limit a form holds, or the key naming what is wrong with them. */
	private read(
		nameField: string,
		limitField: string,
	): { name: string; limit: number } | MessageKey {
		const name = this.value(nameField);
		if (!name) return "limits.error.name";
		try {
			return { name, limit: parseAmount(this.value(limitField)) };
		} catch {
			return "limits.error.limit";
		}
	}

	private onAdd(event: Event) {
		event.preventDefault();
		const read = this.read("groupName", "groupLimit");
		if (typeof read === "string") {
			this.addErrorKey = read;
			return;
		}
		this.addErrorKey = "";
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: { id: crypto.randomUUID(), ...read },
			}),
		);
		// Bindings re-evaluate to the same "" they last committed after an add, so Lit's dirty
		// check skips the DOM write and the typed text stays put. A native reset bypasses it,
		// the same trick cc-quick-add uses for its date field.
		this.renderRoot
			.querySelector<HTMLFormElement>('form[data-form="add"]')
			?.reset();
	}

	private onSaveEdit(event: Event) {
		event.preventDefault();
		const id = this.editingId;
		if (!id) return;
		const read = this.read("editName", "editLimit");
		if (typeof read === "string") {
			this.editErrorKey = read;
			return;
		}
		this.editErrorKey = "";
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", { detail: { id, ...read } }),
		);
		this.editingId = null;
	}

	private stopEditing() {
		this.editingId = null;
		this.editErrorKey = "";
	}

	override render() {
		return html`
			<h2>${t("limits.title")}</h2>
			<p><small>${t("limits.explain")}</small></p>
			<form data-form="add" @submit=${this.onAdd}>
				${this.addErrorKey ? html`<p role="alert">${t(this.addErrorKey)}</p>` : nothing}
				<label>${t("limits.name")} <input name="groupName"
					placeholder=${t("limits.namePlaceholder")} required /></label>
				<label>${t("limits.limit")} <input name="groupLimit" inputmode="decimal"
					placeholder=${t("limits.limitPlaceholder")} required /></label>
				<div class="actions" row>
					<button type="submit">${t("limits.add")}</button>
				</div>
			</form>
			${this.groups.length === 0 ? html`<p>${t("limits.empty")}</p>` : this.table()}
		`;
	}

	private table() {
		return html`
			<form data-form="edit" @submit=${this.onSaveEdit}>
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
					${this.groups.map((group) =>
						group.id === this.editingId ? this.editRow(group) : this.row(group),
					)}
				</tbody>
			</table>
			</form>
		`;
	}

	/** The numbers a row shows either way. Editing changes how a group reads, not what it owes. */
	private figures(group: LimitGroup) {
		const used = this.usage[group.id] ?? 0;
		return {
			used,
			available: group.limit - used,
			count: this.counts[group.id] ?? 0,
		};
	}

	private row(group: LimitGroup) {
		const { used, available, count } = this.figures(group);
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
						<button type="button" data-variant="quiet" data-action="edit" data-id=${group.id}
							@click=${() => {
								this.editingId = group.id;
								this.editErrorKey = "";
							}}>${t("common.edit")}</button>
						${
							count === 0
								? html`<button type="button" data-variant="danger" data-action="remove" data-id=${group.id}
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
	}

	/**
	 * The same row with its two editable cells turned into fields, so a group is corrected
	 * where it is read rather than in a form somewhere above a table it no longer points at.
	 * The fields carry their own labels: the column headings name them on a wide screen, but
	 * below 640px the table has stacked and the headings are gone.
	 */
	private editRow(group: LimitGroup) {
		const { used, available, count } = this.figures(group);
		return html`
			<tr data-editing>
				<td data-label=${t("limits.column.name")}>
					<input name="editName" aria-label=${t("limits.name")}
						.value=${group.name} placeholder=${t("limits.namePlaceholder")} required />
				</td>
				<td data-label=${t("limits.column.limit")} data-numeric>
					<input name="editLimit" inputmode="decimal" aria-label=${t("limits.limit")}
						.value=${formatAmountInput(group.limit)}
						placeholder=${t("limits.limitPlaceholder")} required />
				</td>
				<td data-label=${t("limits.column.cards")} data-numeric>${count}</td>
				<td data-label=${t("limits.column.used")} data-numeric>${formatAmount(used)}</td>
				<td data-label=${t("limits.column.available")} data-numeric
					data-state=${available < 0 ? "over" : "within"}>${formatAmount(available)}</td>
				<td>
					<div class="actions" row>
						<button type="submit" data-action="save">${t("limits.save")}</button>
						<button type="button" data-variant="quiet" data-action="cancel"
							@click=${() => this.stopEditing()}>${t("common.cancel")}</button>
					</div>
				</td>
			</tr>
			${
				this.editErrorKey
					? html`<tr data-editing-error><td colspan="6"><p role="alert">${t(this.editErrorKey)}</p></td></tr>`
					: nothing
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-limit-groups": CcLimitGroups;
	}
}
