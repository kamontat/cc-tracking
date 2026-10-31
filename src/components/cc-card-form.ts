import "#components/cc-error-banner";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { byOwnerThenName } from "#lib/domain/list-view";
import {
	DEFAULT_LOCATION,
	LOCATIONS,
	type Location,
} from "#lib/domain/location";
import { formatAmount } from "#lib/domain/money";
import {
	DEFAULT_OWNER,
	groupLabel,
	OWNERS,
	type Owner,
	ownerOf,
	toOwner,
} from "#lib/domain/owner";
import type { Card, CycleRule, LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

type Kind = CycleRule["kind"];

const TEXT_FIELDS = [
	"id",
	"name",
	"last4",
	"closeDay",
	"dueOffsetDays",
	"dueDay",
	"comment",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const blank = (): Record<TextField, string> =>
	Object.fromEntries(TEXT_FIELDS.map((field) => [field, ""])) as Record<
		TextField,
		string
	>;

const numberOf = (text: string): number => {
	const trimmed = text.trim();
	return trimmed === "" ? Number.NaN : Number(trimmed);
};

/**
 * The card form, the whole of `/card/new` and `/card/edit` under their back header: name; card
 * id (disabled when editing, *Card id can't change*) beside last 4; *Kept in* as a segmented
 * control of the locations; the limit group (`name (holder) · limit`); the billing cycle (the
 * close day, then *due days after close* or *due on day*); the cardholder (the group's account
 * holder, or a supplementary card with its own holder); the comment; then the submit. Editing
 * adds *Archive card* / *Unarchive card* (quiet) and, when `deletable`, *Delete card* (danger),
 * which swaps in place for *Delete NAME?* with *Delete* and *Keep* (UI-09), focus following.
 *
 * Emits `save` with the card, `archive` and `delete-card` with `{ card }` (the stored card, not
 * what is typed). `error` is the page's reason a write failed; what was typed stays, since the
 * fields fill from `card` only when it turns to another card (UI-11).
 */
@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			.pair {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: var(--cc-space-3);
				align-items: start;
			}

			/* The cardholder, with a supplementary card's own holder under it. */
			.field {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			fieldset {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
				padding: 0;
				margin: 0;
				border: 0;
			}

			legend {
				padding: 0;
				margin-bottom: var(--cc-space-1);
				font-size: var(--cc-text-sm);
				font-weight: inherit;
				color: var(--cc-text-muted);
				text-transform: none;
				letter-spacing: normal;
			}

			small {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			input,
			select {
				min-inline-size: 0;
				padding: var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			select {
				padding-right: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
			}

			input:disabled {
				color: var(--cc-text-muted);
				background: var(--cc-surface-sunken);
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
				align-self: stretch;
				white-space: normal;
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

			.actions {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			.actions > button {
				align-self: stretch;
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
			}

			.danger {
				display: flex;
				flex-direction: row;
				align-self: stretch;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
			}

			.danger > button[data-action="delete-card"] {
				flex: 1 1 auto;
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
			}

			.ask {
				flex: 1 1 auto;
				font-weight: 600;
			}
		`,
	];

	/** The card to edit; null for a new one. */
	@property({ attribute: false }) card: Card | null = null;
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** The card may go: no purchases, on no draft and no list waiting for the spender. */
	@property({ type: Boolean }) deletable = false;
	/** Why the page's last write failed; typing is kept. */
	@property() error = "";
	/** A write is under way: the buttons wait. */
	@property({ type: Boolean }) busy = false;

	// The typed text fields, by input name.
	@state() private text: Record<TextField, string> = blank();
	@state() private location: Location = DEFAULT_LOCATION;
	@state() private groupId = "";
	@state() private kind: Kind = "offset";
	@state() private supplementary = false;
	// Kept while the card is set back to the account holder, so switching straight back does not
	// lose the choice; written into the saved card only for a supplementary one.
	@state() private owner: Owner | "" = "";
	@state() private asking = false;
	// The catalog key, so a language switch re-renders the message in place.
	@state() private errorKey: MessageKey | "" = "";
	/** The id the fields were last filled from (`null` for a new card); unset before the first fill. */
	private filledFor: string | null | undefined = undefined;
	/** The button to focus once the delete swap has rendered. */
	private refocus: string | null = null;

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("card")) this.fill();
		// A group deleted elsewhere while the form is open falls back to the placeholder rather
		// than silently landing on whichever group now sits in its old place.
		if (
			changed.has("groups") &&
			this.groupId &&
			!this.groups.some((group) => group.id === this.groupId)
		) {
			this.groupId = "";
		}
	}

	/** Fills the fields from `card` only when it turns to another card (by id). */
	private fill() {
		const card = this.card;
		const id = card?.id ?? null;
		if (id === this.filledFor) return;
		this.filledFor = id;
		const rule = card?.cycle;
		this.text = {
			id: card?.id ?? "",
			name: card?.name ?? "",
			last4: card?.last4 ?? "",
			closeDay: rule ? String(rule.closeDay) : "",
			dueOffsetDays: rule?.kind === "offset" ? String(rule.dueOffsetDays) : "",
			dueDay: rule?.kind === "fixed" ? String(rule.dueDay) : "",
			comment: card?.comment ?? "",
		};
		this.location = card?.location ?? DEFAULT_LOCATION;
		this.groupId = card?.limitGroupId ?? "";
		this.kind = rule?.kind ?? "offset";
		this.supplementary = card?.supplementary ?? false;
		this.owner = toOwner(card?.owner) ?? "";
		this.asking = false;
		this.errorKey = "";
	}

	protected override updated() {
		// The selects are written from tracked state after every render: their options come
		// from unkeyed maps, so the browser's own selection can drift when the list reshapes.
		const select = (name: string, value: string) => {
			const el = this.renderRoot.querySelector<HTMLSelectElement>(
				`select[name="${name}"]`,
			);
			if (el && el.value !== value) el.value = value;
		};
		select("limitGroupId", this.groupId);
		select("holder", this.supplementary ? "supplementary" : "account");
		select("owner", this.owner);

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

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		if (this.busy) return;
		const text = this.text;
		const id = this.card ? this.card.id : text.id.trim();
		const name = text.name.trim();
		const last4 = text.last4.trim();
		const closeDay = numberOf(text.closeDay);

		if (!id) return this.fail("form.error.id");
		if (!name) return this.fail("form.error.name");
		if (!/^\d{4}$/.test(last4)) return this.fail("form.error.last4");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("form.error.closeDay");
		}

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = numberOf(text.dueOffsetDays);
			if (
				!Number.isInteger(dueOffsetDays) ||
				dueOffsetDays < 1 ||
				dueOffsetDays > 60
			) {
				return this.fail("form.error.dueOffsetDays");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = numberOf(text.dueDay);
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("form.error.dueDay");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		if (!this.groups.some((group) => group.id === this.groupId)) {
			return this.fail("form.error.limitGroup");
		}
		const owner = this.supplementary ? toOwner(this.owner) : null;
		if (this.supplementary && !owner) return this.fail("form.error.owner");

		this.errorKey = "";
		const card: Card = {
			id,
			name,
			last4,
			location: this.location,
			supplementary: this.supplementary,
			// Left off for a primary card: whoever holds its group holds it.
			...(owner ? { owner } : {}),
			cycle,
			comment: text.comment.trim(),
			archived: this.card?.archived ?? false,
			limitGroupId: this.groupId,
		};
		this.dispatchEvent(new CustomEvent<Card>("save", { detail: card }));
	}

	/** An input bound to one of the tracked fields. */
	private input(
		name: TextField,
		extra: {
			numeric?: boolean;
			min?: number;
			max?: number;
			placeholder?: string;
		} = {},
	) {
		const ranged = extra.min !== undefined;
		return html`<input name=${name} .value=${this.text[name]}
			inputmode=${extra.numeric ? "numeric" : nothing}
			type=${ranged ? "number" : "text"}
			min=${extra.min ?? nothing} max=${extra.max ?? nothing}
			placeholder=${extra.placeholder ?? nothing}
			autocomplete="off"
			@input=${(event: Event) => {
				this.text = {
					...this.text,
					[name]: (event.target as HTMLInputElement).value,
				};
			}} />`;
	}

	/** A segmented control: one `aria-pressed` button per value. */
	private seg<T extends string>(
		values: readonly T[],
		current: T,
		button: (value: T, pressed: string) => unknown,
	) {
		return html`<div class="seg">${values.map((value) =>
			button(value, current === value ? "true" : "false"),
		)}</div>`;
	}

	private holderOf(): Owner {
		const group = this.groups.find(({ id }) => id === this.groupId);
		return group ? ownerOf(group) : DEFAULT_OWNER;
	}

	private deleteRow(card: Card) {
		if (!this.asking)
			return html`<div class="danger">
				<button type="button" data-variant="danger" data-action="delete-card"
					?disabled=${this.busy}
					@click=${() => this.swap(true, "confirm-delete")}>${t("form.delete")}</button>
			</div>`;
		return html`<div class="danger">
			<span class="ask">${t("form.deleteAsk", { name: card.name })}</span>
			<button type="button" data-variant="danger" data-action="confirm-delete"
				?disabled=${this.busy}
				@click=${() => {
					this.asking = false;
					this.dispatchEvent(
						new CustomEvent("delete-card", { detail: { card } }),
					);
				}}>${t("common.delete")}</button>
			<button type="button" data-variant="quiet" data-action="keep"
				@click=${() => this.swap(false, "delete-card")}>${t("form.keep")}</button>
		</div>`;
	}

	override render() {
		const card = this.card;
		const groups = [...this.groups].sort(byOwnerThenName);
		const select = (setter: (value: string) => void) => (event: Event) =>
			setter((event.target as HTMLSelectElement).value);
		return html`<form @submit=${this.onSubmit} novalidate>
			<cc-error-banner .message=${this.error} no-retry></cc-error-banner>
			${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}

			<label>${t("form.name")} ${this.input("name")}</label>

			<div class="pair">
				<label>${t("form.id")}
					${
						card
							? html`<input name="id" .value=${card.id} disabled />
								<small>${t("form.idImmutable")}</small>`
							: this.input("id", { placeholder: t("form.idPlaceholder") })
					}
				</label>
				<label>${t("form.last4")} ${this.input("last4", { numeric: true })}</label>
			</div>

			<fieldset>
				<legend>${t("form.location")}</legend>
				${this.seg(
					LOCATIONS,
					this.location,
					(value, pressed) => html`<button type="button" data-location=${value}
						aria-pressed=${pressed} @click=${() => {
							this.location = value;
						}}>${locationText(value)}</button>`,
				)}
			</fieldset>

			<label>${t("form.limitGroup")}
				<select name="limitGroupId" ?disabled=${groups.length === 0}
					@input=${select((value) => {
						this.groupId = value;
					})}
					@change=${select((value) => {
						this.groupId = value;
					})}>
					<option value="">${t("form.limitGroupNone")}</option>
					${groups.map(
						(group) =>
							html`<option value=${group.id}>${groupLabel(group)} · ${formatAmount(group.limit)}</option>`,
					)}
				</select>
			</label>

			<fieldset>
				<legend>${t("form.cycle")}</legend>
				${this.seg(
					["offset", "fixed"] as const,
					this.kind,
					(kind, pressed) => html`<button type="button" data-kind=${kind}
						aria-pressed=${pressed} @click=${() => {
							this.kind = kind;
						}}>${t(kind === "offset" ? "form.cycleOffset" : "form.cycleFixed")}</button>`,
				)}
				<div class="pair">
					<label>${t("form.closeDay")} ${this.input("closeDay", { numeric: true, min: 1, max: 31 })}</label>
					${
						this.kind === "offset"
							? html`<label>${t("form.dueOffsetDays")} ${this.input("dueOffsetDays", { numeric: true, min: 1, max: 60 })}</label>`
							: html`<label>${t("form.dueDay")} ${this.input("dueDay", { numeric: true, min: 1, max: 31 })}</label>`
					}
				</div>
			</fieldset>

			<div class="field">
				<label>${t("form.holder")}
					<select name="holder"
						@input=${select((value) => {
							this.supplementary = value === "supplementary";
						})}
						@change=${select((value) => {
							this.supplementary = value === "supplementary";
						})}>
						<option value="account">${t("form.holderAccount", { owner: this.holderOf() })}</option>
						<option value="supplementary">${t("form.supplementary")}</option>
					</select>
				</label>
				${
					this.supplementary
						? html`<label>${t("form.owner")}
							<select name="owner"
								@input=${select((value) => {
									this.owner = toOwner(value) ?? "";
								})}
								@change=${select((value) => {
									this.owner = toOwner(value) ?? "";
								})}>
								<option value="">${t("form.ownerNone")}</option>
								${OWNERS.map((value) => html`<option value=${value}>${value}</option>`)}
							</select>
						</label>`
						: nothing
				}
			</div>

			<label>${t("form.comment")} ${this.input("comment")}</label>

			<div class="actions">
				<button type="submit" ?disabled=${this.busy}>${card ? t("form.save") : t("form.add")}</button>
				${
					card
						? html`<button type="button" data-variant="quiet" data-action="archive"
								?disabled=${this.busy}
								@click=${() =>
									this.dispatchEvent(
										new CustomEvent("archive", { detail: { card } }),
									)}>${card.archived ? t("form.unarchive") : t("form.archive")}</button>`
						: nothing
				}
				${card && this.deletable ? this.deleteRow(card) : nothing}
			</div>
		</form>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
