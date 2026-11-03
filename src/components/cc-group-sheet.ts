import "#components/cc-error-banner";
import "#components/cc-modal";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	GROUP_COLORS,
	type GroupColor,
	pickColor,
	toGroupColor,
} from "#lib/domain/group-color";
import { amountOf, formatAmountInput } from "#lib/domain/money";
import { OWNERS, type Owner, ownerOf } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, groupInk } from "#styles/shared";

/**
 * A limit group in a sheet over Cards: name, limit and account holder (a segmented control),
 * then *Save*. An existing group no card uses also has *Delete group*, which swaps in place for
 * *Delete NAME?* with *Delete* and *Keep* (UI-09); focus follows the swap. Emits `save-group`
 * with the group, `delete-group` with `{ group }`, and `close`. `error` says why a save failed;
 * what was typed stays.
 */
@customElement("cc-group-sheet")
export class CcGroupSheet extends LitElement {
	static override styles = [
		base,
		controls,
		groupInk,
		css`
			:host {
				display: contents;
			}

			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			fieldset {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				min-inline-size: 0;
				padding: 0;
				margin: 0;
				border: 0;
			}

			legend {
				padding: 0;
				margin-bottom: var(--cc-space-1);
			}

			.seg {
				display: grid;
				grid-auto-columns: minmax(0, 1fr);
				grid-auto-flow: column;
				gap: var(--cc-space-1);
				padding: var(--cc-space-1);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			.seg button {
				color: var(--cc-text);
				background: transparent;
				border-color: transparent;
			}

			.seg button[aria-pressed="true"] {
				font-weight: 650;
				color: var(--cc-success);
				background: var(--cc-surface);
				border-color: var(--cc-border);
			}

			.swatches {
				display: flex;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
				align-items: center;
			}

			.swatches button[data-color] {
				inline-size: calc(2 * var(--cc-space-4));
				block-size: calc(2 * var(--cc-space-4));
				padding: 0;
				background: var(--g-bg);
				border: var(--cc-space-1) solid transparent;
				border-radius: 50%;
			}

			.swatches button[data-color][aria-pressed="true"] {
				border-color: var(--g-fg);
			}

			input {
				min-inline-size: 0;
				padding: var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			button[type="submit"] {
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
				border-radius: var(--cc-radius-sm);
			}

			.danger {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
			}

			.ask {
				flex: 1 1 auto;
				font-weight: 600;
			}
		`,
	];

	/** The group to edit; null for a new one. */
	@property({ attribute: false }) group: LimitGroup | null = null;
	/** A card uses the group, so it cannot be deleted. */
	@property({ type: Boolean }) inUse = false;
	/** Every stored group; the sheet leaves its own out when judging which colours are free. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** The draw behind a random colour; tests inject it. */
	@property({ attribute: false }) random: () => number = Math.random;
	/** Why the last save or delete failed; typing is kept. */
	@property() error = "";
	/** A save is under way: the button waits and the sheet holds open. */
	@property({ type: Boolean }) busy = false;

	@state() private name = "";
	@state() private limit = "";
	@state() private owner: Owner | null = null;
	@state() private color: GroupColor = GROUP_COLORS[0];
	@state() private asking = false;
	// The catalog key, so a language switch re-renders the message in place.
	@state() private errorKey: MessageKey | "" = "";
	/** The id the fields were last filled from (`null` for a new group); unset before the first fill. */
	private filledFor: string | null | undefined = undefined;
	/** The button to focus once the delete swap has rendered. */
	private refocus: string | null = null;

	constructor() {
		super();
		new LocaleController(this);
	}

	/**
	 * Fills the fields from the group only when the sheet turns to another group (by id), so a
	 * page that hands back a fresh copy of the same group -- a reload after a failed save --
	 * keeps what was typed (UI-11).
	 */
	protected override willUpdate(changed: PropertyValues<this>) {
		if (!changed.has("group")) return;
		const group = this.group;
		const id = group?.id ?? null;
		if (id === this.filledFor) return;
		this.filledFor = id;
		this.name = group?.name ?? "";
		this.limit = group ? formatAmountInput(group.limit) : "";
		this.owner = group ? ownerOf(group) : null;
		this.color = toGroupColor(group?.color) ?? this.freeColor();
		this.asking = false;
		this.errorKey = "";
	}

	/** A random colour none of the other groups wear. */
	private freeColor(): GroupColor {
		const id = this.group?.id;
		return pickColor(
			this.groups.filter((g) => g.id !== id),
			this.random,
		);
	}

	protected override updated() {
		const want = this.refocus;
		if (!want) return;
		this.refocus = null;
		this.renderRoot
			.querySelector<HTMLElement>(`[data-action="${want}"]`)
			?.focus();
	}

	private swap(asking: boolean, focus: string) {
		this.refocus = focus;
		this.asking = asking;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		if (this.busy) return;
		const name = this.name.trim();
		if (!name) {
			this.errorKey = "limits.error.name";
			return;
		}
		const limit = amountOf(this.limit.trim());
		if (limit === null || limit <= 0) {
			this.errorKey = "limits.error.limit";
			return;
		}
		if (!this.owner) {
			this.errorKey = "limits.error.owner";
			return;
		}
		this.errorKey = "";
		this.dispatchEvent(
			new CustomEvent<LimitGroup>("save-group", {
				detail: {
					id: this.group?.id ?? crypto.randomUUID(),
					name,
					limit,
					owner: this.owner,
					color: this.color,
				},
			}),
		);
	}

	private deleteRow(group: LimitGroup) {
		if (!this.asking)
			return html`<div class="danger">
				<button type="button" data-variant="danger" data-action="delete-group"
					?disabled=${this.busy}
					@click=${() => this.swap(true, "confirm-delete")}>${t("cards.group.delete")}</button>
			</div>`;
		return html`<div class="danger">
			<span class="ask">${t("cards.group.deleteAsk", { name: group.name })}</span>
			<button type="button" data-variant="danger" data-action="confirm-delete"
				?disabled=${this.busy}
				@click=${() => {
					// The question stays until the write lands: a failed delete still shows it.
					this.dispatchEvent(
						new CustomEvent("delete-group", { detail: { group } }),
					);
				}}>${t("common.delete")}</button>
			<button type="button" data-variant="quiet" data-action="keep"
				@click=${() => this.swap(false, "delete-group")}>${t("cards.group.keep")}</button>
		</div>`;
	}

	override render() {
		const group = this.group;
		return html`<cc-modal sheet .held=${this.busy}
			heading=${group ? t("limits.edit", { name: group.name }) : t("limits.add")}
			@close=${(event: Event) => {
				event.stopPropagation();
				this.dispatchEvent(new CustomEvent("close"));
			}}>
			<cc-error-banner .message=${this.error} no-retry></cc-error-banner>
			<form @submit=${this.onSubmit} novalidate>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
				<label>${t("limits.name")}
					<input name="name" .value=${this.name} autocomplete="off"
						placeholder=${t("limits.namePlaceholder")}
						@input=${(e: Event) => {
							this.name = (e.target as HTMLInputElement).value;
						}} /></label>
				<label>${t("limits.limit")}
					<input name="limit" inputmode="decimal" .value=${this.limit}
						placeholder=${t("limits.limitPlaceholder")}
						@input=${(e: Event) => {
							this.limit = (e.target as HTMLInputElement).value;
						}} /></label>
				<fieldset>
					<legend>${t("limits.owner")}</legend>
					<div class="seg">${OWNERS.map(
						(owner) => html`<button type="button" data-owner=${owner}
							aria-pressed=${this.owner === owner ? "true" : "false"}
							@click=${() => {
								this.owner = owner;
							}}>${owner}</button>`,
					)}</div>
				</fieldset>
				<fieldset>
					<legend>${t("limits.color")}</legend>
					<div class="swatches">
						${GROUP_COLORS.map(
							(
								color,
							) => html`<button type="button" data-color=${color} data-g=${color}
								aria-label=${t(`color.${color}`)}
								aria-pressed=${this.color === color ? "true" : "false"}
								@click=${() => {
									this.color = color;
								}}></button>`,
						)}
						<button type="button" data-variant="quiet" data-action="random-color"
							@click=${() => {
								this.color = this.freeColor();
							}}>${t("limits.color.random")}</button>
					</div>
				</fieldset>
				<button type="submit" ?disabled=${this.busy}>${
					group ? t("limits.save") : t("limits.add")
				}</button>
				${group && !this.inUse ? this.deleteRow(group) : nothing}
			</form>
		</cc-modal>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-group-sheet": CcGroupSheet;
	}
}
